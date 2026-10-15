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
    return {key:area+':'+r.key,area,roomKey:r.key,place:area==='farrowing'?'分娩舎 '+(r.label||r.key.slice(1))+'室':area==='nursery'?'育成舎 管理枠'+r.key.slice(1):area==='yard'?'運動場':'肉豚舎 '+r.key.slice(1)+'番',
      state:r.state,count:inactive?0:r.count??null,birthDate,sowId:r.mixed?'混成':r.sowId||'',csf:typeof r.csf==='boolean'?r.csf:null,
      category:category(area,r,date,birthDate),autoCategory:area==='farrowing'||area==='nursery',registeredWeight:r.weight??null,kind:r.kind==='育成母豚'?'育成母豚':'肉豚'};
  };
  return individualYardRows([...state.rooms.map(r=>make('farrowing',r)),...state.nursery.map(r=>make('nursery',r)),...state.finishing.flatMap(r=>{
    if(r.key!=='yard')return [make('finishing',r)];
    if(!Array.isArray(r.individuals))return [make('yard',r)];
    return r.individuals.map(pig=>({...make('yard',{...pig,key:'yard',state:'occupied'}),key:'yard:pig:'+pig.key,sourcePigKey:pig.key,yardIndividual:1}));
  })]);
}
function aggregate(rows){
  const totals=Object.fromEntries(CATEGORIES.map(k=>[k,0]));let gilts=0,unclassified=0,unknown=0;
  for(const r of rows){if(r.count===null){unknown++;continue;}if(r.kind==='育成母豚'){gilts+=r.count;continue;}if(!r.count)continue;if(CATEGORIES.includes(r.category))totals[r.category]+=r.count;else unclassified+=r.count;}
  return {totals,gilts,unclassified,unknown,total:Object.values(totals).reduce((a,b)=>a+b,0)};
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
function preparePlan(report,data){
  if(!report.plannedStock){report.plannedStock=currentStock(report);report.stockPlanEdited=STOCK.slice();}
  if(!report.stockPlanEdited)report.stockPlanEdited=STOCK.slice();
  if(!report.previousYearActual)report.previousYearActual=yearActual(data,report.month.slice(0,4));
  return report;
}
function syncPlan(report){
  const actual=actualStock(report);
  for(const k of STOCK)if(!report.stockPlanEdited.includes(k))report.plannedStock[k]=actual[k];
  // Retain legacy fields for older backups/readers, without using them as actual inventory.
  report.shipping110=report.plannedStock['110']??0;report.stock10=report.plannedStock['10']??0;
}
function weeklyTotal(report){return report.weekly.reduce((sum,n)=>sum+(n??0),0);}
function create(data,state,month,date,roomBirthDate){
  if(!validMonth(month))fail('対象月を選んでください。');
  const prev=data.inventoryMonths?.[previousMonth(month)],year=month.slice(0,4);
  const report={month,date,status:'draft',rows:snapshot(data,state,date,roomBirthDate),shipping110:0,stock10:0,
    previousStock:prev?plannedStock(prev):Object.fromEntries(STOCK.map(k=>[k,null])),
    carriedFrom:prev?prev.month:'',previousConfirmed:prev?.status==='confirmed',
    monthly:Array.from({length:12},(_,i)=>{const key=year+'-'+String(i+1).padStart(2,'0'),old=prev?.monthly.find(x=>x.month===key);return old?clone(old):{month:key,planned:key>month?20:null,actual:null};}),
    previousYearActual:yearActual(data,year),stockPlanEdited:[],
    weekly:[null,null,null,null,null],remarks:'',revisions:[]};
  report.plannedStock=actualStock(report);return report;
}
function validateReport(r,month,history=false){
  if(!r||r.month!==month||!validMonth(month)||!validDate(r.date)||!['draft','confirmed'].includes(r.status)||!Array.isArray(r.rows)||r.rows.length>200)fail('頭数調べの月次記録を確認してください。');
  if(!Array.isArray(r.monthly)||r.monthly.length!==12||!Array.isArray(r.weekly)||r.weekly.length!==5||typeof r.remarks!=='string'||!r.previousStock)fail('出荷計画の形式を確認してください。');
  if(!count(r.shipping110,false)||!count(r.stock10,false)||STOCK.some(k=>!count(r.previousStock[k])))fail('棚卸の頭数を確認してください。');
  if(r.monthly.some((x,i)=>x.month!==month.slice(0,4)+'-'+String(i+1).padStart(2,'0')||!count(x.planned)||!count(x.actual))||r.weekly.some(x=>!count(x)))fail('出荷計画は0以上の整数で入力してください。');
  if(r.plannedStock!==undefined&&(!r.plannedStock||STOCK.some(k=>!count(r.plannedStock[k]))))fail('当月計画の頭数を確認してください。');
  if(r.stockPlanEdited!==undefined&&(!Array.isArray(r.stockPlanEdited)||r.stockPlanEdited.some(k=>!STOCK.includes(k))))fail('棚卸計画の形式を確認してください。');
  if(r.previousYearActual!==undefined&&(!Array.isArray(r.previousYearActual)||r.previousYearActual.length!==12||r.previousYearActual.some(x=>!count(x))))fail('前年実績を確認してください。');
  const keys=new Set();
  for(const row of r.rows){
    if(!row||typeof row.key!=='string'||keys.has(row.key)||!['farrowing','nursery','finishing','yard'].includes(row.area)||typeof row.place!=='string'||typeof row.sowId!=='string'||!count(row.count)||!['肉豚','育成母豚'].includes(row.kind)||!(row.csf===null||typeof row.csf==='boolean')||!(row.birthDate===''||validDate(row.birthDate))||!(row.category===''||CATEGORIES.includes(row.category)))fail('頭数調べの明細を確認してください。');
    if(row.area==='yard'&&row.yardIndividual===1&&row.count!==null&&row.count>1)fail('運動場は1頭につき1行で入力してください。');
    keys.add(row.key);
  }
  if(r.status==='confirmed'){const s=aggregate(r.rows.filter(row=>row.area!=='yard'));if(s.unknown||s.unclassified)fail('未入力の頭数・要確認の体重区分を確認してから確定してください。');}
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
  validateReport(next,next.month);data.inventoryMonths=data.inventoryMonths||{};data.inventoryMonths[next.month]=next;
}
function gilts(state){return [...state.nursery,...state.finishing.flatMap(r=>r.key==='yard'&&Array.isArray(r.individuals)?r.individuals.map(p=>({...p,state:'occupied'})):[r])].filter(r=>r.state==='occupied'&&r.kind==='育成母豚').reduce((sum,r)=>sum+(r.count??0),0);}
root.TanakaInventory={CATEGORIES,STOCK,validDate,validMonth,previousMonth,age,category,snapshot,aggregate,currentStock,actualStock,plannedStock,preparePlan,syncPlan,weeklyTotal,yearActual,create,validate,validateReport,saveReport,gilts,clone,yardIndividualRow,individualYardRows};
})(typeof globalThis!=='undefined'?globalThis:this);
