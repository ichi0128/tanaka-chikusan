'use strict';
function cullBadge(s){return s?.active&&s.cullCandidate?'<span class="badge orange sow-cull-badge">廃豚候補</span>':'';}
function cullButton(s){return s?.active?`<button type="button" class="btn secondary sow-cull-button" data-cull="open" data-id="${esc(s.id)}">${s.cullCandidate?'廃豚候補の操作':'廃豚候補にする'}</button>`:'';}
function cullRoomActions(r){return ['family','waiting'].includes(r.state)?cullBadge(state.sows[r.sowId])+cullButton(state.sows[r.sowId]):'';}
function openCulling(id){
 if(!id){form('廃豚候補にする母豚',sowSelect(''),'次へ',f=>setTimeout(()=>openCulling(f.get('id')),0));return;}
 const sow=state.sows[id];if(!sow?.active)throw Error('在籍中の母豚を選んでください。');
 const basis=db,session=dataSession,name=sowIdentityLabel(id);
 const check=()=>{if(db!==basis||dataSession!==session)throw Error('記録が更新されています。開き直してください。');};
 if(!sow.cullCandidate){form('母豚 '+name+' · 廃豚候補',`<p>母豚 <b>${esc(name)}</b>を廃豚候補にします。</p><p>候補の間は居場所・頭数を変えません。候補は後から解除できます。</p>`,'候補にする',()=>{check();save(d=>TanakaCulling.mark(d,{id,candidate:true,date:today()}));});return;}
 form('母豚 '+name+' · 廃豚確定',`<p><b>母豚 ${esc(name)}を廃豚にします。</b></p><p>実際に農場から出した後に確定してください。在籍頭数から1頭減らし、繁殖履歴は残します。</p>${state.rooms.some(r=>r.state==='family'&&r.sowId===id)?'<p>子豚はこの部屋に残し、頭数は変えません。</p>':''}<button type="button" class="btn secondary" id="cull-clear">候補を解除する</button>`,'廃豚を確定',()=>{
  check();const month=today().slice(0,7);if(inventoryDrafts.get(month)?.dirty)throw Error('頭数調べの入力を保存してから確定してください。');
  let log;save(d=>{log=TanakaCulling.finalize(d,{id,date:today(),expected:JSON.stringify(basis)});});inventoryDrafts.delete(month);showWorkAction(log,'母豚 '+name+'を廃豚にしました（履歴は保存）');
 });
 document.getElementById('cull-clear').onclick=()=>{try{check();save(d=>TanakaCulling.mark(d,{id,candidate:false,date:today()}));dlg.close();toast('廃豚候補を解除しました');}catch(err){document.getElementById('form-error').textContent=err.message;}};
}
function restoreCulledSow(id){const basis=db;form('母豚 '+sowIdentityLabel(id)+'を在籍に戻す','<p>廃豚確定を訂正し、運動場の在籍へ戻します。廃豚の履歴は残します。</p>','在籍に戻す',()=>{if(db!==basis)throw Error('記録が更新されています。開き直してください。');const month=today().slice(0,7);if(inventoryDrafts.get(month)?.dirty)throw Error('頭数調べの入力を保存してから復帰してください。');save(d=>TanakaCulling.restore(d,{id,date:today()}));inventoryDrafts.delete(month);});}
function cullingLog(log){form('廃豚の記録',`<p>母豚 ${esc(sowIdentityLabel(log.id))}</p><p>${esc(log.note||log.type)}</p><p class="muted">この記録は一括処理の履歴として保存されています。</p>`,'閉じる',()=>{});}
document.addEventListener('click',e=>{const b=e.target.closest('[data-cull="open"]');if(!b||fatal)return;try{openCulling(b.dataset.id);}catch(err){toast(err.message);}});
