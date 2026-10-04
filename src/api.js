import { cacheGet, cacheSet } from "./cache";

// ─── Team Colors ───────────────────────────────────────────────────────────────
export const tc = (team) => {
  const teams = {
    "Red Bull":      "#3671C6",
    "Mercedes":      "#27F4D2",
    "Ferrari":       "#E8002D",
    "McLaren":       "#FF8700",
    "Aston Martin":  "#229971",
    "Alpine":        "#0093CC",
    "Williams":      "#64C4FF",
    "RB":            "#6692FF",
    "Haas":          "#B6BABD",
    "Sauber":        "#52E252",
    "Audi":          "#C0B030",
  };
  return teams[team] || "#ffffff";
};

// ─── Compound Colors ────────────────────────────────────────────────────────────
export const COMP_C = {
  SOFT:         "#DA291C",
  MEDIUM:       "#FFCD00",
  HARD:         "#FFFFFF",
  INTERMEDIATE: "#43B02A",
  WET:          "#0067B9",
};

// ─── ERS Segment Colors & Labels ────────────────────────────────────────────────
export const ERS_C = {
  deploy:     "#5B9BFF",   // bleu   — déploiement (moteur)
  harvest:    "#3DDC84",   // vert   — récolte (freinage regen)
  clip:       "#FFB020",   // ambre  — clipping
  superclip:  "#C77DFF",   // violet — super-clipping
  coast:      "#838B97",   // gris   — lift & coast
  neutral:    "#2E343D",   // neutre
};

export const ERS_L = {
  deploy:    "Deploy",
  harvest:   "Harvest",
  clip:      "Clip",
  superclip: "SuperClip",
  coast:     "Coast",
};

// ─── ERS Classification ─────────────────────────────────────────────────────────
export const classifyErs = (cur, prev, is2026) => {
  if (!prev) return "neutral";
  const dv = cur.speed - prev.speed;

  if (is2026) {
    if (cur.brake > 10 || (dv < -2 && cur.throttle < 5)) {
      return cur.speed > 200 ? "superclip" : "harvest";
    }
    if (cur.throttle > 95 && cur.speed > 250) return "deploy";
    if (cur.throttle < 20 && dv < 0) return "coast";
    if (cur.throttle > 80 && cur.speed > 150) return "clip";
    return "neutral";
  }

  // Pre-2026
  if (cur.brake > 10) return "harvest";
  if (cur.throttle > 95 && cur.speed > 230) return "superclip";
  if (cur.throttle > 85 && cur.speed > 180) return "clip";
  if (cur.brake > 2) return "harvest";
  if (cur.throttle < 15 && dv < 0) return "coast";
  if (cur.throttle > 75) return "deploy";
  return "neutral";
};

// ─── Format Lap Time ────────────────────────────────────────────────────────────
export const fmtLap = (s) => {
  if (!s) return "-:--.---";
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(3);
  return `${m}:${sec.padStart(6, "0")}`;
};

// ─── OpenF1 API with retry + exponential backoff ───────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// At most MAX_PARALLEL requests in flight: fast enough to load a session in a
// couple of seconds, gentle enough to stay under OpenF1's rate limit.
const MAX_PARALLEL = 3;
let active = 0;
const waiting = [];
const acquire = () => new Promise((resolve) => {
  if (active < MAX_PARALLEL) { active++; resolve(); } else waiting.push(resolve);
});
const release = () => {
  const next = waiting.shift();
  if (next) next(); else active--;
};

// Why did the last failing request fail? 404 is not an issue: OpenF1 answers 404
// ("No results found") when a query is simply empty. status 0 = network error.
export const apiIssue = { status: null, path: null };
export const resetApiIssue = () => { apiIssue.status = null; apiIssue.path = null; };
const noteIssue = (status, path) => { apiIssue.status = status; apiIssue.path = path; };

const inflight = new Map(); // identical concurrent requests share one fetch

