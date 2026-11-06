'use strict';
let annualYear='',annualMetric='farrowings';
const annualLabels={farrowings:['分娩回数','回'],piglets:['総産子数','頭'],shipments:['総出荷数','頭']};
const annualNumber=n=>n.toLocaleString('ja-JP');
const annualSigned=n=>(n>0?'+':'')+annualNumber(n);
function annualSummary(){
 if(!annualYear)annualYear=today().slice(0,4);
 const s=TanakaAnnual.summary(db,annualYear),m=annualMetric,[label,unit]=annualLabels[m],max=Math.max(1,...s.monthly.map(x=>x[m]));
 return `<section class="annual-summary" aria-label="年間実績"><div class="annual-heading"><h2>年間実績</h2><div class="annual-years"><button type="button" data-annual="year" data-delta="-1" aria-label="前年の実績" ${Number(annualYear)<=1000?'disabled':''}>‹</button><strong aria-live="polite">${annualYear}年</strong><button type="button" data-annual="year" data-delta="1" aria-label="翌年の実績" ${Number(annualYear)>=9999?'disabled':''}>›</button></div></div><div class="annual-cards">${TanakaAnnual.metrics.map(k=>{const [name,u]=annualLabels[k],v=s[k];return `<button type="button" class="annual-card annual-${k}" data-annual="edit" data-metric="${k}" aria-label="${annualYear}年 ${name} ${v.total}${u} 補正を編集"><span>年間<br>${name}</span><strong>${annualNumber(v.total)}<small>${u}</small></strong><span class="annual-card-foot">${v.adjustment?'補正 '+annualSigned(v.adjustment)+u:'タップで補正'}</span></button>`;}).join('')}</div>${TanakaAnnual.metrics.some(k=>s[k].total<0)?'<p class="error">記録の修正により年間合計がマイナスになっています。補正値を見直してください。</p>':''}${s.missingPiglets?`<p class="muted">出産数が未入力の分娩が${s.missingPiglets}回あります。総産子数は入力済みの頭数の合計です。</p>`:''}${m==='shipments'?`<button type="button" class="btn secondary" data-action="fin-shipment-monthly" data-year="${annualYear}">過去の月別出荷実績を入力</button>`:''}<div class="card annual-chart annual-${m}"><h3>月別実績 <small>自動集計のみ</small></h3><div class="annual-tabs" role="group" aria-label="月別グラフの項目">${TanakaAnnual.metrics.map(k=>`<button type="button" class="annual-${k}" data-annual="metric" data-metric="${k}" aria-pressed="${m===k}">${annualLabels[k][0]}</button>`).join('')}</div><p class="annual-chart-caption">${annualYear}年 ${label} ／ 単位：${unit}</p><div class="annual-bars" role="img" aria-label="${annualYear}年 月別${label}：${s.monthly.map(x=>x.month+'月 '+x[m]+unit).join('、')}">${s.monthly.map(x=>`<div class="annual-column"><span class="annual-bar-value">${annualNumber(x[m])}</span><div class="annual-track"><span style="height:${x[m]/max*100}%"></span></div><span class="annual-month">${x.month}</span></div>`).join('')}</div><p class="annual-chart-note">1〜12月の実績。年間の手動補正はグラフに含みません。</p></div><details class="annual-basis"><summary>集計の基準・月別の数字</summary><p class="muted">分娩は年付きの実分娩日を基準に、産次履歴と照合して集計します。総産子数は登録済みの出産数（生存頭数）です。死産数・離乳頭数・予定は加算しません。出荷履歴の追加・除外を反映し、委託は含めません。年が不明な記録は含めません。</p><div class="annual-table-wrap"><table><thead><tr><th>月</th><th>分娩回数</th><th>産子数</th><th>出荷数</th></tr></thead><tbody>${s.monthly.map(x=>`<tr><th>${x.month}月</th><td>${x.farrowings}回</td><td>${x.piglets}頭${x.missingPiglets?'＋未入力':''}</td><td>${x.shipments}頭</td></tr>`).join('')}</tbody></table></div></details></section>`;
}
function editAnnual(metric){
 if(!TanakaAnnual.metrics.includes(metric))return;
 const year=annualYear||today().slice(0,4),s=TanakaAnnual.summary(db,year)[metric],[label,unit]=annualLabels[metric],basis=db;
 form(year+'年 '+label,`<p>自動集計：<b>${annualNumber(s.automatic)}${unit}</b></p><label for="annualAdjustment">手動補正（減らす場合はマイナス）</label><div class="annual-adjust-controls"><button type="button" data-annual="step" data-delta="-1" aria-label="補正値を1減らす">−</button><input id="annualAdjustment" name="annualAdjustment" type="number" step="1" value="${s.adjustment}" required><button type="button" data-annual="step" data-delta="1" aria-label="補正値を1増やす">＋</button></div><p class="muted">年間合計だけを補正します。元の記録と月別グラフは変更しません。</p><div class="annual-preview"><span>最終表示</span><strong id="annualFinal" aria-live="polite">${annualNumber(s.total)}${unit}</strong><small id="annualEquation">${s.automatic} ＋ (${s.adjustment}) ＝ ${s.total}</small></div>`,'保存',f=>{
  if(db!==basis)throw Error('記録が更新されています。開き直して集計値を確認してください。');
  const raw=String(f.get('annualAdjustment')||'').trim();if(!/^[+-]?\d+$/.test(raw))throw Error('補正値は整数で入力してください。');
  save(d=>TanakaAnnual.setAdjustment(d,year,metric,Number(raw),s.adjustment));
 });
 const input=document.getElementById('annualAdjustment');
 input.oninput=()=>{const raw=input.value.trim(),n=Number(raw),valid=/^[+-]?\d+$/.test(raw)&&Number.isSafeInteger(n)&&Number.isSafeInteger(s.automatic+n);
  document.getElementById('annualFinal').textContent=valid?annualNumber(s.automatic+n)+unit:'整数を入力してください';
  document.getElementById('annualEquation').textContent=valid?s.automatic+' ＋ ('+n+') ＝ '+(s.automatic+n):'';
 };
 const cancel=document.querySelector('#form [data-action="close"]');if(cancel)cancel.textContent='キャンセル';
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-annual]');if(!b||fatal)return;try{
 if(b.dataset.annual==='year'){annualYear=String(Number(annualYear||today().slice(0,4))+Number(b.dataset.delta));render();}
 if(b.dataset.annual==='metric'&&TanakaAnnual.metrics.includes(b.dataset.metric)){annualMetric=b.dataset.metric;render();}
 if(b.dataset.annual==='edit')editAnnual(b.dataset.metric);
 if(b.dataset.annual==='step'){const input=document.getElementById('annualAdjustment'),n=Number(input.value);if(Number.isSafeInteger(n)){input.value=String(n+Number(b.dataset.delta));input.oninput();}}
 }catch(err){toast(err.message);}});
