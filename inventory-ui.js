'use strict';
const I=TanakaInventory;
const INVENTORY_PLAN_STOCK=Object.freeze(I.STOCK.filter(k=>k!=='10'));
const INVENTORY_WEIGHT_DISPLAY_ORDER=Object.freeze(['授乳','離乳','20','30','40','50','60','70','80','90','100']);
let inventoryMonth='',inventoryDrafts=new Map(),inventoryStep=1;
let inventoryPlanRepairQueued=false;
function inventoryQueuePlanRepair(){
  if(inventoryPlanRepairQueued||!I.needsOctoberPlanRepair(db.inventoryMonths?.['2026-10'])||[...inventoryDrafts.values()].some(c=>c.dirty))return;
  const session=dataSession,expected=JSON.stringify(db.inventoryMonths['2026-10']);inventoryPlanRepairQueued=true;
  queueMicrotask(()=>{
    try{
      if(session!==dataSession)return;
      if([...inventoryDrafts.values()].some(c=>c.dirty))return;
      if(JSON.stringify(db.inventoryMonths?.['2026-10'])!==expected)return;
      save(data=>I.repairOctoberPlan(data,expected));
      toast('2026年10月の当月計画を実数で初期化しました。変更前は履歴に保存しています。');
    }catch(err){toast('当月計画の修復を保存できませんでした：'+err.message);}
    finally{inventoryPlanRepairQueued=false;}
  });
}
function inventoryLocalMonth(){return today().slice(0,7);}
function inventoryContext(){
  const month=inventoryMonth||inventoryLocalMonth();inventoryMonth=month;
  // Reopen clean views from the saved month after cloud/JSON/other-tab replacement.
  // Keep unsaved edits intact; the existing expected-record guard prevents overwrites.
  const cached=inventoryDrafts.get(month),savedValue=JSON.stringify(db.inventoryMonths?.[month]??null);
  if(cached&&!cached.dirty&&cached.expected!==savedValue)inventoryDrafts.delete(month);
  if(!inventoryDrafts.has(month)){
    const saved=db.inventoryMonths?.[month],report=saved?I.clone(saved):I.create(db,state,month,today(),roomBirthDate);
    report.rows=saved?inventoryEnsureFinishingRooms(I.individualYardRows(report.rows)):[];
    I.preparePlan(report,db);
    inventoryDrafts.set(month,{report,expected:JSON.stringify(saved??null),dirty:false,hasSnapshot:!!saved,editing:month>=inventoryLocalMonth()});
  }
  return inventoryDrafts.get(month);
}
function inventoryStoreSnapshot(c,report){
  // save() renders before returning. Keep this working copy pinned until it has
  // the new persisted revision; a failed write leaves the previous snapshot intact.
  const wasDirty=c.dirty;c.dirty=true;
  try{save(data=>I.saveReport(data,report,c.expected));}catch(err){c.dirty=wasDirty;throw err;}
  c.report=I.clone(db.inventoryMonths[report.month]);c.expected=JSON.stringify(c.report);
  c.hasSnapshot=true;c.dirty=false;
}
function inventoryMonthLabel(month){return Number(month.slice(0,4))+'年'+Number(month.slice(5,7))+'月';}
function inventoryOffsetMonth(month,delta){
  const [year,m]=month.split('-').map(Number),date=new Date(Date.UTC(year,m-1+delta,1));
  const result=date.toISOString().slice(0,7);if(!I.validMonth(result))throw Error('対象月を確認してください。');return result;
}
function inventoryReadOnly(c=inventoryContext()){return c.report.month<inventoryLocalMonth()&&!c.editing;}
function inventoryCanEdit(c=inventoryContext()){return c.hasSnapshot!==false&&!inventoryReadOnly(c);}
function inventorySwitchMonth(month){
  if(!I.validMonth(month))throw Error('対象月を選んでください。');
  if(month===inventoryMonth)return;
  const current=inventoryContext();
  if(inventoryCanEdit(current)&&document.getElementById('inventory-form')){
    const report=inventoryRead();report.status=current.report.status;
    if(JSON.stringify(report)!==JSON.stringify(current.report)){current.report=report;current.dirty=true;}
  }
  const next=inventoryDrafts.get(month);
  if(next&&!next.dirty)inventoryDrafts.delete(month);
  else if(next)next.editing=month>=inventoryLocalMonth();
  inventoryMonth=month;render();
}
function inventoryMonthToolbar(c){
  const r=c.report,prev=inventoryOffsetMonth(r.month,-1),next=inventoryOffsetMonth(r.month,1),readonly=inventoryReadOnly(c),exists=c.hasSnapshot!==false;
  return `<div class="inventory-month-navigation" aria-label="頭数調べの月切り替え"><button type="button" data-inventory="month-prev" aria-label="前月 ${inventoryMonthLabel(prev)}">〈 <span>${inventoryMonthLabel(prev)}</span></button><strong aria-live="polite">${inventoryMonthLabel(r.month)}</strong><button type="button" data-inventory="month-next" aria-label="次月 ${inventoryMonthLabel(next)}"><span>${inventoryMonthLabel(next)}</span> 〉</button></div><div class="inventory-snapshot-tools"><small id="inventory-snapshot-status">${exists?(c.dirty?'未保存の変更あり':r.status==='confirmed'?'確定済み':'下書き'):'未作成'}${readonly?' · 閲覧中':''}</small>${r.month===inventoryLocalMonth()?'<button type="button" class="btn secondary" data-inventory="refresh">現在の豚舎データから取り込む</button>':`<button type="button" class="btn secondary" data-inventory="month-today">今月を開く</button>`}${readonly&&exists?'<button type="button" class="btn secondary" data-inventory="edit">この月を編集する</button>':''}</div>`;
}
function inventoryLabel(k){return /^\d+$/.test(k)?k+'kg':k;}
function inventoryNumber(name,value,label){return `<input type="number" min="0" step="1" inputmode="numeric" name="${name}" value="${value??''}" aria-label="${esc(label)}" placeholder="未入力">`;}
function inventoryPage(){
  const c=inventoryContext(),r=c.report,months=Object.keys(db.inventoryMonths||{}).sort().reverse(),readonly=inventoryReadOnly(c),exists=c.hasSnapshot!==false,empty='<p class="notice">この月の頭数調べは未作成です。今月を開き、「現在の豚舎データから取り込む」で作成してください。</p>';
  return `<h2 class="inventory-title">頭数調べ</h2><form id="inventory-form">${inventoryMonthToolbar(c)}<div class="inventory-compact-header"><details class="inventory-date-picker"><summary id="inventory-date-label">確認日：${exists?esc(r.date.replaceAll('-','/')):'未設定'}</summary><label for="inventory-date">確認日を変更</label><input id="inventory-date" name="date" aria-label="確認日（日齢判定の基準）" type="date" value="${r.date}" required ${readonly||!exists?'disabled':''}></details></div><div id="inventory-steps" class="inventory-step-tabs" role="tablist" aria-label="月末作業の3段階">${[[1,'①確認・修正'],[2,'②体重別集計'],[3,'③出荷計画']].map(([step,label])=>`<button type="button" id="inventory-tab-${step}" role="tab" data-inventory="tab" data-step="${step}" aria-controls="inventory-panel-${step}" aria-selected="${inventoryStep===step}" tabindex="${inventoryStep===step?0:-1}">${label}</button>`).join('')}</div>${exists?inventoryPrintControls():''}<fieldset class="inventory-edit-fields" ${readonly||!exists?'disabled':''}><section id="inventory-panel-1" role="tabpanel" aria-labelledby="inventory-tab-1" data-inventory-panel="1" ${inventoryStep===1?'':'hidden'}><h2 id="inventory-step1">① 確認・修正</h2>${exists?inventoryCountGroups(r):empty}</section><section id="inventory-panel-2" role="tabpanel" aria-labelledby="inventory-tab-2" data-inventory-panel="2" ${inventoryStep===2?'':'hidden'}><h2 id="inventory-step2">② 体重別集計</h2><div id="inventory-totals">${exists?inventoryTotals(r):empty}</div></section><section id="inventory-panel-3" role="tabpanel" aria-labelledby="inventory-tab-3" data-inventory-panel="3" ${inventoryStep===3?'':'hidden'}><h2 id="inventory-step3">③ 出荷計画</h2>${exists?inventoryPlan(r):empty}</section><div class="card inventory-save"><p class="error" id="inventory-error" role="alert"></p><button type="button" class="btn secondary" data-inventory="save">下書きを保存</button><button type="button" class="btn" data-inventory="confirm">確認済みとして保存</button><p class="muted">修正して保存するたびに前の内容を履歴に残します。運動場は未入力でも確認済みとして保存できます。他の舎に未入力の頭数・体重区分がある場合は下書き保存できます。</p></div></fieldset></form><details class="card inventory-options"><summary>過去の頭数調べを見る・その他の操作</summary><div class="card inventory-month"><label for="inventory-month">対象月</label><input id="inventory-month" type="month" value="${r.month}"><button class="btn secondary" data-inventory="open">この月を開く</button><label for="inventory-history-month">保存済みの月</label><select id="inventory-history-month"><option value="">選択してください</option>${months.map(m=>`<option value="${m}" ${m===r.month?'selected':''}>${m} · ${db.inventoryMonths[m].status==='confirmed'?'確定':'下書き'}</option>`).join('')}</select><p id="inventory-status" role="status">${r.month} · ${r.status==='confirmed'?'確定済み':'下書き'}${c.dirty?'（未保存の変更あり）':!db.inventoryMonths?.[r.month]?'（未保存）':''}</p><p class="muted">月次記録だけを修正します。各舎の日常記録の頭数・体重は変更しません。</p></div><div class="inventory-help"><p class="muted">自動取込は現在の状態です。過去月の状態は再現しません。確認日・誕生日の変更で日齢区分を再判定します。手動で選んだ区分は維持します。取り直すと明細の手修正が置き換わります。</p><p class="muted">50〜70日齢は20kg、育成舎の71日齢以上は30kg。50日齢未満は授乳／離乳。その他や日齢不明は体重区分を確認してください。農場全体の合計は取込時の母豚台帳も含め、運動場の番号登録済み母豚は重複させません。</p><p class="muted">肉豚舎の育成母豚候補は、肉豚の目印として②・③にも含めます。運動場へ移った正式な育成母豚は肉豚集計から外し、農場全体には含めます。</p></div></details>${inventoryRevisionList(r)}`;
}

