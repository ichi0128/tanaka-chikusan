/* Mortality receipts retain their source; compensating receipts restore it. */
(function(root){
'use strict';
const M=root.TanakaModel,F=root.TanakaFinishing,I=root.TanakaInventory,N=root.TanakaNurseryYard,clone=M.clone;
const TYPES=['死亡','死亡取消'];TYPES.forEach(t=>M.TYPES.push(t));
const replace=(a,b)=>{Object.keys(a).forEach(k=>delete a[k]);Object.assign(a,clone(b));};
function targets(data,state=M.replay(data)){
 const list=[],put=(token,area,key,pig,count,birthDate,motherId,sowId='')=>list.push({token,area,key,pigKey:pig?.key||'',count,birthDate:birthDate||'',motherId:motherId||'',sowId});
 for(const r of state.rooms)if(['family','piglets'].includes(r.state)&&r.count>0)put('farrowing:'+r.key,'farrowing',r.key,null,r.count,M.roomBirthDate(data,r),r.mixed?'':r.sowId);
 for(const r of state.nursery){if(r.state!=='occupied')continue;
  const count=(r.count??0)-(r.identifiedIndividuals||[]).length;if(count>0)put('nursery:'+r.key,'nursery',r.key,null,count,r.birthDate,r.mixed?'':r.sowId);
  for(const p of r.identifiedIndividuals||[]){const s=N.linked(p,state);if(s)continue;put('nursery-pig:'+p.key,'nursery',r.key,p,1,p.birthDate,p.sowId==='混成'?'':p.sowId);}
 }
 for(const r of state.finishing){if(r.key==='yard'){for(const p of F.yardState(r).individuals){if(N.linked(p,state))continue;put('yard:'+p.key,'yard','yard',p,1,p.birthDate,p.sowId==='混成'?'':p.sowId);}}else if(r.count>0)put('finishing:'+r.key,'finishing',r.key,null,r.count,r.birthDate,r.mixed?'':r.sowId);}
 for(const s of Object.values(state.sows))if(s.active){
  const n=N.inNursery(state,s.id),r=state.rooms.find(r=>['family','waiting'].includes(r.state)&&r.sowId===s.id),p=N.locations(state).find(x=>N.linked(x.pig,state)?.id===s.id)?.pig;
  put('sow:'+s.id,n?'nursery':r?'farrowing':'yard',n?.key||r?.key||'yard',p,1,s.birthDate||p?.birthDate,s.numberPending?(s.cardBaseline?.mother||p?.sowId):s.id,s.id);
 }
 for(const b of M.activeBoars(data))list.push({token:'boar:'+b.id,area:'boar',key:b.id,pigKey:'',count:1,birthDate:b.birthDate||'',motherId:b.motherId||'',sowId:'',boarId:b.id});
 return list;
}
function target(data,token){const t=targets(data).find(t=>t.token===token);if(!t)throw Error('対象の豚・現在頭数を確認してください。');return t;}
function stamp(type,date){return {key:M.uid(),origin:'operator',type,id:'',date,t:new Date().toISOString(),note:''};}
function makePatches(data,state,t,count){
 const patches=[],add=(area,before,after)=>patches.push({area,key:before.key,before:clone(before),after:clone(after)});
 if(t.sowId){const r=state.rooms.find(r=>['family','waiting'].includes(r.state)&&r.sowId===t.sowId);if(r){const after=clone(r);if(r.state==='family'&&r.count!==0)after.state='piglets';else Object.assign(after,{state:'empty',sowId:'',count:null,mixed:false,birthDate:'',entryKey:''});add('farrowing',r,after);}}
 if(t.area==='farrowing'&&!t.sowId){const r=state.rooms.find(r=>r.key===t.key),after=clone(r);after.count-=count;if(!after.count&&r.state==='piglets')Object.assign(after,{state:'empty',sowId:'',count:null,mixed:false,birthDate:'',entryKey:''});add('farrowing',r,after);}
 if(t.area==='nursery'){
  const r=state.nursery.find(r=>r.key===t.key),after=clone(r);after.count-=count;if(t.pigKey)after.identifiedIndividuals=(after.identifiedIndividuals||[]).filter(p=>p.key!==t.pigKey);
  if(!after.count)Object.assign(after,{state:'empty',count:null,sowId:'',mixed:false,entered:'',birthDate:'',csf:false,weight:30,kind:'肉豚',groupNote:'',identifiedIndividuals:[]});add('nursery',r,after);
 }
 if(t.area==='finishing'){
  const r=state.finishing.find(r=>r.key===t.key),before={key:r.key,...F.group(r)},after={...clone(before),count:r.count-count};add('finishing',before,after);
 }
 // Registered sows may have a physical yard row; implicit sows do not.
 if(t.area==='yard'&&t.pigKey){const r=state.finishing.find(r=>r.key==='yard'),before=F.yardState(r),after=F.yardState({individuals:before.individuals.filter(p=>p.key!==t.pigKey)});add('finishing',before,after);}
 return patches;
}
function apply(log,state){
 const d=log.death;if(!d||d.version!==1||!Array.isArray(d.patches))throw Error('死亡記録の保存形式を確認してください。');
 if(!d.target||!Number.isSafeInteger(log.count)||log.count<1)throw Error('死亡頭数を確認してください。');
 const individual=!!(d.target.sowId||d.target.boarId);
 const delta=d.patches.reduce((n,p)=>n+(p.before.count??0)-(p.after.count??0),0)*(log.type==='死亡'?1:-1);
 if(individual?log.count!==1:delta!==log.count)throw Error('死亡記録の頭数と部屋の増減が一致しません。');
 for(const p of d.patches){
  const list=p.area==='farrowing'?state.rooms:p.area==='nursery'?state.nursery:p.area==='finishing'?state.finishing:null,r=list?.find(r=>r.key===p.key);if(!r)throw Error('死亡記録の元の部屋が見つかりません。');
  if(p.area==='finishing')F.apply({type:'肉豚舎更新',finishingKey:p.key,finishingBefore:p.before,finishingAfter:p.after,...(p.key==='yard'?{yardIndividuals:1}:{})},state.finishing,state.nursery);
  else{if(!M.sameData(r,p.before))throw Error('死亡記録の前後で部屋の情報が変わっています。');replace(r,p.after);}
 }
 if(d.target.sowId){const s=state.sows[d.target.sowId];if(!s||s.active!==(log.type==='死亡'))throw Error('死亡対象の在籍状態を確認してください。');s.active=log.type==='死亡取消';if(log.type==='死亡'){s.deathKey=log.key;}else delete s.deathKey;}
}
function report(data,state,date){return I.create(data,state,date.slice(0,7),date,r=>M.roomBirthDate(data,r));}
function sync(data,log,now){
 const fresh=report(data,M.replay(data),now),old=data.inventoryMonths?.[fresh.month];if(!old){I.saveReport(data,fresh,'null');return;}
 const r=clone(old),d=log.death;
 for(const p of d.patches){
  const area=p.area==='finishing'&&p.key==='yard'?'yard':p.area;
  if(area==='yard'){
   const pigKey=d.target.pigKey;r.rows=r.rows.filter(row=>!(row.area==='yard'&&(row.sourcePigKey===pigKey||row.key==='yard:pig:'+pigKey)));
   const added=fresh.rows.find(row=>row.sourcePigKey===pigKey);if(added)r.rows.push(added);
  }else{const next=fresh.rows.find(row=>row.area===area&&row.roomKey===p.key),index=r.rows.findIndex(row=>row.area===area&&row.roomKey===p.key);if(!next)throw Error('死亡後の頭数調べを確認してください。');if(index<0)r.rows.push(next);else{const row=r.rows[index],wasEmpty=!row.count;row.count=next.count;row.state=next.state;if(next.registeredSowIds)row.registeredSowIds=next.registeredSowIds;if(!next.count||wasEmpty)Object.assign(row,next);else if(row.autoCategory)row.category=next.category;}}
 }
 if(d.target.sowId&&r.sowSnapshot){const id=d.target.sowId;r.sowSnapshot.ids=r.sowSnapshot.ids.filter(x=>x!==id);if(fresh.sowSnapshot.ids.includes(id))r.sowSnapshot.ids.push(id);}
 if(d.target.boarId)r.boarSnapshot=clone(fresh.boarSnapshot);
 r.status='draft';I.syncPlan(r);I.saveReport(data,r,JSON.stringify(old));
}
function finalize(data,{token,date,count=1,birthDate,now,expected}){
 if(expected!==undefined&&JSON.stringify(data)!==expected)throw Error('記録が更新されています。死亡の確認を開き直してください。');
 if(!I.validDate(now)||!I.validDate(date)||date>now)throw Error('死亡日を今日以前の日付で入力してください。');
 const before=M.replay(data),t=target(data,token),birth=t.birthDate||birthDate||'';
 if(birth&&(!I.validDate(birth)||birth>date))throw Error('誕生日と死亡日を確認してください。');
 if(!Number.isSafeInteger(count)||count<1||count>t.count||(t.pigKey||t.sowId||t.boarId)&&count!==1)throw Error('死亡頭数を現在頭数以下の整数で入力してください。');
 const total=I.farmSummary(report(data,before,now)).farmTotal,log={...stamp('死亡',date),id:t.sowId,action:{version:1,kind:'death'},count,birthDate:birth,motherId:t.motherId,death:{version:1,target:clone(t),patches:makePatches(data,before,t,count)}};
 if(t.boarId){M.initializeBoars(data);const b=data.boars.find(b=>b.id===t.boarId);log.death.boarBefore=clone(b);b.status='死亡';b.deathKey=log.key;log.death.boarAfter=clone(b);}
 if(t.area==='finishing'||t.area==='yard'){log.death.candidatesBefore=clone(data.consignmentCandidates||{});const c=root.TanakaConsignment.candidate(data,before,t.key,t.pigKey);if(c){root.TanakaConsignment.clear(data,{roomKey:t.key,pigKey:t.pigKey});log.death.candidateCleared=true;}}
 data.logs.push(log);
 const after=M.replay(data);if(I.farmSummary(report(data,after,now)).farmTotal!==total-count)throw Error('死亡後の総頭数が一致しません。');
 sync(data,log,now);return log;
}
function undone(data,key){return data.logs.some(l=>l.type==='死亡取消'&&l.undoOf===key);}
function touches(l,d){return d.target.sowId&&l.id===d.target.sowId||d.patches.some(p=>[l.roomKey,l.targetRoomKey,l.nurseryKey,l.finishingKey,l.sourceKey].includes(p.key)||l.death?.patches?.some(q=>q.area===p.area&&q.key===p.key));}
function undo(data,key,{date,now=date}={}){
 const original=data.logs.find(l=>l.key===key&&l.type==='死亡');if(!original||undone(data,key))throw Error('この死亡記録は取り消し済みか、見つかりません。');
 if(!I.validDate(date)||!I.validDate(now)||date>now)throw Error('取り消し日を確認してください。');
 const d=original.death;if(data.logs.slice(data.logs.indexOf(original)+1).some(l=>touches(l,d)))throw Error('その後に対象の豚・部屋が変更されています。現在の記録を確認してください。');
 const before=M.replay(data),total=I.farmSummary(report(data,before,now)).farmTotal;
 const log={...stamp('死亡取消',date),id:original.id,undoOf:key,count:original.count,birthDate:original.birthDate,motherId:original.motherId,death:{version:1,target:clone(d.target),patches:d.patches.map(p=>({...clone(p),before:clone(p.after),after:clone(p.before)}))}};
 // Finishing normalizes an emptied room. Compare normalized snapshots on undo.
 for(const p of log.death.patches)if(p.area==='finishing'&&p.key!=='yard'){const r=before.finishing.find(r=>r.key===p.key);if(r.count!==(p.before.count||0)||r.count&&!M.sameData(F.group(r),F.group(p.before)))throw Error('死亡後に部屋が変更されています。');p.before={key:r.key,...F.group(r)};}
 if(d.target.boarId){const b=data.boars?.find(b=>b.id===d.target.boarId);if(!M.sameData(b,d.boarAfter))throw Error('種豚の状態が変更されています。');replace(b,d.boarBefore);}
 if(d.candidateCleared){if(data.consignmentCandidates?.[root.TanakaConsignment.targetKey(d.target.key,d.target.pigKey)])throw Error('委託候補が変更されています。');const k=root.TanakaConsignment.targetKey(d.target.key,d.target.pigKey);data.consignmentCandidates=data.consignmentCandidates||{};if(d.candidatesBefore[k])data.consignmentCandidates[k]=clone(d.candidatesBefore[k]);}
 data.logs.push(log);if(I.farmSummary(report(data,M.replay(data),now)).farmTotal!==total+log.count)throw Error('取り消し後の総頭数が一致しません。');sync(data,log,now);return log;
}
function history(data){return data.logs.filter(l=>l.type==='死亡').map(l=>({...l,cancelled:undone(data,l.key)})).sort((a,b)=>b.date.localeCompare(a.date)||b.t.localeCompare(a.t));}
function years(data,year){const result=new Map([[String(year),0],[String(Number(year)-1),0]]);for(const l of history(data)){const y=l.date.slice(0,4);if(!result.has(y))result.set(y,0);if(!l.cancelled)result.set(y,result.get(y)+l.count);}return [...result].sort((a,b)=>b[0].localeCompare(a[0])).map(([year,count])=>({year,count}));}
const validate=M.validate;M.validate=function(data){
 validate(data);
 const undos=data.logs.filter(l=>l.type==='死亡取消').map(l=>l.undoOf);if(new Set(undos).size!==undos.length)throw Error('死亡取消が重複しています。');
 for(const l of data.logs.filter(l=>TYPES.includes(l.type))){if(!l.death?.target||!Number.isSafeInteger(l.count)||l.count<1||typeof l.motherId!=='string'||typeof l.birthDate!=='string'||l.birthDate&&(!I.validDate(l.birthDate)||l.birthDate>l.date)&&l.type==='死亡')throw Error('死亡記録の日付・頭数・個体情報を確認してください。');if(l.type==='死亡取消'&&!data.logs.some(o=>o.key===l.undoOf&&o.type==='死亡'&&o.count===l.count))throw Error('死亡取消の元記録を確認してください。');}
};
root.TanakaSowWork.registerUndo('death',(data,original,options)=>undo(data,original.key,{date:options.date}));
root.TanakaDeaths={TYPES,targets,target,apply,finalize,undo,history,years,undone};
})(typeof globalThis!=='undefined'?globalThis:this);
