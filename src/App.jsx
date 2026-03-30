import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AreaChart, Area, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API = "https://api.openf1.org/v1";

const TEAM_C={"Red Bull Racing":"#3671C6",McLaren:"#FF8000",Ferrari:"#E8002D",Mercedes:"#27F4D2","Aston Martin":"#229971",Alpine:"#FF87BC",Williams:"#64C4FF",RB:"#6692FF","Kick Sauber":"#52E252","Haas F1 Team":"#B6BABD","Racing Bulls":"#6692FF","Red Bull":"#3671C6",Sauber:"#52E252",Cadillac:"#1E3D2F",Audi:"#ff4444"};
const COMP_C={SOFT:"#E8002D",MEDIUM:"#FFD600",HARD:"#ccc",INTERMEDIATE:"#00D26A",WET:"#3671C6"};
const ERS_C={deploy:"#00D4FF",harvest:"#00D26A",clip:"#FF8C00",superclip:"#E8002D",coast:"#666"};
const ERS_L={deploy:"Déploiement",harvest:"Récolte",clip:"Clipping",superclip:"Super Clip",coast:"Lift&Coast"};
const tc=n=>{if(!n)return"#888";for(const[k,v]of Object.entries(TEAM_C))if(n.includes(k)||k.includes(n))return v;return"#888";};
const fmtLap=s=>{if(!s)return"-";const m=Math.floor(s/60),sc=(s%60).toFixed(3);return m>0?`${m}:${sc.padStart(6,"0")}`:sc;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

const fetchJ=async(url,log)=>{
  log?.(`⏳ ${url.replace(/https?:\/\/[^/]+/,"").substring(0,55)}...`);
  for(let a=0;a<4;a++){
    try{
      const r=await fetch(url);
      if(r.status===429){log?.(`⚠️ Rate limit, attente ${(a+1)*2}s...`);await wait((a+1)*2000);continue;}
      if(!r.ok){log?.(`❌ HTTP ${r.status}`);return null;}
      const d=await r.json();
      if(d?.detail&&!Array.isArray(d)){log?.(`⚠️ Aucun résultat`);return[];}
      log?.(`✅ ${Array.isArray(d)?d.length+" items":"ok"}`);
      return d;
    }catch(e){if(a<3){log?.(`⚠️ Retry (${e.message})...`);await wait(1500);continue;}log?.(`❌ ${e.message}`);return null;}
  }
  return null;
};

const fetchApi=async(ep,params={},log)=>{
  const u=new URL(`${API}/${ep}`);
  let dateQuery = "";
  Object.entries(params).forEach(([k,v])=>{
    if(v!=null&&v!==""){
        if (k === 'date_range') { dateQuery = `&date>=${v.start}&date<=${v.end}`; } 
        else { u.searchParams.append(k,v); }
    }
  });
  return fetchJ(u.toString() + dateQuery, log);
};

function classifyErs(cur, prev, is26) {
  if (!prev || !cur.date || !prev.date) return "neutral";
  
  const dt = (new Date(cur.date).getTime() - new Date(prev.date).getTime()) / 1000;
  if (dt <= 0.05 || dt > 2.0) return "neutral";

  const { speed: s, throttle: t, brake: b } = cur;
  const accel = (s - prev.speed) / dt; 

  if (b > 5) return "harvest";
  if (t < 5 && b < 5 && accel < -5) return "coast";

  if (t >= 95) {
    if (is26 && s > 250 && accel < -10) return "superclip";
    if (s > 275 && accel < 2.5 && accel > -5) return "clip";
    return "deploy";
  }

  return "neutral";
}

function TrackMap({trackX,trackY,corners,ersSegs,ersMode,currentLap,driverDots,selDrv,onSelect}){
  if(!trackX?.length||trackX.length<10)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#444"}}><div style={{textAlign:"center"}}><div style={{fontSize:42,marginBottom:8}}>🏎️</div><div style={{fontFamily:"var(--f)",fontSize:11}}>Sélectionne un GP → Session</div></div></div>;
  const mnX=Math.min(...trackX),mxX=Math.max(...trackX),mnY=Math.min(...trackY),mxY=Math.max(...trackY);
  const rX=mxX-mnX||1,rY=mxY-mnY||1,pad=50,w=640,h=500;
  const N=(x,y)=>({x:pad+((x-mnX)/rX)*(w-2*pad),y:pad+((y-mnY)/rY)*(h-2*pad)});
  const pts=trackX.map((x,i)=>N(x,trackY[i]));
  const pathD=pts.map((p,i)=>`${i===0?"M":"L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")+" Z";
  const el=[];
  if(ersSegs?.length>2){const t=ersSegs.length;for(let i=1;i<t;i++){const tp=ersSegs[i].type;if(tp==="neutral")continue;
    const a=Math.floor(((i-1)/t)*pts.length),b=Math.min(Math.floor((i/t)*pts.length),pts.length-1);
    el.push({x1:pts[a].x,y1:pts[a].y,x2:pts[b].x,y2:pts[b].y,c:ERS_C[tp],k:i});}}
  const dots=(driverDots||[]).map(d=>{const idx=Math.min(Math.floor(d.progress*pts.length),pts.length-1);const p=pts[Math.max(0,idx)];return{...d,cx:p.x,cy:p.y};});
  return<svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",height:"100%"}}>
    <defs><filter id="gl"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path d={pathD} fill="none" stroke="#1a1a1a" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={pathD} fill="none" stroke="#262626" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"/>
    {el.map(l=><line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.c} strokeWidth="5" strokeLinecap="round" opacity={.85} filter="url(#gl)"/>)}
    <path d={pathD} fill="none" stroke="#3a3a3a" strokeWidth=".6" strokeDasharray="3 7"/>
    {corners?.map(c=>{const p=N(c.trackPosition.x,c.trackPosition.y);return<g key={c.number}>
      <circle cx={p.x} cy={p.y} r="7" fill="#151515" stroke="#333" strokeWidth=".5"/>
      <text x={p.x} y={p.y+3} textAnchor="middle" style={{fontSize:7,fill:"#555",fontFamily:"var(--f)"}}>{c.number}</text></g>;})}
    {pts.length>0&&<circle cx={pts[0].x} cy={pts[0].y} r="5" fill="none" stroke="#E8002D" strokeWidth="2"/>}
    {dots.map((d,i)=><g key={i} onClick={()=>onSelect(d.dn)} style={{cursor:"pointer"}}>
      {d.dn===selDrv&&<circle cx={d.cx} cy={d.cy} r="16" fill={d.color} opacity=".15"/>}
      <circle cx={d.cx} cy={d.cy} r={d.dn===selDrv?9:5.5} fill={d.color} stroke={d.dn===selDrv?"#fff":"#0a0a0a"} strokeWidth={d.dn===selDrv?2:1} filter="url(#gl)"/>
      <text x={d.cx} y={d.cy-(d.dn===selDrv?14:10)} textAnchor="middle" style={{fontSize:d.dn===selDrv?10:7.5,fill:"#ccc",fontFamily:"var(--f)",fontWeight:d.dn===selDrv?700:400}}>{d.acr}</text>
    </g>)}
    <text x={w-12} y={22} textAnchor="end" style={{fontSize:12,fill:"#E8002D",fontFamily:"var(--f)",fontWeight:700}}>
      {ersMode==="all"?"ALL LAPS":`LAP ${currentLap}`}</text>
  </svg>;
}

function TelChart({data,dk,color,label,unit,domain}){
  if(!data?.length)return null;
  return<div style={{marginBottom:4}}>
    <div style={{fontSize:9,color:"#555",fontFamily:"var(--f)",marginBottom:1,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
    <ResponsiveContainer width="100%" height={55}>
      <AreaChart data={data} margin={{top:1,right:0,bottom:0,left:0}}>
        <defs><linearGradient id={`g-${dk}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.3}/><stop offset="100%" stopColor={color} stopOpacity={.02}/></linearGradient></defs>
        <Area type="monotone" dataKey={dk} stroke={color} fill={`url(#g-${dk})`} strokeWidth={1.2} dot={false} isAnimationActive={false}/>
        <YAxis domain={domain||["auto","auto"]} hide/>
        <Tooltip contentStyle={{background:"#1a1a1a",border:"1px solid #333",borderRadius:4,fontSize:10,fontFamily:"var(--f)",padding:"3px 7px"}} formatter={v=>[`${Math.round(v)}${unit||""}`,label]} labelFormatter={()=>""}/>
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

function DrvCard({d,pos,sel,onClick,lap,intv}){
  const c=tc(d.team_name);
  return<div onClick={onClick} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",background:sel?`${c}10`:"transparent",borderLeft:`3px solid ${sel?c:"transparent"}`,cursor:"pointer",borderBottom:"1px solid #131313"}}>
    <div style={{fontSize:11,fontWeight:700,color:pos<=3?"#E8002D":"#3a3a3a",fontFamily:"var(--f)",width:16,textAlign:"right"}}>{pos}</div>
    <div style={{width:3,height:16,borderRadius:1,background:c}}/>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:11,fontWeight:600,color:"#ccc",fontFamily:"var(--f)"}}>{d.name_acronym}</div>
      <div style={{fontSize:7.5,color:"#444",fontFamily:"var(--f)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.team_name}</div>
    </div>
    <div style={{textAlign:"right"}}>
      {lap?.lap_duration&&<div style={{fontSize:10,color:"#888",fontFamily:"var(--f)"}}>{fmtLap(lap.lap_duration)}</div>}
      {intv?.interval!=null&&<div style={{fontSize:8,color:"#E8002D",fontFamily:"var(--f)"}}>+{typeof intv.interval==="number"?intv.interval.toFixed(3):intv.interval}</div>}
    </div>
  </div>;
}

export default function App(){
  const[meetings,setMeetings]=useState([]);
  const[selMeet,setSelMeet]=useState(null);
  const[sessions,setSessions]=useState([]);
  const[selSess,setSelSess]=useState(null);
  const[drivers,setDrivers]=useState([]);
  const[trackX,setTrackX]=useState([]);
  const[trackY,setTrackY]=useState([]);
  const[corners,setCorners]=useState([]);
  const[radios,setRadios]=useState([]);
  const[rCtrl,setRCtrl]=useState([]);
  const[laps,setLaps]=useState([]);
  const[posSnaps,setPosSnaps]=useState([]);
  const[intervals,setIntervals]=useState([]);
  
  const[lapDataCache,setLapDataCache]=useState({}); 
  const[currentCarData, setCurrentCarData]=useState([]);

  const[stints,setStints]=useState([]);
  const[ersSegs,setErsSegs]=useState([]);
  const[selDrv,setSelDrv]=useState(null);
  const[curLap,setCurLap]=useState(1);
  const[maxLap,setMaxLap]=useState(1);
  const[loading,setLoading]=useState(false);
  const[telStatus,setTelStatus]=useState("idle");
  const[tab,setTab]=useState("radio");
  const[rfDrv,setRfDrv]=useState("");
  const[rfLap,setRfLap]=useState("");
  const[play,setPlay]=useState(false);
  const[ersMode,setErsMode]=useState("lap");
  const[sessionReady,setSessionReady]=useState(false);
  const playRef=useRef(null);
  const lapsRef=useRef([]);
  const[logs,setLogs]=useState([]);
  const[showLog,setShowLog]=useState(false);
  const[apiOk,setApiOk]=useState("...");
  const[year,setYear]=useState(2026);
  const log=useCallback(m=>setLogs(p=>[...p.slice(-60),{t:new Date().toLocaleTimeString("fr-FR"),m}]),[]);
  const is26=year>=2026;

  useEffect(()=>{setApiOk("...");setMeetings([]);
    fetchApi("meetings",{year},log).then(d=>{
      if(!d||!Array.isArray(d)){setApiOk("ERR");return;}
      setApiOk("OK");setMeetings(d.filter(m=>!m.meeting_name?.includes("Testing")).sort((a,b)=>new Date(b.date_start)-new Date(a.date_start)));
    });
  },[year]);

  useEffect(()=>{if(!selMeet)return;setSessions([]);setSelSess(null);
    fetchApi("sessions",{meeting_key:selMeet.meeting_key},log).then(d=>Array.isArray(d)&&setSessions(d));
  },[selMeet]);

  useEffect(()=>{
    if(!selSess)return;
    const sk=selSess.session_key;
    setLoading(true);setSessionReady(false);
    setDrivers([]);setTrackX([]);setTrackY([]);setCorners([]);setRadios([]);setRCtrl([]);
    setLaps([]);setLapDataCache({});setCurrentCarData([]);setStints([]);setPosSnaps([]);setIntervals([]);setErsSegs([]);
    setSelDrv(null);setCurLap(1);setTelStatus("idle");
    lapsRef.current=[];

    (async()=>{
      if(selMeet?.circuit_info_url){
        const c=await fetchJ(selMeet.circuit_info_url,log);
        if(c?.x?.length>10){setTrackX(c.x);setTrackY(c.y);setCorners(c.corners||[]);}
      }

      let firstDriver=null;
      const drv=await fetchApi("drivers",{session_key:sk},log);
      if(Array.isArray(drv)){
        const u=[...new Map(drv.map(x=>[x.driver_number,x])).values()];
        setDrivers(u);if(u.length){firstDriver=u[0].driver_number;setSelDrv(firstDriver);}
      }
      
      const ld=await fetchApi("laps",{session_key:sk},log);
      if(Array.isArray(ld)){setLaps(ld);lapsRef.current=ld;setMaxLap(Math.max(...ld.map(l=>l.lap_number||0),1));}
      
      const pos=await fetchApi("position",{session_key:sk},log);
      if(Array.isArray(pos)&&pos.length){
        const sorted=[...pos].sort((a,b)=>new Date(a.date)-new Date(b.date));
        const state={};const snaps=[];
        for(const p of sorted){state[p.driver_number]=p.position;snaps.push({date:p.date,state:{...state}});}
        setPosSnaps(snaps);
      }
      
      const st=await fetchApi("stints",{session_key:sk},log);
      if(Array.isArray(st))setStints(st);
      
      const iv=await fetchApi("intervals",{session_key:sk},log);
      if(Array.isArray(iv))setIntervals(iv);

      const rad = await fetchApi("team_radio",{session_key:sk},log);
      if(Array.isArray(rad)) setRadios(rad.sort((a,b)=>new Date(a.date)-new Date(b.date)));

      const rc = await fetchApi("race_control",{session_key:sk},log);
      if(Array.isArray(rc))setRCtrl(rc);

      setSessionReady(true);
      setLoading(false);
    })();
  },[selSess]);

  useEffect(()=>{
    if(!sessionReady||!selDrv||!laps.length)return;
    
    const cacheKey = `${selDrv}-${curLap}`;
    if(lapDataCache[cacheKey]) {
        setCurrentCarData(lapDataCache[cacheKey]);
        setTelStatus("loaded");
        return;
    }

    const currentLapData = laps.find(l=>l.driver_number===selDrv&&l.lap_number===curLap);
    
    if(!currentLapData || !currentLapData.date_start) {
        setCurrentCarData([]);
        setTelStatus("error");
        log(`❌ Impossible de charger la télémétrie: date_start manquant pour T${curLap}`);
        return;
    }

    const nextLapData = laps.find(l=>l.driver_number===selDrv&&l.lap_number===curLap+1);
    const startTime = new Date(currentLapData.date_start);
    const endTime = nextLapData?.date_start ? new Date(nextLapData.date_start) : new Date(startTime.getTime() + 120000);

    setTelStatus("loading");
    
    fetchApi("car_data", {
        session_key: selSess.session_key, 
        driver_number: selDrv,
        date_range: { start: startTime.toISOString(), end: endTime.toISOString() }
    }, log).then(d => {
        if(Array.isArray(d)) {
            const sorted = d.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const unique = [];
            let lastTime = 0;
            
            for(const pt of sorted) {
                const t = new Date(pt.date).getTime();
                if(t - lastTime > 100) { 
                    unique.push(pt);
                    lastTime = t;
                }
            }
            
            const f = unique.filter(p => p.speed > 5);
            setLapDataCache(prev => ({...prev, [cacheKey]: f}));
            setCurrentCarData(f);
            setTelStatus("loaded");
        } else {
            setCurrentCarData([]);
            setTelStatus("error");
        }
    });

  },[sessionReady, selDrv, curLap, laps, lapDataCache, selSess]);

  const posAtLap=useMemo(()=>{
    if(!posSnaps.length||!laps.length)return{};
    const lapEntries=laps.filter(l=>l.lap_number===curLap&&l.date_start);
    if(!lapEntries.length)return posSnaps[posSnaps.length-1]?.state||{};
    const lapTime=Math.min(...lapEntries.map(l=>new Date(l.date_start).getTime()));
    let best=posSnaps[0]?.state||{};
    for(const s of posSnaps){if(new Date(s.date).getTime()<=lapTime)best=s.state;else break;}
    return best;
  },[posSnaps,laps,curLap]);

  const sortedDrv=useMemo(()=>!drivers.length?[]:[...drivers].sort((a,b)=>(posAtLap[a.driver_number]||99)-(posAtLap[b.driver_number]||99)),[drivers,posAtLap]);

  const driverDots=useMemo(()=>{
    if(!trackX.length||!drivers.length)return[];
    const total=drivers.length;
    return drivers.map(d=>{
      const pos=posAtLap[d.driver_number]||total;
      return{progress:(1-((pos-1)/total)*0.6)%1,color:tc(d.team_name),acr:d.name_acronym,dn:d.driver_number};
    });
  },[trackX,drivers,posAtLap]);

  useEffect(()=>{
    if(currentCarData.length<20){setErsSegs([]);return;}
    const step=Math.max(1,Math.floor(currentCarData.length/300));
    setErsSegs(currentCarData.filter((_,i)=>i%step===0).map((p,i,arr)=>({...p,type:classifyErs(p,arr[i-1],is26)})));
  },[currentCarData,is26]);

  useEffect(()=>{if(play)playRef.current=setInterval(()=>setCurLap(l=>{if(l>=maxLap){setPlay(false);return l;}return l+1;}),1500);return()=>clearInterval(playRef.current);},[play,maxLap]);

  const curLapD=useMemo(()=>{const m=new Map();laps.filter(l=>l.lap_number===curLap).forEach(l=>m.set(l.driver_number,l));return m;},[laps,curLap]);
  const curIntv=useMemo(()=>{const m=new Map();intervals.forEach(i=>m.set(i.driver_number,i));return m;},[intervals]);

  const radiosExt=useMemo(()=>radios.map(r=>{const rT=new Date(r.date).getTime();
    const dL=laps.filter(l=>l.driver_number===r.driver_number).sort((a,b)=>a.lap_number-b.lap_number);
    let lap=null;for(const l of dL)if(l.date_start&&new Date(l.date_start).getTime()<=rT)lap=l.lap_number;
    return{...r,lap};}),[radios,laps]);
  const filtRadios=useMemo(()=>{let f=radiosExt;if(rfDrv)f=f.filter(r=>r.driver_number===parseInt(rfDrv));if(rfLap)f=f.filter(r=>r.lap===parseInt(rfLap));return f;},[radiosExt,rfDrv,rfLap]);

  const telChart=useMemo(()=>{if(!currentCarData.length)return[];const step=Math.max(1,Math.floor(currentCarData.length/150));
    return currentCarData.filter((_,i)=>i%step===0).map((d,i)=>({i,speed:d.speed,throttle:d.throttle,brake:d.brake,rpm:d.rpm,gear:d.n_gear}));},[currentCarData]);
  const ersChart=useMemo(()=>{if(telChart.length<5)return[];return telChart.map((t,i)=>{if(i<2)return{...t,ers:0};
    const prev = telChart[i-1];
    let ers=0;
    if(t.brake>5)ers=100;
    else if(t.throttle>=95){
      if(is26&&t.speed>250&&(t.speed-prev.speed)<=-1)ers=100;
      else if(t.speed>275&&(t.speed-prev.speed)<1)ers=80;
      else ers=-100;
    }
    return{...t,ers};});},[telChart,is26]);

  const selDrvObj=drivers.find(d=>d.driver_number===selDrv);
  const ss={background:"#141414",color:"#aaa",border:"1px solid #1e1e1e",borderRadius:4,padding:"4px 8px",fontSize:10,fontFamily:"var(--f)"};

  return<div style={{"--f":"'JetBrains Mono','SF Mono','Fira Code',monospace",height:"100vh",background:"#0a0a0a",color:"#eee",fontFamily:"var(--f)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
    <header style={{padding:"7px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #181818",background:"#0d0d0d",flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:7}}>
        <div style={{width:3,height:22,background:"#E8002D",borderRadius:2}}/>
        <div><div style={{fontSize:12,fontWeight:700,letterSpacing:2}}>F1 <span style={{color:"#E8002D"}}>COCKPIT</span></div>
        <div style={{fontSize:7,color:"#333",letterSpacing:1}}>{is26?"2026 • ERS • CLIPPING":"RACE ANALYSIS"}</div></div>
      </div>
      <div style={{display:"flex",gap:5,flex:1,flexWrap:"wrap",justifyContent:"flex-end",alignItems:"center"}}>
        <select value={year} onChange={e=>{setYear(+e.target.value);setSelMeet(null);setSelSess(null);}} style={{...ss,width:68}}>
          {[2026,2025,2024,2023].map(y=><option key={y} value={y}>{y}</option>)}</select>
        <select value={selMeet?.meeting_key||""} onChange={e=>{setSelMeet(meetings.find(m=>m.meeting_key===+e.target.value)||null);setSelSess(null);}} style={{...ss,minWidth:160,maxWidth:240}}>
          <option value="">Grand Prix...</option>{meetings.map(m=><option key={m.meeting_key} value={m.meeting_key}>{m.meeting_name}</option>)}</select>
        <select value={selSess?.session_key||""} onChange={e=>setSelSess(sessions.find(s=>s.session_key===+e.target.value)||null)} style={{...ss,width:110}}>
          <option value="">Session...</option>{sessions.map(s=><option key={s.session_key} value={s.session_key}>{s.session_name}</option>)}</select>
        <div style={{display:"flex",alignItems:"center",gap:4,padding:"2px 7px",borderRadius:3,background:apiOk==="OK"?"#0a200a":"#200a0a"}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:apiOk==="OK"?"#0a0":apiOk==="ERR"?"#a00":"#aa0",animation:apiOk==="..."?"pulse 1s infinite":"none"}}/>
          <span style={{fontSize:8,color:apiOk==="OK"?"#4a4":"#a44"}}>{apiOk}</span></div>
        <button onClick={()=>setShowLog(d=>!d)} style={{background:"none",border:"1px solid #1e1e1e",borderRadius:3,padding:"2px 6px",cursor:"pointer",fontSize:8,color:showLog?"#64C4FF":"#333",fontFamily:"var(--f)"}}>LOG</button>
      </div>
    </header>

    {showLog&&<div style={{background:"#060610",borderBottom:"1px solid #181828",padding:"5px 12px",maxHeight:100,overflow:"auto",fontSize:8}}>
      {logs.map((l,i)=><div key={i} style={{color:l.m.startsWith("✅")?"#0a0":l.m.startsWith("❌")?"#a00":l.m.startsWith("⏳")?"#aa0":l.m.startsWith("⚠")?"#a80":"#555",lineHeight:1.5}}><span style={{color:"#1a1a1a",marginRight:5}}>{l.t}</span>{l.m}</div>)}</div>}
    {loading&&<div style={{height:2,background:"#181818",overflow:"hidden"}}><div style={{height:"100%",width:"30%",background:"linear-gradient(90deg,#E8002D,#FF6B35)",animation:"slide 1.2s ease-in-out infinite"}}/></div>}

    <div style={{display:"flex",flex:1,overflow:"hidden"}}>
      <div style={{width:210,borderRight:"1px solid #131313",overflow:"auto",background:"#0c0c0c",flexShrink:0}}>
        <div style={{padding:"7px 8px",fontSize:8,color:"#333",textTransform:"uppercase",letterSpacing:1,borderBottom:"1px solid #131313",fontWeight:600}}>
          Classement • Tour {curLap}</div>
        {sortedDrv.map((d,i)=><DrvCard key={d.driver_number} d={d} pos={posAtLap[d.driver_number]||i+1} sel={selDrv===d.driver_number} onClick={()=>setSelDrv(d.driver_number)} lap={curLapD.get(d.driver_number)} intv={curIntv.get(d.driver_number)}/>)}
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{flex:"1 1 50%",position:"relative",minHeight:220,background:"#0e0e0e"}}>
          <TrackMap trackX={trackX} trackY={trackY} corners={corners} ersSegs={ersSegs} ersMode={ersMode} currentLap={curLap} driverDots={driverDots} selDrv={selDrv} onSelect={setSelDrv}/>
          <div style={{position:"absolute",bottom:8,left:12,right:12,display:"flex",gap:6}}>
            {maxLap>1&&<div style={{flex:1,background:"#0e0e0ecc",backdropFilter:"blur(6px)",borderRadius:6,padding:"5px 10px",display:"flex",alignItems:"center",gap:6,border:"1px solid #1c1c1c"}}>
              <button onClick={()=>setPlay(!play)} style={{background:play?"#E8002D":"#1c1c1c",color:"#fff",border:"none",borderRadius:3,width:26,height:22,cursor:"pointer",fontSize:10}}>{play?"⏸":"▶"}</button>
              <button onClick={()=>setCurLap(l=>Math.max(1,l-1))} style={{background:"#1c1c1c",color:"#666",border:"none",borderRadius:3,width:22,height:22,cursor:"pointer",fontSize:9}}>◀</button>
              <input type="range" min={1} max={maxLap} value={curLap} onChange={e=>{setCurLap(+e.target.value);setPlay(false);}} style={{flex:1,accentColor:"#E8002D"}}/>
              <button onClick={()=>setCurLap(l=>Math.min(maxLap,l+1))} style={{background:"#1c1c1c",color:"#666",border:"none",borderRadius:3,width:22,height:22,cursor:"pointer",fontSize:9}}>▶</button>
              <span style={{fontSize:9,color:"#555",minWidth:44,textAlign:"right"}}>{curLap}/{maxLap}</span>
            </div>}
          </div>
        </div>

        <div style={{borderTop:"1px solid #181818",padding:"6px 12px",background:"#0c0c0c",flex:"0 1 auto",maxHeight:280,overflow:"auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:selDrvObj?tc(selDrvObj.team_name):"#333"}}/>
            <span style={{fontSize:10,fontWeight:600,color:"#666",textTransform:"uppercase",letterSpacing:1}}>
              {selDrvObj?.name_acronym||"—"} {is26?"• ERS 2026":"• Télémétrie"} (Tour {curLap})</span>
          </div>
          {telChart.length===0
            ?<div style={{color:"#333",fontSize:10,padding:"16px 0",textAlign:"center"}}>
              {telStatus==="loading"?"⏳ Chargement du tour en cours..."
              :telStatus==="error"?"❌ Données de télémétrie indisponibles pour ce tour"
              :"Sélectionne une session et un tour"}</div>
            :<>
              <TelChart data={telChart} dk="speed" color="#00D4FF" label="Vitesse" unit=" km/h" domain={[0,370]}/>
              <TelChart data={telChart} dk="throttle" color="#00D26A" label="Accélérateur" unit="%" domain={[0,100]}/>
              <TelChart data={telChart} dk="brake" color="#E8002D" label="Frein" unit="%" domain={[0,100]}/>
              <TelChart data={telChart} dk="gear" color="#B366FF" label="Rapport" domain={[0,9]}/>
              
              <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:8,marginBottom:4,flexWrap:"wrap"}}>
                {Object.entries(ERS_L).map(([k,l])=><div key={k} style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:10,height:10,background:ERS_C[k],borderRadius:2}}/>
                  <span style={{fontSize:9,color:"#aaa",fontFamily:"var(--f)"}}>{l}</span>
                </div>)}
              </div>
              <TelChart data={ersChart} dk="ers" color="#FF8C00" label={is26?"ERS 2026 (↑récolte/clip ↓deploy)":"ERS"} unit="%" domain={[-100,100]}/>
            </>}
        </div>
      </div>

      <div style={{width:260,borderLeft:"1px solid #131313",display:"flex",flexDirection:"column",background:"#0c0c0c",flexShrink:0}}>
        <div style={{display:"flex",borderBottom:"1px solid #131313"}}>
          {[{id:"radio",l:"📻 Radio",c:filtRadios.length},{id:"ctrl",l:"🏁 Direction",c:rCtrl.length}].map(t=>
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"7px",background:tab===t.id?"#131313":"transparent",border:"none",borderBottom:tab===t.id?"2px solid #E8002D":"2px solid transparent",color:tab===t.id?"#ccc":"#333",cursor:"pointer",fontSize:9,fontFamily:"var(--f)",fontWeight:600}}>{t.l} <span style={{color:"#E8002D",marginLeft:2}}>{t.c}</span></button>)}</div>

        {tab==="radio"&&<div style={{padding:"5px 8px",borderBottom:"1px solid #131313",display:"flex",gap:3}}>
          <select value={rfDrv} onChange={e=>setRfDrv(e.target.value)} style={{...ss,flex:1,fontSize:9}}><option value="">Tous</option>{drivers.map(d=><option key={d.driver_number} value={d.driver_number}>{d.name_acronym}</option>)}</select>
          <select value={rfLap} onChange={e=>setRfLap(e.target.value)} style={{...ss,width:60,fontSize:9}}><option value="">Tour</option>{Array.from({length:maxLap},(_,i)=>i+1).map(l=><option key={l} value={l}>T{l}</option>)}</select>
        </div>}

        <div style={{flex:1,overflow:"auto",padding:"0 8px"}}>
          {tab==="radio"&&(filtRadios.length===0
            ?<div style={{color:"#444",fontSize:9,padding:"16px 8px",textAlign:"center",lineHeight:1.6}}>Aucune radio disponible.</div>
            :filtRadios.map((r,i)=><div key={i} style={{display:"flex",gap:7,padding:"6px 0",borderBottom:"1px solid #181818"}}>
              <div style={{width:3,minHeight:26,borderRadius:2,background:tc(drivers.find(d=>d.driver_number===r.driver_number)?.team_name),flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:10,fontWeight:700,color:tc(drivers.find(d=>d.driver_number===r.driver_number)?.team_name),fontFamily:"var(--f)"}}>{drivers.find(d=>d.driver_number===r.driver_number)?.name_acronym||`#${r.driver_number}`}</span>
                  <span style={{fontSize:8,color:"#444",fontFamily:"var(--f)"}}>{r.lap?`T${r.lap}`:""} {r.date?new Date(r.date).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):""}</span>
                </div>
                {r.recording_url && <audio controls preload="none" style={{width:"100%",height:24,marginTop:3}}><source src={r.recording_url} type="audio/mpeg"/></audio>}
              </div></div>))}
          {tab==="ctrl"&&(rCtrl.length===0
            ?<div style={{color:"#333",fontSize:9,padding:"20px 0",textAlign:"center"}}>{selSess?"Aucun message":"—"}</div>
            :rCtrl.map((m,i)=><div key={i} style={{display:"flex",gap:6,padding:"4px 0",borderBottom:"1px solid #181818"}}>
              {m.flag&&<div style={{width:8,height:8,borderRadius:2,background:{GREEN:"#00D26A",YELLOW:"#FFD600",RED:"#E8002D",BLUE:"#3671C6","DOUBLE YELLOW":"#FFA000",CLEAR:"#00D26A"}[m.flag]||"#444",flexShrink:0,marginTop:3}}/>}
              <div><div style={{fontSize:9,color:"#aaa",fontFamily:"var(--f)",lineHeight:1.3}}>{m.message}</div>
              <div style={{fontSize:8,color:"#333",fontFamily:"var(--f)"}}>{m.category} {m.date?new Date(m.date).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):""}</div></div></div>))}
        </div>
      </div>
    </div>
  </div>;
}