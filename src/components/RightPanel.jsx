import { useMemo, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ScatterChart, Scatter, ZAxis } from "recharts";
import { tc, COMP_C, fmtLap } from "../api";

// Typical compound life in laps (for pit window predictor)
const COMPOUND_LIFE = { SOFT: 22, MEDIUM: 35, HARD: 50, INTERMEDIATE: 40, WET: 60 };

export default function RightPanel({
  tab, setTab, filtRadios, rCtrl, weather, curWeather,
  drivers, maxLap, rfDrv, setRfDrv, rfLap, setRfLap, ss, t, lang,
  pits, stints, selDrv, cmpDrv, laps, bestSectors, standings, curLap,
  gapData, overtakesPerLap, cornerSpeeds = [],
}) {
  const [bestLapNavSector, setBestLapNavSector] = useState("s1");
  const [showFuelCorr, setShowFuelCorr] = useState(false);

  const drvLaps = useMemo(
    () => laps.filter((l) => l.driver_number === selDrv).sort((a, b) => b.lap_number - a.lap_number),
    [laps, selDrv]
  );

  const cmpLaps = useMemo(
    () => (cmpDrv ? laps.filter((l) => l.driver_number === cmpDrv) : []),
    [laps, cmpDrv]
  );

  const allPits = useMemo(() => {
    if (!pits.length) return [];
    return pits.map((p) => {
      const stintAfter = stints.find((s) => s.driver_number === p.driver_number && s.lap_start === p.lap_number + 1);
      return { ...p, compound: stintAfter?.compound };
    }).sort((a, b) => b.lap_number - a.lap_number);
  }, [pits, stints]);

  const drvPits = useMemo(() => allPits.filter((p) => p.driver_number === selDrv), [allPits, selDrv]);

  const paceData = useMemo(() => {
    const data = [];
    const threshold = bestSectors.lap * 1.15;
    for (let i = 1; i <= maxLap; i++) {
      const l1 = laps.find((l) => l.lap_number === i && l.driver_number === selDrv);
      const l2 = cmpDrv ? laps.find((l) => l.lap_number === i && l.driver_number === cmpDrv) : null;
      const fuelCorr = showFuelCorr ? (maxLap - i) * 0.035 : 0;
      let t1 = l1?.lap_duration; if (t1 > threshold) t1 = null;
      let t2 = l2?.lap_duration; if (t2 > threshold) t2 = null;
      if (t1) t1 = parseFloat((t1 - fuelCorr).toFixed(3));
      if (t2) t2 = parseFloat((t2 - fuelCorr).toFixed(3));
      if (t1 || t2) data.push({ lap: i, t1, t2 });
    }
    return data;
  }, [laps, selDrv, cmpDrv, maxLap, bestSectors.lap, showFuelCorr]);

  const strategyInsights = useMemo(() => {
    if (!selDrv || drvLaps.length === 0) return null;
    const lastPitLap = drvPits.find((p) => p.lap_number <= curLap)?.lap_number || 0;
    const currentStintLaps = drvLaps
      .filter((l) => l.lap_number > lastPitLap && l.lap_number <= curLap && l.lap_duration && l.lap_duration < bestSectors.lap * 1.05)
      .sort((a, b) => a.lap_number - b.lap_number);
    if (currentStintLaps.length < 3) return { msg: "Pas assez de données sur ce relais", slope: 0, lapsOnTyre: curLap - lastPitLap };
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = currentStintLaps.length;
    currentStintLaps.forEach((l, i) => { sumX += i; sumY += l.lap_duration; sumXY += i * l.lap_duration; sumX2 += i * i; });
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const predictedTimeIn5Laps = slope * (n + 4) + intercept;
    const currentCompound = stints.find((s) => s.driver_number === selDrv && s.lap_start <= curLap && (!s.lap_end || s.lap_end >= curLap))?.compound || "Unknown";
    return { slope, predictedTimeIn5Laps, compound: currentCompound, lapsOnTyre: curLap - lastPitLap };
  }, [drvLaps, drvPits, curLap, bestSectors.lap, stints, selDrv]);

  const getColor = (val, best, pb) => {
    if (!val) return "#444";
    if (val <= best) return "#B366FF";
    if (val <= pb) return "#00D26A";
    return "#FFD600";
  };

  const pb = useMemo(() => {
    let s1 = 999, s2 = 999, s3 = 999, lap = 9999;
    drvLaps.forEach((l) => {
      if (l.duration_sector_1 && l.duration_sector_1 < s1) s1 = l.duration_sector_1;
      if (l.duration_sector_2 && l.duration_sector_2 < s2) s2 = l.duration_sector_2;
      if (l.duration_sector_3 && l.duration_sector_3 < s3) s3 = l.duration_sector_3;
      if (l.lap_duration && l.lap_duration < lap) lap = l.lap_duration;
    });
    return { s1, s2, s3, lap };
  }, [drvLaps]);

  const selDrvObj = drivers.find((d) => d.driver_number === selDrv);
  const cmpDrvObj = drivers.find((d) => d.driver_number === cmpDrv);
  const c1 = tc(selDrvObj?.team_name) || "#00D4FF";
  let c2 = tc(cmpDrvObj?.team_name) || "#FF8C00";
  if (c1 === c2) c2 = "#ffffff";

  // Theoretical best lap
  const theoreticalBest = useMemo(() => {
    if (!laps.length) return null;
    let bestS1Drv = null, bestS2Drv = null, bestS3Drv = null;
    let bestS1 = 999, bestS2 = 999, bestS3 = 999;
    laps.forEach((l) => {
      if (l.duration_sector_1 && l.duration_sector_1 < bestS1) {
        bestS1 = l.duration_sector_1;
        const d = drivers.find((dr) => dr.driver_number === l.driver_number);
        bestS1Drv = d ? { acr: d.name_acronym, color: tc(d.team_name) } : null;
      }
      if (l.duration_sector_2 && l.duration_sector_2 < bestS2) {
        bestS2 = l.duration_sector_2;
        const d = drivers.find((dr) => dr.driver_number === l.driver_number);
        bestS2Drv = d ? { acr: d.name_acronym, color: tc(d.team_name) } : null;
      }
      if (l.duration_sector_3 && l.duration_sector_3 < bestS3) {
        bestS3 = l.duration_sector_3;
        const d = drivers.find((dr) => dr.driver_number === l.driver_number);
        bestS3Drv = d ? { acr: d.name_acronym, color: tc(d.team_name) } : null;
      }
    });
    if (bestS1 === 999 || bestS2 === 999 || bestS3 === 999) return null;
    return {
      s1: bestS1, s2: bestS2, s3: bestS3,
      total: bestS1 + bestS2 + bestS3,
      s1Drv: bestS1Drv, s2Drv: bestS2Drv, s3Drv: bestS3Drv,
    };
  }, [laps, drivers]);

  // Stint timeline data: sorted drivers with their stints
  const stintTimeline = useMemo(() => {
    if (!drivers.length || !stints.length) return [];
    const sorted = [...drivers].sort((a, b) => {
      const posA = stints.filter((s) => s.driver_number === a.driver_number).length ? 1 : 99;
      const posB = stints.filter((s) => s.driver_number === b.driver_number).length ? 1 : 99;
      return posA - posB;
    });
    return sorted.map((d) => {
      const drvStints = stints
        .filter((s) => s.driver_number === d.driver_number)
        .sort((a, b) => a.lap_start - b.lap_start);
      return { driver: d, stints: drvStints };
    }).filter((row) => row.stints.length > 0).slice(0, 12);
  }, [drivers, stints]);

  // Pit window predictor
  const pitWindow = useMemo(() => {
    if (!strategyInsights || !strategyInsights.compound || strategyInsights.compound === "Unknown") return null;
    const life = COMPOUND_LIFE[strategyInsights.compound.toUpperCase()] || 35;
    const lapsOnTyre = strategyInsights.lapsOnTyre || 0;
    const remaining = life - lapsOnTyre;
    let status = "green";
    if (remaining <= 0) status = "red";
    else if (remaining <= 5) status = "red";
    else if (remaining <= 10) status = "yellow";
    return { remaining, life, lapsOnTyre, status, compound: strategyInsights.compound };
  }, [strategyInsights]);

  // Undercut calculator
  const undercutInfo = useMemo(() => {
    if (!cmpDrv || !strategyInsights || strategyInsights.slope <= 0) return null;
    const cmpStint = stints.find((s) => s.driver_number === cmpDrv && s.lap_start <= curLap && (!s.lap_end || s.lap_end >= curLap));
    const cmpLastPit = allPits.find((p) => p.driver_number === cmpDrv && p.lap_number <= curLap);
    const cmpLapsOnTyre = cmpLastPit ? curLap - cmpLastPit.lap_number : curLap;
    const cmpCompound = cmpStint?.compound || "Unknown";
    const cmpLife = COMPOUND_LIFE[cmpCompound.toUpperCase()] || 35;
    const selDeg = strategyInsights.slope;
    // If sel driver has higher degradation, undercut may be favorable
    const undercutFavorable = selDeg > 0.05 && cmpLapsOnTyre > cmpLife * 0.6;
    return {
      favorable: undercutFavorable,
      cmpLapsOnTyre,
      cmpCompound,
      selDeg,
    };
  }, [cmpDrv, strategyInsights, stints, allPits, curLap]);

  // Constructor pace comparison
  const constructorPace = useMemo(() => {
    if (!laps.length || !drivers.length || bestSectors.lap >= 9999) return [];
    const threshold = bestSectors.lap * 1.1;
    const teamLaps = {};
    laps.forEach((l) => {
      if (!l.lap_duration || l.lap_duration > threshold) return;
      const drv = drivers.find((d) => d.driver_number === l.driver_number);
      if (!drv) return;
      const team = drv.team_name;
      if (!teamLaps[team]) teamLaps[team] = [];
      teamLaps[team].push(l.lap_duration);
    });
    return Object.entries(teamLaps).map(([team, times]) => {
      const sorted = [...times].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      return { team, median, count: times.length };
    }).sort((a, b) => a.median - b.median);
  }, [laps, drivers, bestSectors.lap]);

  // Tyre degradation scatter data (all stints, per compound)
  const degradationData = useMemo(() => {
    if (!stints.length || !laps.length || bestSectors.lap >= 9999) return [];
    const threshold = bestSectors.lap * 1.1;
    const result = [];
    stints.forEach((s) => {
      if (!s.compound) return;
      const stintLaps = laps.filter((l) =>
        l.driver_number === s.driver_number &&
        l.lap_number >= s.lap_start &&
        (s.lap_end ? l.lap_number <= s.lap_end : true) &&
        l.lap_duration && l.lap_duration < threshold
      );
      stintLaps.forEach((l) => {
        const age = (s.tyre_age_at_start || 0) + (l.lap_number - s.lap_start);
        result.push({ x: age, y: l.lap_duration, compound: s.compound });
      });
    });
    return result;
  }, [stints, laps, bestSectors.lap]);

  // Penalties from race control
  const penalties = useMemo(() => {
    const keywords = ["PENALTY", "DRIVE THROUGH", "STOP AND GO", "DISQUALIF", "REPRIMAND", "BLACK FLAG"];
    return rCtrl.filter((m) => keywords.some((kw) => (m.message || "").toUpperCase().includes(kw)));
  }, [rCtrl]);

  // Best lap composite per sector for selDrv
  const bestLapComposite = useMemo(() => {
    if (!drvLaps.length) return null;
    let bestS1Lap = null, bestS2Lap = null, bestS3Lap = null;
    let bestS1 = 999, bestS2 = 999, bestS3 = 999;
    drvLaps.forEach((l) => {
      if (l.duration_sector_1 && l.duration_sector_1 < bestS1) { bestS1 = l.duration_sector_1; bestS1Lap = l.lap_number; }
      if (l.duration_sector_2 && l.duration_sector_2 < bestS2) { bestS2 = l.duration_sector_2; bestS2Lap = l.lap_number; }
      if (l.duration_sector_3 && l.duration_sector_3 < bestS3) { bestS3 = l.duration_sector_3; bestS3Lap = l.lap_number; }
    });
    return { bestS1Lap, bestS2Lap, bestS3Lap, bestS1, bestS2, bestS3 };
  }, [drvLaps]);

  // Radar chart data (normalized sector times, consistency)
  const radarData = useMemo(() => {
    const calcMetrics = (drvLapsArr) => {
      if (!drvLapsArr.length || bestSectors.s1 === 999) return null;
      const validLaps = drvLapsArr.filter((l) => l.lap_duration && l.lap_duration < bestSectors.lap * 1.1 && l.duration_sector_1 && l.duration_sector_2 && l.duration_sector_3);
      if (validLaps.length < 2) return null;
      const bestS1 = Math.min(...validLaps.map((l) => l.duration_sector_1));
      const bestS2 = Math.min(...validLaps.map((l) => l.duration_sector_2));
      const bestS3 = Math.min(...validLaps.map((l) => l.duration_sector_3));
      const avgLap = validLaps.reduce((s, l) => s + l.lap_duration, 0) / validLaps.length;
      const times = validLaps.map((l) => l.lap_duration);
      const mean = avgLap;
      const stdDev = Math.sqrt(times.reduce((s, v) => s + (v - mean) ** 2, 0) / times.length);
      const consistency = Math.max(0, 100 - (stdDev / mean) * 1000);
      // Normalized: 100 = matches session best, lower = slower
      const s1Score = Math.max(0, 100 - ((bestS1 - bestSectors.s1) / bestSectors.s1) * 100 * 8);
      const s2Score = Math.max(0, 100 - ((bestS2 - bestSectors.s2) / bestSectors.s2) * 100 * 8);
      const s3Score = Math.max(0, 100 - ((bestS3 - bestSectors.s3) / bestSectors.s3) * 100 * 8);
      const paceScore = Math.max(0, 100 - ((Math.min(...validLaps.map((l) => l.lap_duration)) - bestSectors.lap) / bestSectors.lap) * 100 * 5);
      return { s1: s1Score, s2: s2Score, s3: s3Score, pace: paceScore, consistency: Math.min(100, consistency) };
    };
    return {
      sel: calcMetrics(drvLaps),
      cmp: cmpDrv ? calcMetrics(cmpLaps) : null,
    };
  }, [drvLaps, cmpLaps, bestSectors, cmpDrv]);

  // Lap time distribution (Q1/median/Q3 box plot data)
  const lapDistribution = useMemo(() => {
    const calcDist = (drvLapsArr) => {
      const vals = drvLapsArr.filter((l) => l.lap_duration && l.lap_duration < bestSectors.lap * 1.1).map((l) => l.lap_duration).sort((a, b) => a - b);
      if (vals.length < 4) return null;
      const q1 = vals[Math.floor(vals.length * 0.25)];
      const median = vals[Math.floor(vals.length * 0.5)];
      const q3 = vals[Math.floor(vals.length * 0.75)];
      const min = vals[0], max = vals[vals.length - 1];
      return { q1, median, q3, min, max };
    };
    return {
      sel: calcDist(drvLaps),
      cmp: cmpDrv ? calcDist(cmpLaps) : null,
    };
  }, [drvLaps, cmpLaps, bestSectors, cmpDrv]);

  const TABS = [
    { id: "timing",   l: t("timing")  || "Temps" },
    { id: "pits",     l: t("pits")    || "Stands" },
    { id: "champ",    l: t("champ")   || "🏆 Champ." },
    { id: "weather",  l: t("weather") || "Météo" },
    { id: "radio",    l: t("radio")   || "Radio",   c: filtRadios.length },
    { id: "ctrl",     l: t("ctrl")    || "Dir.",     c: rCtrl.length },
    { id: "analysis", l: "📊" },
  ];

  // SVG Radar chart renderer
  const RadarChart = ({ data1, data2, color1, color2, size = 160 }) => {
    if (!data1) return null;
    const cx = size / 2, cy = size / 2, r = size / 2 - 20;
    const axes = [
      { label: "S1", key: "s1" },
      { label: "S2", key: "s2" },
      { label: "S3", key: "s3" },
      { label: lang === "fr" ? "Rythme" : "Pace", key: "pace" },
      { label: lang === "fr" ? "Régularité" : "Consistency", key: "consistency" },
    ];
    const n = axes.length;
    const angleStep = (2 * Math.PI) / n;
    const getPoint = (val, idx) => {
      const angle = idx * angleStep - Math.PI / 2;
      const dist = (val / 100) * r;
      return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)];
    };
    const gridLevels = [20, 40, 60, 80, 100];
    const polyPoints = (data) =>
      axes.map((ax, i) => getPoint(data[ax.key] || 0, i)).map((p) => p.join(",")).join(" ");

    return (
      <svg width={size} height={size} style={{ overflow: "visible" }}>
        {/* Grid */}
        {gridLevels.map((lvl) => (
          <polygon key={lvl}
            points={axes.map((_, i) => getPoint(lvl, i).join(",")).join(" ")}
            fill="none" stroke="#222" strokeWidth={0.5}
          />
        ))}
        {/* Axis lines */}
        {axes.map((ax, i) => {
          const [px, py] = getPoint(100, i);
          return <line key={ax.key} x1={cx} y1={cy} x2={px} y2={py} stroke="#333" strokeWidth={0.5} />;
        })}
        {/* Data polygon 2 */}
        {data2 && (
          <polygon points={polyPoints(data2)} fill={color2 + "33"} stroke={color2} strokeWidth={1.5} strokeDasharray="3 2" />
        )}
        {/* Data polygon 1 */}
        <polygon points={polyPoints(data1)} fill={color1 + "44"} stroke={color1} strokeWidth={1.5} />
        {/* Labels */}
        {axes.map((ax, i) => {
          const [px, py] = getPoint(115, i);
          return (
            <text key={ax.key} x={px} y={py} textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fill="#888" fontFamily="var(--f)"
            >{ax.label}</text>
          );
        })}
      </svg>
    );
  };

  // SVG Box plot renderer
  const BoxPlot = ({ dist1, dist2, color1, color2, width = 290, height = 50 }) => {
    if (!dist1) return null;
    const allVals = [dist1.min, dist1.max, ...(dist2 ? [dist2.min, dist2.max] : [])];
    const minV = Math.min(...allVals), maxV = Math.max(...allVals);
    const range = maxV - minV || 1;
    const toX = (v) => ((v - minV) / range) * (width - 30) + 15;
    const BoxRow = ({ dist, color, y }) => (
      <g>
        <line x1={toX(dist.min)} x2={toX(dist.q1)} y1={y} y2={y} stroke={color} strokeWidth={1} strokeDasharray="2 2" />
        <line x1={toX(dist.q3)} x2={toX(dist.max)} y1={y} y2={y} stroke={color} strokeWidth={1} strokeDasharray="2 2" />
        <rect x={toX(dist.q1)} y={y - 6} width={toX(dist.q3) - toX(dist.q1)} height={12} fill={color + "33"} stroke={color} strokeWidth={1} rx={2} />
        <line x1={toX(dist.median)} x2={toX(dist.median)} y1={y - 6} y2={y + 6} stroke={color} strokeWidth={2} />
        <text x={toX(dist.median)} y={y + 14} textAnchor="middle" fontSize={7} fill={color} fontFamily="var(--f)">{fmtLap(dist.median)}</text>
      </g>
    );
    return (
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        <BoxRow dist={dist1} color={color1} y={dist2 ? 14 : 22} />
        {dist2 && <BoxRow dist={dist2} color={color2} y={36} />}
      </svg>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "#0c0c0c", height: "100%" }}>
      <div style={{ display: "flex", borderBottom: "1px solid #131313", flexWrap: "wrap" }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            style={{ flex: 1, padding: "7px 4px", background: tab === tb.id ? "#131313" : "transparent", border: "none", borderBottom: tab === tb.id ? "2px solid #E8002D" : "2px solid transparent", color: tab === tb.id ? "#ccc" : "#555", cursor: "pointer", fontSize: 9, fontFamily: "var(--f)", fontWeight: 600 }}
          >
            {tb.l} {tb.c !== undefined && <span style={{ color: "#E8002D", marginLeft: 2 }}>{tb.c}</span>}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>

        {tab === "timing" && (
          <div style={{ fontSize: 9 }}>
            {/* Gap to leader chart */}
            {gapData.length > 1 && (
              <div style={{ marginBottom: 10, height: 120, background: "#111", padding: "8px 0 4px", borderRadius: 4, border: "1px solid #1c1c1c" }}>
                <div style={{ fontSize: 8, color: "#666", textAlign: "center", marginBottom: 2, letterSpacing: 1 }}>
                  {lang === "fr" ? "ÉCART AU LEADER" : "GAP TO LEADER"}
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={gapData} margin={{ top: 4, right: 14, bottom: 0, left: 0 }}>
                    <YAxis domain={["auto", "auto"]} hide />
                    <Tooltip
                      contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, fontSize: 9, fontFamily: "var(--f)", padding: "3px 7px" }}
                      formatter={(v, name) => [`${v.toFixed(2)}s`, name === "gap1" ? (selDrvObj?.name_acronym || "P1") : (cmpDrvObj?.name_acronym || "P2")]}
                      labelFormatter={(l) => `${lang === "fr" ? "Tour" : "Lap"} ${l}`}
                    />
                    <Line type="monotone" dataKey="gap1" stroke={c1} strokeWidth={1.5} dot={{ r: 1 }} isAnimationActive={false} />
                    {cmpDrv && <Line type="monotone" dataKey="gap2" stroke={c2} strokeWidth={1.5} dot={{ r: 1 }} isAnimationActive={false} strokeDasharray="3 3" />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Theoretical best lap */}
            {theoreticalBest && (
              <div style={{ marginBottom: 10, background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "6px 8px" }}>
                <div style={{ fontSize: 8, color: "#666", letterSpacing: 1, marginBottom: 5 }}>
                  {lang === "fr" ? "MEILLEUR TOUR THÉORIQUE" : "THEORETICAL BEST LAP"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 4 }}>
                  {[
                    { label: "S1", val: theoreticalBest.s1, drv: theoreticalBest.s1Drv },
                    { label: "S2", val: theoreticalBest.s2, drv: theoreticalBest.s2Drv },
                    { label: "S3", val: theoreticalBest.s3, drv: theoreticalBest.s3Drv },
                  ].map((sec) => (
                    <div key={sec.label} style={{ background: "#0e0e0e", borderRadius: 3, padding: "4px 5px", textAlign: "center" }}>
                      <div style={{ color: "#555", fontSize: 7, marginBottom: 2 }}>{sec.label}</div>
                      <div style={{ color: "#B366FF", fontWeight: 700, fontSize: 9 }}>{sec.val.toFixed(3)}</div>
                      {sec.drv && <div style={{ color: sec.drv.color, fontSize: 7, marginTop: 1 }}>{sec.drv.acr}</div>}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4, borderTop: "1px solid #1a1a1a" }}>
                  <span style={{ color: "#555", fontSize: 8 }}>{lang === "fr" ? "TOTAL THÉORIQUE" : "THEORETICAL TOTAL"}</span>
                  <span style={{ color: "#B366FF", fontWeight: 700, fontSize: 10 }}>{fmtLap(theoreticalBest.total)}</span>
                </div>
              </div>
            )}

            {paceData.length > 0 && (
              <div style={{ marginBottom: 10, height: 140, background: "#111", padding: "8px 0", borderRadius: 4, border: "1px solid #1c1c1c" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px", marginBottom: 4 }}>
                  <div style={{ fontSize: 8, color: "#666", letterSpacing: 1 }}>RACE PACE</div>
                  <button onClick={() => setShowFuelCorr((p) => !p)} style={{ fontSize: 7, padding: "1px 5px", background: showFuelCorr ? "#001a00" : "#1a1a1a", border: `1px solid ${showFuelCorr ? "#00D26A" : "#333"}`, color: showFuelCorr ? "#00D26A" : "#555", borderRadius: 3, cursor: "pointer", fontFamily: "var(--f)", fontWeight: 700 }}>
                    ⛽ {lang === "fr" ? "CORR. CARBURANT" : "FUEL CORR."}
                  </button>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={paceData} margin={{ top: 5, right: 15, bottom: 0, left: 0 }}>
                    <YAxis domain={["auto", "auto"]} hide />
                    <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, fontSize: 10, fontFamily: "var(--f)", padding: "3px 7px" }} formatter={(v) => fmtLap(v)} labelFormatter={(l) => `Tour ${l}`} />
                    <Line type="monotone" dataKey="t1" stroke={c1} strokeWidth={1.5} dot={{ r: 1 }} isAnimationActive={false} />
                    {cmpDrv && <Line type="monotone" dataKey="t2" stroke={c2} strokeWidth={1.5} dot={{ r: 1 }} isAnimationActive={false} strokeDasharray="3 3" />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {strategyInsights && strategyInsights.slope !== 0 && (
              <div style={{ marginBottom: 16, background: "#141414", border: "1px solid #222", borderRadius: 4, padding: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#B366FF", animation: "pulse 2s infinite" }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#B366FF", letterSpacing: 1 }}>
                    🧠 {lang === "fr" ? "STRATÉGIE AVANCÉE" : "ADVANCED STRATEGY"} : {selDrvObj?.name_acronym}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ color: "#666", fontSize: 8 }}>{lang === "fr" ? "GOMME" : "TYRE"} ({strategyInsights.lapsOnTyre}{lang === "fr" ? "T" : "L"})</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 700, color: "#ccc" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: COMP_C[strategyInsights.compound] || "#555" }} />
                      {strategyInsights.compound}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#666", fontSize: 8 }}>{lang === "fr" ? "DÉGRADATION MOY." : "AVG. DEGRADATION"}</div>
                    <div style={{ fontWeight: 700, color: strategyInsights.slope > 0 ? "#E8002D" : "#00D26A" }}>
                      {strategyInsights.slope > 0 ? "+" : ""}{strategyInsights.slope.toFixed(3)}s / {lang === "fr" ? "tour" : "lap"}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #222", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#888", fontSize: 8 }}>{lang === "fr" ? "PRÉDICTION TOUR" : "PREDICTED LAP"} {curLap + 5}</span>
                  <span style={{ fontWeight: 700, color: "#fff" }}>{fmtLap(strategyInsights.predictedTimeIn5Laps)}</span>
                </div>

                {/* Pit window predictor */}
                {pitWindow && (
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #222" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#666", fontSize: 8 }}>{lang === "fr" ? "FENÊTRE D'ARRÊT" : "PIT WINDOW"}</span>
                      <span style={{
                        fontWeight: 700, fontSize: 9,
                        color: pitWindow.status === "green" ? "#00D26A" : pitWindow.status === "yellow" ? "#FFD600" : "#E8002D",
                      }}>
                        {pitWindow.remaining <= 0
                          ? (lang === "fr" ? "EN RETARD" : "OVERDUE")
                          : `${pitWindow.remaining} ${lang === "fr" ? "tours restants" : "laps remaining"}`}
                      </span>
                    </div>
                    <div style={{ marginTop: 4, height: 4, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        width: `${Math.min(100, (pitWindow.lapsOnTyre / pitWindow.life) * 100)}%`,
                        background: pitWindow.status === "green" ? "#00D26A" : pitWindow.status === "yellow" ? "#FFD600" : "#E8002D",
                        transition: "width 0.3s",
                      }} />
                    </div>
                  </div>
                )}

                {/* Undercut calculator */}
                {undercutInfo && (
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #222" }}>
                    <div style={{ color: "#666", fontSize: 8, marginBottom: 3 }}>
                      {lang === "fr" ? "ANALYSE UNDERCUT" : "UNDERCUT ANALYSIS"} vs {cmpDrvObj?.name_acronym}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: undercutInfo.favorable ? "#00D26A" : "#E8002D" }} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: undercutInfo.favorable ? "#00D26A" : "#E8002D" }}>
                        {undercutInfo.favorable
                          ? (lang === "fr" ? "Undercut favorable" : "Undercut favorable")
                          : (lang === "fr" ? "Undercut défavorable" : "Undercut not favorable")}
                      </span>
                    </div>
                    <div style={{ fontSize: 8, color: "#555", marginTop: 2 }}>
                      {lang === "fr" ? "Dégradation" : "Degradation"}: {undercutInfo.selDeg.toFixed(3)}s/lap
                      {" · "}{cmpDrvObj?.name_acronym}: {undercutInfo.cmpLapsOnTyre}{lang === "fr" ? " tours" : " laps"} ({undercutInfo.cmpCompound})
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "26px 45px 45px 45px 1fr", gap: 6, color: "#666", fontWeight: 700, borderBottom: "1px solid #1c1c1c", paddingBottom: 4, marginBottom: 6, textTransform: "uppercase" }}>
              <div>LAP</div><div>S1</div><div>S2</div><div>S3</div><div style={{ textAlign: "right" }}>TIME</div>
            </div>
            {drvLaps.map((l) => (
              <div key={l.lap_number} style={{ display: "grid", gridTemplateColumns: "26px 45px 45px 45px 1fr", gap: 6, borderBottom: "1px solid #181818", padding: "6px 0", alignItems: "center" }}>
                <div style={{ color: "#888", fontWeight: 700, fontSize: 10 }}>{l.lap_number}</div>
                <div style={{ color: getColor(l.duration_sector_1, bestSectors.s1, pb.s1) }}>{l.duration_sector_1?.toFixed(3) || "-"}</div>
                <div style={{ color: getColor(l.duration_sector_2, bestSectors.s2, pb.s2) }}>{l.duration_sector_2?.toFixed(3) || "-"}</div>
                <div style={{ color: getColor(l.duration_sector_3, bestSectors.s3, pb.s3) }}>{l.duration_sector_3?.toFixed(3) || "-"}</div>
                <div style={{ textAlign: "right", fontWeight: 700, color: getColor(l.lap_duration, bestSectors.lap, pb.lap), fontSize: 10 }}>{fmtLap(l.lap_duration)}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "pits" && (
          <div style={{ fontSize: 9 }}>
            {/* Stint timeline */}
            {stintTimeline.length > 0 && maxLap > 1 && (
              <div style={{ marginBottom: 10, background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "6px 8px" }}>
                <div style={{ fontSize: 8, color: "#666", letterSpacing: 1, marginBottom: 6 }}>
                  {lang === "fr" ? "CHRONOLOGIE DES RELAIS" : "STINT TIMELINE"}
                </div>
                {stintTimeline.map(({ driver: drv, stints: drvStints }) => (
                  <div key={drv.driver_number} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                    <div style={{ width: 24, fontSize: 7, color: tc(drv.team_name), fontWeight: 700, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {drv.name_acronym}
                    </div>
                    <div style={{ flex: 1, height: 10, position: "relative", background: "#0e0e0e", borderRadius: 2, overflow: "hidden" }}>
                      {drvStints.map((s, si) => {
                        const lapEnd = s.lap_end || maxLap;
                        const left = ((s.lap_start - 1) / maxLap) * 100;
                        const width = ((lapEnd - s.lap_start + 1) / maxLap) * 100;
                        return (
                          <div key={si} title={`${s.compound} L${s.lap_start}-${lapEnd}`} style={{
                            position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%",
                            background: COMP_C[s.compound] || "#444", opacity: 0.85, borderRight: "1px solid #0e0e0e",
                          }} />
                        );
                      })}
                      {/* Current lap marker */}
                      <div style={{ position: "absolute", left: `${((curLap - 1) / maxLap) * 100}%`, width: 1, height: "100%", background: "#ffffff55" }} />
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                  {Object.entries(COMP_C).map(([comp, color]) => (
                    <div key={comp} style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 7, color: "#666" }}>
                      <div style={{ width: 7, height: 7, borderRadius: 1, background: color }} />
                      {comp[0]}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tyre degradation scatter */}
            {degradationData.length > 5 && (
              <div style={{ marginBottom: 10, background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "8px" }}>
                <div style={{ fontSize: 8, color: "#666", letterSpacing: 1, marginBottom: 4 }}>
                  {lang === "fr" ? "DÉGRADATION DES PNEUS" : "TYRE DEGRADATION"}
                </div>
                <div style={{ height: 120 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <XAxis dataKey="x" name={lang === "fr" ? "Âge" : "Age"} tick={{ fontSize: 7, fill: "#555", fontFamily: "var(--f)" }} label={{ value: lang === "fr" ? "Tours pneus" : "Tyre laps", position: "insideBottomRight", offset: 0, fontSize: 7, fill: "#555" }} />
                      <YAxis dataKey="y" name={lang === "fr" ? "Temps" : "Time"} tick={{ fontSize: 7, fill: "#555", fontFamily: "var(--f)" }} width={28} tickFormatter={(v) => v.toFixed(0)} domain={["auto", "auto"]} />
                      <ZAxis range={[10, 10]} />
                      <Tooltip
                        contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, fontSize: 9, fontFamily: "var(--f)", padding: "3px 7px" }}
                        formatter={(v, name) => [name === (lang === "fr" ? "Âge" : "Age") ? `${v}L` : fmtLap(v), name]}
                      />
                      {Object.keys(COMP_C).map((compound) => {
                        const pts = degradationData.filter((d) => d.compound === compound);
                        if (!pts.length) return null;
                        return <Scatter key={compound} name={compound} data={pts} fill={COMP_C[compound]} opacity={0.7} />;
                      })}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 40px 50px", gap: 6, color: "#666", fontWeight: 700, borderBottom: "1px solid #1c1c1c", paddingBottom: 4, marginBottom: 6 }}>
              <div>LAP</div><div>DRIVER</div><div>TYRE</div><div style={{ textAlign: "right" }}>TIME</div>
            </div>
            {allPits.length === 0 ? (
              <div style={{ color: "#444", fontSize: 9, padding: "16px 0", textAlign: "center" }}>
                {lang === "fr" ? "Aucun arrêt enregistré" : "No pit stops recorded"}
              </div>
            ) : allPits.map((p, i) => {
              const drv = drivers.find((d) => d.driver_number === p.driver_number);
              const compColor = COMP_C[p.compound] || "#555";
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "30px 1fr 40px 50px", gap: 6, borderBottom: "1px solid #181818", padding: "6px 0", alignItems: "center" }}>
                  <div style={{ color: "#aaa", fontWeight: 700 }}>T{p.lap_number}</div>
                  <div style={{ fontWeight: 700, color: tc(drv?.team_name) }}>{drv?.name_acronym || p.driver_number}</div>
                  <div>{p.compound && <div style={{ width: 8, height: 8, borderRadius: "50%", background: compColor, border: "1px solid #fff" }} title={p.compound} />}</div>
                  <div style={{ textAlign: "right", color: "#ccc", fontWeight: 700 }}>{p.pit_duration?.toFixed(2)}s</div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "champ" && (
          <div style={{ fontSize: 9 }}>
            <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 40px 40px", gap: 6, color: "#666", fontWeight: 700, borderBottom: "1px solid #1c1c1c", paddingBottom: 4, marginBottom: 6 }}>
              <div>POS</div><div>PILOTE</div><div style={{ textAlign: "center" }}>WINS</div><div style={{ textAlign: "right" }}>PTS</div>
            </div>
            {!standings || standings.length === 0 ? (
              <div style={{ color: "#444", textAlign: "center", padding: "16px 0" }}>{lang === "fr" ? "Données non disponibles" : "No data available"}</div>
            ) : standings.map((s) => (
              <div key={s.Driver.driverId} style={{ display: "grid", gridTemplateColumns: "24px 1fr 40px 40px", gap: 6, borderBottom: "1px solid #181818", padding: "6px 0", alignItems: "center" }}>
                <div style={{ color: s.position === "1" ? "#FFD600" : "#aaa", fontWeight: 700, fontSize: 10 }}>{s.position}</div>
                <div style={{ fontWeight: 700, color: tc(s.Constructors[0]?.name) }}>{s.Driver.givenName} {s.Driver.familyName.toUpperCase()}</div>
                <div style={{ textAlign: "center", color: "#888" }}>{s.wins}</div>
                <div style={{ textAlign: "right", color: "#ccc", fontWeight: 700 }}>{s.points}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "weather" && (
          <>
            {curWeather && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "8px", background: "#131313", borderRadius: 4, marginBottom: 8, fontSize: 10, border: "1px solid #1c1c1c" }}>
                <div><span style={{ color: "#666" }}>{lang === "fr" ? "Piste" : "Track"}</span><span style={{ color: "#FF8C00", fontWeight: 700, float: "right" }}>{curWeather.track_temperature}°C</span></div>
                <div><span style={{ color: "#666" }}>{lang === "fr" ? "Air" : "Air"}</span><span style={{ color: "#00D4FF", fontWeight: 700, float: "right" }}>{curWeather.air_temperature}°C</span></div>
                <div><span style={{ color: "#666" }}>{lang === "fr" ? "Vent" : "Wind"}</span><span style={{ color: "#ccc", float: "right" }}>{curWeather.wind_speed} m/s</span></div>
                <div><span style={{ color: "#666" }}>{lang === "fr" ? "Pluie" : "Rain"}</span><span style={{ color: curWeather.rainfall ? "#00D4FF" : "#ccc", float: "right" }}>{curWeather.rainfall ? (lang === "fr" ? "Oui" : "Yes") : (lang === "fr" ? "Non" : "No")}</span></div>
              </div>
            )}
            <div style={{ height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weather} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <YAxis domain={["dataMin-2", "dataMax+2"]} hide />
                  <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, fontSize: 10, fontFamily: "var(--f)", padding: "3px 7px" }} labelFormatter={() => ""} />
                  <Line type="monotone" dataKey="track_temperature" stroke="#FF8C00" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="air_temperature" stroke="#00D4FF" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {tab === "radio" && (
          <>
            <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
              <select value={rfDrv} onChange={(e) => setRfDrv(e.target.value)} style={{ ...ss, flex: 1, fontSize: 9 }}>
                <option value="">{lang === "fr" ? "Tous" : "All"}</option>
                {drivers.map((d) => <option key={d.driver_number} value={d.driver_number}>{d.name_acronym}</option>)}
              </select>
              <select value={rfLap} onChange={(e) => setRfLap(e.target.value)} style={{ ...ss, width: 60, fontSize: 9 }}>
                <option value="">{lang === "fr" ? "Tour" : "Lap"}</option>
                {Array.from({ length: maxLap }, (_, i) => i + 1).map((l) => <option key={l} value={l}>{lang === "fr" ? "T" : "L"}{l}</option>)}
              </select>
            </div>
            {filtRadios.length === 0 ? (
              <div style={{ color: "#444", fontSize: 9, padding: "16px 8px", textAlign: "center" }}>{lang === "fr" ? "Aucune radio" : "No radio"}</div>
            ) : filtRadios.map((r, i) => {
              const drv = drivers.find((d) => d.driver_number === r.driver_number);
              return (
                <div key={i} style={{ display: "flex", gap: 7, padding: "6px 0", borderBottom: "1px solid #181818" }}>
                  <div style={{ width: 3, minHeight: 26, borderRadius: 2, background: tc(drv?.team_name), flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: tc(drv?.team_name) }}>{drv?.name_acronym || `#${r.driver_number}`}</span>
                      <span style={{ fontSize: 8, color: "#444" }}>{r.lap ? `T${r.lap}` : ""}</span>
                    </div>
                    {r.recording_url && (
                      <audio controls preload="none" style={{ width: "100%", height: 24, marginTop: 3 }}>
                        <source src={r.recording_url} type="audio/mpeg" />
                      </audio>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === "ctrl" && (
          <div>
            {penalties.length > 0 && (
              <div style={{ marginBottom: 10, background: "#1a0808", border: "1px solid #E8002D33", borderRadius: 4, padding: "6px 8px" }}>
                <div style={{ fontSize: 8, color: "#E8002D", letterSpacing: 1, fontWeight: 700, marginBottom: 5 }}>
                  ⚖️ {lang === "fr" ? "PÉNALITÉS" : "PENALTIES"} ({penalties.length})
                </div>
                {penalties.map((m, i) => {
                  const drv = drivers.find((d) => d.driver_number === m.driver_number);
                  return (
                    <div key={i} style={{ display: "flex", gap: 6, padding: "3px 0", borderBottom: i < penalties.length - 1 ? "1px solid #2a1010" : "none" }}>
                      <div style={{ width: 3, minHeight: 16, background: "#E8002D", borderRadius: 1, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: "#ff6666", lineHeight: 1.3 }}>{m.message}</div>
                        {(drv || m.lap_number) && (
                          <div style={{ fontSize: 7, color: "#666", marginTop: 1 }}>
                            {drv && <span style={{ color: tc(drv.team_name) }}>{drv.name_acronym} · </span>}
                            {m.lap_number ? `T${m.lap_number}` : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {rCtrl.length === 0 ? (
              <div style={{ color: "#444", fontSize: 9, padding: "16px 0", textAlign: "center" }}>
                {lang === "fr" ? "Aucun message enregistré" : "No messages recorded"}
              </div>
            ) : [...rCtrl].reverse().map((m, i) => {
              const FLAG_COLORS = { GREEN: "#00D26A", YELLOW: "#FFD600", RED: "#E8002D", BLUE: "#3671C6", "DOUBLE YELLOW": "#FFA000", CLEAR: "#00D26A" };
              return (
                <div key={i} style={{ display: "flex", gap: 6, padding: "4px 0", borderBottom: "1px solid #181818" }}>
                  {m.flag && <div style={{ width: 8, height: 8, borderRadius: 2, background: FLAG_COLORS[m.flag] || "#444", flexShrink: 0, marginTop: 3 }} />}
                  <div>
                    <div style={{ fontSize: 9, color: "#aaa", lineHeight: 1.3 }}>{m.message}</div>
                    <div style={{ fontSize: 8, color: "#444" }}>{m.category} {m.lap_number ? `• T${m.lap_number}` : ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "analysis" && (
          <div style={{ fontSize: 9 }}>
            {/* Radar chart */}
            <div style={{ marginBottom: 12, background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "8px" }}>
              <div style={{ fontSize: 8, color: "#666", letterSpacing: 1, marginBottom: 6 }}>
                {lang === "fr" ? "RADAR DE PERFORMANCE" : "PERFORMANCE RADAR"}
              </div>
              {radarData.sel ? (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
                  <RadarChart data1={radarData.sel} data2={radarData.cmp} color1={c1} color2={c2} size={160} />
                  <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, color: c1 }}>
                      <div style={{ width: 10, height: 2, background: c1 }} />
                      {selDrvObj?.name_acronym || "P1"}
                    </div>
                    {radarData.cmp && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, color: c2 }}>
                        <div style={{ width: 10, height: 2, background: c2, borderTop: "1px dashed " + c2 }} />
                        {cmpDrvObj?.name_acronym || "P2"}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ color: "#444", textAlign: "center", padding: "16px 0", fontSize: 9 }}>
                  {lang === "fr" ? "Données insuffisantes" : "Insufficient data"}
                </div>
              )}
            </div>

            {/* Corner apex speeds */}
            {cornerSpeeds.length > 0 && (
              <div style={{ marginBottom: 12, background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "8px" }}>
                <div style={{ fontSize: 8, color: "#666", letterSpacing: 1, marginBottom: 4 }}>
                  {lang === "fr" ? "VITESSE APEX PAR VIRAGE" : "CORNER APEX SPEEDS"}
                </div>
                <div style={{ height: 110 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cornerSpeeds} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="15%" barGap={1}>
                      <XAxis dataKey="number" tick={{ fill: "#555", fontSize: 7, fontFamily: "var(--f)" }} axisLine={false} tickLine={false} />
                      <YAxis domain={["auto", "auto"]} hide />
                      <Tooltip
                        contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, fontSize: 9, fontFamily: "var(--f)", padding: "3px 7px" }}
                        formatter={(v, name) => [`${v} km/h`, name]}
                        labelFormatter={(l) => `${lang === "fr" ? "Virage" : "Corner"} ${l}`}
                      />
                      <Bar dataKey="speed1" name={selDrvObj?.name_acronym || "P1"} fill={c1} radius={[2, 2, 0, 0]} maxBarSize={14} />
                      {cmpDrv && <Bar dataKey="speed2" name={cmpDrvObj?.name_acronym || "P2"} fill={c2} radius={[2, 2, 0, 0]} maxBarSize={14} />}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Lap time distribution */}
            <div style={{ marginBottom: 12, background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "8px" }}>
              <div style={{ fontSize: 8, color: "#666", letterSpacing: 1, marginBottom: 6 }}>
                {lang === "fr" ? "DISTRIBUTION DES TEMPS" : "LAP TIME DISTRIBUTION"}
              </div>
              {lapDistribution.sel ? (
                <div style={{ overflowX: "auto" }}>
                  <BoxPlot dist1={lapDistribution.sel} dist2={lapDistribution.cmp} color1={c1} color2={c2} width={290} height={cmpDrv ? 65 : 40} />
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <div style={{ fontSize: 7, color: "#555" }}>
                      Q1: {fmtLap(lapDistribution.sel.q1)} · Med: {fmtLap(lapDistribution.sel.median)} · Q3: {fmtLap(lapDistribution.sel.q3)}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: "#444", textAlign: "center", padding: "12px 0", fontSize: 9 }}>
                  {lang === "fr" ? "Données insuffisantes" : "Insufficient data"}
                </div>
              )}
            </div>

            {/* Overtakes bar chart */}
            {overtakesPerLap.length > 0 && (
              <div style={{ marginBottom: 12, background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "8px" }}>
                <div style={{ fontSize: 8, color: "#666", letterSpacing: 1, marginBottom: 4 }}>
                  {lang === "fr" ? "DÉPASSEMENTS PAR TOUR" : "OVERTAKES PER LAP"}
                </div>
                <div style={{ height: 100 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overtakesPerLap} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
                      <XAxis dataKey="lap" hide />
                      <YAxis allowDecimals={false} tick={{ fontSize: 7, fill: "#555", fontFamily: "var(--f)" }} width={14} />
                      <Tooltip
                        contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, fontSize: 9, fontFamily: "var(--f)", padding: "3px 7px" }}
                        formatter={(v) => [v, lang === "fr" ? "Dépassements" : "Overtakes"]}
                        labelFormatter={(l) => `${lang === "fr" ? "Tour" : "Lap"} ${l}`}
                      />
                      <ReferenceLine x={curLap} stroke="#E8002D" strokeWidth={1} strokeDasharray="3 2" />
                      <Bar dataKey="count" fill="#E8002D" opacity={0.7} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize: 7, color: "#555", textAlign: "right", marginTop: 2 }}>
                  {lang === "fr" ? "Total" : "Total"}: {overtakesPerLap.reduce((s, o) => s + o.count, 0)}
                </div>
              </div>
            )}

            {/* Best lap composite per sector */}
            {bestLapComposite && selDrvObj && (
              <div style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 8, color: "#666", letterSpacing: 1 }}>
                    {lang === "fr" ? "MEILLEUR SECTEUR PAR TOUR" : "BEST SECTOR BY LAP"} · {selDrvObj.name_acronym}
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {["s1", "s2", "s3"].map((s) => (
                      <button key={s} onClick={() => setBestLapNavSector(s)} style={{
                        background: bestLapNavSector === s ? "#E8002D" : "#1a1a1a",
                        border: "1px solid #333", color: bestLapNavSector === s ? "#fff" : "#666",
                        borderRadius: 3, padding: "2px 6px", fontSize: 8, cursor: "pointer", fontFamily: "var(--f)",
                      }}>{s.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const sMap = { s1: { lap: bestLapComposite.bestS1Lap, val: bestLapComposite.bestS1, best: bestSectors.s1 }, s2: { lap: bestLapComposite.bestS2Lap, val: bestLapComposite.bestS2, best: bestSectors.s2 }, s3: { lap: bestLapComposite.bestS3Lap, val: bestLapComposite.bestS3, best: bestSectors.s3 } };
                  const info = sMap[bestLapNavSector];
                  if (!info.lap) return <div style={{ color: "#444", fontSize: 9 }}>{lang === "fr" ? "Pas de données" : "No data"}</div>;
                  const lapRow = drvLaps.find((l) => l.lap_number === info.lap);
                  const isSessionBest = info.val <= info.best;
                  return (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "#888", fontSize: 9 }}>{lang === "fr" ? "Meilleur tour" : "Best lap"}</span>
                        <span style={{ color: "#ccc", fontWeight: 700, fontSize: 11 }}>#{info.lap}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
                        <span style={{ color: "#666", fontSize: 8 }}>{bestLapNavSector.toUpperCase()} {lang === "fr" ? "perso" : "personal"}</span>
                        <span style={{ color: isSessionBest ? "#B366FF" : "#00D26A", fontWeight: 700 }}>{info.val.toFixed(3)}s</span>
                      </div>
                      {isSessionBest && (
                        <div style={{ marginTop: 3, fontSize: 8, color: "#B366FF" }}>
                          ★ {lang === "fr" ? "Meilleur de la session" : "Session best"}
                        </div>
                      )}
                      {lapRow && (
                        <div style={{ marginTop: 6, paddingTop: 5, borderTop: "1px solid #1a1a1a", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 3 }}>
                          {[
                            { label: "S1", val: lapRow.duration_sector_1 },
                            { label: "S2", val: lapRow.duration_sector_2 },
                            { label: "S3", val: lapRow.duration_sector_3 },
                            { label: lang === "fr" ? "TPS" : "TIME", val: lapRow.lap_duration },
                          ].map((s) => (
                            <div key={s.label} style={{ textAlign: "center" }}>
                              <div style={{ color: "#555", fontSize: 7 }}>{s.label}</div>
                              <div style={{ color: "#aaa", fontSize: 8, fontWeight: 700 }}>{s.val ? s.val.toFixed(3) : "-"}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Constructor pace comparison */}
            {constructorPace.length > 1 && (
              <div style={{ marginTop: 12, background: "#111", border: "1px solid #1c1c1c", borderRadius: 4, padding: "8px" }}>
                <div style={{ fontSize: 8, color: "#666", letterSpacing: 1, marginBottom: 6 }}>
                  {lang === "fr" ? "RYTHME PAR ÉQUIPE" : "TEAM PACE COMPARISON"}
                </div>
                {(() => {
                  const fastest = constructorPace[0].median;
                  const slowest = constructorPace[constructorPace.length - 1].median;
                  const range = slowest - fastest || 1;
                  return constructorPace.map((row, i) => {
                    const barW = Math.max(5, 100 - ((row.median - fastest) / range) * 80);
                    const color = tc(row.team);
                    return (
                      <div key={row.team} style={{ display: "grid", gridTemplateColumns: "70px 1fr 46px", gap: 4, alignItems: "center", marginBottom: 4 }}>
                        <div style={{ fontSize: 7, color: color || "#aaa", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.team}>
                          {i + 1}. {row.team.split(" ").pop()}
                        </div>
                        <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${barW}%`, background: color || "#444", borderRadius: 3, transition: "width 0.3s" }} />
                        </div>
                        <div style={{ fontSize: 7, color: "#888", textAlign: "right", fontFamily: "var(--f)" }}>{fmtLap(row.median)}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
