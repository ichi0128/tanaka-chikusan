'use strict';
const I=TanakaInventory;
let inventoryMonth='',inventoryDrafts=new Map(),inventoryStep=1;
function inventoryLocalMonth(){return today().slice(0,7);}
function inventoryContext(){
  const month=inventoryMonth||inventoryLocalMonth();inventoryMonth=month;
  if(!inventoryDrafts.has(month)){
    const saved=db.inventoryMonths?.[month],report=saved?I.clone(saved):I.create(db,state,month,today(),roomBirthDate);
    report.rows=inventoryEnsureFinishingRooms(I.individualYardRows(report.rows));
    inventoryDrafts.set(month,{report,expected:JSON.stringify(saved??null),dirty:false});
  }
  return inventoryDrafts.get(month);
}
function inventoryLabel(k){return /^\d+$/.test(k)?k+'kg':k;}
function inventoryNumber(name,value,label){return `<input type="number" min="0" step="1" inputmode="numeric" name="${name}" value="${value??''}" aria-label="${esc(label)}" placeholder="未入力">`;}
function inventoryPage(){
  const c=inventoryContext(),r=c.report,months=Object.keys(db.inventoryMonths||{}).sort().reverse();
  return `<h2 class="inventory-title">頭数調べ</h2><form id="inventory-form"><div class="inventory-compact-header"><p><b>対象月：${Number(r.month.slice(0,4))}年${Number(r.month.slice(5,7))}月</b></p><details class="inventory-date-picker"><summary id="inventory-date-label">確認日：${esc(r.date.replaceAll('-','/'))}</summary><label for="inventory-date">確認日を変更</label><input id="inventory-date" name="date" aria-label="確認日（日齢判定の基準）" type="date" value="${r.date}" required></details></div><div id="inventory-steps" class="inventory-step-tabs" role="tablist" aria-label="月末作業の3段階">${[[1,'①確認・修正'],[2,'②体重別集計'],[3,'③出荷計画']].map(([step,label])=>`<button type="button" id="inventory-tab-${step}" role="tab" data-inventory="tab" data-step="${step}" aria-controls="inventory-panel-${step}" aria-selected="${inventoryStep===step}" tabindex="${inventoryStep===step?0:-1}">${label}</button>`).join('')}</div><section id="inventory-panel-1" role="tabpanel" aria-labelledby="inventory-tab-1" data-inventory-panel="1" ${inventoryStep===1?'':'hidden'}><h2 id="inventory-step1">① 確認・修正</h2>${inventoryCountGroups(r)}</section><section id="inventory-panel-2" role="tabpanel" aria-labelledby="inventory-tab-2" data-inventory-panel="2" ${inventoryStep===2?'':'hidden'}><h2 id="inventory-step2">② 体重別集計</h2><div id="inventory-totals">${inventoryTotals(r)}</div></section><section id="inventory-panel-3" role="tabpanel" aria-labelledby="inventory-tab-3" data-inventory-panel="3" ${inventoryStep===3?'':'hidden'}><h2 id="inventory-step3">③ 出荷計画</h2><p class="muted">110は出荷予定の別枠です。②の在庫合計には加えません。10kgも手入力枠です。20〜100kg・離乳・授乳は①から自動反映します。</p><div class="inventory-scroll"><table class="inventory-table"><caption>${r.month} 出荷計画報告書 · 棚卸</caption><thead><tr><th scope="col">棚卸</th>${I.STOCK.map(k=>`<th scope="col">${k==='110'?'110（出荷予定）':inventoryLabel(k)}</th>`).join('')}</tr></thead><tbody><tr><th scope="row">前月頭数</th>${I.STOCK.map(k=>`<td>${inventoryNumber('previous_'+k,r.previousStock[k],'前月 '+inventoryLabel(k))}</td>`).join('')}</tr><tr><th scope="row">当月頭数</th>${I.STOCK.map(k=>`<td>${k==='110'?inventoryNumber('shipping110',r.shipping110,'当月110 出荷予定'):k==='10'?inventoryNumber('stock10',r.stock10,'当月10kg'):`<output data-stock="${k}">${I.currentStock(r)[k]}</output>`}</td>`).join('')}</tr></tbody></table></div><p class="muted">${r.previousConfirmed?'前月の確定記録から頭数を引き継ぎました。':'前月の確定記録がないため、前月頭数は未入力です。必要に応じて入力してください。'}${r.carriedFrom?' 出荷計画は'+r.carriedFrom+'から同じ年月の欄を引き継いでいます。':''} 前月の保存記録は変更しません。</p><div class="inventory-scroll"><table class="inventory-table"><caption>${r.month.slice(0,4)}年 月別出荷計画</caption><thead><tr><th scope="col">区分</th>${r.monthly.map(x=>`<th scope="col">${Number(x.month.slice(5))}月</th>`).join('')}</tr></thead><tbody><tr><th scope="row">予定頭数</th>${r.monthly.map((x,i)=>`<td>${inventoryNumber('planned_'+i,x.planned,x.month+'予定頭数')}</td>`).join('')}</tr><tr><th scope="row">実績頭数</th>${r.monthly.map((x,i)=>`<td>${inventoryNumber('actual_'+i,x.actual,x.month+'実績頭数')}</td>`).join('')}</tr></tbody></table></div><button type="button" class="btn secondary" data-inventory="carry">前月の保存済み計画・実績を取り込む</button><p class="muted">実際の出荷が確定した月は「実績頭数」に入力します。予定値も残し、翌月には両方を引き継ぎます。年が変わった月の計画欄は新しい年で作成し、前年の記録は保存済みの月から確認できます。</p><div class="inventory-scroll"><table class="inventory-table"><caption>${r.month} 週別出荷頭数</caption><thead><tr>${r.weekly.map((x,i)=>`<th scope="col">第${i+1}週</th>`).join('')}</tr></thead><tbody><tr>${r.weekly.map((x,i)=>`<td>${inventoryNumber('week_'+i,x,'第'+(i+1)+'週出荷頭数')}</td>`).join('')}</tr></tbody></table></div><label for="inventory-remarks">備考</label><textarea id="inventory-remarks" name="remarks">${esc(r.remarks)}</textarea></section><div class="card inventory-save"><p class="error" id="inventory-error" role="alert"></p><button type="button" class="btn secondary" data-inventory="save">下書きを保存</button><button type="button" class="btn" data-inventory="confirm">確認済みとして保存</button><p class="muted">修正して保存するたびに前の内容を履歴に残します。運動場は未入力でも確認済みとして保存できます。他の舎に未入力の頭数・体重区分がある場合は下書き保存できます。</p></div></form><details class="card inventory-options"><summary>過去の頭数調べを見る・その他の操作</summary><div class="card inventory-month"><label for="inventory-month">対象月</label><input id="inventory-month" type="month" value="${r.month}"><button class="btn secondary" data-inventory="open">この月を開く</button><label for="inventory-history-month">保存済みの月</label><select id="inventory-history-month"><option value="">選択してください</option>${months.map(m=>`<option value="${m}" ${m===r.month?'selected':''}>${m} · ${db.inventoryMonths[m].status==='confirmed'?'確定':'下書き'}</option>`).join('')}</select><p id="inventory-status" role="status">${r.month} · ${r.status==='confirmed'?'確定済み':'下書き'}${c.dirty?'（未保存の変更あり）':!db.inventoryMonths?.[r.month]?'（未保存）':''}</p><p class="muted">月次記録だけを修正します。各舎の日常記録の頭数・体重は変更しません。</p></div><div class="inventory-help"><button type="button" class="btn secondary" data-inventory="refresh">現在の飼育データを取り直す</button><p class="muted">自動取込は現在の状態です。過去月の状態は再現しません。確認日・誕生日の変更で日齢区分を再判定します。手動で選んだ区分は維持します。取り直すと明細の手修正が置き換わります。</p><p class="muted">50〜70日齢は20kg、育成舎の71日齢以上は30kg。50日齢未満は授乳／離乳。その他や日齢不明は体重区分を確認してください。母豚本人は数えず、子豚と肉豚を集計します。</p><p class="muted">育成母豚は別枠で、②と③の肉豚集計には含めません。</p></div></details>${inventoryRevisionList(r)}`;
}

