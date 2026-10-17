'use strict';
let sowParitySelection=new Map();
function sowParityCard(s){
  const pages=TanakaSowParity.pages(db,s.id),key=sowParitySelection.get(s.id),index=Math.max(0,pages.findIndex(p=>p.key===key)),p=pages[index];
  if(!p)return '';
  const label=p.parity===null?'産次未入力':p.parity+'産目';
  return `<h2>母豚カード</h2><div class="sow-parity-navigation" aria-label="産次の切り替え"><button type="button" data-action="parity-page" data-id="${esc(s.id)}" data-key="${esc(pages[index+1]?.key||'')}" aria-label="前の産次" ${index+1>=pages.length?'disabled':''}>‹</button><div><strong>${esc(label)}</strong><small>${index===0?'最新のカード':'過去のカード · 閲覧専用'}</small></div><button type="button" data-action="parity-page" data-id="${esc(s.id)}" data-key="${esc(pages[index-1]?.key||'')}" aria-label="次の産次" ${index===0?'disabled':''}>›</button></div>${sowCardMarkup(s,p.card,label,true)}<div class="card sow-parity-birth"><div class="row"><span>分娩日</span><b>${esc(p.card.birthDateActual||'')}</b></div><div class="row"><span>離乳日</span><b>${esc(p.card.weanDateActual||'')}</b></div>${p.card.birthNote?`<p class="history-note">分娩メモ：${esc(p.card.birthNote)}</p>`:''}${p.card.weanNote?`<p class="history-note">離乳メモ：${esc(p.card.weanNote)}</p>`:''}</div><button type="button" class="btn secondary" data-action="parity-edit" data-id="${esc(s.id)}" data-key="${esc(p.key)}">${index===0?'この産次のカードを編集':'この過去カードを修正'}</button>${index===0?`<button type="button" class="btn secondary" data-action="parity-start" data-id="${esc(s.id)}">新しい産次を開始</button>`:''}${p.revisions?.length?`<details class="card"><summary>カード修正前の記録（${p.revisions.length}件）</summary>${p.revisions.map(x=>`<p>${esc(x.savedAt)}</p><dl>${[...cardFields,['birthDateActual','分娩日'],['weanDateActual','離乳日']].map(([k,label])=>`<dt>${esc(label)}</dt><dd>${esc(x.card[k]??'')}</dd>`).join('')}</dl>`).join('')}</details>`:''}<p class="muted">記録のない項目は空欄です。過去カードの修正は各豚舎の現在データへ反映しません。</p>`;
}
function editParityCard(id,key){
  const p=TanakaSowParity.pages(db,id).find(p=>p.key===key);if(!p)return;
  const expected=JSON.stringify(p),card=p.card,rows=[...(card.history||[]),{date:'',event:'',boar:''}];
  form('母豚 '+id+' · '+(p.parity??'未入力')+'産目を編集',`<p class="muted">この産次のカードだけを修正し、変更前を履歴に残します。作業履歴・各豚舎の現在データは変更しません。</p>${cardFields.map(([k,label])=>k==='mother'?sowNumberSelect('card_'+k,card[k]??'',{label}):field('card_'+k,label,card[k]??'')).join('')}${field('card_birthDateActual','分娩日',card.birthDateActual||'','date')}${field('card_weanDateActual','離乳日',card.weanDateActual||'','date')}<h3>元カードの過去履歴</h3>${rows.map((r,i)=>`<fieldset><legend>履歴 ${i+1}</legend>${field('history_date_'+i,'月日',r.date)}${field('history_event_'+i,'内容',r.event)}${field('history_boar_'+i,'種豚',r.boar||'')}</fieldset>`).join('')}`,'修正を保存',f=>{
    const next=M.clone(card);for(const [k] of cardFields){const value=String(f.get('card_'+k)||'').trim();if(['parity','reheatCount'].includes(k)&&value!==''&&!/^\d+$/.test(value))throw Error('産次・再発情回数は0以上の整数で入力してください。');next[k]=['parity','reheatCount'].includes(k)&&value!==''?Number(value):value;}
    checkMother(id,next.mother);
    next.birthDateActual=String(f.get('card_birthDateActual')||'');next.weanDateActual=String(f.get('card_weanDateActual')||'');
    next.history=rows.map((r,i)=>({...r,date:String(f.get('history_date_'+i)||'').trim(),event:String(f.get('history_event_'+i)||'').trim(),boar:String(f.get('history_boar_'+i)||'').trim()})).filter(r=>r.date||r.event||r.boar);
    if(next.history.some(r=>!r.date||!r.event))throw Error('履歴の月日と内容を入力してください。');
    save(d=>TanakaSowParity.edit(d,id,key,next,expected));
  });
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action^="parity-"]');if(!b)return;const id=b.dataset.id;
  try{
    if(b.dataset.action==='parity-page'){sowParitySelection.set(id,b.dataset.key);render();}
    if(b.dataset.action==='parity-edit')editParityCard(id,b.dataset.key);
    if(b.dataset.action==='parity-start'){
      const pages=TanakaSowParity.pages(db,id),expected=JSON.stringify(pages);
      form('新しい産次を開始',`<p>現在のカードを過去カードとして残し、次の産次を開始します。</p><p class="muted">種付け・分娩・離乳などは空欄から始めます。過去の記録は削除しません。</p>`,'次の産次を開始する',()=>{save(d=>TanakaSowParity.start(d,id,expected));sowParitySelection.delete(id);render();});
    }
  }catch(err){toast(err.message);}
});
