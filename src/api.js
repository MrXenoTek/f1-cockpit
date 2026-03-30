export const API = "https://api.openf1.org/v1";

export const TEAM_C={"Red Bull Racing":"#3671C6",McLaren:"#FF8000",Ferrari:"#E8002D",Mercedes:"#27F4D2","Aston Martin":"#229971",Alpine:"#FF87BC",Williams:"#64C4FF",RB:"#6692FF","Kick Sauber":"#52E252","Haas F1 Team":"#B6BABD","Racing Bulls":"#6692FF","Red Bull":"#3671C6",Sauber:"#52E252",Cadillac:"#1E3D2F",Audi:"#ff4444"};
export const COMP_C={SOFT:"#E8002D",MEDIUM:"#FFD600",HARD:"#ccc",INTERMEDIATE:"#00D26A",WET:"#3671C6"};
export const ERS_C={deploy:"#00D4FF",harvest:"#00D26A",clip:"#FF8C00",superclip:"#E8002D",coast:"#666"};
export const ERS_L={deploy:"Déploiement",harvest:"Récolte",clip:"Clipping",superclip:"Super Clip",coast:"Lift&Coast"};

export const tc=n=>{if(!n)return"#888";for(const[k,v]of Object.entries(TEAM_C))if(n.includes(k)||k.includes(n))return v;return"#888";};
export const fmtLap=s=>{if(!s)return"-";const m=Math.floor(s/60),sc=(s%60).toFixed(3);return m>0?`${m}:${sc.padStart(6,"0")}`:sc;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

export const fetchJ=async(url,log)=>{
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

export const fetchApi=async(ep,params={},log)=>{
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

export function classifyErs(cur, prev, is26) {
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
export const exportCSV = (data, filename) => {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]).join(",");
  const csv = [headers, ...data.map(row => Object.values(row).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
};

export const exportJSON = (data, filename) => {
  if (!data || !data.length) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.json`;
  link.click();
};