import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { tc } from "../api";

export default function RightPanel({ tab, setTab, filtRadios, rCtrl, weather, curWeather, drivers, maxLap, rfDrv, setRfDrv, rfLap, setRfLap, ss }) {
  return <div style={{gridArea: "rightpanel", borderLeft:"1px solid #131313",display:"flex",flexDirection:"column",background:"#0c0c0c"}}>
    <div style={{display:"flex",borderBottom:"1px solid #131313"}}>
      {[{id:"weather",l:"🌤️ Météo",c:""},{id:"radio",l:"📻 Radio",c:filtRadios.length},{id:"ctrl",l:"🏁 Dir.",c:rCtrl.length}].map(t=>
        <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"7px",background:tab===t.id?"#131313":"transparent",border:"none",borderBottom:tab===t.id?"2px solid #E8002D":"2px solid transparent",color:tab===t.id?"#ccc":"#333",cursor:"pointer",fontSize:9,fontFamily:"var(--f)",fontWeight:600}}>{t.l} <span style={{color:"#E8002D",marginLeft:2}}>{t.c}</span></button>)}
    </div>

    <div style={{flex:1,overflow:"auto",padding:"8px"}}>
      {tab==="weather"&&(weather.length===0
        ?<div style={{color:"#444",fontSize:9,padding:"16px 8px",textAlign:"center"}}>Données météo indisponibles.</div>
        :<>
          {curWeather && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,padding:"8px",background:"#131313",borderRadius:4,marginBottom:8,fontSize:10,border:"1px solid #1c1c1c"}}>
            <div><span style={{color:"#666"}}>Piste</span> <span style={{color:"#FF8C00",fontWeight:700,float:"right"}}>{curWeather.track_temperature}°C</span></div>
            <div><span style={{color:"#666"}}>Air</span> <span style={{color:"#00D4FF",fontWeight:700,float:"right"}}>{curWeather.air_temperature}°C</span></div>
            <div><span style={{color:"#666"}}>Vent</span> <span style={{color:"#ccc",float:"right"}}>{curWeather.wind_speed} m/s</span></div>
            <div><span style={{color:"#666"}}>Pluie</span> <span style={{color:curWeather.rainfall?"#00D4FF":"#ccc",float:"right"}}>{curWeather.rainfall?"Oui":"Non"}</span></div>
          </div>}
          <div style={{fontSize:9,color:"#555",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Évolution Session</div>
          <div style={{height:120}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weather} margin={{top:5,right:5,bottom:5,left:0}}>
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} hide/>
                <Tooltip contentStyle={{background:"#1a1a1a",border:"1px solid #333",borderRadius:4,fontSize:10,fontFamily:"var(--f)",padding:"3px 7px"}} labelFormatter={()=>""}/>
                <Line type="monotone" dataKey="track_temperature" name="Piste" stroke="#FF8C00" strokeWidth={1.5} dot={false} isAnimationActive={false}/>
                <Line type="monotone" dataKey="air_temperature" name="Air" stroke="#00D4FF" strokeWidth={1.5} dot={false} isAnimationActive={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {tab==="radio"&&<>
        <div style={{display:"flex",gap:3,marginBottom:8}}>
          <select value={rfDrv} onChange={e=>setRfDrv(e.target.value)} style={{...ss,flex:1,fontSize:9}}><option value="">Tous</option>{drivers.map(d=><option key={d.driver_number} value={d.driver_number}>{d.name_acronym}</option>)}</select>
          <select value={rfLap} onChange={e=>setRfLap(e.target.value)} style={{...ss,width:60,fontSize:9}}><option value="">Tour</option>{Array.from({length:maxLap},(_,i)=>i+1).map(l=><option key={l} value={l}>T{l}</option>)}</select>
        </div>
        {filtRadios.length===0?<div style={{color:"#444",fontSize:9,padding:"16px 8px",textAlign:"center"}}>Aucune radio</div>:filtRadios.map((r,i)=><div key={i} style={{display:"flex",gap:7,padding:"6px 0",borderBottom:"1px solid #181818"}}><div style={{width:3,minHeight:26,borderRadius:2,background:tc(drivers.find(d=>d.driver_number===r.driver_number)?.team_name),flexShrink:0}}/><div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,fontWeight:700,color:tc(drivers.find(d=>d.driver_number===r.driver_number)?.team_name)}}>{drivers.find(d=>d.driver_number===r.driver_number)?.name_acronym||`#${r.driver_number}`}</span><span style={{fontSize:8,color:"#444"}}>{r.lap?`T${r.lap}`:""}</span></div>{r.recording_url && <audio controls preload="none" style={{width:"100%",height:24,marginTop:3}}><source src={r.recording_url} type="audio/mpeg"/></audio>}</div></div>)}
      </>}

      {tab==="ctrl"&&(rCtrl.length===0?<div style={{color:"#333",fontSize:9,padding:"20px 0",textAlign:"center"}}>—</div>:rCtrl.map((m,i)=><div key={i} style={{display:"flex",gap:6,padding:"4px 0",borderBottom:"1px solid #181818"}}>{m.flag&&<div style={{width:8,height:8,borderRadius:2,background:{GREEN:"#00D26A",YELLOW:"#FFD600",RED:"#E8002D",BLUE:"#3671C6","DOUBLE YELLOW":"#FFA000",CLEAR:"#00D26A"}[m.flag]||"#444",flexShrink:0,marginTop:3}}/>}<div><div style={{fontSize:9,color:"#aaa",lineHeight:1.3}}>{m.message}</div><div style={{fontSize:8,color:"#333"}}>{m.category}</div></div></div>))}
    </div>
  </div>;
}