// Configuration
//
// The site list lives in content/config.json, which is the single source of
// truth. It is served straight off the filesystem next to this file, so
// editing it changes the live list with no rebuild and no API restart.
let CONFIG = [];

const CONFIG_URL = "/config.json";
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

  /**
   * Load the site list. config.json is the only source for CONFIG, so a
   * failure here is fatal to the target list rather than silently falling
   * back to a stale hard-coded copy that could drift out of sync again.
   */
  async loadConfig() {
    try {
      // no-cache revalidates rather than skipping the cache entirely, so an
      // edit on the server shows up immediately but unchanged files 304.
      const response = await fetch(CONFIG_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("config.json is not an array");

      CONFIG = data;
      Logger.info(`Loaded ${CONFIG.length} sites from config.json`);
      return true;
    } catch (error) {
      CONFIG = [];
      Logger.error(`Could not load config.json: ${error.message}`);
      Logger.info("The site list is unavailable until config.json parses.");
      return false;
    }
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

  async fetchKnownPlayerInfo(steamid64) {
    if (!steamid64) return null;

    try {
      const data = await this.fetchJSON(
        `/api/known?id=${encodeURIComponent(steamid64)}`
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

      // Append a node rather than touching textContent: the description is
      // HTML, and reading it back as text flattens its <br> line breaks.
      const flag = document.createElement("span");
      flag.textContent = " — unavailable";
      desc.appendChild(flag);
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

// Stats panel - visitor history and the API log tail
const Stats = {
  el: {},
  timer: null,
  isOpen: false,
  REFRESH_MS: 10000,
  DAYS_SHOWN: 30,
  TOKEN_KEY: "steamtool.statsToken",

  init() {
    const id = (name) => document.getElementById(name);
    this.el = {
      link: id("statsLink"),
      modal: id("statsModal"),
      close: id("statsClose"),
      summary: id("statsSummary"),
      chart: id("statsChart"),
      axis: id("statsAxis"),
      table: id("statsTable"),
      logs: id("statsLogs"),
      tokenRow: id("statsTokenRow"),
      tokenInput: id("statsTokenInput"),
      tokenSave: id("statsTokenSave"),
      tip: id("statsTip"),
    };

    if (!this.el.link || !this.el.modal) return;

    this.el.link.addEventListener("click", (event) => {
      event.preventDefault();
      this.show();
    });

    this.el.close.addEventListener("click", () => this.hide());

    this.el.modal.addEventListener("click", (event) => {
      if (event.target === this.el.modal) this.hide();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen) this.hide();
    });

    const submitToken = () => {
      this.setToken(this.el.tokenInput.value.trim());
      this.el.tokenInput.value = "";
      this.refreshLogs();
    };

    this.el.tokenSave.addEventListener("click", submitToken);
    this.el.tokenInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submitToken();
    });
  },

  getToken() {
    try {
      return localStorage.getItem(this.TOKEN_KEY) || "";
    } catch (error) {
      return "";
    }
  },

  setToken(value) {
    try {
      if (value) localStorage.setItem(this.TOKEN_KEY, value);
      else localStorage.removeItem(this.TOKEN_KEY);
    } catch (error) {
      // Private browsing - the token simply won't persist between visits.
    }
  },

  show() {
    this.isOpen = true;
    this.el.modal.hidden = false;
    this.el.close.focus();
    this.refresh();
    this.timer = setInterval(() => this.refresh(), this.REFRESH_MS);
  },

  hide() {
    this.isOpen = false;
    this.el.modal.hidden = true;
    this.hideTip();
    clearInterval(this.timer);
    this.timer = null;
    this.el.link.focus();
  },

  refresh() {
    return Promise.allSettled([this.refreshVisitors(), this.refreshLogs()]);
  },

  // ---- visitors -----------------------------------------------------------

  async refreshVisitors() {
    try {
      const data = await API.fetchJSON("/api/stats/visitors");
      const days = Array.isArray(data.days) ? data.days : [];

      this.el.summary.textContent =
        `${data.today} today · ${data.total} all time · ${days.length} days recorded`;

      this.renderChart(days);
      this.renderTable(days);
    } catch (error) {
      this.el.summary.textContent = `Could not load visitor stats: ${error.message}`;
      this.el.chart.innerHTML = "";
      this.el.axis.textContent = "";
    }
  },

  renderChart(days) {
    const chart = this.el.chart;
    chart.innerHTML = "";

    if (!days.length) {
      this.el.axis.textContent = "";
      return;
    }

    const recent = days.slice(-this.DAYS_SHOWN);
    const max = Math.max(...recent.map((d) => d.count), 1);
    const today = new Date().toISOString().slice(0, 10);
    const peak = recent.reduce((a, b) => (b.count > a.count ? b : a), recent[0]);

    recent.forEach((day) => {
      const col = document.createElement("div");
      col.className = "sc-col";

      // Direct-label only the peak and today. A number over every bar is noise.
      if (day.date === peak.date || day.date === today) {
        const value = document.createElement("span");
        value.className = "sc-val";
        value.textContent = day.count;
        col.appendChild(value);
      }

      const bar = document.createElement("div");
      bar.className = "sc-bar";
      if (day.date === today) bar.classList.add("is-today");
      bar.style.height = `${Math.max((day.count / max) * 100, 2)}%`;
      bar.tabIndex = 0;
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", `${day.date}: ${day.count} visits`);

      const showTip = () => this.showTip(bar, `${day.date} · ${day.count}`);
      bar.addEventListener("mouseenter", showTip);
      bar.addEventListener("focus", showTip);
      bar.addEventListener("mouseleave", () => this.hideTip());
      bar.addEventListener("blur", () => this.hideTip());

      col.appendChild(bar);
      chart.appendChild(col);
    });

    this.el.axis.textContent = `${recent[0].date}  →  ${recent[recent.length - 1].date}`;
  },

  renderTable(days) {
    const table = this.el.table;
    table.innerHTML = "";

    days
      .slice()
      .reverse()
      .forEach((day) => {
        const row = document.createElement("div");
        row.className = "st-row";

        const date = document.createElement("span");
        date.textContent = day.date;

        const count = document.createElement("span");
        count.className = "st-count";
        count.textContent = day.count;

        row.append(date, count);
        table.appendChild(row);
      });
  },

  showTip(anchor, text) {
    const tip = this.el.tip;
    tip.textContent = text;
    tip.hidden = false;

    const bar = anchor.getBoundingClientRect();
    const host = this.el.chart.getBoundingClientRect();
    tip.style.left = `${bar.left - host.left + bar.width / 2}px`;
    tip.style.bottom = `${host.bottom - bar.top + 6}px`;
  },

  hideTip() {
    if (this.el.tip) this.el.tip.hidden = true;
  },

  // ---- logs ---------------------------------------------------------------

  async refreshLogs() {
    const token = this.getToken();
    const logs = this.el.logs;

    if (!token) {
      this.el.tokenRow.hidden = false;
      logs.textContent = "Enter the stats token to view the API log.";
      return;
    }

    try {
      const data = await API.fetchJSON("/api/stats/logs?limit=300", {
        headers: { "X-Stats-Token": token },
      });

      this.el.tokenRow.hidden = true;

      const lines = Array.isArray(data.lines) ? data.lines : [];
      logs.textContent = lines.length ? lines.join("\n") : "The log is empty.";
      logs.scrollTop = logs.scrollHeight;
    } catch (error) {
      this.el.tokenRow.hidden = false;

      if (error.message === "unauthorized") {
        logs.textContent = "That token was rejected. Check STATS_TOKEN on the API.";
      } else if (error.message === "stats_token_not_configured") {
        logs.textContent =
          "The API has no STATS_TOKEN set, so log access is disabled.\n" +
          "Set STATS_TOKEN in the API environment and restart it.";
      } else {
        logs.textContent = `Could not load logs: ${error.message}`;
      }
    }
  },
};

// Main Application
const App = {
  async initialise() {
    DOM.init();
    InputHandler.init();
    Stats.init();

    // The target list cannot render until config.json has loaded.
    await API.loadConfig();

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