function inventoryBirthLabel(value){return value?Number(value.slice(5,7))+'/'+Number(value.slice(8,10)):'未入力';}
function inventoryGroupSubtotal(rows){
  const known=rows.reduce((n,row)=>n+(row.count??0),0),unknown=rows.filter(row=>row.count===null).length,gilts=rows.filter(row=>row.kind==='育成母豚').reduce((n,row)=>n+(row.count??0),0);
  return `<b>小計 ${known}頭${unknown?' ＋ 頭数未入力 '+unknown+'件':''}</b>${gilts?`<small>うち育成母豚 ${gilts}頭（②・③では別枠）</small>`:''}`;
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
    return `<article class="inventory-finishing-room" style="grid-column:${col};grid-row:${pair}" aria-label="${esc(place)}の頭数調べ" data-inventory-room="${key}">${row.kind==='育成母豚'?'<small class="inventory-gilt-label">育成母豚</small>':''}<input type="hidden" name="csf_${i}" value="${row.csf===null?'':String(row.csf)}"><label>頭数</label><div class="inventory-counter"><button type="button" data-inventory="step" data-row="${i}" data-delta="-1" aria-label="${esc(place)}の頭数を1減らす">−</button>${inventoryNumber('count_'+i,row.count,place+'の頭数')}<button type="button" data-inventory="step" data-row="${i}" data-delta="1" aria-label="${esc(place)}の頭数を1増やす">＋</button></div><label for="inventory-birth-${i}">誕生日</label><details class="inventory-notebook-birth"><summary id="inventory-birth-label-${i}" aria-label="${esc(place)}の誕生日を変更">${inventoryBirthLabel(row.birthDate)}</summary><input id="inventory-birth-${i}" type="date" name="birth_${i}" value="${esc(row.birthDate)}" aria-label="${esc(place)}の誕生日"></details><label for="inventory-sow-${i}">母豚番号</label><input id="inventory-sow-${i}" name="sow_${i}" value="${esc(row.sowId)}" aria-label="${esc(place)}の母豚番号" placeholder="—"><label for="inventory-weight-${i}">体重(kg)</label><select id="inventory-weight-${i}" name="category_${i}" aria-label="${esc(place)}の体重区分"><option value="">未入力</option>${I.CATEGORIES.map(k=>`<option value="${k}" ${row.category===k?'selected':''}>${inventoryLabel(k)}</option>`).join('')}</select></article>`;
  };
  return `<div class="inventory-pair-headings"><b>左側</b><span>廊下</span><b>右側</b></div><div class="inventory-finishing-map"><div class="inventory-pair-corridor" aria-hidden="true"></div>${Array.from({length:12},(_,i)=>`<div class="inventory-pair-number" style="grid-column:2;grid-row:${i+1}" aria-label="左右${i+1}番の廊下">${i+1}</div>`).join('')}${FINISHING_DISPLAY_COLUMNS.left.map((n,i)=>card(n,1,i+1)).join('')}${FINISHING_DISPLAY_COLUMNS.right.map((n,i)=>card(n,3,i+1)).join('')}</div>`;
}
function inventoryCountGroups(r){
  return [['farrowing','分娩舎'],['nursery','育成舎'],['yard','運動場'],['finishing','肉豚舎']].map(([area,label])=>{
    const entries=r.rows.map((row,i)=>({row,i})).filter(x=>x.row.area===area),rows=entries.map(x=>x.row);
    const fields=entries.map(({row,i})=>`<div class="inventory-notebook-row"><div class="inventory-counter"><button type="button" data-inventory="step" data-row="${i}" data-delta="-1" aria-label="${esc(row.place)}の頭数を1減らす">−</button>${inventoryNumber('count_'+i,row.count,row.place+'の頭数').replace('<input ',row.area==='yard'?'<input max="1" ':'<input ')}<button type="button" data-inventory="step" data-row="${i}" data-delta="1" aria-label="${esc(row.place)}の頭数を1増やす">＋</button></div><select name="category_${i}" aria-label="${esc(row.place)}の体重区分"><option value="">${row.area==='yard'?'未入力':'要確認'}</option>${I.CATEGORIES.map(k=>`<option value="${k}" ${row.category===k?'selected':''}>${inventoryLabel(k)}</option>`).join('')}</select><details class="inventory-notebook-birth"><summary id="inventory-birth-label-${i}" aria-label="${esc(row.place)}の誕生日を変更">${inventoryBirthLabel(row.birthDate)}</summary><label for="inventory-birth-${i}">誕生日を変更</label><input id="inventory-birth-${i}" type="date" name="birth_${i}" value="${esc(row.birthDate)}" aria-label="${esc(row.place)}の誕生日"></details><input name="sow_${i}" value="${esc(row.sowId)}" aria-label="${esc(row.place)}の母豚番号" placeholder="未入力"></div>`).join('');
    return `<section class="inventory-area-group ${area==='finishing'?'inventory-finishing-group':'inventory-notebook'}" aria-label="${label}の頭数確認"><h3>${label}${area==='yard'?`<small class="muted">（1頭ずつ・${entries.length}行）</small>`:''}${area==='finishing'?`<span class="inventory-finishing-total" data-inventory-finishing-total aria-live="polite">合計 ${inventoryHeadcountText(rows)}</span>`:''}</h3>${area==='finishing'?inventoryFinishingMap(entries):`<div class="inventory-notebook-head" aria-hidden="true"><span>頭数</span><span>${area==='yard'?'体重(kg)':'体重'}</span><span>誕生日</span><span>母豚番号</span></div>${fields}`}${area==='finishing'?'':`<div class="inventory-group-subtotal" data-inventory-subtotal="${area}" aria-live="polite">${inventoryGroupSubtotal(rows)}</div>`}${area==='yard'?`<p class="muted">1頭につき1行です。未入力でも確認済みとして保存できます。</p><button type="button" class="btn secondary" data-inventory="yard-add">運動場に1頭分の行を追加</button><details class="inventory-notebook-info"><summary>運動場の行を削除</summary>${entries.map(({i},n)=>`<button type="button" class="btn secondary" data-inventory="yard-remove" data-row="${i}">${n+1}行目を削除</button>`).join('')}</details>`:''}${area==='finishing'?'':`<details class="inventory-notebook-info"><summary>場所・その他の情報</summary>${entries.map(({row,i})=>`<div class="inventory-notebook-meta"><span>${esc(row.place)} · ${esc(row.kind)}${row.registeredWeight!==null?' · 登録'+row.registeredWeight+'kg':''} · ${esc(({waiting:'分娩待ち',empty:'空き',unknown:'在室未確認',family:'授乳',piglets:'離乳',occupied:'在室'})[row.state]||'')}</span><input type="hidden" name="csf_${i}" value="${row.csf===null?'':String(row.csf)}"></div>`).join('')}</details>`}</section>`;
  }).join('');
}

