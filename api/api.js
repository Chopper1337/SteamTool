const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ quiet: true });

const app = express();
const PORT = process.env.PORT;
const HOST = process.env.HOST;

// Number of reverse proxies in front of us. Without this, req.ip is the
// proxy's address for every visitor, so any future rate limiting would treat
// the whole internet as one client. Never set this to `true`, and never above
// the real hop count: either lets a caller forge X-Forwarded-For.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 0));

// Mutable state lives here. Defaults to the app directory so a plain
// `node api.js` keeps working; the systemd unit points it elsewhere.
const STATE_DIR = process.env.STEAMTOOL_STATE || __dirname;

const visitorCountPath = path.join(STATE_DIR, "visitor_count.txt");
const logPath = path.join(STATE_DIR, "api.log");

// Read-only data, always alongside the code so a `git pull` updates it.
const resolversPath = path.join(__dirname, "resolvers.json");
const knownPath = path.join(__dirname, "known.json");

const MAX_LOG_LINES = Number(process.env.MAX_LOG_LINES || 5000);

// Per-resolver slice, and an overall ceiling for one lookup. The slice is what
// stops a single slow resolver from consuming the whole budget and starving
// the ones behind it; the ceiling is what stops a lookup hanging the browser.
const RESOLVER_TIMEOUT_MS = Number(process.env.RESOLVER_TIMEOUT_MS || 4000);
const RESOLVE_BUDGET_MS = Number(process.env.RESOLVE_BUDGET_MS || 15000);
const USER_AGENT = process.env.USER_AGENT ||
  "SteamTool/1.0 (+https://github.com/Chopper1337/SteamTool)";

// If a resolver has not answered within this, start the next one alongside it
// instead of waiting out its slice. Set high enough that a healthy tier-1
// resolver (~370ms measured) never triggers it, so the common case sends
// exactly one request. Set to 0 to disable hedging entirely.
const HEDGE_AFTER_MS = Number(process.env.HEDGE_AFTER_MS ?? 1000);
// Ceiling on concurrent outbound requests for a single lookup.
const MAX_INFLIGHT = Math.max(1, Number(process.env.MAX_INFLIGHT || 2));
const HEDGE = Symbol("hedge");
const TRIM_EVERY = 500;
const STATS_TOKEN = process.env.STATS_TOKEN || "";

// CORS. The frontend is same-origin through the proxy, so this only needs to cover
// anything you deliberately call from elsewhere. Set STEAMTOOL_ORIGIN to lock
// it down; the wildcard remains the default only for backwards compatibility.
const ALLOWED_ORIGIN = process.env.STEAMTOOL_ORIGIN || "*";

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Stats-Token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---------------------------------------------------------------- utilities

function writeFileAtomic(file, contents) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, contents, "utf8");
  fs.renameSync(tmp, file);
}

// A hand-edited data file must never be able to take the API down. Log the
// problem and carry on with whatever we can still serve.
function readJSONSafe(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (err) {
    console.error(`Failed to load ${path.basename(file)}: ${err.message}`);
    return fallback;
  }
}

function stamp() {
  return new Date().toISOString().replace("T", " ");
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------- state dir

function ensureState() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // One-time migration for installs that kept state next to the code.
  // Copies rather than moves, so the original stays as a backup.
  for (const name of ["visitor_count.txt", "api.log"]) {
    const dest = path.join(STATE_DIR, name);
    const legacy = path.join(__dirname, name);
    if (legacy === dest || fs.existsSync(dest) || !fs.existsSync(legacy)) continue;
    fs.copyFileSync(legacy, dest);
    console.log(`${stamp()} Migrated ${name} to ${STATE_DIR}`);
  }

  if (!fs.existsSync(visitorCountPath)) fs.writeFileSync(visitorCountPath, "", "utf-8");
}

// -------------------------------------------------------------------- logs

// Served from memory; the file is for durability across restarts.
let logRing = [];
let appendsSinceTrim = 0;

function loadLogRing() {
  try {
    if (!fs.existsSync(logPath)) return [];
    const raw = fs.readFileSync(logPath, "utf8").trim();
    if (!raw) return [];
    const lines = raw.split("\n");
    return lines.slice(-MAX_LOG_LINES);
  } catch (err) {
    console.error(`Failed to read api.log: ${err.message}`);
    return [];
  }
}

