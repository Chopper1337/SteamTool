// Configuration
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
    desc: "Steam, FACEIT, Leetify and CSStats.gg stats.<br>AllStar Highlights.<br>Inventory viewer.",
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
    desc: "Steam, FACEIT and Leetify stats.<br>Trust rating and community reputation.",
    url_vanity: null,
    url_64: "https://catstats.gg/player/{steamid64}",
    needs64: false,
    favicon: "https://catstats.gg/favicon.ico",
    open: "new",
  },
  {
    id: "skinflow",
    title: "CS2Tracker",
    desc: "Steam, FACEIT and Leetify stats.<br>Risk estimation and Inventory viewer.",
    url_vanity: "https://steamcommunity.tips/{path}",
    url_64: "https://steamcommunity.tips/{path}",
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

const API_BASE = `{window.location.origin}/api`
const MAX_LOG_LINES = 200;

// Utility Functions
const Utils = {
  nowStamp() {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  },

  sanitiseInput(str) {
    return str?.trim().replace(/[<>]/g, "") || "";
  },

  getInitials(title) {
    return title
      .split(/\s/)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  },

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error("Clipboard write failed:", error);
      return false;
    }
  },
};

// DOM Cache
const DOM = {
  pathInput: null,
  statusArea: null,
  targetsList: null,

  init() {
    this.pathInput = document.getElementById("pathInput");
    this.statusArea = document.getElementById("statusArea");
    this.targetsList = document.getElementById("targetsList");
  },
};

// Logger
const Logger = {
  log(text, type = "info") {
    const el = DOM.statusArea;
    if (!el) return;

    const logEntry = document.createElement("div");
    logEntry.className = `logText ${type}`;
    logEntry.textContent = `[${Utils.nowStamp()}] ${text}`;
    console.log(logEntry.textContent);

    el.appendChild(logEntry);

    // Maintain max log lines
    while (el.children.length > MAX_LOG_LINES) {
      el.removeChild(el.firstChild);
    }

    // Auto-scroll to bottom
    el.scrollTop = el.scrollHeight;
  },

  clear() {
    if (DOM.statusArea) {
      DOM.statusArea.innerHTML = "";
    }
  },

  info(text) {
    this.log(text, "muted");
  },

  success(text) {
    this.log(text, "ok");
  },

  error(text) {
    this.log(text, "error");
  },
};

