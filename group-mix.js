/* Two existing groups merge in one transaction; sources remain in the receipt. */
(function(root){
'use strict';
const M=root.TanakaModel,F=root.TanakaFinishing,I=root.TanakaInventory,clone=M.clone;
const TYPES=['豚群混合','豚群混合取消'];TYPES.forEach(t=>{M.TYPES.push(t);F.TYPES.push(t);});
const token=t=>t.area+':'+t.key;
function room(state,t){return (t.area==='nursery'?state.nursery:t.area==='finishing'?state.finishing:[]).find(r=>r.key===t.key);}
function groups(data,state=M.replay(data)){return [...state.nursery.map(r=>({area:'nursery',r})),...state.finishing.filter(r=>r.key!=='yard').map(r=>({area:'finishing',r}))].filter(({r})=>r.state==='occupied'&&Number.isSafeInteger(r.count)&&r.count>0&&!(r.identifiedIndividuals||[]).length).map(({area,r})=>({area,key:r.key,group:clone(r)}));}
function eligible(data,t,state=M.replay(data)){
 const entry=groups(data,state).find(g=>token(g)===token(t));if(!entry)throw Error('頭数が確定した豚群を選んでください。個体管理中の豚は混ぜられません。');
 if(t.area==='finishing'&&root.TanakaConsignment.candidate(data,state,t.key))throw Error('委託候補を解除してから混ぜてください。');return entry.group;
}
function equal(a,b,area){return area==='finishing'?M.sameData(F.group(a),F.group(b)):M.sameData(a,b);}
function empty(r,area){return area==='finishing'?F.empty(r.key):{...clone(r),state:'empty',count:null,sowId:'',mixed:false,entered:'',birthDate:'',csf:false,weight:30,kind:'肉豚',groupNote:'',...('identifiedIndividuals'in r?{identifiedIndividuals:[]}:{})};}
function prepare(data,{a,b,destination,date,weight,note='',now,key=M.uid(),t=new Date().toISOString()}){
 if(!I.validDate(date)||!I.validDate(now)||date>now)throw Error('混ぜた日を今日以前の日付で入力してください。');
 if(token(a)===token(b)||![token(a),token(b)].includes(destination))throw Error('異なる2つの群と、まとめ先の部屋を選んでください。');
 const state=M.replay(data),sources=[a,b].map(x=>({...clone(x),before:eligible(data,x,state)}));
 if(sources.some(x=>x.before.birthDate&&(!I.validDate(x.before.birthDate)||x.before.birthDate>date)||I.validDate(x.before.entered)&&x.before.entered>date))throw Error('誕生日・入室日より前には混ぜられません。');
 if(!Number.isSafeInteger(weight)||weight<0||weight%10)throw Error('体重は0kg以上、10kg単位で入力してください。');
 const selected=sources.find(s=>token(s)===destination),other=sources.find(s=>s!==selected),count=sources.reduce((n,s)=>n+s.before.count,0);
 if(!Number.isSafeInteger(count))throw Error('合計頭数を確認してください。');
 const mixed=sources.some(s=>s.before.mixed)||!selected.before.sowId||selected.before.sowId!==other.before.sowId||selected.before.birthDate!==other.before.birthDate;
 const combined={...clone(selected.before),state:'occupied',count,mixed,sowId:mixed?'':selected.before.sowId,birthDate:sources.every(s=>s.before.birthDate)?sources.map(s=>s.before.birthDate).sort().at(-1):'',csf:sources.every(s=>s.before.csf===true),weight,kind:sources.some(s=>['育成母豚','育成母豚候補'].includes(s.before.kind))?'育成母豚候補':'肉豚'};
 const notes=sources.map(s=>s.before.groupNote||s.before.note||'').filter(Boolean).join('\n');
 if(selected.area==='nursery')combined.groupNote=notes;else combined.note=notes;
 return {key,type:TYPES[0],origin:'operator',id:'',date,t,note:String(note),count,action:{version:1,kind:'group-mix'},mix:{version:1,destination,patches:sources.map(s=>({area:s.area,key:s.key,before:s.before,after:token(s)===destination?combined:empty(s.before,s.area)}))}};
}
const previousApply=F.apply;
F.apply=function(log,finishing,nursery){
 if(!TYPES.includes(log.type))return previousApply(log,finishing,nursery);
 const patches=log.mix?.patches,state={finishing,nursery};
 if(log.mix?.version!==1||!Array.isArray(patches)||patches.length!==2||new Set(patches.map(token)).size!==2||!Number.isSafeInteger(log.count)||log.count<1)throw Error('混合記録の保存形式を確認してください。');
 for(const p of patches){const r=room(state,p);if(!r||!equal(r,p.before,p.area))throw Error('混合前後の部屋が変更されています。関連する後の記録を確認してください。');}
 const before=patches.reduce((n,p)=>n+(p.before.count??0),0),after=patches.reduce((n,p)=>n+(p.after.count??0),0);
 if(before!==after||before!==log.count)throw Error('混合前後の総頭数が一致しません。');
 for(const p of patches){const r=room(state,p);Object.keys(r).forEach(k=>delete r[k]);Object.assign(r,clone(p.after));}
 F.check(finishing);
};
function syncInventory(data,targets,now){
 const state=M.replay(data),month=now.slice(0,7),old=data.inventoryMonths?.[month],fresh=I.create(data,state,month,now,r=>M.roomBirthDate(data,r));
 if(!old){I.saveReport(data,fresh,'null');return;}
 const report=clone(old),rows=I.snapshot(data,state,report.date,r=>M.roomBirthDate(data,r));
 for(const t of targets){const next=rows.find(r=>r.area===t.area&&r.roomKey===t.key),index=report.rows.findIndex(r=>r.area===t.area&&r.roomKey===t.key);if(!next)throw Error('移動後の頭数調べを確認してください。');if(index<0)report.rows.push(next);else report.rows[index]=next;}
 report.status='draft';I.syncPlan(report);I.saveReport(data,report,JSON.stringify(old));
}
function assertExpected(data,expected){if(expected!==undefined&&JSON.stringify(data)!==expected)throw Error('記録が更新されています。確認画面を開き直してください。');}
function total(data,now){return I.farmSummary(I.create(data,M.replay(data),now.slice(0,7),now,()=> '')).farmTotal;}
function create(data,options){assertExpected(data,options.expected);const before=total(data,options.now),log=prepare(data,options);data.logs.push(log);if(total(data,options.now)!==before)throw Error('混合後の総頭数が一致しません。');syncInventory(data,log.mix.patches,options.now);return log;}
function cancelled(data,key){return data.logs.some(l=>l.type===TYPES[1]&&l.undoOf===key);}
function original(data,key){const l=data.logs.find(l=>l.type===TYPES[0]&&l.key===key);if(!l||cancelled(data,key))throw Error('この混合記録は取り消し済みか、見つかりません。');return l;}
function touches(l,patches){return patches.some(p=>[l.nurseryKey,l.finishingKey,l.sourceKey].includes(p.key)||l.mix?.patches.some(q=>token(p)===token(q))||l.death?.patches.some(q=>q.area===p.area&&q.key===p.key));}
function hasLaterWork(data,l){return data.logs.slice(data.logs.indexOf(l)+1).some(x=>touches(x,l.mix.patches));}
function undo(data,key,{date,now=date,expected}={}){
 assertExpected(data,expected);const l=original(data,key);if(!I.validDate(date)||!I.validDate(now)||date>now||date<l.date)throw Error('取り消し日を確認してください。');
 if(hasLaterWork(data,l))throw Error('混ぜた後に移動・編集などの作業があります。関連する後の作業を先に戻してください。');
 const before=total(data,now),next={key:M.uid(),type:TYPES[1],origin:'operator',id:'',date,t:new Date().toISOString(),note:'混合を取り消し、元の2部屋へ復元',count:l.count,undoOf:key,mix:{version:1,destination:l.mix.destination,patches:l.mix.patches.map(p=>({...clone(p),before:clone(p.after),after:clone(p.before)}))}};
 data.logs.push(next);if(total(data,now)!==before)throw Error('取消後の総頭数が一致しません。');syncInventory(data,next.mix.patches,now);return next;
}
function edit(data,key,{destination,date,weight,note='',now,expected}={}){
 assertExpected(data,expected);const l=original(data,key),index=data.logs.indexOf(l),dest=l.mix.patches.find(p=>token(p)===l.mix.destination),later=hasLaterWork(data,l);
 if(later&&(destination!==l.mix.destination||weight!==dest.after.weight))throw Error('混ぜた後に作業があります。今は日付・メモだけ修正できます。部屋を変える場合は関連する後の作業を先に戻してください。');
 if(later&&data.logs.slice(index+1).some(x=>touches(x,l.mix.patches)&&I.validDate(x.date)&&x.date<date))throw Error('後の移動・作業日より後の日付には修正できません。');
 const prefix=clone(data);prefix.logs=prefix.logs.slice(0,index);
 const [a,b]=l.mix.patches,next=prepare(prefix,{a:{area:a.area,key:a.key},b:{area:b.area,key:b.key},destination,date,weight,note,now,key:l.key,t:l.t});
 const old=clone(l);delete old.revisions;next.revisions=[...(l.revisions||[]),old];next.updatedAt=new Date().toISOString();data.logs[index]=next;
 M.validate(data);syncInventory(data,l.mix.patches,now);return next;
}
root.TanakaGroupMix={TYPES,token,groups,eligible,prepare,create,undo,edit,cancelled,hasLaterWork,syncInventory};
})(typeof globalThis!=='undefined'?globalThis:this);
