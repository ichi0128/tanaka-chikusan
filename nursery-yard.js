/* One identified animal moves between a nursery group and the individual yard.
   Nursery counts still include identifiedIndividuals; they are never extra heads. */
(function(root){
'use strict';
const M=root.TanakaModel,F=root.TanakaFinishing,I=root.TanakaInventory,W=root.TanakaSowWork,clone=M.clone;
const TYPES=['育成舎個体移動','育成舎個体移動取消'];for(const t of TYPES){M.TYPES.push(t);F.TYPES.push(t);}
const roomName=n=>'育成舎 '+(n.label||Number(n.key.slice(1)))+'号室';
const yard=s=>s.finishing.find(r=>r.key==='yard');
const pigs=s=>F.yardState(yard(s)).individuals;
const linked=(pig,state)=>state.sows[pig.registeredSowId]||root.TanakaGilts.linkedSow(pig,state);
const registered=(pig,state)=>{const s=linked(pig,state);return s&&!s.numberPending&&!root.TanakaGilts.isGilt(s)?s.id:'';};
function inNursery(state,id){return state.nursery.find(n=>(n.identifiedIndividuals||[]).some(p=>linked(p,state)?.id===id))||null;}
function locations(state){return [...pigs(state).map(p=>({pig:p,area:'yard',roomKey:'yard'})),...state.nursery.flatMap(n=>(n.identifiedIndividuals||[]).map(p=>({pig:p,area:'nursery',roomKey:n.key})))];}
function validateState(state){
 const keys=new Set(),numbers=new Set(),sows=new Set();
 for(const n of state.nursery){if(n.identifiedIndividuals===undefined)continue;if(!Array.isArray(n.identifiedIndividuals)||n.identifiedIndividuals.length>(n.count??0)||n.identifiedIndividuals.length&&n.state!=='occupied')throw Error('育成舎の個体情報と群の頭数を確認してください。');}
 for(const {pig} of locations(state)){
  if(keys.has(pig.key))throw Error('同じ個体が複数の場所に存在します。');keys.add(pig.key);
  const number=pig.individualNumber||pig.officialNumber;if(number){const canonical=String(number).replace(/^0+(?=\d)/,'');if(!/^\d+$/.test(number)||numbers.has(canonical))throw Error('個体番号が重複しています。');numbers.add(canonical);}
  const sow=linked(pig,state);if(sow){if(sows.has(sow.id))throw Error('同じ母豚が複数の個体に登録されています。');sows.add(sow.id);}
 }
 for(const n of state.nursery)for(const p of n.identifiedIndividuals||[]){F.validIndividuals(F.yardState({individuals:[p]}));const s=linked(p,state);if(s&&state.rooms.some(r=>['family','waiting'].includes(r.state)&&r.sowId===s.id))throw Error('この個体は育成舎と分娩舎の両方に登録されています。');}
}
function replace(target,value){for(const key of Object.keys(target))delete target[key];Object.assign(target,clone(value));}
const originalApply=F.apply;
F.apply=function(log,rooms,nursery){
 if(!TYPES.includes(log.type)){
  const source=log.sourceArea==='nursery'?nursery.find(n=>n.key===log.sourceKey):log.type==='育成舎から移動'?nursery.find(n=>n.key===log.nurseryKey):null;
  if(source?.identifiedIndividuals?.length&&log.type==='肉豚舎へ移動')throw Error('個体管理中の豚がいます。対象個体は専用の移動操作を使ってください。');
  return originalApply(log,rooms,nursery);
 }
 const n=nursery.find(n=>n.key===log.nurseryKey),y=rooms.find(r=>r.key==='yard'),list=F.yardState(y).individuals;
 if(!n||!M.sameData(n,log.nurseryBefore)||log.count!==1||!log.individual?.key||!['out','in'].includes(log.direction))throw Error('移動元・移動先の情報が変わっています。開き直してください。');
 const key=log.individual.key,at=list.findIndex(p=>p.key===key);
 if(log.direction==='out'){
  if(at>=0)throw Error('この個体は既に運動場にいます。');
  if(!log.toImplicitSow)list.push(clone(log.individual));
 }else{
  if(log.fromImplicitSow){if(at>=0)throw Error('母豚と運動場の個体が重複しています。');}
  else{if(at<0||!M.sameData(list[at],log.individual))throw Error('対象個体が移動・変更されています。');list.splice(at,1);}
 }
 const before=n.count??0,after=log.nurseryAfter?.count??0;
 if(before+(log.direction==='out'?-1:1)!==after||log.nurseryAfter?.key!==n.key)throw Error('個体移動の頭数が一致しません。');
 replace(n,log.nurseryAfter);replace(y,F.yardState({individuals:list}));F.check(rooms);
};
function latestOrigin(data,pigKey){
 const current=data.logs.filter(l=>TYPES.includes(l.type)&&l.direction==='out'&&l.individual?.key===pigKey&&!data.logs.some(c=>c.undoOf===l.key)).at(-1);if(current)return current;
 const old=data.logs.filter(l=>!l.legacy&&l.type==='肉豚舎へ移動'&&l.sourceArea==='nursery'&&l.finishingKey==='yard'&&l.yardIndividuals===1&&pigKey.startsWith(l.key+':pig:')).at(-1);
 return old?{...old,legacyOrigin:true,nurseryKey:old.sourceKey,movement:{from:{area:'nursery',key:old.sourceKey,name:roomName({key:old.sourceKey})},to:{area:'yard',name:'運動場'}}}:null;
}
function logBase(options){return {key:options.key||M.uid(),origin:options.origin||'operator',date:options.date,t:options.t||new Date().toISOString(),note:options.note||'',type:TYPES[0],count:1};}
function prepareOut(data,{nurseryKey,pigKey,individualNumber,label,birthDate,motherId,confirmed,...options}){
 const state=M.replay(data),n=state.nursery.find(n=>n.key===nurseryKey);
 if(!n||n.state!=='occupied'||!Number.isSafeInteger(n.count)||n.count<1)throw Error('移動元の育成舎と確定した頭数を確認してください。');
 const known=(n.identifiedIndividuals||[]).find(p=>p.key===pigKey);let individual;
 if(known)individual=clone(known);
 else{
  if(confirmed!==true||!/^\d+$/.test(String(individualNumber||''))||!String(label||'').trim()||!I.validDate(birthDate)||birthDate>options.date)throw Error('育成母豚1頭の識別・番号・誕生日を確認してください。');
  if(n.count<=(n.identifiedIndividuals||[]).length)throw Error('未登録の個体として取り出せる頭数がありません。');
  if(data.sows.some(s=>s.id===individualNumber)||locations(state).some(x=>x.pig.individualNumber===individualNumber)||data.logs.some(l=>TYPES.includes(l.type)&&l.individual?.individualNumber===individualNumber))throw Error('その番号は登録済みです。既存個体を選び、現在場所を確認してください。');
  if(motherId&&!data.sows.some(s=>s.id===motherId))throw Error('母親番号は登録済みの番号から選んでください。');
  individual=F.yardPig({individualNumber:String(individualNumber),identityLabel:String(label).trim(),birthDate,sowId:motherId||'',kind:'育成母豚',weight:n.weight??null,csf:n.csf??null,note:options.note||n.groupNote||''},'individual-'+M.uid());
 }
 const after=clone(n);after.count--;after.identifiedIndividuals=(after.identifiedIndividuals||[]).filter(p=>p.key!==individual.key);
 if(!after.count)Object.assign(after,{state:'empty',count:null,sowId:'',mixed:false,entered:'',birthDate:'',csf:false,weight:30,kind:'肉豚',groupNote:''});
 const log={...logBase(options),direction:'out',id:registered(individual,state)||individual.individualNumber||individual.officialNumber||'',individual,nurseryKey,nurseryBefore:clone(n),nurseryAfter:after};
 log.movement={version:1,from:{area:'nursery',key:n.key,name:roomName(n)},to:{area:'yard',key:'yard',name:'運動場'}};
 return log;
}
function implicitPig(data,state,id){
 const s=state.sows[id];if(!s?.active||inNursery(state,id)||state.rooms.some(r=>['family','waiting'].includes(r.state)&&r.sowId===id))throw Error('運動場にいる母豚を選んでください。');
 const found=pigs(state).find(p=>linked(p,state)?.id===id);if(found)return {pig:clone(found),implicit:false};
 if(s.giltRegistration?.yardPigKey)throw Error('個体の現在場所を確認してください。');
 return {pig:F.yardPig({registeredSowId:id,individualNumber:s.numberPending?'':id,identityLabel:s.giltRegistration?.label||'母豚'+id,birthDate:s.birthDate||'',sowId:s.cardBaseline?.mother||'',kind:'育成母豚',weight:s.giltRegistration?.weight??null,csf:s.cardBaseline?.csf==='済'?true:s.cardBaseline?.csf==='未'?false:null,note:s.note||''},'sow-individual-'+id),implicit:true};
}
function prepareIn(data,{pigKey,sowId,nurseryKey,confirmed,...options}){
 const state=M.replay(data),from=sowId?implicitPig(data,state,sowId):{pig:pigs(state).find(p=>p.key===pigKey),implicit:false},individual=from.pig;
 if(!individual)throw Error('運動場の対象個体を選んでください。');
 const origin=latestOrigin(data,individual.key);if(origin&&!origin.legacyOrigin)return prepareUndo(data,origin.key,{...options,preserveCurrentIndividual:true});
 if(origin?.legacyOrigin){
  const n=state.nursery.find(n=>n.key===origin.nurseryKey),g=origin.sourceBefore;
  if(!n||n.state==='unknown'||n.state==='occupied'&&(!Number.isSafeInteger(n.count)||['birthDate','sowId','mixed'].some(k=>(n[k]??'')!==(g[k]??''))))throw Error('元の育成舎は別の豚群に使われています。現在の記録を確認してください。');
  const after=n.state==='empty'?{...clone(n),...clone(g),key:n.key,state:'occupied',count:1,entered:origin.date,identifiedIndividuals:[clone(individual)]}:{...clone(n),count:n.count+1,identifiedIndividuals:[...(n.identifiedIndividuals||[]),clone(individual)]};
  return {...logBase(options),type:TYPES[1],direction:'in',id:registered(individual,state)||individual.individualNumber||individual.officialNumber||'',individual:clone(individual),nurseryKey:n.key,nurseryBefore:clone(n),nurseryAfter:after,undoOf:origin.key,undoIndividualKey:individual.key,movement:{version:1,from:{area:'yard',name:'運動場'},to:{area:'nursery',key:n.key,name:roomName(n)}}};
 }
 const n=state.nursery.find(n=>n.key===nurseryKey);if(!n||n.state!=='empty'||confirmed!==true)throw Error('移動先の空いた育成舎を選び、対象個体を確認してください。');
 if(!I.validDate(individual.birthDate))throw Error('対象個体の誕生日を先に登録してください。');
 const after={...clone(n),state:'occupied',count:1,sowId:individual.sowId==='混成'?'':individual.sowId,mixed:individual.sowId==='混成',birthDate:individual.birthDate,entered:options.date,weight:individual.weight,csf:individual.csf,kind:'育成母豚候補',groupNote:individual.note||'',identifiedIndividuals:[clone(individual)]};
 const log={...logBase(options),direction:'in',id:registered(individual,state)||individual.individualNumber||individual.officialNumber||'',individual:clone(individual),fromImplicitSow:from.implicit,nurseryKey,nurseryBefore:clone(n),nurseryAfter:after};
 log.movement={version:1,from:{area:'yard',key:'yard',name:'運動場'},to:{area:'nursery',key:n.key,name:roomName(n)}};return log;
}
function prepareUndo(data,key,options){
 const original=data.logs.find(l=>l.key===key);if(!original||!TYPES.includes(original.type)||data.logs.some(l=>l.undoOf===key))throw Error('この移動は取り消し済みか、移動元が確認できません。');
 const state=M.replay(data),n=state.nursery.find(n=>n.key===original.nurseryKey),individual=options.preserveCurrentIndividual&&original.direction==='out'&&!original.toImplicitSow?(pigs(state).find(p=>p.key===original.individual.key)||original.individual):original.individual;
 if(!M.sameData(n,original.nurseryAfter))throw Error('元の育成舎が移動後に変更されています。他の豚群へ混ぜず、現在の記録を確認してください。');
 if(original.direction==='out'&&!original.toImplicitSow&&!M.sameData(pigs(state).find(p=>p.key===individual.key),individual))throw Error('対象個体が運動場にいないか、個体情報が変更されています。');
 const log={...logBase(options),type:TYPES[1],direction:original.direction==='out'?'in':'out',id:original.id,individual:clone(individual),nurseryKey:original.nurseryKey,nurseryBefore:clone(n),nurseryAfter:clone(original.nurseryBefore),undoOf:key,fromImplicitSow:!!original.toImplicitSow,toImplicitSow:!!original.fromImplicitSow};
 if(original.direction==='out'&&!log.nurseryAfter.identifiedIndividuals?.some(p=>p.key===individual.key))log.nurseryAfter.identifiedIndividuals=[...(log.nurseryAfter.identifiedIndividuals||[]),clone(individual)];
 log.movement={version:1,from:clone(original.movement.to),to:clone(original.movement.from)};return log;
}
function syncInventory(data,log,before,after){
 const month=log.date.slice(0,7),old=data.inventoryMonths?.[month];if(!old){I.saveReport(data,I.create(data,after,month,log.date,r=>M.roomBirthDate(data,r)),'null');return;}
 const report=clone(old),fresh=I.snapshot(data,after,report.date,r=>M.roomBirthDate(data,r)),delta=log.direction==='out'?-1:1;
 const target=report.rows.find(r=>r.area==='nursery'&&r.roomKey===log.nurseryKey),beforeRoom=before.nursery.find(n=>n.key===log.nurseryKey),next=fresh.find(r=>r.area==='nursery'&&r.roomKey===log.nurseryKey);
 if(!target||target.count!==null&&target.count!==(beforeRoom.count??0))throw Error('頭数調べの育成舎頭数と現在の頭数が異なります。現在の豚舎データから取り込んで、移動し直してください。');
 if(log.fromImplicitSow&&!report.sowSnapshot?.ids.includes(log.individual.registeredSowId))throw Error('頭数調べの母豚頭数を現在の豚舎データから取り込んでください。');
 if(target){
  if(target.count!==null&&target.count+delta<0)throw Error('頭数調べの育成舎頭数が移動頭数と一致しません。現在の頭数を取り込んでください。');
  target.count=target.count===null?next.count:target.count+delta;target.registeredSowIds=next.registeredSowIds||[];
  if(!target.count)Object.assign(target,{state:'empty',birthDate:'',sowId:'',category:'',registeredWeight:null});else if(target.state==='empty')Object.assign(target,next);
 }else if(next)report.rows.push(next);
 const key='yard:pig:'+log.individual.key,idx=report.rows.findIndex(r=>r.key===key||r.sourcePigKey===log.individual.key);
 if(log.direction==='out'&&!log.toImplicitSow){const row=fresh.find(r=>r.key===key);if(idx<0&&row)report.rows.push(row);}
 else if(log.direction==='in'&&!log.fromImplicitSow){if(idx>=0)report.rows.splice(idx,1);else throw Error('頭数調べに対象個体がありません。現在の豚舎データから取り込んでください。');}
 report.status='draft';I.syncPlan(report);I.saveReport(data,report,JSON.stringify(old));
}
function commitLog(data,log){
 const before=M.replay(data);log.action={version:1,kind:'nursery-yard-transfer',before:{location:clone(log.movement.from)},after:{location:clone(log.movement.to)}};
 data.logs.push(log);const after=M.replay(data);validateState(after);syncInventory(data,log,before,after);return log;
}
function out(data,options){return commitLog(data,prepareOut(data,options));}
function into(data,options){return commitLog(data,prepareIn(data,options));}
function undo(data,key,options){return commitLog(data,prepareUndo(data,key,options));}
W.registerUndo('nursery-yard-transfer',(data,log,options)=>undo(data,log.key,options));
const replay=M.replay;
M.replay=function(data){
 const state=replay(data),managed=new Set(data.logs.filter(l=>TYPES.includes(l.type)).map(l=>linked(l.individual,state)?.id).filter(Boolean));
 for(const id of managed){const n=inNursery(state,id),room=state.rooms.find(r=>['family','waiting'].includes(r.state)&&r.sowId===id);state.sows[id].location=n?{area:'nursery',key:n.key,name:roomName(n)}:room?W.roomLocation(room):{area:'yard',name:'運動場'};}
 return state;
};
const validate=M.validate;M.validate=function(data){validate(data);validateState(M.replay(data));};
root.TanakaNurseryYard={TYPES,roomName,pigs,linked,registered,inNursery,locations,latestOrigin,validateState,out,into,undo};
})(typeof globalThis!=='undefined'?globalThis:this);
