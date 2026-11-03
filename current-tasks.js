/* Current-cycle tasks only: no annual forecast, capacity simulation or future cycles. */
(function(root){
'use strict';
const M=root.TanakaModel;
const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const priority=x=>({'分娩':0,'分娩舎へ移動':1,'離乳':2,'再発情確認':3,'スイムジェン 実施':4})[x.type]??(x.farm?6:5);
const order=(a,b)=>a.date.localeCompare(b.date)||priority(a)-priority(b)||String(a.id).localeCompare(String(b.id),'ja',{numeric:true});
function normalize(raw,anchor){
 if(valid(raw))return raw;
 if(!/^\d{1,2}\/\d{1,2}$/.test(String(raw||''))||!valid(anchor))return '';
 const year=Number(anchor.slice(0,4)),dates=[year-1,year,year+1].map(y=>{try{return M.matingDate(raw,y+'-01-01');}catch{return '';}}).filter(Boolean);
 return dates.sort((a,b)=>Math.abs(Date.parse(a)-Date.parse(anchor))-Math.abs(Date.parse(b)-Date.parse(anchor)))[0]||'';
}
function reminderEntries(data,day,end){
 const R=root.TanakaReminders;if(!R)return [];
 const out=[],year=Number(day.slice(0,4));
 for(const item of R.list(data)){
  const occurrence=y=>String(y).padStart(4,'0')+'-'+String(item.month).padStart(2,'0')+'-'+String(item.day).padStart(2,'0');
  // Carry the latest annual occurrence across month/year boundaries until completed.
  // Defaults were introduced in 2026; do not invent earlier missed work.
  const dates=Array.from({length:9},(_,i)=>year-i).filter(y=>y>=2026).map(occurrence).filter(valid),last=dates.find(d=>d<=day);
  for(const date of [last,...[year,year+1].map(occurrence).filter(d=>valid(d)&&d>day&&d<=end)].filter(Boolean)){
   if(R.isComplete(data,item.id,Number(date.slice(0,4))))continue;
   out.push({id:'',reminderId:item.id,date,label:item.message,note:'毎年'+item.month+'月'+item.day+'日のお知らせ',type:'farm-reminder',farm:true});
  }
 }
 return out;
}
function collect(data,day,state=M.replay(data)){
 if(!valid(day))throw Error('今日の日付を確認してください。');
 const end=M.addDays(day,30),out=[],bySow=new Map();
 for(const l of data.logs){if(l.legacy)continue;if(!bySow.has(l.id))bySow.set(l.id,[]);bySow.get(l.id).push(l);}
 const add=x=>{if(valid(x.date)&&x.date<=end)out.push(x);};
 for(const sow of Object.values(state.sows)){
  if(!sow.active||sow.numberPending)continue;
  const page=root.TanakaSowParity.pages(data,sow.id)[0],card=page?.card;if(!card)continue;
  const logs=(bySow.get(sow.id)||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)||data.logs.indexOf(a)-data.logs.indexOf(b)),last=t=>logs.filter(l=>l.type===t).at(-1);
  const room=state.rooms.find(r=>['family','waiting'].includes(r.state)&&r.sowId===sow.id);
  if(room?.state==='family'){
   const birth=normalize(card.birthDateActual,M.roomBirthDate(data,room)||last('分娩')?.date)||M.roomBirthDate(data,room);
   if(!page.awaitingMating&&!card.cycleCompleted&&valid(birth))add({id:sow.id,date:M.addDays(birth,M.plannedWeanDays(card)),label:'離乳予定',type:'離乳',roomKey:room.key});
   continue;
  }
  if(page.awaitingMating||card.cycleCompleted||card.reheatPending||card.birthDateActual)continue;
  let mating='';try{if(card.mating)mating=M.matingDate(card.matingDateOverride||card.mating,last('種付け')?.date||'2026-01-01');}catch{}
  let legacyDue='';if(!mating&&card.due&&card.due===sow.cardBaseline?.due){try{legacyDue=M.matingDate(card.due,'2026-01-01');}catch{}}
  const due=normalize(card.due,mating?M.addDays(mating,114):'')||legacyDue||(mating?M.addDays(mating,114):'');
  const reheat=normalize(card.reheat,mating?M.addDays(mating,21):'')||(mating?M.addDays(mating,21):'');
  const swim=normalize(card.swimgen,mating?M.addDays(mating,100):due?M.addDays(due,-14):'')||(mating?M.addDays(mating,100):due?M.addDays(due,-14):'');
  const done=type=>!!mating&&logs.some(l=>l.type===type&&l.date>=mating);
  if(valid(reheat)&&!done('再発情確認')&&!root.TanakaSowWork.reheatReceipt(data,sow.id,reheat))add({id:sow.id,date:reheat,label:'再発情確認',type:'再発情確認'});
  if(!root.TanakaSowWork.swimgenDone(card)&&!(card.swimgenDone!==false&&done('スイムジェン 実施')))add({id:sow.id,date:swim,label:'スイムジェン',type:'スイムジェン 実施'});
  if(valid(due)&&!done('分娩')){
   add({id:sow.id,date:due,label:'分娩予定',type:'分娩',roomKey:room?.key||''});
   if(!room)add({id:sow.id,date:M.addDays(due,Number(card.parity)===0?-7:-4),label:'分娩舎へ移入',type:'分娩舎へ移動'});
  }
 }
 for(const room of state.rooms)for(const x of M.pigletCare(data,room)){if(!x.done)add({...x,careId:x.id,id:room.mixed?'混成':room.sowId,label:'子豚 '+x.label,care:true});}
 for(const x of reminderEntries(data,day,end))add(x);
 const seen=new Set(),all=out.filter(x=>{const key=JSON.stringify([x.farm?x.reminderId:x.care?x.roomKey:x.id,x.type,x.date]);if(seen.has(key))return false;seen.add(key);return true;}).sort(order);
 const overdue=all.filter(x=>x.date<day),today=all.filter(x=>x.date===day).sort((a,b)=>priority(a)-priority(b)||order(a,b)),upcoming=all.filter(x=>x.date>day&&x.date<=end);
 return {day,end,overdue,today,upcoming,all};
}
root.TanakaTasks={collect,normalize,reminderEntries};
})(typeof globalThis!=='undefined'?globalThis:this);