function inventoryStockTotals(report){
  const sum=stock=>({count:INVENTORY_PLAN_STOCK.reduce((n,k)=>n+(stock[k]??0),0),missing:INVENTORY_PLAN_STOCK.filter(k=>stock[k]===null||stock[k]===undefined).length});
  return {previous:sum(report.previousStock),actual:sum(I.actualStock(report)),plan:sum(I.plannedStock(report))};
}
function inventoryStockTotalText(total){
  return `<b>${total.missing===INVENTORY_PLAN_STOCK.length?'—':total.count+'頭'}</b>${total.missing?`<small>${total.missing===INVENTORY_PLAN_STOCK.length?'未入力':'未入力 '+total.missing+'区分'}</small>`:''}`;
}
function inventoryStockTotalRow(report,readonly){
  const totals=inventoryStockTotals(report);
  return `<tfoot class="inventory-stock-totals" aria-live="polite"><tr><th scope="row">合計</th>${[['previous','前月 合計'],['actual','当月実数 合計'],['plan','当月計画 合計']].map(([key,label])=>`<td class="inventory-stock-total-${key}"><output ${readonly?'':`data-inventory-stock-total="${key}"`} aria-label="${label}">${inventoryStockTotalText(totals[key])}</output></td>`).join('')}</tr></tfoot>`;
}
function inventoryMonthlyTotals(report){
  const rows=report.monthly.map(row=>{
    const actual=row.month<report.month&&row.actual!==null&&row.actual!==undefined;
    return {month:row.month,value:actual?row.actual:row.planned,actual};
  });
  const sum=items=>({count:items.reduce((n,x)=>n+(x.value??0),0),missing:items.filter(x=>x.value===null||x.value===undefined).length,months:items.length,actualMonths:items.filter(x=>x.actual).length,plannedMonths:items.filter(x=>!x.actual&&x.value!==null&&x.value!==undefined).length});
  return {annual:sum(rows),cumulative:sum(rows.filter(x=>x.month<report.month))};
}
function inventoryMonthlyTotalSummary(report){
  const totals=inventoryMonthlyTotals(report);
  return [['annual','年間見込み 合計'],['cumulative','前月まで 累計']].map(([key,label])=>{
    const total=totals[key],unknown=total.months>0&&total.missing===total.months;
    return `<div><span>${label}</span><strong>${unknown?'—':total.count+'頭'}</strong><small>実績 ${total.actualMonths}か月 ＋ 計画 ${total.plannedMonths}か月${total.missing?' · 未入力 '+total.missing+'か月':''}</small></div>`;
  }).join('');
}
function inventoryShipmentReference(month){
  const records=F.shipmentSummary(db,month).records.filter(x=>x.date.slice(0,7)===month),total=records.reduce((n,x)=>n+x.count,0);
  modal.innerHTML=`<h2>${inventoryMonthLabel(month)}の出荷履歴</h2><p class="inventory-shipment-reference-total">${records.length?'履歴の合計 '+total+'頭':'この月の出荷履歴はありません'}</p><p class="muted">履歴を参考に、月別表の「今年実績」を手入力してください。計画値はそのまま残ります。</p>${records.length?`<table class="inventory-table"><thead><tr><th>出荷日</th><th>頭数</th><th>場所</th></tr></thead><tbody>${records.map(x=>`<tr><td>${esc(x.date.replaceAll('-','/'))}</td><td>${x.count}頭</td><td>${x.finishingKey?esc(finishingPlace(x.finishingKey)):'追加した実績'}</td></tr>`).join('')}</tbody></table>`:''}<button type="button" class="btn secondary" data-action="close">閉じる</button>`;
  if(!dlg.open)dlg.showModal();
}
function inventoryPlan(r,readonly=false){
  const actual=I.actualStock(r),plan=I.plannedStock(r),prior=r.previousYearActual||I.yearActual(db,r.month.slice(0,4));
  const value=x=>x===null||x===undefined?'—':x;
  const input=(name,n,label)=>readonly?value(n):inventoryNumber(name,n,label);
  return `<div class="inventory-plan-report"><section class="inventory-plan-section"><h3>棚卸</h3><table class="inventory-table inventory-plan-table"><thead><tr><th scope="col">体重</th><th scope="col">前月</th><th scope="col">当月実数</th><th scope="col">当月計画</th></tr></thead><tbody>${INVENTORY_PLAN_STOCK.map(k=>`<tr><th scope="row">${inventoryLabel(k)}</th><td>${value(r.previousStock[k])}</td><td><output data-stock="${k}">${actual[k]}</output></td><td>${input('stock_plan_'+k,plan[k],inventoryLabel(k)+' 当月計画')}</td></tr>`).join('')}</tbody>${inventoryStockTotalRow(r,readonly)}</table><p class="muted">出荷計画の対象は肉豚（候補を含む。正式な育成母豚・母豚は除外）。実数は①・②から自動集計。計画は当月実数をコピーして開始します。一度手入力した後は、計画全体を保持します。110kgは計画上の振り分け先です（実数は0）。</p>${readonly?'':'<button type="button" class="btn secondary" data-inventory="plan-reset">当月実数を計画へコピー</button>'}<p class="muted">前月：${r.carriedFrom?esc(r.carriedFrom)+' 保存時の当月計画':'保存記録なし（—）'}。前月の記録は変更しません。</p></section><div class="inventory-plan-workflow"><section class="inventory-plan-section"><h3>${Number(r.month.slice(5))}月 週別出荷計画</h3><table class="inventory-table inventory-plan-table inventory-weekly-table"><thead><tr><th scope="col">週</th><th scope="col">出荷頭数</th></tr></thead><tbody>${r.weekly.map((n,i)=>`<tr><th scope="row">第${i+1}週</th><td>${input('week_'+i,n,'第'+(i+1)+'週 出荷頭数')}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">合計</th><td><output id="${readonly?'inventory-history-weekly-total':'inventory-weekly-total'}" aria-live="polite">${I.weeklyTotal(r)}頭</output></td></tr></tfoot></table><p class="muted">各週の頭数を手入力してください。自動計算は合計だけです。</p></section><section class="inventory-plan-section"><h3>備考</h3>${readonly?`<p class="history-note">${esc(r.remarks||'—')}</p>`:`<textarea id="inventory-remarks" name="remarks" aria-label="出荷計画の備考" rows="4" placeholder="出荷予定・調整事項など">${esc(r.remarks)}</textarea>`}</section></div><section class="inventory-plan-section"><h3>${r.month.slice(0,4)}年 月別出荷計画</h3><table class="inventory-table inventory-plan-table"><thead><tr><th scope="col">月</th><th scope="col">前年実績</th><th scope="col">今年計画</th><th scope="col">今年実績</th></tr></thead><tbody>${r.monthly.map((x,i)=>`<tr class="${x.month===r.month?'inventory-plan-current':x.month===I.previousMonth(r.month)?'inventory-plan-previous':''}"><th scope="row">${i+1}月${x.month===I.previousMonth(r.month)?'<small class="inventory-month-previous-label">前月</small>':''}</th><td>${value(prior[i])}</td><td>${input('planned_'+i,x.planned,x.month+' 今年計画')}</td><td class="${x.month===I.previousMonth(r.month)?'inventory-month-previous-actual':''}">${input('actual_'+i,x.actual,x.month+' 今年実績'+(x.month===I.previousMonth(r.month)?'（前月・修正できます）':''))}</td></tr>`).join('')}</tbody></table><div class="inventory-monthly-totals" ${readonly?'':'data-inventory-monthly-totals'} aria-live="polite">${inventoryMonthlyTotalSummary(r)}</div><p class="muted">合計は対象月より前の月で「今年実績」が入力済みなら実績を採用し、未入力なら計画を使います。当月以降は計画を使います。未確定の実績は空欄にし、実績0頭が確定した月は0を入力してください。計画と実績は別々に保存します。</p>${readonly?'':`<button type="button" class="btn secondary" data-inventory="shipment-reference">前月（${Number(I.previousMonth(r.month).slice(5))}月）の出荷履歴を確認</button>`}<p class="muted">前年実績は前年の保存済み月次記録から引き継ぎ、年内は固定表示します。記録がない月は「—」です。今年計画と今年実績は別々に保存します。新規作成時、対象月より先の計画は20頭から始めます。</p>${readonly?'':'<details class="inventory-plan-tools"><summary>前月の保存内容を取り込む</summary><p class="muted">同じ年の計画・実績と、棚卸の前月欄を更新します。当月計画と週別入力は保持します。</p><button type="button" class="btn secondary" data-inventory="carry">前月の保存済み計画・実績を取り込む</button></details>'}</section></div>`;
}

