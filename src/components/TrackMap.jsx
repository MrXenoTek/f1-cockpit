import { useState, useEffect } from "react";
import { ERS_C } from "../api";

export default function TrackMap({trackX, trackY, corners, ersSegs, currentLap, driverDots, selDrv, cmpDrv, onSelect, telChart, c1, c2, selDrvObj, cmpDrvObj, hoveredIndex, s1Ratio, s2Ratio, t, mapMetric, setMapMetric}) {
  const [animIdx, setAnimIdx] = useState(null);

  useEffect(() => {
    let interval;
    if (animIdx !== null && animIdx < 199) {
      interval = setTimeout(() => setAnimIdx(prev => prev + 1), 30);
    } else if (animIdx >= 199) {
      setTimeout(() => setAnimIdx(null), 1000);
    }
    return () => clearTimeout(interval);
  }, [animIdx]);

  if(!trackX?.length||trackX.length<10)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#444"}}><div style={{textAlign:"center"}}><div style={{fontSize:42,marginBottom:8}}>🏎️</div><div style={{fontFamily:"var(--f)",fontSize:11}}>Sélectionne un GP → Session</div></div></div>;
  const mnX=Math.min(...trackX),mxX=Math.max(...trackX),mnY=Math.min(...trackY),mxY=Math.max(...trackY);
  const rX=mxX-mnX||1,rY=mxY-mnY||1,pad=50,w=640,h=500;
  const N=(x,y)=>({x:pad+((x-mnX)/rX)*(w-2*pad),y:pad+((y-mnY)/rY)*(h-2*pad)});
  const pts=trackX.map((x,i)=>N(x,trackY[i]));
  const pathD=pts.map((p,i)=>`${i===0?"M":"L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")+" Z";
  
  const el=[];
  // LOGIQUE DE DOMINATION SPATIALE MULTI-MÉTRIQUES
  if(cmpDrv && telChart?.length > 10) {
    const tLen = telChart.length;
    for(let i=1; i<tLen; i++) {
      const pt = telChart[i];
      let val1 = pt[`${mapMetric}1`];
      let val2 = pt[`${mapMetric}2`];
      
      if(val1 == null || val2 == null) continue;
      
      // Tolérance dynamique (1 km/h pour la vitesse, 5% pour frein/accélérateur)
      const threshold = mapMetric === 'speed' ? 1 : 5;
      if(Math.abs(val1 - val2) < threshold) continue; 
      
      const color = val1 > val2 ? c1 : c2;
      const a = Math.floor(((i-1)/tLen)*pts.length);
      const b = Math.min(Math.floor((i/tLen)*pts.length), pts.length-1);
      el.push({x1:pts[a].x, y1:pts[a].y, x2:pts[b].x, y2:pts[b].y, c:color, k:`ms-${i}`});
    }
  } else if(ersSegs?.length > 2) {
    const tLen=ersSegs.length;
    for(let i=1; i<tLen; i++){
      const tp=ersSegs[i].type;
      if(tp==="neutral")continue;
      const a=Math.floor(((i-1)/tLen)*pts.length);
      const b=Math.min(Math.floor((i/tLen)*pts.length), pts.length-1);
      el.push({x1:pts[a].x, y1:pts[a].y, x2:pts[b].x, y2:pts[b].y, c:ERS_C[tp], k:`ers-${i}`});
    }
  }

  const visibleDots = cmpDrv 
    ? driverDots.filter(d => d.dn === selDrv || d.dn === cmpDrv).sort((a,b) => a.dn === selDrv ? -1 : 1) 
    : driverDots;

  const selDot = driverDots.find(x => x.dn === selDrv);
  const selBaseProg = selDot ? selDot.progress : 0;

  const dots = visibleDots.map(d => {
    let p;
    const isCmp = d.dn === cmpDrv;
    if (animIdx !== null) {
      const baseAnimProg = animIdx / 199;
      let currentProg = baseAnimProg;
      
      if (!cmpDrv && d.dn !== selDrv) {
        const offset = d.progress - selBaseProg;
        currentProg = (baseAnimProg + offset + 1) % 1;
      }
      
      const ptsIndex = Math.min(Math.floor(currentProg * (pts.length - 1)), pts.length - 1);
      p = pts[Math.max(0, ptsIndex)];
    } else {
      const idx = Math.min(Math.floor(d.progress * pts.length), pts.length - 1);
      p = pts[Math.max(0, idx)];
    }
    
    // FIX : Décalage visuel en Replay VS pour voir les deux monoplaces
    const offsetX = (isCmp && cmpDrv && animIdx !== null) ? 6 : 0;
    const offsetY = (isCmp && cmpDrv && animIdx !== null) ? -6 : 0;
    
    return { ...d, cx: p.x + offsetX, cy: p.y + offsetY };
  });

  let hoverDot = null;
  if (hoveredIndex != null && pts.length > 0) {
    const ptsIndex = Math.min(Math.floor((hoveredIndex / 199) * (pts.length - 1)), pts.length - 1);
    hoverDot = pts[Math.max(0, ptsIndex)];
  }

  const idxS1 = pts.length > 0 ? Math.floor(s1Ratio * (pts.length - 1)) : 0;
  const idxS2 = pts.length > 0 ? Math.floor(s2Ratio * (pts.length - 1)) : 0;

  return <div style={{position:"relative", width:"100%", height:"100%"}}>
    
    {telChart?.length > 10 && (
      <button 
        onClick={() => setAnimIdx(animIdx !== null ? null : 0)}
        style={{position:"absolute", top:12, right:12, zIndex:10, background:"#1a1a1a", border:"1px solid #333", color:"#ccc", padding:"4px 8px", borderRadius:4, fontSize:9, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:4}}>
        {animIdx !== null ? "⏹ STOP" : "🔄 REPLAY"}
      </button>
    )}

    {/* MENU DÉROULANT POUR LA DOMINATION SPATIALE */}
    {cmpDrv && (
      <div style={{position:"absolute", top:10, left:12, zIndex:10, display:"flex", gap:6, alignItems:"center"}}>
        <span style={{fontSize:12, color:"#888", fontFamily:"var(--f)", fontWeight:600}}>🔴 {t("dom")} :</span>
        <select value={mapMetric} onChange={e=>setMapMetric(e.target.value)} style={{background:"#141414", color:"#aaa", border:"1px solid #1e1e1e", borderRadius:4, padding:"2px 4px", fontSize:10, fontFamily:"var(--f)", outline:"none"}}>
          <option value="speed">{t("speed")}</option>
          <option value="throttle">{t("throttle")}</option>
          <option value="brake">{t("brake")}</option>
        </select>
      </div>
    )}

    <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",height:"100%"}}>
      <defs><filter id="gl"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      
      <path d={pathD} fill="none" stroke="#1a1a1a" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round"/>
      <path d={pathD} fill="none" stroke="#262626" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"/>
      {el.map(l=><line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.c} strokeWidth="5" strokeLinecap="round" opacity={.85} filter="url(#gl)"/>)}
      <path d={pathD} fill="none" stroke="#3a3a3a" strokeWidth=".6" strokeDasharray="3 7"/>
      
      {corners?.map(c=>{const p=N(c.trackPosition.x,c.trackPosition.y);return<g key={c.number}>
        <circle cx={p.x} cy={p.y} r="7" fill="#151515" stroke="#333" strokeWidth=".5"/>
        <text x={p.x} y={p.y+3} textAnchor="middle" style={{fontSize:7,fill:"#555",fontFamily:"var(--f)"}}>{c.number}</text></g>;})}
      
      {dots.map((d,i)=>{
        const isSel = d.dn===selDrv;
        const isCmp = d.dn===cmpDrv;
        return <g key={i} onClick={()=>onSelect(d.dn)} style={{cursor:"pointer", transition: animIdx !== null ? "all 0.03s linear" : "none"}}>
          {(isSel || isCmp)&&<circle cx={d.cx} cy={d.cy} r="16" fill={d.color} opacity=".15"/>}
          <circle cx={d.cx} cy={d.cy} r={isSel?9:isCmp?7:5.5} fill={d.color} stroke={(isSel||isCmp)?"#fff":"#0a0a0a"} strokeWidth={(isSel||isCmp)?2:1} filter="url(#gl)"/>
          <text x={d.cx} y={d.cy-(isSel?14:10)} textAnchor="middle" style={{fontSize:10,fill:"#ccc",fontFamily:"var(--f)",fontWeight:700}}>{d.acr}</text>
        </g>
      })}

      {pts.length>0 && (<g transform={`translate(${pts[0].x}, ${pts[0].y})`}><circle r="7" fill="#E8002D" stroke="#fff" strokeWidth="1.5"/><text y="2.5" fontSize="7" fill="#fff" textAnchor="middle" fontFamily="var(--f)" fontWeight="bold">S1</text></g>)}
      {pts.length>0 && pts[idxS1] && s1Ratio > 0 && (<g transform={`translate(${pts[idxS1].x}, ${pts[idxS1].y})`}><circle r="7" fill="#111" stroke="#fff" strokeWidth="1.5"/><text y="2.5" fontSize="7" fill="#fff" textAnchor="middle" fontFamily="var(--f)" fontWeight="bold">S2</text></g>)}
      {pts.length>0 && pts[idxS2] && s2Ratio > 0 && (<g transform={`translate(${pts[idxS2].x}, ${pts[idxS2].y})`}><circle r="7" fill="#111" stroke="#fff" strokeWidth="1.5"/><text y="2.5" fontSize="7" fill="#fff" textAnchor="middle" fontFamily="var(--f)" fontWeight="bold">S3</text></g>)}

      {hoverDot && (
        <g style={{pointerEvents: "none"}}>
          <circle cx={hoverDot.x} cy={hoverDot.y} r="8" fill="none" stroke="#fff" strokeWidth="2" filter="url(#gl)" opacity={0.8}/>
          <circle cx={hoverDot.x} cy={hoverDot.y} r="4" fill="#fff" />
        </g>
      )}
      
      {/* AFFICHAGE DU TITRE ERS SI ON N'EST PAS EN MODE VS (Le titre VS est géré par l'HTML au-dessus) */}
      {!cmpDrv && <text x={12} y={22} style={{fontSize:12, fill:"#888", fontFamily:"var(--f)", fontWeight:600}}>⚡ {t("ers_state")}</text>}
      
      <g transform={`translate(12, 40)`}>
        {cmpDrv ? (
          <><g transform="translate(0, 0)"><circle cx="4" cy="4" r="4" fill={c1} /><text x="14" y="8" style={{ fontSize: 9, fill: "#ccc", fontFamily: "var(--f)", fontWeight: 700 }}>{selDrvObj?.name_acronym} ({t("faster")})</text></g>
            <g transform="translate(0, 16)"><circle cx="4" cy="4" r="4" fill={c2} /><text x="14" y="8" style={{ fontSize: 9, fill: "#ccc", fontFamily: "var(--f)", fontWeight: 700 }}>{cmpDrvObj?.name_acronym} ({t("faster")})</text></g></>
        ) : ( 
            /* LÉGENDE ERS TRADUITE DYNAMIQUEMENT */
            ["deploy", "harvest", "clip", "superclip", "coast"].map((k, i) => (<g key={k} transform={`translate(0, ${i * 14})`}><line x1="0" y1="4" x2="12" y2="4" stroke={ERS_C[k]} strokeWidth="4" strokeLinecap="round" /><text x="18" y="7" style={{ fontSize: 8, fill: "#999", fontFamily: "var(--f)" }}>{t(k)}</text></g>)) 
        )}
      </g>
    </svg>
  </div>;
}