function appendLog(line) {
  logRing.push(line);
  if (logRing.length > MAX_LOG_LINES) {
    logRing.splice(0, logRing.length - MAX_LOG_LINES);
  }

  try {
    fs.appendFileSync(logPath, line + "\n", "utf8");
    appendsSinceTrim += 1;
    if (appendsSinceTrim >= TRIM_EVERY) {
      writeFileAtomic(logPath, logRing.join("\n") + "\n");
      appendsSinceTrim = 0;
    }
  } catch (err) {
    console.error(`log append failed: ${err.message}`);
  }
}

// Format:
//   2026-08-27 20:35:20.323Z Resolve vanity request for Mariktatarik to 76561199020280862
function logSteamTool(purpose, info, result) {
  const line = `${stamp()} ${purpose} request for ${info}${result}`;
  console.log(line);
  appendLog(line);
}

function logEvent(text) {
  const line = `${stamp()} ${text}`;
  console.log(line);
  appendLog(line);
}

// -------------------------------------------------------------------- data

let RESOLVERS = [];
let KNOWN_INDEX = new Map();

function loadData() {
  RESOLVERS = readJSONSafe(resolversPath, []);

  const known = readJSONSafe(knownPath, []);
  const index = new Map();
  for (const entry of known) {
    if (!entry || !Array.isArray(entry.ids)) continue;
    for (const id of entry.ids) index.set(String(id), entry);
  }
  KNOWN_INDEX = index;

  return { resolvers: RESOLVERS.length, known: KNOWN_INDEX.size };
}

// Order resolvers by tier (fastest, most general first), shuffling within each
// tier so load still spreads instead of always hitting the same one first.
// Untiered entries sort last.
function orderResolvers(list) {
  const byTier = new Map();
  for (const r of list) {
    const tier = Number.isFinite(r.tier) ? r.tier : 99;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(r);
  }

  const ordered = [];
  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const group = byTier.get(tier);
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    ordered.push(...group);
  }
  return ordered;
}

// ---------------------------------------------------------------- visitors

function readAllCounts() {
  if (!fs.existsSync(visitorCountPath)) return [];
  const raw = fs.readFileSync(visitorCountPath, "utf8");
  if (!raw.trim()) return [];
  return raw
    .trim()
    .split("\n")
    .map(line => {
      const [date, cnt] = line.split(",").map(s => (s || "").trim());
      return [date, Number.isNaN(Number(cnt)) ? 0 : Number(cnt)];
    })
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row[0]));
}

function writeAllCounts(rows) {
  writeFileAtomic(visitorCountPath, rows.map(r => `${r[0]},${r[1]}`).join("\n") + "\n");
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function logVisitor() {
  const today = todayKey();
  const rows = readAllCounts();

  const existing = rows.find(r => r[0] === today);
  if (existing) {
    existing[1] += 1;
  } else {
    rows.push([today, 1]);
  }

  writeAllCounts(rows);
  return existing ? existing[1] : 1;
}

// ------------------------------------------------------------------ routes

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    resolvers: RESOLVERS.length,
    known: KNOWN_INDEX.size,
    logLines: logRing.length,
  });
});

// GET /api/known -> return information for a known player
app.get("/api/known", (req, res) => {
  const rawId = (req.query.id || "").toString();
  if (!rawId) return res.status(400).json({ error: "missing id query parameter" });

  const normalised = rawId.trim().replace(/^\/+|\/+$/g, "").trim();
  if (!normalised) return res.status(400).json({ error: "invalid id" });

  if (!/^\d{17}$/.test(normalised)) {
    return res.status(400).json({ error: "invalid id: must be 17 digits" });
  }

  const found = KNOWN_INDEX.get(normalised);
  if (!found) return res.status(404).json({ error: "Not found" });

  return res.json(found);
});

