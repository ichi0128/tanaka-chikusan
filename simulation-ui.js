'use strict';
function simulationSettings(){
  return `<section class="card simulation-settings" aria-labelledby="simulation-title"><h2 id="simulation-title">シミュレーションモード</h2><p class="muted">現在の農場データのコピーで自由に試せます。変更は保存・同期されず、終了や再読み込みですべて破棄されます。</p>${simulation?`<label for="simulation-day">仮の今日</label><input type="date" id="simulation-day" value="${esc(simulation.day)}" required><button type="button" class="btn secondary" data-action="simulation-end">シミュレーションモードを終了</button>`:'<button type="button" class="btn" role="switch" aria-checked="false" data-action="simulation-start">ONにして試す</button>'}</section>`;
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
  simulation={day,production:db,theme,views};dataSession++;db=copy;state=nextState;resetSimulationViews();dlg.close();page='edit';selected='';render();if(typeof updateCloudUI==='function')updateCloudUI();
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
  const day=e.target.value;if(!TanakaForecast.valid(day)){toast('有効な日付を選んでください');e.target.value=simulation.day;return;}
  simulation.day=day;farrowingForecastCache=null;ffActionCache=null;inventoryMonth='';dlg.close();render();toast('仮の今日を '+day.replaceAll('-','/')+' に変更しました');
});