// Path Parser
const PathParser = {
  parse() {
    const pathname = window.location.pathname.replace(/^\/+|\/+$/g, "");
    
    if (!pathname) return null;

    const parts = pathname.split("/");
    if (parts.length < 2) return null;

    const [kind, ...rest] = parts;
    
    return {
      raw: pathname,
      kind: kind.toLowerCase(),
      target: rest.join("/"),
    };
  },

  /**
   * Parse user input to extract Steam profile information
   * Handles various formats:
   * - Full URLs: https://steamcommunity.com/id/vanity
   * - Partial URLs: steamcommunity.com/profiles/123456789
   * - Path only: /id/vanity or id/vanity
   * - Direct ID: vanity or 123456789
   */
  parseInput(input) {
    if (!input || typeof input !== 'string') return null;

    const cleaned = input.trim();
    if (!cleaned) return null;

    // Try to parse as URL
    let urlPath = null;
    try {
      // Check if it's a full URL
      if (cleaned.match(/^https?:\/\//i)) {
        const url = new URL(cleaned);
        urlPath = url.pathname;
      } 
      // Check if it's a domain-like string (steamcommunity.com/...)
      else if (cleaned.match(/^[a-z0-9.-]+\.[a-z]{2,}\//i)) {
        const url = new URL('https://' + cleaned);
        urlPath = url.pathname;
      }
      // Check if it starts with a slash
      else if (cleaned.startsWith('/')) {
        urlPath = cleaned;
      }
    } catch (e) {
      // Not a valid URL, continue with other parsing
    }

    // If we extracted a path from URL, parse it
    if (urlPath) {
      const pathCleaned = urlPath.replace(/^\/+|\/+$/g, "");
      const parts = pathCleaned.split("/");
      
      if (parts.length >= 2) {
        const [kind, ...rest] = parts;
        const kindLower = kind.toLowerCase();
        
        // Support both 'profile' and 'profiles'
        if (kindLower === 'id') {
          return {
            kind: 'id',
            target: rest.join("/"),
          };
        } else if (kindLower === 'profile' || kindLower === 'profiles') {
          return {
            kind: 'profiles',
            target: rest.join("/"),
          };
        }
      }
    }

    // Try to parse as path format: "id/vanity" or "profiles/123456789" or "profile/123456789"
    if (cleaned.includes('/')) {
      const parts = cleaned.split('/').filter(p => p.length > 0);
      if (parts.length >= 2) {
        const [kind, ...rest] = parts;
        const kindLower = kind.toLowerCase();
        
        // Support both 'profile' and 'profiles'
        if (kindLower === 'id') {
          return {
            kind: 'id',
            target: rest.join("/"),
          };
        } else if (kindLower === 'profile' || kindLower === 'profiles') {
          return {
            kind: 'profiles',
            target: rest.join("/"),
          };
        }
      }
    }

    // Check if it's a steamid64 (17 digits, starts with 76561198 - https://help.steampowered.com/en/faqs/view/2816-BE67-5B69-0FEC)
    if (/^76561198\d{10}$/.test(cleaned)) {
      return {
        kind: 'profiles',
        target: cleaned,
      };
    }

    // Assume it's a vanity ID (alphanumeric, underscores, hyphens)
    if (/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
      return {
        kind: 'id',
        target: cleaned,
      };
    }

    return null;
  },

  /**
   * Navigate to a new profile
   */
  navigateToProfile(kind, target) {
    const newPath = `/${kind}/${target}`;
    window.history.pushState({}, '', newPath);
  },
};

// API Service
const API = {
  async fetchJSON(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        error: response.statusText 
      }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return response.json();
  },

  async resolveVanity(vanityId) {
    try {
      Logger.info("Attempting to resolve vanity ID to steamid64...");
      
      const sanitised = Utils.sanitiseInput(vanityId);
      const data = await this.fetchJSON(
        `/api/resolve-vanity?id=${encodeURIComponent(sanitised)}`
      );

      if (!data?.steamid64) {
        throw new Error("No steamid64 returned");
      }

      Logger.success(
        `Resolved to steamid64: ${data.steamid64} (via ${data.source || "resolver"})`
      );
      return data.steamid64;
    } catch (error) {
      Logger.error(`Failed to resolve vanity: ${error.message}`);
      throw error;
    }
  },

  async fetchLeetifyStats(steamid64) {
    if (!steamid64) return null;

    try {
      Logger.info("Attempting to fetch Leetify stats...");
      
      const data = await this.fetchJSON(
        `/api/leetify?id=${encodeURIComponent(steamid64)}`
      );

      if (!data?.recentGameRatings) {
        throw new Error("Invalid response format");
      }

      Logger.success("Fetched Leetify stats:");
      Logger.info(`Aim: ${data.recentGameRatings.aim.toFixed(2)}`);
      Logger.info(`Positioning: ${data.recentGameRatings.positioning.toFixed(2)}`);
      Logger.info(`Util: ${data.recentGameRatings.utility.toFixed(2)}`);

      return data;
    } catch (error) {
      Logger.error("Failed to fetch Leetify stats");
      Logger.info(error.message);
      return null;
    }
  },

  async fetchKnownPlayerInfo(steamid64) {
    if (!steamid64) return null;

    try {
      const data = await this.fetchJSON(
        `${API_BASE}/known?id=${encodeURIComponent(steamid64)}`
      );

      if (!data) return null;

      Logger.success("Found known player");
      Logger.info(`Name: ${data.name}`);
      
      if (data.info?.length) {
        data.info.forEach((info) => Logger.info(info));
      }

      if (data.links?.length) {
        Logger.info("Links:");
        data.links.forEach((link) => Logger.info(link));
      }

      return data;
    } catch (error) {
      console.log(`Failed to check known player: ${error.message}`);
      return null;
    }
  },

  async updateVisitorCount() {
    try {
      await fetch("/api/visitor-count", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch (error) {
      console.error("Failed to update visitor count:", error);
    }
  },

  async getVisitorCount() {
    try {
      const data = await this.fetchJSON("/api/visitor-count");
      return data;
    } catch (error) {
      console.error("Failed to get visitor count:", error);
      return null;
    }
  },
};

// URL Builder
const URLBuilder = {
  build(target, parsed, steamid64) {
    if (!parsed) return null;
    if (target?.needs64) {
      if (!steamid64) return null;
      return target.url_64.replace("{steamid64}", encodeURIComponent(steamid64));
    }

    if (!parsed.kind) return null;

    // parsed.kind is either "id" (vanity) or "profiles" (steamid64) 
    const path = `${encodeURIComponent(parsed.kind)}/${encodeURIComponent(parsed.target)}`;
    const template = target?.url_vanity || target?.url_64;
    if (!template) return null;

    return template
      .replace("{path}", path)
      .replace("{steamid64}", encodeURIComponent(steamid64 || ""));
    },
  };

// Input Handler
const InputHandler = {
  init() {
    if (!DOM.pathInput) return;

    // Handle Enter key
    DOM.pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleSubmit();
      }
    });

    // Optional: Handle input on blur
    DOM.pathInput.addEventListener('blur', () => {
      // Only auto-submit if user clearly wants to (you can remove this if not desired)
      // this.handleSubmit();
    });
  },

  async handleSubmit() {
    const input = DOM.pathInput.value;
    
    if (!input || !input.trim()) {
      Logger.error("Please enter a Steam profile URL, vanity ID, or SteamID64");
      return;
    }

    Logger.info("Parsing input...");
    const parsed = PathParser.parseInput(input);

    if (!parsed) {
      Logger.error(
        "Could not parse input. Please enter a valid Steam profile URL, vanity ID, or SteamID64"
      );
      return;
    }

    Logger.success(`Detected ${parsed.kind === 'id' ? 'vanity ID' : 'SteamID64'}: ${parsed.target}`);

    // Update URL
    PathParser.navigateToProfile(parsed.kind, parsed.target);

    // Update the input to show clean format
    DOM.pathInput.value = parsed.target;

    // Clear previous logs (optional - remove if you want to keep history)
    Logger.clear();

    // Reload the profile
    await App.loadProfile(parsed);
  },
};