// GET /api/visitor-count -> today's count (0 if nobody has visited yet today)
app.get("/api/visitor-count", (req, res) => {
  try {
    const today = todayKey();
    const row = readAllCounts().find(r => r[0] === today);
    return res.json({ date: today, count: row ? row[1] : 0 });
  } catch (err) {
    console.error("visitor count GET error:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// POST /api/visitor-count -> increment today's count and return updated
app.post("/api/visitor-count", (req, res) => {
  try {
    const count = logVisitor();
    return res.json({ date: todayKey(), count });
  } catch (err) {
    console.error("visitor count POST error:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /api/stats/visitors -> the full daily history, for the stats panel
app.get("/api/stats/visitors", (req, res) => {
  try {
    const rows = readAllCounts().sort((a, b) => a[0].localeCompare(b[0]));
    const today = todayKey();
    return res.json({
      days: rows.map(([date, count]) => ({ date, count })),
      total: rows.reduce((sum, r) => sum + r[1], 0),
      today: (rows.find(r => r[0] === today) || [null, 0])[1],
    });
  } catch (err) {
    console.error("visitor stats error:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// The log carries the vanity names and SteamID64s of everyone who has used the
// tool, so it is not public. Set STATS_TOKEN to enable it.
function requireStatsToken(req, res, next) {
  if (!STATS_TOKEN) {
    return res.status(503).json({
      error: "stats_token_not_configured",
      message: "Set STATS_TOKEN in the API environment to enable log access.",
    });
  }

  const supplied = req.get("x-stats-token") || req.query.token || "";
  if (!supplied || !safeEqual(supplied, STATS_TOKEN)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  next();
}

// GET /api/stats/logs?limit=200 -> log tail for the site's Stats panel
app.get("/api/stats/logs", requireStatsToken, (req, res) => {
  const requested = Number(req.query.limit);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LOG_LINES)
    : 200;

  return res.json({
    lines: logRing.slice(-limit),
    total: logRing.length,
    capacity: MAX_LOG_LINES,
  });
});

// GET /api/resolve-vanity?id={vanity}
app.get("/api/resolve-vanity", async (req, res) => {
  const rawId = (req.query.id || "").toString();
  if (!rawId) return res.status(400).json({ error: "missing id query parameter" });

  const normalised = rawId.trim().replace(/^\/+|\/+$/g, "").trim();
  if (!normalised) return res.status(400).json({ error: "invalid id" });

  if (!/^[A-Za-z0-9_-]+$/.test(normalised)) {
    return res.status(400).json({ error: "invalid id: only A-Z, a-z, 0-9, _, - allowed" });
  }

  if (!/^.{3,32}$/.test(normalised)) {
    return res.status(400).json({ error: "invalid id: must be 3 to 32 characters" });
  }

  const id = normalised;

  if (RESOLVERS.length === 0) {
    return res.status(500).json({ error: "no resolvers configured" });
  }

  // Try the fast, general-purpose resolvers first, shuffling within each tier
  // so load still spreads rather than always landing on one of them.
  //
  // A flat random start meant the slowest resolver fronted one lookup in five,
  // which dominated the average for no benefit. Tier order is set from measured
  // medians; see resolvers.json.
  const ordered = orderResolvers(RESOLVERS);

  // Two limits, not one. Each resolver gets its own slice so that a single slow
  // one cannot starve the rest, and an overall budget still bounds how long the
  // browser can be left waiting.
  //
  // A single shared deadline was tried and reverted: one slow resolver consumed
  // the whole budget, so only one or two of the five were ever attempted and
  // lookups failed that would previously have succeeded.
  //
  // Deliberately sequential rather than a Promise.any race: racing would answer
  // marginally faster but would send five outbound requests on every single
  // lookup instead of usually one, which is the amplification that gets our IP
  // banned by the resolvers we depend on.
  const startedAt = Date.now();
  const remainingMs = () => RESOLVE_BUDGET_MS - (Date.now() - startedAt);

  const attempt = async (r, control) => {
    // Never let one resolver run longer than its slice, nor past the budget.
    const slice = Math.min(RESOLVER_TIMEOUT_MS, remainingMs());
    if (slice <= 0) throw new Error("budget exhausted");

    const sliceTimer = setTimeout(() => control.abort(), slice);

    let resp;
    try {
      const url = r.urlTemplate.replace("{id}", encodeURIComponent(id));
      resp = await fetch(url, {
        method: "GET",
        // Identify ourselves honestly. Without a User-Agent some resolvers
        // (pricempire) reject the request outright with a 403.
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: control.signal,
      });
    } finally {
      clearTimeout(sliceTimer);
    }

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const text = await resp.text();

    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      // Some resolvers answer with a bare number rather than JSON.
      if (/^\d+$/.test(text.trim())) return { steamid64: text.trim(), source: r.name };
      throw new Error("invalid-json");
    }

    const found = r.responsePath
      .split(".")
      .reduce((cur, part) => (cur == null ? undefined : cur[part]), body);

    if (typeof found === "string" && /^\d+$/.test(found)) {
      return { steamid64: found, source: r.name };
    }
    if (typeof found === "number" && Number.isInteger(found)) {
      return { steamid64: String(found), source: r.name };
    }

    throw new Error("steamid64-not-found");
  };

  const errors = [];

  // Hedging: if a resolver has not answered within HEDGE_AFTER_MS, start the
  // next one alongside it rather than waiting out its full slice, and take
  // whichever replies first. Capped at MAX_INFLIGHT so this stays a hedge and
  // never becomes a fan-out to every resolver on every lookup.
  //
  // The healthy case is unaffected: a tier-1 resolver answers in ~370ms, well
  // inside the threshold, so no second request is ever sent. This exists for
  // when a resolver goes bad, which is what steamid.co did.
  let next = 0;
  const running = new Set();

  const startNext = () => {
    if (next >= ordered.length || remainingMs() <= 0) return false;
    const r = ordered[next++];
    const control = new AbortController();
    const entry = { r, abort: () => control.abort() };
    entry.promise = attempt(r, control).then(
      (value) => { entry.value = value; return entry; },
      (error) => { entry.error = error; return entry; }
    );
    running.add(entry);
    return true;
  };

  try {
    startNext();

    while (running.size > 0) {
      let hedgeTimer;
      const hedge = new Promise((resolve) => {
        hedgeTimer = setTimeout(() => resolve(HEDGE), Math.max(0, Math.min(HEDGE_AFTER_MS, remainingMs())));
      });

      let settled;
      try {
        settled = await Promise.race([...[...running].map((e) => e.promise), hedge]);
      } finally {
        clearTimeout(hedgeTimer);
      }

      if (settled === HEDGE) {
        // Nothing has answered yet. Add one more, or wait if we are at the cap
        // or out of resolvers (the per-resolver slice still bounds the wait).
        if (running.size < MAX_INFLIGHT) startNext();
        if (remainingMs() <= 0) break;
        continue;
      }

      running.delete(settled);

      if (settled.value) {
        // Abandon anything still in flight; we have an answer.
        for (const e of running) e.abort();
        logSteamTool("Resolve vanity", id, ` to ${settled.value.steamid64}`);
        return res.json(settled.value);
      }

      errors.push(`${settled.r.name}: ${(settled.error && settled.error.message) || String(settled.error)}`);
      startNext();
    }

    if (remainingMs() <= 0) {
      errors.push(`(budget exhausted after ${errors.length}/${ordered.length})`);
    }

    // Detail goes to the log, not to the client - the response used to name
    // every third-party resolver and how it was failing. The tried/total count
    // is what tells you whether the budget is starving resolvers.
    logEvent(
      `Resolve vanity failed for ${id} ` +
      `[tried ${errors.length}/${ordered.length} in ${Date.now() - startedAt}ms] ` +
      `(${errors.join("; ")})`
    );
    return res.status(502).json({ error: "no resolver succeeded" });
  } catch (err) {
    console.error("resolve-vanity error:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// ------------------------------------------------------------------ startup

ensureState();
logRing = loadLogRing();
const loaded = loadData();

const server = app.listen(PORT, HOST, () => {
  logEvent(`API started on http://${HOST}:${PORT} (${loaded.resolvers} resolvers, ${loaded.known} known players)`);
  if (!STATS_TOKEN) {
    console.warn("STATS_TOKEN is not set - /api/stats/logs is disabled.");
  }
});

// systemctl reload -> re-read the hand-edited data files without dropping
// connections. This replaces the accidental hot-reload nodemon was providing.
process.on("SIGHUP", () => {
  const counts = loadData();
  logEvent(`Reloaded data files (${counts.resolvers} resolvers, ${counts.known} known players)`);
});

// systemd sends SIGTERM and waits TimeoutStopSec before SIGKILL. Without this,
// a restart severs in-flight requests, including a resolve mid-fan-out.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logEvent(`Received ${signal}, draining connections`);

  server.close(() => {
    logEvent("Shutdown complete");
    process.exit(0);
  });

  // Don't hang forever on a wedged socket.
  setTimeout(() => process.exit(0), 8000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
