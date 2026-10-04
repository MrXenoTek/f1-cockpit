import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { tc, fetchApi, classifyErs, fetchStandings, apiIssue, resetApiIssue, loadCircuitInfo, circuitInfoUrl } from "./api";
import { alignTelemetry, lapAnchors, outlineFromLocation } from "./telemetryMath";
import { meetingLabel, sessionLabel, findAlternatives } from "./meetings";
import TrackMap from "./components/TrackMap";
import Sidebar from "./components/Sidebar";
import Telemetry from "./components/Telemetry";
import RightPanel from "./components/RightPanel";
import Incident from "./components/Incident";
import DataNotice from "./components/DataNotice";
import Icon, { PlayIcon } from "./components/Icon";
import { C, FONT_UI, iconBtn, btn, segWrap, seg } from "./theme";

const DICT = {
  fr: {
    weather: "Météo", radio: "Radio", ctrl: "Direction", pits: "Stands",
    timing: "Temps", speed: "Vitesse", throttle: "Accélérateur", brake: "Frein",
    gear: "Rapport", ers: "ERS", live: "Direct", replay: "Replay", ranking: "Classement", lap: "Tour",
    dom: "Domination", ers_state: "Mode ERS", faster: "plus rapide",
    deploy: "Déploiement", harvest: "Récolte", clip: "Clipping",
    superclip: "Super clip", coast: "Lift & coast", tel: "Télémétrie", champ: "Championnat",
    analysis: "Analyse", strategy: "Stratégie", comms: "Comms", conditions: "Conditions",
    leader: "Leader", lapsShort: "t.", posShort: "Pos", driver: "Pilote", tyre: "Pneu", gap: "Interv.",
    selectA: "définir comme pilote A", compareB: "Comparer en B", stopCompare: "Arrêter la comparaison",
    emptyStandings: "Choisissez une saison, un Grand Prix et une session pour charger le classement.",
    season: "Saison", gp: "Grand Prix", session: "Session", share: "Partager", shortcuts: "Raccourcis clavier",
    prevLap: "Tour précédent", nextLap: "Tour suivant", play: "Lecture", pause: "Pause",
    connected: "Données connectées", connecting: "Connexion…", offline: "API indisponible",
    track: "Circuit", fullscreen: "Plein écran", exitFs: "Quitter le plein écran", sc: "Safety car", pitA: "Arrêt A", pitB: "Arrêt B",
    speedX: "Vitesse de lecture", lapOf: "sur",
    brakeZones: "Freinages", activeAero: "Aéro active", animateLap: "Animer le tour", stopLap: "Arrêter",
  },
  en: {
    weather: "Weather", radio: "Radio", ctrl: "Race control", pits: "Pit stops",
    timing: "Timing", speed: "Speed", throttle: "Throttle", brake: "Brake",
    gear: "Gear", ers: "ERS", live: "Live", replay: "Replay", ranking: "Standings", lap: "Lap",
    dom: "Domination", ers_state: "ERS mode", faster: "faster",
    deploy: "Deploy", harvest: "Harvest", clip: "Clipping",
    superclip: "Super clip", coast: "Lift & coast", tel: "Telemetry", champ: "Championship",
    analysis: "Analysis", strategy: "Strategy", comms: "Comms", conditions: "Conditions",
    leader: "Leader", lapsShort: "laps", posShort: "Pos", driver: "Driver", tyre: "Tyre", gap: "Interval",
    selectA: "set as driver A", compareB: "Compare as B", stopCompare: "Stop comparing",
    emptyStandings: "Pick a season, Grand Prix and session to load the standings.",
    season: "Season", gp: "Grand Prix", session: "Session", share: "Share", shortcuts: "Keyboard shortcuts",
    prevLap: "Previous lap", nextLap: "Next lap", play: "Play", pause: "Pause",
    connected: "Data connected", connecting: "Connecting…", offline: "API unavailable",
    track: "Track", fullscreen: "Full screen", exitFs: "Exit full screen", sc: "Safety car", pitA: "Pit A", pitB: "Pit B",
    speedX: "Playback speed", lapOf: "of",
    brakeZones: "Brake zones", activeAero: "Active aero", animateLap: "Animate lap", stopLap: "Stop",
  },
};

const srOnly = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" };

// Header session picker: a native select styled as one segment of the breadcrumb
function Picker({ label, value, onChange, children, minW, isMobile }) {
  return (
    <label style={{ position: "relative", display: "flex", alignItems: "center", borderRadius: 7, background: value ? C.raised : "transparent", minWidth: minW, flex: isMobile ? "1 1 auto" : "0 1 auto" }}>
      <span style={srOnly}>{label}</span>
      <select value={value} onChange={onChange} style={{ appearance: "none", WebkitAppearance: "none", background: "transparent", color: value ? C.text : C.text2, border: "none", borderRadius: 7, height: 36, padding: "0 30px 0 12px", fontSize: 14, fontWeight: 600, fontFamily: FONT_UI, width: "100%", maxWidth: isMobile ? "100%" : 260, textOverflow: "ellipsis" }}>{children}</select>
      <span style={{ position: "absolute", right: 10, pointerEvents: "none", color: C.text2, display: "flex" }}><Icon name="chevron" size={14} /></span>
    </label>
  );
}