function inventoryBirthLabel(value){return value?Number(value.slice(5,7))+'/'+Number(value.slice(8,10)):'未入力';}
function inventoryFarmTotals(r){
  const s=I.farmSummary(r);return `<div class="inventory-farm-total" data-inventory-farm-total aria-live="polite"><strong>${s.sowCount===null?'確認対象 合計':'農場全体 合計'} ${s.farmTotal}頭${s.unknown?' ＋ 頭数未入力 '+s.unknown+'件':''}</strong><small>肉豚 ${s.total+s.unclassified}頭（うち候補 ${s.candidates}頭） ／ 育成母豚 ${s.gilts}頭${s.sowCount===null?' ／ 母豚頭数は未保存（現在値から補完しません）':' ／ 母豚 '+s.sowCount+'頭'}</small></div>`;
}
function inventoryGroupSubtotal(rows){
  const s=I.aggregate(rows);return `<b>小計 ${s.headTotal}頭${s.unknown?' ＋ 頭数未入力 '+s.unknown+'件':''}</b>${s.candidates?`<small>うち育成母豚候補 ${s.candidates}頭</small>`:''}${s.gilts?`<small>うち育成母豚 ${s.gilts}頭</small>`:''}${s.sows?`<small>うち番号登録済み母豚 ${s.sows}頭（母豚台帳と重複させません）</small>`:''}`;
}
function inventoryEnsureFinishingRooms(rows){
  const result=I.clone(rows);
  for(let n=1;n<=24;n++){
    const roomKey='f'+n;
    if(!result.some(row=>row.area==='finishing'&&(row.roomKey===roomKey||row.key==='finishing:'+roomKey))){
      let key='finishing:'+roomKey;if(result.some(row=>row.key===key))key+=':'+M.uid();
      result.push({key,area:'finishing',roomKey,place:'肉豚舎 '+n+'番',state:'unknown',count:null,birthDate:'',sowId:'',csf:null,category:'',autoCategory:false,registeredWeight:null,kind:'肉豚'});
    }
  }
  return result;
}
function inventoryHeadcountText(rows){
  const known=rows.reduce((n,row)=>n+(row.count??0),0),unknown=rows.filter(row=>row.count===null).length;
  return known+'頭'+(unknown?' ＋ 未入力'+unknown+'室':'');
}
function inventoryDisplayPlace(row){
  return row.area==='finishing'?finishingPlace(row.roomKey||row.key.replace('finishing:','')):row.place;
}
function inventoryFinishingMap(entries){
  const card=(roomNumber,col,pair)=>{
    const key='f'+roomNumber,{row,i}=entries.find(({row})=>row.roomKey===key||row.key==='finishing:'+key),place=finishingPlace(key);
    return `<article class="inventory-finishing-room" style="grid-column:${col};grid-row:${pair}" aria-label="${esc(place)}の頭数調べ" data-inventory-room="${key}">${I.rowKind(row)!=='肉豚'?`<small class="inventory-gilt-label">${esc(I.rowKind(row))}</small>`:''}<input type="hidden" name="csf_${i}" value="${row.csf===null?'':String(row.csf)}"><label>頭数</label><div class="inventory-counter"><button type="button" data-inventory="step" data-row="${i}" data-delta="-1" aria-label="${esc(place)}の頭数を1減らす">−</button>${inventoryNumber('count_'+i,row.count,place+'の頭数')}<button type="button" data-inventory="step" data-row="${i}" data-delta="1" aria-label="${esc(place)}の頭数を1増やす">＋</button></div><label for="inventory-birth-${i}">誕生日</label><details class="inventory-notebook-birth"><summary id="inventory-birth-label-${i}" aria-label="${esc(place)}の誕生日を変更">${inventoryBirthLabel(row.birthDate)}</summary><input id="inventory-birth-${i}" type="date" name="birth_${i}" value="${esc(row.birthDate)}" aria-label="${esc(place)}の誕生日"></details><label for="inventory-sow-${i}">母豚番号</label>${sowNumberSelect('sow_'+i,row.sowId,{id:'inventory-sow-'+i,label:false,ariaLabel:place+'の母豚番号'})}<label for="inventory-weight-${i}">体重(kg)</label><select id="inventory-weight-${i}" name="category_${i}" aria-label="${esc(place)}の体重区分"><option value="">未入力</option>${I.CATEGORIES.map(k=>`<option value="${k}" ${row.category===k?'selected':''}>${inventoryLabel(k)}</option>`).join('')}</select></article>`;
  };
  return `<div class="inventory-pair-headings"><b>左側</b><span>廊下</span><b>右側</b></div><div class="inventory-finishing-map"><div class="inventory-pair-corridor" aria-hidden="true"></div>${Array.from({length:12},(_,i)=>`<div class="inventory-pair-number" style="grid-column:2;grid-row:${i+1}" aria-label="左右${i+1}番の廊下">${i+1}</div>`).join('')}${FINISHING_DISPLAY_COLUMNS.left.map((n,i)=>card(n,1,i+1)).join('')}${FINISHING_DISPLAY_COLUMNS.right.map((n,i)=>card(n,3,i+1)).join('')}</div>`;
}
function inventoryYardWeight(row){
  return /^\d+$/.test(row.category||'')?Number(row.category):row.category?null:row.registeredWeight??null;
}
function inventoryYardGroup(entries){
  return `<section class="inventory-area-group inventory-yard-simple" aria-label="運動場の頭数確認"><h3>運動場 <small class="muted">（1頭ずつ・${entries.length}枠）</small></h3><div class="yard-quick-grid">${entries.map(({row,i},n)=>`<article class="yard-quick-card"><small>${row.count===null?'頭数未入力':row.count+'頭'}${I.rowKind(row)!=='肉豚'?' · '+esc(I.rowKind(row)):''}</small><input type="hidden" name="count_${i}" value="${row.count??''}"><input type="hidden" name="birth_${i}" value="${esc(row.birthDate)}"><input type="hidden" name="sow_${i}" value="${esc(row.sowId)}"><input type="hidden" name="csf_${i}" value="${row.csf===null?'':String(row.csf)}"><input type="hidden" name="category_${i}" value="${esc(row.category)}">${yardQuickFields(inventoryYardWeight(row),F.yardBirthMonth(row),{weight:`name="yard_weight_${i}"`,month:`name="yard_month_${i}"`},'頭数調べ 運動場 '+(n+1)+'頭目')}</article>`).join('')}</div><div class="inventory-group-subtotal" data-inventory-subtotal="yard" aria-live="polite">${inventoryGroupSubtotal(entries.map(x=>x.row))}</div><p class="muted">体重と誕生月は未入力でも保存できます。ここでの修正は月次記録だけに反映します。</p><button type="button" class="btn secondary" data-inventory="yard-add">運動場に1頭分の枠を追加</button><details class="inventory-notebook-info"><summary>運動場の枠を削除</summary>${entries.map(({i},n)=>`<button type="button" class="btn secondary" data-inventory="yard-remove" data-row="${i}">${n+1}枠目を削除</button>`).join('')}</details></section>`;
}
function inventoryCountGroups(r){
  return inventoryFarmTotals(r)+[['farrowing','分娩舎'],['nursery','育成舎'],['yard','運動場'],['finishing','肉豚舎']].map(([area,label])=>{
    const entries=r.rows.map((row,i)=>({row,i})).filter(x=>x.row.area===area),rows=entries.map(x=>x.row);
    // Sort only display entries; keep each original row index for edits and saving.
    if(area==='farrowing'||area==='nursery')entries.sort((a,b)=>{const x=a.row.birthDate||'',y=b.row.birthDate||'';return x&&y?x.localeCompare(y)||a.i-b.i:x?-1:y?1:a.i-b.i;});
    if(area==='yard')return inventoryYardGroup(entries);
    const fields=entries.map(({row,i})=>`<div class="inventory-notebook-row"><div class="inventory-counter"><button type="button" data-inventory="step" data-row="${i}" data-delta="-1" aria-label="${esc(row.place)}の頭数を1減らす">−</button>${inventoryNumber('count_'+i,row.count,row.place+'の頭数').replace('<input ',row.area==='yard'?'<input max="1" ':'<input ')}<button type="button" data-inventory="step" data-row="${i}" data-delta="1" aria-label="${esc(row.place)}の頭数を1増やす">＋</button></div><select name="category_${i}" aria-label="${esc(row.place)}の体重区分"><option value="">${row.area==='yard'?'未入力':'要確認'}</option>${I.CATEGORIES.map(k=>`<option value="${k}" ${row.category===k?'selected':''}>${inventoryLabel(k)}</option>`).join('')}</select><details class="inventory-notebook-birth"><summary id="inventory-birth-label-${i}" aria-label="${esc(row.place)}の誕生日を変更">${inventoryBirthLabel(row.birthDate)}</summary><label for="inventory-birth-${i}">誕生日を変更</label><input id="inventory-birth-${i}" type="date" name="birth_${i}" value="${esc(row.birthDate)}" aria-label="${esc(row.place)}の誕生日"></details>${sowNumberSelect('sow_'+i,row.sowId,{label:false,ariaLabel:row.place+'の母豚番号'})}</div>`).join('');
    return `<section class="inventory-area-group ${area==='finishing'?'inventory-finishing-group':'inventory-notebook'}" aria-label="${label}の頭数確認"><h3>${label}${area==='yard'?`<small class="muted">（1頭ずつ・${entries.length}行）</small>`:''}${area==='finishing'?`<span class="inventory-finishing-total" data-inventory-finishing-total aria-live="polite">合計 ${inventoryHeadcountText(rows)}</span>`:''}</h3>${area==='finishing'?inventoryFinishingMap(entries):`<div class="inventory-notebook-head" aria-hidden="true"><span>頭数</span><span>${area==='yard'?'体重(kg)':'体重'}</span><span>誕生日</span><span>母豚番号</span></div>${fields}`}${area==='finishing'?'':`<div class="inventory-group-subtotal" data-inventory-subtotal="${area}" aria-live="polite">${inventoryGroupSubtotal(rows)}</div>`}${area==='yard'?`<p class="muted">1頭につき1行です。未入力でも確認済みとして保存できます。</p><button type="button" class="btn secondary" data-inventory="yard-add">運動場に1頭分の行を追加</button><details class="inventory-notebook-info"><summary>運動場の行を削除</summary>${entries.map(({i},n)=>`<button type="button" class="btn secondary" data-inventory="yard-remove" data-row="${i}">${n+1}行目を削除</button>`).join('')}</details>`:''}${area==='finishing'?'':`<details class="inventory-notebook-info"><summary>場所・その他の情報</summary>${entries.map(({row,i})=>`<div class="inventory-notebook-meta"><span>${esc(row.place)} · ${esc(I.rowKind(row))}${row.registeredWeight!==null?' · 登録'+row.registeredWeight+'kg':''} · ${esc(({waiting:'分娩待ち',empty:'空き',unknown:'在室未確認',family:'授乳',piglets:'離乳',occupied:'在室'})[row.state]||'')}</span><input type="hidden" name="csf_${i}" value="${row.csf===null?'':String(row.csf)}"></div>`).join('')}</details>`}</section>`;
  }).join('');
}

