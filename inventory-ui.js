'use strict';
const I=TanakaInventory;
let inventoryMonth='',inventoryDrafts=new Map(),inventoryStep=1;
function inventoryLocalMonth(){return today().slice(0,7);}
function inventoryContext(){
  const month=inventoryMonth||inventoryLocalMonth();inventoryMonth=month;
  if(!inventoryDrafts.has(month)){
    const saved=db.inventoryMonths?.[month],report=saved?I.clone(saved):I.create(db,state,month,today(),roomBirthDate);
    inventoryDrafts.set(month,{report,expected:JSON.stringify(saved??null),dirty:false});
  }
  return inventoryDrafts.get(month);
}
function inventoryLabel(k){return /^\d+$/.test(k)?k+'kg':k;}
function inventoryNumber(name,value,label){return `<input type="number" min="0" step="1" inputmode="numeric" name="${name}" value="${value??''}" aria-label="${esc(label)}" placeholder="未入力">`;}
function inventoryPage(){
  const c=inventoryContext(),r=c.report,months=Object.keys(db.inventoryMonths||{}).sort().reverse();
  return `<h2 class="inventory-title">頭数調べ</h2><form id="inventory-form"><div class="inventory-compact-header"><p><b>対象月：${Number(r.month.slice(0,4))}年${Number(r.month.slice(5,7))}月</b></p><div class="inventory-compact-date"><label for="inventory-date">確認日：</label><input id="inventory-date" name="date" aria-label="確認日（日齢判定の基準）" type="date" value="${r.date}" required></div></div><div id="inventory-steps" class="inventory-step-tabs" role="tablist" aria-label="月末作業の3段階">${[[1,'①確認・修正'],[2,'②体重別集計'],[3,'③出荷計画']].map(([step,label])=>`<button type="button" id="inventory-tab-${step}" role="tab" data-inventory="tab" data-step="${step}" aria-controls="inventory-panel-${step}" aria-selected="${inventoryStep===step}" tabindex="${inventoryStep===step?0:-1}">${label}</button>`).join('')}</div><section id="inventory-panel-1" role="tabpanel" aria-labelledby="inventory-tab-1" data-inventory-panel="1" ${inventoryStep===1?'':'hidden'}><h2 id="inventory-step1">① 確認・修正</h2><div class="inventory-scroll"><table class="inventory-table inventory-rows"><caption>各場所の頭数確認（横にスクロールできます）</caption><thead><tr><th scope="col">場所／部屋</th><th scope="col">頭数</th><th scope="col">誕生日</th><th scope="col">母豚番号</th><th scope="col">豚熱</th><th scope="col">体重区分</th><th scope="col">区分</th></tr></thead><tbody>${r.rows.map((row,i)=>`<tr><th scope="row">${esc(row.place)}<small>${esc(({waiting:'分娩待ち（子豚0頭）',empty:'空き',unknown:'在室未確認',family:'授乳',piglets:'離乳',occupied:'在室'})[row.state]||'')}${row.registeredWeight!==null?' · 登録'+row.registeredWeight+'kg':''}</small></th><td><div class="inventory-counter"><button type="button" data-inventory="step" data-row="${i}" data-delta="-1" aria-label="${esc(row.place)}の頭数を1減らす">−1</button>${inventoryNumber('count_'+i,row.count,row.place+'の頭数')}<button type="button" data-inventory="step" data-row="${i}" data-delta="1" aria-label="${esc(row.place)}の頭数を1増やす">＋1</button></div></td><td><input type="date" name="birth_${i}" value="${esc(row.birthDate)}" aria-label="${esc(row.place)}の誕生日"></td><td><input name="sow_${i}" value="${esc(row.sowId)}" aria-label="${esc(row.place)}の母豚番号" placeholder="未入力／混成"></td><td><select name="csf_${i}" aria-label="${esc(row.place)}の豚熱">${[['','未確認'],['false','未'],['true','済']].map(([v,t])=>`<option value="${v}" ${(row.csf===null?'':String(row.csf))===v?'selected':''}>${t}</option>`).join('')}</select></td><td><select name="category_${i}" aria-label="${esc(row.place)}の体重区分"><option value="">要確認</option>${I.CATEGORIES.map(k=>`<option value="${k}" ${row.category===k?'selected':''}>${inventoryLabel(k)}</option>`).join('')}</select></td><td>${esc(row.kind)}</td></tr>`).join('')}</tbody></table></div></section><section id="inventory-panel-2" role="tabpanel" aria-labelledby="inventory-tab-2" data-inventory-panel="2" ${inventoryStep===2?'':'hidden'}><h2 id="inventory-step2">② 体重別集計</h2><div id="inventory-totals">${inventoryTotals(r)}</div></section><section id="inventory-panel-3" role="tabpanel" aria-labelledby="inventory-tab-3" data-inventory-panel="3" ${inventoryStep===3?'':'hidden'}><h2 id="inventory-step3">③ 出荷計画</h2><p class="muted">110は出荷予定の別枠です。②の在庫合計には加えません。10kgも手入力枠です。20〜100kg・離乳・授乳は①から自動反映します。</p><div class="inventory-scroll"><table class="inventory-table"><caption>${r.month} 出荷計画報告書 · 棚卸</caption><thead><tr><th scope="col">棚卸</th>${I.STOCK.map(k=>`<th scope="col">${k==='110'?'110（出荷予定）':inventoryLabel(k)}</th>`).join('')}</tr></thead><tbody><tr><th scope="row">前月頭数</th>${I.STOCK.map(k=>`<td>${inventoryNumber('previous_'+k,r.previousStock[k],'前月 '+inventoryLabel(k))}</td>`).join('')}</tr><tr><th scope="row">当月頭数</th>${I.STOCK.map(k=>`<td>${k==='110'?inventoryNumber('shipping110',r.shipping110,'当月110 出荷予定'):k==='10'?inventoryNumber('stock10',r.stock10,'当月10kg'):`<output data-stock="${k}">${I.currentStock(r)[k]}</output>`}</td>`).join('')}</tr></tbody></table></div><p class="muted">${r.previousConfirmed?'前月の確定記録から頭数を引き継ぎました。':'前月の確定記録がないため、前月頭数は未入力です。必要に応じて入力してください。'}${r.carriedFrom?' 出荷計画は'+r.carriedFrom+'から同じ年月の欄を引き継いでいます。':''} 前月の保存記録は変更しません。</p><div class="inventory-scroll"><table class="inventory-table"><caption>${r.month.slice(0,4)}年 月別出荷計画</caption><thead><tr><th scope="col">区分</th>${r.monthly.map(x=>`<th scope="col">${Number(x.month.slice(5))}月</th>`).join('')}</tr></thead><tbody><tr><th scope="row">予定頭数</th>${r.monthly.map((x,i)=>`<td>${inventoryNumber('planned_'+i,x.planned,x.month+'予定頭数')}</td>`).join('')}</tr><tr><th scope="row">実績頭数</th>${r.monthly.map((x,i)=>`<td>${inventoryNumber('actual_'+i,x.actual,x.month+'実績頭数')}</td>`).join('')}</tr></tbody></table></div><button type="button" class="btn secondary" data-inventory="carry">前月の保存済み計画・実績を取り込む</button><p class="muted">実際の出荷が確定した月は「実績頭数」に入力します。予定値も残し、翌月には両方を引き継ぎます。年が変わった月の計画欄は新しい年で作成し、前年の記録は保存済みの月から確認できます。</p><div class="inventory-scroll"><table class="inventory-table"><caption>${r.month} 週別出荷頭数</caption><thead><tr>${r.weekly.map((x,i)=>`<th scope="col">第${i+1}週</th>`).join('')}</tr></thead><tbody><tr>${r.weekly.map((x,i)=>`<td>${inventoryNumber('week_'+i,x,'第'+(i+1)+'週出荷頭数')}</td>`).join('')}</tr></tbody></table></div><label for="inventory-remarks">備考</label><textarea id="inventory-remarks" name="remarks">${esc(r.remarks)}</textarea></section><div class="card inventory-save"><p class="error" id="inventory-error" role="alert"></p><button type="button" class="btn secondary" data-inventory="save">下書きを保存</button><button type="button" class="btn" data-inventory="confirm">確認済みとして保存</button><p class="muted">修正して保存するたびに前の内容を履歴に残します。未入力の頭数や体重区分がある間は下書き保存できます。</p></div></form><details class="card inventory-options"><summary>過去の頭数調べを見る・その他の操作</summary><div class="card inventory-month"><label for="inventory-month">対象月</label><input id="inventory-month" type="month" value="${r.month}"><button class="btn secondary" data-inventory="open">この月を開く</button><label for="inventory-history-month">保存済みの月</label><select id="inventory-history-month"><option value="">選択してください</option>${months.map(m=>`<option value="${m}" ${m===r.month?'selected':''}>${m} · ${db.inventoryMonths[m].status==='confirmed'?'確定':'下書き'}</option>`).join('')}</select><p id="inventory-status" role="status">${r.month} · ${r.status==='confirmed'?'確定済み':'下書き'}${c.dirty?'（未保存の変更あり）':!db.inventoryMonths?.[r.month]?'（未保存）':''}</p><p class="muted">月次記録だけを修正します。各舎の日常記録の頭数・体重は変更しません。</p></div><div class="inventory-help"><button type="button" class="btn secondary" data-inventory="refresh">現在の飼育データを取り直す</button><p class="muted">自動取込は現在の状態です。過去月の状態は再現しません。確認日・誕生日の変更で日齢区分を再判定します。手動で選んだ区分は維持します。取り直すと明細の手修正が置き換わります。</p><p class="muted">50〜70日齢は20kg、育成舎の71日齢以上は30kg。50日齢未満は授乳／離乳。その他や日齢不明は体重区分を確認してください。母豚本人は数えず、子豚と肉豚を集計します。</p><p class="muted">育成母豚は別枠で、②と③の肉豚集計には含めません。分娩舎の子豚の豚熱・運動場の未登録項目は「未確認」で表示します。</p></div></details>${inventoryRevisionList(r)}`;
}
function inventoryTotals(r){
  const s=I.aggregate(r.rows),max=Math.max(1,...Object.values(s.totals));
  return `<div class="card"><p><b>肉豚・子豚 合計 ${s.total}頭</b> ／ 育成母豚 ${s.gilts}頭（別枠）</p><p role="status">${s.unknown?'頭数未入力 '+s.unknown+'室。':''}${s.unclassified?'体重区分 要確認 '+s.unclassified+'頭。':''}${!s.unknown&&!s.unclassified?'全ての頭数・体重区分を確認できます。':'未確認分は以下の合計に含めていません。'}</p><table class="inventory-table inventory-summary"><caption>体重区分別頭数</caption><thead><tr><th scope="col">体重区分</th><th scope="col">頭数</th><th scope="col">棒グラフ</th></tr></thead><tbody>${I.CATEGORIES.map(k=>`<tr><th scope="row">${inventoryLabel(k)}</th><td>${s.totals[k]}頭</td><td><div class="inventory-bar" role="img" aria-label="${inventoryLabel(k)} ${s.totals[k]}頭"><span style="width:${s.totals[k]/max*100}%"></span></div></td></tr>`).join('')}</tbody></table></div>`;
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
    if(action==='step'){
      const input=document.querySelector('[name="count_'+b.dataset.row+'"]');if(!input)return;
      const current=input.value===''?0:Number(input.value);if(!Number.isSafeInteger(current)||current<0)throw Error('頭数を確認してください。');
      input.value=String(Math.max(0,current+Number(b.dataset.delta)));inventoryUpdate();return;
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
      modal.innerHTML=`<h2>${esc(r.month)} 更新前の記録</h2><p>${esc(entry.savedAt)} · 確認日 ${esc(r.date)}</p>${inventoryTotals(r)}<details><summary>明細・前月棚卸を見る</summary><div class="inventory-scroll"><table class="inventory-table"><tr><th>場所</th><th>頭数</th><th>誕生日</th><th>母豚</th><th>豚熱</th><th>体重区分</th><th>区分</th></tr>${r.rows.map(row=>`<tr><th>${esc(row.place)}</th><td>${row.count??'未入力'}</td><td>${esc(row.birthDate||'未入力')}</td><td>${esc(row.sowId||'未入力')}</td><td>${row.csf===null?'未確認':row.csf?'済':'未'}</td><td>${esc(inventoryLabel(row.category)||'要確認')}</td><td>${esc(row.kind)}</td></tr>`).join('')}</table></div><p>前月棚卸：${I.STOCK.map(k=>inventoryLabel(k)+' '+(r.previousStock[k]??'未入力')).join(' ／ ')}</p></details><h3>出荷計画</h3><p>110（出荷予定）${stock['110']}頭 · 10kg ${stock['10']}頭</p><div class="inventory-scroll"><table class="inventory-table"><tr><th>月</th><th>予定</th><th>実績</th></tr>${r.monthly.map(x=>`<tr><th>${x.month}</th><td>${x.planned??'未入力'}</td><td>${x.actual??'未入力'}</td></tr>`).join('')}</table></div><p>週別：${r.weekly.map((x,i)=>(i+1)+'週 '+(x??'未入力')).join(' ／ ')}</p><p class="history-note">備考：${esc(r.remarks)}</p><button class="btn secondary" data-action="close">閉じる</button>`;if(!dlg.open)dlg.showModal();
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
