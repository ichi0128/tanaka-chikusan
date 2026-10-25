(function(root){
'use strict';
const CATEGORIES=['授乳','離乳','20','30','40','50','60','70','80','90','100'];
const STOCK=['110','100','90','80','70','60','50','40','30','20','10','離乳','授乳'];
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=message=>{throw Error(message);};
function count(value,nullable=true){if(value===null&&nullable)return true;return Number.isSafeInteger(value)&&value>=0;}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function validMonth(value){return typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);}
function previousMonth(month){if(!validMonth(month))fail('対象月を選んでください。');const [y,m]=month.split('-').map(Number);return m===1?(y-1)+'-12':y+'-'+String(m-1).padStart(2,'0');}
function age(birth,date){if(!validDate(birth)||!validDate(date))return null;const days=Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(birth+'T00:00:00Z'))/86400000);return days<0?null:days;}
function category(area,r,date,birth){
  if(r.state==='empty'||r.state==='waiting')return '';
  if(area==='finishing'||area==='yard')return CATEGORIES.includes(String(r.weight))?String(r.weight):'';
  const days=age(birth,date);if(days===null)return '';
  if(days>=50&&days<=70)return '20';
  if(area==='nursery'&&days>=71)return '30';
  if(days<50)return area==='farrowing'&&r.state==='family'?'授乳':'離乳';
  return '';
}
function yardIndividualRow(source={}){
  return {area:'yard',roomKey:'yard',place:'運動場',state:'occupied',birthDate:'',sowId:'',csf:null,category:'',autoCategory:false,registeredWeight:null,kind:'肉豚',...clone(source),key:'yard:pig:'+root.TanakaModel.uid(),count:source.count===null?null:1,yardIndividual:1};
}
function individualYardRows(rows){
  return rows.flatMap(row=>{
    if(row.area!=='yard'||row.yardIndividual===1)return [clone(row)];
    const n=row.count===null?1:row.count;
    if(!Number.isSafeInteger(n)||n<0||n>200)fail('運動場の頭数を確認してください。');
    return Array.from({length:n},()=>yardIndividualRow(row));
  });
}
function snapshot(data,state,date,roomBirthDate){
  if(!validDate(date))fail('確認日を入力してください。');
  const make=(area,r)=>{
    const birthDate=area==='farrowing'?roomBirthDate(r):r.birthDate||'';
    const inactive=r.state==='empty'||r.state==='waiting';
    return {key:area+':'+r.key,area,roomKey:area==='yard'?'yard':r.key,place:area==='farrowing'?'分娩舎 '+(r.label||r.key.slice(1))+'室':area==='nursery'?'育成舎 管理枠'+r.key.slice(1):area==='yard'?'運動場':'肉豚舎 '+r.key.slice(1)+'番',
      state:r.state,count:inactive?0:r.count??null,birthDate,...(area==='yard'?{birthMonth:r.birthMonth!==undefined?r.birthMonth:validDate(birthDate)?Number(birthDate.slice(5,7)):null}:{}),sowId:r.mixed?'混成':r.sowId||'',csf:typeof r.csf==='boolean'?r.csf:null,
      category:category(area,r,date,birthDate),autoCategory:area==='farrowing'||area==='nursery',registeredWeight:r.weight??null,kind:area==='yard'?(root.TanakaGilts?.yardKind(r,state)||r.kind||'肉豚'):rowKind({area,kind:r.kind||'肉豚'}),...(area==='yard'&&root.TanakaGilts?.linkedSow(r,state)?.numberPending===false?{registeredSowId:root.TanakaGilts.linkedSow(r,state).id}:{})};
  };
  return individualYardRows([...state.rooms.map(r=>make('farrowing',r)),...state.nursery.map(r=>make('nursery',r)),...state.finishing.flatMap(r=>{
    if(r.key!=='yard')return [make('finishing',r)];
    if(!Array.isArray(r.individuals))return [make('yard',r)];
    return r.individuals.map(pig=>({...make('yard',{...pig,state:'occupied'}),key:'yard:pig:'+pig.key,sourcePigKey:pig.key,yardIndividual:1}));
  })]);
}
// Old room records keep their stored values; stage names are a display/counting projection.
function rowKind(row){if(row.area==='yard'&&row.kind==='育成母豚候補')return '育成母豚';return row.kind==='育成母豚'&&row.area!=='yard'?'育成母豚候補':row.kind;}
function aggregate(rows){
  const totals=Object.fromEntries(CATEGORIES.map(k=>[k,0]));let gilts=0,candidates=0,sows=0,unclassified=0,unknown=0,headTotal=0;
  for(const r of rows){if(r.count===null){unknown++;continue;}headTotal+=r.count;const kind=rowKind(r);
    if(kind==='育成母豚候補')candidates+=r.count;if(kind==='育成母豚'){gilts+=r.count;continue;}if(kind==='母豚'){sows+=r.count;continue;}
    if(!r.count)continue;if(CATEGORIES.includes(r.category))totals[r.category]+=r.count;else unclassified+=r.count;
  }
  return {totals,gilts,candidates,sows,unclassified,unknown,headTotal,total:Object.values(totals).reduce((a,b)=>a+b,0)};
}
function boarSnapshot(data){return {boars:root.TanakaModel.boarRecords(data)};}
function farmSummary(report){
  const stats=aggregate(report.rows),ids=report.sowSnapshot?.ids,registered=ids?ids.length:0;
  const areaTotals=Object.fromEntries(['farrowing','nursery','finishing','yard'].map(area=>[area,report.rows.filter(r=>r.area===area).reduce((sum,r)=>sum+(r.count??0),0)]));
  // Rows record piglets in farrowing. Assign the mothers to their physical
  // location once; a linked mother already recorded in yard is not added again.
  const counted=new Set();
  for(const row of report.rows){
    if(rowKind(row)!=='母豚'||!ids?.includes(row.registeredSowId)||!row.count)continue;
    if(counted.has(row.registeredSowId))areaTotals[row.area]-=row.count;
    counted.add(row.registeredSowId);
  }
  const farrowingIds=new Set(report.rows.filter(r=>r.area==='farrowing'&&['family','waiting'].includes(r.state)).map(r=>r.sowId));
  for(const id of ids||[])if(!counted.has(id)){areaTotals[farrowingIds.has(id)?'farrowing':'yard']++;counted.add(id);}
  const boarCount=report.boarSnapshot?root.TanakaModel.activeBoars(report.boarSnapshot).length:null;
  return {...stats,sowCount:ids?registered:null,boarCount,areaTotals,farmTotal:Object.values(areaTotals).reduce((sum,n)=>sum+n,0)+(boarCount??0)};
}
function syncBoarSnapshot(report,data){
  const next=boarSnapshot(data);if(JSON.stringify(report.boarSnapshot)===JSON.stringify(next))return false;
  report.boarSnapshot=next;report.status='draft';return true;
}
function syncSavedBoars(data,month){
  const old=data.inventoryMonths?.[month];if(!old)return false;
  const report=clone(old);if(!syncBoarSnapshot(report,data))return false;
  saveReport(data,report,JSON.stringify(old));return true;
}

