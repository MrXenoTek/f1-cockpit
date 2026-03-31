import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { tc, fetchApi, fetchJ, classifyErs, fetchStandings } from "./api";
import TrackMap from "./components/TrackMap";
import Sidebar from "./components/Sidebar";
import Telemetry from "./components/Telemetry";
import RightPanel from "./components/RightPanel";

const DICT = {
  fr: {
    weather: "🌤️ Météo", radio: "📻 Radio", ctrl: "🏁 Dir.", pits: "🛠️ Stands",
    timing: "⏱️ Temps", speed: "Vitesse", throttle: "Accélérateur", brake: "Frein",
    gear: "Rapport", ers: "ERS", live: "DIRECT", ranking: "Classement", lap: "Tour",
    dom: "DOMINATION SPATIALE", ers_state: "ÉTAT ERS", faster: "Plus rapide",
    deploy: "Déploiement", harvest: "Récolte", clip: "Clipping",
    superclip: "Super Clip", coast: "Lift&Coast", tel: "TÉLÉMÉTRIE", champ: "🏆 Champ.",
  },
  en: {
    weather: "🌤️ Weather", radio: "📻 Radio", ctrl: "🏁 Ctrl", pits: "🛠️ Pits",
    timing: "⏱️ Timing", speed: "Speed", throttle: "Throttle", brake: "Brake",
    gear: "Gear", ers: "ERS", live: "LIVE", ranking: "Standings", lap: "Lap",
    dom: "SPATIAL DOMINATION", ers_state: "ERS STATE", faster: "Faster",
    deploy: "Deploy", harvest: "Harvest", clip: "Clipping",
    superclip: "Super Clip", coast: "Lift & Coast", tel: "TELEMETRY", champ: "🏆 Champ.",
  },
};

