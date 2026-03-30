import { useMemo } from "react";
import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ERS_L, ERS_C, fmtLap } from "../api";

function TelChart({data, dk1, dk2, c1, c2, label, unit, domain, onHover, onLeave, s1Limit, s2Limit}){
  if(!data?.length)return null;
  return <div style={{marginBottom:4}}>
    <div style={{fontSize:9,color:"#555",fontFamily:"var(--f)",marginBottom:1,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
    <ResponsiveContainer width="100%" height={50}>
      <LineChart data={data} margin={{top:1,right:0,bottom:0,left:0}} onMouseMove={(e) => onHover && onHover(e?.activeTooltipIndex)} onMouseLeave={onLeave}>
        <YAxis domain={domain||["auto","auto"]} hide/>
        <Tooltip contentStyle={{background:"#1a1a1a",border:"1px solid #333",borderRadius:4,fontSize:10,fontFamily:"var(--f)",padding:"3px 7px"}} formatter={(v, name) => [`${Math.round(v)}${unit||""}`, name === dk1 ? "Pilote 1" : "Pilote 2"]} labelFormatter={()=>""}/>
        {s1Limit > 0 && <ReferenceLine x={s1Limit} stroke="#333" strokeDasharray="3 3" />}
        {s2Limit > 0 && <ReferenceLine x={s2Limit} stroke="#333" strokeDasharray="3 3" />}
        <Line type="monotone" dataKey={dk1} stroke={c1} strokeWidth={1.5} dot={false} isAnimationActive={false}/>
        {dk2 && <Line type="monotone" dataKey={dk2} stroke={c2} strokeWidth={1.5} dot={false} isAnimationActive={false} strokeDasharray="4 2"/>}
      </LineChart>
    </ResponsiveContainer>
  </div>;
}

export default function Telemetry({ curLap, is26, selDrvObj, cmpDrvObj, c1, c2, cmpDrv, telStatus, telChart, setHoveredIndex, selLapData, cmpLapData, s1Ratio, s2Ratio }) {
  
  // Calcul dynamique des limites S1 et S2 pour l'échelle Recharts (0-199)
  const s1Limit = s1Ratio ? Math.floor(s1Ratio * 199) : 0;
  const s2Limit = s2Ratio ? Math.floor(s2Ratio * 199) : 0;

  const getStats = (start, end) => {
    let s1Max = 0, s1Min = 999, s1Sum = 0, s1Count = 0;
    let s2Max = 0, s2Min = 999, s2Sum = 0, s2Count = 0;
    for(let i=start; i<=end; i++) {
        const pt = telChart[i];
        if(!pt) continue;
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
      s1: s1Count ? { max: Math.round(s1Max), min: Math.round(s1Min), avg: Math.round(s1Sum / s1Count) } : {max:'-', min:'-', avg:'-'},
      s2: s2Count ? { max: Math.round(s2Max), min: Math.round(s2Min), avg: Math.round(s2Sum / s2Count) } : {max:'-', min:'-', avg:'-'}
    };
  };

  const stGlobal = useMemo(() => telChart?.length ? getStats(0, 199) : null, [telChart]);
  const stS1 = useMemo(() => telChart?.length && s1Limit > 0 ? getStats(0, s1Limit) : null, [telChart, s1Limit]);
  const stS2 = useMemo(() => telChart?.length && s2Limit > 0 ? getStats(s1Limit, s2Limit) : null, [telChart, s1Limit, s2Limit]);
  const stS3 = useMemo(() => telChart?.length && s2Limit > 0 ? getStats(s2Limit, 199) : null, [telChart, s2Limit]);

  const handleHover = (index) => { if (index !== undefined && index !== null) setHoveredIndex(index); };
  const handleLeave = () => setHoveredIndex(null);

  const formatDelta = (t1, t2) => {
      if(!t1 || !t2) return "-";
      const d = t1 - t2;
      return <span style={{color: d<0 ? "#00D26A" : "#E8002D"}}>{d>0?"+":""}{d.toFixed(3)}</span>;
  };

  return <div style={{borderTop:"1px solid #181818",padding:"6px 12px",background:"#0c0c0c", height:"100%", overflow:"auto", display:"flex", flexDirection:"column"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:c1}}/>
        <span style={{fontSize:10,fontWeight:700,color:"#ccc"}}>{selDrvObj?.name_acronym || "—"}</span>
        {cmpDrvObj && <><span style={{fontSize:9,color:"#555",fontStyle:"italic"}}>vs</span><div style={{width:7,height:7,borderRadius:"50%",background:c2}}/><span style={{fontSize:10,fontWeight:700,color:"#ccc"}}>{cmpDrvObj.name_acronym}</span></>}
        <span style={{fontSize:9,fontWeight:600,color:"#666",textTransform:"uppercase",marginLeft:5}}>• Télémétrie {is26?"(2026)":""}</span>
      </div>
    </div>

    {cmpDrvObj && stGlobal && stS1 && stS2 && stS3 && (
      <div style={{display:"grid", gridTemplateColumns:"50px 1fr", gap:10, background:"#111", border:"1px solid #1c1c1c", borderRadius:4, padding:"6px", marginBottom:10, fontSize:9}}>
          <div style={{display:"grid", gridTemplateRows:"repeat(4, 1fr)", gap:4, color:"#666", fontWeight:600}}>
              <div>TOUR</div><div>S1</div><div>S2</div><div>S3</div>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:6}}>
              <div style={{display:"flex", alignItems:"center", gap:6}}><span style={{color:c1}}>{fmtLap(selLapData.lap_duration)}</span> vs <span style={{color:c2}}>{fmtLap(cmpLapData.lap_duration)}</span></div>
              <div>{formatDelta(selLapData.lap_duration, cmpLapData.lap_duration)}</div>
              <div style={{color:c1}}>Max:{stGlobal.s1.max} Min:{stGlobal.s1.min} Moy:{stGlobal.s1.avg}</div>
              <div style={{color:c2}}>Max:{stGlobal.s2.max} Min:{stGlobal.s2.min} Moy:{stGlobal.s2.avg}</div>

              <div style={{display:"flex", alignItems:"center", gap:6}}><span style={{color:c1}}>{selLapData.duration_sector_1?.toFixed(3)||"-"}</span> vs <span style={{color:c2}}>{cmpLapData.duration_sector_1?.toFixed(3)||"-"}</span></div>
              <div>{formatDelta(selLapData.duration_sector_1, cmpLapData.duration_sector_1)}</div>
              <div style={{color:c1}}>Max:{stS1.s1.max} Min:{stS1.s1.min} Moy:{stS1.s1.avg}</div>
              <div style={{color:c2}}>Max:{stS1.s2.max} Min:{stS1.s2.min} Moy:{stS1.s2.avg}</div>

              <div style={{display:"flex", alignItems:"center", gap:6}}><span style={{color:c1}}>{selLapData.duration_sector_2?.toFixed(3)||"-"}</span> vs <span style={{color:c2}}>{cmpLapData.duration_sector_2?.toFixed(3)||"-"}</span></div>
              <div>{formatDelta(selLapData.duration_sector_2, cmpLapData.duration_sector_2)}</div>
              <div style={{color:c1}}>Max:{stS2.s1.max} Min:{stS2.s1.min} Moy:{stS2.s1.avg}</div>
              <div style={{color:c2}}>Max:{stS2.s2.max} Min:{stS2.s2.min} Moy:{stS2.s2.avg}</div>

              <div style={{display:"flex", alignItems:"center", gap:6}}><span style={{color:c1}}>{selLapData.duration_sector_3?.toFixed(3)||"-"}</span> vs <span style={{color:c2}}>{cmpLapData.duration_sector_3?.toFixed(3)||"-"}</span></div>
              <div>{formatDelta(selLapData.duration_sector_3, cmpLapData.duration_sector_3)}</div>
              <div style={{color:c1}}>Max:{stS3.s1.max} Min:{stS3.s1.min} Moy:{stS3.s1.avg}</div>
              <div style={{color:c2}}>Max:{stS3.s2.max} Min:{stS3.s2.min} Moy:{stS3.s2.avg}</div>
          </div>
      </div>
    )}

    {telChart.length===0 ? <div style={{color:"#333",fontSize:10,padding:"16px 0",textAlign:"center"}}>{telStatus==="loading"?"⏳ Synchronisation des données...":telStatus==="error"?"❌ Télémétrie incomplète":"Sélectionne une session"}</div> : <div style={{flex:1, overflow:"auto", display:"flex", flexDirection:"column"}}>
      <TelChart data={telChart} dk1="speed1" dk2={cmpDrv?"speed2":null} c1={c1} c2={c2} label="Vitesse" unit=" km/h" domain={[0,370]} onHover={handleHover} onLeave={handleLeave} s1Limit={s1Limit} s2Limit={s2Limit}/>
      <TelChart data={telChart} dk1="throttle1" dk2={cmpDrv?"throttle2":null} c1={c1} c2={c2} label="Accélérateur" unit="%" domain={[0,100]} onHover={handleHover} onLeave={handleLeave} s1Limit={s1Limit} s2Limit={s2Limit}/>
      <TelChart data={telChart} dk1="brake1" dk2={cmpDrv?"brake2":null} c1={c1} c2={c2} label="Frein" unit="%" domain={[0,100]} onHover={handleHover} onLeave={handleLeave} s1Limit={s1Limit} s2Limit={s2Limit}/>
      <TelChart data={telChart} dk1="gear1" dk2={cmpDrv?"gear2":null} c1={c1} c2={c2} label="Rapport" domain={[0,9]} onHover={handleHover} onLeave={handleLeave} s1Limit={s1Limit} s2Limit={s2Limit}/>
      <TelChart data={telChart} dk1="ers1" dk2={cmpDrv?"ers2":null} c1={c1} c2={c2} label="ERS (↑récolte ↓déploiement)" unit="%" domain={[-100,100]} onHover={handleHover} onLeave={handleLeave} s1Limit={s1Limit} s2Limit={s2Limit}/>
    </div>}
  </div>;
}