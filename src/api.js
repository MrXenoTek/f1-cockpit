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
  deploy:     "#E8002D",   // rouge  — déploiement (moteur)
  harvest:    "#00D26A",   // vert   — récolte (freinage regen)
  clip:       "#00D4FF",   // cyan   — clipping
  superclip:  "#B366FF",   // violet — super-clipping
  coast:      "#FFD600",   // jaune  — lift & coast
  neutral:    "#333333",   // gris   — neutre
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

export const fetchApi = async (path, params = {}, log = null, retries = 4) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined) {
      q.append(k, typeof v === "object" ? JSON.stringify(v) : v);
    }
  });
  const url = `https://api.openf1.org/v1/${path}?${q}`;
  if (log) log(`GET ${path}`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const wait = 1500 * Math.pow(2, attempt); // 1.5s → 3s → 6s → 12s
        if (log) log(`429 ${path} → retry in ${wait}ms`);
        if (attempt < retries) { await sleep(wait); continue; }
        return null;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      if (attempt < retries) { await sleep(1000 * (attempt + 1)); continue; }
      if (log) log(`ERR ${path}: ${err.message}`);
      return null;
    }
  }
  return null;
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