'use strict';
function simulationSettings(){
  return `<section class="card simulation-settings" aria-labelledby="simulation-title"><h2 id="simulation-title">シミュレーションモード</h2><p class="muted">現在の農場データのコピーで自由に試せます。日付を進めると分娩・離乳・子豚移動も仮想的に進行します。変更は保存・同期されず、終了や再読み込みですべて破棄されます。</p>${simulation?`<label for="simulation-day">仮の今日</label><input type="date" id="simulation-day" value="${esc(simulation.day)}" min="${esc(simulation.baseDay)}" required><button type="button" class="btn secondary" data-action="simulation-end">シミュレーションモードを終了</button>`:'<button type="button" class="btn" role="switch" aria-checked="false" data-action="simulation-start">ONにして試す</button>'}</section>`;
}
function simulationViews(){return {inventoryDrafts,inventoryMonth,inventoryStep,lastSowNotebookImport};}
function resetSimulationViews(saved=null){
  inventoryDrafts=saved?.inventoryDrafts||new Map();inventoryMonth=saved?.inventoryMonth||'';inventoryStep=saved?.inventoryStep||1;lastSowNotebookImport=saved?.lastSowNotebookImport||null;
  finishingMoveMode=false;finishingPreferred='';finishingPreferredPig='';sowParitySelection.clear();farrowingForecastCache=null;ffActionCache=null;ffTimelineExpanded=false;openPigletCare.clear();
}
function startSimulation(){
  if(simulation||fatal)return;
  if(localStorage.getItem(KEY)!==JSON.stringify(db))throw Error('別画面で本番データが変わりました。再読み込みしてから開始してください。');
  const copy=M.clone(db),nextState=M.replay(copy),day=today(),views=simulationViews();
  if(typeof cloudStore!=='undefined')cloudStore?.pause();
  simulation={day,baseDay:day,production:db,initial:M.clone(copy),theme,views,progress:{events:[],blocked:[]}};dataSession++;db=copy;state=nextState;resetSimulationViews();dlg.close();page='edit';selected='';render();if(typeof updateCloudUI==='function')updateCloudUI();
  toast('シミュレーションを開始しました。本番には保存されません');
}
function endSimulation(){
  if(!simulation)return;
  // A different tab may have legitimately updated production while we experimented.
  // Read that latest data; never write our old snapshot back to localStorage.
  const raw=localStorage.getItem(KEY),production=raw===null?M.clone(simulation.production):M.migrate(JSON.parse(raw)),nextState=M.replay(production),saved=simulation;
  simulation=null;dataSession++;db=production;state=nextState;theme=saved.theme;applyTheme();resetSimulationViews(saved.views);dlg.close();page='edit';selected='';
  if(typeof cloudStore!=='undefined'){cloudStore?.resume();}
  render();if(typeof updateCloudUI==='function')updateCloudUI();
  if(typeof cloudStore!=='undefined'&&cloudStore?.status==='ready'&&cloudStore.user&&cloudStore.row&&TanakaCloud.signature(db)!==TanakaCloud.signature(cloudStore.row.data))cloudStore.localChanged();
  toast('仮データと仮想日付を破棄し、本番へ戻りました');
}
function updateSimulationBanner(){
  const banner=document.getElementById('simulation-banner');if(!banner)return;
  banner.hidden=!simulation;document.body.classList.toggle('simulation-active',!!simulation);
  if(simulation)banner.innerHTML=`<div><strong>シミュレーション中</strong><small>仮の今日 ${esc(simulation.day.replaceAll('-','/'))} · 保存・同期なし</small></div><button type="button" data-action="page" data-id="edit">日付変更</button><button type="button" data-action="simulation-end">終了</button>`;
  syncGlobalHomeButtonLayer();
}
document.addEventListener('change',e=>{
  if(e.target.id!=='simulation-day'||!simulation)return;
  try{changeSimulationDay(e.target.value);}catch(err){toast('仮想状態を進められませんでした：'+err.message);e.target.value=simulation.day;}
});

