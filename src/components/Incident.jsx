import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine, CartesianGrid,
} from "recharts";
import { fetchApi, tc, exportCSV } from "../api";
import { C, FONT_NUM, btn, iconBtn, segWrap, seg } from "../theme";
import {
  cleanSamples, buildProfile, medianSegLens, normalise, resample, distanceAtTime, zoneMetrics, findSlowZone,
} from "../telemetryMath";
import { passStatus } from "../passStatus";
import Icon from "./Icon";

const STEP = 5; // metres between reconstructed points
const YELLOWS = new Set(["YELLOW", "DOUBLE YELLOW"]);
const TIP = { background: C.raised, border: `1px solid ${C.lineStrong}`, borderRadius: 8, fontSize: 13, fontFamily: FONT_NUM, padding: "6px 10px", color: C.text };

export const isYellowEvent = (m) => YELLOWS.has(m?.flag);

// Flag-out events + the matching CLEAR for the same sector
export function buildEvents(rCtrl) {
  const sorted = [...rCtrl].sort((a, b) => new Date(a.date) - new Date(b.date));
  const evts = [];
  sorted.forEach((m, i) => {
    if (!isYellowEvent(m)) return;
    const end = sorted.slice(i + 1).find((x) => (x.flag === "CLEAR" || x.flag === "GREEN") && (m.sector == null || x.sector == null || x.sector === m.sector));
    evts.push({ ...m, t: new Date(m.date).getTime(), tClear: end ? new Date(end.date).getTime() : null });
  });
  return evts;
}

const PASS_LABEL = {
  fr: { yellow: "sous drapeau", before: "avant le drapeau", after: "après la levée" },
  en: { yellow: "under flag", before: "before flag", after: "after clear" },
};

