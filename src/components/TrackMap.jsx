import { useState, useEffect } from "react";
import { ERS_C } from "../api";


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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#444" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>🏎️</div>
          <div style={{ fontFamily: "var(--f)", fontSize: 11 }}>Select GP → Session</div>
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
      {/* Top-right button group */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 10, display: "flex", gap: 4, alignItems: "center" }}>
        {currentCarData?.length > 10 && corners?.length > 0 && (
          <button onClick={() => setShowBrakeMarkers((p) => !p)} style={{ background: showBrakeMarkers ? "#1a0800" : "#1a1a1a", border: `1px solid ${showBrakeMarkers ? "#FF6600" : "#333"}`, color: showBrakeMarkers ? "#FF6600" : "#888", padding: "4px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>
            ⎔ BRAKE
          </button>
        )}
        {currentCarData?.length > 10 && (
          <button onClick={() => setShowAero((p) => !p)} style={{ background: showAero ? "#001a1a" : "#1a1a1a", border: `1px solid ${showAero ? "#00E5FF" : "#333"}`, color: showAero ? "#00E5FF" : "#888", padding: "4px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>
            ⚡ AERO
          </button>
        )}
        {telChart?.length > 10 && (
          <button onClick={() => setAnimIdx(animIdx !== null ? null : 0)} style={{ background: "#1a1a1a", border: "1px solid #333", color: "#ccc", padding: "4px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            {animIdx !== null ? "⏹ STOP" : "🔄 REPLAY"}
          </button>
        )}
      </div>

      {/* Metric selector in VS mode */}
      {cmpDrv && setMapMetric && (
        <div style={{ position: "absolute", top: 10, left: 12, zIndex: 10, display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#888", fontFamily: "var(--f)", fontWeight: 600 }}>
            🔴 {t("dom")} :
          </span>
          <select
            value={mapMetric}
            onChange={(e) => setMapMetric(e.target.value)}
            style={{ background: "#141414", color: "#aaa", border: "1px solid #1e1e1e", borderRadius: 4, padding: "2px 4px", fontSize: 10, fontFamily: "var(--f)", outline: "none" }}
          >
            <option value="speed">{t("speed")}</option>
            <option value="throttle">{t("throttle")}</option>
            <option value="brake">{t("brake")}</option>
          </select>
        </div>
      )}

      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "100%" }}>
        <defs>
          <filter id="gl">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Track base */}
        <path d={pathD} fill="none" stroke="#1a1a1a" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathD} fill="none" stroke="#262626" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />

        {/* Colored segments (ERS or VS dominance) */}
        {el.map((l) => (
          <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.c} strokeWidth="5" strokeLinecap="round" opacity={0.85} filter="url(#gl)" />
        ))}

        {/* Active aero zones */}
        {aeroEl.map((l) => (
          <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#00E5FF" strokeWidth="7" strokeLinecap="round" opacity={0.65} filter="url(#gl)" />
        ))}

        {/* Brake initiation markers */}
        {brakeMarkers.map((m) => (
          <g key={`brake-${m.corner}`} style={{ pointerEvents: "none" }}>
            <polygon points={`${m.pt.x},${m.pt.y - 7} ${m.pt.x - 5},${m.pt.y + 4} ${m.pt.x + 5},${m.pt.y + 4}`} fill="#FF6600" opacity={0.9} />
          </g>
        ))}

        {/* Track center line */}
        <path d={pathD} fill="none" stroke="#3a3a3a" strokeWidth=".6" strokeDasharray="3 7" />

        {/* Corner markers */}
        {corners?.map((c) => {
          const p = N(c.trackPosition.x, c.trackPosition.y);
          return (
            <g key={c.number}>
              <circle cx={p.x} cy={p.y} r="7" fill="#151515" stroke="#333" strokeWidth=".5" />
              <text x={p.x} y={p.y + 3} textAnchor="middle" style={{ fontSize: 7, fill: "#555", fontFamily: "var(--f)" }}>{c.number}</text>
            </g>
          );
        })}

        {/* Driver dots */}
        {dots.map((d, i) => {
          const isSel = d.dn === selDrv;
          const isCmp = d.dn === cmpDrv;
          return (
            <g key={i} onClick={() => onSelect(d.dn)} style={{ cursor: "pointer", transition: animIdx !== null ? "all 0.03s linear" : "none" }}>
              {(isSel || isCmp) && <circle cx={d.cx} cy={d.cy} r="16" fill={d.color} opacity=".15" />}
              <circle cx={d.cx} cy={d.cy} r={isSel ? 9 : isCmp ? 7 : 5.5} fill={d.color} stroke={(isSel || isCmp) ? "#fff" : "#0a0a0a"} strokeWidth={(isSel || isCmp) ? 2 : 1} filter="url(#gl)" />
              <text x={d.cx} y={d.cy - (isSel ? 14 : 10)} textAnchor="middle" style={{ fontSize: 10, fill: "#ccc", fontFamily: "var(--f)", fontWeight: 700 }}>{d.acr}</text>
            </g>
          );
        })}

        {/* Sector markers: S1 */}
        {pts.length > 0 && (
          <g transform={`translate(${pts[0].x}, ${pts[0].y})`}>
            <circle r="7" fill="#E8002D" stroke="#fff" strokeWidth="1.5" />
            <text y="2.5" fontSize="7" fill="#fff" textAnchor="middle" fontFamily="var(--f)" fontWeight="bold">S1</text>
          </g>
        )}
        {/* S2 marker */}
        {pts.length > 0 && pts[idxS1] && s1Ratio > 0 && (
          <g transform={`translate(${pts[idxS1].x}, ${pts[idxS1].y})`}>
            <circle r="7" fill="#111" stroke="#fff" strokeWidth="1.5" />
            <text y="2.5" fontSize="7" fill="#fff" textAnchor="middle" fontFamily="var(--f)" fontWeight="bold">S2</text>
          </g>
        )}
        {/* S3 marker */}
        {pts.length > 0 && pts[idxS2] && s2Ratio > 0 && (
          <g transform={`translate(${pts[idxS2].x}, ${pts[idxS2].y})`}>
            <circle r="7" fill="#111" stroke="#fff" strokeWidth="1.5" />
            <text y="2.5" fontSize="7" fill="#fff" textAnchor="middle" fontFamily="var(--f)" fontWeight="bold">S3</text>
          </g>
        )}

        {/* Hover dot from telemetry sync */}
        {hoverDot && (
          <g style={{ pointerEvents: "none" }}>
            <circle cx={hoverDot.x} cy={hoverDot.y} r="8" fill="none" stroke="#fff" strokeWidth="2" filter="url(#gl)" opacity={0.8} />
            <circle cx={hoverDot.x} cy={hoverDot.y} r="4" fill="#fff" />
          </g>
        )}

        {/* Header label */}
        {!cmpDrv && (
          <text x={12} y={22} style={{ fontSize: 12, fill: "#888", fontFamily: "var(--f)", fontWeight: 600 }}>
            ⚡ {t("ers_state")}
          </text>
        )}
        <text x={w - 12} y={22} textAnchor="end" style={{ fontSize: 12, fill: "#E8002D", fontFamily: "var(--f)", fontWeight: 700 }}>
          {t("lap").toUpperCase()} {currentLap}
        </text>

        {/* Aero / brake overlay legends */}
        {showAero && (
          <g transform={`translate(12, ${cmpDrv ? 74 : 118})`}>
            <line x1="0" y1="4" x2="14" y2="4" stroke="#00E5FF" strokeWidth="4" strokeLinecap="round" />
            <text x="20" y="7" style={{ fontSize: 8, fill: "#00E5FF", fontFamily: "var(--f)", fontWeight: 700 }}>ACTIVE AERO</text>
          </g>
        )}
        {showBrakeMarkers && (
          <g transform={`translate(12, ${(cmpDrv ? 74 : 118) + (showAero ? 14 : 0)})`}>
            <polygon points="7,0 12,9 2,9" fill="#FF6600" />
            <text x="20" y="7" style={{ fontSize: 8, fill: "#FF6600", fontFamily: "var(--f)", fontWeight: 700 }}>BRAKE ZONES</text>
          </g>
        )}

        {/* Legend */}
        <g transform="translate(12, 40)">
          {cmpDrv ? (
            <>
              <g transform="translate(0, 0)">
                <circle cx="4" cy="4" r="4" fill={c1} />
                <text x="14" y="8" style={{ fontSize: 9, fill: "#ccc", fontFamily: "var(--f)", fontWeight: 700 }}>
                  {selDrvObj?.name_acronym} ({t("faster")})
                </text>
              </g>
              <g transform="translate(0, 16)">
                <circle cx="4" cy="4" r="4" fill={c2} />
                <text x="14" y="8" style={{ fontSize: 9, fill: "#ccc", fontFamily: "var(--f)", fontWeight: 700 }}>
                  {cmpDrvObj?.name_acronym} ({t("faster")})
                </text>
              </g>
            </>
          ) : (
            ["deploy", "harvest", "clip", "superclip", "coast"].map((k, i) => (
              <g key={k} transform={`translate(0, ${i * 14})`}>
                <line x1="0" y1="4" x2="12" y2="4" stroke={ERS_C[k]} strokeWidth="4" strokeLinecap="round" />
                <text x="18" y="7" style={{ fontSize: 8, fill: "#999", fontFamily: "var(--f)" }}>{t(k)}</text>
              </g>
            ))
          )}
        </g>
      </svg>
    </div>
  );
}