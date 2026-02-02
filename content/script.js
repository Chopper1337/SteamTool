const CONFIG = [
  {
    id: "steam",
    title: "View profile",
    desc: "Open original Steam profile",
    url_vanity: "https://steamcommunity.com/{path}",
    url_64: "https://steamcommunity.com/{path}",
    needs64: false,
    favicon: "https://steamcommunity.com/favicon.ico",
    open: "new",
  },
  {
    id: "csstat",
    title: "CSSt.at",
    desc: "Stats from Steam, FACEIT, Leetify and CSStats.gg.<br>Highlights from AllStar.<br>Inventory viewer.",
    url_vanity: "https://steamcommunity.rip/{path}",
    url_64: "https://steamcommunity.rip/{path}",
    needs64: false,
    favicon: "",
    open: "new",
  },
  {
    id: "CSStats.gg",
    title: "CSStats.gg",
    desc: "CS stats, HLTV rating and FACEIT.",
    url_vanity: null,
    url_64: "https://csstats.gg/player/{steamid64}",
    needs64: true,
    favicon: "https://static.csstats.gg/images/favicon.svg",
    open: "new",
  },
  {
    id: "catstats",
    title: "catstats.gg",
    desc: "Stats from Steam, FACEIT and Leetify.",
    url_vanity: null,
    url_64: "https://catstats.gg/player/{steamid64}",
    needs64: false,
    favicon: "https://catstats.gg/favicon.ico",
    open: "new",
  },
  {
    id: "skinflow",
    title: "CS2Tracker",
    desc: "Stats from Steam, FACEIT and Leetify.<br>Risk estimation and Inventory viewer.",
    url_vanity: "https://steamcommunity.tip/{path}",
    url_64: "https://steamcommunity.tip/{path}",
    needs64: false,
    favicon: "https://skinflow.gg/_ipx/_/images/skinflow-logo.webp",
    open: "new",
  },
  {
    id: "csrep",
    title: "CSRep.gg",
    desc: "Leetify stats, AllStar highlights and community reputation.<br>Inventory viewer.",
    url_vanity: "https://wsteamcommunity.com/{path}",
    url_64: "https://wsteamcommunity.com/{path}",
    needs64: false,
    favicon: "https://raw.githubusercontent.com/Chopper1337/SteamTool/refs/heads/main/resources/csrep.ico",
    open: "new",
  },
  {
    id: "steamsets",
    title: "SteamSets.com",
    desc: "Detailed level and game statistics.",
    url_vanity: "https://ssteamcommunity.com/{path}",
    url_64: "https://ssteamcommunity.com/{path}",
    needs64: false,
    favicon: "https://steamsets.com/favicon.ico",
    open: "new",
  },
  {
    id: "steamhist",
    title: "SteamHistory.net",
    desc: "History of profile name, profile picture etc.",
    url_vanity: null,
    url_64: "https://steamhistory.net/id/{steamid64}",
    needs64: true,
    favicon: "https://steamhistory.net/favicon-32x32.png",
    open: "new",
  },
  {
    id: "steamiduk",
    title: "SteamID.uk",
    desc: "History of profile, ban stats and more.",
    url_vanity: null,
    url_64: "https://steamid.uk/profile/{steamid64}",
    needs64: true,
    favicon: "https://cdn.steamid.uk/images/favicon/android-icon-192x192.png",
    open: "new",
  },
  {
    id: "steamdb",
    title: "SteamDB.info",
    desc: "Value of profile, game and badge stats and more.",
    url_vanity: null,
    url_64: "https://steamdb.info/calculator/{steamid64}",
    needs64: true,
    favicon: "https://steamdb.info/static/logos/vector_prefers_schema.svg",
    open: "new",
  },
  {
    id: "csxp",
    title: "CSXP.gg",
    desc: "Leaderboards for medals, coins, pins, commends and more.",
    url_vanity: null,
    url_64: "https://csxp.gg/players/{steamid64}",
    needs64: true,
    favicon: "https://csxp.gg/favicon.svg",
    open: "new",
  },
  {
    id: "csgrind",
    title: "CSGrind.com",
    desc: 'Leetify and FACEIT stats. Risk factor. ',
    url_vanity: "https://osteamcommunity.com/{path}",
    url_64: "https://osteamcommunity.com/{path}",
    needs64: false,
    favicon: "https://csgrind.com/browsericon.jpeg",
    open: "new",
  },
  {
    id: "cswatch",
    title: "CSWat.ch",
    desc: 'Leetify frontend with estimated "Skill Rating".',
    url_vanity: "https://steamcommunity.ch/{path}",
    url_64: "https://steamcommunity.ch/{path}",
    needs64: false,
    favicon: "https://cswat.ch/favicon.ico",
    open: "new",
  },
];

