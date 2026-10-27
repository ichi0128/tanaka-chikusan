/* Candidate marking does not remove an animal; final departure uses existing logs. */
(function(root){
'use strict';
const M=root.TanakaModel,F=root.TanakaFinishing,I=root.TanakaInventory,N=root.TanakaNurseryYard,clone=M.clone;
function mark(data,{id,candidate,date,key=M.uid()}){
 if(typeof candidate!=='boolean')throw Error('候補の状態を選んでください。');
 const state=M.replay(data),s=state.sows[id];if(!s?.active)throw Error('在籍中の母豚を選んでください。');
 if(!!s.cullCandidate===candidate)throw Error('廃豚候補の状態が変わっています。開き直してください。');
 data.sows.find(s=>s.id===id).cullCandidate=candidate;
 const log={key,origin:'operator',type:'追記',id,date,t:new Date().toISOString(),note:candidate?'廃豚候補に指定':'廃豚候補を解除',action:{version:1,kind:'sow-cull-candidate',before:{candidate:!candidate},after:{candidate}}};data.logs.push(log);return log;
}
function finalize(data,{id,date,key=M.uid(),expected}){
 if(expected!==undefined&&JSON.stringify(data)!==expected)throw Error('記録が更新されています。廃豚の確認を開き直してください。');
 const state=M.replay(data),s=state.sows[id];if(!s?.active||!s.cullCandidate)throw Error('廃豚候補の母豚を選んでください。');
 if(N.inNursery(state,id))throw Error('この個体は育成舎にいます。運動場へ移動してから確認してください。');
 const beforeTotal=I.farmSummary(I.create(data,state,date.slice(0,7),date,()=> '')).farmTotal,room=state.rooms.find(r=>['family','waiting'].includes(r.state)&&r.sowId===id),yard=F.group(state.finishing.find(r=>r.key==='yard')),pig=yard.individuals.find(p=>N.linked(p,state)?.id===id);
 const from=room?root.TanakaSowWork.roomLocation(room):root.TanakaSowWork.yardOrigin(s);
 const stamp=(type,note)=>({key:M.uid(),origin:'operator',type,id,date,t:new Date().toISOString(),note,cullOperation:key});
 if(room){const after=room.state==='family'?{...clone(room),state:'piglets'}:{...clone(room),state:'empty',sowId:'',count:null,mixed:false,birthDate:'',entryKey:''};data.logs.push({...stamp('分娩舎修正','廃豚確定に伴う母豚の退室（子豚の頭数は維持）'),roomKey:room.key,room:after});}
 if(pig)data.logs.push({...stamp('肉豚舎更新','廃豚確定に伴う運動場の個体退出'),finishingKey:'yard',yardIndividuals:1,finishingBefore:yard,finishingAfter:F.yardState({individuals:yard.individuals.filter(p=>p.key!==pig.key)})});
 const log={...stamp('廃豚','廃豚確定'),key,action:{version:1,kind:'sow-cull-final',before:{location:from,candidate:true},after:{active:false}},departure:{from:clone(from),count:1}};
 data.logs.push(log);data.sows.find(s=>s.id===id).cullCandidate=false;
 const next=M.replay(data),fresh=I.create(data,next,date.slice(0,7),date,r=>M.roomBirthDate(data,r));
 if(I.farmSummary(fresh).farmTotal!==beforeTotal-1)throw Error('頭数が一致しません。現在場所を確認してください。');
 const old=data.inventoryMonths?.[fresh.month];
 if(old){const report=clone(old);if(report.sowSnapshot)report.sowSnapshot.ids=report.sowSnapshot.ids.filter(x=>x!==id);
  if(pig)report.rows=report.rows.filter(r=>r.sourcePigKey!==pig.key&&r.key!=='yard:pig:'+pig.key);
  if(room){const row=report.rows.find(r=>r.area==='farrowing'&&r.roomKey===room.key),now=fresh.rows.find(r=>r.area==='farrowing'&&r.roomKey===room.key);if(row&&now){row.state=now.state;if(room.state==='waiting')Object.assign(row,{count:0,sowId:'',birthDate:'',category:''});else if(row.autoCategory)row.category=now.category;}}
  report.status='draft';I.syncPlan(report);I.saveReport(data,report,JSON.stringify(old));
 }else I.saveReport(data,fresh,'null');
 return log;
}
function receipt(data,id){return data.logs.filter(l=>l.id===id&&l.type==='廃豚').at(-1)?.action?.kind==='sow-cull-final'?data.logs.filter(l=>l.id===id&&l.type==='廃豚').at(-1):null;}
function restore(data,{id,date}){
 const state=M.replay(data),original=receipt(data,id);if(!original||!state.sows[id]||state.sows[id].active)throw Error('廃豚済みの母豚を確認してください。');
 const before=I.farmSummary(I.create(data,state,date.slice(0,7),date,()=> '')).farmTotal,key=M.uid(),removed=data.logs.find(l=>l.cullOperation===original.key&&l.type==='肉豚舎更新');
 const pig=removed?.finishingBefore?.individuals.find(p=>N.linked(p,state)?.id===id);
 data.logs.push({key,origin:'operator',type:'現役復帰',id,date,t:new Date().toISOString(),note:'廃豚確定を訂正して在籍に戻す',cullOperation:key,action:{version:1,kind:'sow-cull-restore',originalKey:original.key}});
 if(pig){if(N.locations(state).some(x=>x.pig.key===pig.key))throw Error('この個体は既に登録されています。');const yard=F.group(state.finishing.find(r=>r.key==='yard'));data.logs.push({key:M.uid(),origin:'operator',type:'肉豚舎更新',id,date,cullOperation:key,finishingKey:'yard',yardIndividuals:1,finishingBefore:yard,finishingAfter:F.yardState({individuals:[...yard.individuals,clone(pig)]})});}
 const fresh=I.create(data,M.replay(data),date.slice(0,7),date,r=>M.roomBirthDate(data,r));if(I.farmSummary(fresh).farmTotal!==before+1)throw Error('復帰後の頭数を確認してください。');
 const old=data.inventoryMonths?.[fresh.month];if(old){const report=clone(old);if(report.sowSnapshot&&fresh.sowSnapshot.ids.includes(id)&&!report.sowSnapshot.ids.includes(id))report.sowSnapshot.ids.push(id);if(pig&&!report.rows.some(r=>r.sourcePigKey===pig.key))report.rows.push(fresh.rows.find(r=>r.sourcePigKey===pig.key));report.status='draft';I.syncPlan(report);I.saveReport(data,report,JSON.stringify(old));}else I.saveReport(data,fresh,'null');
}
const validate=M.validate;M.validate=function(data){validate(data);if(data.sows.some(s=>s.cullCandidate!==undefined&&typeof s.cullCandidate!=='boolean'))throw Error('廃豚候補の状態を確認してください。');};
root.TanakaCulling={mark,finalize,receipt,restore};
})(typeof globalThis!=='undefined'?globalThis:this);