const fmtTime = (t) => new Date(t).toLocaleTimeString("fr-FR");
const num = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(d));
const signed = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`);

function lapWindow(driverLaps, lapNumber) {
  const l = driverLaps.find((x) => x.lap_number === lapNumber);
  if (!l?.date_start) return null;
  const next = driverLaps.find((x) => x.lap_number === lapNumber + 1);
  const t0 = new Date(l.date_start).getTime();
  const t1 = l.lap_duration ? t0 + l.lap_duration * 1000 : next?.date_start ? new Date(next.date_start).getTime() : null;
  if (!t1) return null;
  const anchors = [t0];
  if (l.duration_sector_1 && l.duration_sector_2 && l.lap_duration) {
    anchors.push(t0 + l.duration_sector_1 * 1000, t0 + (l.duration_sector_1 + l.duration_sector_2) * 1000);
  }
  anchors.push(t1);
  return { t0, t1, anchors };
}

export default function Incident({ rCtrl, laps, drivers, sessionKey, selDrv, cmpDrv, initialEvent, onClose, lang = "fr", cacheable = false }) {
  const fr = lang === "fr";
  const events = useMemo(() => buildEvents(rCtrl), [rCtrl]);
  const [evtIdx, setEvtIdx] = useState(() => {
    const i = initialEvent ? events.findIndex((e) => e.date === initialEvent.date && e.message === initialEvent.message) : -1;
    return i >= 0 ? i : Math.max(0, events.length - 1);
  });
  const [picks, setPicks] = useState(() => [selDrv, cmpDrv].filter(Boolean));
  const [lapOf, setLapOf] = useState({}); // driver → forced lap number
  const [vsBest, setUseRef] = useState(true);
  const [status, setStatus] = useState("idle");
  const [prof, setProf] = useState({}); // dn → { inc, ref, incLap, refLap, flagD, clearD }
  const [zone, setZone] = useState(null);
  const [view, setView] = useState(null);
  const [drag, setDrag] = useState(null);
  const [showDots, setShowDots] = useState(true);
  const [axis, setAxis] = useState(null); // shared segment lengths of the loaded laps
  const [field, setField] = useState(null); // whole-field ranking
  const cache = useRef(new Map());

  const evt = events[evtIdx];

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const drvInfo = useMemo(() => {
    const m = new Map(drivers.map((d) => [d.driver_number, d]));
    const seen = {};
    return Object.fromEntries(picks.map((dn) => {
      const d = m.get(dn);
      const color = tc(d?.team_name);
      seen[color] = (seen[color] || 0) + 1;
      return [dn, { acr: d?.name_acronym || String(dn), color, dash: seen[color] > 1 ? "6 4" : undefined }];
    }));
  }, [picks, drivers]);

  const driverLaps = useCallback((dn) => laps.filter((l) => l.driver_number === dn).sort((a, b) => a.lap_number - b.lap_number), [laps]);

  // The lap in which the flag was shown, unless the user stepped to another one
  const defaultLap = useCallback((dn) => {
    if (!evt) return null;
    let lap = null;
    for (const l of driverLaps(dn)) if (l.date_start && new Date(l.date_start).getTime() <= evt.t) lap = l.lap_number;
    return lap;
  }, [evt, driverLaps]);

  const fetchLap = useCallback(async (dn, lapNumber) => {
    const key = `${sessionKey}-${dn}-${lapNumber}`;
    if (cache.current.has(key)) return cache.current.get(key);
    const w = lapWindow(driverLaps(dn), lapNumber);
    if (!w) return null;
    const rows = await fetchApi("car_data", {
      session_key: sessionKey, driver_number: dn,
      "date>": new Date(w.t0 - 2500).toISOString(), "date<": new Date(w.t1 + 2500).toISOString(),
    }, null, 4, { cache: cacheable });
    if (!Array.isArray(rows)) return null;
    const out = { w, samples: cleanSamples(rows) };
    cache.current.set(key, out);
    return out;
  }, [sessionKey, driverLaps, cacheable]);

  // Fastest clean lap of the driver, used as "what he normally does here"
  const bestLapOf = useCallback((dn, exclude) => {
    const skip = [].concat(exclude);
    const cand = driverLaps(dn).filter((l) => l.lap_duration && !l.is_pit_out_lap && !skip.includes(l.lap_number) && l.lap_number > 1 && l.duration_sector_1 && l.duration_sector_2);
    if (!cand.length) return null;
    return cand.reduce((a, b) => (b.lap_duration < a.lap_duration ? b : a)).lap_number;
  }, [driverLaps]);

  useEffect(() => {
    if (!evt || !picks.length) { setProf({}); return; }
    let dead = false;
    (async () => {
      setStatus("loading");
      const raw = [];
      for (const dn of picks) {
        const incLap = lapOf[dn] ?? defaultLap(dn);
        const refLap = vsBest ? bestLapOf(dn, incLap) : null;
        const inc = incLap ? await fetchLap(dn, incLap) : null;
        const ref = refLap ? await fetchLap(dn, refLap) : null;
        raw.push({ dn, incLap, refLap, inc, ref });
      }
      if (dead) return;
      const mk = (x) => (x ? buildProfile(x.samples, x.w.anchors) : null);
      const built = raw.map((r) => ({ ...r, pInc: mk(r.inc), pRef: mk(r.ref) }));
      const refLens = medianSegLens(built.flatMap((b) => [b.pInc, b.pRef]));
      if (!refLens) { setProf({}); setStatus("error"); return; }
      const total = refLens.reduce((a, b) => a + b, 0);
      setAxis(refLens);
      const out = {};
      built.forEach((b) => {
        const nInc = b.pInc && normalise(b.pInc, refLens);
        const nRef = b.pRef && normalise(b.pRef, refLens);
        out[b.dn] = {
          incLap: b.incLap, refLap: b.refLap, total,
          inc: nInc && resample(nInc, total, STEP),
          ref: nRef && resample(nRef, total, STEP),
          quality: nInc?.quality,
          flagD: nInc ? distanceAtTime(nInc, evt.t) : null,
          clearD: nInc && evt.tClear ? distanceAtTime(nInc, evt.tClear) : null,
        };
      });
      setProf(out);
      setZone((z) => {
        if (z) return z;
        const a = findSlowZone(Object.values(out).map((p) => ({ inc: p.inc?.rows, ref: p.ref?.rows })), 300, STEP);
        return a ? [a.z0, a.z1] : null;
      });
      setStatus("loaded");
    })().catch(() => !dead && setStatus("error"));
    return () => { dead = true; };
  }, [evt, picks, lapOf, vsBest, defaultLap, fetchLap, bestLapOf]);

  const total = useMemo(() => Object.values(prof).find((p) => p?.total)?.total || 0, [prof]);

  // new event → forget the zone; the load effect then proposes the stretch where
  // drivers slow down most compared to their own best lap
  useEffect(() => { setZone(null); setView(null); setField(null); }, [evtIdx]);

  // rows for the chart: one object per grid point
  const chartRows = useMemo(() => {
    if (!total) return [];
    const n = Math.floor(total / STEP) + 1;
    const rows = Array.from({ length: n }, (_, i) => ({ d: i * STEP }));
    Object.entries(prof).forEach(([dn, p]) => {
      const put = (src, pre) => src?.rows.forEach((r, i) => {
        if (!rows[i] || r.speed === null) return;
        rows[i][`${pre}s${dn}`] = r.speed; rows[i][`${pre}t${dn}`] = r.throttle; rows[i][`${pre}b${dn}`] = r.brake;
      });
      put(p.inc, ""); put(p.ref, "r");
      p.inc?.measured.forEach((i) => { if (rows[i] && rows[i][`s${dn}`] !== undefined) rows[i][`m${dn}`] = rows[i][`s${dn}`]; });
    });
    return rows;
  }, [prof, total]);

  const metrics = useMemo(() => {
    if (!zone) return {};
    return Object.fromEntries(Object.entries(prof).map(([dn, p]) => {
      const inc = p.inc && zoneMetrics(p.inc.rows, zone[0], zone[1]);
      const ref = p.ref && zoneMetrics(p.ref.rows, zone[0], zone[1]);
      return [dn, { inc, ref }];
    }));
  }, [prof, zone]);

  // Rank every driver on the selected zone. For each one we try the lap the flag
  // appeared in and the next one, and keep the pass that happened under the flag.
  const runField = async () => {
    if (!zone || !axis || !evt) return;
    const todo = drivers.map((d) => d.driver_number);
    setField({ loading: true, done: 0, total: todo.length, rows: [] });
    const rows = [];
    let done = 0;
    await Promise.all(todo.map(async (dn) => {
      try {
        const base = defaultLap(dn);
        if (!base) return;
        const refLap = bestLapOf(dn, [base, base + 1]);
        const total = axis.reduce((a, b) => a + b, 0);
        const measure = async (lap) => {
          const x = await fetchLap(dn, lap);
          const p = x && buildProfile(x.samples, x.w.anchors);
          const rs = p && resample(normalise(p, axis), total, STEP);
          return rs && { lap, m: zoneMetrics(rs.rows, zone[0], zone[1]) };
        };
        const ref = refLap ? await measure(refLap) : null;
        let pick = null;
        for (const lap of [base, base + 1]) {
          const r = await measure(lap);
          if (!r?.m) continue;
          const st = passStatus(r.m.tEntry, evt);
          if (!pick || (st === "yellow" && pick.st !== "yellow")) pick = { ...r, st };
          if (st === "yellow") break;
        }
        if (pick) {
          const dMean = ref?.m ? pick.m.mean - ref.m.mean : null;
          rows.push({ dn, acr: drvInfo[dn]?.acr || drivers.find((d) => d.driver_number === dn)?.name_acronym, lap: pick.lap, status: pick.st, entry: pick.m.entry, min: pick.m.min, mean: pick.m.mean, liftRel: pick.m.liftRel, dMean, dPct: dMean != null ? (dMean / ref.m.mean) * 100 : null });
        }
      } finally {
        done++;
        setField((f) => (f ? { ...f, done } : f));
      }
    }));
    // under the flag first; within it, the smallest speed reduction first
    const order = { yellow: 0, before: 1, after: 1 };
    rows.sort((a, b) => order[a.status] - order[b.status] || (b.dPct ?? -999) - (a.dPct ?? -999));
    setField({ loading: false, done: todo.length, total: todo.length, rows });
  };

  const fieldText = () => {
    const head = fr ? `Zone ${Math.round(zone[0])}–${Math.round(zone[1])} m · ${evt.message}` : `Zone ${Math.round(zone[0])}–${Math.round(zone[1])} m · ${evt.message}`;
    return [head, ...field.rows.filter((r) => r.status === "yellow").map((r, i) => `${i + 1}. ${r.acr} L${r.lap} — ${r.mean.toFixed(0)} km/h mean, min ${r.min.toFixed(0)}${r.dPct != null ? `, ${r.dPct.toFixed(1)} % vs best lap` : ""}`)].join("\n");
  };

  const domain = view || [0, total || 1];
  const colorOf = (dn) => drvInfo[dn]?.color || "#fff";

  const onDown = (e) => { if (e && e.activeLabel != null) setDrag({ a: e.activeLabel, b: e.activeLabel }); };
  const onMove = (e) => { if (drag && e && e.activeLabel != null) setDrag({ ...drag, b: e.activeLabel }); };
  const onUp = () => {
    if (drag) {
      const a = Math.min(drag.a, drag.b), b = Math.max(drag.a, drag.b);
      if (b - a >= 4 * STEP) setZone([a, b]);
    }
    setDrag(null);
  };

  const shown = drag ? [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)] : zone;

  const chartCommon = {
    data: chartRows, syncId: "incident", margin: { top: 6, right: 12, bottom: 0, left: 0 },
    onMouseDown: onDown, onMouseMove: onMove, onMouseUp: onUp, onMouseLeave: () => setDrag(null),
  };
  const xAxis = (hide) => <XAxis dataKey="d" type="number" domain={domain} allowDataOverflow hide={hide} tickFormatter={(v) => `${Math.round(v)} m`} stroke={C.text3} tick={{ fontSize: 12, fill: C.text3 }} />;
  const overlays = () => (
    <>
      {shown && <ReferenceArea x1={shown[0]} x2={shown[1]} fill={C.b} fillOpacity={0.12} stroke={C.b} strokeOpacity={0.5} />}
      {Object.entries(prof).map(([dn, p]) => p.flagD != null && (
        <ReferenceLine key={`f${dn}`} x={p.flagD} stroke={colorOf(dn)} strokeDasharray="2 3" strokeOpacity={0.9} />
      ))}
    </>
  );

  const lines = (pre, base, opts = {}) => picks.map((dn) => (
    <Line key={`${pre}${base}${dn}`} type="monotone" dataKey={`${pre}${base}${dn}`} stroke={colorOf(dn)}
      strokeDasharray={opts.ref ? "2 4" : drvInfo[dn]?.dash} strokeWidth={opts.ref ? 1 : 2} strokeOpacity={opts.ref ? 0.55 : 1}
      dot={false} isAnimationActive={false} connectNulls={false} name={`${drvInfo[dn]?.acr}${opts.ref ? " ref" : ""}`} />
  ));

  const tipFmt = (unit) => (v, name) => [`${Math.round(v * 10) / 10}${unit}`, name];

  const lapStepper = (dn) => {
    const p = prof[dn];
    const lap = p?.incLap ?? lapOf[dn] ?? defaultLap(dn);
    const set = (l) => setLapOf((o) => ({ ...o, [dn]: Math.max(1, l) }));
    return (
      <span key={dn} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <span style={{ width: 18, height: 3, borderRadius: 2, background: colorOf(dn) }} /><b>{drvInfo[dn]?.acr}</b>
        <button aria-label="−" onClick={() => set((lap || 1) - 1)} style={{ ...iconBtn(28), borderRadius: 6 }}><Icon name="prev" size={12} /></button>
        <span className="num" style={{ minWidth: 40, textAlign: "center" }}>{fr ? "T" : "L"}{lap ?? "—"}</span>
        <button aria-label="+" onClick={() => set((lap || 0) + 1)} style={{ ...iconBtn(28), borderRadius: 6 }}><Icon name="next" size={12} /></button>
      </span>
    );
  };

  const cell = { padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" };
  const head = { ...cell, fontSize: 12, fontWeight: 600, color: C.text3 };
  const q = Object.values(prof).find((p) => p?.quality)?.quality;

  return (
    <div role="dialog" aria-modal="true" aria-label={fr ? "Analyse d'incident" : "Incident analysis"} style={{ position: "fixed", inset: 0, zIndex: 9980, background: C.bg, color: C.text, fontSize: 14, overflow: "auto", padding: "16px 20px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700 }}>{fr ? "Analyse d'incident" : "Incident analysis"}</h2>
        <label style={{ display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{fr ? "Événement" : "Event"}</span>
          <select value={evtIdx} onChange={(e) => { setEvtIdx(+e.target.value); setLapOf({}); }} style={{ background: C.raised, color: C.text, border: `1px solid ${C.lineStrong}`, borderRadius: 8, height: 38, padding: "0 10px", fontSize: 13, maxWidth: "100%" }}>
            {events.length === 0 && <option value={0}>{fr ? "Aucun drapeau jaune dans cette session" : "No yellow flag in this session"}</option>}
            {events.map((e, i) => <option key={i} value={i}>{fmtTime(e.t)} · {e.flag}{e.sector ? ` · S${e.sector}` : ""} · {fr ? "T" : "L"}{e.lap_number ?? "?"}</option>)}
          </select>
        </label>
        {evt && <span style={{ fontSize: 13, color: C.text2 }}>{evt.message}{evt.tClear ? ` — ${fr ? "levé après" : "cleared after"} ${Math.round((evt.tClear - evt.t) / 1000)} s` : ""}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={btn()}><Icon name="close" />{fr ? "Fermer" : "Close"} <kbd style={{ fontSize: 12, color: C.text2 }}>Esc</kbd></button>
      </div>

      {/* Driver picker */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: C.text2, marginRight: 4 }}>{fr ? "Pilotes (4 max)" : "Drivers (max 4)"}</span>
        {drivers.map((d) => {
          const on = picks.includes(d.driver_number);
          return (
            <button key={d.driver_number} aria-pressed={on}
              onClick={() => setPicks((p) => (on ? p.filter((x) => x !== d.driver_number) : p.length >= 4 ? p : [...p, d.driver_number]))}
              style={{ height: 30, padding: "0 9px", borderRadius: 6, border: `1px solid ${on ? tc(d.team_name) : C.lineStrong}`, background: on ? C.selected : "transparent", color: on ? C.text : C.text2, fontSize: 12, fontWeight: 600 }}>
              {d.name_acronym}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: C.text2 }}>{fr ? "Tour analysé" : "Lap analysed"}</span>
        {picks.map(lapStepper)}
        <div style={segWrap}>
          <button aria-pressed={vsBest} onClick={() => setUseRef((v) => !v)} style={seg(vsBest)}>{fr ? "vs meilleur tour" : "vs best lap"}</button>
          <button aria-pressed={showDots} onClick={() => setShowDots((v) => !v)} style={seg(showDots)}>{fr ? "Points mesurés" : "Measured points"}</button>
        </div>
        <div style={segWrap}>
          <button onClick={() => zone && setView([Math.max(0, zone[0] - 400), Math.min(total, zone[1] + 400)])} disabled={!zone} style={seg(false)}>{fr ? "Zoom zone" : "Zoom zone"}</button>
          <button onClick={() => setView(null)} style={seg(!view)}>{fr ? "Tour entier" : "Full lap"}</button>
        </div>
      </div>

      {status === "loading" && <div role="status" style={{ color: C.text3, padding: "24px 0" }}>{fr ? "Chargement de la télémétrie…" : "Loading telemetry…"}</div>}
      {status === "error" && <div role="status" style={{ color: C.red, padding: "24px 0" }}>{fr ? "Données incomplètes pour ces tours (pas de secteurs ou télémétrie manquante). Essayez un autre tour." : "Incomplete data for those laps (missing sectors or telemetry). Try another lap."}</div>}
      {events.length === 0 && <div style={{ color: C.text3, padding: "24px 0" }}>{fr ? "Aucun drapeau jaune/double jaune dans les messages de la direction de course." : "No yellow / double-yellow flag in the race-control messages."}</div>}

      {chartRows.length > 0 && (
        <>
          <div style={{ background: C.panel, borderRadius: 10, padding: "8px 0 4px", marginBottom: 8 }}>
            <div style={{ padding: "0 14px 4px", fontSize: 13, color: C.text2, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <b>{fr ? "Vitesse (km/h)" : "Speed (km/h)"}</b>
              <span style={{ color: C.text3 }}>{fr ? "Glissez sur le graphique pour choisir la zone jaune · pointillé vertical = drapeau affiché à ce pilote" : "Drag on the chart to pick the yellow zone · vertical dotted line = flag shown to that driver"}</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart {...chartCommon}>
                <CartesianGrid stroke={C.line} vertical={false} />
                {xAxis(false)}
                <YAxis domain={["auto", "auto"]} width={42} stroke={C.text3} tick={{ fontSize: 12, fill: C.text3 }} />
                <Tooltip contentStyle={TIP} labelFormatter={(v) => `${Math.round(v)} m`} formatter={tipFmt("")} />
                {overlays()}
                {vsBest && lines("r", "s", { ref: true })}
                {lines("", "s")}
                {showDots && picks.map((dn) => <Line key={`m${dn}`} type="monotone" dataKey={`m${dn}`} stroke="none" dot={{ r: 2.5, fill: colorOf(dn), stroke: C.panel, strokeWidth: 1 }} activeDot={false} isAnimationActive={false} legendType="none" tooltipType="none" />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 8, marginBottom: 12 }}>
            {[["t", fr ? "Accélérateur (%)" : "Throttle (%)"], ["b", fr ? "Frein (%)" : "Brake (%)"]].map(([k, label]) => (
              <div key={k} style={{ background: C.panel, borderRadius: 10, padding: "8px 0 4px" }}>
                <div style={{ padding: "0 14px 4px", fontSize: 13, color: C.text2 }}><b>{label}</b></div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart {...chartCommon}>
                    <CartesianGrid stroke={C.line} vertical={false} />
                    {xAxis(true)}
                    <YAxis domain={[0, 100]} width={42} stroke={C.text3} tick={{ fontSize: 12, fill: C.text3 }} ticks={[0, 50, 100]} />
                    <Tooltip contentStyle={TIP} labelFormatter={(v) => `${Math.round(v)} m`} formatter={tipFmt("%")} />
                    {overlays()}
                    {lines("", k)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>

          {/* Metrics for the selected zone */}
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "6px 4px", marginBottom: 10, overflowX: "auto" }}>
            <div style={{ padding: "4px 10px 6px", fontSize: 13, color: C.text2 }}>
              {zone
                ? <>{fr ? "Zone analysée" : "Zone analysed"}: <b className="num">{Math.round(zone[0])} → {Math.round(zone[1])} m</b> ({Math.round(zone[1] - zone[0])} m)</>
                : (fr ? "Glissez sur le graphique pour choisir une zone." : "Drag on the chart to choose a zone.")}
            </div>
            <table className="num" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...head, textAlign: "left" }}>{fr ? "Pilote" : "Driver"}</th>
                  <th style={head}>{fr ? "Tour" : "Lap"}</th>
                  <th style={head}>{fr ? "Passage zone" : "Zone pass"}</th>
                  <th style={head}>{fr ? "Drapeau vu à" : "Flag seen at"}</th>
                  <th style={head}>{fr ? "Vit. entrée" : "Entry"}</th>
                  <th style={head}>{fr ? "Vit. min" : "Min"}</th>
                  <th style={head}>{fr ? "Vit. moy." : "Mean"}</th>
                  <th style={head}>{fr ? "Temps zone" : "Zone time"}</th>
                  <th style={head}>{fr ? "Lever pied (vs zone)" : "Lift (vs zone)"}</th>
                  <th style={head}>{fr ? "Freinage (vs zone)" : "Brake (vs zone)"}</th>
                  {vsBest && <th style={head}>{fr ? "Moy. vs meilleur tour" : "Mean vs best lap"}</th>}
                  {vsBest && <th style={head}>{fr ? "Min vs meilleur tour" : "Min vs best lap"}</th>}
                </tr>
              </thead>
              <tbody>
                {picks.map((dn) => {
                  const m = metrics[dn]?.inc, r = metrics[dn]?.ref, p = prof[dn];
                  const dMean = m && r ? m.mean - r.mean : null;
                  return (
                    <tr key={dn} style={{ borderTop: `1px solid ${C.rowLine}` }}>
                      <th scope="row" style={{ ...head, textAlign: "left", color: colorOf(dn) }}>{drvInfo[dn]?.acr}</th>
                      <td style={cell}>{p?.incLap ?? "—"}{vsBest && p?.refLap ? <span style={{ color: C.text3 }}> / ref {p.refLap}</span> : null}</td>
                      <td style={{ ...cell, color: passStatus(m?.tEntry, evt) === "yellow" ? C.b : C.text3 }}>{PASS_LABEL[fr ? "fr" : "en"][passStatus(m?.tEntry, evt)] || "—"}</td>
                      <td style={cell}>{p?.flagD != null ? `${Math.round(p.flagD)} m` : (fr ? "hors tour" : "off lap")}</td>
                      <td style={cell}>{num(m?.entry)}</td>
                      <td style={cell}>{num(m?.min)}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{num(m?.mean, 1)}</td>
                      <td style={cell}>{m ? `${m.timeS.toFixed(2)} s` : "—"}</td>
                      <td style={cell}>{m?.liftRel != null ? `${Math.round(m.liftRel)} m` : "—"}</td>
                      <td style={cell}>{m?.brakeRel != null ? `${Math.round(m.brakeRel)} m` : "—"}</td>
                      {vsBest && <td style={{ ...cell, fontWeight: 700, color: dMean == null ? C.text3 : dMean < 0 ? C.b : C.text }}>{dMean == null ? "—" : `${signed(dMean, 1)} km/h (${signed((dMean / r.mean) * 100, 1)} %)`}</td>}
                      {vsBest && <td style={cell}>{m && r ? `${signed(m.min - r.min)} km/h` : "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Whole-field ranking */}
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <b style={{ fontSize: 14 }}>{fr ? "Tout le plateau" : "Whole field"}</b>
              <span style={{ fontSize: 13, color: C.text3 }}>{fr ? "Qui a le moins ralenti dans la zone, parmi ceux qui l'ont passée sous le drapeau" : "Who slowed least in the zone, among those who passed it under the flag"}</span>
              <div style={{ flex: 1 }} />
              {field?.rows?.length > 0 && !field.loading && (
                <>
                  <button onClick={() => navigator.clipboard?.writeText(fieldText())} style={{ ...btn(), height: 34 }}>{fr ? "Copier" : "Copy"}</button>
                  <button onClick={() => exportCSV(field.rows.map((r) => ({ driver: r.acr, lap: r.lap, status: r.status, entry_kmh: r.entry.toFixed(1), min_kmh: r.min.toFixed(1), mean_kmh: r.mean.toFixed(1), vs_best_lap_pct: r.dPct?.toFixed(1) ?? "" })), `incident_${Math.round(zone[0])}-${Math.round(zone[1])}m`)} style={{ ...btn(), height: 34 }}><Icon name="download" size={14} />CSV</button>
                </>
              )}
              <button onClick={runField} disabled={!zone || field?.loading} style={{ ...btn(!field), height: 34 }}>
                {field?.loading ? `${field.done}/${field.total}…` : fr ? "Classer les 20 pilotes" : "Rank all drivers"}
              </button>
            </div>
            {field?.rows?.length > 0 && (
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table className="num" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ ...head, textAlign: "left" }}>#</th>
                      <th style={{ ...head, textAlign: "left" }}>{fr ? "Pilote" : "Driver"}</th>
                      <th style={head}>{fr ? "Tour" : "Lap"}</th>
                      <th style={head}>{fr ? "Passage" : "Pass"}</th>
                      <th style={head}>{fr ? "Entrée" : "Entry"}</th>
                      <th style={head}>{fr ? "Min" : "Min"}</th>
                      <th style={head}>{fr ? "Moy." : "Mean"}</th>
                      <th style={head}>{fr ? "vs meilleur tour" : "vs best lap"}</th>
                      <th style={head}>{fr ? "Lever pied" : "Lift"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {field.rows.map((r, i) => {
                      const y = r.status === "yellow";
                      return (
                        <tr key={r.dn} style={{ borderTop: `1px solid ${C.rowLine}`, opacity: y ? 1 : 0.5 }}>
                          <td style={{ ...cell, textAlign: "left", color: C.text3 }}>{y ? i + 1 : ""}</td>
                          <th scope="row" style={{ ...head, textAlign: "left", color: picks.includes(r.dn) ? colorOf(r.dn) : C.text }}>{r.acr}</th>
                          <td style={cell}>{r.lap}</td>
                          <td style={{ ...cell, color: y ? C.b : C.text3 }}>{PASS_LABEL[fr ? "fr" : "en"][r.status]}</td>
                          <td style={cell}>{num(r.entry)}</td>
                          <td style={cell}>{num(r.min)}</td>
                          <td style={{ ...cell, fontWeight: 700 }}>{num(r.mean, 1)}</td>
                          <td style={{ ...cell, fontWeight: 700 }}>{r.dPct == null ? "—" : `${signed(r.dPct, 1)} %`}</td>
                          <td style={cell}>{r.liftRel != null ? `${Math.round(r.liftRel)} m` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p style={{ fontSize: 12, color: C.text3, lineHeight: 1.5, maxWidth: 900 }}>
            {fr
              ? `Précision : OpenF1 ne fournit qu'environ ${q ? q.hz.toFixed(1) : "3,7"} mesures par seconde (≈ 1 point tous les ${q ? Math.round(1000 / q.hz) : 270} ms, soit ~20 m à 300 km/h, plus grand écart ${q ? Math.round(q.maxGapMs) : "?"} ms). Les courbes sont interpolées (cubique monotone) entre les points mesurés (affichables) et calées en distance grâce au passage de la ligne et aux secteurs chronométrés (incertitude ~±10 m). Aucune donnée n'est ajoutée : un écart de quelques km/h reste dans la marge.`
              : `Precision: OpenF1 only provides about ${q ? q.hz.toFixed(1) : "3.7"} samples per second (≈ one point every ${q ? Math.round(1000 / q.hz) : 270} ms, ~20 m at 300 km/h, largest gap ${q ? Math.round(q.maxGapMs) : "?"} ms). Curves are interpolated (monotone cubic) between the measured points (toggle to show them) and aligned in distance using the finish line and the timing sectors (uncertainty ~±10 m). No data is added: a difference of a few km/h is within the margin.`}
          </p>
        </>
      )}
    </div>
  );
}