let toastIdCounter = 0;

// Only sessions that ended over an hour ago are immutable enough to cache forever
const isFinished = (sess) => !!sess?.date_end && Date.now() > new Date(sess.date_end).getTime() + 3600000;

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
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [lang, setLang] = useState("fr");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [mapMetric, setMapMetric] = useState("speed");
  const [toasts, setToasts] = useState([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [dataIssue, setDataIssue] = useState(null); // {status} when the selected session came back empty
  const [incident, setIncident] = useState(null); // null = closed, {} = open, {evt} = open on that flag
  const prevRCtrlLen = useRef(0);
  const t = (k) => DICT[lang][k] || k;

  const playRef = useRef(null);
  const curLapRef = useRef(1);
  const maxLapRef = useRef(1);
  const [logs, setLogs] = useState([]);
  const [apiOk, setApiOk] = useState("...");
  const [year, setYear] = useState(2026);
  const is26 = year >= 2026;
  const log = useCallback((m) => setLogs((p) => [...p.slice(-60), { t: new Date().toLocaleTimeString("fr-FR"), m }]), []);

  // Inject CSS keyframes once
  useEffect(() => {
    const styleId = "f1-cockpit-keyframes";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      @keyframes slideInRight {
        from { transform: translateX(110%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }, []);

  const addToast = useCallback((msg, type = "info") => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev.slice(-3), { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((to) => to.id !== id)), 5000);
  }, []);

  // Detect new rCtrl messages when live
  useEffect(() => {
    if (!isLive || !rCtrl.length) {
      prevRCtrlLen.current = rCtrl.length;
      return;
    }
    const newMsgs = rCtrl.slice(prevRCtrlLen.current);
    prevRCtrlLen.current = rCtrl.length;
    newMsgs.forEach((m) => {
      const msg = m.message || "";
      if (msg.includes("SAFETY CAR")) addToast(msg, "warning");
      else if (msg.includes("VSC") || msg.includes("VIRTUAL SAFETY CAR")) addToast(msg, "warning");
      else if (msg.includes("RED FLAG") || m.flag === "RED") addToast(msg, "danger");
    });
  }, [rCtrl, isLive, addToast]);

  useEffect(() => { curLapRef.current = curLap; }, [curLap]);
  useEffect(() => { maxLapRef.current = maxLap; }, [maxLap]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "?") { e.preventDefault(); setShowShortcuts((p) => !p); return; }
      if (e.code === "Escape") { setShowShortcuts(false); setIsMapFullscreen(false); return; }
      if (e.code === "Space") { e.preventDefault(); setPlay((p) => !p); }
      if (e.code === "ArrowLeft") { e.preventDefault(); setCurLap((l) => Math.max(1, l - 1)); }
      if (e.code === "ArrowRight") { e.preventDefault(); setCurLap((l) => Math.min(maxLap, l + 1)); }
    };
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("keydown", handleKeyDown); window.removeEventListener("resize", handleResize); };
  }, [maxLap]);

  useEffect(() => {
    setApiOk("..."); setMeetings([]); setStandings([]);
    fetchApi("meetings", { year }, log).then((d) => {
      if (!d || !Array.isArray(d)) { setApiOk("ERR"); return; }
      setApiOk("OK");
      setMeetings(d.filter((m) => !m.meeting_name?.includes("Testing")).sort((a, b) => new Date(b.date_start) - new Date(a.date_start)));
    });
    fetchStandings(year).then((d) => setStandings(d));
  }, [year, log]);

  useEffect(() => {
    if (!selMeet) return;
    setSessions([]); setSelSess(null);
    fetchApi("sessions", { meeting_key: selMeet.meeting_key }, log).then((d) => Array.isArray(d) && setSessions(d));
  }, [selMeet, log]);

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
      prevRCtrlLen.current = 0;
      setDataIssue(null); resetApiIssue();
    }
    try {
      const lg = isInitial ? log : null;
      const copts = { cache: !isLive && isFinished(selSess) };
      const get = (path) => fetchApi(path, { session_key: sk }, lg, 4, copts);
      const [drv, ld, pos, st, pt, iv, rad, rc, wx] = await Promise.all([
        get("drivers"), get("laps"), get("position"), get("stints"), get("pit"),
        get("intervals"), get("team_radio"), get("race_control"), get("weather"),
      ]);
      if (isInitial) {
        const noData = !(Array.isArray(drv) && drv.length) && !(Array.isArray(ld) && ld.length);
        setDataIssue(noData ? { status: apiIssue.status } : null);
        let trackOk = false;
        const circuitUrl = noData ? null : circuitInfoUrl(selMeet);
        if (circuitUrl) {
          const c = await loadCircuitInfo(circuitUrl, lg);
          if (c) { setTrackX(c.info.x); setTrackY(c.info.y); setCorners(c.info.corners || []); trackOk = true; }
        }
        // no layout for this circuit/year: draw it from one lap of GPS positions
        if (!noData && !trackOk && Array.isArray(ld)) {
          const best = ld.filter((l) => l.lap_duration && l.date_start && l.lap_number > 1 && !l.is_pit_out_lap).sort((a, b) => a.lap_duration - b.lap_duration)[0];
          if (best) {
            const t0 = new Date(best.date_start).getTime();
            const loc = await fetchApi("location", { session_key: sk, driver_number: best.driver_number, "date>": new Date(t0).toISOString(), "date<": new Date(t0 + best.lap_duration * 1000).toISOString() }, lg, 4, copts);
            const o = outlineFromLocation(loc);
            if (o) { setTrackX(o.x); setTrackY(o.y); setCorners([]); }
          }
        }
      }
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

  useEffect(() => {
    if (!isLive || !sessionReady) return;
    const interval = setInterval(() => loadSessionAggregateData(false), 15000);
    return () => clearInterval(interval);
  }, [isLive, sessionReady, loadSessionAggregateData]);

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
      }, null, 4, { cache: !isLive && isFinished(selSess) });
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

  const posAtLap = useMemo(() => {
    if (!laps.length) return {};
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
      const pos = posAtLap[d.driver_number] || (i + 1);
      return { progress: (1 - ((pos - 1) / total) * 0.6) % 1, color: tc(d.team_name), acr: d.name_acronym, dn: d.driver_number };
    });
  }, [trackX, drivers, posAtLap]);

  useEffect(() => {
    if (currentCarData.length < 20) { setErsSegs([]); return; }
    const step = Math.max(1, Math.floor(currentCarData.length / 300));
    setErsSegs(currentCarData.filter((_, i) => i % step === 0).map((p, i, arr) => ({ ...p, type: classifyErs(p, arr[i - 1], is26) })));
  }, [currentCarData, is26]);

  useEffect(() => {
    if (play) playRef.current = setInterval(() => setCurLap((l) => { if (l >= maxLap) { setPlay(false); return l; } return l + 1; }), 1500 / playSpeed);
    return () => clearInterval(playRef.current);
  }, [play, maxLap, playSpeed]);

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

  // Overtakes per lap: count drivers who gained position vs previous lap
  const overtakesPerLap = useMemo(() => {
    if (!laps.length || !drivers.length) return [];
    const result = [];
    const getPosFromStartTimes = (ln) => {
      const startTimes = {};
      laps.forEach((l) => {
        if (l.lap_number === ln && l.date_start)
          startTimes[l.driver_number] = new Date(l.date_start).getTime();
      });
      if (Object.keys(startTimes).length < 3) return null;
      const sorted = Object.entries(startTimes).sort((a, b) => a[1] - b[1]);
      const pos = {};
      sorted.forEach(([dn], i) => { pos[parseInt(dn)] = i + 1; });
      return pos;
    };
    for (let lapNum = 2; lapNum <= maxLap; lapNum++) {
      const prevPos = getPosFromStartTimes(lapNum - 1);
      const curPos = getPosFromStartTimes(lapNum);
      if (!prevPos || !curPos) { result.push({ lap: lapNum, count: 0 }); continue; }
      let count = 0;
      drivers.forEach((d) => {
        const dn = d.driver_number;
        if (prevPos[dn] && curPos[dn] && curPos[dn] < prevPos[dn]) count++;
      });
      result.push({ lap: lapNum, count });
    }
    return result;
  }, [laps, drivers, maxLap]);

  // Gap to leader for selDrv (and cmpDrv) per lap
  const gapData = useMemo(() => {
    if (!laps.length || !selDrv) return [];
    const result = [];
    for (let lapNum = 1; lapNum < maxLap; lapNum++) {
      const nextLapStarts = {};
      laps.forEach((l) => {
        if (l.lap_number === lapNum + 1 && l.date_start)
          nextLapStarts[l.driver_number] = new Date(l.date_start).getTime();
      });
      if (Object.keys(nextLapStarts).length < 3) continue;
      const sorted = Object.entries(nextLapStarts).sort((a, b) => a[1] - b[1]);
      const leaderTime = sorted[0][1];
      const selTime = nextLapStarts[selDrv];
      const cmpTime = cmpDrv ? nextLapStarts[cmpDrv] : undefined;
      const pt = { lap: lapNum };
      if (selTime != null) pt.gap1 = parseFloat(((selTime - leaderTime) / 1000).toFixed(3));
      if (cmpTime != null) pt.gap2 = parseFloat(((cmpTime - leaderTime) / 1000).toFixed(3));
      if (pt.gap1 != null || pt.gap2 != null) result.push(pt);
    }
    return result;
  }, [laps, selDrv, cmpDrv, maxLap]);

  const getErsVal = (cur, prev) => {
    const tp = classifyErs(cur, prev, is26);
    if (tp === "harvest" || tp === "superclip") return 100;
    if (tp === "clip") return 80;
    if (tp === "deploy") return -100;
    return 0;
  };

  // Both drivers' laps on one *distance* axis (anchored on the finish line and the timing
  // loops), so index i means the same place on track for A and B. null → fall back to
  // lap-fraction alignment (live lap in progress, or a lap without sector times).
  const aligned = useMemo(() => {
    if (!currentCarData.length) return null;
    const mk = (dn, rows) => {
      if (!dn || !rows?.length) return null;
      const a = lapAnchors(laps.filter((l) => l.driver_number === dn), curLap);
      return a ? { rows, anchors: a.anchors } : null;
    };
    const l1 = mk(selDrv, currentCarData);
    if (!l1) return null;
    const al = alignTelemetry([l1, cmpDrv ? mk(cmpDrv, cmpCarData) : null], 200);
    return al?.series[0] ? al : null;
  }, [currentCarData, cmpCarData, laps, selDrv, cmpDrv, curLap]);

  const telChart = useMemo(() => {
    if (!currentCarData.length) return [];
    if (aligned) {
      const [r1, r2] = aligned.series;
      const g = (cur, prev) => {
        const dt = cur.sec - prev.sec;
        return dt > 0.01 ? Math.max(-5, Math.min(5, (((cur.speed - prev.speed) / 3.6) / dt) / 9.81)) : 0;
      };
      const res = [];
      for (let i = 0; i < aligned.n; i++) {
        const p1 = r1[i];
        if (!p1 || p1.speed === null) continue;
        const prev1 = r1[i - 1]?.speed !== null ? r1[i - 1] : null;
        const pt = { i, d: Math.round(p1.d), speed1: p1.speed, throttle1: p1.throttle, brake1: p1.brake, gear1: p1.gear, ers1: getErsVal(p1, prev1), gLong1: prev1 ? g(p1, prev1) : 0, sec1: p1.sec };
        const p2 = r2?.[i];
        if (p2 && p2.speed !== null) {
          const prev2 = r2[i - 1]?.speed !== null ? r2[i - 1] : null;
          pt.speed2 = p2.speed; pt.throttle2 = p2.throttle; pt.brake2 = p2.brake; pt.gear2 = p2.gear;
          pt.ers2 = getErsVal(p2, prev2); pt.gLong2 = prev2 ? g(p2, prev2) : 0; pt.sec2 = p2.sec;
          pt.delta = pt.speed1 - pt.speed2;
          pt.gapT = pt.sec1 - pt.sec2; // >0: A reaches this point later than B
        }
        res.push(pt);
      }
      return res;
    }
    const d1 = currentCarData, d2 = cmpCarData || [];
    const lapData = laps.find((l) => l.driver_number === selDrv && l.lap_number === curLap);
    const dt = (lapData?.lap_duration || 90) / 199; // seconds per sample
    const res = [];
    for (let i = 0; i < 200; i++) {
      const i1 = Math.floor((i / 199) * (d1.length - 1));
      const p1 = d1[i1];
      if (!p1) continue;
      const prevP1 = d1[Math.max(0, i1 - 1)];
      const dv1 = ((p1.speed - (prevP1?.speed ?? p1.speed)) * 1000) / 3600; // m/s
      const gLong1 = Math.max(-5, Math.min(5, dv1 / (dt * 9.81)));
      const pt = { i, speed1: p1.speed, throttle1: p1.throttle, brake1: p1.brake, gear1: p1.n_gear, ers1: getErsVal(p1, d1[i1 - 1]), gLong1 };
      if (d2.length) {
        const i2 = Math.floor((i / 199) * (d2.length - 1));
        const p2 = d2[i2];
        if (p2) {
          const prevP2 = d2[Math.max(0, i2 - 1)];
          const dv2 = ((p2.speed - (prevP2?.speed ?? p2.speed)) * 1000) / 3600;
          pt.speed2 = p2.speed; pt.throttle2 = p2.throttle; pt.brake2 = p2.brake;
          pt.gear2 = p2.n_gear; pt.ers2 = getErsVal(p2, d2[i2 - 1]);
          pt.delta = pt.speed1 - pt.speed2;
          pt.gLong2 = Math.max(-5, Math.min(5, dv2 / (dt * 9.81)));
        }
      }
      res.push(pt);
    }
    return res;
  }, [aligned, currentCarData, cmpCarData, is26, laps, selDrv, curLap]);

  // Corner apex speeds — maps each corner to the minimum speed in that track zone
  const cornerSpeeds = useMemo(() => {
    if (!corners.length || !trackX.length || !currentCarData.length) return [];
    // cumulative arc length of the track outline: a corner's share of the lap
    // distance, instead of its point index (outline points are not evenly spaced)
    const cum = [0];
    for (let i = 1; i < trackX.length; i++) cum.push(cum[i - 1] + Math.hypot(trackX[i] - trackX[i - 1], trackY[i] - trackY[i - 1]));
    const arcTotal = cum[cum.length - 1] || 1;
    const apexAligned = (rows, frac) => {
      const c = frac * aligned.total;
      const v = rows.filter((r) => r.speed !== null && r.speed > 30 && Math.abs(r.d - c) <= 100).map((r) => r.speed);
      return v.length ? Math.round(Math.min(...v)) : null;
    };
    const apexLegacy = (data, progress) => {
      if (!data.length) return null;
      const idx = Math.floor(progress * data.length);
      const win = Math.max(6, Math.floor(data.length * 0.03));
      const chunk = data.slice(Math.max(0, idx - win), Math.min(data.length, idx + win)).filter((p) => p.speed > 30);
      return chunk.length ? Math.round(Math.min(...chunk.map((p) => p.speed))) : null;
    };
    return corners.map((corner) => {
      const cx = corner.trackPosition.x, cy = corner.trackPosition.y;
      let minDist = Infinity, nearestIdx = 0;
      for (let i = 0; i < trackX.length; i++) {
        const d = Math.hypot(trackX[i] - cx, trackY[i] - cy);
        if (d < minDist) { minDist = d; nearestIdx = i; }
      }
      if (aligned) {
        const frac = cum[nearestIdx] / arcTotal;
        return { number: corner.number, speed1: apexAligned(aligned.series[0], frac), speed2: aligned.series[1] ? apexAligned(aligned.series[1], frac) : null };
      }
      const progress = nearestIdx / trackX.length;
      return { number: corner.number, speed1: apexLegacy(currentCarData, progress), speed2: cmpCarData.length ? apexLegacy(cmpCarData, progress) : null };
    }).filter((c) => c.speed1 !== null);
  }, [corners, trackX, trackY, currentCarData, cmpCarData, aligned]);

  const selDrvObj = drivers.find((d) => d.driver_number === selDrv);
  const cmpDrvObj = drivers.find((d) => d.driver_number === cmpDrv);
  // Fixed A/B colors: the selected driver is always blue, the compared one always amber.
  const c1 = C.a;
  const c2 = C.b;

  const handleDriverSelect = (dn) => { setSelDrv(dn); if (cmpDrv === dn) setCmpDrv(null); };

  const selLapData = laps.find((l) => l.driver_number === selDrv && l.lap_number === curLap) || {};
  const cmpLapData = cmpDrv ? laps.find((l) => l.driver_number === cmpDrv && l.lap_number === curLap) || {} : null;
  const s1Ratio = aligned?.fractions ? aligned.fractions[0] : selLapData.lap_duration ? selLapData.duration_sector_1 / selLapData.lap_duration : 0.33;
  const s2Ratio = aligned?.fractions ? aligned.fractions[1] : selLapData.lap_duration ? (selLapData.duration_sector_1 + selLapData.duration_sector_2) / selLapData.lap_duration : 0.66;

  const copyLink = useCallback(() => {
    const params = new URLSearchParams();
    if (year) params.set("y", year);
    if (selMeet?.meeting_key) params.set("m", selMeet.meeting_key);
    if (selSess?.session_key) params.set("s", selSess.session_key);
    if (selDrv) params.set("d", selDrv);
    if (curLap > 1) params.set("l", curLap);
    const url = `${window.location.origin}${window.location.pathname}#${params.toString()}`;
    navigator.clipboard.writeText(url).then(
      () => addToast(lang === "fr" ? "Lien copié" : "Link copied", "success"),
      () => addToast("Failed to copy", "danger")
    );
  }, [year, selMeet, selSess, selDrv, curLap, addToast, lang]);

  const curLapOvertakes = useMemo(() => {
    const entry = overtakesPerLap.find((o) => o.lap === curLap);
    return entry?.count || 0;
  }, [overtakesPerLap, curLap]);


  // Timeline markers for the playback bar
  const scLaps = useMemo(() => {
    const set = new Set();
    rCtrl.forEach((m) => {
      const msg = m.message || "";
      if (m.lap_number && (msg.includes("SAFETY CAR") || msg.includes("VSC"))) set.add(m.lap_number);
    });
    return [...set];
  }, [rCtrl]);
  const pitLapsA = useMemo(() => pits.filter((p) => p.driver_number === selDrv).map((p) => p.lap_number), [pits, selDrv]);
  const pitLapsB = useMemo(() => (cmpDrv ? pits.filter((p) => p.driver_number === cmpDrv).map((p) => p.lap_number) : []), [pits, cmpDrv]);
  const lapPct = (l) => (maxLap > 1 ? ((l - 1) / (maxLap - 1)) * 100 : 0);

  const ss = { background: C.raised, color: C.text, border: `1px solid ${C.lineStrong}`, borderRadius: 8, padding: "0 10px", height: 36, fontSize: 13, fontFamily: FONT_UI };

  const gridStyle = isMobile
    ? { display: "flex", flexDirection: "column", minHeight: "100vh" }
    : { display: "grid", gridTemplateColumns: "320px minmax(0,1fr) 380px", gridTemplateRows: "60px minmax(0,1fr) 72px", gridTemplateAreas: `"header header header" "sidebar main rightpanel" "footer footer footer"`, height: "100vh", overflow: "hidden" };

  const TOAST_BG = { info: C.aBg, warning: C.bBg, danger: "#2E1218", success: C.greenBg };
  const TOAST_BD = { info: C.a, warning: C.b, danger: C.red, success: C.green };

  const SHORTCUTS = [
    { key: "Space", desc: lang === "fr" ? "Lecture / Pause" : "Play / Pause" },
    { key: "←", desc: t("prevLap") },
    { key: "→", desc: t("nextLap") },
    { key: "?", desc: t("shortcuts") },
    { key: "Esc", desc: lang === "fr" ? "Fermer les overlays" : "Close overlays" },
  ];

  const apiLabel = apiOk === "OK" ? t("connected") : apiOk === "ERR" ? t("offline") : t("connecting");
  const apiColor = apiOk === "OK" ? C.green : apiOk === "ERR" ? C.red : C.b;

  const trackMapProps = {
    trackX, trackY, corners, ersSegs, currentLap: curLap, driverDots, selDrv, cmpDrv,
    onSelect: handleDriverSelect, telChart, c1, c2, selDrvObj, cmpDrvObj, hoveredIndex,
    s1Ratio, s2Ratio, t, mapMetric, setMapMetric, currentCarData,
  };

  return (
    <div style={{ "--f": FONT_UI, background: C.bg, color: C.text, fontFamily: FONT_UI, fontSize: 14, ...gridStyle }}>
      <header style={{ gridArea: "header", padding: isMobile ? "10px 12px" : "0 20px", display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, borderBottom: `1px solid ${C.line}`, background: C.panel, flexWrap: isMobile ? "wrap" : "nowrap", zIndex: 10, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, width: isMobile ? "auto" : 284 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="1" y="1" width="26" height="26" rx="7" fill="#E8002D" /><path d="M8 19 L13 9 H21 M10.5 14 H18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h1 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.04em" }}>F1 Cockpit</h1>
        </div>

        <nav aria-label={t("session")} style={{ display: "flex", alignItems: "center", gap: 4, padding: 4, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 10, minWidth: 0, order: isMobile ? 5 : 0, width: isMobile ? "100%" : "auto" }}>
          <Picker isMobile={isMobile} label={t("season")} value={year} onChange={(e) => { setYear(+e.target.value); setSelMeet(null); setSelSess(null); }} minW={84}>
            {[2026, 2025, 2024, 2023].map((y) => <option key={y} value={y}>{y}</option>)}
          </Picker>
          <span aria-hidden="true" style={{ color: "#4A515C" }}>/</span>
          <Picker isMobile={isMobile} label={t("gp")} value={selMeet?.meeting_key || ""} onChange={(e) => { setSelMeet(meetings.find((m) => m.meeting_key === +e.target.value) || null); setSelSess(null); }} minW={150}>
            <option value="">{t("gp")}…</option>
            {meetings.map((m) => <option key={m.meeting_key} value={m.meeting_key}>{meetingLabel(m, lang)}</option>)}
          </Picker>
          <span aria-hidden="true" style={{ color: "#4A515C" }}>/</span>
          <Picker isMobile={isMobile} label={t("session")} value={selSess?.session_key || ""} onChange={(e) => setSelSess(sessions.find((s) => s.session_key === +e.target.value) || null)} minW={110}>
            <option value="">{t("session")}…</option>
            {sessions.map((s) => <option key={s.session_key} value={s.session_key}>{sessionLabel(s, lang)}</option>)}
          </Picker>
        </nav>

        <div style={{ flex: 1 }} />

        {loading && <span style={{ fontSize: 13, color: C.text2 }} role="status">{lang === "fr" ? "Chargement…" : "Loading…"}</span>}
        {!isMobile && (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, color: C.text2, fontSize: 13, whiteSpace: "nowrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: apiColor, animation: apiOk === "..." ? "pulse 1s infinite" : "none" }} />
            {apiLabel}
          </div>
        )}

        <div role="group" aria-label="Mode" style={segWrap}>
          <button aria-pressed={!isLive} onClick={() => setIsLive(false)} style={seg(!isLive)}>{t("replay")}</button>
          <button aria-pressed={isLive} onClick={() => setIsLive(true)} style={{ ...seg(isLive), color: isLive ? C.red : C.text2 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: isLive ? C.red : "transparent", border: `1.5px solid ${C.red}`, animation: isLive ? "pulse 1.5s infinite" : "none" }} />
            {t("live")}
          </button>
        </div>

        <div role="group" aria-label="Language" style={segWrap}>
          {["fr", "en"].map((l) => (
            <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)} style={{ ...seg(lang === l), width: 40, justifyContent: "center", padding: 0 }}>{l.toUpperCase()}</button>
          ))}
        </div>

        <button onClick={copyLink} style={btn()} aria-label={t("share")}>
          <Icon name="link" />{!isMobile && t("share")}
        </button>
        <button onClick={() => setShowShortcuts((p) => !p)} aria-label={t("shortcuts")} title={t("shortcuts")} style={{ ...iconBtn(40, showShortcuts), fontSize: 15, fontWeight: 700 }}>?</button>
      </header>

      <aside aria-label={t("ranking")} style={{ gridArea: "sidebar", borderRight: isMobile ? "none" : `1px solid ${C.line}`, borderBottom: isMobile ? `1px solid ${C.line}` : "none", maxHeight: isMobile ? 360 : "none", overflow: "auto", background: C.panel, minHeight: 0 }}>
        <Sidebar curLap={curLap} sortedDrv={sortedDrv} posAtLap={posAtLap} selDrv={selDrv} cmpDrv={cmpDrv} setSelDrv={handleDriverSelect} setCmpDrv={setCmpDrv} curLapD={curLapD} curIntv={curIntv} drvRaceData={drvRaceData} t={t} />
      </aside>

      <main style={{ gridArea: "main", display: "grid", gridTemplateRows: isMobile ? "440px auto" : "minmax(0,1fr) minmax(0,1fr)", overflow: "hidden", minHeight: 0, minWidth: 0 }}>
        <section aria-label={t("track")} style={{ position: "relative", minHeight: 0, overflow: "hidden", borderBottom: `1px solid ${C.line}` }} onDoubleClick={() => setIsMapFullscreen(true)}>
          <TrackMap {...trackMapProps} />
          {dataIssue && selMeet && (
            <DataNotice
              status={dataIssue.status} lang={lang} onClose={() => setDataIssue(null)}
              alternatives={findAlternatives(selMeet, meetings)}
              onPick={(m) => { setSelMeet(m); setSelSess(null); setDataIssue(null); }}
            />
          )}
          {trackX.length > 10 && (
            <button onClick={() => setIsMapFullscreen(true)} aria-label={t("fullscreen")} title={t("fullscreen")} style={{ ...iconBtn(40), position: "absolute", bottom: 12, right: 12, zIndex: 10 }}>
              <Icon name="expand" />
            </button>
          )}
        </section>
        <section aria-label={t("tel")} style={{ minHeight: 0, overflow: "hidden" }}>
          <Telemetry
            curLap={curLap} is26={is26} selDrvObj={selDrvObj} cmpDrvObj={cmpDrvObj}
            c1={c1} c2={c2} cmpDrv={cmpDrv} telStatus={telStatus} telChart={telChart}
            setHoveredIndex={setHoveredIndex} selLapData={selLapData} cmpLapData={cmpLapData}
            s1Ratio={s1Ratio} s2Ratio={s2Ratio} t={t} lapSC={lapSC} lang={lang}
            onOpenIncident={() => setIncident({})}
          />
        </section>
      </main>

      <aside aria-label={lang === "fr" ? "Détails de session" : "Session details"} data-panel style={{ gridArea: "rightpanel", borderLeft: isMobile ? "none" : `1px solid ${C.line}`, height: isMobile ? 640 : "100%", overflow: "hidden", minHeight: 0 }}>
        <RightPanel
          tab={tab} setTab={setTab} filtRadios={filtRadios} rCtrl={rCtrl}
          weather={weather} curWeather={curWeather} drivers={drivers} maxLap={maxLap}
          rfDrv={rfDrv} setRfDrv={setRfDrv} rfLap={rfLap} setRfLap={setRfLap}
          ss={ss} t={t} lang={lang} pits={pits} stints={stints} selDrv={selDrv} cmpDrv={cmpDrv}
          laps={laps} bestSectors={bestSectors} standings={standings} curLap={curLap}
          gapData={gapData} overtakesPerLap={overtakesPerLap} cornerSpeeds={cornerSpeeds}
          lapSC={lapSC} sessionKey={selSess?.session_key}
          onAnalyse={(evt) => setIncident({ evt })}
        />
      </aside>

      {/* Lap playback — always reachable at the bottom of the screen */}
      <footer aria-label={lang === "fr" ? "Lecture des tours" : "Lap playback"} style={{ gridArea: "footer", display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, padding: isMobile ? "10px 12px" : "0 20px", background: C.panel, borderTop: `1px solid ${C.line}`, position: isMobile ? "sticky" : "static", bottom: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!isMobile && <button onClick={() => { setCurLap((l) => Math.max(1, l - 1)); setPlay(false); }} disabled={curLap <= 1} aria-label={t("prevLap")} title={`${t("prevLap")} (←)`} style={iconBtn(44)}><Icon name="prev" sw={1.8} /></button>}
          <button onClick={() => setPlay(!play)} disabled={maxLap <= 1} aria-label={play ? t("pause") : t("play")} title={`${play ? t("pause") : t("play")} (Space)`} style={{ width: 52, height: 52, borderRadius: "50%", border: "none", background: C.action, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <PlayIcon playing={play} />
          </button>
          {!isMobile && <button onClick={() => { setCurLap((l) => Math.min(maxLap, l + 1)); setPlay(false); }} disabled={curLap >= maxLap} aria-label={t("nextLap")} title={`${t("nextLap")} (→)`} style={iconBtn(44)}><Icon name="next" sw={1.8} /></button>}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: isMobile ? 0 : 120, flexShrink: 0 }} aria-live="polite">
          <span style={{ fontSize: 13, color: C.text2 }}>{t("lap")}</span>
          <span className="num" style={{ fontSize: 24, fontWeight: 700 }}>{curLap}</span>
          <span className="num" style={{ fontSize: 15, color: C.text3 }}>/ {maxLap}</span>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ position: "relative", height: 28 }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 12, height: 4, borderRadius: 2, background: C.lineStrong }} />
            <div style={{ position: "absolute", left: 0, width: `${lapPct(curLap)}%`, top: 12, height: 4, borderRadius: 2, background: C.red }} />
            {scLaps.map((l) => <span key={`sc${l}`} style={{ position: "absolute", left: `${lapPct(l)}%`, width: `${Math.max(100 / Math.max(maxLap, 1), 0.8)}%`, top: 10, height: 8, borderRadius: 2, background: C.b, opacity: 0.55 }} />)}
            {pitLapsA.map((l) => <span key={`pa${l}`} style={{ position: "absolute", left: `${lapPct(l)}%`, top: 0, width: 2, height: 9, background: C.a }} />)}
            {pitLapsB.map((l) => <span key={`pb${l}`} style={{ position: "absolute", left: `${lapPct(l)}%`, top: 19, width: 2, height: 9, background: C.b }} />)}
            <input
              className="scrubber" type="range" min={1} max={Math.max(maxLap, 1)} value={curLap}
              onChange={(e) => { setCurLap(+e.target.value); setPlay(false); }}
              aria-label={t("lap")} aria-valuetext={`${t("lap")} ${curLap} ${t("lapOf")} ${maxLap}`}
              style={{ position: "absolute", inset: 0 }}
            />
          </div>
          {!isMobile && (
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.text3, whiteSpace: "nowrap", overflow: "hidden" }}>
              {scLaps.length > 0 && <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 8, borderRadius: 2, background: C.b, opacity: 0.55 }} />{t("sc")} / VSC</span>}
              {pitLapsA.length > 0 && <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 2, height: 10, background: C.a }} />{t("pitA")}</span>}
              {pitLapsB.length > 0 && <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 2, height: 10, background: C.b }} />{t("pitB")}</span>}
              {curLapOvertakes > 0 && <span>{curLapOvertakes} {lang === "fr" ? "dépassement(s) ce tour" : `overtake${curLapOvertakes !== 1 ? "s" : ""} this lap`}</span>}
            </div>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center" }}>
          <span style={srOnly}>{t("speedX")}</span>
          <select value={playSpeed} onChange={(e) => setPlaySpeed(+e.target.value)} style={{ ...ss, height: 40, fontWeight: 600 }}>
            {[0.5, 1, 2, 4].map((v) => <option key={v} value={v}>{v}×</option>)}
          </select>
        </label>
        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }} aria-hidden="true">
            {["Space", "←", "→"].map((k) => <kbd key={k} style={{ padding: "3px 7px", border: `1px solid ${C.lineStrong}`, borderRadius: 5, color: C.text2, fontSize: 12, fontFamily: FONT_UI }}>{k}</kbd>)}
          </div>
        )}
      </footer>

      {/* Full-screen track map overlay */}
      {isMapFullscreen && (
        <div role="dialog" aria-modal="true" aria-label={t("track")} style={{ position: "fixed", inset: 0, zIndex: 9990, background: C.bg }} onDoubleClick={() => setIsMapFullscreen(false)}>
          <div style={{ position: "absolute", inset: 0 }}>
            <TrackMap {...trackMapProps} />
          </div>
          <button onClick={() => setIsMapFullscreen(false)} style={{ ...btn(), position: "absolute", bottom: 20, right: 20 }} autoFocus>
            <Icon name="close" />{t("exitFs")} <kbd style={{ fontSize: 12, color: C.text2, fontFamily: FONT_UI }}>Esc</kbd>
          </button>
        </div>
      )}

      {incident && (
        <Incident
          rCtrl={rCtrl} laps={laps} drivers={drivers} sessionKey={selSess?.session_key}
          selDrv={selDrv} cmpDrv={cmpDrv} initialEvent={incident.evt} lang={lang} cacheable={!isLive && isFinished(selSess)}
          onClose={() => setIncident(null)}
        />
      )}

      {/* Toast notifications */}
      <div role="status" aria-live="polite" style={{ position: "fixed", top: 72, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        {toasts.map((toast) => (
          <div key={toast.id} style={{
            background: TOAST_BG[toast.type] || C.raised,
            border: `1px solid ${TOAST_BD[toast.type] || C.lineStrong}`,
            color: C.text, borderRadius: 10, padding: "10px 14px", fontSize: 14,
            fontWeight: 600, maxWidth: 320, lineHeight: 1.45,
            animation: "slideInRight 0.3s ease", boxShadow: "0 6px 20px #00000066", pointerEvents: "auto",
          }}>
            {toast.msg}
          </div>
        ))}
      </div>

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div onClick={() => setShowShortcuts(false)} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "#000000bb", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div role="dialog" aria-modal="true" aria-label={t("shortcuts")} onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "20px 24px", width: "100%", maxWidth: 380 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>{t("shortcuts")}</h2>
              <button onClick={() => setShowShortcuts(false)} aria-label="Close" style={{ ...iconBtn(40), background: "transparent", border: "none" }} autoFocus><Icon name="close" /></button>
            </div>
            {SHORTCUTS.map((sc) => (
              <div key={sc.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.rowLine}` }}>
                <span style={{ fontSize: 14, color: C.text2 }}>{sc.desc}</span>
                <kbd style={{ background: C.raised, border: `1px solid ${C.lineStrong}`, borderRadius: 6, padding: "3px 10px", fontSize: 13, color: C.text, fontFamily: FONT_UI }}>{sc.key}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
