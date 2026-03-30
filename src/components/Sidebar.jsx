import { tc, COMP_C, fmtLap } from "../api";

function DrvCard({d, pos, sel, isCmp, onClick, onCompare, lap, intv, raceData}) {
  const c=tc(d.team_name);
  const { pitCount, compound, age } = raceData || {};
  const compColor = COMP_C[compound] || "#555";

  return <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",background:sel?`${c}10`:isCmp?"#1a1a1a":"transparent",borderLeft:`3px solid ${sel?c:isCmp?"#fff":"transparent"}`,cursor:"pointer",borderBottom:"1px solid #131313"}}>
    <div style={{fontSize:11,fontWeight:700,color:pos<=3?"#E8002D":"#3a3a3a",fontFamily:"var(--f)",width:16,textAlign:"right"}}>{pos}</div>
    <div style={{width:3,height:16,borderRadius:1,background:c}}/>
    <div style={{flex:1,minWidth:0}}>
      <div style={{display:"flex", alignItems:"center", gap: 6}}>
        <div style={{fontSize:11,fontWeight:600,color:"#ccc",fontFamily:"var(--f)"}}>{d.name_acronym}</div>
        {compound && <div style={{display:"flex", alignItems:"center", gap:3, background:"#1a1a1a", padding:"1px 4px", borderRadius:3, border:`1px solid ${compColor}40`}}>
          <div style={{width:6, height:6, borderRadius:"50%", background:compColor}}/>
          <span style={{fontSize:8, color:"#aaa", fontFamily:"var(--f)", fontWeight:600}}>{age}T</span>
        </div>}
        {pitCount > 0 && <div style={{fontSize:8, color:"#888", background:"#111", border:"1px solid #222", padding:"1px 4px", borderRadius:3, fontWeight:600}}>P{pitCount}</div>}
      </div>
      <div style={{fontSize:7.5,color:"#444",fontFamily:"var(--f)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap", marginTop:2}}>{d.team_name}</div>
    </div>
    <div style={{textAlign:"right", display:"flex", alignItems:"center", gap:6}}>
      {!sel && (
        <button onClick={e=>{e.stopPropagation();onCompare();}} style={{fontSize:8, fontWeight:700, padding:"2px 5px", background:isCmp?"#fff":"#1a1a1a", color:isCmp?"#000":"#666", border:"1px solid #333", borderRadius:3, cursor:"pointer"}}>VS</button>
      )}
      <div style={{textAlign:"right", minWidth:40}}>
        {lap?.lap_duration&&<div style={{fontSize:10,color:"#888",fontFamily:"var(--f)"}}>{fmtLap(lap.lap_duration)}</div>}
        {intv?.interval!=null&&<div style={{fontSize:8,color:"#E8002D",fontFamily:"var(--f)"}}>+{typeof intv.interval==="number"?intv.interval.toFixed(3):intv.interval}</div>}
      </div>
    </div>
  </div>;
}

export default function Sidebar({ curLap, sortedDrv, posAtLap, selDrv, cmpDrv, setSelDrv, setCmpDrv, curLapD, curIntv, drvRaceData }) {
  return <div style={{gridArea: "sidebar", borderRight:"1px solid #131313",overflow:"auto",background:"#0c0c0c"}}>
    <div style={{padding:"7px 8px",fontSize:8,color:"#333",textTransform:"uppercase",letterSpacing:1,borderBottom:"1px solid #131313",fontWeight:600}}>Classement • Tour {curLap}</div>
    {sortedDrv.map((d,i) => <DrvCard key={d.driver_number} d={d} pos={posAtLap[d.driver_number]||i+1} sel={selDrv===d.driver_number} isCmp={cmpDrv===d.driver_number} onClick={()=>setSelDrv(d.driver_number)} onCompare={()=>setCmpDrv(p=>p===d.driver_number?null:d.driver_number)} lap={curLapD.get(d.driver_number)} intv={curIntv.get(d.driver_number)} raceData={drvRaceData[d.driver_number]}/>)}
  </div>;
}