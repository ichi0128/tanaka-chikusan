'use strict';
function sowIdentityLabel(id){const s=state.sows[id];return s?.numberPending?s.giltRegistration.label:id;}
function yardGiltList(){return Object.values(state.sows).filter(s=>s.active&&TanakaGilts.isGilt(s)&&!TanakaNurseryYard.inNursery(state,s.id)&&!state.rooms.some(r=>['family','waiting'].includes(r.state)&&r.sowId===s.id)).sort((a,b)=>(a.giltRegistration?.label||a.id).localeCompare(b.giltRegistration?.label||b.id,'ja',{numeric:true}));}
function giltCards(){return '<p class="muted">育成母豚カードは母豚の並びの右端です。正式な母豚番号は初回の種付けと一緒に登録します。</p><button type="button" class="btn secondary" data-action="page" data-id="finishing">運動場の個体を確認</button>';}
function giltYardAction(p){const s=Object.values(state.sows).find(s=>s.giltRegistration?.yardPigKey===p.key);return s?`<button type="button" class="btn secondary" data-action="detail" data-id="${esc(s.id)}">${TanakaGilts.isGilt(s)?'育成母豚 '+(s.numberPending?'':esc(s.id)+' ')+'のカードを開く':'母豚 '+esc(s.id)+' のカードを開く'}</button>`:`<button type="button" class="btn secondary" data-gilt="create" data-pig="${esc(p.key)}">育成母豚カードを作成</button>`;}
function editGiltProfile(id='',pigKey=''){
  const s=id?state.sows[id]:null,p=pigKey?F.yardState(state.finishing.find(r=>r.key==='yard')).individuals.find(p=>p.key===pigKey):null;
  if(pigKey&&!p)throw Error('運動場の個体が見つかりません。');
  const mother=s?.parityCards?.current.card.mother??s?.cardBaseline?.mother??((p?.sowId==='混成'?'':p?.sowId)||'');
  form(s?'育成母豚の個体情報':'番号未設定の育成母豚カードを作成',`<p class="muted">母豚番号は未設定のまま保存します。カードの産歴・出産数は「初」で表示します。${p?'運動場のこの1頭にカードを紐付けます。':''}</p>${field('giltLabel','見分け用の呼び名（母豚番号とは別）',s?.giltRegistration.label||TanakaGilts.nextLabel(db))}${field('birthDate','生年月日（分かる場合）',s?.birthDate||p?.birthDate||'','date')}${p&&!p.birthDate&&F.yardBirthMonth(p)?`<p class="muted">誕生月：${F.yardBirthMonth(p)}月（日付が不明でも保存できます）</p>`:''}${sowNumberSelect('mother',mother,{label:'母親番号（不明なら未選択）'})}${notes(s?.note||p?.note||'')}`,'保存する',f=>{
    const values={label:String(f.get('giltLabel')||'').trim(),birthDate:String(f.get('birthDate')||''),mother:String(f.get('mother')||''),note:String(f.get('note')||'')};let target=id;
    save(d=>{if(id)TanakaGilts.update(d,id,values,today());else target=TanakaGilts.create(d,values,today(),pigKey);});go('detail',target);
  });
}
function assignGiltNumber(id){
  const s=state.sows[id];if(!s?.numberPending)return;
  if(TanakaNurseryYard.inNursery(state,id))throw Error('運動場へ移動してから種付けを登録してください。');
  const basis=db,session=dataSession;
  form(s.giltRegistration.label+' · 初回の種付け',`<p>正式番号と初回の種付けを一緒に保存します。親番号・誕生日・カードの記録は引き継ぎます。</p>${field('officialNumber','正式な母豚番号','','text',true)}${field('date','種付け日',today(),'date',true)}<label for="giltBoar">使用した種豚</label><select name="boar" id="giltBoar" required><option value="">選択してください</option>${M.activeBoars(db).map(b=>`<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('')}</select>`,'番号と種付けを保存',f=>{
    if(db!==basis||dataSession!==session)throw Error('記録が更新されました。開き直してください。');
    const number=String(f.get('officialNumber')||'').trim(),date=String(f.get('date')||''),boar=String(f.get('boar')||'');
    if(!TanakaForecast.valid(date))throw Error('種付け日を確認してください。');
    if(!M.activeBoars(db).some(b=>b.name===boar))throw Error('使用した種豚を選んでください。');
    save(d=>{TanakaGilts.assign(d,id,number,date);const l={...makeLog('種付け',number),date,boar,remating:false};TanakaSowParity.beforeRecord(d,number,l);d.logs.push(l);});go('detail',number);
  });
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-gilt]');if(!b||fatal)return;try{if(b.dataset.gilt==='create')editGiltProfile('',b.dataset.pig||'');if(b.dataset.gilt==='assign')assignGiltNumber(b.dataset.id);if(b.dataset.gilt==='note')record('追記',b.dataset.id);}catch(err){toast(err.message);}});
