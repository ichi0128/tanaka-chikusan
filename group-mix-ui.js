'use strict';
const GroupMix=TanakaGroupMix;
function mixPlace(t){const r=(t.area==='nursery'?state.nursery:state.finishing).find(r=>r.key===t.key);return t.area==='nursery'?N.roomName(r||{key:t.key}):finishingPlace(t.key);}
function mixGroupText(t,r=t.group||t.before){return mixPlace(t)+' · '+r.count+'頭 · '+(r.mixed?'混成':'母 '+(r.sowId||'未入力'))+' · '+(r.birthDate||'誕生日未入力');}
function mixButton(area,key){return `<button type="button" class="btn secondary" data-mix="open" data-area="${area}" data-id="${esc(key)}">混ぜる</button>`;}
function mixRecordLabel(l){return l.mix.patches.map(p=>mixPlace(p)).join('＋')+' → '+mixPlace(l.mix.patches.find(p=>GroupMix.token(p)===l.mix.destination));}
function checkMixDraft(){if(inventoryDrafts.get(today().slice(0,7))?.dirty)throw Error('頭数調べの入力を保存してから操作してください。');}
function mixFeedback(l,text){showWorkAction(l,text);const host=document.getElementById('work-feedback');host.innerHTML=`<span>${esc(simulation?'【仮データ】'+text:text)}</span>${l.type==='豚群混合'&&!GroupMix.hasLaterWork(db,l)?`<button type="button" data-mix="undo" data-key="${esc(l.key)}">取り消す</button>`:''}<button type="button" data-action="work-dismiss">閉じる</button>`;}
function openMix(area,key){
 const a={area,key},current=GroupMix.eligible(db,a),basis=db,candidates=GroupMix.groups(db).filter(t=>GroupMix.token(t)!==GroupMix.token(a));
 form(mixPlace(a)+' · 混ぜる',`<p><b>${esc(mixGroupText(a,current))}</b></p><p>この群と混ぜる、ほかの既存グループを選んでください。</p>${candidates.length?`<label for="mixPartner">混ぜる相手</label><select id="mixPartner" name="mixPartner" required><option value="">選択してください</option>${candidates.map(t=>`<option value="${esc(GroupMix.token(t))}">${esc(mixGroupText(t))}</option>`).join('')}</select>`:'<p>混ぜられるほかの豚群がありません。</p>'}<p class="muted">育成舎・肉豚舎の群を扱います。個体管理中の豚は混ぜません。</p>`,candidates.length?'次へ':'閉じる',f=>{
  if(!candidates.length)return;if(db!==basis)throw Error('記録が更新されています。選び直してください。');const b=candidates.find(t=>GroupMix.token(t)===f.get('mixPartner'));if(!b)throw Error('混ぜる相手を選んでください。');GroupMix.eligible(db,b);setTimeout(()=>mixSettings({a,b:{area:b.area,key:b.key}},basis),0);
 });
}
function mixSettings(pair,basis,original=null){
 if(db!==basis)throw Error('記録が更新されています。開き直してください。');
 const patches=original?.mix.patches||[pair.a,pair.b].map(t=>({...t,before:GroupMix.eligible(db,t)})),destination=pair.destination||original?.mix.destination||GroupMix.token(pair.a),current=patches.find(p=>GroupMix.token(p)===destination),later=original&&GroupMix.hasLaterWork(db,original),weight=pair.weight??(original?current.after.weight:Math.min(...patches.map(p=>p.before.weight??30)));
 form(original?'混合記録を編集':'まとめ先を選択',`${patches.map(p=>`<p>${esc(mixGroupText(p))}</p>`).join('')}<label for="mixDestination">まとめる部屋</label><select id="mixDestination" name="mixDestination" ${later?'disabled':''}>${patches.map(p=>`<option value="${esc(GroupMix.token(p))}" ${GroupMix.token(p)===destination?'selected':''}>${esc(mixPlace(p))}</option>`).join('')}</select>${field('mixDate','混ぜた日',pair.date||original?.date||today(),'date',true)}${field('mixWeight','混ぜた後の体重（kg・10kg単位）',weight,'number',true)}<p class="muted">混成の誕生日は若い方を使います。豚熱は両方が済のときだけ済を引き継ぎます。育成母豚候補を含む場合は、候補の区分を保持します。</p>${later?'<p class="notice">混合後の作業があるため、日付・メモだけ修正できます。まとめ先をやり直す場合は、関連する後の作業を先に戻してください。</p>':''}${notes(pair.note??original?.note??'')}`,'次へ',f=>{
  if(db!==basis)throw Error('記録が更新されています。開き直してください。');const options={...pair,destination:later?destination:String(f.get('mixDestination')||''),date:String(f.get('mixDate')||''),weight:later?weight:Number(f.get('mixWeight')),note:String(f.get('note')||''),now:today(),expected:JSON.stringify(basis)};
  // Validate the same model operation before showing a reviewable result.
  const draft=M.clone(db),preview=original?GroupMix.edit(draft,original.key,options):GroupMix.prepare(draft,options);M.validate(draft);
  setTimeout(()=>mixConfirm(options,basis,preview,original),0);
 });document.getElementById('mixDate').max=today();if(later)document.getElementById('mixWeight').disabled=true;
}
function mixConfirm(options,basis,preview,original){
 const selected=preview.mix.patches.find(p=>GroupMix.token(p)===preview.mix.destination),empty=preview.mix.patches.find(p=>p!==selected);
 form(original?'混合記録の修正を確認':'混ぜる内容を確認',`${original&&GroupMix.hasLaterWork(db,original)?'<p class="notice">以下は混合した時点の内容です。今回は日付・メモだけを修正し、現在の配置・頭数は変えません。</p>':''}${preview.mix.patches.map(p=>`<p>${esc(mixGroupText(p))}</p>`).join('')}<p><b>${esc(mixPlace(selected))}：${selected.after.count}頭</b><br>${esc(mixPlace(empty))}：空き</p><p>誕生日：${esc(selected.after.birthDate||'未入力')}<br>区分：${esc(selected.after.kind)}<br>体重：${selected.after.weight}kg<br>豚熱：${selected.after.csf?'済':'未'}<br>混ぜた日：${esc(options.date)}</p><p><b>全豚舎の総頭数：変更なし</b></p><p class="muted">元の2群の誕生日・母豚番号・頭数は履歴に残します。</p>`,'確定する',()=>{
  if(db!==basis)throw Error('記録が更新されています。開き直してください。');checkMixDraft();let log;save(d=>{log=original?GroupMix.edit(d,original.key,options):GroupMix.create(d,options);});inventoryDrafts.delete(today().slice(0,7));mixFeedback(log,original?'混合記録を修正しました':mixPlace(selected)+'へ'+log.count+'頭をまとめました');
 });modal.insertAdjacentHTML('beforeend','<button type="button" class="btn secondary" id="mix-back">戻る</button>');document.getElementById('mix-back').onclick=()=>mixSettings(options,basis,original);
}
function openMixLog(key){
 const l=db.logs.find(l=>l.key===key&&l.type==='豚群混合');if(!l)throw Error('混合記録が見つかりません。');const cancelled=GroupMix.cancelled(db,key);
 form('混合の記録',`<p>${esc(l.date)} · ${l.count}頭${cancelled?' · 取消済み':''}</p>${l.mix.patches.map(p=>`<p>${esc(mixGroupText(p))}</p>`).join('')}<p>まとめ先：${esc(mixPlace(l.mix.patches.find(p=>GroupMix.token(p)===l.mix.destination)))}</p><p class="history-note">${esc(l.note||'')}</p>${!cancelled?`<button type="button" class="btn secondary" data-mix="edit" data-key="${esc(key)}">この混合記録を編集</button><button type="button" class="btn secondary" data-mix="undo" data-key="${esc(key)}">混合を取り消す</button>`:''}${l.revisions?.length?`<details><summary>修正前の記録（${l.revisions.length}件）</summary>${l.revisions.map(r=>`<p>${esc(r.date)} · ${esc(mixRecordLabel(r))}<br>${esc(r.note||'')}</p>`).join('')}</details>`:''}`,'閉じる',()=>{});document.querySelector('#form button[type="submit"]')?.setAttribute('hidden','');
}
function undoMix(key){const basis=db;form('混合を取り消す','<p>元の2部屋へ、頭数・誕生日・母豚番号・豚熱・体重を戻します。混合の記録は取消済みとして残します。</p><p class="muted">その後に移動などを行っている場合は、関連する後の作業を先に戻してください。</p>','取り消す',()=>{if(db!==basis)throw Error('記録が更新されています。開き直してください。');checkMixDraft();save(d=>GroupMix.undo(d,key,{date:today(),expected:JSON.stringify(basis)}));inventoryDrafts.delete(today().slice(0,7));hideWorkAction();});}
document.addEventListener('click',e=>{const b=e.target.closest('[data-mix]');if(!b||fatal)return;try{const action=b.dataset.mix,key=b.dataset.key;if(action==='open')openMix(b.dataset.area,b.dataset.id);else if(action==='undo')undoMix(key);else if(action==='edit'){const l=db.logs.find(l=>l.key===key&&l.type==='豚群混合');if(!l||GroupMix.cancelled(db,key))throw Error('この混合記録は編集できません。');const [a,c]=l.mix.patches;mixSettings({a:{area:a.area,key:a.key},b:{area:c.area,key:c.key}},db,l);}else openMixLog(key);}catch(err){toast(err.message);}});
