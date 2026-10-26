'use strict';
const N=TanakaNurseryYard;
function individualName(p){return (p.individualNumber||p.officialNumber?'個体 '+(p.individualNumber||p.officialNumber):'個体')+(p.identityLabel?'（'+p.identityLabel+'）':'');}
function syncNurseryMoveDraft(month,log){
 const c=inventoryDrafts.get(month);if(!c)return;if(!c.dirty){inventoryDrafts.delete(month);return;}
 const saved=db.inventoryMonths?.[month];if(!saved)return;
 const nurseryKey='nursery:'+log.nurseryKey,yardKey='yard:pig:'+log.individual.key,keys=new Set([nurseryKey,yardKey]),rows=saved.rows.filter(r=>keys.has(r.key));
 c.report.rows=c.report.rows.filter(r=>!keys.has(r.key)).concat(I.clone(rows));
 if(saved.sowSnapshot)c.report.sowSnapshot=I.clone(saved.sowSnapshot);
 c.report.revisions=I.clone(saved.revisions||[]);I.syncPlan(c.report);c.expected=JSON.stringify(saved);
}
function commitNurseryWork(fn){let log;save(d=>{log=fn(d);});syncNurseryMoveDraft(log.date.slice(0,7),log);showNurseryMovement(log);if(page==='inventory')render();}
function showNurseryMovement(log){
 const who=individualName(log.individual),from=log.movement.from.area==='nursery'?'育成舎':'運動場',to=log.movement.to.area==='nursery'?'育成舎':'運動場',text=who+'を'+from+'から'+to+'へ'+(log.undoOf?'戻しました（移動取消）':'移動しました');
 showWorkAction(log,text);document.getElementById('work-feedback').innerHTML=`<span>${esc(simulation?'【仮データ】':'')}${esc(text)}<small>${esc(log.movement.from.name)} → ${esc(log.movement.to.name)} · 1頭</small></span>${log.undoOf?'':`<button type="button" data-action="work-undo" data-id="${esc(log.key)}">元に戻す</button>`}<button type="button" data-action="work-dismiss">閉じる</button>`;
}
function nurseryToYard(key,preset=''){
 const n=state.nursery.find(n=>n.key===key);if(!n||n.state!=='occupied'||!Number.isSafeInteger(n.count)||n.count<1){toast('移動元の確定した頭数を確認してください');return;}
 const basis=db,known=n.identifiedIndividuals||[];
 form(N.roomName(n)+' → 運動場',`<p>現在 ${n.count}頭 → 移動後 ${n.count-1}頭</p><p><b>移動頭数：1頭</b></p><label for="individualChoice">対象個体</label><select id="individualChoice" name="individualChoice"><option value="">新しく対象の育成母豚1頭を確認</option>${known.map(p=>`<option value="${esc(p.key)}" ${p.key===preset?'selected':''}>${esc(individualName(p))} · ${esc(p.birthDate||'誕生日未入力')}</option>`).join('')}</select><div id="new-individual-fields">${field('individualNumber','耳標番号（任意・正式な母豚番号は種付け時）','','text')}${field('individualLabel','仮番号・見分け情報（自動入力）',TanakaGilts.nextLabel(db),'text',true)}${field('individualBirth','この個体の誕生日',n.birthDate||'','date',true)}${sowNumberSelect('individualMother',n.mixed?'':n.sowId||'',{label:'この個体の母親番号（分かる場合）'})}<label class="individual-confirm"><input type="checkbox" name="identifiedConfirmed" value="yes" required>運動場で個体管理する育成母豚1頭であることを確認しました</label></div>${notes('')}<p class="muted">移動した1頭に「育母01」などの母豚カードを作成し、親番号・誕生日・「初」を引き継ぎます。正式な母豚番号は種付け時に登録します。</p>`,'この1頭を移動',f=>{
  if(db!==basis)throw Error('記録が更新されました。対象個体を確認し直してください。');
  commitNurseryWork(d=>N.out(d,{...makeLog(N.TYPES[0],''),nurseryKey:key,pigKey:String(f.get('individualChoice')||''),individualNumber:String(f.get('individualNumber')||'').trim(),label:String(f.get('individualLabel')||'').trim(),birthDate:String(f.get('individualBirth')||''),motherId:String(f.get('individualMother')||''),confirmed:f.get('identifiedConfirmed')==='yes',note:String(f.get('note')||'')}));
 });
 const choice=document.getElementById('individualChoice');if(preset)choice.value=preset;
 const update=()=>{const selected=!!choice.value;document.getElementById('new-individual-fields').hidden=selected;for(const id of ['individualNumber','individualLabel','individualBirth','individualMother'])document.getElementById(id).disabled=selected;const check=document.querySelector('[name="identifiedConfirmed"]');if(check)check.disabled=selected;};choice.addEventListener('change',update);update();
}
function nurseryFromYard(pigKey='',sowId=''){
 const pig=pigKey?N.pigs(state).find(p=>p.key===pigKey):null,sow=sowId?state.sows[sowId]:null;
 if(!pig&&!sow){toast('運動場の対象個体を確認してください');return;}
 const actual=pig||(N.pigs(state).find(p=>N.linked(p,state)?.id===sowId)),origin=N.latestOrigin(db,actual?.key||('sow-individual-'+sowId)),basis=db;
 const empty=state.nursery.filter(n=>n.state==='empty');
 const description=actual?individualName(actual):'母豚 '+sowId;
 form(description+' · 育成舎へ',`<p><b>${esc(description)} · 1頭</b></p><p>現在場所：運動場<br>誕生日：${esc(actual?.birthDate||sow?.birthDate||'未入力')}</p>${origin?`<p>記録された移動元 <b>${esc(origin.movement.from.name)}</b>へ戻します。</p><input type="hidden" name="nurseryKey" value="${esc(origin.nurseryKey)}">`:`<p>元の育成舎が記録されていないため、移動先を選んでください。</p><label for="nurseryDestination">移動先の育成舎</label><select id="nurseryDestination" name="nurseryKey" required><option value="">選択してください</option>${state.nursery.map(n=>`<option value="${n.key}" ${n.state==='empty'?'':'disabled'}>${esc(N.roomName(n))} · ${n.state==='empty'?'空き':n.state==='unknown'?'在室未確認':'使用中 '+(n.count??'未入力')+'頭'}</option>`).join('')}</select>${empty.length?'':'<p class="notice">育成舎に空きがありません。</p>'}`}<label class="individual-confirm"><input type="checkbox" name="returnConfirmed" value="yes" required>この個体1頭を育成舎へ戻すことを確認しました</label><p class="muted">母豚カードと過去の繁殖履歴は保持します。</p>`,'この1頭を戻す',f=>{
  if(db!==basis)throw Error('記録が更新されました。移動先を確認し直してください。');if(f.get('returnConfirmed')!=='yes')throw Error('対象個体を確認してください。');
  commitNurseryWork(d=>N.into(d,{...makeLog(N.TYPES[0],''),pigKey:actual?.key||pigKey,sowId:actual?'':sowId,nurseryKey:String(f.get('nurseryKey')||''),confirmed:true}));
 });
}
function nurseryYardIndividualCards(){const list=N.pigs(state).filter(p=>p.individualNumber&&!N.linked(p,state));return list.length?`<h2>運動場の個体管理 · ${list.length}頭</h2>${list.map(p=>`<article class="card nursery-individual-card"><h3>${esc(individualName(p))}</h3><p>育成母豚 · 現在場所：運動場<br>誕生日：${esc(p.birthDate||'未入力')}<br>母親番号：${esc(p.sowId||'未入力')}</p><button type="button" class="btn secondary" data-action="nursery-individual-in" data-pig="${esc(p.key)}">元の育成舎へ戻す</button>${giltYardAction(p)}</article>`).join('')}`:'';}
function nurseryIdentifiedSummary(n){return (n.identifiedIndividuals||[]).length?`<div class="nursery-identified"><b>個体確認済み（群の頭数に含む）</b>${n.identifiedIndividuals.map(p=>`<p>${esc(individualName(p))} · ${esc(p.birthDate||'誕生日未入力')}</p>`).join('')}</div>`:'';}
function nurserySowLocation(id){const n=N.inNursery(state,id);if(!n)return '';const p=(n.identifiedIndividuals||[]).find(p=>N.linked(p,state)?.id===id);return `<div class="notice">現在場所：${esc(N.roomName(n))}<button type="button" class="btn secondary" data-action="nursery-individual-out" data-id="${n.key}" data-pig="${esc(p.key)}">この個体を運動場へ</button></div>`;}
function nurseryReturnSowButton(id){const s=state.sows[id];return s?.active&&!N.inNursery(state,id)&&!state.rooms.some(r=>['family','waiting'].includes(r.state)&&r.sowId===id)?`<button type="button" class="btn secondary" data-action="nursery-sow-in" data-id="${esc(id)}">育成舎へ戻す（個体1頭）</button>`:'';}
function nurseryMovementLog(l){const cancelled=!!l.undoOf||db.logs.some(x=>x.undoOf===l.key);form(l.undoOf?'個体移動取消':'個体の移動',`<p>${esc(individualName(l.individual))}</p><p>${esc(l.movement.from.name)} → ${esc(l.movement.to.name)}<br>1頭</p><p>${esc(l.t?new Date(l.t).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):l.date)}</p><p>誕生日：${esc(l.individual.birthDate||'未入力')}<br>${cancelled?'移動取消の記録あり':'移動済み'}</p>`,'閉じる',()=>{});}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action="nursery-individual-out"],[data-action="nursery-individual-in"],[data-action="nursery-sow-in"]');if(!b||fatal)return;try{if(b.dataset.action==='nursery-individual-out')nurseryToYard(b.dataset.id,b.dataset.pig||'');else nurseryFromYard(b.dataset.pig||'',b.dataset.action==='nursery-sow-in'?b.dataset.id:'');}catch(err){toast(err.message);}});
