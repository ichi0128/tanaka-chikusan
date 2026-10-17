'use strict';
function sowIdentityLabel(id){const s=state.sows[id];return s?.numberPending?'番号未設定（'+s.giltRegistration.label+'）':id;}
function giltCards(){const list=Object.values(state.sows).filter(s=>s.numberPending);return `<h2>番号未設定の育成母豚 <span class="badge">${list.length}頭</span></h2><p class="muted">約7か月でカードを作成し、初回の種付け時に正式番号を登録します。</p><button type="button" class="btn secondary" data-gilt="create">＋ 番号未設定のカードを作成</button><div class="sow-cards">${list.map(s=>`<button class="sow-card-link" data-action="detail" data-id="${esc(s.id)}">${sowCardMarkup(s)}</button>`).join('')||'<p class="muted">番号未設定のカードはありません。</p>'}</div>`;}
function giltYardAction(p){const s=Object.values(state.sows).find(s=>s.giltRegistration?.yardPigKey===p.key);return s?`<button type="button" class="btn secondary" data-action="detail" data-id="${esc(s.id)}">${s.numberPending?'育成母豚カードを開く':'母豚 '+esc(s.id)+' のカードを開く'}</button>`:`<button type="button" class="btn secondary" data-gilt="create" data-pig="${esc(p.key)}">育成母豚カードを作成</button>`;}
function editGiltProfile(id='',pigKey=''){
  const s=id?state.sows[id]:null,p=pigKey?F.yardState(state.finishing.find(r=>r.key==='yard')).individuals.find(p=>p.key===pigKey):null;
  if(pigKey&&!p)throw Error('運動場の個体が見つかりません。');
  const mother=s?.parityCards?.current.card.mother??s?.cardBaseline?.mother??((p?.sowId==='混成'?'':p?.sowId)||'');
  form(s?'育成母豚の個体情報':'番号未設定の育成母豚カードを作成',`<p class="muted">母豚番号は未設定のまま保存します。カードの産歴・出産数は「初」で表示します。${p?'運動場のこの1頭にカードを紐付けます。':''}</p>${field('giltLabel','見分け用の呼び名（母豚番号とは別）',s?.giltRegistration.label||'')}${field('birthDate','生年月日（分かる場合）',s?.birthDate||p?.birthDate||'','date')}${p&&!p.birthDate&&F.yardBirthMonth(p)?`<p class="muted">誕生月：${F.yardBirthMonth(p)}月（日付が不明でも保存できます）</p>`:''}${sowNumberSelect('mother',mother,{label:'母親番号（不明なら未選択）'})}${notes(s?.note||p?.note||'')}`,'保存する',f=>{
    const values={label:String(f.get('giltLabel')||'').trim(),birthDate:String(f.get('birthDate')||''),mother:String(f.get('mother')||''),note:String(f.get('note')||'')};let target=id;
    save(d=>{if(id)TanakaGilts.update(d,id,values,today());else target=TanakaGilts.create(d,values,today(),pigKey);});go('detail',target);
  });
}
function assignGiltNumber(id){
  const s=state.sows[id];if(!s?.numberPending)return;
  form('正式な母豚番号を登録',`<p>${esc(s.giltRegistration.label)}のカードを現役母豚へ引き継ぎます。</p><p class="muted">入力済みの内容・母系・誕生日はそのまま残します。登録後に「作業・追記」から初回の種付けを記録してください。</p>${field('officialNumber','母豚番号','','text',true)}`,'番号を登録',f=>{const number=String(f.get('officialNumber')||'').trim();save(d=>TanakaGilts.assign(d,id,number,today()));go('detail',number);});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-gilt]');if(!b||fatal)return;try{if(b.dataset.gilt==='create')editGiltProfile('',b.dataset.pig||'');if(b.dataset.gilt==='assign')assignGiltNumber(b.dataset.id);if(b.dataset.gilt==='note')record('追記',b.dataset.id);}catch(err){toast(err.message);}});
