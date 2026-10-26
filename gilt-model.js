/* Unnumbered replacement gilts keep a private identity until number assignment. */
(function(root){
'use strict';
const M=root.TanakaModel,clone=M.clone;
const pending=s=>s?.numberPending===true;
const isGilt=s=>pending(s)||!!(s?.giltRegistration?.confirmed&&!s.giltMated);
const replay=M.replay;M.replay=function(data){const state=replay(data);for(const s of Object.values(state.sows))if(s.giltRegistration?.confirmed)s.giltMated=data.logs.some(l=>l.id===s.id&&!l.legacy&&['種付け','分娩'].includes(l.type));return state;};
function linkedSow(pig,state){if(pig.registeredSowId&&state.sows[pig.registeredSowId])return state.sows[pig.registeredSowId];return Object.values(state.sows).find(s=>s.giltRegistration?.yardPigKey===(pig.pigKey||pig.key))||null;}
function yardKind(pig,state){const s=linkedSow(pig,state);return s?(isGilt(s)?'育成母豚':'母豚'):['育成母豚','育成母豚候補'].includes(pig.kind)?'育成母豚':'肉豚';}
function validate(data){
  const keys=new Set(),yard=new Set();
  for(const s of data.sows){
    if(s.numberPending!==undefined&&typeof s.numberPending!=='boolean')throw Error('母豚番号の登録状態を確認してください。');
    const g=s.giltRegistration;if(!g){if(pending(s))throw Error('育成母豚の個体情報がありません。');continue;}
    if(typeof g.key!=='string'||!g.key||keys.has(g.key)||typeof g.label!=='string'||!g.label||typeof g.yardPigKey!=='string'||g.birthMonth!==null&&(!Number.isInteger(g.birthMonth)||g.birthMonth<1||g.birthMonth>12))throw Error('育成母豚の個体情報を確認してください。');
    keys.add(g.key);if(g.yardPigKey){if(yard.has(g.yardPigKey))throw Error('この運動場の個体には既に母豚カードがあります。');yard.add(g.yardPigKey);}
    if(pending(s)&&(!/^gilt-[a-zA-Z0-9-]+$/.test(s.id)||g.assignedAt))throw Error('番号未設定の個体情報を確認してください。');
  }
}
function note(data,id,text,date,extra={}){data.logs.push({key:M.uid(),origin:'operator',type:'追記',id,date,t:new Date().toISOString(),note:text,...extra});}
function nextLabel(data,offset=0){
  const numbers=data.sows.map(s=>/^育母(\d+)$/.exec(s.giltRegistration?.label||'')).filter(Boolean).map(m=>Number(m[1]));
  return '育母'+String(Math.max(0,...numbers)+1+offset).padStart(2,'0');
}
function ensureYardCards(data,date,pigKeys){
  const state=M.replay(data),pigs=root.TanakaFinishing.yardState(state.finishing.find(r=>r.key==='yard')).individuals;
  return pigs.filter(p=>pigKeys.includes(p.key)).map(p=>{const linked=linkedSow(p,M.replay(data));if(linked)return linked.id;const id=create(data,{},date,p.key),s=data.sows.find(s=>s.id===id);s.giltRegistration.confirmed=true;s.location={area:'yard',key:p.key,name:'運動場'};return id;});
}
function create(data,values,date,yardPigKey=''){
  const source=yardPigKey?root.TanakaFinishing.yardState(M.replay(data).finishing.find(r=>r.key==='yard')).individuals.find(p=>p.key===yardPigKey):null;
  if(yardPigKey&&!source)throw Error('運動場の個体が変わりました。開き直してください。');
  if(yardPigKey&&data.sows.some(s=>s.giltRegistration?.yardPigKey===yardPigKey))throw Error('この個体の母豚カードは作成済みです。');
  const id='gilt-'+M.uid(),key=M.uid(),label=values.label||nextLabel(data);
  const s={id,numberPending:true,giltRegistration:{key,label,yardPigKey,birthMonth:source?root.TanakaFinishing.yardBirthMonth(source):null,weight:source?.weight??null,createdAt:new Date().toISOString(),assignedAt:''},breed:'バークシャー',birthDate:values.birthDate||source?.birthDate||'',note:values.note||source?.note||'',cardBaseline:{parity:0,result:'初',mother:values.mother??((source?.sowId==='混成'?'':source?.sowId)||''),birth:values.birthDate||source?.birthDate||'',csf:source?.csf===true?'済':''}};
  data.sows.push(s);
  if(source&&source.kind!=='育成母豚'){
    const F=root.TanakaFinishing,before=F.group(M.replay(data).finishing.find(r=>r.key==='yard')),after=F.yardState({individuals:before.individuals.map(p=>p.key===yardPigKey?{...p,kind:'育成母豚'}:p)});
    data.logs.push({key:M.uid(),origin:'operator',type:'肉豚舎更新',id:'',date,t:new Date().toISOString(),note:'育成母豚カードを作成',finishingKey:'yard',finishingBefore:before,finishingAfter:after,yardIndividuals:1});
  }
  note(data,id,'番号未設定の育成母豚カードを作成',date);return id;
}
function update(data,id,values,date){
  const s=data.sows.find(s=>s.id===id);if(!pending(s))throw Error('番号未設定の育成母豚を選んでください。');const before=clone(s);
  s.birthDate=values.birthDate||'';s.note=values.note||'';s.giltRegistration.label=values.label||s.giltRegistration.label;s.cardBaseline.mother=values.mother||'';
  if(s.parityCards)s.parityCards.current.card.mother=values.mother||'';
  note(data,id,'育成母豚の個体情報を編集',date,{profileBefore:before,profileAfter:clone(s)});
}
function assign(data,id,number,date){
  const s=data.sows.find(s=>s.id===id);if(!pending(s))throw Error('このカードには母豚番号が登録済みです。');
  if(typeof number!=='string'||!/^\d+$/.test(number))throw Error('正式な母豚番号を数字で入力してください。');
  const canonical=n=>String(n).replace(/^0+(?=\d)/,''),state=M.replay(data),physical=root.TanakaNurseryYard?.locations(state).map(x=>x.pig)||root.TanakaFinishing.yardState(state.finishing.find(r=>r.key==='yard')).individuals;
  if(data.sows.some(x=>canonical(x.id)===canonical(number))||data.maternalLineage?.relationships.some(r=>canonical(r.sowId)===canonical(number))||physical.some(p=>p.key!==s.giltRegistration.yardPigKey&&[p.officialNumber,p.individualNumber].some(n=>n&&canonical(n)===canonical(number))))throw Error('その番号は母豚台帳または系譜に登録済みです。別の番号を確認してください。');
  const before=clone(s);s.id=number;s.numberPending=false;s.giltRegistration.assignedAt=new Date().toISOString();
  // Only this individual's operation references change; monthly snapshots stay frozen.
  data.logs.forEach(l=>{if(l.id===id)l.id=number;});
  note(data,number,'育成母豚に母豚番号 '+number+' を登録',date,{profileBefore:before,profileAfter:clone(s)});
  return number;
}
// Prepare is read-only. Commit rechecks the complete input snapshot before mutation.
function prepareConfirmation(data,roomKey,values,date){
  const F=root.TanakaFinishing,I=root.TanakaInventory,state=M.replay(data),room=state.finishing.find(r=>r.key===roomKey);
  if(!room||roomKey==='yard'||room.state!=='occupied'||room.kind!=='育成母豚候補'||!Number.isSafeInteger(room.count)||room.count<1)throw Error('育成母豚候補の部屋を選び直してください。');
  const individuals=(Array.isArray(values.individuals)?values.individuals:[{number:values.number,birthDate:values.birthDate}]).map((p,i)=>({number:String(p.number||'').trim(),label:nextLabel(data,i),birthDate:p.birthDate||room.birthDate||''}));
  if(!individuals.length||individuals.length>room.count||values.count!==undefined&&Number(values.count)!==individuals.length)throw Error('移動頭数と個体情報の件数を確認してください。');
  const canonicalNumber=n=>String(n).replace(/^0+(?=\d)/,''),seen=new Set();
  for(const p of individuals){
    if(!I.validDate(p.birthDate)||p.birthDate>date)throw Error('誕生日を確認してください。');
    const number=p.number;if(!number)continue;if(!/^\d+$/.test(number))throw Error('新しい母豚番号を数字で入力してください。');
    const normalized=canonicalNumber(number);if(seen.has(normalized))throw Error('入力した母豚番号 '+number+' が重複しています。');seen.add(normalized);
    const yard=state.finishing.filter(r=>r.key==='yard').flatMap(r=>F.yardState(r).individuals),physical=root.TanakaNurseryYard?.locations(state).map(x=>x.pig)||yard;
    if(Object.values(state.sows).some(s=>s.active&&canonicalNumber(s.id)===normalized)||physical.some(p=>[p.officialNumber,p.individualNumber].some(n=>n&&canonicalNumber(n)===normalized)))throw Error('母豚番号 '+number+' はすでに使用されています');
    if(data.sows.some(s=>canonicalNumber(s.id)===normalized))throw Error('母豚番号 '+number+' は履歴に登録されています。別の番号を入力してください。');
    if(!I.validDate(p.birthDate)||p.birthDate>date)throw Error('誕生日を確認してください。');
  }
  const report=I.create(data,state,date.slice(0,7),date,r=>r.birthDate||'');
  return {roomKey,number:individuals[0].number,birthDate:individuals[0].birthDate,individuals,count:individuals.length,remainingKind:'育成母豚候補',date,before:F.group(room),total:I.farmSummary(report).farmTotal,expected:JSON.stringify(data)};
}
function confirmCandidate(data,plan){
  if(JSON.stringify(data)!==plan.expected)throw Error('確認中にデータが変更されました。入力画面から確認し直してください。');
  const checked=prepareConfirmation(data,plan.roomKey,plan,plan.date),F=root.TanakaFinishing,I=root.TanakaInventory,before=checked.before,count=checked.count;
  const key=M.uid(),yard=F.group(M.replay(data).finishing.find(r=>r.key==='yard'));
  data.logs.push({key,origin:'operator',type:'肉豚舎へ移動',id:before.sowId,date:plan.date,t:new Date().toISOString(),finishingKey:'yard',sourceArea:'finishing',sourceKey:plan.roomKey,sourceBefore:before,sourceTotal:before.count,count,yardIndividuals:1,yardBefore:yard,yardPigKeys:[],simpleYard:1,note:'育成母豚 '+checked.individuals.map(p=>p.label).join('・')+' を確定',confirmedIndividuals:clone(checked.individuals),remainingKind:checked.remainingKind,movement:{from:{name:'肉豚舎 '+plan.roomKey.slice(1)+'室'},to:{name:'運動場'}}});
  let state=M.replay(data);
  const selected=checked.individuals.map((p,i)=>({...p,pigKey:key+':pig:'+(i+1)})),yardBefore=F.group(state.finishing.find(r=>r.key==='yard'));
  data.logs.push({key:M.uid(),origin:'operator',type:'肉豚舎更新',id:'',date:plan.date,finishingKey:'yard',yardIndividuals:1,finishingBefore:yardBefore,finishingAfter:F.yardState({individuals:yardBefore.individuals.map(p=>{const chosen=selected.find(x=>x.pigKey===p.key);return chosen?{...p,birthDate:chosen.birthDate,kind:'育成母豚'}:p;})})});
  ensureYardCards(data,plan.date,selected.map(p=>p.pigKey));
  state=M.replay(data);const fresh=I.create(data,state,plan.date.slice(0,7),plan.date,r=>r.birthDate||'');
  if(I.farmSummary(fresh).farmTotal!==checked.total)throw Error('全豚舎総頭数が一致しないため確定できません。');
  const old=data.inventoryMonths?.[fresh.month];
  if(old){const report=clone(old),rows=I.snapshot(data,state,report.date,r=>r.birthDate||''),roomRow=report.rows.find(r=>r.area==='finishing'&&r.roomKey===plan.roomKey);if(!roomRow||!Number.isSafeInteger(roomRow.count)||roomRow.count<count)throw Error('今月の頭数調べの移動元頭数を確認してから確定してください。');roomRow.count-=count;roomRow.kind=roomRow.count?checked.remainingKind:'肉豚';roomRow.state=roomRow.count?'occupied':'empty';for(const p of selected)report.rows.push(rows.find(r=>r.sourcePigKey===p.pigKey));report.status='draft';I.syncPlan(report);I.saveReport(data,report,JSON.stringify(old));}
  else I.saveReport(data,fresh,'null');
  return {key,number:plan.number,pigKey:selected[0].pigKey,count,individuals:selected};
}
function restoreConfirmation(data,before,expected){
  if(JSON.stringify(data)!==expected)throw Error('確定後に別の変更があります。元に戻す前に現在の記録を確認してください。');
  Object.keys(data).forEach(k=>delete data[k]);Object.assign(data,clone(before));
}
const previous=M.validate;M.validate=function(data){previous(data);validate(data);};
root.TanakaGilts={nextLabel,ensureYardCards,pending,isGilt,prepareConfirmation,confirmCandidate,restoreConfirmation,linkedSow,yardKind,create,update,assign,validate};
})(typeof globalThis!=='undefined'?globalThis:this);