export default function App() {
  const [meetings, setMeetings] = useState([]);
  const [selMeet, setSelMeet] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selSess, setSelSess] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [trackX, setTrackX] = useState([]);
  const [trackY, setTrackY] = useState([]);
  const [corners, setCorners] = useState([]);
  const [radios, setRadios] = useState([]);
  const [rCtrl, setRCtrl] = useState([]);
  const [laps, setLaps] = useState([]);
  const [posSnaps, setPosSnaps] = useState([]);
  const [intervals, setIntervals] = useState([]);
  const [weather, setWeather] = useState([]);
  const [standings, setStandings] = useState([]);
  const lapDataCache = useRef({});
  const [currentCarData, setCurrentCarData] = useState([]);
  const [cmpCarData, setCmpCarData] = useState([]);
  const [stints, setStints] = useState([]);
  const [pits, setPits] = useState([]);
  const [ersSegs, setErsSegs] = useState([]);
  const [selDrv, setSelDrv] = useState(null);
  const [cmpDrv, setCmpDrv] = useState(null);
  const [curLap, setCurLap] = useState(1);
  const [maxLap, setMaxLap] = useState(1);
  const [loading, setLoading] = useState(false);
  const [telStatus, setTelStatus] = useState("idle");
  const [tab, setTab] = useState("timing");
  const [rfDrv, setRfDrv] = useState("");
  const [rfLap, setRfLap] = useState("");
  const [play, setPlay] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [lang, setLang] = useState("fr");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [mapMetric, setMapMetric] = useState("speed");
  const t = (k) => DICT[lang][k] || k;

  const playRef = useRef(null);
  const curLapRef = useRef(1);
  const maxLapRef = useRef(1);
  const [logs, setLogs] = useState([]);
  const [apiOk, setApiOk] = useState("...");
  const [year, setYear] = useState(2026);
  const is26 = year >= 2026;
  const log = useCallback((m) => setLogs((p) => [...p.slice(-60), { t: new Date().toLocaleTimeString("fr-FR"), m }]), []);

  useEffect(() => { curLapRef.current = curLap; }, [curLap]);
  useEffect(() => { maxLapRef.current = maxLap; }, [maxLap]);

  // Keyboard shortcuts & responsive
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); setPlay((p) => !p); }
      if (e.code === "ArrowLeft") { e.preventDefault(); setCurLap((l) => Math.max(1, l - 1)); }
      if (e.code === "ArrowRight") { e.preventDefault(); setCurLap((l) => Math.min(maxLap, l + 1)); }
    };
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("keydown", handleKeyDown); window.removeEventListener("resize", handleResize); };
  }, [maxLap]);

  // Load meetings + standings when year changes
  useEffect(() => {
    setApiOk("..."); setMeetings([]); setStandings([]);
    fetchApi("meetings", { year }, log).then((d) => {
      if (!d || !Array.isArray(d)) { setApiOk("ERR"); return; }
      setApiOk("OK");
      setMeetings(d.filter((m) => !m.meeting_name?.includes("Testing")).sort((a, b) => new Date(b.date_start) - new Date(a.date_start)));
    });
    fetchStandings(year).then((d) => setStandings(d));
  }, [year, log]);

  // Load sessions when meeting changes
  useEffect(() => {
    if (!selMeet) return;
    setSessions([]); setSelSess(null);
    fetchApi("sessions", { meeting_key: selMeet.meeting_key }, log).then((d) => Array.isArray(d) && setSessions(d));
  }, [selMeet, log]);

  // Load all session data
  const loadSessionAggregateData = useCallback(async (isInitial = false) => {
    if (!selSess) return;
    const sk = selSess.session_key;
    if (isInitial) {
      setLoading(true); setSessionReady(false);
      setDrivers([]); setTrackX([]); setTrackY([]); setCorners([]);
      setLaps([]); lapDataCache.current = {}; setCurrentCarData([]); setCmpCarData([]);
      setStints([]); setPits([]); setPosSnaps([]); setIntervals([]); setErsSegs([]);
      setRadios([]); setRCtrl([]); setWeather([]);
      setSelDrv(null); setCmpDrv(null); setCurLap(1); setTelStatus("idle"); setHoveredIndex(null);
    }
    try {
      if (isInitial && selMeet?.circuit_info_url) {
        const c = await fetchJ(selMeet.circuit_info_url, isInitial ? log : null);
        if (c?.x?.length > 10) { setTrackX(c.x); setTrackY(c.y); setCorners(c.corners || []); }
      }
      // Sequential fetch to avoid hammering the API with 9 simultaneous requests
      const drv = await fetchApi("drivers",     { session_key: sk }, isInitial ? log : null);
      const ld  = await fetchApi("laps",         { session_key: sk }, isInitial ? log : null);
      const pos = await fetchApi("position",     { session_key: sk }, isInitial ? log : null);
      const st  = await fetchApi("stints",       { session_key: sk }, isInitial ? log : null);
      const pt  = await fetchApi("pit",          { session_key: sk }, isInitial ? log : null);
      const iv  = await fetchApi("intervals",    { session_key: sk }, isInitial ? log : null);
      const rad = await fetchApi("team_radio",   { session_key: sk }, isInitial ? log : null);
      const rc  = await fetchApi("race_control", { session_key: sk }, isInitial ? log : null);
      const wx  = await fetchApi("weather",      { session_key: sk }, isInitial ? log : null);
      if (Array.isArray(drv)) {
        const u = [...new Map(drv.map((x) => [x.driver_number, x])).values()];
        setDrivers(u);
        if (isInitial && u.length) setSelDrv(u[0].driver_number);
      }
      if (Array.isArray(ld)) {
        setLaps(ld);
        const newMax = Math.max(...ld.map((l) => l.lap_number || 0), 1);
        setMaxLap(newMax);
        if (!isInitial && isLive && curLapRef.current === maxLapRef.current && newMax > maxLapRef.current) setCurLap(newMax);
      }
      if (Array.isArray(pos) && pos.length) {
        const sorted = [...pos].sort((a, b) => new Date(a.date) - new Date(b.date));
        const state = {}, snaps = [];
        for (const p of sorted) { state[p.driver_number] = p.position; snaps.push({ date: p.date, state: { ...state } }); }
        setPosSnaps(snaps);
      }
      if (Array.isArray(st)) setStints(st);
      if (Array.isArray(pt)) setPits(pt); else if (isInitial) setPits([]);
      if (Array.isArray(iv)) setIntervals(iv);
      if (Array.isArray(rad)) setRadios(rad.sort((a, b) => new Date(a.date) - new Date(b.date)));
      if (Array.isArray(rc)) setRCtrl(rc); else if (isInitial) setRCtrl([]);
      if (Array.isArray(wx)) setWeather(wx.sort((a, b) => new Date(a.date) - new Date(b.date)));
      if (isInitial) { setSessionReady(true); setLoading(false); }
    } catch (err) {
      if (isInitial) setLoading(false);
    }
  }, [selSess, selMeet, isLive, log]);

  useEffect(() => { if (selSess) loadSessionAggregateData(true); }, [selSess, loadSessionAggregateData]);

  // Live refresh
  useEffect(() => {
    if (!isLive || !sessionReady) return;
    const interval = setInterval(() => loadSessionAggregateData(false), 15000);
    return () => clearInterval(interval);
  }, [isLive, sessionReady, loadSessionAggregateData]);

  // Fetch car telemetry data for selected lap
  useEffect(() => {
    if (!sessionReady || !laps.length) return;
    const fetchDriverData = async (drv, setter) => {
      if (!drv) { setter([]); return; }
      const cacheKey = `${drv}-${curLap}`;
      if (lapDataCache.current[cacheKey]) { setter(lapDataCache.current[cacheKey]); return; }
      const currentLapData = laps.find((l) => l.driver_number === drv && l.lap_number === curLap);
      if (!currentLapData || !currentLapData.date_start) { setter([]); return; }
      const nextLapData = laps.find((l) => l.driver_number === drv && l.lap_number === curLap + 1);
      const startTime = new Date(currentLapData.date_start);
      const isCurrentLiveLap = isLive && curLap === maxLap;
      const endTime = nextLapData?.date_start ? new Date(nextLapData.date_start) : new Date(startTime.getTime() + (isCurrentLiveLap ? 180000 : 120000));
      const d = await fetchApi("car_data", {
        session_key: selSess.session_key,
        driver_number: drv,
        "date>": startTime.toISOString(),
        "date<": endTime.toISOString(),
      }, null);
      if (Array.isArray(d)) {
        const sorted = d.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const unique = [];
        let lastTime = 0;
        for (const pt of sorted) {
          const tm = new Date(pt.date).getTime();
          if (tm - lastTime > 100) { unique.push(pt); lastTime = tm; }
        }
        const f = unique.filter((p) => p.speed > 5);
        if (!isCurrentLiveLap) lapDataCache.current[cacheKey] = f;
        setter(f);
      } else setter([]);
    };
    setTelStatus("loading");
    Promise.all([fetchDriverData(selDrv, setCurrentCarData), fetchDriverData(cmpDrv, setCmpCarData)])
      .then(() => setTelStatus("loaded"))
      .catch(() => setTelStatus("error"));
  }, [sessionReady, selDrv, cmpDrv, curLap, laps, selSess, isLive, maxLap]);

  // ── Derived data ────────────────────────────────────────────────────────────
  // Derive positions per lap from laps data (more reliable than posSnaps)
  const posAtLap = useMemo(() => {
    if (!laps.length) return {};

    // Primary: sort by date_start of lap curLap+1 = when drivers crossed the line on lap curLap
    const finishTimes = {};
    laps.forEach((l) => {
      if (l.lap_number === curLap + 1 && l.date_start)
        finishTimes[l.driver_number] = new Date(l.date_start).getTime();
    });

    if (Object.keys(finishTimes).length >= 3) {
      const sorted = Object.entries(finishTimes).sort((a, b) => a[1] - b[1]);
      const pos = {};
      sorted.forEach(([dn], i) => { pos[parseInt(dn)] = i + 1; });
      let nextPos = sorted.length + 1;
      drivers.forEach((d) => { if (!pos[d.driver_number]) pos[d.driver_number] = nextPos++; });
      return pos;
    }

    // Fallback: sort by date_start of lap curLap itself
    const startTimes = {};
    laps.forEach((l) => {
      if (l.lap_number === curLap && l.date_start)
        startTimes[l.driver_number] = new Date(l.date_start).getTime();
    });
    if (Object.keys(startTimes).length >= 3) {
      const sorted = Object.entries(startTimes).sort((a, b) => a[1] - b[1]);
      const pos = {};
      sorted.forEach(([dn], i) => { pos[parseInt(dn)] = i + 1; });
      let nextPos = sorted.length + 1;
      drivers.forEach((d) => { if (!pos[d.driver_number]) pos[d.driver_number] = nextPos++; });
      return pos;
    }

    // Last resort: posSnaps
    if (!posSnaps.length) return {};
    const lapEntries = laps.filter((l) => l.lap_number === curLap && l.date_start);
    if (!lapEntries.length) return posSnaps[posSnaps.length - 1]?.state || {};
    const lapTime = Math.min(...lapEntries.map((l) => new Date(l.date_start).getTime()));
    let best = posSnaps[0]?.state || {};
    for (const s of posSnaps) { if (new Date(s.date).getTime() <= lapTime) best = s.state; else break; }
    return best;
  }, [posSnaps, laps, curLap, drivers]);

  const drvRaceData = useMemo(() => {
    const data = {};
    drivers.forEach((d) => {
      const dn = d.driver_number;
      const drvPits = pits.filter((p) => p.driver_number === dn && p.lap_number <= curLap);
      const drvStints = stints.filter((s) => s.driver_number === dn && s.lap_start <= curLap).sort((a, b) => b.lap_start - a.lap_start);
      let compound = null, age = 0;
      if (drvStints.length > 0) {
        compound = drvStints[0].compound;
        age = Math.max(0, (curLap - drvStints[0].lap_start) + (drvStints[0].tyre_age_at_start || 0));
      }
      data[dn] = { pitCount: drvPits.length, compound, age };
    });
    return data;
  }, [drivers, pits, stints, curLap]);

  const sortedDrv = useMemo(
    () => !drivers.length ? [] : [...drivers].sort((a, b) => (posAtLap[a.driver_number] || 99) - (posAtLap[b.driver_number] || 99)),
    [drivers, posAtLap]
  );

  const driverDots = useMemo(() => {
    if (!trackX.length || !drivers.length) return [];
    const total = drivers.length;
    return drivers.map((d, i) => {
      // Use index+1 as fallback so drivers are spread out even without position data
      const pos = posAtLap[d.driver_number] || (i + 1);
      return { progress: (1 - ((pos - 1) / total) * 0.6) % 1, color: tc(d.team_name), acr: d.name_acronym, dn: d.driver_number };
    });
  }, [trackX, drivers, posAtLap]);

  // ERS segments
  useEffect(() => {
    if (currentCarData.length < 20) { setErsSegs([]); return; }
    const step = Math.max(1, Math.floor(currentCarData.length / 300));
    setErsSegs(currentCarData.filter((_, i) => i % step === 0).map((p, i, arr) => ({ ...p, type: classifyErs(p, arr[i - 1], is26) })));
  }, [currentCarData, is26]);

  // Play/pause lap slider
  useEffect(() => {
    if (play) playRef.current = setInterval(() => setCurLap((l) => { if (l >= maxLap) { setPlay(false); return l; } return l + 1; }), 1500);
    return () => clearInterval(playRef.current);
  }, [play, maxLap]);

  const curLapD = useMemo(() => { const m = new Map(); laps.filter((l) => l.lap_number === curLap).forEach((l) => m.set(l.driver_number, l)); return m; }, [laps, curLap]);
  const curIntv = useMemo(() => { const m = new Map(); intervals.forEach((i) => m.set(i.driver_number, i)); return m; }, [intervals]);

  const radiosExt = useMemo(() => radios.map((r) => {
    const rT = new Date(r.date).getTime();
    const dL = laps.filter((l) => l.driver_number === r.driver_number).sort((a, b) => a.lap_number - b.lap_number);
    let lap = null;
    for (const l of dL) if (l.date_start && new Date(l.date_start).getTime() <= rT) lap = l.lap_number;
    return { ...r, lap };
  }), [radios, laps]);

  const filtRadios = useMemo(() => {
    let f = radiosExt;
    if (rfDrv) f = f.filter((r) => r.driver_number === parseInt(rfDrv));
    if (rfLap) f = f.filter((r) => r.lap === parseInt(rfLap));
    return f;
  }, [radiosExt, rfDrv, rfLap]);

  const curWeather = useMemo(() => {
    if (!weather.length || !laps.length) return null;
    const lapEntries = laps.filter((l) => l.lap_number === curLap && l.date_start);
    if (!lapEntries.length) return weather[weather.length - 1];
    const lapTime = Math.min(...lapEntries.map((l) => new Date(l.date_start).getTime()));
    let best = weather[0];
    for (const w of weather) { if (new Date(w.date).getTime() <= lapTime) best = w; else break; }
    return best;
  }, [weather, laps, curLap]);

  const bestSectors = useMemo(() => {
    let s1 = 999, s2 = 999, s3 = 999, lap = 9999;
    laps.forEach((l) => {
      if (l.duration_sector_1 && l.duration_sector_1 < s1) s1 = l.duration_sector_1;
      if (l.duration_sector_2 && l.duration_sector_2 < s2) s2 = l.duration_sector_2;
      if (l.duration_sector_3 && l.duration_sector_3 < s3) s3 = l.duration_sector_3;
      if (l.lap_duration && l.lap_duration < lap) lap = l.lap_duration;
    });
    return { s1, s2, s3, lap };
  }, [laps]);

  const lapSC = useMemo(() => {
    const lap = laps.find((l) => l.lap_number === curLap && l.driver_number === selDrv);
    if (!lap || !lap.date_start) return null;
    const lStart = new Date(lap.date_start).getTime();
    const lEnd = lStart + (lap.lap_duration * 1000 || 120000);
    const scMsg = rCtrl.find((m) => {
      const mTime = new Date(m.date).getTime();
      return mTime >= lStart && mTime <= lEnd && (m.message.includes("SAFETY CAR") || m.message.includes("VSC"));
    });
    return scMsg ? scMsg.message : null;
  }, [curLap, selDrv, laps, rCtrl]);

  const getErsVal = (cur, prev) => {
    const tp = classifyErs(cur, prev, is26);
    if (tp === "harvest" || tp === "superclip") return 100;
    if (tp === "clip") return 80;
    if (tp === "deploy") return -100;
    return 0;
  };

  const telChart = useMemo(() => {
    if (!currentCarData.length) return [];
    const d1 = currentCarData, d2 = cmpCarData || [];
    const res = [];
    for (let i = 0; i < 200; i++) {
      const i1 = Math.floor((i / 199) * (d1.length - 1));
      const p1 = d1[i1];
      if (!p1) continue;
      const pt = { i, speed1: p1.speed, throttle1: p1.throttle, brake1: p1.brake, gear1: p1.n_gear, ers1: getErsVal(p1, d1[i1 - 1]) };
      if (d2.length) {
        const i2 = Math.floor((i / 199) * (d2.length - 1));
        const p2 = d2[i2];
        if (p2) {
          pt.speed2 = p2.speed; pt.throttle2 = p2.throttle; pt.brake2 = p2.brake;
          pt.gear2 = p2.n_gear; pt.ers2 = getErsVal(p2, d2[i2 - 1]);
          pt.delta = pt.speed1 - pt.speed2;
        }
      }
      res.push(pt);
    }
    return res;
  }, [currentCarData, cmpCarData, is26]);

  const selDrvObj = drivers.find((d) => d.driver_number === selDrv);
  const cmpDrvObj = drivers.find((d) => d.driver_number === cmpDrv);
  const c1 = selDrvObj ? tc(selDrvObj.team_name) : "#00D4FF";
  let c2 = cmpDrvObj ? tc(cmpDrvObj.team_name) : "#FF8C00";
  if (c1 === c2) c2 = "#ffffff";

  // Prevent same-driver VS selection
  const handleDriverSelect = (dn) => { setSelDrv(dn); if (cmpDrv === dn) setCmpDrv(null); };

  const selLapData = laps.find((l) => l.driver_number === selDrv && l.lap_number === curLap) || {};
  const cmpLapData = cmpDrv ? laps.find((l) => l.driver_number === cmpDrv && l.lap_number === curLap) || {} : null;
  const s1Ratio = selLapData.lap_duration ? selLapData.duration_sector_1 / selLapData.lap_duration : 0.33;
  const s2Ratio = selLapData.lap_duration ? (selLapData.duration_sector_1 + selLapData.duration_sector_2) / selLapData.lap_duration : 0.66;

  const ss = { background: "#141414", color: "#aaa", border: "1px solid #1e1e1e", borderRadius: 4, padding: "4px 8px", fontSize: 10, fontFamily: "var(--f)", outline: "none" };

  const gridStyle = isMobile
    ? { display: "flex", flexDirection: "column", height: "auto", minHeight: "100vh" }
    : { display: "grid", gridTemplateColumns: "220px 1fr 340px", gridTemplateRows: "44px 1fr", gridTemplateAreas: `"header header header" "sidebar main rightpanel"`, height: "100vh", overflow: "hidden" };

  return (
    <div style={{ "--f": "'JetBrains Mono','SF Mono','Fira Code',monospace", background: "#0a0a0a", color: "#eee", fontFamily: "var(--f)", ...gridStyle }}>

      {/* ── HEADER ── */}
      <header style={{ gridArea: "header", padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #181818", background: "#0d0d0d", flexWrap: "wrap", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 3, height: 22, background: "#E8002D", borderRadius: 2 }} />
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>F1<span style={{ color: "#E8002D" }}>COCKPIT</span></div>
        </div>
        <div style={{ display: "flex", gap: 6, flex: 1, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} style={{ background: "#1a1a1a", border: "1px solid #333", color: "#ccc", padding: "4px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{lang.toUpperCase()}</button>
          <button onClick={() => setIsLive(!isLive)} style={{ background: isLive ? "#2a0a0a" : "#1a1a1a", border: `1px solid ${isLive ? "#E8002D" : "#333"}`, color: isLive ? "#E8002D" : "#666", padding: "4px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            {isLive && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8002D", animation: "pulse 1.5s infinite" }} />}
            {t("live")}
          </button>
          <select value={year} onChange={(e) => { setYear(+e.target.value); setSelMeet(null); setSelSess(null); }} style={{ ...ss, width: 68 }}>
            {[2026, 2025, 2024, 2023].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={selMeet?.meeting_key || ""} onChange={(e) => { setSelMeet(meetings.find((m) => m.meeting_key === +e.target.value) || null); setSelSess(null); }} style={{ ...ss, minWidth: 140, maxWidth: 200 }}>
            <option value="">Grand Prix...</option>
            {meetings.map((m) => <option key={m.meeting_key} value={m.meeting_key}>{m.meeting_name}</option>)}
          </select>
          <select value={selSess?.session_key || ""} onChange={(e) => setSelSess(sessions.find((s) => s.session_key === +e.target.value) || null)} style={{ ...ss, width: 110 }}>
            <option value="">Session...</option>
            {sessions.map((s) => <option key={s.session_key} value={s.session_key}>{s.session_name}</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 3, background: apiOk === "OK" ? "#0a200a" : "#200a0a" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: apiOk === "OK" ? "#0a0" : apiOk === "ERR" ? "#a00" : "#aa0", animation: apiOk === "..." ? "pulse 1s infinite" : "none" }} />
          </div>
        </div>
      </header>

      {/* ── SIDEBAR ── */}
      <div style={{ gridArea: "sidebar", borderRight: isMobile ? "none" : "1px solid #131313", borderBottom: isMobile ? "1px solid #181818" : "none", maxHeight: isMobile ? "220px" : "auto", overflow: "auto", background: "#0c0c0c" }}>
        <Sidebar curLap={curLap} sortedDrv={sortedDrv} posAtLap={posAtLap} selDrv={selDrv} cmpDrv={cmpDrv} setSelDrv={handleDriverSelect} setCmpDrv={setCmpDrv} curLapD={curLapD} curIntv={curIntv} drvRaceData={drvRaceData} t={t} />
      </div>

      {/* ── MAIN (TrackMap + Telemetry) ── */}
      <div style={{ gridArea: "main", display: "grid", gridTemplateRows: isMobile ? "auto 360px" : "1fr 400px", overflow: "hidden", minHeight: 0 }}>
        <div style={{ position: "relative", background: "#0e0e0e", minHeight: 0, overflow: "hidden" }}>
          <TrackMap
            trackX={trackX} trackY={trackY} corners={corners} ersSegs={ersSegs}
            currentLap={curLap} driverDots={driverDots} selDrv={selDrv} cmpDrv={cmpDrv}
            onSelect={handleDriverSelect} telChart={telChart} c1={c1} c2={c2}
            selDrvObj={selDrvObj} cmpDrvObj={cmpDrvObj} hoveredIndex={hoveredIndex}
            s1Ratio={s1Ratio} s2Ratio={s2Ratio} t={t}
            mapMetric={mapMetric} setMapMetric={setMapMetric}
          />
          {/* Lap slider */}
          <div style={{ position: "absolute", bottom: 8, left: 12, right: 12, display: "flex", gap: 6 }}>
            {maxLap > 1 && (
              <div style={{ flex: 1, background: "#0e0e0ecc", backdropFilter: "blur(6px)", borderRadius: 6, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6, border: "1px solid #1c1c1c" }}>
                <button onClick={() => setPlay(!play)} style={{ background: play ? "#E8002D" : "#1c1c1c", color: "#fff", border: "none", borderRadius: 3, width: 26, height: 22, cursor: "pointer", fontSize: 10 }}>{play ? "⏸" : "▶"}</button>
                <input type="range" min={1} max={maxLap} value={curLap} onChange={(e) => { setCurLap(+e.target.value); setPlay(false); }} style={{ flex: 1, accentColor: "#E8002D" }} />
                <span style={{ fontSize: 9, color: "#555", minWidth: 44, textAlign: "right" }}>{curLap}/{maxLap}</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          <Telemetry
            curLap={curLap} is26={is26} selDrvObj={selDrvObj} cmpDrvObj={cmpDrvObj}
            c1={c1} c2={c2} cmpDrv={cmpDrv} telStatus={telStatus} telChart={telChart}
            setHoveredIndex={setHoveredIndex} selLapData={selLapData} cmpLapData={cmpLapData}
            s1Ratio={s1Ratio} s2Ratio={s2Ratio} t={t} lapSC={lapSC}
          />
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ gridArea: "rightpanel", borderLeft: isMobile ? "none" : "1px solid #131313", height: isMobile ? "auto" : "100%", overflow: "hidden" }}>
        <RightPanel
          tab={tab} setTab={setTab} filtRadios={filtRadios} rCtrl={rCtrl}
          weather={weather} curWeather={curWeather} drivers={drivers} maxLap={maxLap}
          rfDrv={rfDrv} setRfDrv={setRfDrv} rfLap={rfLap} setRfLap={setRfLap}
          ss={ss} t={t} lang={lang} pits={pits} stints={stints} selDrv={selDrv} cmpDrv={cmpDrv}
          laps={laps} bestSectors={bestSectors} standings={standings} curLap={curLap}
        />
      </div>
    </div>
  );
}