const networkFetch = async (url, path, log, retries) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const wait = 1500 * Math.pow(2, attempt); // 1.5s → 3s → 6s → 12s
        if (log) log(`429 ${path} → retry in ${wait}ms`);
        if (attempt < retries) { await sleep(wait); continue; }
        noteIssue(429, path);
        return null;
      }
      if (!res.ok) { if (res.status !== 404) noteIssue(res.status, path); return null; }
      return await res.json();
    } catch (err) {
      if (attempt < retries) { await sleep(1000 * (attempt + 1)); continue; }
      if (log) log(`ERR ${path}: ${err.message}`);
      noteIssue(0, path);
      return null;
    }
  }
  return null;
};

// opts.cache = true → read/write the persistent cache. Only use it for data that can
// no longer change (finished sessions); empty answers are never stored because the
// API may simply not have published the data yet.
export const fetchApi = async (path, params = {}, log = null, retries = 4, opts = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined) {
      q.append(k, typeof v === "object" ? JSON.stringify(v) : v);
    }
  });
  const url = `https://api.openf1.org/v1/${path}?${q}`;

  if (opts.cache) {
    const hit = await cacheGet(url);
    if (hit) { if (log) log(`CACHE ${path}`); return hit.data; }
  }
  if (inflight.has(url)) return inflight.get(url);

  const job = (async () => {
    await acquire();
    try {
      if (log) log(`GET ${path}`);
      const data = await networkFetch(url, path, log, retries);
      if (opts.cache && Array.isArray(data) && data.length) cacheSet(url, data);
      return data;
    } finally {
      release();
    }
  })();
  inflight.set(url, job);
  try { return await job; } finally { inflight.delete(url); }
};

// ─── Generic JSON Fetcher ───────────────────────────────────────────────────────
export const fetchJ = async (url, log = null) => {
  try {
    if (log) log(`GET ${url}`);
    const res = await fetch(url);
    return res.json();
  } catch (err) {
    if (log) log(`ERR fetchJ: ${err.message}`);
    return null;
  }
};

// ─── Circuit layout (MultiViewer) ───────────────────────────────────────────────
// The layout is keyed by circuit id *and year*. A relocated or brand-new venue may
// have no layout for the current year, so older years of the same circuit are tried.
export const circuitInfoUrl = (meet) => {
  const built = meet?.circuit_key ? `https://api.multiviewer.app/api/v1/circuits/${meet.circuit_key}/${meet.year || new Date(meet.date_start).getFullYear()}` : null;
  const url = meet?.circuit_info_url;
  if (!url) return built;
  // a stale URL still pointing at the original venue must not win over circuit_key
  const id = url.match(/\/circuits\/(\d+)\//)?.[1];
  return built && id && String(meet.circuit_key) !== id ? built : url;
};

export const loadCircuitInfo = async (url, log = null) => {
  const ok = (c) => Array.isArray(c?.x) && c.x.length > 10;
  const first = await fetchJ(url, log);
  if (ok(first)) return { info: first, year: null };
  const m = url.match(/^(.*\/circuits\/\d+\/)(\d{4})(.*)$/);
  if (!m) return null;
  // older years in parallel (different host from OpenF1, so no rate-limit concern); newest hit wins
  const years = Array.from({ length: 12 }, (_, i) => +m[2] - 1 - i);
  const found = await Promise.all(years.map((y) => fetchJ(`${m[1]}${y}${m[3]}`, null)));
  const i = found.findIndex(ok);
  return i < 0 ? null : { info: found[i], year: years[i] };
};

// ─── Jolpi / Ergast Championship Standings ──────────────────────────────────────
export const fetchStandings = async (year) => {
  try {
    const res = await fetch(`https://api.jolpi.ca/ergast/f1/${year}/driverStandings.json`);
    const data = await res.json();
    return data.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [];
  } catch (err) {
    console.error("Jolpi API error:", err);
    return [];
  }
};

// ─── Export Helpers ─────────────────────────────────────────────────────────────
export const exportJSON = (data, name) => {
  if (!data?.length) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.json`;
  a.click();
};

export const exportCSV = (data, name) => {
  if (!data?.length) return;
  const headers = Object.keys(data[0]).join(",");
  const rows = data.map((row) => Object.values(row).join(","));
  const blob = new Blob([[headers, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
};