function changeSimulationDay(day){
  if(!simulation)return;
  if(!TanakaForecast.valid(day)||day<simulation.baseDay)throw Error('シミュレーション開始日以降の日付を選んでください。');
  const backward=day<simulation.day;
  if(backward&&!window.confirm('日付を戻すと、開始時のコピーから再計算します。シミュレーション中の手修正は破棄されます。続けますか？')){render();return;}
  const result=TanakaSimulationFarm.advance(backward?simulation.initial:db,backward?simulation.baseDay:simulation.day,day),nextState=M.replay(result.data);
  // Commit atomically to the existing memory-only session, never through persistence.
  dataSession++;db=result.data;state=nextState;simulation.day=day;simulation.progress=result;
  simulation.eventTotal=(backward?0:simulation.eventTotal||0)+result.events.length;
  resetSimulationViews();dlg.close();render();if(typeof updateCloudUI==='function')updateCloudUI();
  toast('仮想状態を '+day.replaceAll('-','/')+' まで進行しました'+(result.blocked.length?'（未進行の予定あり）':''));
}
function simulationProgressSummary(){
  if(!simulation)return '';
  const progress=simulation.progress||{events:[],blocked:[]};
  const counts=Object.fromEntries(['分娩','離乳','子豚移動','肉豚舎へ移動'].map(type=>[type,db.logs.filter(l=>l.origin==='simulation'&&l.type===type).length]));
  return `<section class="simulation-progress notice"><b>予測・仮想状態（実績ではありません）</b><p>予測分娩 ${counts['分娩']}件 ／ 仮想離乳 ${counts['離乳']}件 ／ 育成舎へ ${counts['子豚移動']}件 ／ 肉豚舎へ ${counts['肉豚舎へ移動']}件</p><details><summary>進行ルール・仮定を確認</summary><p>既存の年間予測に沿って、予定日＋7日で予測分娩、30日後に仮想離乳、60日齢で育成舎へ移動、育成舎入室から30日後に肉豚舎へ移動します。仮頭数は同じ母豚の直近の出生実績を使用し、不明なら未入力です。減耗・出荷は自動で行いません。番号未設定の育成母豚は自動採番しません。</p><p>日付を戻す場合は開始時のコピーから再計算し、途中の手修正は破棄します。開始日より前の状態は再現しません。</p></details>${progress.blocked.length?`<details open><summary>未進行 ${progress.blocked.length}件・収容先などを確認</summary>${progress.blocked.map(x=>`<p>${esc(x.planned)} ${esc(state.sows[x.id]?sowIdentityLabel(x.id):x.roomKey||x.nurseryKey||x.id)}：${esc(x.reason)}</p>`).join('')}<button type="button" class="btn secondary" data-action="simulation-progress">現在の仮想日付まで再進行</button></details>`:''}</section>`;
}
function simulationGroupBadge(area,key){
  if(!simulation)return '';const labels=TanakaSimulationFarm.labels(db,state),text=labels[area]?.[key];return text?`<span class="badge simulation-prediction">${esc(text)}</span>`:'';
}
document.addEventListener('click',e=>{if(e.target.closest('[data-action="simulation-progress"]')){try{changeSimulationDay(simulation.day);}catch(err){toast(err.message);}}});

function simulationSowBadge(id){return simulation&&db.logs.some(l=>l.origin==='simulation'&&l.id===id)?'<span class="badge simulation-prediction">予測・仮想記録を含む</span>':'';}
function simulationForecastLabels(f){
  if(!simulation)return f;
  // The engine uses normal replay events for editing, but the annual view must not
  // call their provenance an actual farm record. Keep the dates/counts unchanged.
  for(const p of f.periods){const assumed=db.logs.some(l=>l.origin==='simulation'&&l.id===p.id&&((l.type==='分娩'&&l.date===p.birth)||(l.type==='種付け'&&l.date===p.mating)||(l.type==='離乳'&&l.date===p.exit)));if(assumed){p.simulationPrediction=true;p.source='シミュレーション上の予測・仮想記録';}}
  const projectedRooms=TanakaSimulationFarm.labels(db,state).rooms;for(const p of f.childStays||[])if(projectedRooms[p.roomKey]){p.simulationPrediction=true;p.source='シミュレーション上の仮想子豚';}
  for(const p of f.occupancies||[]){const source=[...f.periods,...(f.childStays||[])].find(x=>x.key===p.key);if(source?.simulationPrediction){p.simulationPrediction=true;p.source=source.source;}}
  return f;
}
