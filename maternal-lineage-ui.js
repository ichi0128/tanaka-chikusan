'use strict';
let maternalSeedPromise=null,maternalInitializationQueued=false,maternalInitializationError='';
function queueMaternalInitialization(){
  if(db.maternalLineage!==undefined||maternalInitializationQueued)return;
  maternalInitializationQueued=true;
  maternalSeedPromise=maternalSeedPromise||fetch('maternal-lineage-seed.json').then(r=>{if(!r.ok)throw Error('初期データを取得できません。通信を確認してください。');return r.json();});
  maternalSeedPromise.then(seed=>{if(db.maternalLineage===undefined)save(d=>TanakaMaternal.initialize(d,seed));maternalInitializationError='';}).catch(err=>{maternalInitializationError=err.message;maternalSeedPromise=null;toast('系譜を保存できませんでした：'+err.message);if(page==='edit')render();}).finally(()=>{maternalInitializationQueued=false;});
}
function maternalStatus(node){return node.sow?(node.sow.numberPending?'育成・番号未設定':node.sow.active?'現役':'廃豚済み'):'過去・未登録';}
function maternalMarkup(roots,selectedId=''){
  const branch=n=>`<li>${n.sow?`<button type="button" class="lineage-node ${n.sow.numberPending?'pending':n.sow.active?'active':'retired'} ${n.id===selectedId?'lineage-selected':''}" data-maternal="card" data-id="${esc(n.id)}"><b>${esc(sowIdentityLabel(n.id))}</b><small>${maternalStatus(n)} ›</small></button>`:`<span class="lineage-node ancestor ${n.id===selectedId?'lineage-selected':''}"><b>${esc(sowIdentityLabel(n.id))}</b><small>${maternalStatus(n)}</small></span>`}${n.cycle?'<p class="error">親子関係の循環を確認してください。</p>':''}${n.children.length?`<ul>${n.children.map(branch).join('')}</ul>`:''}</li>`;
  return `<div class="maternal-tree lineage-scroll"><ul class="lineage-roots">${roots.map(branch).join('')}</ul></div>`;
}
function maternalTreeOverview(){return `<details class="card maternal-tree"><summary>母系家系図 <span class="muted">開く ›</span></summary><p class="muted">現役は緑色、廃豚済み・過去の個体も残します。</p>${maternalMarkup(TanakaMaternal.forest(db))}<button type="button" class="btn secondary" data-maternal="settings">系譜を管理</button></details>`;}
function maternalCardButton(id){return `<button type="button" class="btn secondary" data-maternal="open" data-id="${esc(id)}" ${db.maternalLineage===undefined?'disabled':''}>系譜を開く</button>`;}
function openMaternalFamily(id){
  const roots=TanakaMaternal.forest(db,id),parent=TanakaMaternal.rows(db).find(x=>x.sowId===id)?.motherId||'';
  modal.innerHTML=`<h2>母豚 ${esc(sowIdentityLabel(id))}の母系</h2><p class="muted">系譜上の母：${esc(parent?sowIdentityLabel(parent):'未登録（系譜の起点）')}<br>現役は緑色で表示。対象の母豚は枠を強調しています。</p>${maternalMarkup(roots,id)}<button type="button" class="btn secondary" data-maternal="settings">系譜を管理・修正</button><button type="button" class="btn secondary" data-action="close">閉じる</button>`;
  if(!dlg.open)dlg.showModal();
}
function maternalSettings(){
  if(!db.maternalLineage)return `<section><h2>母系系譜</h2><p class="muted">${esc(maternalInitializationError||'系譜データを準備しています。')}</p>${maternalInitializationError?'<button type="button" class="btn secondary" data-maternal="retry">系譜データを再読み込み</button>':''}</section>`;
  const rows=TanakaMaternal.rows(db).sort((a,b)=>a.sowId.localeCompare(b.sowId,'ja',{numeric:true}));
  return `<details class="card" id="maternal-settings"><summary>母系系譜を管理</summary><p class="muted">母豚番号と母番号を紐付けて家系図を作ります。現役・廃豚の状態は母豚台帳から表示します。過去の個体は削除せず、親子関係を修正して残せます。</p><button type="button" class="btn secondary" data-maternal="add">系譜の個体を追加</button><div class="maternal-settings-list"><table><thead><tr><th>母豚番号</th><th>母番号</th><th>状態</th><th>操作</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${esc(sowIdentityLabel(r.sowId))}</th><td>${esc(r.motherId?sowIdentityLabel(r.motherId):'—')}</td><td>${esc(maternalStatus({sow:state.sows[r.sowId]}))}</td><td><button type="button" class="sowlink" data-maternal="edit" data-id="${esc(r.sowId)}">編集</button></td></tr>`).join('')}</tbody></table></div></details>`;
}
function editMaternalRelationship(id=''){
  const rows=TanakaMaternal.rows(db),stored=id?db.maternalLineage.relationships.find(r=>r.sowId===id):null,current=rows.find(r=>r.sowId===id),expected=JSON.stringify(stored||null);
  const options=rows.filter(r=>r.sowId!==id).sort((a,b)=>a.sowId.localeCompare(b.sowId,'ja',{numeric:true}));
  form(id?'系譜の親子関係を編集':'系譜の個体を追加',`<label for="lineage-sow">母豚番号（A58・伊佐68なども可）</label>${id&&state.sows[id]?.numberPending?`<p>${esc(sowIdentityLabel(id))}</p>`:''}<input ${id&&state.sows[id]?.numberPending?'type="hidden"':''} id="lineage-sow" name="sowId" value="${esc(id)}" maxlength="80" required ${id?'readonly':''}><label for="lineage-mother">母番号</label><select id="lineage-mother" name="motherId"><option value="">未選択（系譜の起点）</option>${options.map(r=>`<option value="${esc(r.sowId)}" ${r.sowId===current?.motherId?'selected':''}>${esc(sowIdentityLabel(r.sowId))}</option>`).join('')}</select><p class="muted">一覧にない母番号は、先に「系譜の個体を追加」で登録してください。この編集で頭数・産歴・各豚舎の記録は変更しません。</p>`,'保存する',f=>{
    const sowId=String(f.get('sowId')||'').trim(),motherId=String(f.get('motherId')||'').trim();save(d=>TanakaMaternal.set(d,sowId,motherId,expected));
  });
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-maternal]');if(!b||fatal)return;
  try{
    if(b.dataset.maternal==='open')openMaternalFamily(b.dataset.id);
    if(b.dataset.maternal==='card'){if(dlg.open)dlg.close();go('detail',b.dataset.id);}
    if(b.dataset.maternal==='settings'){if(dlg.open)dlg.close();go('edit');const details=document.getElementById('maternal-settings');if(details){details.open=true;details.scrollIntoView({block:'start'});}}
    if(b.dataset.maternal==='add')editMaternalRelationship();
    if(b.dataset.maternal==='edit')editMaternalRelationship(b.dataset.id);
    if(b.dataset.maternal==='retry'){maternalInitializationError='';render();}
  }catch(err){toast(err.message);}
});
window.addEventListener('load',()=>{
  if(typeof cloudStore==='undefined'||!cloudStore)return;
  const previous=cloudStore.onChange;let scheduled='';
  const syncInitial=()=>{const c=cloudStore;if(c.status!=='ready'||!c.user||!c.row||db.maternalLineage===undefined||c.row.data.maternalLineage!==undefined)return;const token=c.user.id+':'+c.row.id+':'+c.row.revision;if(scheduled===token)return;scheduled=token;c.localChanged();};
  cloudStore.onChange=function(...args){previous?.apply(this,args);syncInitial();};syncInitial();
});