function currentStock(report){return {...Object.fromEntries(STOCK.map(k=>[k,0])),...aggregate(report.rows).totals,'110':report.shipping110??0,'10':report.stock10??0};}
// Actual inventory never includes the planning-only 110kg destination.
function actualStock(report){return {...Object.fromEntries(STOCK.map(k=>[k,0])),...aggregate(report.rows).totals};}
function plannedStock(report){return report.plannedStock?clone(report.plannedStock):currentStock(report);}
function yearActual(data,year){
  const reports=Object.values(data.inventoryMonths||{}).sort((a,b)=>b.month.localeCompare(a.month));
  const same=reports.find(r=>r.month.startsWith(year+'-')&&Array.isArray(r.previousYearActual));
  if(same)return clone(same.previousYearActual);
  const prior=String(Number(year)-1),records=reports.filter(r=>r.month.startsWith(prior+'-'));
  return Array.from({length:12},(_,i)=>{
    const key=prior+'-'+String(i+1).padStart(2,'0');
    for(const r of records){const x=r.monthly.find(x=>x.month===key);if(x?.actual!==null&&x?.actual!==undefined)return x.actual;}
    return null;
  });
}
function resetPlan(report){
  // A new plan is a detached copy of this month's verified rows only.
  // Legacy 110kg/10kg fields and previous months are never initial values.
  report.plannedStock=actualStock(report);report.stockPlanEdited=[];
  syncPlan(report);return report;
}
function needsOctoberPlanRepair(report){
  // Repair only the reported October test plan, never arbitrary saved plans.
  if(report?.month!=='2026-10'||report.stockPlanRepair==='october-test-v1')return false;
  const test={'110':0,'100':0,'90':11,'80':13,'70':13,'60':19,'50':15,'40':42,'30':27,'20':7,'10':0,'離乳':20,'授乳':32};
  return STOCK.every(k=>report.plannedStock?.[k]===test[k])&&
    Array.isArray(report.stockPlanEdited)&&report.stockPlanEdited.length===STOCK.length&&
    STOCK.every(k=>report.stockPlanEdited.includes(k));
}
function repairOctoberPlan(data,expected){
  const old=data.inventoryMonths?.['2026-10'];
  if(!needsOctoberPlanRepair(old))return false;
  const report=clone(old);resetPlan(report);report.stockPlanRepair='october-test-v1';
  // saveReport archives the exact prior report and checks concurrent changes.
  saveReport(data,report,expected);return true;
}
function preparePlan(report,data){
  if(!report.plannedStock)resetPlan(report);
  else{
    // Older saved plans may lack edit flags. Preserve them conservatively.
    if(!Array.isArray(report.stockPlanEdited))report.stockPlanEdited=STOCK.slice();
    syncPlan(report);
  }
  if(!report.previousYearActual)report.previousYearActual=yearActual(data,report.month.slice(0,4));
  return report;
}
function syncPlan(report){
  // Until the first manual edit, follow the verified actuals. Once edited,
  // retain the complete plan, including untouched categories, zero and blanks.
  const edited=Array.isArray(report.stockPlanEdited)?report.stockPlanEdited.length>0:!!report.plannedStock;
  if(!report.plannedStock||!edited)report.plannedStock=actualStock(report);
  // Keep legacy backup fields compatible without using them as initial values.
  report.shipping110=report.plannedStock['110']??0;report.stock10=report.plannedStock['10']??0;
}
function weeklyTotal(report){return report.weekly.reduce((sum,n)=>sum+(n??0),0);}
function create(data,state,month,date,roomBirthDate){
  if(!validMonth(month))fail('対象月を選んでください。');
  const prev=data.inventoryMonths?.[previousMonth(month)],year=month.slice(0,4);
  const report={month,date,status:'draft',boarSnapshot:boarSnapshot(data),sowSnapshot:{ids:Object.values(state.sows).filter(s=>s.active&&!s.numberPending).map(s=>s.id)},rows:snapshot(data,state,date,roomBirthDate),shipping110:0,stock10:0,
    previousStock:prev?plannedStock(prev):Object.fromEntries(STOCK.map(k=>[k,null])),
    carriedFrom:prev?prev.month:'',previousConfirmed:prev?.status==='confirmed',
    monthly:Array.from({length:12},(_,i)=>{const key=year+'-'+String(i+1).padStart(2,'0'),old=prev?.monthly.find(x=>x.month===key);return old?clone(old):{month:key,planned:key>month?20:null,actual:null};}),
    previousYearActual:yearActual(data,year),stockPlanEdited:[],
    weekly:[null,null,null,null,null],remarks:'',revisions:[]};
  resetPlan(report);return report;
}
function validateReport(r,month,history=false){
  if(!r||r.month!==month||!validMonth(month)||!validDate(r.date)||!['draft','confirmed'].includes(r.status)||!Array.isArray(r.rows)||r.rows.length>200)fail('頭数調べの月次記録を確認してください。');
  if(!Array.isArray(r.monthly)||r.monthly.length!==12||!Array.isArray(r.weekly)||r.weekly.length!==5||typeof r.remarks!=='string'||!r.previousStock)fail('出荷計画の形式を確認してください。');
  if(!count(r.shipping110,false)||!count(r.stock10,false)||STOCK.some(k=>!count(r.previousStock[k])))fail('棚卸の頭数を確認してください。');
  if(r.monthly.some((x,i)=>x.month!==month.slice(0,4)+'-'+String(i+1).padStart(2,'0')||!count(x.planned)||!count(x.actual))||r.weekly.some(x=>!count(x)))fail('出荷計画は0以上の整数で入力してください。');
  if(r.plannedStock!==undefined&&(!r.plannedStock||STOCK.some(k=>!count(r.plannedStock[k]))))fail('当月計画の頭数を確認してください。');
  if(r.stockPlanEdited!==undefined&&(!Array.isArray(r.stockPlanEdited)||r.stockPlanEdited.some(k=>!STOCK.includes(k))))fail('棚卸計画の形式を確認してください。');
  if(r.previousYearActual!==undefined&&(!Array.isArray(r.previousYearActual)||r.previousYearActual.length!==12||r.previousYearActual.some(x=>!count(x))))fail('前年実績を確認してください。');
  if(r.sowSnapshot!==undefined&&(!r.sowSnapshot||!Array.isArray(r.sowSnapshot.ids)||r.sowSnapshot.ids.some(id=>typeof id!=='string'||!/^\d+$/.test(id))||new Set(r.sowSnapshot.ids).size!==r.sowSnapshot.ids.length))fail('母豚頭数の月次記録を確認してください。');
  if(r.boarSnapshot!==undefined){if(!r.boarSnapshot||!Array.isArray(r.boarSnapshot.boars))fail('種豚頭数の月次記録を確認してください。');root.TanakaModel.validateBoars(r.boarSnapshot);}
  const keys=new Set();
  for(const row of r.rows){
    if(!row||typeof row.key!=='string'||keys.has(row.key)||!['farrowing','nursery','finishing','yard'].includes(row.area)||typeof row.place!=='string'||typeof row.sowId!=='string'||!count(row.count)||!['肉豚','育成母豚','育成母豚候補','母豚'].includes(row.kind)||!(row.csf===null||typeof row.csf==='boolean')||!(row.birthDate===''||validDate(row.birthDate))||!(row.category===''||CATEGORIES.includes(row.category)))fail('頭数調べの明細を確認してください。');
    if(row.kind==='母豚'&&(row.area!=='yard'||typeof row.registeredSowId!=='string'||!/^\d+$/.test(row.registeredSowId)))fail('運動場の母豚番号を確認してください。');
    if(row.area==='yard'&&row.birthMonth!==undefined&&row.birthMonth!==null&&(!Number.isInteger(row.birthMonth)||row.birthMonth<1||row.birthMonth>12))fail('運動場の誕生月は1〜12月から選択してください。');
    if(row.area==='yard'&&row.yardIndividual===1&&row.count!==null&&row.count>1)fail('運動場は1頭につき1行で入力してください。');
    keys.add(row.key);
  }
  // Older confirmed reports could leave candidate weights blank. Keep them restorable.
  if(r.status==='confirmed'){const s=aggregate(r.rows.filter(row=>row.area!=='yard'&&rowKind(row)!=='育成母豚候補'));if(s.unknown||s.unclassified)fail('未入力の頭数・要確認の体重区分を確認してから確定してください。');}
  if(!history){if(!Array.isArray(r.revisions))fail('頭数調べの履歴形式を確認してください。');for(const entry of r.revisions){if(!entry||!validDate(entry.savedAt?.slice(0,10)))fail('履歴の日付を確認してください。');validateReport(entry.report,month,true);}}
}
function validate(data){
  if(data.inventoryMonths===undefined)return;
  if(!data.inventoryMonths||typeof data.inventoryMonths!=='object'||Array.isArray(data.inventoryMonths))fail('頭数調べの保存形式を確認してください。');
  for(const [month,r] of Object.entries(data.inventoryMonths))validateReport(r,month);
}
function saveReport(data,report,expected){
  const old=data.inventoryMonths?.[report.month];
  if(JSON.stringify(old??null)!==expected)fail('別の画面で月次記録が変わりました。開き直してください。');
  const next=clone(report);next.rows=individualYardRows(next.rows);next.updatedAt=new Date().toISOString();
  next.revisions=old?[...(old.revisions||[]),{savedAt:next.updatedAt,report:(()=>{const p=clone(old);delete p.revisions;return p;})()}]:[];
  if(next.status==='confirmed'){const stats=aggregate(next.rows.filter(row=>row.area!=='yard'));if(stats.unknown||stats.unclassified)fail('未入力の頭数・要確認の体重区分を確認してから確定してください。');}
  validateReport(next,next.month);data.inventoryMonths=data.inventoryMonths||{};data.inventoryMonths[next.month]=next;
}
// Reflect a room's current weight in this month's verified rows only.
// Past months and manually entered shipping plans remain independent records.
function syncFinishingWeight(report,key,weight){
  let changed=false;
  for(const row of report.rows){
    if(row.area!=='finishing'||(row.roomKey||row.key.replace('finishing:',''))!==key)continue;
    const nextCategory=category('finishing',{state:row.state,weight},report.date,row.birthDate);
    if(row.registeredWeight===weight&&row.category===nextCategory)continue;
    row.registeredWeight=weight;row.category=nextCategory;row.autoCategory=false;changed=true;
  }
  if(changed){report.status='draft';syncPlan(report);}
  return changed;
}
function syncSavedFinishingWeight(data,month,key,weight){
  const old=data.inventoryMonths?.[month];if(!old)return;
  const report=clone(old);
  if(syncFinishingWeight(report,key,weight))saveReport(data,report,JSON.stringify(old));
}
function gilts(state){return state.finishing.filter(r=>r.key==='yard').flatMap(r=>root.TanakaFinishing.yardState(r).individuals).filter(p=>(root.TanakaGilts?.yardKind(p,state)||p.kind)==='育成母豚').length;}
root.TanakaInventory={boarSnapshot,syncBoarSnapshot,syncSavedBoars,syncFinishingWeight,syncSavedFinishingWeight,CATEGORIES,STOCK,validDate,validMonth,previousMonth,age,category,snapshot,rowKind,aggregate,farmSummary,currentStock,actualStock,plannedStock,resetPlan,needsOctoberPlanRepair,repairOctoberPlan,preparePlan,syncPlan,weeklyTotal,yearActual,create,validate,validateReport,saveReport,gilts,clone,yardIndividualRow,individualYardRows};
})(typeof globalThis!=='undefined'?globalThis:this);
