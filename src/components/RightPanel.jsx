import { useMemo } from "react";
import { LineChart, Line, YAxis, XAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { tc, COMP_C, fmtLap } from "../api";

export default function RightPanel({ tab, setTab, filtRadios, rCtrl, weather, curWeather, drivers, maxLap, rfDrv, setRfDrv, rfLap, setRfLap, ss, t, pits, stints, selDrv, cmpDrv, laps, bestSectors }) {
  
  const drvLaps = useMemo(() => laps.filter(l => l.driver_number === selDrv).sort((a,b) => b.lap_number - a.lap_number), [laps, selDrv]);
  const drvPits = useMemo(() => {
    if(!pits.length || !stints.length) return [];
    return pits.map(p => {
      const stintAfter = stints.find(s => s.driver_number === p.driver_number && s.lap_start === p.lap_number + 1);
      return { ...p, compound: stintAfter?.compound };
    }).sort((a,b) => b.lap_number - a.lap_number);
  }, [pits, stints]);

  // DONNÉES DU RACE PACE (Exclut les temps aberrants type Pit Stops)
  const paceData = useMemo(() => {
    const data = [];
    const threshold = bestSectors.lap * 1.15; // Exclut les tours 15% plus lents que le meilleur tour
    for(let i=1; i<=maxLap; i++) {
        const l1 = laps.find(l => l.lap_number === i && l.driver_number === selDrv);
        const l2 = cmpDrv ? laps.find(l => l.lap_number === i && l.driver_number === cmpDrv) : null;
        let t1 = l1?.lap_duration; if(t1 > threshold) t1 = null;
        let t2 = l2?.lap_duration; if(t2 > threshold) t2 = null;
        if(t1 || t2) data.push({ lap: i, t1, t2 });
    }
    return data;
  }, [laps, selDrv, cmpDrv, maxLap, bestSectors.lap]);

  const getColor = (val, best, pb) => {
    if (!val) return "#444";
    if (val <= best) return "#B366FF"; 
    if (val <= pb) return "#00D26A"; 
    return "#FFD600"; 
  };

  const pb = useMemo(() => {
    let s1 = 999, s2 = 999, s3 = 999, lap = 9999;
    drvLaps.forEach(l => {
      if (l.duration_sector_1 && l.duration_sector_1 < s1) s1 = l.duration_sector_1;
      if (l.duration_sector_2 && l.duration_sector_2 < s2) s2 = l.duration_sector_2;
      if (l.duration_sector_3 && l.duration_sector_3 < s3) s3 = l.duration_sector_3;
      if (l.lap_duration && l.lap_duration < lap) lap = l.lap_duration;
    });
    return {s1, s2, s3, lap};
  }, [drvLaps]);

  const c1 = tc(drivers.find(d=>d.driver_number===selDrv)?.team_name) || "#00D4FF";
  let c2 = tc(drivers.find(d=>d.driver_number===cmpDrv)?.team_name) || "#FF8C00";
  if (c1 === c2) c2 = "#ffffff";

  return <div style={{display:"flex",flexDirection:"column",background:"#0c0c0c",height:"100%"}}>
    <div style={{display:"flex",borderBottom:"1px solid #131313", flexWrap:"wrap"}}>
      {[{id:"timing",l:t("timing")||"Temps"},{id:"pits",l:t("pits")||"Stands"},{id:"weather",l:t("weather")||"Météo"},{id:"radio",l:t("radio")||"Radio",c:filtRadios.length},{id:"ctrl",l:t("ctrl")||"Dir.",c:rCtrl.length}].map(tb=>
        <button key={tb.id} onClick={()=>setTab(tb.id)} style={{flex:1,padding:"7px 4px",background:tab===tb.id?"#131313":"transparent",border:"none",borderBottom:tab===tb.id?"2px solid #E8002D":"2px solid transparent",color:tab===tb.id?"#ccc":"#555",cursor:"pointer",fontSize:9,fontFamily:"var(--f)",fontWeight:600}}>{tb.l} {tb.c!==undefined&&<span style={{color:"#E8002D",marginLeft:2}}>{tb.c}</span>}</button>)}
    </div>

    <div style={{flex:1,overflow:"auto",padding:"8px"}}>
      
      {tab==="timing" && (
        <div style={{fontSize:9}}>
          
          {/* GRAPHIQUE RACE PACE */}
          {paceData.length > 0 && (
             <div style={{marginBottom: 16, height: 140, background:"#111", padding:"8px 0", borderRadius:4, border:"1px solid #1c1c1c"}}>
                <div style={{fontSize:8, color:"#666", textAlign:"center", marginBottom:4, letterSpacing:1}}>RACE PACE (DÉGRADATION)</div>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={paceData} margin={{top:5, right:15, bottom:0, left:0}}>
                        <YAxis domain={['auto', 'auto']} hide />
                        <Tooltip contentStyle={{background:"#1a1a1a",border:"1px solid #333",borderRadius:4,fontSize:10,fontFamily:"var(--f)",padding:"3px 7px"}} formatter={(v)=>fmtLap(v)} labelFormatter={(l)=>`Tour ${l}`}/>
                        <Line type="monotone" dataKey="t1" stroke={c1} strokeWidth={1.5} dot={{r:1}} isAnimationActive={false}/>
                        {cmpDrv && <Line type="monotone" dataKey="t2" stroke={c2} strokeWidth={1.5} dot={{r:1}} isAnimationActive={false} strokeDasharray="3 3"/>}
                    </LineChart>
                </ResponsiveContainer>
             </div>
          )}

          <div style={{display:"grid", gridTemplateColumns:"26px 45px 45px 45px 1fr", gap:6, color:"#666", fontWeight:700, borderBottom:"1px solid #1c1c1c", paddingBottom:4, marginBottom:6, textTransform:"uppercase"}}>
            <div>LAP</div><div>S1</div><div>S2</div><div>S3</div><div style={{textAlign:"right"}}>TIME</div>
          </div>
          {drvLaps.map(l => (
            <div key={l.lap_number} style={{display:"grid", gridTemplateColumns:"26px 45px 45px 45px 1fr", gap:6, borderBottom:"1px solid #181818", padding:"6px 0", alignItems:"center"}}>
              <div style={{color:"#888", fontWeight:700, fontSize:10}}>{l.lap_number}</div>
              <div style={{color:getColor(l.duration_sector_1, bestSectors.s1, pb.s1)}}>{l.duration_sector_1?.toFixed(3) || "-"}</div>
              <div style={{color:getColor(l.duration_sector_2, bestSectors.s2, pb.s2)}}>{l.duration_sector_2?.toFixed(3) || "-"}</div>
              <div style={{color:getColor(l.duration_sector_3, bestSectors.s3, pb.s3)}}>{l.duration_sector_3?.toFixed(3) || "-"}</div>
              <div style={{textAlign:"right", fontWeight:700, color:getColor(l.lap_duration, bestSectors.lap, pb.lap), fontSize:10}}>{fmtLap(l.lap_duration)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Reste inchangé... */}
      {tab==="pits" && (
        <div style={{fontSize:9}}>
           <div style={{display:"grid", gridTemplateColumns:"30px 1fr 40px 50px", gap:6, color:"#666", fontWeight:700, borderBottom:"1px solid #1c1c1c", paddingBottom:4, marginBottom:6}}>
            <div>LAP</div><div>DRIVER</div><div>TYRE</div><div style={{textAlign:"right"}}>TIME</div>
          </div>
          {drvPits.map((p, i) => {
            const drv = drivers.find(d => d.driver_number === p.driver_number);
            const compColor = COMP_C[p.compound] || "#555";
            return (
              <div key={i} style={{display:"grid", gridTemplateColumns:"30px 1fr 40px 50px", gap:6, borderBottom:"1px solid #181818", padding:"6px 0", alignItems:"center"}}>
                <div style={{color:"#aaa", fontWeight:700}}>T{p.lap_number}</div>
                <div style={{fontWeight:700, color:tc(drv?.team_name)}}>{drv?.name_acronym || p.driver_number}</div>
                <div>{p.compound && <div style={{width:8, height:8, borderRadius:"50%", background:compColor, border:"1px solid #fff"}} title={p.compound}/>}</div>
                <div style={{textAlign:"right", color:"#ccc", fontWeight:700}}>{p.pit_duration?.toFixed(2)}s</div>
              </div>
            );
          })}
        </div>
      )}
      {tab==="weather"&&(<>{curWeather && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,padding:"8px",background:"#131313",borderRadius:4,marginBottom:8,fontSize:10,border:"1px solid #1c1c1c"}}><div><span style={{color:"#666"}}>Piste</span> <span style={{color:"#FF8C00",fontWeight:700,float:"right"}}>{curWeather.track_temperature}°C</span></div><div><span style={{color:"#666"}}>Air</span> <span style={{color:"#00D4FF",fontWeight:700,float:"right"}}>{curWeather.air_temperature}°C</span></div><div><span style={{color:"#666"}}>Vent</span> <span style={{color:"#ccc",float:"right"}}>{curWeather.wind_speed} m/s</span></div><div><span style={{color:"#666"}}>Pluie</span> <span style={{color:curWeather.rainfall?"#00D4FF":"#ccc",float:"right"}}>{curWeather.rainfall?"Oui":"Non"}</span></div></div>}<div style={{height:120}}><ResponsiveContainer width="100%" height="100%"><LineChart data={weather} margin={{top:5,right:5,bottom:5,left:0}}><YAxis domain={["dataMin - 2", "dataMax + 2"]} hide/><Tooltip contentStyle={{background:"#1a1a1a",border:"1px solid #333",borderRadius:4,fontSize:10,fontFamily:"var(--f)",padding:"3px 7px"}} labelFormatter={()=>""}/><Line type="monotone" dataKey="track_temperature" stroke="#FF8C00" strokeWidth={1.5} dot={false} isAnimationActive={false}/><Line type="monotone" dataKey="air_temperature" stroke="#00D4FF" strokeWidth={1.5} dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div></>)}
      {tab==="radio"&&<><div style={{display:"flex",gap:3,marginBottom:8}}><select value={rfDrv} onChange={e=>setRfDrv(e.target.value)} style={{...ss,flex:1,fontSize:9}}><option value="">Tous</option>{drivers.map(d=><option key={d.driver_number} value={d.driver_number}>{d.name_acronym}</option>)}</select><select value={rfLap} onChange={e=>setRfLap(e.target.value)} style={{...ss,width:60,fontSize:9}}><option value="">Tour</option>{Array.from({length:maxLap},(_,i)=>i+1).map(l=><option key={l} value={l}>T{l}</option>)}</select></div>{filtRadios.length===0?<div style={{color:"#444",fontSize:9,padding:"16px 8px",textAlign:"center"}}>Aucune radio</div>:filtRadios.map((r,i)=><div key={i} style={{display:"flex",gap:7,padding:"6px 0",borderBottom:"1px solid #181818"}}><div style={{width:3,minHeight:26,borderRadius:2,background:tc(drivers.find(d=>d.driver_number===r.driver_number)?.team_name),flexShrink:0}}/><div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,fontWeight:700,color:tc(drivers.find(d=>d.driver_number===r.driver_number)?.team_name)}}>{drivers.find(d=>d.driver_number===r.driver_number)?.name_acronym||`#${r.driver_number}`}</span><span style={{fontSize:8,color:"#444"}}>{r.lap?`T${r.lap}`:""}</span></div>{r.recording_url && <audio controls preload="none" style={{width:"100%",height:24,marginTop:3}}><source src={r.recording_url} type="audio/mpeg"/></audio>}</div></div>)}</>}
      {tab==="ctrl"&&(rCtrl.length===0?<div style={{color:"#333",fontSize:9,padding:"20px 0",textAlign:"center"}}>—</div>:rCtrl.map((m,i)=><div key={i} style={{display:"flex",gap:6,padding:"4px 0",borderBottom:"1px solid #181818"}}>{m.flag&&<div style={{width:8,height:8,borderRadius:2,background:{GREEN:"#00D26A",YELLOW:"#FFD600",RED:"#E8002D",BLUE:"#3671C6","DOUBLE YELLOW":"#FFA000",CLEAR:"#00D26A"}[m.flag]||"#444",flexShrink:0,marginTop:3}}/>}<div><div style={{fontSize:9,color:"#aaa",lineHeight:1.3}}>{m.message}</div><div style={{fontSize:8,color:"#333"}}>{m.category}</div></div></div>))}
    </div>
  </div>;
}