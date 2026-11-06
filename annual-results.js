/* Annual results are derived views. Only signed annual adjustments are stored. */
(function(root){
'use strict';
const M=root.TanakaModel,P=root.TanakaSowParity;
const metrics=['farrowings','piglets','shipments'];
const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const count=n=>Number.isSafeInteger(n)&&n>=0?n:null;
const yearOK=y=>/^\d{4}$/.test(String(y))&&Number(y)>=1000&&Number(y)<=9999;
function births(data){
 const logs=data.logs||[],actual=logs.filter(l=>!l.legacy&&l.type==='分娩'&&iso(l.date)),deleted=(data.deletedLogs||[]).filter(l=>!l.legacy&&l.type==='分娩');
 const rows=actual.map(l=>({key:l.key,id:l.id,date:l.date,count:count(l.count),dateAt:l.updatedAt||l.t||'',countAt:l.updatedAt||l.t||''}));
 // Room birth-headcount corrections belong to the preceding actual birth, never to a mixed group.
 logs.forEach((l,i)=>{if(l.type!=='分娩舎修正'||l.legacy||!['family','piglets'].includes(l.room?.state)||l.room.mixed)return;
  const b=logs.slice(0,i).filter(b=>b.type==='分娩'&&!b.legacy&&b.id===l.id&&b.roomKey===l.roomKey).at(-1),row=rows.find(r=>r.key===b?.key);if(!row)return;
  if(Object.hasOwn(l.room,'birthCount')){row.count=count(l.room.birthCount);row.countAt=l.updatedAt||l.t||'';}
  if(l.room.state==='family'&&iso(l.room.birthDate)){row.date=l.room.birthDate;row.dateAt=l.updatedAt||l.t||'';}
 });
 for(const s of data.sows||[]){
  for(const p of P.pages(data,s.id).filter(p=>!p.awaitingMating)){
   const c=p.card,dates=new Set([c,...(p.revisions||[]).map(r=>r.card)].filter(Boolean).map(c=>c.birthDateActual).filter(iso));
   const candidates=actual.filter(l=>l.id===s.id&&(dates.has(l.date)||(l.revisions||[]).some(r=>dates.has(r.date))));
   let log=actual.find(l=>p.key==='birth:'+l.key)|| (candidates.length===1?candidates[0]:null);
   if(log){
    const row=rows.find(r=>r.key===log.key),edited=(p.revisions||[]).map(r=>r.card).filter(Boolean);
    // A snapshot must not undo a later correction to the original event.
    if(edited.length){
     if(String(p.updatedAt||'')>row.dateAt&&edited.some(old=>old.birthDateActual!==c.birthDateActual))row.date=iso(c.birthDateActual)?c.birthDateActual:'';
     if(String(p.updatedAt||'')>row.countAt&&edited.some(old=>old.birthCount!==c.birthCount))row.count=count(c.birthCount);
    }
    continue;
   }
   if(!iso(c.birthDateActual))continue; // Month/day alone is not evidence of a year.
   if(deleted.some(l=>l.id===s.id&&(p.key==='birth:'+l.key||dates.has(l.date)||(l.revisions||[]).some(r=>dates.has(r.date)))))continue;
   if(rows.some(r=>r.id===s.id&&r.date===c.birthDateActual))continue;
   rows.push({key:s.id+':'+p.key,id:s.id,date:c.birthDateActual,count:count(P.cardPerformance(c).birthCount)});
  }
 }
 return rows.filter(r=>iso(r.date));
}
function adjustment(data,year,metric){return data.annualAdjustments?.[year]?.[metric]??0;}
function summary(data,year){
 if(!yearOK(year))throw Error('対象年を確認してください。');year=String(year);
 const monthly=Array.from({length:12},(_,i)=>({month:i+1,farrowings:0,piglets:0,shipments:0,missingPiglets:0}));
 for(const r of births(data)){if(!r.date.startsWith(year+'-'))continue;const m=monthly[Number(r.date.slice(5,7))-1];m.farrowings++;if(r.count===null)m.missingPiglets++;else m.piglets+=r.count;}
 for(const r of root.TanakaFinishing.shipmentSummary(data,'').records){if((iso(r.date)||r.source==='monthly'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(r.date))&&r.date.startsWith(year+'-'))monthly[Number(r.date.slice(5,7))-1].shipments+=r.count;}
 const result={year,monthly,missingPiglets:monthly.reduce((n,m)=>n+m.missingPiglets,0)};
 for(const metric of metrics){const automatic=monthly.reduce((n,m)=>n+m[metric],0),offset=adjustment(data,year,metric);result[metric]={automatic,adjustment:offset,total:automatic+offset};}
 return result;
}
function setAdjustment(data,year,metric,value,expected){
 if(!yearOK(year)||!metrics.includes(metric)||!Number.isSafeInteger(value))throw Error('補正値はプラス・マイナスの整数で入力してください。');
 if(expected!==undefined&&adjustment(data,year,metric)!==expected)throw Error('補正値が更新されました。開き直してください。');
 const total=summary(data,year)[metric].automatic+value;
 if(!Number.isSafeInteger(total)||total<0)throw Error('最終表示が0以上になる補正値を入力してください。');
 data.annualAdjustments??={};data.annualAdjustments[year]??={};data.annualAdjustments[year][metric]=value;
}
const validate=M.validate;
M.validate=function(data){validate(data);const all=data.annualAdjustments;if(all===undefined)return;
 if(!all||typeof all!=='object'||Array.isArray(all))throw Error('年間実績の補正情報を確認してください。');
 for(const [year,values] of Object.entries(all)){if(!yearOK(year)||!values||typeof values!=='object'||Array.isArray(values)||Object.entries(values).some(([k,v])=>!metrics.includes(k)||!Number.isSafeInteger(v)))throw Error('年間実績の補正値を確認してください。');}
};
root.TanakaAnnual={metrics,births,summary,adjustment,setAdjustment};
})(typeof globalThis!=='undefined'?globalThis:this);