function inventoryTotals(r){
  const categories=INVENTORY_WEIGHT_DISPLAY_ORDER;
  const s=I.aggregate(r.rows),max=Math.max(1,...Object.values(s.totals));
  const colors=['#e793b9','#83c8ed','#8ac28e','#61ac7b','#f2d264','#eab85c','#ef995e','#e78060','#e16b63','#cf4f55','#a83448'];
  return inventoryFarmTotals(r)+`<section class="card inventory-weight-list"><div class="inventory-weight-list-heading"><h3>体重別 頭数一覧</h3><strong aria-live="polite">合計 ${s.total}頭</strong></div><table class="inventory-table inventory-weight-summary"><thead><tr><th scope="col">体重区分</th><th scope="col">横棒・頭数</th><th scope="col">割合</th></tr></thead><tbody>${[...categories].reverse().map(k=>`<tr><th scope="row">${inventoryLabel(k)}</th><td><div class="inventory-weight-inline"><span class="inventory-weight-track" aria-hidden="true"><span class="inventory-weight-fill" style="width:${s.totals[k]/max*100}%;background:${colors[categories.indexOf(k)]}"></span></span><strong>${s.totals[k]}頭</strong></div></td><td>${(s.total?s.totals[k]/s.total*100:0).toFixed(1)}%</td></tr>`).join('')}</tbody></table><p class="muted">候補 ${s.candidates}頭は肉豚として集計しています。正式な育成母豚 ${s.gilts}頭は肉豚集計から外し、農場全体の合計には含みます。</p><p class="muted" role="status">${s.unknown?'頭数未入力 '+s.unknown+'件。':''}${s.unclassified?'体重区分 未確認 '+s.unclassified+'頭。':''}${s.unknown||s.unclassified?'未確認分は合計・割合に含めていません。':'①の確認・修正内容から自動集計しています。'}</p></section>`;
}