// UI Builder
const UIBuilder = {
  createFaviconElement(target) {
    const icon = document.createElement("div");
    icon.className = "t-icon";

    if (target.favicon) {
      const img = document.createElement("img");
      img.alt = target.title;
      img.src = target.favicon;
      Object.assign(img.style, {
        width: "24px",
        height: "24px",
        objectFit: "contain",
        borderRadius: "4px",
      });

      img.onerror = () => {
        img.remove();
        icon.textContent = Utils.getInitials(target.title);
      };

      icon.appendChild(img);
    } else {
      icon.textContent = Utils.getInitials(target.title);
    }

    return icon;
  },

  createInfoElement(target) {
    const info = document.createElement("div");
    
    const title = document.createElement("div");
    title.className = "t-title";
    title.textContent = target.title;

    const desc = document.createElement("div");
    desc.className = "t-desc";
    desc.innerHTML = target.desc;

    info.append(title, desc);
    return { info, desc };
  },

  createActionButtons(target, parsed, steamid64) {
    const actions = document.createElement("div");
    actions.className = "t-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "btn small";
    openBtn.textContent = "Open";
    openBtn.onclick = () => this.handleOpen(target, parsed, steamid64);

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn ghost small";
    copyBtn.textContent = "Copy URL";
    copyBtn.onclick = () => this.handleCopy(target, parsed, steamid64);

    actions.append(openBtn, copyBtn);
    return { actions, openBtn, copyBtn };
  },

  async handleOpen(target, parsed, steamid64) {
    const url = URLBuilder.build(target, parsed, steamid64);
    if (!url) return;

    if (target.open === "same") {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  },

  async handleCopy(target, parsed, steamid64) {
    const url = URLBuilder.build(target, parsed, steamid64);
    if (!url) return;

    const success = await Utils.copyToClipboard(url);
    if (success) {
      Logger.success("Copied to clipboard");
    } else {
      Logger.error("Clipboard write failed");
    }
  },

  buildTargetElement(target, parsed, steamid64) {
    const container = document.createElement("div");
    container.className = "target";

    const left = document.createElement("div");
    left.className = "t-left";

    const icon = this.createFaviconElement(target);
    const { info, desc } = this.createInfoElement(target);
    const { actions, openBtn, copyBtn } = this.createActionButtons(
      target,
      parsed,
      steamid64
    );

    left.append(icon, info);
    container.append(left, actions);

    // Handle disabled state
    const isDisabled = !parsed || (target.needs64 && !steamid64);
    if (isDisabled) {
      [openBtn, copyBtn].forEach((btn) => {
        btn.disabled = true;
        btn.className += " disabled";
        btn.style.opacity = "0.45";
      });
      desc.textContent += " — unavailable";
    }

    return container;
  },

  renderTargets(parsed, steamid64) {
    if (!DOM.targetsList) return;

    DOM.targetsList.innerHTML = "";
    
    const fragment = document.createDocumentFragment();
    CONFIG.forEach((target) => {
      const element = this.buildTargetElement(target, parsed, steamid64);
      fragment.appendChild(element);
    });

    DOM.targetsList.appendChild(fragment);
  },
};

// Main Application
const App = {
  async initialise() {
    DOM.init();
    InputHandler.init();

    const parsed = PathParser.parse();

    if (!parsed) {
      DOM.pathInput.value = "";
      Logger.info(
        "Enter a Steam profile URL, vanity ID, or SteamID64 and press Enter"
      );
      UIBuilder.renderTargets(null, null);
      return;
    }

    DOM.pathInput.value = parsed.target;
    await this.loadProfile(parsed);
  },

  async loadProfile(parsed) {
    if (!parsed) {
      Logger.error("Invalid profile data");
      return;
    }

    const steamid64 = await this.resolveSteamId(parsed);
    
    UIBuilder.renderTargets(parsed, steamid64);

    // Fetch additional data in parallel
    await Promise.allSettled([
      API.fetchLeetifyStats(steamid64),
      API.fetchKnownPlayerInfo(steamid64),
      API.updateVisitorCount(),
    ]);
  },

  async resolveSteamId(parsed) {
    if (parsed.kind === "id") {
      try {
        return await API.resolveVanity(parsed.target);
      } catch (error) {
        return null;
      }
    }

    if (parsed.kind === "profiles") {
      Logger.success(`Detected steamid64: ${parsed.target}`);
      return parsed.target;
    }

    Logger.info(
      `Unknown path kind "${parsed.kind}". Attempting to treat as raw path.`
    );
    return null;
  },
};

// Initialise on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => App.initialise());
} else {
  App.initialise();
}
