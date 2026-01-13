const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

require('dotenv').config();

const app = express();
const PORT = process.env.PORT;
const HOST = process.env.HOST;

const resolversPath = path.join(__dirname, "resolvers.json");
const RESOLVERS = JSON.parse(fs.readFileSync(resolversPath, "utf-8"));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// CORS headers
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // Allow all origins
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// helper: safe get by path like "response.steamID64" or "response.ids.steam64Id"
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function fetchWithTimeout(url, opts = {}, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
}

function logSteamTool(purpose, info, result) {
  const now = new Date().toISOString().replace("T", " ");
  console.log(`${now} ${purpose} request for ${info}${result}`);
}

// GET /api/leetify?id={steamid64}
app.get("/api/leetify", async (req, res) => {
  try {
    const steamid64 = String(req.query.id ?? "");

    // Digits only
    if (!/^\d+$/.test(steamid64)) {
      return res.status(400).json({ error: "invalid id: must contain only digits" });
    }

    logSteamTool("Leetify", steamid64, "");

    const url = `https://api.leetify.com/api/profile/id/${encodeURIComponent(steamid64)}`;
    const headers = { Accept: "application/json" };
    // If Leetify needs an API key:
    // headers["Authorization"] = `Bearer ${process.env.LEETIFY_API_KEY}`;

    //const response = await fetch(url, { headers });
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: "remote_error", details: text });
    }

    const data = await response.json();
    if (!data || typeof data.recentGameRatings === "undefined") {
      return res.status(404).json({ error: "recentGameRatings not found" });
    }

    return res.json(data);
  } catch (err) {
    console.error("leetify proxy error:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// resolve vanity url to steamid64 trying multiple resolvers
app.get("/api/resolve-vanity", async (req, res) => {
  const rawId = (req.query.id || "").toString();
  if (!rawId) return res.status(400).json({ error: "missing id query parameter" });

  // Normalize: remove leading/trailing slashes and whitespace
  const normalized = rawId.replace(/^\/+|\/+$/g, "").trim();

  // Security validation: allow only alphanumerics
  // Reject empty after normalization
  if (!normalized) return res.status(400).json({ error: "invalid id" });

  // Only allow ASCII letters and digits
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    return res.status(400).json({ error: "invalid id: only A-Z, a-z, 0-9, _, - allowed" });
  }

  const id = normalized; // safe to use from here on

  const resolvers = RESOLVERS;
  if (!Array.isArray(resolvers) || resolvers.length === 0) {
    return res.status(500).json({ error: "no resolvers configured" });
  }

  // Randomize start index to distribute load, but keep order otherwise (wrap around)
  const start = Math.floor(Math.random() * resolvers.length);
  const ordered = [];
  for (let i = 0; i < resolvers.length; i++) {
    ordered.push(resolvers[(start + i) % resolvers.length]);
  }

  const errors = [];

  try {
    for (const r of ordered) {
      try {
        const url = r.urlTemplate.replace("{id}", encodeURIComponent(id));
        const resp = await fetchWithTimeout(
          url,
          { method: "GET", headers: { Accept: "application/json" } },
          5000
        );

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        let body;
        try {
          body = await resp.json();
        } catch (e) {
          const txt = await resp.text();
          if (/^\d+$/.test(txt.trim())) {
            const steamid = txt.trim();
            logSteamTool("Resolve vanity", id, ` to ${steamid}`);
            return res.json({ steamid64: steamid, source: r.name });
          }
          throw new Error("invalid-json");
        }

        const found = getByPath(body, r.responsePath);
        if (found && typeof found === "string" && /^\d+$/.test(found)) {
          logSteamTool("Resolve vanity", id, ` to ${found}`);
          return res.json({ steamid64: found, source: r.name });
        }
        if (found && typeof found === "number" && Number.isInteger(found)) {
          const steamid = String(found);
          logSteamTool("Resolve vanity", id, ` to ${steamid}`);
          return res.json({ steamid64: steamid, source: r.name });
        }

        throw new Error("steamid64-not-found");
      } catch (err) {
        errors.push({ source: r.name, error: err.message || String(err) });
        // continue to next resolver
      }
    }

    // none succeeded
    return res.status(502).json({ error: "no resolver succeeded", details: errors });
  } catch (err) {
    return res.status(500).json({ error: "internal", message: err.message || String(err) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`API is running on http://${HOST}:${PORT}`);
});