function inventoryRevisionList(r){return `<details class="card inventory-revisions"><summary>この月の修正履歴（${r.revisions.length}件）</summary>${r.revisions.slice().reverse().map((x,i)=>`<button class="row row-action" data-inventory="revision" data-index="${r.revisions.length-1-i}">${esc(x.savedAt.replace('T',' ').slice(0,19))} 更新前 · ${x.report.status==='confirmed'?'確定':'下書き'} ›</button>`).join('')||'<p>保存後に修正すると、前の内容がここに残ります。</p>'}</details>`;}
function inventoryRead(){
  const c=inventoryContext();if(!inventoryCanEdit(c))throw Error('閲覧中の月です。「この月を編集する」から編集してください。');
  const r=I.clone(c.report),f=new FormData(document.getElementById('inventory-form'));
  const number=name=>{const v=String(f.get(name)??'').trim();if(v==='')return null;if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v)))throw Error('頭数は0以上の整数で入力してください。');return Number(v);};
  r.date=String(f.get('date')||'');if(!I.validDate(r.date))throw Error('確認日を入力してください。');
  r.rows.forEach((row,i)=>{
    if(row.area==='yard'&&f.get('yard_weight_'+i)!==null){
      const weight=number('yard_weight_'+i),month=number('yard_month_'+i);
      if(weight!==null&&weight%10!==0)throw Error('運動場の体重は10kg単位で選択してください。');
      if(weight!==inventoryYardWeight(row)){row.registeredWeight=weight;row.category=I.CATEGORIES.includes(String(weight))?String(weight):'';row.autoCategory=false;}
      if(month!==F.yardBirthMonth(row)||row.birthMonth!==undefined)row.birthMonth=month;
      return;
    }
    row.count=number('count_'+i);row.birthDate=String(f.get('birth_'+i)||'');row.sowId=String(f.get('sow_'+i)||'').trim();const csf=f.get('csf_'+i);row.csf=csf===''?null:csf==='true';row.category=String(f.get('category_'+i)||'');});
  INVENTORY_PLAN_STOCK.forEach(k=>r.plannedStock[k]=number('stock_plan_'+k));
  r.monthly.forEach((x,i)=>{x.planned=number('planned_'+i);x.actual=number('actual_'+i);});r.weekly=r.weekly.map((x,i)=>number('week_'+i));r.remarks=String(f.get('remarks')||'');
  r.status='draft';I.validateReport(r,r.month);return r;
}
function inventoryUpdate(target){
  const c=inventoryContext(),previousPlan=c.report.plannedStock;c.report=inventoryRead();c.dirty=true;
  if(target?.name?.startsWith('stock_plan_')){const k=target.name.slice(11);if(c.report.plannedStock[k]!==previousPlan[k]&&!c.report.stockPlanEdited.includes(k))c.report.stockPlanEdited.push(k);}
  if(target?.name?.startsWith('category_'))c.report.rows[Number(target.name.slice(9))].autoCategory=false;
  if(target?.name==='date'||target?.name?.startsWith('birth_'))c.report.rows.forEach((row,i)=>{if(row.autoCategory){row.category=I.category(row.area,row,c.report.date,row.birthDate);document.querySelector('[name="category_'+i+'"]').value=row.category;}});
  document.getElementById('inventory-totals').innerHTML=inventoryTotals(c.report);
  I.syncPlan(c.report);
  if(!c.report.stockPlanEdited.length)I.STOCK.forEach(k=>{const input=document.querySelector('[name="stock_plan_'+k+'"]');if(input)input.value=c.report.plannedStock[k]??'';});
  const total=document.getElementById('inventory-weekly-total');if(total)total.textContent=I.weeklyTotal(c.report)+'頭';
  const stock=I.actualStock(c.report);document.querySelectorAll('[data-stock]').forEach(el=>el.textContent=stock[el.dataset.stock]);
  const stockTotals=inventoryStockTotals(c.report);document.querySelectorAll('[data-inventory-stock-total]').forEach(el=>el.innerHTML=inventoryStockTotalText(stockTotals[el.dataset.inventoryStockTotal]));
  document.querySelectorAll('[data-inventory-monthly-totals]').forEach(el=>el.innerHTML=inventoryMonthlyTotalSummary(c.report));
  document.getElementById('inventory-status').textContent=c.report.month+' · 未保存の変更あり';
  const snapshotStatus=document.getElementById('inventory-snapshot-status');if(snapshotStatus)snapshotStatus.textContent='未保存の変更あり';
  document.querySelectorAll('#inventory-panel-1 [data-inventory-farm-total]').forEach(el=>el.outerHTML=inventoryFarmTotals(c.report));
  document.querySelectorAll('[data-inventory-subtotal]').forEach(el=>el.innerHTML=inventoryGroupSubtotal(c.report.rows.filter(row=>row.area===el.dataset.inventorySubtotal)));
  document.querySelectorAll('[data-inventory-finishing-total]').forEach(el=>el.textContent='合計 '+inventoryHeadcountText(c.report.rows.filter(row=>row.area==='finishing')));
  c.report.rows.forEach((row,i)=>{const label=document.getElementById('inventory-birth-label-'+i);if(label)label.textContent=inventoryBirthLabel(row.birthDate);});
  document.getElementById('inventory-date-label').textContent='確認日：'+c.report.date.replaceAll('-','/');
  document.getElementById('inventory-error').textContent='';
}
document.addEventListener('input',e=>{
  if(page!=='inventory'||!e.target.closest('#inventory-form')||!inventoryCanEdit())return;
  try{inventoryUpdate(e.target);}catch(err){document.getElementById('inventory-error').textContent=err.message;}
});
document.addEventListener('change',e=>{
  if(page!=='inventory')return;
  try{
    if(e.target.id==='inventory-history-month'&&e.target.value){inventorySwitchMonth(e.target.value);return;}
    if(e.target.closest('#inventory-form')&&inventoryCanEdit())inventoryUpdate(e.target);
  }catch(err){document.getElementById('inventory-error').textContent=err.message;}
});
document.addEventListener('submit',e=>{if(e.target.id==='inventory-form')e.preventDefault();});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-inventory]');if(!b||page!=='inventory')return;
  const action=b.dataset.inventory;
  if(action==='tab'){inventorySelectStep(Number(b.dataset.step));return;}
  try{
    if(action==='open'){const month=document.getElementById('inventory-month').value;inventorySwitchMonth(month);return;}
    const c=inventoryContext();
    if(action==='print'){inventoryPrint(b.dataset.print);return;}
    if(action==='month-prev'||action==='month-next'){inventorySwitchMonth(inventoryOffsetMonth(c.report.month,action==='month-prev'?-1:1));return;}
    if(action==='month-today'){inventorySwitchMonth(inventoryLocalMonth());return;}
    if(action==='shipment-reference'){inventoryShipmentReference(I.previousMonth(c.report.month));return;}
    if(action==='edit'){if(c.hasSnapshot===false)throw Error('この月の保存記録はありません。');c.editing=true;render();return;}
    if(action!=='revision'&&action!=='refresh'&&!inventoryCanEdit(c))throw Error('閲覧中の月です。「この月を編集する」から編集してください。');
    if(action==='plan-reset'){
      if(!window.confirm('当月計画を当月実数と同じ頭数に置き換え、下書きとして保存します。手入力の計画値は置き換わります。前月・当月実数・月別計画・週別計画は変更しません。よろしいですか？'))return;
      const report=inventoryRead();I.resetPlan(report);report.status='draft';inventoryStoreSnapshot(c,report);render();toast('当月実数を当月計画へコピーし、下書きに保存しました');return;
    }
    if(action==='yard-add'||action==='yard-remove'){
      const report=inventoryRead();
      if(action==='yard-add'){
        if(report.rows.length>=200)throw Error('明細は200行までです。');
        report.rows.push(I.yardIndividualRow());
      }else{
        const index=Number(b.dataset.row);if(report.rows[index]?.area!=='yard')throw Error('運動場の行が見つかりません。');
        if(!window.confirm('この運動場の1行を頭数調べから削除しますか？肉豚舎の現在頭数は変わりません。'))return;
        report.rows.splice(index,1);
      }
      c.report=report;c.dirty=true;render();return;
    }
    if(action==='step'){
      const input=document.querySelector('[name="count_'+b.dataset.row+'"]');if(!input)return;
      const current=input.value===''?0:Number(input.value);if(!Number.isSafeInteger(current)||current<0)throw Error('頭数を確認してください。');
      input.value=String(Math.min(c.report.rows[Number(b.dataset.row)]?.area==='yard'?1:Infinity,Math.max(0,current+Number(b.dataset.delta))));inventoryUpdate();return;
    }
    if(action==='refresh'){
      if(c.report.month!==inventoryLocalMonth())throw Error('現在データの取り込みは今月を開いて行ってください。');
      if((db.inventoryMonths?.[c.report.month]||c.hasSnapshot!==false||c.dirty)&&!window.confirm(inventoryMonthLabel(c.report.month)+'の①を現在の豚舎データで取り込み直します。①の修正内容と確認日は置き換わります。出荷計画の手入力と保存済み履歴は残ります。取り込み直した内容を下書きとして保存します。よろしいですか？'))return;
      const report=c.hasSnapshot===false?I.clone(c.report):inventoryRead();report.date=today();report.sowSnapshot={ids:Object.values(state.sows).filter(s=>s.active&&!s.numberPending).map(s=>s.id)};report.rows=I.snapshot(db,state,report.date,roomBirthDate);I.syncPlan(report);report.status='draft';inventoryStoreSnapshot(c,report);c.editing=true;render();toast('現在の豚舎データを取り込み、今月の下書きに保存しました');return;
    }
    if(action==='carry'){
      const previous=db.inventoryMonths?.[I.previousMonth(c.report.month)];if(!previous)throw Error('前月の保存済み記録がありません。先に前月を保存してください。');
      if(!window.confirm('前月の保存済み計画・実績で、同じ年月の欄を置き換えます。棚卸の前月欄も取り込みます。当月計画・週別入力は保持します。'))return;
      const report=inventoryRead();report.monthly=report.monthly.map(x=>I.clone(previous.monthly.find(p=>p.month===x.month)||x));
      report.previousStock=I.plannedStock(previous);report.previousConfirmed=previous.status==='confirmed';
      report.carriedFrom=previous.month;c.report=report;c.dirty=true;render();return;
    }
    if(action==='save'||action==='confirm'){
      const report=inventoryRead();I.syncPlan(report);report.status=action==='confirm'?'confirmed':'draft';I.validateReport(report,report.month);
      inventoryStoreSnapshot(c,report);render();toast(action==='confirm'?'頭数調べを確定しました':'下書きを保存しました');return;
    }
    if(action==='revision'){
      const entry=c.report.revisions[Number(b.dataset.index)];if(!entry)return;const r=entry.report,stock=I.currentStock(r);
      modal.innerHTML=`<h2>${esc(r.month)} 更新前の記録</h2><p>${esc(entry.savedAt)} · 確認日 ${esc(r.date)}</p>${inventoryTotals(r)}<details><summary>明細・前月棚卸を見る</summary><div class="inventory-scroll"><table class="inventory-table"><tr><th>場所</th><th>頭数</th><th>誕生日／誕生月</th><th>母豚</th><th>体重区分</th><th>区分</th></tr>${r.rows.map(row=>`<tr><th>${esc(inventoryDisplayPlace(row))}</th><td>${row.count??'未入力'}</td><td>${row.area==='yard'?(F.yardBirthMonth(row)?F.yardBirthMonth(row)+'月':'未入力'):esc(row.birthDate||'未入力')}</td><td>${esc(row.sowId||'未入力')}</td><td>${esc(inventoryLabel(row.category)||'要確認')}</td><td>${esc(I.rowKind(row))}</td></tr>`).join('')}</table></div><p>前月棚卸：${INVENTORY_PLAN_STOCK.map(k=>inventoryLabel(k)+' '+(r.previousStock[k]??'未入力')).join(' ／ ')}</p></details><h3>出荷計画</h3>${inventoryPlan(r,true)}<button class="btn secondary" data-action="close">閉じる</button>`;if(!dlg.open)dlg.showModal();
    }
  }catch(err){const output=document.getElementById('inventory-error');if(output)output.textContent=err.message;else toast(err.message);}
});

// Display-only state: keep all three form panels mounted so unsaved inputs survive.
function inventorySelectStep(step,focus=false){
  if(![1,2,3].includes(step))return;
  inventoryStep=step;
  document.querySelectorAll('#inventory-steps [role="tab"]').forEach(tab=>{
    const selected=Number(tab.dataset.step)===step;
    tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
    if(selected&&focus)tab.focus();
  });
  document.querySelectorAll('#inventory-form [data-inventory-panel]').forEach(panel=>panel.hidden=Number(panel.dataset.inventoryPanel)!==step);
}
document.addEventListener('keydown',e=>{
  const tab=e.target.closest('#inventory-steps [role="tab"]');if(!tab||page!=='inventory')return;
  const current=Number(tab.dataset.step),next=({ArrowRight:current%3+1,ArrowLeft:(current+1)%3+1,Home:1,End:3})[e.key];
  if(next){e.preventDefault();inventorySelectStep(next,true);}
});