function inventoryTotals(r){
  const s=I.aggregate(r.rows),max=Math.max(1,...Object.values(s.totals));
  const magnitude=10**Math.floor(Math.log10(max/5)),scaled=max/5/magnitude,step=Math.max(1,(scaled<=1?1:scaled<=2?2:scaled<=5?5:10)*magnitude),ceiling=Math.ceil((max+1)/step)*step;
  const colors=['#e793b9','#83c8ed','#8ac28e','#61ac7b','#f2d264','#eab85c','#ef995e','#e78060','#e16b63','#cf4f55','#a83448'];
  const ticks=Array.from({length:Math.round(ceiling/step)+1},(_,i)=>i*step),description=I.CATEGORIES.map(k=>inventoryLabel(k)+' '+s.totals[k]+'頭').join('、');
  return `<figure class="card inventory-weight-figure"><figcaption>体重別 頭数</figcaption><div class="inventory-weight-chart" role="img" aria-label="${esc(description)}"><div class="inventory-weight-axis" aria-hidden="true"><span class="inventory-axis-unit">頭</span>${ticks.map(n=>`<span style="bottom:${n/ceiling*100}%">${n}</span>`).join('')}</div><div class="inventory-weight-plot" aria-hidden="true">${ticks.map(n=>`<div class="inventory-weight-gridline" style="bottom:${n/ceiling*100}%"></div>`).join('')}<div class="inventory-weight-bars">${I.CATEGORIES.map((k,i)=>`<div class="inventory-weight-column"><div class="inventory-weight-bar" style="height:${s.totals[k]/ceiling*100}%;background:${colors[i]}"><b>${s.totals[k]}</b></div><span class="inventory-weight-tick">${inventoryLabel(k)}</span></div>`).join('')}</div></div></div></figure><section class="card inventory-weight-list"><div class="inventory-weight-list-heading"><h3>体重別 頭数一覧</h3><strong>合計 ${s.total}頭</strong></div><table class="inventory-table inventory-weight-summary"><thead><tr><th scope="col">体重区分</th><th scope="col">頭数</th><th scope="col">割合</th></tr></thead><tbody>${I.CATEGORIES.map((k,i)=>`<tr><th scope="row"><span class="inventory-weight-swatch" style="background:${colors[i]}" aria-hidden="true"></span>${inventoryLabel(k)}</th><td>${s.totals[k]}頭</td><td>${(s.total?s.totals[k]/s.total*100:0).toFixed(1)}%</td></tr>`).join('')}</tbody></table>${s.gilts?`<p class="muted">育成母豚 ${s.gilts}頭（別枠・合計に含めません）</p>`:''}<p class="muted" role="status">${s.unknown?'頭数未入力 '+s.unknown+'件。':''}${s.unclassified?'体重区分 未確認 '+s.unclassified+'頭。':''}${s.unknown||s.unclassified?'未確認分は合計・割合に含めていません。':'①の確認・修正内容から自動集計しています。'}</p></section>`;
}
function inventoryRevisionList(r){return `<details class="card inventory-revisions"><summary>この月の修正履歴（${r.revisions.length}件）</summary>${r.revisions.slice().reverse().map((x,i)=>`<button class="row row-action" data-inventory="revision" data-index="${r.revisions.length-1-i}">${esc(x.savedAt.replace('T',' ').slice(0,19))} 更新前 · ${x.report.status==='confirmed'?'確定':'下書き'} ›</button>`).join('')||'<p>保存後に修正すると、前の内容がここに残ります。</p>'}</details>`;}
function inventoryRead(){
  const c=inventoryContext(),r=I.clone(c.report),f=new FormData(document.getElementById('inventory-form'));
  const number=name=>{const v=String(f.get(name)??'').trim();if(v==='')return null;if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v)))throw Error('頭数は0以上の整数で入力してください。');return Number(v);};
  r.date=String(f.get('date')||'');if(!I.validDate(r.date))throw Error('確認日を入力してください。');
  r.rows.forEach((row,i)=>{row.count=number('count_'+i);row.birthDate=String(f.get('birth_'+i)||'');row.sowId=String(f.get('sow_'+i)||'').trim();const csf=f.get('csf_'+i);row.csf=csf===''?null:csf==='true';row.category=String(f.get('category_'+i)||'');});
  r.shipping110=number('shipping110')??0;r.stock10=number('stock10')??0;
  I.STOCK.forEach(k=>r.previousStock[k]=number('previous_'+k));
  r.monthly.forEach((x,i)=>{x.planned=number('planned_'+i);x.actual=number('actual_'+i);});r.weekly=r.weekly.map((x,i)=>number('week_'+i));r.remarks=String(f.get('remarks')||'');
  r.status='draft';I.validateReport(r,r.month);return r;
}
function inventoryUpdate(target){
  const c=inventoryContext();c.report=inventoryRead();c.dirty=true;
  if(target?.name?.startsWith('category_'))c.report.rows[Number(target.name.slice(9))].autoCategory=false;
  if(target?.name==='date'||target?.name?.startsWith('birth_'))c.report.rows.forEach((row,i)=>{if(row.autoCategory){row.category=I.category(row.area,row,c.report.date,row.birthDate);document.querySelector('[name="category_'+i+'"]').value=row.category;}});
  document.getElementById('inventory-totals').innerHTML=inventoryTotals(c.report);
  const stock=I.currentStock(c.report);document.querySelectorAll('[data-stock]').forEach(el=>el.textContent=stock[el.dataset.stock]);
  document.getElementById('inventory-status').textContent=c.report.month+' · 未保存の変更あり';
  document.querySelectorAll('[data-inventory-subtotal]').forEach(el=>el.innerHTML=inventoryGroupSubtotal(c.report.rows.filter(row=>row.area===el.dataset.inventorySubtotal)));
  document.querySelectorAll('[data-inventory-finishing-total]').forEach(el=>el.textContent='合計 '+inventoryHeadcountText(c.report.rows.filter(row=>row.area==='finishing')));
  c.report.rows.forEach((row,i)=>{const label=document.getElementById('inventory-birth-label-'+i);if(label)label.textContent=inventoryBirthLabel(row.birthDate);});
  document.getElementById('inventory-date-label').textContent='確認日：'+c.report.date.replaceAll('-','/');
  document.getElementById('inventory-error').textContent='';
}
document.addEventListener('input',e=>{
  if(page!=='inventory'||!e.target.closest('#inventory-form'))return;
  try{inventoryUpdate(e.target);}catch(err){document.getElementById('inventory-error').textContent=err.message;}
});
document.addEventListener('change',e=>{
  if(page!=='inventory')return;
  if(e.target.id==='inventory-history-month'&&e.target.value){inventoryMonth=e.target.value;render();return;}
  if(e.target.closest('#inventory-form'))try{inventoryUpdate(e.target);}catch(err){document.getElementById('inventory-error').textContent=err.message;}
});
document.addEventListener('submit',e=>{if(e.target.id==='inventory-form')e.preventDefault();});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-inventory]');if(!b||page!=='inventory')return;
  const action=b.dataset.inventory;
  if(action==='tab'){inventorySelectStep(Number(b.dataset.step));return;}
  try{
    if(action==='open'){const month=document.getElementById('inventory-month').value;if(!I.validMonth(month))throw Error('対象月を選んでください。');inventoryMonth=month;render();return;}
    const c=inventoryContext();
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
      if(!window.confirm('現在の飼育データで①の明細を取り直します。①の手修正は置き換わります。保存済みの履歴は残ります。'))return;
      const report=inventoryRead();report.rows=I.snapshot(db,state,report.date,roomBirthDate);report.status='draft';c.report=report;c.dirty=true;render();return;
    }
    if(action==='carry'){
      const previous=db.inventoryMonths?.[I.previousMonth(c.report.month)];if(!previous)throw Error('前月の保存済み記録がありません。先に前月を保存してください。');
      if(!window.confirm('前月の保存済み計画・実績で、同じ年月の欄を置き換えます。前月が確定済みなら前月頭数も取り込みます。'))return;
      const report=inventoryRead();report.monthly=report.monthly.map(x=>I.clone(previous.monthly.find(p=>p.month===x.month)||x));
      if(previous.status==='confirmed'){report.previousStock=I.currentStock(previous);report.previousConfirmed=true;}
      report.carriedFrom=previous.month;c.report=report;c.dirty=true;render();return;
    }
    if(action==='save'||action==='confirm'){
      const report=inventoryRead();report.status=action==='confirm'?'confirmed':'draft';I.validateReport(report,report.month);
      save(data=>I.saveReport(data,report,c.expected));
      c.report=I.clone(db.inventoryMonths[report.month]);c.expected=JSON.stringify(c.report);c.dirty=false;render();toast(action==='confirm'?'頭数調べを確定しました':'下書きを保存しました');return;
    }
    if(action==='revision'){
      const entry=c.report.revisions[Number(b.dataset.index)];if(!entry)return;const r=entry.report,stock=I.currentStock(r);
      modal.innerHTML=`<h2>${esc(r.month)} 更新前の記録</h2><p>${esc(entry.savedAt)} · 確認日 ${esc(r.date)}</p>${inventoryTotals(r)}<details><summary>明細・前月棚卸を見る</summary><div class="inventory-scroll"><table class="inventory-table"><tr><th>場所</th><th>頭数</th><th>誕生日</th><th>母豚</th><th>体重区分</th><th>区分</th></tr>${r.rows.map(row=>`<tr><th>${esc(inventoryDisplayPlace(row))}</th><td>${row.count??'未入力'}</td><td>${esc(row.birthDate||'未入力')}</td><td>${esc(row.sowId||'未入力')}</td><td>${esc(inventoryLabel(row.category)||'要確認')}</td><td>${esc(row.kind)}</td></tr>`).join('')}</table></div><p>前月棚卸：${I.STOCK.map(k=>inventoryLabel(k)+' '+(r.previousStock[k]??'未入力')).join(' ／ ')}</p></details><h3>出荷計画</h3><p>110（出荷予定）${stock['110']}頭 · 10kg ${stock['10']}頭</p><div class="inventory-scroll"><table class="inventory-table"><tr><th>月</th><th>予定</th><th>実績</th></tr>${r.monthly.map(x=>`<tr><th>${x.month}</th><td>${x.planned??'未入力'}</td><td>${x.actual??'未入力'}</td></tr>`).join('')}</table></div><p>週別：${r.weekly.map((x,i)=>(i+1)+'週 '+(x??'未入力')).join(' ／ ')}</p><p class="history-note">備考：${esc(r.remarks)}</p><button class="btn secondary" data-action="close">閉じる</button>`;if(!dlg.open)dlg.showModal();
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
