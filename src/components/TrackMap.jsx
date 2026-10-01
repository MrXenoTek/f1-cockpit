import { useState, useEffect } from "react";
import { ERS_C } from "../api";
import { C, FONT_UI } from "../theme";

const chip = (on, col = C.a) => ({
  height: 36, padding: "0 12px", borderRadius: 9, fontSize: 13, fontWeight: 600,
  background: on ? C.aBg : C.raised, border: `1px solid ${on ? col : C.lineStrong}`,
  color: on ? C.text : C.text2, display: "flex", alignItems: "center", gap: 6,
});


export default function TrackMap({
  trackX, trackY, corners, ersSegs, currentLap, driverDots,
  selDrv, cmpDrv, onSelect, telChart, c1, c2,
  selDrvObj, cmpDrvObj, hoveredIndex, s1Ratio, s2Ratio, t,
  mapMetric, setMapMetric, currentCarData = [],
}) {
  const [animIdx, setAnimIdx] = useState(null);
  const [showAero, setShowAero] = useState(false);
  const [showBrakeMarkers, setShowBrakeMarkers] = useState(false);

  useEffect(() => {
    let timer;
    if (animIdx !== null && animIdx < 199) {
      timer = setTimeout(() => setAnimIdx((p) => p + 1), 30);
    } else if (animIdx >= 199) {
      timer = setTimeout(() => setAnimIdx(null), 1000);
    }
    return () => clearTimeout(timer);
  }, [animIdx]);

  if (!trackX?.length || trackX.length < 10) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <svg width="56" height="40" viewBox="0 0 56 40" fill="none" aria-hidden="true" style={{ marginBottom: 12 }}><path d="M6 32h30l8-4 4-8-4-6H30l-6-6-10 2-6 8 4 6z" stroke={C.lineStrong} strokeWidth="3" strokeLinejoin="round" /></svg>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>{t("track")}</div>
          <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.5 }}>{t("emptyStandings")}</div>
        </div>
      </div>
    );
  }

  const mnX = Math.min(...trackX), mxX = Math.max(...trackX);
  const mnY = Math.min(...trackY), mxY = Math.max(...trackY);
  const rX = mxX - mnX || 1, rY = mxY - mnY || 1, pad = 50, w = 640, h = 500;
  const N = (x, y) => ({ x: pad + ((x - mnX) / rX) * (w - 2 * pad), y: pad + ((y - mnY) / rY) * (h - 2 * pad) });
  const pts = trackX.map((x, i) => N(x, trackY[i]));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";

  // Build colored track segments
  const el = [];
  if (cmpDrv && telChart?.length > 10) {
    const tLen = telChart.length;
    const metricKey1 = `${mapMetric}1`;
    const metricKey2 = `${mapMetric}2`;
    const threshold = mapMetric === "speed" ? 1 : 5;
    for (let i = 1; i < tLen; i++) {
      const pt = telChart[i];
      const val1 = pt[metricKey1], val2 = pt[metricKey2];
      if (val1 == null || val2 == null) continue;
      if (Math.abs(val1 - val2) < threshold) continue;
      const color = val1 > val2 ? c1 : c2;
      const a = Math.floor(((i - 1) / tLen) * pts.length);
      const b = Math.min(Math.floor((i / tLen) * pts.length), pts.length - 1);
      el.push({ x1: pts[a].x, y1: pts[a].y, x2: pts[b].x, y2: pts[b].y, c: color, k: `ms-${i}` });
    }
  } else if (ersSegs?.length > 2) {
    const tLen = ersSegs.length;
    for (let i = 1; i < tLen; i++) {
      const tp = ersSegs[i].type;
      if (tp === "neutral") continue;
      const a = Math.floor(((i - 1) / tLen) * pts.length);
      const b = Math.min(Math.floor((i / tLen) * pts.length), pts.length - 1);
      el.push({ x1: pts[a].x, y1: pts[a].y, x2: pts[b].x, y2: pts[b].y, c: ERS_C[tp], k: `ers-${i}` });
    }
  }

  // Active aero segments (drs >= 10 = aero open)
  const aeroEl = [];
  if (showAero && currentCarData?.length > 20) {
    const step = Math.max(1, Math.floor(currentCarData.length / 300));
    const sampled = currentCarData.filter((_, i) => i % step === 0);
    const tLen = sampled.length;
    for (let i = 1; i < tLen; i++) {
      if (((sampled[i].drs) ?? 0) < 10) continue;
      const a = Math.floor(((i - 1) / tLen) * pts.length);
      const b = Math.min(Math.floor((i / tLen) * pts.length), pts.length - 1);
      aeroEl.push({ x1: pts[a].x, y1: pts[a].y, x2: pts[b].x, y2: pts[b].y, k: `aero-${i}` });
    }
  }

  // Brake initiation markers per corner
  const brakeMarkers = [];
  if (showBrakeMarkers && currentCarData?.length > 20 && corners?.length && trackX?.length) {
    for (const corner of corners) {
      const cx = corner.trackPosition.x, cy = corner.trackPosition.y;
      let minDist = Infinity, nearestIdx = 0;
      for (let i = 0; i < trackX.length; i++) {
        const d = Math.hypot(trackX[i] - cx, trackY[i] - cy);
        if (d < minDist) { minDist = d; nearestIdx = i; }
      }
      const progress = nearestIdx / trackX.length;
      const telIdx = Math.floor(progress * currentCarData.length);
      const lookback = Math.floor(currentCarData.length * 0.04);
      for (let i = Math.max(1, telIdx - lookback); i < telIdx; i++) {
        const p = currentCarData[i], prev = currentCarData[i - 1];
        if (p?.brake > 25 && (prev?.brake ?? 0) <= 25) {
          const bp = Math.min(Math.floor((i / currentCarData.length) * pts.length), pts.length - 1);
          brakeMarkers.push({ pt: pts[Math.max(0, bp)], corner: corner.number });
          break;
        }
      }
    }
  }

  // Driver dots with replay logic
  const visibleDots = cmpDrv
    ? driverDots.filter((d) => d.dn === selDrv || d.dn === cmpDrv).sort((a, b) => (a.dn === selDrv ? -1 : 1))
    : driverDots;
  const selDot = driverDots.find((x) => x.dn === selDrv);
  const selBaseProg = selDot ? selDot.progress : 0;

  const dots = visibleDots.map((d) => {
    let p;
    const isCmpDot = d.dn === cmpDrv;
    if (animIdx !== null) {
      const baseAnimProg = animIdx / 199;
      let currentProg;

      if (cmpDrv) {
        // VS mode: both advance at same normalized speed through the lap
        // Small offset to make them visually distinct even when overlapping
        currentProg = baseAnimProg;
      } else if (d.dn === selDrv) {
        // Selected driver: sweeps the full lap 0→1
        currentProg = baseAnimProg;
      } else {
        // Other drivers: keep their gap relative to selected driver
        const rawOffset = d.progress - selBaseProg;
        // Normalize to [-0.5, 0.5] so we go the shortest way around the track
        const offset = rawOffset - Math.round(rawOffset);
        currentProg = ((baseAnimProg + offset) % 1 + 1) % 1;
      }

      const ptsIndex = Math.min(Math.floor(currentProg * (pts.length - 1)), pts.length - 1);
      p = pts[Math.max(0, ptsIndex)];
    } else {
      const idx = Math.min(Math.floor(d.progress * pts.length), pts.length - 1);
      p = pts[Math.max(0, idx)];
    }
    // VS replay: offset cmpDrv dot slightly so both are visible
    const offsetX = (isCmpDot && cmpDrv && animIdx !== null) ? 7 : 0;
    const offsetY = (isCmpDot && cmpDrv && animIdx !== null) ? -7 : 0;
    return { ...d, cx: p.x + offsetX, cy: p.y + offsetY };
  });

  // Hover dot from telemetry sync
  let hoverDot = null;
  if (hoveredIndex != null && pts.length > 0) {
    const ptsIndex = Math.min(Math.floor((hoveredIndex / 199) * (pts.length - 1)), pts.length - 1);
    hoverDot = pts[Math.max(0, ptsIndex)];
  }

  const idxS1 = pts.length > 0 ? Math.floor(s1Ratio * (pts.length - 1)) : 0;
  const idxS2 = pts.length > 0 ? Math.floor(s2Ratio * (pts.length - 1)) : 0;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Map toolbar: domination metric (VS mode) on the left, overlays on the right */}
      <div style={{ position: "absolute", top: 12, left: 12, right: 12, zIndex: 10, display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Metric selector in VS mode */}
      {cmpDrv && setMapMetric && (
        <div role="group" aria-label={t("dom")} style={{ display: "flex", gap: 2, padding: 3, alignItems: "center", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 9 }}>
          <span style={{ fontSize: 12, color: C.text3, padding: "0 8px" }}>{t("dom")}</span>
          {["speed", "throttle", "brake"].map((m) => (
            <button key={m} aria-pressed={mapMetric === m} onClick={() => setMapMetric(m)} style={{ height: 32, padding: "0 10px", border: "none", borderRadius: 6, background: mapMetric === m ? C.selected : "transparent", color: mapMetric === m ? C.text : C.text2, fontSize: 13, fontWeight: 600 }}>{t(m)}</button>
          ))}
        </div>
      )}

      {/* Top-right button group */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
        {currentCarData?.length > 10 && corners?.length > 0 && (
          <button onClick={() => setShowBrakeMarkers((p) => !p)} aria-pressed={showBrakeMarkers} style={chip(showBrakeMarkers, C.red)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><polygon points="6,1 11,10 1,10" fill={C.red} /></svg>{t("brakeZones")}
          </button>
        )}
        {currentCarData?.length > 10 && (
          <button onClick={() => setShowAero((p) => !p)} aria-pressed={showAero} style={chip(showAero, "#00E5FF")}>
            <span style={{ width: 14, height: 4, borderRadius: 2, background: "#00E5FF" }} />{t("activeAero")}
          </button>
        )}
        {telChart?.length > 10 && (
          <button onClick={() => setAnimIdx(animIdx !== null ? null : 0)} aria-pressed={animIdx !== null} style={chip(animIdx !== null)}>
            {animIdx !== null ? t("stopLap") : t("animateLap")}
          </button>
        )}
      </div>

      </div>

      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "100%" }}>
        <defs>
          <filter id="gl">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Track base */}
        <path d={pathD} fill="none" stroke="#1C2026" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathD} fill="none" stroke="#2A303A" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />

        {/* Colored segments (ERS or VS dominance) */}
        {el.map((l) => (
          <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.c} strokeWidth="6" strokeLinecap="round" opacity={0.95} filter="url(#gl)" />
        ))}

        {/* Active aero zones */}
        {aeroEl.map((l) => (
          <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#00E5FF" strokeWidth="7" strokeLinecap="round" opacity={0.65} filter="url(#gl)" />
        ))}

        {/* Brake initiation markers */}
        {brakeMarkers.map((m) => (
          <g key={`brake-${m.corner}`} style={{ pointerEvents: "none" }}>
            <polygon points={`${m.pt.x},${m.pt.y - 7} ${m.pt.x - 5},${m.pt.y + 4} ${m.pt.x + 5},${m.pt.y + 4}`} fill="#FF4D6A" opacity={0.95} />
          </g>
        ))}

        {/* Track center line */}
        <path d={pathD} fill="none" stroke="#4A515C" strokeWidth=".6" strokeDasharray="3 7" />

        {/* Corner markers */}
        {corners?.map((c) => {
          const p = N(c.trackPosition.x, c.trackPosition.y);
          return (
            <g key={c.number}>
              <circle cx={p.x} cy={p.y} r="9" fill="#15181D" stroke="#4A515C" strokeWidth="1" />
              <text x={p.x} y={p.y + 3.5} textAnchor="middle" style={{ fontSize: 10, fill: "#A9B0BB", fontFamily: FONT_UI, fontWeight: 600 }}>{c.number}</text>
            </g>
          );
        })}

        {/* Driver dots */}
        {dots.map((d, i) => {
          const isSel = d.dn === selDrv;
          const isCmp = d.dn === cmpDrv;
          return (
            <g key={i} onClick={() => onSelect(d.dn)} style={{ cursor: "pointer", transition: animIdx !== null ? "all 0.03s linear" : "none" }}>
              <title>{d.acr}</title>
              <circle cx={d.cx} cy={d.cy} r="14" fill="transparent" />
              {(isSel || isCmp) && <circle cx={d.cx} cy={d.cy} r="16" fill={isSel ? C.a : C.b} opacity=".18" />}
              <circle cx={d.cx} cy={d.cy} r={isSel ? 9 : isCmp ? 8 : 5.5} fill={isSel ? C.a : isCmp ? C.b : d.color} stroke={C.bg} strokeWidth={(isSel || isCmp) ? 3 : 1.5} />
              {(isSel || isCmp) ? (
                <g>
                  <rect x={d.cx - 22} y={d.cy - 36} width="44" height="22" rx="5" fill={isSel ? C.a : C.b} />
                  <text x={d.cx} y={d.cy - 20.5} textAnchor="middle" style={{ fontSize: 12, fill: C.bg, fontFamily: FONT_UI, fontWeight: 700 }}>{d.acr}</text>
                </g>
              ) : (
                <text x={d.cx} y={d.cy - 10} textAnchor="middle" style={{ fontSize: 11, fill: "#A9B0BB", fontFamily: FONT_UI, fontWeight: 600 }}>{d.acr}</text>
              )}
            </g>
          );
        })}

        {/* Sector markers: S1 */}
        {pts.length > 0 && (
          <g transform={`translate(${pts[0].x}, ${pts[0].y})`}>
            <circle r="9" fill="#D10029" stroke="#fff" strokeWidth="1.5" />
            <text y="3.5" fontSize="9" fill="#fff" textAnchor="middle" fontFamily={FONT_UI} fontWeight="bold">S1</text>
          </g>
        )}
        {/* S2 marker */}
        {pts.length > 0 && pts[idxS1] && s1Ratio > 0 && (
          <g transform={`translate(${pts[idxS1].x}, ${pts[idxS1].y})`}>
            <circle r="9" fill="#15181D" stroke="#fff" strokeWidth="1.5" />
            <text y="3.5" fontSize="9" fill="#fff" textAnchor="middle" fontFamily={FONT_UI} fontWeight="bold">S2</text>
          </g>
        )}
        {/* S3 marker */}
        {pts.length > 0 && pts[idxS2] && s2Ratio > 0 && (
          <g transform={`translate(${pts[idxS2].x}, ${pts[idxS2].y})`}>
            <circle r="9" fill="#15181D" stroke="#fff" strokeWidth="1.5" />
            <text y="3.5" fontSize="9" fill="#fff" textAnchor="middle" fontFamily={FONT_UI} fontWeight="bold">S3</text>
          </g>
        )}

        {/* Hover dot from telemetry sync */}
        {hoverDot && (
          <g style={{ pointerEvents: "none" }}>
            <circle cx={hoverDot.x} cy={hoverDot.y} r="8" fill="none" stroke="#fff" strokeWidth="2" filter="url(#gl)" opacity={0.8} />
            <circle cx={hoverDot.x} cy={hoverDot.y} r="4" fill="#fff" />
          </g>
        )}

      </svg>

      {/* Legend — HTML so it keeps its size when the map scales */}
      <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 5, display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "#0D0F12E6", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, color: C.text, fontFamily: FONT_UI, pointerEvents: "none" }}>
        <div style={{ fontSize: 12, color: C.text3, fontWeight: 600 }}>
          {cmpDrv ? `${t("dom")} · ${t(mapMetric)}` : `${t("ers_state")}${selDrvObj ? ` · ${selDrvObj.name_acronym}` : ""}`} · {t("lap")} {currentLap}
        </div>
        {cmpDrv ? (
          <>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 18, height: 5, borderRadius: 3, background: c1 }} />A {selDrvObj?.name_acronym} {t("faster")}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 18, height: 5, borderRadius: 3, background: c2 }} />B {cmpDrvObj?.name_acronym} {t("faster")}</span>
          </>
        ) : (
          ["deploy", "harvest", "clip", "superclip", "coast"].map((k) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {k === "coast"
                ? <span style={{ width: 18, borderTop: `3px dotted ${ERS_C[k]}` }} />
                : <span style={{ width: 18, height: 5, borderRadius: 3, background: ERS_C[k] }} />}
              {t(k)}
            </span>
          ))
        )}
        {showAero && <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 18, height: 5, borderRadius: 3, background: "#00E5FF" }} />{t("activeAero")}</span>}
        {showBrakeMarkers && <span style={{ display: "flex", alignItems: "center", gap: 8 }}><svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true"><polygon points="9,0 14,10 4,10" fill="#FF4D6A" /></svg>{t("brakeZones")}</span>}
      </div>
    </div>
  );
}