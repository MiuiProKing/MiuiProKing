// Required helpers absent from the attachment; same sanitation as the audited archive.
export function orderedAnalysisRounds(rows,limit=300,now=Infinity){const seen=new Set();return [...rows].sort((a,b)=>b.timestamp-a.timestamp).filter(r=>{if(!Number.isFinite(r.coefficient)||r.coefficient<1||!Number.isFinite(r.timestamp)||r.timestamp<=0||r.timestamp>now||r.id&&seen.has(r.id))return false;if(r.id)seen.add(r.id);return true;}).slice(0,limit);}
export function analysisIsFresh(rows,now=Date.now()){const t=rows[0]?.timestamp;return t!==undefined&&t<=now+30000&&now-t<=180000;}
