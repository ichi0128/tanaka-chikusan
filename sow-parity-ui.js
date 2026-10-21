'use strict';
let sowParitySelection=new Map();
function sowParityCard(s){
  const pages=TanakaSowParity.pages(db,s.id),key=sowParitySelection.get(s.id),index=Math.max(0,pages.findIndex(p=>p.key===key)),p=pages[index];
  if(!p)return '';
  const label=s.giltRegistration&&p.parity===0?'初':p.parity===null?'産次未入力':p.parity+'産目';
  return `<h2>母豚カード</h2><div class="sow-parity-navigation" aria-label="産次の切り替え"><button type="button" data-action="parity-page" data-id="${esc(s.id)}" data-key="${esc(pages[index+1]?.key||'')}" aria-label="前の産次" ${index+1>=pages.length?'disabled':''}>‹</button><div><strong>${esc(label)}</strong><small>${index===0?(p.awaitingMating?'次回の種付け待ち':'最新のカード'):'過去のカード · 閲覧専用'}</small></div><button type="button" data-action="parity-page" data-id="${esc(s.id)}" data-key="${esc(pages[index-1]?.key||'')}" aria-label="次の産次" ${index===0?'disabled':''}>›</button></div>${sowCardMarkup(s,p.card,label,true)}<div class="card sow-parity-birth"><div class="row"><span>分娩日</span><b>${esc(p.card.birthDateActual||'')}</b></div><div class="row"><span>離乳日</span><b>${esc(p.card.weanDateActual||'')}</b></div>${p.card.birthNote?`<p class="history-note">分娩メモ：${esc(p.card.birthNote)}</p>`:''}${p.card.weanNote?`<p class="history-note">離乳メモ：${esc(p.card.weanNote)}</p>`:''}</div><button type="button" class="btn secondary" data-action="parity-edit" data-id="${esc(s.id)}" data-key="${esc(p.key)}">${index===0?'この産次のカードを編集':'この過去カードを修正'}</button>${index===0&&!p.awaitingMating&&!s.numberPending?`<button type="button" class="btn secondary" data-action="parity-start" data-id="${esc(s.id)}">新しい産次を開始</button>`:''}${p.revisions?.length?`<details class="card"><summary>カード修正前の記録（${p.revisions.length}件）</summary>${p.revisions.map(x=>`<p>${esc(x.savedAt)}</p><dl>${[...cardFields,['birthDateActual','分娩日'],['weanDateActual','離乳日']].map(([k,label])=>`<dt>${esc(label)}</dt><dd>${esc(x.card[k]??'')}</dd>`).join('')}</dl>`).join('')}</details>`:''}<p class="muted">記録のない項目は空欄です。過去カードの修正は各豚舎の現在データへ反映しません。</p>`;
}
function editParityCard(id,key){
  const p=TanakaSowParity.pages(db,id).find(p=>p.key===key);if(!p)return;
  const expected=JSON.stringify(p),card=p.card,rows=[...(card.history||[]),{date:'',event:'',boar:''}];
  form(sowIdentityLabel(id)+' · '+(p.parity===0&&state.sows[id].giltRegistration?'初':(p.parity??'未入力')+'産目')+'を編集',`<p class="muted">この産次のカードだけを修正し、変更前を履歴に残します。作業履歴・各豚舎の現在データは変更しません。</p>${cardFields.map(([k,label])=>k==='mother'?sowNumberSelect('card_'+k,card[k]??'',{label}):field('card_'+k,label,card[k]??'')).join('')}${field('card_birthDateActual','分娩日',card.birthDateActual||'','date')}${field('card_weanDateActual','離乳日',card.weanDateActual||'','date')}<h3>元カードの過去履歴</h3>${rows.map((r,i)=>`<fieldset><legend>履歴 ${i+1}</legend>${field('history_date_'+i,'月日',r.date)}${field('history_event_'+i,'内容',r.event)}${field('history_boar_'+i,'種豚',r.boar||'')}</fieldset>`).join('')}`,'修正を保存',f=>{
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

const SOW_HISTORY_COLUMNS=[['parity','産','産次'],['mating','種付','種付日'],['due','予定','分娩予定日'],['birthDateActual','分娩','実分娩日'],['birthCount','出','出産頭数'],['weanDateActual','離乳','離乳日'],['weanCount','離','離乳頭数']];
function sowHistoryDate(value){const text=String(value??''),match=/^(?:\d{4}[-/])?(\d{1,2})[-/](\d{1,2})$/.exec(text);return match?Number(match[1])+'/'+Number(match[2]):text||'—';}
function sowHistoryLabel(p){return p.parity===0?'初':p.parity??'—';}
function sowHistoryTable(s){
  const rows=TanakaSowParity.historyRows(db,s.id);
  const cell=(p,name,label)=>`<button type="button" data-action="parity-history-cell" data-id="${esc(s.id)}" data-key="${esc(p.key)}" data-field="${name}" aria-label="${esc(sowIdentityLabel(s.id))}・${esc(sowHistoryLabel(p))}産・${label}を編集" title="${esc((name==='parity'?p.parity:p.card[name])??'未入力')}">${esc(name==='parity'?sowHistoryLabel(p):name.endsWith('Count')?(p.card[name]??'—'):sowHistoryDate(p.card[name]))}${name==='parity'&&p.card.notebookSource?.needsReview?'<small class="sow-history-review">要確認</small>':''}</button>`;
  return `<h2>母豚 ${esc(sowIdentityLabel(s.id))} · 分娩履歴</h2><p class="muted sow-history-hint">各セルをタップして、その項目を修正できます。</p><table class="sow-history-table"><colgroup><col class="history-parity"><col><col><col><col class="history-heads"><col><col class="history-heads"></colgroup><thead><tr>${SOW_HISTORY_COLUMNS.map(([,short,label])=>`<th scope="col" title="${label}">${short}</th>`).join('')}</tr></thead><tbody>${rows.map(p=>`<tr data-parity-row="${esc(p.key)}">${SOW_HISTORY_COLUMNS.map(([name,,label])=>name==='parity'?`<th scope="row">${cell(p,name,label)}</th>`:`<td>${cell(p,name,label)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="muted sow-history-hint">出＝出産頭数、離＝離乳頭数。実績未記録は —。表の修正は各豚舎の現在頭数を変更しません。</p><details class="card"><summary>授乳日数・里子・備考などの詳細</summary>${rows.map(p=>`<button type="button" class="btn secondary" data-action="parity-history-details" data-id="${esc(s.id)}" data-key="${esc(p.key)}">${esc(sowHistoryLabel(p))}産の詳細</button>`).join('')}</details>${s.active&&!s.numberPending&&!TanakaSowParity.pages(db,s.id)[0]?.awaitingMating?`<button type="button" class="btn secondary" data-action="parity-start" data-id="${esc(s.id)}">新しい産次を開始</button>`:''}`;
}
function editSowHistoryCell(id,key,name){
  const column=SOW_HISTORY_COLUMNS.find(c=>c[0]===name),p=TanakaSowParity.pages(db,id).find(p=>p.key===key);if(!p||!column)return;
  const expected=JSON.stringify(p),count=name==='parity'||name.endsWith('Count');
  form(sowIdentityLabel(id)+'・'+sowHistoryLabel(p)+'産・'+column[2]+'を編集',field('historyValue',column[2],(name==='parity'?p.parity:p.card[name])??'',count?'number':'text')+(count?'':'<p class="muted">例：4/4 または 2026-04-04。年が分からない場合は月日だけで保存できます。</p>'),'保存',f=>save(d=>TanakaSowParity.editHistory(d,id,key,{[name]:f.get('historyValue')},expected)));
}
function sowHistoryDetails(id,key){
  const p=TanakaSowParity.pages(db,id).find(p=>p.key===key);if(!p)return;const c=p.card,expected=JSON.stringify(p),nursing=/^\d{4}-\d{2}-\d{2}$/.test(c.birthDateActual||'')&&/^\d{4}-\d{2}-\d{2}$/.test(c.weanDateActual||'')?Math.round((Date.parse(c.weanDateActual)-Date.parse(c.birthDateActual))/86400000):null;
  const counts=[['nursingDays','授乳日数（手入力）'],['foster','里子'],['fosterOut','里子出'],['fosterIn','里子入'],['blackPiglets','黒子'],['crushed','圧死'],['weakDeaths','弱死'],['stillborn','死産']];
  const legacy=(!c.birthDateActual&&c.result||!c.weanDateActual&&c.wean)?`<p class="muted">元カードの前回成績：${esc(c.result||'—')} ／ 前回離乳：${esc(c.wean||'—')}<br>今回の実績欄には自動で転記していません。</p>`:'';
  form('母豚 '+sowIdentityLabel(id)+' · '+sowHistoryLabel(p)+'産 詳細',`${nursing!==null&&nursing>=0?`<p>分娩日〜離乳日：${nursing}日</p>`:''}${counts.map(([name,label])=>field(name,label,c[name]??'','number')).join('')}${field('birthNote','分娩メモ',c.birthNote||'')}${field('weanNote','離乳メモ',c.weanNote||'')}${field('note','備考',c.note||'')}${legacy}${sowNotebookSourceDetails(c)}${c.history?.length?`<details><summary>元カードの記録</summary>${c.history.map(h=>`<p>${esc(h.date)} ${esc(h.event)} ${esc(h.boar||'')}</p>`).join('')}</details>`:''}<button type="button" class="btn secondary" data-action="parity-edit" data-id="${esc(id)}" data-key="${esc(key)}">この産次のその他の項目を編集</button>${p.revisions?.length?`<details><summary>修正前の記録（${p.revisions.length}件）</summary>${p.revisions.map(x=>`<p>${esc(x.savedAt)}</p><dl>${[...SOW_HISTORY_COLUMNS.map(([k,,label])=>[k,label]),...counts,['birthNote','分娩メモ'],['weanNote','離乳メモ'],['note','備考']].map(([k,label])=>`<dt>${label}</dt><dd>${esc(x.card[k]??'—')}</dd>`).join('')}</dl>`).join('')}</details>`:''}`,'保存',f=>{const patch=Object.fromEntries([...counts.map(([k])=>k),'birthNote','weanNote','note'].map(k=>[k,f.get(k)]));save(d=>TanakaSowParity.editHistory(d,id,key,patch,expected));});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action="parity-history-cell"],[data-action="parity-history-details"]');if(!b)return;try{if(b.dataset.action==='parity-history-cell')editSowHistoryCell(b.dataset.id,b.dataset.key,b.dataset.field);else if(b.dataset.action==='parity-history-details')sowHistoryDetails(b.dataset.id,b.dataset.key);}catch(err){toast(err.message);}});

function sowNotebookSourceDetails(card){const s=card.notebookSource;if(!s)return '';return `<details class="notebook-source"><summary>${s.needsReview?'要確認 · ':''}分娩ノートの原文・判読メモ</summary><p>${esc(s.page)} · ${esc(s.photo)} · ${esc(s.line)}行目</p><p>種雄：${esc(card.boar||'—')} ／ 分娩時刻：${esc(card.birthTime||'—')} ／ 耳標：${esc(card.earTag||'—')}</p>${(s.reviewNotes||[]).map(x=>`<p>${esc(x)}</p>`).join('')}<dl>${Object.entries(s.raw||{}).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v??'—')}</dd>`).join('')}</dl>${Object.keys(s.alternateReading||{}).length?`<h3>要確認シートの異なる原文</h3><dl>${Object.entries(s.alternateReading).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v??'—')}</dd>`).join('')}</dl>`:''}</details>`;}
