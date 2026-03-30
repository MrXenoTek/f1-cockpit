import { ERS_C, ERS_L } from "../api";

export default function TrackMap({trackX, trackY, corners, ersSegs, currentLap, driverDots, selDrv, cmpDrv, onSelect, telChart, c1, c2, selDrvObj, cmpDrvObj, hoveredIndex, s1Ratio, s2Ratio}) {
  if(!trackX?.length||trackX.length<10)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#444"}}><div style={{textAlign:"center"}}><div style={{fontSize:42,marginBottom:8}}>🏎️</div><div style={{fontFamily:"var(--f)",fontSize:11}}>Sélectionne un GP → Session</div></div></div>;
  const mnX=Math.min(...trackX),mxX=Math.max(...trackX),mnY=Math.min(...trackY),mxY=Math.max(...trackY);
  const rX=mxX-mnX||1,rY=mxY-mnY||1,pad=50,w=640,h=500;
  const N=(x,y)=>({x:pad+((x-mnX)/rX)*(w-2*pad),y:pad+((y-mnY)/rY)*(h-2*pad)});
  const pts=trackX.map((x,i)=>N(x,trackY[i]));
  const pathD=pts.map((p,i)=>`${i===0?"M":"L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")+" Z";
  
  const el=[];
  if(cmpDrv && telChart?.length > 10) {
    const t = telChart.length;
    for(let i=1; i<t; i++) {
      const pt = telChart[i];
      if(pt.speed2 == null) continue;
      if(Math.abs(pt.speed1 - pt.speed2) < 1) continue; 
      const color = pt.speed1 > pt.speed2 ? c1 : c2;
      const a = Math.floor(((i-1)/t)*pts.length);
      const b = Math.min(Math.floor((i/t)*pts.length), pts.length-1);
      el.push({x1:pts[a].x, y1:pts[a].y, x2:pts[b].x, y2:pts[b].y, c:color, k:`ms-${i}`});
    }
  } else if(ersSegs?.length > 2) {
    const t=ersSegs.length;
    for(let i=1; i<t; i++){
      const tp=ersSegs[i].type;
      if(tp==="neutral")continue;
      const a=Math.floor(((i-1)/t)*pts.length);
      const b=Math.min(Math.floor((i/t)*pts.length), pts.length-1);
      el.push({x1:pts[a].x, y1:pts[a].y, x2:pts[b].x, y2:pts[b].y, c:ERS_C[tp], k:`ers-${i}`});
    }
  }

  const visibleDots = cmpDrv ? driverDots.filter(d => d.dn === selDrv || d.dn === cmpDrv) : driverDots;
  const dots = visibleDots.map(d=>{
    const idx=Math.min(Math.floor(d.progress*pts.length),pts.length-1);
    const p=pts[Math.max(0,idx)];
    return{...d,cx:p.x,cy:p.y};
  });

  let hoverDot = null;
  if (hoveredIndex != null && pts.length > 0) {
    const ptsIndex = Math.min(Math.floor((hoveredIndex / 199) * (pts.length - 1)), pts.length - 1);
    hoverDot = pts[Math.max(0, ptsIndex)];
  }

  const idxS1 = pts.length > 0 ? Math.floor(s1Ratio * (pts.length - 1)) : 0;
  const idxS2 = pts.length > 0 ? Math.floor(s2Ratio * (pts.length - 1)) : 0;

  return <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",height:"100%"}}>
    <defs><filter id="gl"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    
    <path d={pathD} fill="none" stroke="#1a1a1a" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={pathD} fill="none" stroke="#262626" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"/>
    {el.map(l=><line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.c} strokeWidth="5" strokeLinecap="round" opacity={.85} filter="url(#gl)"/>)}
    <path d={pathD} fill="none" stroke="#3a3a3a" strokeWidth=".6" strokeDasharray="3 7"/>
    
    {corners?.map(c=>{const p=N(c.trackPosition.x,c.trackPosition.y);return<g key={c.number}>
      <circle cx={p.x} cy={p.y} r="7" fill="#151515" stroke="#333" strokeWidth=".5"/>
      <text x={p.x} y={p.y+3} textAnchor="middle" style={{fontSize:7,fill:"#555",fontFamily:"var(--f)"}}>{c.number}</text></g>;})}
    
    {/* DESSIN DES PILOTES (Maintenant dessiné AVANT les secteurs) */}
    {dots.map((d,i)=>{
      const isSel = d.dn===selDrv;
      const isCmp = d.dn===cmpDrv;
      return <g key={i} onClick={()=>onSelect(d.dn)} style={{cursor:"pointer"}}>
        {(isSel || isCmp)&&<circle cx={d.cx} cy={d.cy} r="16" fill={d.color} opacity=".15"/>}
        <circle cx={d.cx} cy={d.cy} r={isSel?9:isCmp?7:5.5} fill={d.color} stroke={(isSel||isCmp)?"#fff":"#0a0a0a"} strokeWidth={(isSel||isCmp)?2:1} filter="url(#gl)"/>
        <text x={d.cx} y={d.cy-(isSel?14:10)} textAnchor="middle" style={{fontSize:10,fill:"#ccc",fontFamily:"var(--f)",fontWeight:700}}>{d.acr}</text>
      </g>
    })}

    {/* DESSIN DES SECTEURS (Maintenant dessiné APRÈS les pilotes, donc par-dessus) */}
    {pts.length>0 && (
      <g transform={`translate(${pts[0].x}, ${pts[0].y})`}>
        <circle r="7" fill="#E8002D" stroke="#fff" strokeWidth="1.5"/>
        <text y="2.5" fontSize="7" fill="#fff" textAnchor="middle" fontFamily="var(--f)" fontWeight="bold">S1</text>
      </g>
    )}
    {pts.length>0 && pts[idxS1] && s1Ratio > 0 && (
      <g transform={`translate(${pts[idxS1].x}, ${pts[idxS1].y})`}>
        <circle r="7" fill="#111" stroke="#fff" strokeWidth="1.5"/>
        <text y="2.5" fontSize="7" fill="#fff" textAnchor="middle" fontFamily="var(--f)" fontWeight="bold">S2</text>
      </g>
    )}
    {pts.length>0 && pts[idxS2] && s2Ratio > 0 && (
      <g transform={`translate(${pts[idxS2].x}, ${pts[idxS2].y})`}>
        <circle r="7" fill="#111" stroke="#fff" strokeWidth="1.5"/>
        <text y="2.5" fontSize="7" fill="#fff" textAnchor="middle" fontFamily="var(--f)" fontWeight="bold">S3</text>
      </g>
    )}

    {hoverDot && (
      <g style={{pointerEvents: "none"}}>
        <circle cx={hoverDot.x} cy={hoverDot.y} r="8" fill="none" stroke="#fff" strokeWidth="2" filter="url(#gl)" opacity={0.8}/>
        <circle cx={hoverDot.x} cy={hoverDot.y} r="4" fill="#fff" />
      </g>
    )}
    
    <text x={12} y={22} style={{fontSize:12, fill:"#888", fontFamily:"var(--f)", fontWeight:600}}>{cmpDrv ? "🔴 DOMINATION SPATIALE" : "⚡ ÉTAT ERS"}</text>
    <text x={w-12} y={22} textAnchor="end" style={{fontSize:12,fill:"#E8002D",fontFamily:"var(--f)",fontWeight:700}}>LAP {currentLap}</text>

    <g transform={`translate(12, 40)`}>
      {cmpDrv ? (
        <><g transform="translate(0, 0)"><circle cx="4" cy="4" r="4" fill={c1} /><text x="14" y="8" style={{ fontSize: 9, fill: "#ccc", fontFamily: "var(--f)", fontWeight: 700 }}>{selDrvObj?.name_acronym} (Plus rapide)</text></g>
          <g transform="translate(0, 16)"><circle cx="4" cy="4" r="4" fill={c2} /><text x="14" y="8" style={{ fontSize: 9, fill: "#ccc", fontFamily: "var(--f)", fontWeight: 700 }}>{cmpDrvObj?.name_acronym} (Plus rapide)</text></g></>
      ) : ( Object.entries(ERS_L).map(([k,l], i) => (<g key={k} transform={`translate(0, ${i * 14})`}><line x1="0" y1="4" x2="12" y2="4" stroke={ERS_C[k]} strokeWidth="4" strokeLinecap="round" /><text x="18" y="7" style={{ fontSize: 8, fill: "#999", fontFamily: "var(--f)" }}>{l}</text></g>)) )}
    </g>
  </svg>;
}