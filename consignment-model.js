/* Private-use departures update stock, never commercial shipment records. */
(function(root){
'use strict';
const M=root.TanakaModel,F=root.TanakaFinishing,I=root.TanakaInventory,clone=M.clone;
const targetKey=(roomKey,pigKey='')=>roomKey==='yard'?'yard:'+pigKey:roomKey;
function eligible(state,roomKey,pigKey=''){
 const room=state.finishing.find(r=>r.key===roomKey);if(!room||room.state!=='occupied')return null;
 if(roomKey==='yard'){const pig=F.yardState(room).individuals.find(p=>p.key===pigKey);return pig&&root.TanakaGilts.yardKind(pig,state)==='肉豚'?pig:null;}
 return room.kind==='肉豚'?room:null;
}
function cohort(data,roomKey,pig){
 if(roomKey==='yard')return pig.key;
 let token='baseline';
 for(const l of data.logs){if(l.legacy)continue;
  if(l.type==='肉豚舎へ移動'&&(l.finishingKey===roomKey||l.sourceArea==='finishing'&&l.sourceKey===roomKey&&l.count===(l.sourceBefore?.count??l.sourceTotal)))token=l.key;
  if(l.finishingKey===roomKey&&(l.type==='肉豚出荷'&&l.count===l.finishingBefore?.count||l.type==='肉豚舎更新'&&(!l.finishingBefore?.count||!l.finishingAfter?.count||l.finishingBefore?.kind!==l.finishingAfter?.kind)))token=l.key;
 }
 return JSON.stringify([token,pig.birthDate,pig.sowId,!!pig.mixed]);
}
function candidate(data,state,roomKey,pigKey=''){
 const p=eligible(state,roomKey,pigKey),saved=data.consignmentCandidates?.[targetKey(roomKey,pigKey)];
 return p&&saved&&saved.cohort===cohort(data,roomKey,p)?{...clone(saved),needsReview:saved.count>p.count}:null;
}
function mark(data,{roomKey,pigKey='',count}){
 const state=M.replay(data),pig=eligible(state,roomKey,pigKey);if(!pig)throw Error('委託の対象は肉豚舎と運動場の肉豚だけです。');
 if(!Number.isSafeInteger(count)||count<1||count>pig.count||roomKey==='yard'&&count!==1)throw Error('委託候補の頭数を確認してください。');
 data.consignmentCandidates=data.consignmentCandidates||{};data.consignmentCandidates[targetKey(roomKey,pigKey)]={roomKey,pigKey,count,cohort:cohort(data,roomKey,pig)};
}
function clear(data,{roomKey,pigKey=''}){if(data.consignmentCandidates)delete data.consignmentCandidates[targetKey(roomKey,pigKey)];}
function saleLimit(data,state,roomKey,pigKey=''){
 const room=state.finishing.find(r=>r.key===roomKey),p=roomKey==='yard'?F.yardState(room||{}).individuals.find(p=>p.key===pigKey):room;
 return Math.max(0,(p?.count||0)-(candidate(data,state,roomKey,pigKey)?.count||0));
}
function assertSale(data,{roomKey,pigKey='',count}){if(count>saleLimit(data,M.replay(data),roomKey,pigKey))throw Error('委託候補は通常の出荷頭数に含められません。候補の操作を確認してください。');}
function assertMove(data,roomKey,pigKey=''){if(candidate(data,M.replay(data),roomKey,pigKey))throw Error('委託候補があります。候補を解除してから移動してください。');}
function finalize(data,{roomKey,pigKey='',date,inventoryDate=date,expected}){
 if(expected!==undefined&&JSON.stringify(data)!==expected)throw Error('記録が更新されています。委託の確認を開き直してください。');
 if(!I.validDate(date)||!I.validDate(inventoryDate)||date>inventoryDate)throw Error('委託日は実際に出した日を入力してください。');
 const before=M.replay(data),p=eligible(before,roomKey,pigKey),c=candidate(data,before,roomKey,pigKey);if(!p||!c||c.needsReview)throw Error('委託候補の頭数・現在場所を確認してください。');
 if(p.birthDate&&date<p.birthDate)throw Error('誕生日より前の日付にはできません。');
 const room=before.finishing.find(r=>r.key===roomKey),group=F.group(room),after=roomKey==='yard'?F.yardState({individuals:group.individuals.filter(p=>p.key!==pigKey)}):{...group,count:group.count-c.count};
 const total=I.farmSummary(I.create(data,before,inventoryDate.slice(0,7),inventoryDate,()=> '')).farmTotal;
 data.logs.push({key:M.uid(),origin:'operator',type:'肉豚舎更新',id:'',date,t:new Date().toISOString(),note:'',privateStockUse:true,finishingKey:roomKey,finishingBefore:group,finishingAfter:after,...(roomKey==='yard'?{yardIndividuals:1}:{simpleYard:1})});clear(data,{roomKey,pigKey});
 data.consignmentDates=data.consignmentDates||[];if(!data.consignmentDates.includes(date))data.consignmentDates.push(date);
 const next=M.replay(data),fresh=I.create(data,next,inventoryDate.slice(0,7),inventoryDate,r=>M.roomBirthDate(data,r));if(I.farmSummary(fresh).farmTotal!==total-c.count)throw Error('委託後の頭数を確認してください。');
 const old=data.inventoryMonths?.[fresh.month];if(old){const report=clone(old);
  if(roomKey==='yard'){const index=report.rows.findIndex(r=>r.sourcePigKey===pigKey||r.key==='yard:pig:'+pigKey);if(index<0)throw Error('頭数調べの運動場へ現在の頭数を取り込んでください。');report.rows.splice(index,1);}
  else{const row=report.rows.find(r=>r.area==='finishing'&&r.roomKey===roomKey),now=fresh.rows.find(r=>r.area==='finishing'&&r.roomKey===roomKey);if(!row)throw Error('頭数調べの対象部屋へ現在の頭数を取り込んでください。');row.count=now.count;row.state=now.state;if(!now.count)Object.assign(row,{birthDate:'',sowId:'',category:'',kind:'肉豚',registeredWeight:null});}
  report.status='draft';I.syncPlan(report);I.saveReport(data,report,JSON.stringify(old));
 }else I.saveReport(data,fresh,'null');
 return c.count;
}
const validate=M.validate;M.validate=function(data){validate(data);if(data.consignmentDates!==undefined&&(!Array.isArray(data.consignmentDates)||new Set(data.consignmentDates).size!==data.consignmentDates.length||data.consignmentDates.some(date=>!I.validDate(date))))throw Error('委託履歴の日付を確認してください。');if(data.consignmentCandidates===undefined)return;const values=data.consignmentCandidates;if(!values||Array.isArray(values)||typeof values!=='object')throw Error('委託候補の保存形式を確認してください。');for(const [key,c] of Object.entries(values)){if(!c||!(c.roomKey==='yard'?typeof c.pigKey==='string'&&c.pigKey.length>0&&c.count===1:/^f([1-9]|1\d|2[0-4])$/.test(c.roomKey))||key!==targetKey(c.roomKey,c.pigKey)||!Number.isSafeInteger(c.count)||c.count<1||typeof c.cohort!=='string')throw Error('委託候補の情報を確認してください。');}};
root.TanakaConsignment={targetKey,eligible,candidate,mark,clear,saleLimit,assertSale,assertMove,finalize};
})(typeof globalThis!=='undefined'?globalThis:this);
