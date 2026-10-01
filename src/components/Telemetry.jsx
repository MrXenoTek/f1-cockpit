import { useMemo } from "react";
import {
  LineChart, Line, YAxis, XAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Brush, AreaChart, Area,
} from "recharts";
import { fmtLap, exportCSV, exportJSON } from "../api";
import { C, FONT_NUM } from "../theme";
import Icon from "./Icon";

const TIP = { background: C.raised, border: `1px solid ${C.lineStrong}`, borderRadius: 8, fontSize: 13, fontFamily: FONT_NUM, padding: "6px 10px", color: C.text };

function TelChart({ data, dk1, dk2, c1, c2, n1, n2, label, sub, unit, domain, onHover, onLeave, s1Limit, s2Limit, hasBrush, isDelta }) {
  if (!data?.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr)", gap: 8, alignItems: "stretch", marginBottom: 8 }}>
      <div style={{ fontSize: 13, color: C.text2, paddingTop: 4, lineHeight: 1.3 }}>
        {label}
        {(sub || unit) && <div style={{ fontSize: 12, color: C.text3 }}>{sub || unit.trim()}</div>}
      </div>
      <div style={{ background: C.panel, borderRadius: 8, padding: "4px 0" }}>
      <ResponsiveContainer width="100%" height={hasBrush ? 96 : 64}>
        {isDelta ? (
          <AreaChart
            data={data} syncId="f1" margin={{ top: 1, right: 0, bottom: 0, left: 0 }}
            onMouseMove={(e) => onHover && onHover(e?.activeTooltipIndex)}
            onMouseLeave={onLeave}
          >
            <XAxis dataKey="i" hide />
            <YAxis domain={domain || ["auto", "auto"]} hide />
            <Tooltip
              contentStyle={TIP}
              formatter={(v) => [`${Math.round(v)}${unit || ""}`, "Delta"]}
            />
            {s1Limit > 0 && <ReferenceLine x={s1Limit} stroke={C.lineStrong} strokeDasharray="3 3" />}
            {s2Limit > 0 && <ReferenceLine x={s2Limit} stroke={C.lineStrong} strokeDasharray="3 3" />}
            <ReferenceLine y={0} stroke="#4A515C" />
            <Area type="monotone" dataKey={dk1} stroke={C.green} fill={C.green} fillOpacity={0.18} strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        ) : (
          <LineChart
            data={data} syncId="f1" margin={{ top: 1, right: 0, bottom: 0, left: 0 }}
            onMouseMove={(e) => onHover && onHover(e?.activeTooltipIndex)}
            onMouseLeave={onLeave}
          >
            <XAxis dataKey="i" hide />
            <YAxis domain={domain || ["auto", "auto"]} hide />
            <Tooltip
              contentStyle={TIP}
              formatter={(v, name) => [`${Math.round(v)}${unit || ""}`, name === dk1 ? (n1 || "A") : (n2 || "B")]}
              labelFormatter={() => ""}
            />
            {s1Limit > 0 && <ReferenceLine x={s1Limit} stroke={C.lineStrong} strokeDasharray="3 3" />}
            {s2Limit > 0 && <ReferenceLine x={s2Limit} stroke={C.lineStrong} strokeDasharray="3 3" />}
            <Line type="monotone" dataKey={dk1} stroke={c1} strokeWidth={2} dot={false} isAnimationActive={false} />
            {dk2 && <Line type="monotone" dataKey={dk2} stroke={c2} strokeWidth={2} dot={false} isAnimationActive={false} strokeDasharray="6 4" />}
            {hasBrush && <Brush dataKey="i" height={20} stroke={C.text3} fill={C.raised} tickFormatter={() => ""} travellerWidth={8} />}
          </LineChart>
        )}
      </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Telemetry({
  curLap, is26, selDrvObj, cmpDrvObj, c1, c2, cmpDrv,
  telStatus, telChart, setHoveredIndex,
  selLapData, cmpLapData, s1Ratio, s2Ratio, t, lapSC, lang = "fr", onOpenIncident,
}) {
  const fr = lang === "fr";
  const n1 = selDrvObj?.name_acronym, n2 = cmpDrvObj?.name_acronym;
  const s1Limit = s1Ratio ? Math.floor(s1Ratio * 199) : 0;
  const s2Limit = s2Ratio ? Math.floor(s2Ratio * 199) : 0;

  const getStats = (start, end) => {
    let s1Max = 0, s1Min = 999, s1Sum = 0, s1Count = 0;
    let s2Max = 0, s2Min = 999, s2Sum = 0, s2Count = 0;
    for (let i = start; i <= end; i++) {
      const pt = telChart[i];
      if (!pt) continue;
      if (pt.speed1 > 5) {
        if (pt.speed1 > s1Max) s1Max = pt.speed1;
        if (pt.speed1 < s1Min) s1Min = pt.speed1;
        s1Sum += pt.speed1; s1Count++;
      }
      if (pt.speed2 > 5) {
        if (pt.speed2 > s2Max) s2Max = pt.speed2;
        if (pt.speed2 < s2Min) s2Min = pt.speed2;
        s2Sum += pt.speed2; s2Count++;
      }
    }
    return {
      s1: s1Count ? { max: Math.round(s1Max), min: Math.round(s1Min), avg: Math.round(s1Sum / s1Count) } : { max: "-", min: "-", avg: "-" },
      s2: s2Count ? { max: Math.round(s2Max), min: Math.round(s2Min), avg: Math.round(s2Sum / s2Count) } : { max: "-", min: "-", avg: "-" },
    };
  };

  const stGlobal = useMemo(() => telChart?.length ? getStats(0, 199) : null, [telChart]);
  const stS1 = useMemo(() => telChart?.length && s1Limit > 0 ? getStats(0, s1Limit) : null, [telChart, s1Limit]);
  const stS2 = useMemo(() => telChart?.length && s2Limit > 0 ? getStats(s1Limit, s2Limit) : null, [telChart, s1Limit, s2Limit]);
  const stS3 = useMemo(() => telChart?.length && s2Limit > 0 ? getStats(s2Limit, 199) : null, [telChart, s2Limit]);

  const handleHover = (index) => { if (index !== undefined && index !== null) setHoveredIndex(index); };
  const handleLeave = () => setHoveredIndex(null);

  const formatDelta = (t1, t2) => {
    if (!t1 || !t2) return "-";
    const d = t1 - t2;
    return <span style={{ color: d < 0 ? C.green : C.red }}>{d > 0 ? "+" : ""}{d.toFixed(3)}</span>;
  };

  return (
    <div style={{ padding: "14px 20px 12px", background: C.bg, height: "100%", overflow: "auto", display: "flex", flexDirection: "column" }}>
      {/* Safety Car banner */}
      {lapSC && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, background: C.bBg, border: `1px solid ${C.bLine}`, color: C.b, padding: "8px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          <Icon name="flag" />{lapSC}
        </div>
      )}

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>{t("tel")}{is26 ? " · 2026" : ""}</h2>
        {n1 && <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ width: 18, height: 3, borderRadius: 2, background: c1 }} /><b>A</b> {n1}
          {selLapData?.lap_duration && <span className="num" style={{ color: C.text2 }}>{fmtLap(selLapData.lap_duration)}</span>}
        </span>}
        {cmpDrvObj && (
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 18, borderTop: `3px dashed ${c2}` }} /><b>B</b> {n2}
            {cmpLapData?.lap_duration && <span className="num" style={{ color: C.text2 }}>{fmtLap(cmpLapData.lap_duration)}</span>}
          </span>
        )}
        {cmpDrvObj && selLapData?.lap_duration && cmpLapData?.lap_duration && (() => {
          const d = selLapData.lap_duration - cmpLapData.lap_duration;
          return <span className="num" style={{ fontSize: 13, padding: "3px 8px", borderRadius: 6, background: d <= 0 ? C.greenBg : "#2E1218", color: d <= 0 ? C.green : C.red }}>A {d > 0 ? "+" : "−"}{Math.abs(d).toFixed(3)} s</span>;
        })()}
        <div style={{ flex: 1 }} />
        {onOpenIncident && (
          <button onClick={onOpenIncident} style={{ height: 34, padding: "0 12px", background: "transparent", border: `1px solid ${C.b}`, borderRadius: 8, color: C.b, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="flag" size={14} />{fr ? "Analyse d'incident" : "Incident analysis"}
          </button>
        )}
        {telChart?.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => exportCSV(telChart, `telemetry_lap${curLap}_${n1}`)} style={{ height: 34, padding: "0 12px", background: "transparent", border: `1px solid ${C.lineStrong}`, borderRadius: 8, color: C.text2, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Icon name="download" size={14} />CSV</button>
            <button onClick={() => exportJSON(telChart, `telemetry_lap${curLap}_${n1}`)} style={{ height: 34, padding: "0 12px", background: "transparent", border: `1px solid ${C.lineStrong}`, borderRadius: 8, color: C.text2, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Icon name="download" size={14} />JSON</button>
          </div>
        )}
      </div>

      {/* Comparison stats table: one row per segment, A and B side by side */}
      {cmpDrvObj && stGlobal && stS1 && stS2 && stS3 && (() => {
        const rows = [
          { k: fr ? "Tour" : "Lap", a: selLapData.lap_duration, b: cmpLapData.lap_duration, st: stGlobal, fmt: fmtLap },
          { k: "S1", a: selLapData.duration_sector_1, b: cmpLapData.duration_sector_1, st: stS1 },
          { k: "S2", a: selLapData.duration_sector_2, b: cmpLapData.duration_sector_2, st: stS2 },
          { k: "S3", a: selLapData.duration_sector_3, b: cmpLapData.duration_sector_3, st: stS3 },
        ];
        const cell = { padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" };
        const head = { ...cell, fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.text3 };
        const f = (r, v) => (v ? (r.fmt ? r.fmt(v) : v.toFixed(3)) : "—");
        return (
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "6px 4px", marginBottom: 12, overflowX: "auto" }}>
            <table className="num" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...head, textAlign: "left" }}></th>
                  <th style={head}>A {n1}</th>
                  <th style={head}>B {n2}</th>
                  <th style={head}>Δ A−B</th>
                  <th style={head}>{fr ? "Vit. A max/min/moy" : "A speed max/min/avg"}</th>
                  <th style={head}>{fr ? "Vit. B max/min/moy" : "B speed max/min/avg"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.k} style={{ borderTop: `1px solid ${C.rowLine}` }}>
                    <th scope="row" style={{ ...head, textAlign: "left", color: C.text2 }}>{r.k}</th>
                    <td style={{ ...cell, color: C.text }}>{f(r, r.a)}</td>
                    <td style={{ ...cell, color: C.text }}>{f(r, r.b)}</td>
                    <td style={{ ...cell, fontWeight: 700 }}>{formatDelta(r.a, r.b)}</td>
                    <td style={{ ...cell, color: C.text2 }}>{r.st.s1.max} / {r.st.s1.min} / {r.st.s1.avg}</td>
                    <td style={{ ...cell, color: C.text2 }}>{r.st.s2.max} / {r.st.s2.min} / {r.st.s2.avg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Charts */}
      {telChart.length === 0 ? (
        <div role="status" style={{ color: C.text3, fontSize: 14, padding: "32px 0", textAlign: "center", lineHeight: 1.5 }}>
          {telStatus === "loading" ? (fr ? "Chargement de la télémétrie…" : "Loading telemetry…")
            : telStatus === "error" ? (fr ? "Données de télémétrie incomplètes pour ce tour." : "Telemetry data is incomplete for this lap.")
            : (fr ? "Sélectionnez une session puis un pilote pour afficher la télémétrie." : "Select a session and a driver to see telemetry.")}
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {/* Delta chart (VS only) */}
          {cmpDrvObj && (
            <TelChart
              data={telChart} dk1="delta" isDelta c1="#fff"
              label={fr ? "Delta vitesse A−B" : "Speed delta A−B"} unit=" km/h" domain={["dataMin-5", "dataMax+5"]}
              onHover={handleHover} onLeave={handleLeave}
              s1Limit={s1Limit} s2Limit={s2Limit}
            />
          )}
          <TelChart data={telChart} dk1="speed1" dk2={cmpDrv ? "speed2" : null} c1={c1} c2={c2} n1={n1} n2={n2} label={t("speed")} unit=" km/h" domain={[0, 370]} onHover={handleHover} onLeave={handleLeave} s1Limit={s1Limit} s2Limit={s2Limit} />
          <TelChart data={telChart} dk1="throttle1" dk2={cmpDrv ? "throttle2" : null} c1={c1} c2={c2} n1={n1} n2={n2} label={t("throttle")} unit="%" domain={[0, 100]} onHover={handleHover} onLeave={handleLeave} s1Limit={s1Limit} s2Limit={s2Limit} />
          <TelChart data={telChart} dk1="brake1" dk2={cmpDrv ? "brake2" : null} c1={c1} c2={c2} n1={n1} n2={n2} label={t("brake")} unit="%" domain={[0, 100]} onHover={handleHover} onLeave={handleLeave} s1Limit={s1Limit} s2Limit={s2Limit} />
          <TelChart data={telChart} dk1="gear1" dk2={cmpDrv ? "gear2" : null} c1={c1} c2={c2} n1={n1} n2={n2} label={t("gear")} domain={[0, 9]} onHover={handleHover} onLeave={handleLeave} s1Limit={s1Limit} s2Limit={s2Limit} />
          <TelChart data={telChart} dk1="ers1" dk2={cmpDrv ? "ers2" : null} c1={c1} c2={c2} n1={n1} n2={n2} label={t("ers")} sub={fr ? "↑ récolte ↓ dépl." : "↑ harvest ↓ deploy"} unit="%" domain={[-100, 100]} onHover={handleHover} onLeave={handleLeave} s1Limit={s1Limit} s2Limit={s2Limit} hasBrush />
          <TelChart data={telChart} dk1="gLong1" dk2={cmpDrv ? "gLong2" : null} c1={c1} c2={c2} n1={n1} n2={n2} label={fr ? "G long." : "Long. G"} unit="G" domain={[-4, 4]} onHover={handleHover} onLeave={handleLeave} s1Limit={s1Limit} s2Limit={s2Limit} />
        </div>
      )}
    </div>
  );
}