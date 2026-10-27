'use strict';
const F=TanakaFinishing;
let finishingMoveMode=false,finishingPreferred='',finishingPreferredPig='';
// Display labels follow the existing physical columns; room keys and card positions stay fixed.
const FINISHING_DISPLAY_COLUMNS=Object.freeze({left:[2,3,5,7,9,11,13,15,17,19,21,23],right:[1,4,6,8,10,12,14,16,18,20,22,24]});
function finishingRoomLabel(key){
  if(key==='yard')return '運動場';
  const n=Number(key.slice(1)),left=FINISHING_DISPLAY_COLUMNS.left.indexOf(n),right=FINISHING_DISPLAY_COLUMNS.right.indexOf(n);
  return left>=0?'左'+(left+1):right>=0?'右'+(right+1):key.slice(1);
}
function finishingPlace(key){return key==='yard'?'運動場':'肉豚舎 '+finishingRoomLabel(key)+'番';}
function finishingTotal(){return F.meatTotal(state)+simulationVirtualHeads('finishing');}
function finishing(){
  const occupiedRooms=state.finishing.filter(r=>r.key!=='yard'&&r.state==='occupied'),used=state.finishing.filter(r=>r.state==='occupied'),heads=finishingTotal(),candidates=occupiedRooms.filter(r=>r.kind==='育成母豚候補').reduce((n,r)=>n+r.count,0),gilts=used.flatMap(r=>r.key==='yard'?[{key:'yard',kind:'育成母豚',count:F.yardState(r).individuals.filter(p=>TanakaGilts.yardKind(p,state)==='育成母豚').length}].filter(r=>r.count):[]);
  const left=FINISHING_DISPLAY_COLUMNS.left,right=FINISHING_DISPLAY_COLUMNS.right;
  const card=(number,col,row)=>{
    if(number===null){if(col!==1||row!==1)return '';number='yard';}
    const r=state.finishing.find(r=>r.key===(number==='yard'?'yard':'f'+number)),occupied=r.state==='occupied',disabled=occupied&&finishingMoveMode;
    if(r.key==='yard')return `<button class="fin-card fin-yard ${occupied?'occupied':'vacant'}" style="grid-column:${col};grid-row:${row}" data-action="${occupied?'fin-detail':'fin-empty'}" data-id="yard" ${disabled?'disabled':''}><span class="fin-number">運動場</span>${occupied?`<div class="fin-primary"><strong class="fin-count"><span class="fin-count-number">${r.count}</span><small>頭</small></strong></div><span class="fin-birth">${r.birthDate?esc(monthDayText(r.birthDate))+'生':'誕生月日 未入力'}</span>`:'<span class="fin-empty-label">空き<br><small>タップして入室・移動</small></span>'}</button>`;
    return `<article class="fin-card ${occupied?'occupied':'vacant'} ${r.kind==='育成母豚候補'&&occupied?'gilt':''} ${disabled?'fin-disabled':''}" style="grid-column:${col};grid-row:${row}"><button type="button" class="fin-room-open" data-action="${occupied?'fin-detail':'fin-empty'}" data-id="${r.key}" ${disabled?'disabled':''} aria-label="${finishingPlace(r.key)} ${occupied?r.kind+' '+r.count+'頭 '+r.weight+'kg・詳細を開く':'空室・入室する'}"></button>${occupied?`${simulationGroupBadge('finishing',r.key)}<span class="fin-kind">${esc(r.kind)}</span>${consignmentBadge(r.key)}<div class="fin-primary"><strong class="fin-count"><span class="fin-count-number">${r.count}</span><small>頭</small></strong><div class="fin-inline-weight"><button type="button" data-action="fin-weight-inline" data-id="${r.key}" data-delta="-10" aria-label="${finishingPlace(r.key)}の体重を10kg減らす" ${disabled||r.weight<=0?'disabled':''}>−10</button><strong class="fin-weight" aria-label="重量の目安 ${r.weight}kg">${r.weight}<small>kg</small></strong><button type="button" data-action="fin-weight-inline" data-id="${r.key}" data-delta="10" aria-label="${finishingPlace(r.key)}の体重を10kg増やす" ${disabled?'disabled':''}>＋10</button></div></div><span class="fin-birth">${r.birthDate?esc(monthDayText(r.birthDate))+'生':'誕生月日 未入力'}</span><span>母 ${r.mixed?'混成':esc(r.sowId||'未入力')}</span><span class="fin-vaccine ${r.csf?'complete':''}">豚熱 ${r.csf?'済':'未'}</span>${r.note?`<span class="fin-note">${esc(r.note)}</span>`:''}`:'<span class="fin-empty-label">空室<br><small>タップして入室・移動</small></span>'}</article>`;
  };
  return simulationWaitingList('finishing')+`<div class="subhead"><h2>肉豚舎</h2><span class="badge">${occupiedRooms.length} / 24室 · ${heads}頭（運動場含む）</span></div>${candidates?`<p class="fin-gilt-summary">育成母豚候補 ${candidates}頭（上の肉豚頭数に含む・正式な育成母豚は運動場へ移してから）</p>`:''}${gilts.length?`<p class="fin-gilt-summary">育成母豚：${gilts.map(r=>(r.key==='yard'?'運動場':finishingRoomLabel(r.key)+'番')+' '+r.count+'頭').join(' ／ ')}</p>`:''}<button class="btn secondary" data-action="page" data-id="shipments">出荷履歴</button><button class="btn secondary" type="button" data-consignment="history">委託履歴</button><button class="btn secondary" data-action="fin-mode">${finishingMoveMode?'移動先選択を終了':'移動先を選ぶ'}</button><p class="muted">${finishingMoveMode?'移動先の空室をタップしてください。使用中の部屋は選択できません。':'体重は±10で変更。部屋をタップすると詳細を表示します。'}</p><section class="fin-yard-separate fin-yard-individuals" aria-label="運動場">${finishingYardList()}</section><div class="fin-east">東 ↑</div><div class="fin-side-headings"><b>左側</b><span>廊下</span><b>右側</b></div><div class="fin-map-wrap"><span class="fin-north">北</span><div class="fin-map fin-map-paired"><div class="fin-corridor" aria-hidden="true"></div>${Array.from({length:12},(_,i)=>`<div class="fin-corridor-number" style="grid-column:2;grid-row:${i+1}" aria-label="左右${i+1}番の廊下">${i+1}</div>`).join('')}${left.map((n,i)=>card(n,1,i+1)).join('')}${right.map((n,i)=>card(n,3,i+1)).join('')}</div><span class="fin-south">南</span></div><div class="fin-west">↓ 西</div>`;
}
// Shared native selectors for the live yard and its detached monthly snapshot.
function yardQuickFields(weight,birthMonth,attrs,label='運動場'){
  const weights=[...new Set([...Array.from({length:13},(_,i)=>(i+3)*10),...(weight!==null&&weight!==undefined?[weight]:[])])].sort((a,b)=>a-b);
  return `<div class="yard-quick-fields"><label><span>体重</span><select ${attrs.weight} aria-label="${esc(label)}の体重"><option value="">未入力</option>${weights.map(n=>`<option value="${n}" ${n===weight?'selected':''}>${n}kg</option>`).join('')}</select></label><span class="yard-quick-divider" aria-hidden="true">/</span><label><span>誕生月</span><select ${attrs.month} aria-label="${esc(label)}の誕生月"><option value="">未入力</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===birthMonth?'selected':''}>${i+1}月</option>`).join('')}</select></label></div>`;
}
function finishingYardList(){
  const yard=F.yardState(state.finishing.find(r=>r.key==='yard'));
  return `<div class="fin-yard-heading"><h3>運動場 <span class="badge">${yard.count?yard.count+'頭':'空き'}</span></h3><button type="button" class="btn secondary" data-action="fin-empty" data-id="yard">豚を移動して追加</button></div>${yard.count?`<div class="yard-quick-grid">${yard.individuals.map((p,i)=>`<article class="yard-quick-card" data-yard-pig="${esc(p.key)}"><small>1頭${TanakaGilts.yardKind(p,state)==='肉豚'?'':' · '+TanakaGilts.yardKind(p,state)}</small>${yardQuickFields(p.weight,F.yardBirthMonth(p),{weight:`data-yard-field="weight" data-pig="${esc(p.key)}"`,month:`data-yard-field="birthMonth" data-pig="${esc(p.key)}"`},'運動場 '+(i+1)+'頭目')}${TanakaGilts.yardKind(p,state)!=='肉豚'?giltYardAction(p):''}${consignmentButton('yard',p.key)}<details class="yard-quick-actions"><summary>移動・出荷など</summary><button type="button" class="btn secondary" data-action="nursery-individual-in" data-pig="${esc(p.key)}">育成舎へ戻す</button>${TanakaGilts.yardKind(p,state)==='肉豚'?giltYardAction(p):''}${TanakaGilts.yardKind(p,state)!=='母豚'?`<button type="button" class="btn secondary" data-action="fin-from" data-id="yard" data-pig="${esc(p.key)}">この個体を移動</button><button type="button" class="btn secondary" data-action="fin-ship" data-id="yard" data-pig="${esc(p.key)}">出荷</button>`:''}<button type="button" class="btn secondary" data-action="fin-yard-remove" data-pig="${esc(p.key)}">この個体を削除</button></details></article>`).join('')}</div>`:'<p class="empty">空き</p>'}<button type="button" class="btn secondary" data-action="fin-yard-add">1頭分を追加</button><p class="muted">枠内の体重・誕生月をタッチして選択すると保存します。</p>`;
}
function finishingYardWrite(before,individuals){
  const after=F.yardState({individuals});F.validIndividuals(after);
  save(d=>d.logs.push({...makeLog('肉豚舎更新',''),finishingKey:'yard',finishingBefore:before,finishingAfter:after,yardIndividuals:1}));
}
function finishingYardAdd(){
  const before=F.group(state.finishing.find(r=>r.key==='yard'));
  finishingYardWrite(before,[...before.individuals,F.yardPig({weight:null,birthMonth:null,birthDate:'',sowId:''},M.uid())]);
  if(dlg.open)dlg.close();toast('運動場に1頭分を追加しました');
}
function finishingYardRemove(pigKey){
  const before=F.group(state.finishing.find(r=>r.key==='yard'));
  if(!before.individuals.some(p=>p.key===pigKey))throw Error('運動場の個体が見つかりません。');
  if(!window.confirm('この個体を運動場から削除しますか？'))return;
  finishingYardWrite(before,before.individuals.filter(p=>p.key!==pigKey));
}
function finishingYardQuickChange(select){
  const before=F.group(state.finishing.find(r=>r.key==='yard')),pig=before.individuals.find(p=>p.key===select.dataset.pig),field=select.dataset.yardField;
  if(!pig||!['weight','birthMonth'].includes(field))throw Error('運動場の個体が変わりました。画面を開き直してください。');
  const value=select.value===''?null:Number(select.value);
  if(value!==null&&!Number.isSafeInteger(value))throw Error('選択した値を確認してください。');
  if(pig[field]===value)return;
  finishingYardWrite(before,before.individuals.map(p=>p.key===pig.key?{...p,[field]:value}:p));
  toast('運動場を保存しました');
}
document.addEventListener('change',e=>{
  if(!e.target.matches?.('[data-yard-field]'))return;
  try{finishingYardQuickChange(e.target);}catch(err){render();toast(err.message);}
});
function finishingYardDetail(pigKey){
  const pig=F.yardState(state.finishing.find(r=>r.key==='yard')).individuals.find(p=>p.key===pigKey);if(!pig)throw Error('運動場の個体が見つかりません。');
  modal.innerHTML=`<h2>運動場 · 1頭</h2><p>体重：${pig.weight===null?'未入力':pig.weight+'kg'}<br>誕生日：${esc(pig.birthDate||'未入力')}<br>母豚番号：${esc(pig.sowId||'未入力')}</p><button class="btn" data-action="fin-edit" data-id="yard" data-pig="${esc(pig.key)}">この個体を編集</button><button class="btn secondary" data-action="fin-from" data-id="yard" data-pig="${esc(pig.key)}">この個体を別の空室へ移動</button><button class="btn secondary" data-action="fin-ship" data-id="yard" data-pig="${esc(pig.key)}">出荷</button><button class="btn secondary" data-action="close">閉じる</button>`;if(!dlg.open)dlg.showModal();
}
function finishingYardEdit(pigKey){
  if(!pigKey)return finishingYardAdd();
  const before=F.group(state.finishing.find(r=>r.key==='yard')),pig=before.individuals.find(p=>p.key===pigKey);if(!pig)throw Error('運動場の個体が見つかりません。');
  form('運動場 · 1頭',yardQuickFields(pig.weight,F.yardBirthMonth(pig),{weight:'name="weight"',month:'name="birthMonth"'}),'保存する',f=>{
    const weight=String(f.get('weight')||''),month=String(f.get('birthMonth')||'');
    finishingYardWrite(before,before.individuals.map(p=>p.key===pig.key?{...p,weight:weight===''?null:Number(weight),birthMonth:month===''?null:Number(month)}:p));
  });
}
function finishingSources(){
  return [...nurseryByAge(state.nursery).filter(r=>r.state==='occupied').map(r=>({area:'nursery',r})),...state.finishing.filter(r=>r.state==='occupied').flatMap(r=>r.key==='yard'?F.yardState(r).individuals.filter(p=>TanakaGilts.yardKind(p,state)!=='母豚').map(p=>({area:'finishing',r:{...p,key:'yard',pigKey:p.key,state:'occupied'}})):[{area:'finishing',r}])];
}
function finishingSourceName(area,r){return area==='nursery'?'育成舎':finishingPlace(r.key);}
function finishingEmpty(key){
  const r=state.finishing.find(x=>x.key===key);if(!r||key!=='yard'&&r.state!=='empty'){toast('移動先は空室を選んでください');return;}
  const sources=finishingSources().filter(x=>key!=='yard'||x.r.key!=='yard');
  modal.innerHTML=`<h2>${finishingPlace(key)} · 入室・移動</h2><p class="muted">移動元のグループを選んでください。</p><div class="fin-source-list">${sources.map(({area,r})=>`<button class="row row-action ${r.key===finishingPreferred?'fin-preferred':''}" data-action="fin-source" data-id="${key}" data-area="${area}" data-source="${r.key}" data-pig="${esc(r.pigKey||'')}"><div><b>${finishingSourceName(area,r)}</b><p>${r.mixed?'混成 · ':'母 '+esc(r.sowId||'未入力')+' · '}${r.count===null?'頭数未入力':r.count+'頭'}</p><p class="muted">${r.birthDate?esc(monthDayText(r.birthDate))+'生':'誕生月日 未入力'}${r.key==='yard'?' · '+(r.weight??'未入力')+'kg':' · '+esc(F.group(r).kind)}</p></div><span>›</span></button>`).join('')||'<p class="muted">移動できるグループはまだ登録されていません。</p>'}</div><button class="btn secondary" data-action="fin-register" data-id="${key}">この部屋の情報を直接入力</button><button class="btn secondary" data-action="close">閉じる</button>`;
  if(!dlg.open)dlg.showModal();
}
function finishingTransfer(key,area,sourceKey,pigKey=''){
  if(key==='yard'&&area==='nursery'){nurseryToYard(sourceKey);return;}
  if(key==='yard'&&area==='finishing'&&state.finishing.find(r=>r.key===sourceKey)?.kind==='育成母豚候補'){finishingConfirmGilt(sourceKey);return;}
  const source=(area==='nursery'?state.nursery:state.finishing).find(r=>r.key===sourceKey),dest=state.finishing.find(r=>r.key===key);
  if(!source||source.state!=='occupied'||!dest||key!=='yard'&&dest.state!=='empty'||key==='yard'&&sourceKey==='yard'){toast('移動元・移動先の状態が変わりました');return;}
  Consignment.assertMove(db,sourceKey,pigKey);
  const before=F.group(source),fromYard=sourceKey==='yard',pig=fromYard?before.individuals.find(p=>p.key===pigKey):null,g=fromYard?pig:before;
  if(!g){toast('移動する運動場の個体を選んでください');return;}
  form(finishingPlace(key)+'へ移動',`<p><b>${finishingSourceName(area,source)}</b> → <b>${finishingPlace(key)}</b></p><p class="muted">母 ${esc(g.sowId||'未入力')} · ${g.birthDate?esc(monthDayText(g.birthDate))+'生':'誕生日 未入力'} · ${g.weight??'未入力'}kg</p>${fromYard?'<p>選択した個体 1頭を移動します。</p>':`${before.count===null?field('sourceTotal','移動元の現在の全頭数','','number',true):`<p>移動元 ${before.count}頭</p>`}<label for="moveKind">移動する頭数</label><select id="moveKind" name="moveKind"><option value="all">全頭</option><option value="partial">一部の頭数</option></select><div id="partial-field">${field('moveCount','移動する頭数','','number',true)}</div>`}${field('date','移動日',today(),'date',true)}<p class="muted">${key==='yard'?'1頭ずつ別の行に追加し、体重・誕生日・母豚番号を引き継ぎます。':fromYard?'選択した個体の情報を引き継ぎます。体重が未入力の場合、移動先の目安は30kgから始まります。':'誕生日・母豚番号・豚熱・重量・区分・メモを引き継ぎます。'}</p>`,'移動する',f=>{
    const total=before.count===null?Number(f.get('sourceTotal')):before.count,count=fromYard?1:f.get('moveKind')==='all'?total:Number(f.get('moveCount'));
    if(!Number.isInteger(total)||total<=0||!Number.isInteger(count)||count<=0||count>total)throw Error('移動頭数を確認してください。');
    if(!fromYard&&f.get('moveKind')==='partial'&&count>=total)throw Error('全頭を移動する場合は「全頭」を選んでください。');
    const yard=F.group(state.finishing.find(r=>r.key==='yard'));
    save(d=>d.logs.push({...makeLog('肉豚舎へ移動',g.sowId||''),finishingKey:key,sourceArea:area,sourceKey,sourceBefore:before,sourceTotal:total,count,date:f.get('date'),simpleYard:1,...(key==='yard'||fromYard?{yardIndividuals:1,yardBefore:yard,yardPigKeys:fromYard?[pig.key]:[]}:{} )}));
    finishingMoveMode=false;finishingPreferred='';finishingPreferredPig='';render();
  });
  if(!fromYard){const select=document.getElementById('moveKind'),update=()=>{const partial=select.value==='partial';document.getElementById('partial-field').hidden=!partial;document.getElementById('moveCount').disabled=!partial;};select.onchange=update;update();}
}
function finishingDetail(key){
  const r=state.finishing.find(x=>x.key===key);if(!r||r.state!=='occupied')return finishingEmpty(key);
  if(key==='yard'){modal.innerHTML=`<h2>運動場</h2>${finishingYardList()}<button class="btn secondary" data-action="close">閉じる</button>`;if(!dlg.open)dlg.showModal();return;}
  modal.innerHTML=`<h2>${finishingPlace(key)} <span class="badge ${r.kind==='育成母豚候補'?'orange':''}">${esc(r.kind)}</span></h2><p class="fin-detail-count">${r.count}頭</p>${consignmentButton(key)}<p>誕生月日：${r.birthDate?esc(r.birthDate.replaceAll('-','/')):'未入力'}<br>母豚番号：${r.mixed?'混成':esc(r.sowId||'未入力')}</p><div class="fin-detail-controls"><div><p>重量の目安</p><div class="fin-weight-controls"><button data-action="fin-weight" data-id="${key}" data-delta="-10" ${r.weight<=0?'disabled':''}>−10kg</button><b>${r.weight}kg</b><button data-action="fin-weight" data-id="${key}" data-delta="10">＋10kg</button></div></div><button class="btn secondary" data-action="fin-csf" data-id="${key}" aria-pressed="${r.csf}">豚熱ワクチン　${r.csf?'✓ 済 → 未':'未 → 済'}</button><button class="btn secondary ${r.kind==='育成母豚候補'?'fin-preferred':''}" data-action="fin-kind" data-id="${key}">${r.kind==='育成母豚候補'?'候補を解除して肉豚へ':'区分　肉豚 → 育成母豚候補'}</button></div>${r.kind==='育成母豚候補'?`<button class="btn" data-action="fin-gilt-confirm" data-id="${key}">育成母豚を確定</button>`:''}<p class="history-note">メモ：${esc(r.note||'なし')}</p><button class="btn" data-action="fin-edit" data-id="${key}">頭数・誕生月日・母豚・メモを編集</button><button class="btn secondary" data-action="fin-ship" data-id="${key}">出荷</button><button class="btn secondary" data-action="fin-from" data-id="${key}">このグループを別の空室へ移動</button><button class="btn secondary" data-action="close">閉じる</button>`;
  if(!dlg.open)dlg.showModal();
}
function finishingClearCandidate(key){
 const room=state.finishing.find(r=>r.key===key),basis=db;if(!room||room.kind!=='育成母豚候補')throw Error('候補の部屋を選んでください。');
 form('候補指定を解除',`<p>${esc(finishingPlace(key))} · 残り${room.count}頭</p><p>頭数と現在場所を保ち、区分を「肉豚」へ変更します。</p>`,'候補を解除する',()=>{if(db!==basis)throw Error('記録が更新されました。部屋を確認し直してください。');finishingUpdate(key,g=>g.kind='肉豚');});
}
function finishingSaveUpdate(key,before,after){
  const month=today().slice(0,7),expected=JSON.stringify(db.inventoryMonths?.[month]??null);
  save(d=>{
    d.logs.push({...makeLog('肉豚舎更新',after.sowId,before.kind!==after.kind?(after.kind==='肉豚'?'候補指定を解除':'候補指定を登録'):''),finishingKey:key,finishingBefore:before,finishingAfter:after,simpleYard:1});
    if(before.weight!==after.weight)I.syncSavedFinishingWeight(d,month,key,after.weight);
    if(before.kind!==after.kind&&d.inventoryMonths?.[month]){const old=d.inventoryMonths[month],report=I.clone(old),row=report.rows.find(r=>r.area==='finishing'&&r.roomKey===key);if(row){row.kind=F.roomKind(after.kind);report.status='draft';I.syncPlan(report);I.saveReport(d,report,JSON.stringify(old));}}
  });
  if(before.weight!==after.weight)inventorySyncFinishingWeightDraft(month,key,after.weight,expected);
  if(before.kind!==after.kind&&!inventoryDrafts.get(month)?.dirty)inventoryDrafts.delete(month);
}
function finishingUpdate(key,fn,openDetail=true){
  const r=state.finishing.find(x=>x.key===key);if(!r||r.state!=='occupied')throw Error('グループが見つかりません。');
  const before=F.group(r),after=M.clone(before);fn(after);
  F.validGroup(after);if(JSON.stringify(before)===JSON.stringify(after))return;finishingSaveUpdate(key,before,after);if(openDetail)finishingDetail(key);
}
function finishingEdit(key,pigKey=''){
  if(key==='yard')return finishingYardEdit(pigKey);
  const r=state.finishing.find(x=>x.key===key);if(!r)return;
  const before=F.group(r),g={...before,count:r.state==='empty'?'':before.count};

  form(finishingPlace(key)+' · 情報編集',`${field('birthDate','誕生月日（不明なら空欄）',g.birthDate,'date')}${field('count','現在の頭数',g.count,'number',true)}<p class="muted">0頭で保存すると空室になります。</p><label for="mixed">グループ</label><select id="mixed" name="mixed"><option value="single">同じ母豚の子</option><option value="mixed" ${g.mixed?'selected':''}>混成</option></select>${sowNumberSelect('sowId',g.sowId,{label:'母豚番号（不明なら未選択）'})}<label for="csf">豚熱ワクチン</label><select id="csf" name="csf"><option value="false">未</option><option value="true" ${g.csf?'selected':''}>済</option></select><label for="kind">区分</label><select id="kind" name="kind"><option>肉豚</option><option ${g.kind==='育成母豚候補'?'selected':''}>育成母豚候補</option></select>${field('weight','重量の目安（kg・10kg単位）',g.weight,'number',true)}${notes(g.note)}`,'保存する',f=>{
    const mixed=f.get('mixed')==='mixed',after={birthDate:f.get('birthDate'),count:Number(f.get('count')),sowId:mixed?'':String(f.get('sowId')||'').trim(),mixed,csf:f.get('csf')==='true',kind:f.get('kind'),weight:Number(f.get('weight')),note:f.get('note')};
    if(after.count===0&&!window.confirm('0頭で保存し、この部屋を空室にしますか？'))throw Error('空室化を取り消しました。');
    F.validGroup(after);finishingSaveUpdate(key,before,after);
  });
  document.getElementById('weight').min='0';document.getElementById('weight').step='10';document.getElementById('count').min='0';
  const select=document.getElementById('mixed'),change=()=>document.getElementById('sowId').disabled=select.value==='mixed';select.onchange=change;change();
}
function finishingShip(key,pigKey=''){
  if(key==='yard'){
    const before=F.group(state.finishing.find(r=>r.key==='yard')),pig=before.individuals.find(p=>p.key===pigKey);if(!pig)return finishingDetail('yard');
    const limit=Consignment.saleLimit(db,state,'yard',pigKey);if(!limit)throw Error('この肉豚は委託候補です。委託候補の操作から確定してください。');
    form('運動場 · 出荷',`<p>母 ${esc(pig.sowId||'未入力')} · ${pig.birthDate?esc(monthDayText(pig.birthDate))+'生':'誕生日 未入力'} · ${pig.weight??'未入力'}kg</p>${field('count','出荷頭数',1,'number',true)}${field('date','出荷日',today(),'date',true)}`,'出荷を記録',f=>save(d=>{Consignment.assertSale(d,{roomKey:'yard',pigKey,count:Number(f.get('count'))});d.logs.push({...makeLog('肉豚出荷',pig.sowId),finishingKey:'yard',finishingBefore:before,yardPigKeys:[pig.key],yardIndividuals:1,count:Number(f.get('count')),date:f.get('date')});}));document.getElementById('count').min='1';document.getElementById('count').max='1';return;
  }
  const r=state.finishing.find(x=>x.key===key);if(!r||r.state!=='occupied')return;
  const before=F.group(r),limit=Consignment.saleLimit(db,state,key);if(!limit)throw Error('この部屋は全頭が委託候補です。委託候補の操作から確定してください。');
  form(finishingPlace(key)+' · 出荷',`<p>現在 ${r.count}頭 · 通常出荷可能 ${limit}頭（委託候補を除く）</p>${field('count','出荷した頭数','','number',true)}${field('date','出荷日',today(),'date',true)}${key==='yard'?'':notes()}<p class="muted">全頭出荷すると空室になります。</p>`,'出荷を記録',f=>save(d=>{Consignment.assertSale(d,{roomKey:key,count:Number(f.get('count'))});d.logs.push({...makeLog('肉豚出荷',r.sowId,f.get('note')),finishingKey:key,finishingBefore:before,count:Number(f.get('count')),date:f.get('date'),simpleYard:1});}));
  document.getElementById('count').min='1';document.getElementById('count').max=String(limit);
}
function finishingRecord(l){
  const location=l.sourceKey?finishingSourceName(l.sourceArea,{key:l.sourceKey})+' → ':'';
  form(l.type,`<p>${esc(location)}${esc(finishingPlace(l.finishingKey))}</p><p>${esc(l.date)}${l.count?' · '+esc(l.count)+'頭':''}</p>${l.finishingKey==='yard'&&l.finishingAfter?`<p>変更後 ${l.finishingAfter.count}頭 · 誕生月日 ${esc(l.finishingAfter.birthDate||'未入力')}</p>`:l.finishingAfter?`<p>変更後 ${l.finishingAfter.count}頭 · ${esc(l.finishingAfter.kind)} · 豚熱 ${l.finishingAfter.csf?'済':'未'} · 目安 ${l.finishingAfter.weight}kg</p><p class="history-note">${esc(l.finishingAfter.note)}</p>`:''}${l.note?`<p class="history-note">${esc(l.note)}</p>`:''}<p class="muted">修正は肉豚舎の部屋から行えます。</p>`,'閉じる',()=>{});showRevisions(l);
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||fatal)return;
  const a=b.dataset.action,key=b.dataset.id;if(!a?.startsWith('fin-')||b.disabled)return;
  try{
    if(a==='fin-shipment-add')shipmentAdd();
    if(a==='fin-shipment-delete')shipmentDelete(b.dataset.source,key);
    if(a==='fin-mode'){finishingMoveMode=!finishingMoveMode;finishingPreferred='';render();}
    if(a==='fin-empty')finishingEmpty(key);
    if(a==='fin-detail'&&!finishingMoveMode)finishingDetail(key);
    if(a==='fin-yard-add')finishingYardAdd();
    if(a==='fin-yard-remove')finishingYardRemove(b.dataset.pig);
    if(a==='fin-pig-detail')finishingYardDetail(b.dataset.pig);
    if(a==='fin-source')finishingTransfer(key,b.dataset.area,b.dataset.source,b.dataset.pig||finishingPreferredPig);
    if(a==='fin-register'||a==='fin-edit')finishingEdit(key,b.dataset.pig);
    if(a==='fin-ship')finishingShip(key,b.dataset.pig);
    if(a==='fin-weight'||a==='fin-weight-inline'){
      e.stopPropagation();
      if(a==='fin-weight-inline'&&finishingMoveMode)return;
      const delta=Number(b.dataset.delta);if(![-10,10].includes(delta))return;
      finishingUpdate(key,g=>g.weight=Math.max(0,g.weight+delta),a==='fin-weight');
      if(a==='fin-weight-inline'){
        const next=app.querySelector(`button[data-action="fin-weight-inline"][data-id="${key}"][data-delta="${delta}"]`);
        const focusTarget=next?.disabled?app.querySelector(`button[data-action="fin-weight-inline"][data-id="${key}"][data-delta="10"]`):next;
        focusTarget?.focus({preventScroll:true});
      }
    }
    if(a==='fin-gilt-confirm')finishingConfirmGilt(key);
    if(a==='fin-csf')finishingUpdate(key,g=>g.csf=!g.csf);
    if(a==='fin-kind'){const room=state.finishing.find(r=>r.key===key);if(room?.kind==='育成母豚候補')finishingClearCandidate(key);else finishingUpdate(key,g=>g.kind='育成母豚候補');}
    if(a==='fin-from'){finishingMoveMode=true;finishingPreferred=key;finishingPreferredPig=b.dataset.pig||'';dlg.close();go('finishing');toast('移動先の空室をタップしてください');}
  }catch(err){toast(err.message);}
});

// Fit only the display text; stored headcounts are never changed.
(function(){
  const main=document.getElementById('app');
  if(!main||typeof MutationObserver==='undefined')return;
  let pending=false;
  function fit(){
    pending=false;
    const canvas=document.createElement('canvas'),measure=canvas.getContext('2d');
    if(!measure)return;
    main.querySelectorAll('.fin-primary .fin-count-number').forEach(number=>{
      const unit=number.parentElement.querySelector('small');
      const width=number.parentElement.getBoundingClientRect().width-(number.closest('.fin-yard')?2:(unit?.getBoundingClientRect().width||16)+8);
      if(width<=0)return;
      number.style.fontSize='';
      const style=getComputedStyle(number),digits=number.textContent;
      let lo=12,hi=number.closest('.fin-yard')?124:parseFloat(style.fontSize);
      for(let i=0;i<12;i++){
        const mid=(lo+hi)/2;measure.font='850 '+mid+'px '+style.fontFamily;
        if(measure.measureText(digits).width<=width)lo=mid;else hi=mid;
      }
      number.style.fontSize=Math.floor(lo)+'px';
    });
  }
  function schedule(){if(!pending){pending=true;requestAnimationFrame(fit);}}
  new MutationObserver(schedule).observe(main,{childList:true});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(schedule).observe(main);
  schedule();
})();

function shipmentHistory(){
  const month=today().slice(0,7),summary=F.shipmentSummary(db,month),monthText=key=>Number(key.slice(0,4))+'年'+Number(key.slice(5,7))+'月';
  return `<button class="back" data-action="page" data-id="finishing">‹ 肉豚舎</button><h2>出荷履歴</h2><button class="btn" data-action="fin-shipment-add">出荷実績を追加</button><p class="muted">履歴の追加・削除では、現在の肉豚舎頭数は変わりません。訂正は削除して再追加してください。</p><div class="card"><b>${monthText(month)}の出荷合計　${summary.currentTotal}頭</b></div>${summary.months.map(m=>`<section aria-label="${monthText(m.month)}の出荷実績"><div class="subhead"><h2>${monthText(m.month)}</h2><span class="badge">合計 ${m.total}頭</span></div><div class="card">${m.days.map(day=>`<details><summary class="row"><span><b>${esc(day.date.replaceAll('-','/'))}</b><small class="muted">　内訳 ${day.records.length}件</small></span><strong>${day.total}頭</strong></summary>${day.records.map(r=>`<div class="row"><div><b>${r.finishingKey?esc(finishingPlace(r.finishingKey)):'追加した出荷実績'}</b><p>${esc(r.date.replaceAll('-','/'))} · ${r.count}頭</p>${r.note?`<p class="muted history-note">${esc(r.note)}</p>`:''}</div><button type="button" class="btn secondary" style="width:auto;flex-shrink:0" data-action="fin-shipment-delete" data-source="${r.source}" data-id="${esc(r.key)}" aria-label="${esc(r.date)} ${r.count}頭の出荷履歴を削除">削除</button></div>`).join('')}</details>`).join('')}</div></section>`).join('')||'<div class="card empty">出荷の記録はまだありません。</div>'}`;
}

function shipmentAdd(){
  form('出荷実績を追加',`${field('date','出荷日',today(),'date',true)}${field('count','出荷頭数','','number',true)}<p class="muted">現在の肉豚舎頭数は変更しません。</p>`,'追加する',f=>save(d=>F.addShipment(d,{key:M.uid(),date:f.get('date'),count:Number(f.get('count'))})));
  document.getElementById('count').min='1';document.getElementById('count').step='1';
}
function shipmentDelete(source,key){
  const record=F.shipmentSummary(db,'').records.find(r=>r.source===source&&r.key===key);
  if(!record){toast('出荷履歴が見つかりません');return;}
  form('出荷履歴を削除',`<p>${esc(record.date.replaceAll('-','/'))} · <b>${record.count}頭</b>の出荷実績を削除しますか？</p><p class="muted">出荷一覧と合計から削除します。現在の肉豚舎頭数は変更しません。</p>`,'削除する',()=>save(d=>F.deleteShipment(d,source,key)));
}

// This flow owns its forms: the shared form helper closes after every submit.
function finishingConfirmGilt(key,values={}){
  const room=state.finishing.find(r=>r.key===key),session=dataSession;
  if(!room||room.kind!=='育成母豚候補')throw Error('育成母豚候補の部屋を選んでください。');
  let individuals=values.individuals?M.clone(values.individuals):[{number:values.number||'',birthDate:values.birthDate||room.birthDate||''}],shown=individuals.length;
  modal.innerHTML=`<h2>育成母豚を確定</h2><form id="gilt-input"><p>移動元：${esc(finishingPlace(key))}<br>親母豚：${esc(room.sowId||'未入力')}<br>現在頭数：${room.count}頭</p>${field('gilt-count','運動場へ移す頭数',values.count||individuals.length,'number',true)}<div id="gilt-individual-inputs"></div><p class="muted">選んだ個体だけを移動します。残りは「育成母豚候補」のままです。候補の解除は別操作で行えます。</p><p class="error" id="gilt-error" role="alert"></p><button class="btn" type="submit">確認画面へ</button><button class="btn secondary" type="button" data-action="close">閉じる</button></form>`;
  const suffix=i=>i?'-'+(i+1):'',read=()=>Array.from({length:shown},(_,i)=>({birthDate:document.getElementById('gilt-birth'+suffix(i)).value||''}));
  const renderInputs=count=>{shown=count;document.getElementById('gilt-individual-inputs').innerHTML=Array.from({length:count},(_,i)=>`<fieldset class="gilt-individual-input"><legend>${i+1}頭目</legend><p>仮番号：<b>${esc(TanakaGilts.nextLabel(db,i))}</b>（正式番号は種付け時に登録）</p>${field('gilt-birth'+suffix(i),'誕生日',individuals[i]?.birthDate||room.birthDate||'','date',true)}</fieldset>`).join('');for(let i=0;i<count;i++){document.getElementById('gilt-birth'+suffix(i)).value=individuals[i]?.birthDate||room.birthDate||'';}};
  const countInput=document.getElementById('gilt-count');countInput.min='1';countInput.max=String(room.count);countInput.step='1';countInput.value=String(values.count||individuals.length);
  countInput.addEventListener('change',()=>{const count=Number(countInput.value);if(!Number.isSafeInteger(count)||count<1||count>room.count){document.getElementById('gilt-error').textContent='移動頭数は1〜'+room.count+'頭で入力してください。';return;}individuals=read();renderInputs(count);document.getElementById('gilt-error').textContent='';});
  renderInputs(Number(countInput.value));
  document.getElementById('gilt-input').onsubmit=e=>{
    e.preventDefault();try{
      if(session!==dataSession)throw Error('モードが切り替わりました。画面を開き直してください。');
      const count=Number(countInput.value);if(count!==shown)throw Error('移動頭数を確定して、各個体の情報を確認してください。');
      const values={count,individuals:read()};
      const plan=TanakaGilts.prepareConfirmation(db,key,values,today());finishingGiltReview(plan,values,session);
    }catch(err){document.getElementById('gilt-error').textContent=err.message;}
  };
  if(!dlg.open)dlg.showModal();
}
function finishingGiltReview(plan,values,session){
  let busy=false,done=false;
  modal.innerHTML=`<h2>育成母豚の確定</h2><section class="card"><p>移動元：${esc(finishingPlace(plan.roomKey))}<br>親母豚：${esc(plan.before.sowId||'未入力')}<br>現在頭数：${plan.before.count}頭</p></section><section class="card"><p>運動場へ移動：<b>${plan.count||1}頭</b><br>区分：育成母豚</p>${(plan.individuals||[{number:plan.number,birthDate:plan.birthDate}]).map((p,i)=>`<p>${i+1}頭目 · 仮番号：<b>${esc(p.label||TanakaGilts.nextLabel(db,i))}</b><br>誕生日：${esc(p.birthDate.replaceAll('-','/'))}`).join('</p>')}</p></section><section class="card"><p>移動後の肉豚舎：<br>残り<b>${plan.before.count-(plan.count||1)}頭</b><br>区分：${plan.before.count===(plan.count||1)?'空室':plan.remainingKind||'育成母豚候補'}</p></section><p><b>全豚舎総頭数：変更なし（${plan.total}頭）</b></p><p class="error" id="gilt-error" role="alert"></p><button class="btn" id="gilt-confirm" type="button">確定する</button><button class="btn secondary" id="gilt-back" type="button">戻る</button>`;
  document.getElementById('gilt-back').onclick=()=>{if(!busy&&!done)finishingConfirmGilt(plan.roomKey,values);};
  document.getElementById('gilt-confirm').onclick=()=>{
    if(busy||done)return;busy=true;
    const button=document.getElementById('gilt-confirm'),back=document.getElementById('gilt-back');button.disabled=true;back.disabled=true;
    try{
      if(session!==dataSession)throw Error('モードが切り替わりました。画面を開き直してください。');
      if(inventoryDrafts.get(plan.date.slice(0,7))?.dirty)throw Error('頭数調べに未保存の入力があります。保存してから確定してください。');
      const before=M.clone(db);save(d=>TanakaGilts.confirmCandidate(d,plan));done=true;
      inventoryDrafts.delete(plan.date.slice(0,7));
      finishingGiltComplete(plan,before,JSON.stringify(db),session);
    }catch(err){document.getElementById('gilt-error').textContent=err.message;busy=false;button.disabled=false;back.disabled=false;}
  };
}
function finishingGiltComplete(plan,before,expected,session){
  let busy=false,done=false;
  modal.innerHTML=`<h2>移動しました</h2><p>${esc((plan.individuals||[{number:plan.number}]).map((p,i)=>p.label||TanakaGilts.nextLabel(before,i)).join('・'))}（${plan.count||1}頭）を${esc(finishingPlace(plan.roomKey))}から運動場へ移動しました</p><p class="muted">${simulation?'仮データを変更しました（本番保存なし）':'端末へ一括保存しました。クラウドの保存状況は画面上部で確認できます。'}</p><p class="error" id="gilt-error" role="alert"></p><button class="btn secondary" id="gilt-undo" type="button">元に戻す</button><button class="btn secondary" type="button" data-action="close">閉じる</button>`;
  document.getElementById('gilt-undo').onclick=()=>{
    if(busy||done)return;busy=true;const button=document.getElementById('gilt-undo');button.disabled=true;
    try{
      if(session!==dataSession)throw Error('モードが切り替わりました。画面を開き直してください。');
      save(d=>TanakaGilts.restoreConfirmation(d,before,expected));done=true;inventoryDrafts.delete(plan.date.slice(0,7));dlg.close();toast('育成母豚の確定を元に戻しました');
    }catch(err){document.getElementById('gilt-error').textContent=err.message;busy=false;button.disabled=false;}
  };
}