const API_BASE = "https://steamcommunityyy.com/api";

function nowStamp() {
  const d = new Date();
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function logLine(text, cls) {
  const el = document.getElementById("statusArea");
  const span = document.createElement("div");
  span.className = "logText";
  span.textContent = `[${nowStamp()}] ${text}`;
  console.log(`${span.textContent}`);
  if (cls) span.className = span.className + " " + cls;
  el.appendChild(span);
  // keep last 200 lines max
  while (el.children.length > 200) el.removeChild(el.firstChild);
  // scroll to bottom
  el.scrollTop = el.scrollHeight;
}

function clearLog() {
  const el = document.getElementById("statusArea");
  el.innerHTML = "";
}

function parsePath() {
  const p = window.location.pathname.replace(/^\/+|\/+$/g, "");
  if (!p) return null;
  const parts = p.split("/");
  if (parts.length < 2) return null;
  const kind = parts[0];
  const rest = parts.slice(1).join("/");
  return { raw: p, kind, target: rest };
}

const pathInput = document.getElementById("pathInput");
const statusArea = document.getElementById("statusArea");
const targetsList = document.getElementById("targetsList");

async function getVisitorCount() {
  try {
    const resp = await fetch('/api/visitor-count', { method: 'GET', credentials: 'same-origin', })
    if (!resp.ok) { return; }
    const a = await resp.json();
    if (!a) { return; }
    console.log(resp.body);
  }
  catch (err){
    console.error('Failed to get visitor count:', err);
  }
}

async function bumpVisitorCount() {
  try {
    const resp = await fetch('/api/visitor-count', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch (err) {
    console.error('Failed to update visitor count:', err);
  }

}


async function init() {

  const parsed = parsePath();
  if (!parsed) {
    pathInput.value = window.location.href;
    logLine(
      "No profile path found. Use /id/<vanity> or /profiles/<steamid64> in the URL.",
      "muted"
    );
    buildTargets(null, null);
    return;
  }

  pathInput.value = parsed.target;

  let steamid64 = null;

  if (parsed.kind.toLowerCase() === "id") {
    logLine("Attempting to resolve vanity ID to steamid64...", "muted");
    try {
      // call your server-side resolver
      const vanity = parsed.target.replace(/^\/+|\/+$/g, ""); // e.g. "valor-cant"
      const resp = await fetch(`/api/resolve-vanity?id=${encodeURIComponent(vanity)}`, {
        method: "GET",
        credentials: "same-origin",
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || err.message || `HTTP ${resp.status}`);
      }
      const body = await resp.json();
      if (body && body.steamid64) {
        steamid64 = body.steamid64;
        logLine(`Resolved to steamid64: ${steamid64} (via ${body.source || "resolver"})`, "ok");
      } else {
        throw new Error(body.error || "no steamid64 returned");
      }
    } catch (err) {
      logLine(`Failed to resolve vanity: ${err.message}`, "error");
    }
  } else if (parsed.kind.toLowerCase() === "profiles") {
    steamid64 = parsed.target;
    logLine(`Detected steamid64: ${steamid64}`, "ok");
  } else {
    logLine(`Unknown path kind "${parsed.kind}". Attempting to treat as raw path.`, "ok");
  }

  buildTargets(parsed, steamid64);
  fetchLeetifyStats(steamid64);
  fetchKnownPlayerInfo(steamid64);
  bumpVisitorCount();
}

async function fetchLeetifyStats(id) {
  if (!id) {
    return;
  }
  try {
    logLine(`Attempting to fetch Leetify stats...`, "muted");
    const respstats = await fetch(
      `${API_BASE}/leetify?id=${encodeURIComponent(id)}`
    );
    if (!respstats.ok) {
      logLine(`Failed to fetch stats`, "error");
      logLine(`Response status was not OK`, "muted");
      return;
    }
    const a = await respstats.json();
    if (!a) {
      logLine("Failed to fetch Leetify stats", "error");
      logLine(`Could not parse response as JSON`, "muted");
      return;
    } else {
      logLine("Fetched Leetify stats:", "ok");
      logLine(`Aim: ${a.recentGameRatings.aim.toFixed(2)}`, "muted");
      logLine(`Positioning: ${a.recentGameRatings.positioning.toFixed(2)}`, "muted");
      logLine(`Util: ${a.recentGameRatings.utility.toFixed(2)}`, "muted");
    }
  } catch (e) {
    logLine("Failed to fetch Leetify stats", "error");
    logLine(`${e}`, "muted");
  }
}

async function fetchKnownPlayerInfo(id) {
  if (!id) { return; }

  try {
    const resp = await fetch(
      `${API_BASE}/known?id=${encodeURIComponent(id)}`
    );
    if (!resp.ok) { return; }
    const a = await resp.json();
    if (!a) { return; }
    logLine("Found known player", "ok");
    logLine(`Name: ${a.name}`, "muted");
    for (const i of a.info) {
      logLine(`${i}`, 'muted');
    }
    if (!a.links || a.links.length == 0 ) { return; }
    logLine(`Links:`, "muted");
    for (const l of a.links) {
      logLine(`${l}`, 'muted');
    }
  } catch (e) {
    console.log(`Failed to check if player ${id} was known: ${e}`)
  }
}

async function resolveVanity(id) {
  try {
    const resp = await fetch(`${API_BASE}/resolve-vanity?id=${encodeURIComponent(id)}`, { method: "GET", credentials: "same-origin" });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(err.error || err.message || `HTTP ${resp.status}`);
    }
    const body = await resp.json();
    if (body.steamid64) return body;
    throw new Error(body.error || "No steamid64 in response");
  } catch (e) {
    // handle error (show to user / fallback)
    console.error("Resolve failed", e);
    throw e;
  }
}

function buildTargets(parsed, steamid64) {
  targetsList.innerHTML = "";
  CONFIG.forEach((t) => {
    const el = document.createElement("div");
    el.className = "target";
    const left = document.createElement("div");
    left.className = "t-left";
    const icon = document.createElement("div");
    icon.className = "t-icon";

    // create image for favicon
    if (t.favicon) {
      const img = document.createElement("img");
      img.alt = t.title;
      img.src = t.favicon;
      img.style.width = "24px";
      img.style.height = "24px";
      img.style.objectFit = "contain";
      img.style.borderRadius = "4px";
      // fallback to initials if favicon fails
      img.onerror = () => {
        if (img && img.parentNode) img.parentNode.removeChild(img);
        icon.textContent = t.title
          .split(/\s/)
          .map((s) => s[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
      };
      icon.appendChild(img);
    } else {
      icon.textContent = t.title
        .split(/\s/)
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
    }

    const info = document.createElement("div");
    const title = document.createElement("div");
    title.className = "t-title";
    title.textContent = t.title;
    const desc = document.createElement("div");
    desc.className = "t-desc";
    //desc.textContent = t.desc;
    desc.innerHTML = t.desc;
    info.appendChild(title);
    info.appendChild(desc);
    left.appendChild(icon);
    left.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "t-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "btn small";
    openBtn.textContent = "Open";
    openBtn.onclick = () => {
      const url = buildUrl(t, parsed, steamid64);
      if (!url) return;
      if (t.open === "same") window.location.href = url;
      else window.open(url, "_blank", "noopener");
    };

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn ghost small";
    copyBtn.textContent = "Copy URL";
    copyBtn.onclick = async () => {
      const url = buildUrl(t, parsed, steamid64);
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        logLine("Copied to clipboard", "ok");
      } catch (e) {
        logLine("Clipboard write failed", "error");
      }
    };

    actions.appendChild(openBtn);
    actions.appendChild(copyBtn);

    let disabled = false;
    if (!parsed) disabled = true;
    if (t.needs64 && !steamid64) disabled = true;
    if (disabled) {
      openBtn.disabled = true;
      copyBtn.disabled = true;
      openBtn.className = openBtn.className + " " + "disabled";
      copyBtn.className = copyBtn.className + " " + "disabled";
      openBtn.style.opacity = "0.45";
      copyBtn.style.opacity = "0.45";
      desc.textContent += " â€” unavailable";
    }

    el.appendChild(left);
    el.appendChild(actions);
    targetsList.appendChild(el);
  });
}

function buildUrl(t, parsed, steamid64) {
  if (!parsed) return null;
  if (t.needs64) {
    if (!steamid64) return null;
    return t.url_64.replace("{steamid64}", encodeURIComponent(steamid64));
  } else {
    // use parsed.raw so "/id/vanity" or "/profiles/steamid64" is preserved
    const raw = parsed.raw; // e.g. "id/valor-cant" or "profiles/123..."
    const segments = raw.split("/").map((s) => encodeURIComponent(s));
    const safePath = segments.join("/");
    return (t.url_vanity || t.url_64)
      .replace("{path}", safePath)
      .replace("{steamid64}", encodeURIComponent(steamid64 || ""));
  }
}

init();
