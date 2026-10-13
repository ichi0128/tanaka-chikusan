'use strict';
const F=TanakaFinishing;
let finishingMoveMode=false,finishingPreferred='';
function finishing(){
  const used=state.finishing.filter(r=>r.state==='occupied'),heads=used.reduce((n,r)=>n+r.count,0),gilts=used.filter(r=>r.kind==='育成母豚');
  const left=[null,2,3,5,7,9,11,13,15,17,19,21,23],right=[1,null,4,6,8,10,12,14,16,18,20,22,24];
  const card=(number,col,row)=>{
    if(number===null)return col===1&&row===1?'<div class="fin-storage" style="grid-column:1;grid-row:1">倉庫</div>':'';
    const r=state.finishing.find(r=>r.key==='f'+number),occupied=r.state==='occupied',disabled=occupied&&finishingMoveMode;
    return `<button class="fin-card ${occupied?'occupied':'vacant'} ${r.kind==='育成母豚'&&occupied?'gilt':''}" style="grid-column:${col};grid-row:${row}${number===1?' / span 2':''}" data-action="${occupied?'fin-detail':'fin-empty'}" data-id="${r.key}" ${disabled?'disabled':''} aria-label="肉豚舎 ${number}番 ${occupied?r.kind+' '+r.count+'頭':'空室'}"><span class="fin-number">${number}</span>${occupied?`<span class="fin-kind">${esc(r.kind)}</span><strong class="fin-count">${r.count}<small>頭</small></strong><span class="fin-birth">${r.birthDate?esc(monthDayText(r.birthDate))+'生':'誕生月日 未入力'}</span><span>母 ${r.mixed?'混成':esc(r.sowId||'未入力')}</span><span class="fin-vaccine ${r.csf?'complete':''}">豚熱 ${r.csf?'済':'未'}</span><small class="fin-weight">目安 ${r.weight}kg</small>${r.note?`<span class="fin-note">${esc(r.note)}</span>`:''}`:'<span class="fin-empty-label">空室<br><small>タップして入室・移動</small></span>'}</button>`;
  };
  return `<div class="subhead"><h2>肉豚舎</h2><span class="badge">${used.length} / 24室 · ${heads}頭</span></div>${gilts.length?`<p class="fin-gilt-summary">育成母豚：${gilts.map(r=>r.key.slice(1)+'番 '+r.count+'頭').join(' ／ ')}</p>`:''}<button class="btn secondary" data-action="fin-mode">${finishingMoveMode?'移動先選択を終了':'移動先を選ぶ'}</button><p class="muted">${finishingMoveMode?'移動先の空室をタップしてください。使用中の部屋は選択できません。':'使用中の部屋は詳細を表示。空室は移動するグループを選べます。'}</p><div class="fin-east">東 ↑</div><div class="fin-map-wrap"><span class="fin-north">北</span><div class="fin-map"><div class="fin-corridor">廊下</div>${left.map((n,i)=>card(n,1,i+1)).join('')}${right.map((n,i)=>card(n,3,i+1)).join('')}</div><span class="fin-south">南</span></div><div class="fin-west">↓ 西</div>`;
}
function finishingSources(){
  return [...state.nursery.filter(r=>r.state==='occupied').map(r=>({area:'nursery',r})),...state.finishing.filter(r=>r.state==='occupied').map(r=>({area:'finishing',r}))];
}
function finishingSourceName(area,r){return area==='nursery'?'育成舎 管理枠 '+r.key.slice(1):'肉豚舎 '+r.key.slice(1)+'番';}
function finishingEmpty(key){
  const r=state.finishing.find(x=>x.key===key);if(r?.state!=='empty'){toast('移動先は空室を選んでください');return;}
  const sources=finishingSources();
  modal.innerHTML=`<h2>${key.slice(1)}番 · 入室・移動</h2><p class="muted">移動元のグループを選んでください。</p><div class="fin-source-list">${sources.map(({area,r})=>`<button class="row row-action ${r.key===finishingPreferred?'fin-preferred':''}" data-action="fin-source" data-id="${key}" data-area="${area}" data-source="${r.key}"><div><b>${finishingSourceName(area,r)}</b><p>${r.mixed?'混成':'母 '+esc(r.sowId||'未入力')} · ${r.count===null?'頭数未入力':r.count+'頭'}</p><p class="muted">${r.birthDate?esc(monthDayText(r.birthDate))+'生':'誕生月日 未入力'} · ${esc(F.group(r).kind)}</p></div><span>›</span></button>`).join('')||'<p class="muted">移動できるグループはまだ登録されていません。</p>'}</div><button class="btn secondary" data-action="fin-register" data-id="${key}">この部屋の情報を直接入力</button><button class="btn secondary" data-action="close">閉じる</button>`;
  if(!dlg.open)dlg.showModal();
}
function finishingTransfer(key,area,sourceKey){
  const source=(area==='nursery'?state.nursery:state.finishing).find(r=>r.key===sourceKey),dest=state.finishing.find(r=>r.key===key);
  if(!source||source.state!=='occupied'||dest?.state!=='empty'){toast('移動元・移動先の状態が変わりました');return;}
  const before=F.group(source);
  form(key.slice(1)+'番へ移動',`<p><b>${finishingSourceName(area,source)}</b> → <b>肉豚舎 ${key.slice(1)}番</b></p><p class="muted">${before.mixed?'混成':'母 '+esc(before.sowId||'未入力')} · ${before.birthDate?esc(monthDayText(before.birthDate))+'生':'誕生月日 未入力'}<br>豚熱 ${before.csf?'済':'未'} · 目安 ${before.weight}kg · ${esc(before.kind)}</p>${before.count===null?field('sourceTotal','移動元の現在の全頭数', '', 'number',true):`<p>移動元 ${before.count}頭</p>`}<label for="moveKind">移動する頭数</label><select id="moveKind" name="moveKind"><option value="all">全頭</option><option value="partial">一部の頭数</option></select><div id="partial-field">${field('moveCount','移動する頭数','','number',true)}</div>${field('date','移動日',today(),'date',true)}<p class="muted">誕生月日・母豚番号・豚熱・重量・区分・メモを引き継ぎます。</p>`,'移動する',f=>{
    const total=before.count===null?Number(f.get('sourceTotal')):before.count,count=f.get('moveKind')==='all'?total:Number(f.get('moveCount'));
    if(!Number.isInteger(total)||total<=0||!Number.isInteger(count)||count<=0||count>total)throw Error('移動頭数を確認してください。');
    if(f.get('moveKind')==='partial'&&count>=total)throw Error('全頭を移動する場合は「全頭」を選んでください。');
    save(d=>d.logs.push({...makeLog('肉豚舎へ移動',before.sowId),finishingKey:key,sourceArea:area,sourceKey,sourceBefore:before,sourceTotal:total,count,date:f.get('date')}));
    finishingMoveMode=false;finishingPreferred='';render();
  });
  const select=document.getElementById('moveKind'),update=()=>{const partial=select.value==='partial';document.getElementById('partial-field').hidden=!partial;document.getElementById('moveCount').disabled=!partial;};select.onchange=update;update();
}
function finishingDetail(key){
  const r=state.finishing.find(x=>x.key===key);if(!r||r.state!=='occupied')return finishingEmpty(key);
  modal.innerHTML=`<h2>肉豚舎 ${key.slice(1)}番 <span class="badge ${r.kind==='育成母豚'?'orange':''}">${esc(r.kind)}</span></h2><p class="fin-detail-count">${r.count}頭</p><p>誕生月日：${r.birthDate?esc(r.birthDate.replaceAll('-','/')):'未入力'}<br>母豚番号：${r.mixed?'混成':esc(r.sowId||'未入力')}</p><div class="fin-detail-controls"><div><p>重量の目安</p><div class="fin-weight-controls"><button data-action="fin-weight" data-id="${key}" data-delta="-10" ${r.weight<=30?'disabled':''}>−10kg</button><b>${r.weight}kg</b><button data-action="fin-weight" data-id="${key}" data-delta="10">＋10kg</button></div></div><button class="btn secondary" data-action="fin-csf" data-id="${key}" aria-pressed="${r.csf}">豚熱ワクチン　${r.csf?'✓ 済 → 未':'未 → 済'}</button><button class="btn secondary ${r.kind==='育成母豚'?'fin-preferred':''}" data-action="fin-kind" data-id="${key}">区分　${esc(r.kind)} → ${r.kind==='肉豚'?'育成母豚':'肉豚'}</button></div><p class="history-note">メモ：${esc(r.note||'なし')}</p><button class="btn" data-action="fin-edit" data-id="${key}">頭数・誕生月日・母豚・メモを編集</button><button class="btn secondary" data-action="fin-ship" data-id="${key}">出荷</button><button class="btn secondary" data-action="fin-from" data-id="${key}">このグループを別の空室へ移動</button><button class="btn secondary" data-action="close">閉じる</button>`;
  if(!dlg.open)dlg.showModal();
}
function finishingUpdate(key,fn){
  const r=state.finishing.find(x=>x.key===key);if(!r||r.state!=='occupied')throw Error('グループが見つかりません。');
  const before=F.group(r),after=M.clone(before);fn(after);
  F.validGroup(after);save(d=>d.logs.push({...makeLog('肉豚舎更新',after.sowId),finishingKey:key,finishingBefore:before,finishingAfter:after}));finishingDetail(key);
}
function finishingEdit(key){
  const r=state.finishing.find(x=>x.key===key);if(!r)return;
  const before=F.group(r),g={...before,count:r.state==='empty'?'':before.count};
  form('肉豚舎 '+key.slice(1)+'番 · 情報編集',`${field('birthDate','誕生月日（不明なら空欄）',g.birthDate,'date')}${field('count','現在の頭数',g.count,'number',true)}<p class="muted">0頭で保存すると空室になります。</p><label for="mixed">グループ</label><select id="mixed" name="mixed"><option value="single">同じ母豚の子</option><option value="mixed" ${g.mixed?'selected':''}>混成</option></select>${field('sowId','母豚番号（不明なら空欄）',g.sowId)}<label for="csf">豚熱ワクチン</label><select id="csf" name="csf"><option value="false">未</option><option value="true" ${g.csf?'selected':''}>済</option></select><label for="kind">区分</label><select id="kind" name="kind"><option>肉豚</option><option ${g.kind==='育成母豚'?'selected':''}>育成母豚</option></select>${field('weight','重量の目安（kg・10kg単位）',g.weight,'number',true)}${notes(g.note)}`,'保存する',f=>{
    const mixed=f.get('mixed')==='mixed',after={birthDate:f.get('birthDate'),count:Number(f.get('count')),sowId:mixed?'':String(f.get('sowId')||'').trim(),mixed,csf:f.get('csf')==='true',kind:f.get('kind'),weight:Number(f.get('weight')),note:f.get('note')};
    if(after.count===0&&!window.confirm('0頭で保存し、この部屋を空室にしますか？'))throw Error('空室化を取り消しました。');
    F.validGroup(after);save(d=>d.logs.push({...makeLog('肉豚舎更新',after.sowId),finishingKey:key,finishingBefore:before,finishingAfter:after}));
  });
  document.getElementById('weight').min='30';document.getElementById('weight').step='10';document.getElementById('count').min='0';
  const select=document.getElementById('mixed'),change=()=>document.getElementById('sowId').disabled=select.value==='mixed';select.onchange=change;change();
}
function finishingShip(key){
  const r=state.finishing.find(x=>x.key===key);if(!r||r.state!=='occupied')return;
  const before=F.group(r);
  form('肉豚舎 '+key.slice(1)+'番 · 出荷',`<p>現在 ${r.count}頭</p>${field('count','出荷した頭数','','number',true)}${field('date','出荷日',today(),'date',true)}${notes()}<p class="muted">全頭出荷すると空室になります。</p>`,'出荷を記録',f=>save(d=>d.logs.push({...makeLog('肉豚出荷',r.sowId,f.get('note')),finishingKey:key,finishingBefore:before,count:Number(f.get('count')),date:f.get('date')})));
  document.getElementById('count').min='1';document.getElementById('count').max=String(r.count);
}
function finishingRecord(l){
  const location=l.sourceKey?finishingSourceName(l.sourceArea,{key:l.sourceKey})+' → ':'';
  form(l.type,`<p>${esc(location)}肉豚舎 ${esc(l.finishingKey.slice(1))}番</p><p>${esc(l.date)}${l.count?' · '+esc(l.count)+'頭':''}</p>${l.finishingAfter?`<p>変更後 ${l.finishingAfter.count}頭 · ${esc(l.finishingAfter.kind)} · 豚熱 ${l.finishingAfter.csf?'済':'未'} · 目安 ${l.finishingAfter.weight}kg</p><p class="history-note">${esc(l.finishingAfter.note)}</p>`:''}${l.note?`<p class="history-note">${esc(l.note)}</p>`:''}<p class="muted">修正は肉豚舎の部屋から行えます。</p>`,'閉じる',()=>{});showRevisions(l);
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||fatal)return;
  const a=b.dataset.action,key=b.dataset.id;if(!a?.startsWith('fin-'))return;
  try{
    if(a==='fin-mode'){finishingMoveMode=!finishingMoveMode;finishingPreferred='';render();}
    if(a==='fin-empty')finishingEmpty(key);
    if(a==='fin-detail'&&!finishingMoveMode)finishingDetail(key);
    if(a==='fin-source')finishingTransfer(key,b.dataset.area,b.dataset.source);
    if(a==='fin-register'||a==='fin-edit')finishingEdit(key);
    if(a==='fin-ship')finishingShip(key);
    if(a==='fin-weight')finishingUpdate(key,g=>g.weight+=Number(b.dataset.delta));
    if(a==='fin-csf')finishingUpdate(key,g=>g.csf=!g.csf);
    if(a==='fin-kind')finishingUpdate(key,g=>g.kind=g.kind==='肉豚'?'育成母豚':'肉豚');
    if(a==='fin-from'){finishingMoveMode=true;finishingPreferred=key;dlg.close();go('finishing');toast('移動先の空室をタップしてください');}
  }catch(err){toast(err.message);}
});
