'use strict';
const Consignment=TanakaConsignment;
function consignmentBadge(roomKey,pigKey=''){const c=Consignment.candidate(db,state,roomKey,pigKey);return c?`<span class="badge orange consignment-badge">委託候補 ${c.count}頭${c.needsReview?'・頭数を確認':''}</span>`:'';}
function consignmentButton(roomKey,pigKey=''){
 if(!Consignment.eligible(state,roomKey,pigKey))return '';const c=Consignment.candidate(db,state,roomKey,pigKey);
 return `${consignmentBadge(roomKey,pigKey)}<button type="button" class="btn secondary" data-consignment="open" data-id="${esc(roomKey)}" data-pig="${esc(pigKey)}">${c?'委託候補の操作':'委託候補にする'}</button>`;
}
function consignmentHistory(){return `<button class="back" data-action="page" data-id="finishing">‹ 肉豚舎</button><h2>委託履歴</h2><p class="muted">委託した日付のみ。通常の出荷頭数には含めません。同じ日は1行で表示します。</p><div class="card">${(db.consignmentDates||[]).slice().sort().reverse().map(date=>`<div class="row"><time datetime="${esc(date)}">${esc(date.replaceAll('-','/'))}</time></div>`).join('')||'<p class="empty">委託履歴はありません。</p>'}</div>`;}
function openConsignment(roomKey,pigKey='',edit=false){
 const pig=Consignment.eligible(state,roomKey,pigKey);if(!pig)throw Error('肉豚の部屋・個体を選んでください。');
 const c=Consignment.candidate(db,state,roomKey,pigKey),basis=db,session=dataSession,check=()=>{if(db!==basis||dataSession!==session)throw Error('記録が更新されています。開き直してください。');};
 if(!c||edit){form(finishingPlace(roomKey)+' · 委託候補',`<p>委託候補の間は頭数を変えません。通常出荷とは分けて扱います。</p>${roomKey==='yard'?'<p>選んだ肉豚1頭を候補にします。</p>':field('consignmentCount','委託候補の頭数',Math.min(c?.count||1,pig.count),'number',true)}`,'候補にする',f=>{check();save(d=>Consignment.mark(d,{roomKey,pigKey,count:roomKey==='yard'?1:Number(f.get('consignmentCount'))}));});if(roomKey!=='yard'){document.getElementById('consignmentCount').min='1';document.getElementById('consignmentCount').max=String(pig.count);}return;}
 form(finishingPlace(roomKey)+' · 委託確定',`<p><b>委託候補 ${c.count}頭を委託として出します。</b></p>${field('consignmentDate','委託日（実際に出した日）',today(),'date',true)}<p>実際に出した後に確定してください。通常の出荷頭数・渡辺バーク向けの出荷計画には加算しません。</p>${c.needsReview?'<p class="error">現在頭数より候補が多いため、候補頭数を変更してください。</p>':''}<button type="button" class="btn secondary" id="consignment-clear">候補を解除する</button>${roomKey!=='yard'?'<button type="button" class="btn secondary" id="consignment-edit">候補頭数を変更</button>':''}`,'委託を確定',f=>{
  check();const date=String(f.get('consignmentDate')||'');if(!I.validDate(date)||date>today())throw Error('委託日を今日以前の日付で入力してください。');const month=today().slice(0,7);if(inventoryDrafts.get(month)?.dirty)throw Error('頭数調べの入力を保存してから確定してください。');save(d=>Consignment.finalize(d,{roomKey,pigKey,date,inventoryDate:today(),expected:JSON.stringify(basis)}));inventoryDrafts.delete(month);
 });
 document.getElementById('consignmentDate').max=today();
 document.getElementById('consignment-clear').onclick=()=>{try{check();save(d=>Consignment.clear(d,{roomKey,pigKey}));dlg.close();toast('委託候補を解除しました');}catch(err){document.getElementById('form-error').textContent=err.message;}};
 if(roomKey!=='yard')document.getElementById('consignment-edit').onclick=()=>openConsignment(roomKey,pigKey,true);
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-consignment]');if(!b||fatal)return;try{if(b.dataset.consignment==='history'){dlg.close();go('consignments');}else openConsignment(b.dataset.id,b.dataset.pig||'');}catch(err){toast(err.message);}});
