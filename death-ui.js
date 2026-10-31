'use strict';
const Deaths=TanakaDeaths;
function deathTargetLabel(t){
 const place=t.area==='farrowing'?TanakaSowWork.roomLocation(state.rooms.find(r=>r.key===t.key)).name:t.area==='nursery'?N.roomName(state.nursery.find(r=>r.key===t.key)):t.area==='finishing'?finishingPlace(t.key):t.area==='boar'?'種豚':'運動場';
 const who=t.sowId?(state.sows[t.sowId]?.numberPending?'育成母豚 ':'母豚 ')+sowIdentityLabel(t.sowId):t.boarId?M.boarRecords(db).find(b=>b.id===t.boarId)?.name:t.pigKey?'個体1頭':t.area==='farrowing'?'子豚':t.area==='nursery'?'豚群':'肉豚';
 return place+' · '+who+(t.sowId||t.boarId||t.pigKey?'':' '+t.count+'頭')+(t.birthDate?' · '+t.birthDate+'生':'');
}
function deathButton(token,label='死亡を記録'){return `<button type="button" class="btn secondary" data-death="open" data-target="${esc(token)}">${esc(label)}</button>`;}
function deathSummary(){
 const history=Deaths.history(db),year=today().slice(0,4);
 return `<section class="death-summary" aria-label="年別の死亡頭数"><h3>死亡記録</h3><p class="muted">死亡日を基準に集計します。取り消した記録は合計に含めません。</p>${Deaths.years(db,year).map(y=>`<details class="card"><summary><b>${y.year}年：${y.count}頭</b></summary>${history.filter(l=>l.date.startsWith(y.year+'-')).map(l=>`<button type="button" class="row row-action" data-death="detail" data-key="${esc(l.key)}"><span>${esc(l.date.replaceAll('-','/'))}${l.cancelled?' · 取消済み':''}<small class="muted">誕生日 ${esc(l.birthDate||'未入力')} ／ 母豚番号 ${esc(l.motherId||'なし')}</small></span><b>${l.count}頭</b></button>`).join('')||'<p class="empty">死亡記録はありません。</p>'}</details>`).join('')}${deathButton('','＋ 死亡を記録')}</section>`;
}
function checkDeathDraft(){if(inventoryDrafts.get(today().slice(0,7))?.dirty)throw Error('頭数調べの入力を保存してから操作してください。');}
function openDeath(token=''){
 if(!token){const list=Deaths.targets(db);form('死亡を記録する対象',list.length?`<label for="deathTarget">部屋・個体を選択</label><select id="deathTarget" name="deathTarget" required><option value="">選択してください</option>${list.map(t=>`<option value="${esc(t.token)}">${esc(deathTargetLabel(t))}</option>`).join('')}</select>`:'<p>対象の在籍個体・確定した頭数がありません。</p>',list.length?'次へ':'閉じる',f=>{if(list.length){const next=String(f.get('deathTarget')||'');if(!next)throw Error('対象を選択してください。');setTimeout(()=>{try{openDeath(next);}catch(e){toast(e.message);}},0);}});return;}
 const t=Deaths.target(db,token),basis=db,session=dataSession,single=!!(t.pigKey||t.sowId||t.boarId),label=deathTargetLabel(t);
 form('死亡を記録',`<p><b>${esc(label)}</b></p>${field('deathDate','死亡日',today(),'date',true)}${single?'<p>死亡頭数：1頭</p>':field('deathCount','死亡頭数',1,'number',true)}${t.birthDate?`<p>誕生日：${esc(t.birthDate)}</p>`:field('deathBirth','誕生日（不明なら空欄）','','date')}<p>母豚番号：${esc(t.motherId||'なし')}</p><p class="muted">確定すると死亡頭数だけ減らします。出荷・委託には含めません。${t.area==='finishing'&&Consignment.candidate(db,state,t.key)?'委託候補の指定は解除します。残った豚の候補は改めて指定してください。':''}</p>`,'死亡を確定',f=>{
  if(db!==basis||dataSession!==session)throw Error('記録が更新されています。開き直してください。');checkDeathDraft();let log;
  save(d=>{log=Deaths.finalize(d,{token,date:String(f.get('deathDate')||''),count:single?1:Number(f.get('deathCount')),birthDate:String(f.get('deathBirth')||''),now:today(),expected:JSON.stringify(basis)});});inventoryDrafts.delete(today().slice(0,7));
  showWorkAction(log,label+' · '+log.count+'頭の死亡を記録しました');
 });
 document.getElementById('deathDate').max=today();if(!single){document.getElementById('deathCount').min='1';document.getElementById('deathCount').max=String(t.count);}
}
function deathLog(key){const l=Deaths.history(db).find(l=>l.key===key);if(!l)throw Error('死亡記録が見つかりません。');form('死亡記録',`<p>死亡日：${esc(l.date)}<br>誕生日：${esc(l.birthDate||'未入力')}<br>死亡頭数：${l.count}頭<br>母豚番号：${esc(l.motherId||'なし')}</p>${l.id?'<p>対象：'+esc(sowIdentityLabel(l.id))+'</p>':''}${l.cancelled?'<p>死亡取消済み（年の合計には含めません）</p>':`<button type="button" class="btn secondary" data-death="undo" data-key="${esc(key)}">死亡記録を取り消す</button>`}`,'閉じる',()=>{});}
function undoDeath(key){const basis=db;form('死亡記録を取り消す','<p>死亡頭数を元の部屋・個体へ戻します。死亡記録は「取消済み」として残します。</p>','取り消す',()=>{if(db!==basis)throw Error('記録が更新されています。開き直してください。');checkDeathDraft();save(d=>Deaths.undo(d,key,{date:today()}));inventoryDrafts.delete(today().slice(0,7));hideWorkAction();});}
document.addEventListener('click',e=>{const b=e.target.closest('[data-death]');if(!b||fatal)return;try{if(b.dataset.death==='detail')deathLog(b.dataset.key);else if(b.dataset.death==='undo')undoDeath(b.dataset.key);else openDeath(b.dataset.target||'');}catch(err){toast(err.message);}});
