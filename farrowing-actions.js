/* Read-only counterfactuals: preserve all other sows and propagate later forecast cycles. */
(function(root){
'use strict';
const F=root.TanakaForecast;
const within=(f,date)=>F.valid(date)&&date>=f.day&&date<=F.add(f.day,30);
const maxIn=(days,start,end)=>days.filter(d=>d.date>=start&&d.date<=end).reduce((best,d)=>d.count>best.count?{count:d.count,date:d.date}:best,{count:0,date:start});
function metrics(days){return {peak:Math.max(0,...days.map(d=>d.count)),over:days.filter(d=>d.count>=11).length,full:days.filter(d=>d.count>=10).length,caution:days.filter(d=>d.count>=9).length};}
function future(f,id,date){return f.periods.filter(p=>p.id===id&&p.basis==='estimate'&&p.mating>=date).sort((a,b)=>a.mating.localeCompare(b.mating))[0];}
function definitions(f){
  const out=[],weans=F.weanSchedules(f).filter(x=>within(f,x.date)),weanIds=new Set(weans.map(x=>x.id));
  for(const x of weans){const p=f.periods.find(p=>p.id===x.id&&p.current&&p.actualBirth),next=future(f,x.id,x.date);if(p&&next)out.push({...x,key:'wean:'+x.id,kind:'wean',periodKey:p.key,nextKey:next.key,specs:[0,1,2,3,4,5,21]});}
  for(const x of F.breedingSchedules(f).filter(x=>within(f,x.date)&&!weanIds.has(x.id))){const p=future(f,x.id,x.date);if(p)out.push({...x,key:'breed:'+x.id,kind:'breed',nextKey:p.key,specs:[0,21]});}
  const emptyNursery=(f.nursery||[]).filter(n=>n.state==='empty').length;
  const moving=[...(f.childStays||[]).map(p=>({...p,child:true})),...f.periods.filter(p=>p.current&&p.actualBirth).map(p=>({...p,roomKey:f.rows.find(r=>r.id===p.id)?.roomKey}))];
  for(const p of moving)if(p.moveBasis==='estimate'&&within(f,p.moveDate)&&emptyNursery>0)out.push({key:'move:'+p.key,id:p.id,date:p.moveDate,type:'子豚引っ越し',kind:'move',periodKey:p.key,child:!!p.child,roomKey:p.roomKey,conditional:'育成舎の受入可能状態・移動可能な状態を現場で確認（現在空き'+emptyNursery+'室）',specs:[0,-1,-2,-3,-4,-5,1,2,3,4,5]});
  for(const p of f.periods.filter(p=>p.basis==='record'&&!p.current&&within(f,p.entry))){const limit=Math.min(5,F.distance(p.entry,p.due));if(limit>0)out.push({key:'entry:'+p.key,id:p.id,date:p.entry,type:'分娩舎へ移入',kind:'entry',periodKey:p.key,conditional:'分娩予定日以前の比較です。分娩の兆候・実際の入室可能日を現場で確認',specs:Array.from({length:limit+1},(_,i)=>i)});}
  return out;
}
function shifted(p,n){const next=F.period(p.id,F.add(p.mating,n),p.first,'直近予定の調整による周期予測（未保存）');return {...p,...next,key:p.key,moveDate:F.add(next.birth,60),moveBasis:'estimate',moveSource:'分娩予測日＋60日で仮計算'};}
function heatTotals(periods,id,f){const p=periods.filter(p=>p.id===id&&p.birth>=f.day&&p.birth<=f.end);return {avoid:p.filter(p=>F.heat(p.birth).avoid).length,caution:p.filter(p=>F.heat(p.birth).caution).length};}
function simulate(f,def,n,risks,baseMetrics){
  let periods=f.periods.map(p=>({...p})),childStays=(f.childStays||[]).map(p=>({...p}));
  const original=def.child?(f.childStays||[]).find(p=>p.key===def.periodKey):f.periods.find(p=>p.key===def.periodKey),anchor=periods.find(p=>p.key===def.nextKey);
  const date=F.add(def.date,def.kind==='wean'&&n===21?0:n);if(!F.valid(date)||date<f.day||date>f.end)return null;
  const shift=def.kind==='wean'?(n===21?21:n):def.kind==='breed'?n:0;
  if(shift&&anchor)periods=periods.map(p=>p.id===def.id&&p.basis==='estimate'&&p.mating>=anchor.mating?shifted(p,shift):p);
  const changed=def.child?childStays.find(p=>p.key===def.periodKey):periods.find(p=>p.key===def.periodKey);
  if(def.kind==='wean')changed.exit=date;
  if(def.kind==='move'){changed.moveDate=date;changed.moveSource='引っ越し日を調整する比較案（未保存）';if(def.child)changed.exit=date;}
  if(def.kind==='entry')changed.entry=date;
  const projected=F.occupanciesFor({...f,childStays},periods),days=f.days.map(d=>({date:d.date,count:F.overlapsAt(f,d.date,projected).length+d.unmodelled.length})),after=metrics(days);
  const next=periods.find(p=>p.key===def.nextKey),oldNext=f.periods.find(p=>p.key===def.nextKey),oldStay=original?(def.child?original:F.roomStay(original)):null,newStay=changed?(def.child?changed:F.roomStay(changed)):null;
  const start=next?.entry||f.day,end=next?F.roomStay(next).exit:[oldStay.exit,newStay.exit].sort().at(-1),baseStart=oldNext?.entry||f.day,baseEnd=oldNext?F.roomStay(oldNext).exit:oldStay.exit;
  const cycle=maxIn(days,start,end),baseCycle=maxIn(f.days,baseStart,baseEnd),currentEnd=[F.add(f.day,30),...(oldStay?[oldStay.exit,newStay.exit]:[])].sort().at(-1);
  const currentWorse=days.some((d,i)=>d.date<=currentEnd&&d.count>f.days[i].count&&d.count>=9);
  const beforeHeat=heatTotals(f.periods,def.id,f),afterHeat=heatTotals(periods,def.id,f),heatWorse=afterHeat.avoid>beforeHeat.avoid||afterHeat.avoid===beforeHeat.avoid&&afterHeat.caution>beforeHeat.caution;
  const improved=days.filter((d,i)=>f.days[i].count>=9&&d.count<f.days[i].count),effects=risks.flatMap(r=>{const count=improved.filter(d=>d.date>=r.start&&d.date<=r.end).length;if(!count)return [];const peak=maxIn(days,r.start,r.end);return [{start:r.start,end:r.end,before:r.peak,after:peak.count,peakDate:peak.date,improvedDays:count}];});
  const uncertainty=f.missing.length>0||f.unmodelled.length>0||f.periods.some(p=>p.uncertain)||f.rows.some(r=>r.parityUnknown);
  const worsens=after.peak>baseMetrics.peak||after.over>baseMetrics.over||after.full>baseMetrics.full;
  const benefit=after.peak<baseMetrics.peak||after.over<baseMetrics.over||after.full<baseMetrics.full||after.caution<baseMetrics.caution;
  const effective=n!==0&&effects.length>0&&benefit&&!worsens&&!heatWorse&&!currentWorse;
  const priority=def.kind==='wean'&&n!==21?0:def.kind==='move'?1:def.kind==='entry'?2:3;
  return {offset:n,date,kind:def.kind,label:n===0?'予定どおり':n===21?'1周期見送り（約21日）':def.kind==='move'?(n<0?Math.abs(n)+'日前へ':n+'日後へ'):'＋'+n+'日',priority,effective,recommendable:effective&&cycle.count<=9&&!uncertainty,uncertainty,worsens,currentWorse,heatWorse,effects,cyclePeak:cycle.count,peakDate:cycle.date,baseCyclePeak:baseCycle.count,annual:after,baseAnnual:baseMetrics,mating:next?.mating||'',estrus:def.kind==='wean'?F.add(date,4):def.kind==='breed'?def.date:'',birth:next?.birth||'',due:next?.due||'',heat:next?F.heat(next.birth):null,currentExtraDays:def.kind==='wean'?n===21?0:n:0,currentRoomExtraDays:oldStay?F.distance(oldStay.exit,newStay.exit):0,currentPeak:maxIn(days,f.day,currentEnd).count,overlaps:F.overlapsAt(f,cycle.date,projected),recommendedFor:[]};
}
function planActions(f){
  const risks=F.riskSegments(f),baseline=metrics(f.days);if(!risks.length)return {risks,actions:[],baseline};
  const actions=definitions(f).map(def=>{const options=def.specs.map(n=>simulate(f,def,n,risks,baseline)).filter(Boolean);return {...def,options,base:options.find(o=>o.offset===0)};}).filter(a=>a.base&&a.options.some(o=>o.effective));
  for(const a of actions){
    for(const o of a.options)if(o.recommendable)o.recommendedFor=o.effects.filter(e=>e.after<=9).map(e=>e.start);
    a.recommended=a.options.filter(o=>o.recommendedFor.length).sort((x,y)=>x.priority-y.priority||Math.abs(x.offset)-Math.abs(y.offset))[0]||null;
    a.best=a.recommended||a.options.filter(o=>o.effective).sort((x,y)=>x.cyclePeak-y.cyclePeak||x.annual.full-y.annual.full||x.priority-y.priority||Math.abs(x.offset)-Math.abs(y.offset))[0];
  }
  actions.sort((a,b)=>(a.recommended?0:1)-(b.recommended?0:1)||a.best.priority-b.best.priority||a.date.localeCompare(b.date)||a.id.localeCompare(b.id,'ja',{numeric:true}));
  return {risks,actions,baseline};
}
function actionsForDate(plan,date){return plan.actions.filter(a=>a.options.some(o=>o.effective&&o.effects.some(e=>e.start<=date&&e.end>=date)));}
Object.assign(F,{planActions,actionsForDate});
})(typeof globalThis!=='undefined'?globalThis:this);
