import { tc, fmtLap } from "../api";
import { C, TYRE } from "../theme";
import Icon from "./Icon";

const COLS = "28px minmax(0,1fr) 30px 72px 44px";

function Badge({ letter, color }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: color, color: C.bg, lineHeight: "16px" }}>
      {letter}
    </span>
  );
}

function DrvRow({ d, pos, sel, isCmp, onClick, onCompare, lap, intv, raceData, t }) {
  const team = tc(d.team_name);
  const { pitCount, compound, age } = raceData || {};
  const tyre = TYRE[compound];
  const gap = intv?.interval != null
    ? `+${typeof intv.interval === "number" ? intv.interval.toFixed(3) : intv.interval}`
    : pos === 1 ? t("leader") : lap?.lap_duration ? fmtLap(lap.lap_duration) : "—";

  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: COLS, gap: 8, alignItems: "center",
        minHeight: 48, padding: "0 8px 0 14px",
        background: sel ? C.aBg : isCmp ? C.bBg : "transparent",
        borderBottom: `1px solid ${C.rowLine}`,
      }}
    >
      <span className="num" style={{ fontSize: 14, fontWeight: 700, color: C.text2, textAlign: "right" }}>{pos}</span>
      <button
        onClick={onClick}
        aria-pressed={sel}
        aria-label={`${d.full_name || d.name_acronym} — ${t("selectA")}`}
        style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, height: 46, background: "none", border: "none", color: C.text, textAlign: "left", padding: 0 }}
      >
        <span style={{ width: 4, height: 26, borderRadius: 2, background: team, flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 700, letterSpacing: "0.02em" }}>
            {d.name_acronym}
            {sel && <Badge letter="A" color={C.a} />}
            {isCmp && <Badge letter="B" color={C.b} />}
            {pitCount > 0 && <span className="num" style={{ fontSize: 11, fontWeight: 600, color: C.text2, border: `1px solid ${C.lineStrong}`, borderRadius: 4, padding: "0 4px" }} title={`${pitCount} pit stop(s)`}>{pitCount} PIT</span>}
          </span>
          <span style={{ display: "block", fontSize: 12, color: C.text3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.team_name}</span>
        </span>
      </button>
      {tyre ? (
        <span title={`${compound} · ${age} ${t("lapsShort")}`} style={{ width: 26, height: 26, borderRadius: "50%", border: `2.5px solid ${tyre.c}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.text }}>
          {tyre.l}
        </span>
      ) : <span />}
      <span style={{ textAlign: "right", lineHeight: 1.25 }}>
        <span className="num" style={{ display: "block", fontSize: 13, color: C.text }}>{gap}</span>
        {tyre && <span className="num" style={{ display: "block", fontSize: 11, color: C.text3 }}>{age} {t("lapsShort")}</span>}
      </span>
      {sel ? <span /> : (
        <button
          onClick={onCompare}
          aria-pressed={isCmp}
          aria-label={isCmp ? `${t("stopCompare")} ${d.name_acronym}` : `${t("compareB")} ${d.name_acronym}`}
          title={isCmp ? t("stopCompare") : t("compareB")}
          style={{ width: 44, height: 44, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
        >
          <span style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${isCmp ? C.b : C.lineStrong}`, background: isCmp ? C.b : "transparent", color: isCmp ? C.bg : C.text2, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="swap" size={14} sw={1.5} />
          </span>
        </button>
      )}
    </div>
  );
}

export default function Sidebar({ curLap, sortedDrv, posAtLap, selDrv, cmpDrv, setSelDrv, setCmpDrv, curLapD, curIntv, drvRaceData, t }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 1, background: C.panel }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 10px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>{t("ranking")}</h2>
          <span className="num" style={{ fontSize: 13, color: C.text2 }}>{t("lap")} {curLap}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "0 8px 8px 14px", fontSize: 12, color: C.text3, borderBottom: `1px solid ${C.line}` }}>
          <span style={{ textAlign: "right" }}>{t("posShort")}</span>
          <span>{t("driver")}</span>
          <span>{t("tyre")}</span>
          <span style={{ textAlign: "right" }}>{t("gap")}</span>
          <span style={{ textAlign: "center" }}>B</span>
        </div>
      </div>
      {sortedDrv.length === 0 && (
        <div style={{ padding: 16, fontSize: 13, color: C.text3, lineHeight: 1.5 }}>{t("emptyStandings")}</div>
      )}
      {sortedDrv.map((d, i) => (
        <DrvRow
          key={d.driver_number}
          d={d}
          pos={posAtLap[d.driver_number] || i + 1}
          sel={selDrv === d.driver_number}
          isCmp={cmpDrv === d.driver_number}
          onClick={() => setSelDrv(d.driver_number)}
          onCompare={() => setCmpDrv((p) => (p === d.driver_number ? null : d.driver_number))}
          lap={curLapD.get(d.driver_number)}
          intv={curIntv.get(d.driver_number)}
          raceData={drvRaceData[d.driver_number]}
          t={t}
        />
      ))}
    </div>
  );
}
