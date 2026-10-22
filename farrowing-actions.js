/* Read-only, target-specific correction planning. The one-year forecast is never changed. */
(function(root){
'use strict';
const F=root.TanakaForecast;
const forward=(f,date)=>F.valid(date)&&date>=f.day;
const span=p=>F.roomStay(p);
const intersects=F.intersects;
const maximum=F.capacityPeak;
const graphStartAt=(f,dates)=>{const d=dates.sort()[0];return d<f.day?f.day:d;};
const firstFuture=(f,id)=>f.periods.filter(p=>p.id===id&&p.basis==='estimate'&&p.mating>=f.day).sort((a,b)=>a.mating.localeCompare(b.mating))[0];
const fixedCycles=f=>f.periods.filter(p=>p.basis==='record');
function daysFor(f,occupancies,start,end){return F.capacityDays(occupancies,start,end,F.unknownRoomStays(f));}
function definitions(f,scope,settings){
  const out=[],pending=new Set(),records=scope.periods.filter(p=>p.basis==='record');
  for(const p of records){const next=scope.periods.find(q=>q.id===p.id&&q.basis==='estimate');if(!next||p.actualWean||!forward(f,p.exit))continue;
    const specs=[0,...Array.from({length:10},(_,i)=>i+1),21];
    if(settings.weanEarlier)specs.splice(1,0,...Array.from({length:10},(_,i)=>-i-1).filter(n=>F.add(p.exit,n)>=F.add(p.birth,root.TanakaModel.plannedWeanDays(p))));
    out.push({key:'wean:'+p.key,id:p.id,kind:'wean',type:'離乳',label:'離乳予定',date:p.exit,periodKey:p.key,nextKey:next.key,specs,source:p.actualBirth?'実分娩日からの離乳予定':'登録済み繁殖サイクルからの仮離乳予定'});pending.add(p.id);
  }
  for(const p of scope.periods.filter(p=>p.basis==='estimate'&&forward(f,p.mating)&&!pending.has(p.id)))out.push({key:'breed:'+p.key,id:p.id,kind:'breed',type:'種付け',label:'種付け予定',date:p.mating,nextKey:p.key,specs:[0,21],source:'次の発情・種付け予測'});
  for(const p of [...scope.periods,...scope.children])if(p.moveBasis!=='record'&&forward(f,p.moveDate||F.add(p.birth,60))){
    const child=!!p.pigletsOnly,empty=(f.nursery||[]).filter(r=>r.state==='empty').length;
    out.push({key:'move:'+p.key,id:p.id,kind:'move',type:'子豚引っ越し',label:'子豚引っ越し予定',date:p.moveDate||F.add(p.birth,60),periodKey:p.key,child,specs:[0,...Array.from({length:10},(_,i)=>-i-1),...(settings.moveLater?Array.from({length:10},(_,i)=>i+1):[])],conditional:'採用前に子豚の状態と移動先の受入を確認してください。現在の育成舎の空き '+empty+'室は将来の空きを保証しません。',source:p.actualBirth?'実分娩日＋60日の仮予定':'分娩予測日＋60日の仮予定'});
  }
  return out;
}
function shifted(p,n){const q=F.period(p.id,F.add(p.mating,n),p.first,'比較する次回サイクル（未保存の予測）',root.TanakaModel.plannedWeanDays(p));return {...p,...q,key:p.key,moveDate:F.add(q.birth,60),moveBasis:'estimate',moveSource:'比較案の分娩予測日＋60日'};}
function label(def,n){if(!n)return '予定どおり';if(n===21)return '1周期見送り（約21日）';return def.kind==='move'?Math.abs(n)+'日'+(n<0?'前倒し':'後ろへ'):(n>0?'＋':'')+n+'日離乳';}
function compareOrder(x,y){return (Math.abs(x.offset)===21?1:0)-(Math.abs(y.offset)===21?1:0)||Math.abs(x.offset)-Math.abs(y.offset)||Math.max(0,x.currentRoomExtraDays)-Math.max(0,y.currentRoomExtraDays)||(x.kind==='move'?0:1)-(y.kind==='move'?0:1)||(x.offset>0?1:0)-(y.offset>0?1:0)||Number(x.heatWorse)-Number(y.heatWorse)||x.actionKey.localeCompare(y.actionKey,'ja',{numeric:true});}
function simulate(f,scope,target,def,n){
  const periods=scope.periods.map(p=>({...p})),children=scope.children.map(p=>({...p}));
  const date=F.add(def.date,def.kind==='wean'&&n===21?0:n);if(!forward(f,date))return null;
  const original=(def.child?scope.children:scope.periods).find(p=>p.key===def.periodKey),anchor=scope.periods.find(p=>p.key===def.nextKey);
  const index=periods.findIndex(p=>p.key===def.nextKey),shift=def.kind==='wean'||def.kind==='breed'?n:0;if(index>=0&&shift)periods[index]=shifted(anchor,shift);
  const changed=(def.child?children:periods).find(p=>p.key===def.periodKey);
  if(def.kind==='wean')changed.exit=date;
  if(def.kind==='move'){changed.moveDate=date;changed.moveSource='引っ越し比較案（未保存）';if(def.child)changed.exit=date;}
  const beforeOcc=[...scope.periods.map(span),...scope.children],afterOcc=[...periods.map(span),...children],keys=new Set([def.periodKey,def.nextKey].filter(Boolean));
  const oldChanged=beforeOcc.filter(p=>keys.has(p.key)),newChanged=afterOcc.filter(p=>keys.has(p.key));
  const relevant=[...beforeOcc,...afterOcc].filter(p=>intersects(p,target.start,target.end)||keys.has(p.key));
  const checkStart=[f.day,target.start,...relevant.map(p=>p.entry)].filter(d=>d>=f.day).sort()[0]||f.day;
  const checkEnd=[target.end,...relevant.map(p=>p.exit)].sort().at(-1);
  const before=daysFor(f,beforeOcc,checkStart,checkEnd),after=daysFor(f,afterOcc,checkStart,checkEnd);
  const base=maximum(before,target.start,target.end),peak=maximum(after,target.start,target.end);
  // Guard against moving the target peak to either edge of a shifted cycle. Only
  // the changed intervals are checked; an unrelated existing later peak is not a veto.
  const changedOn=date=>[...oldChanged,...newChanged].some(p=>intersects(p,date,date));
  const newFullDays=after.filter((d,i)=>changedOn(d.date)&&F.capacityState(d.count).atCapacity&&d.count>before[i].count);
  const extended=def.kind==='wean'&&n>0&&n!==21,oldStay=original?span(original):null,newStay=changed?span(changed):null;
  const currentExtraDays=extended?n:0,currentRoomExtraDays=oldStay?F.distance(oldStay.exit,newStay.exit):0;
  const currentStart=oldStay?(oldStay.entry<f.day?f.day:oldStay.entry):f.day,currentEnd=oldStay?[oldStay.exit,newStay.exit].sort().at(-1):f.day;
  const currentWorse=extended&&after.some((d,i)=>d.date>=currentStart&&d.date<=currentEnd&&d.count>before[i].count&&F.capacityState(d.count).attention);
  const next=periods.find(p=>p.key===def.nextKey),oldHeat=anchor?F.heat(anchor.birth):null,heat=next?F.heat(next.birth):null;
  const heatWorse=!!(heat&&(!oldHeat.avoid&&heat.avoid||!oldHeat.caution&&heat.caution));
  const includedIds=new Set(scope.periods.map(p=>p.id)),uncertainty=(f.unmodelled||[]).length>0||scope.periods.some(p=>p.uncertain)||(f.rows||[]).some(r=>includedIds.has(r.id)&&r.parityUnknown);
  const improvedDays=after.filter((d,i)=>d.date>=target.start&&d.date<=target.end&&d.count<before[i].count).length;
  const afterBurden=after.filter(d=>d.date>=target.start&&d.date<=target.end).reduce((s,d)=>s+Math.max(0,d.count-8),0),beforeBurden=before.filter(d=>d.date>=target.start&&d.date<=target.end).reduce((s,d)=>s+Math.max(0,d.count-8),0);
  const effective=n!==0&&improvedDays>0&&afterBurden<beforeBurden&&!newFullDays.length&&!currentWorse;
  const goal=base.count>=10?9:8,resolved=effective&&peak.count<=goal;
  const graphKeys=new Set(relevant.filter(p=>intersects(p,target.start,target.end)||newFullDays.some(d=>intersects(p,d.date,d.date))).map(p=>p.key));
  if(def.nextKey)graphKeys.add(def.nextKey);
  const graphPeriods=[...beforeOcc,...afterOcc].filter(p=>graphKeys.has(p.key));
  const graphStart=graphStartAt(f,[target.start,...graphPeriods.map(p=>p.entry)]),graphEnd=[target.end,...graphPeriods.map(p=>p.exit)].sort().at(-1);
  return {offset:n,kind:def.kind,actionKey:def.key,date,label:label(def,n),basePeak:base.count,cyclePeak:peak.count,peakDate:peak.date,basePeakDate:base.date,goal,effective,resolved,recommendable:resolved&&base.count>=10&&!uncertainty&&!heatWorse,newFullDays:newFullDays.map(d=>({date:d.date,count:d.count})),worsens:newFullDays.length>0,currentWorse,uncertainty,heatWorse,currentExtraDays,currentRoomExtraDays,currentPeak:maximum(after,currentStart,currentEnd).count,mating:next?.mating||'',estrus:def.kind==='wean'?F.add(date,4):def.kind==='breed'?def.date:'',birth:next?.birth||'',due:next?.due||'',heat,overlaps:after.find(d=>d.date===peak.date)?.overlaps||[],graphStart,graphEnd,graph:after.flatMap((d,i)=>d.date>=graphStart&&d.date<=graphEnd?[{date:d.date,before:before[i].count,after:d.count}]:[]),effects:[{start:target.start,end:target.end,before:base.count,after:peak.count,peakDate:peak.date,improvedDays}],recommendedFor:[]};
}
function contextFor(f,target,focus,settings){
  const scope={periods:[...fixedCycles(f),...(focus?[focus]:[])],children:(f.childStays||[]).map(p=>({...p,pigletsOnly:true}))};
  const occupancies=[...scope.periods.map(span),...scope.children],baseDays=daysFor(f,occupancies,target.start,target.end),peak=maximum(baseDays,target.start,target.end);
  const key=target.key+':'+(focus?.key||'fixed'),included=new Set(scope.periods.map(p=>p.key));
  const excluded=f.periods.filter(p=>p.basis==='estimate'&&!included.has(p.key)&&intersects(span(p),target.start,target.end));
  const context={key,focusKey:focus?.key||'',focusId:focus?.id||'',peak:peak.count,peakDate:peak.date,scopeKeys:[...included],excludedKeys:excluded.map(p=>p.key),overlaps:baseDays.find(d=>d.date===peak.date)?.overlaps||[],actions:[],recommended:null};
  if(F.capacityState(peak.count).attention){context.actions=definitions(f,scope,settings).filter(def=>def.kind!=='move'||F.add(def.date,-10)<=target.end&&F.add(def.date,settings.moveLater?10:0)>=target.start).map(def=>{const options=def.specs.map(n=>simulate(f,scope,target,def,n)).filter(Boolean),base=options.find(o=>o.offset===0);return {...def,key:context.key+'|'+def.key,actionKey:def.key,targetKey:target.key,contextKey:key,options,base,recommended:options.filter(o=>o.recommendable).sort(compareOrder)[0]||null};}).filter(a=>a.base);
    const candidates=context.actions.flatMap(a=>a.options.filter(o=>o.recommendable).map(o=>({action:a,option:o}))).sort((a,b)=>compareOrder(a.option,b.option));
    if(candidates[0]){const winner=candidates[0];context.recommended={actionKey:winner.action.key,offset:winner.option.offset};winner.option.recommendedFor=[target.key];}
  }
  const relevant=occupancies.filter(p=>intersects(p,target.start,target.end)),graphStart=graphStartAt(f,[target.start,...relevant.map(p=>p.entry)]),graphEnd=[target.end,...relevant.map(p=>p.exit)].sort().at(-1);
  context.graphStart=graphStart;context.graphEnd=graphEnd;context.graph=daysFor(f,occupancies,graphStart,graphEnd).map(d=>({date:d.date,before:d.count,after:d.count}));
  return context;
}
function planActions(f,settings={}){
  const risks=F.riskSegments(f),targets=[];
  const firsts=(f.rows||[]).flatMap(r=>{const p=firstFuture(f,r.id);return p?[p]:[];});
  for(const risk of risks){const target={...risk,key:risk.start+'_'+risk.end,annualPeak:risk.peak,contexts:[]};
    const fixed=contextFor(f,target,null,settings);target.contexts.push(fixed);
    for(const p of firsts.filter(p=>intersects(span(p),target.start,target.end))){const ctx=contextFor(f,target,p,settings);if(ctx.peak>fixed.peak)target.contexts.push(ctx);}
    target.contexts.sort((a,b)=>{const ao=a.recommended&&a.actions.find(x=>x.key===a.recommended.actionKey)?.options.find(o=>o.offset===a.recommended.offset),bo=b.recommended&&b.actions.find(x=>x.key===b.recommended.actionKey)?.options.find(o=>o.offset===b.recommended.offset);return Number(!ao)-Number(!bo)||(ao&&bo?compareOrder(ao,bo):0)||b.peak-a.peak||a.key.localeCompare(b.key,'ja',{numeric:true});});
    target.context=target.contexts[0];targets.push(target);
  }
  const actions=targets.flatMap(t=>t.contexts.flatMap(c=>c.actions));
  return {risks,targets,actions,scopeRule:'記録済みの今回サイクル＋比較対象1頭の次回サイクル。その他の未種付け・次々回以降は年間参考のみ。'};
}
// A daily-work assessment uses the same cohort rule, not every later yearly cycle.
function nextCorrection(f,id,weanDate='',matingDate=''){
  const source=firstFuture(f,id);if(!source)return null;
  const originalPeriods=fixedCycles(f),periods=originalPeriods.map(p=>({...p})),parent=periods.find(p=>p.id===id&&p.actualBirth&&!p.actualWean),n=parent&&F.valid(weanDate)?F.distance(parent.exit,weanDate):F.valid(matingDate)?F.distance(source.mating,matingDate):0;
  const next=n?shifted(source,n):{...source};if(parent&&F.valid(weanDate))parent.exit=weanDate;
  const scope={periods:[...periods,next],children:f.childStays||[]},occupancies=[...scope.periods.map(span),...scope.children],stay=span(next),days=daysFor(f,occupancies,next.entry,stay.exit),peak=maximum(days,next.entry,stay.exit),heat=F.heat(next.birth),age=parent&&F.valid(weanDate)?F.distance(parent.birth,weanDate):null,requiredNursingDays=root.TanakaModel.plannedWeanDays(parent);
  const uncertainty=(f.unmodelled||[]).length>0||scope.periods.some(p=>p.uncertain)||(f.rows||[]).some(r=>scope.periods.some(p=>p.id===r.id)&&r.parityUnknown);
  const originalParent=originalPeriods.find(p=>p.key===parent?.key),holdEnd=parent?span(parent).exit:f.day,holdStart=originalParent?span(originalParent).exit:f.day,holdDays=n>0&&holdEnd>holdStart?daysFor(f,occupancies,F.add(holdStart,1),holdEnd).filter(d=>d.count>daysFor(f,[...originalPeriods.map(span),span(source),...scope.children],d.date,d.date)[0].count) :[],hold=F.capacityPeak(holdDays);
  const unavailable=!!matingDate&&originalPeriods.some(p=>p.id===id&&F.add(p.exit,4)>next.mating);
  const capacity=F.capacityState(Math.max(peak.count,hold.count)),level=capacity.over||heat.avoid?'bad':capacity.attention||heat.caution||uncertainty||unavailable||age!==null&&age<requiredNursingDays?'warn':'good';
  return {capacityDays:days.map(d=>({date:d.date,count:d.count})),peak:peak.count,peakDate:peak.date,level,heat,age,requiredNursingDays,uncertainty,unavailable,holdPeak:hold.count,holdDate:hold.date,mating:next.mating,birth:next.birth,due:next.due,entry:next.entry,exit:stay.exit};
}
function targetForDate(plan,date){return plan.targets.find(t=>t.start<=date&&t.end>=date)||null;}
function actionsForDate(plan,date){return targetForDate(plan,date)?.context.actions||[];}
// Guidance reads the existing comparisons; it never adopts or saves an option.
function guidanceChoice(j,plan){
  const days=j.capacityDays||[];if(!days.length||j.peak<9||j.uncertain||j.uncertainty||j.unavailable||(j.holdPeak||0)>=9||j.age!=null&&j.age<(j.requiredNursingDays??30))return null;
  const goal=j.peak>=11?10:j.peak===10?9:8,candidates=[];
  for(const t of plan.targets||[])if(t.start<=days.at(-1).date&&t.end>=days[0].date)for(const c of t.contexts)for(const a of c.actions)for(const o of a.options){
    if(!o.offset||!o.effective||o.currentWorse||o.newFullDays.length||o.uncertainty||o.heatWorse)continue;
    const graph=new Map(o.graph.map(d=>[d.date,d]));
    // Do not promise a result from another cohort or from only part of this view.
    if(days.some(d=>!graph.has(d.date)||graph.get(d.date).before!==d.count))continue;
    const after=F.capacityPeak(days.map(d=>({date:d.date,count:graph.get(d.date).after}))).count;if(after>=j.peak||after>goal)continue;
    candidates.push({action:a,option:o,peak:after,targetKey:t.key,contextKey:c.key});
  }
  return candidates.sort((a,b)=>compareOrder(a.option,b.option))[0]||null;
}
function workGuidance(f,x,j,plan={targets:[]}){
  if(!j||j.level==='good')return null;
  const entry=x.type==='分娩舎へ移動',date=j.date||x.date||f.day,md=d=>F.valid(d)?Number(d.slice(5,7))+'/'+Number(d.slice(8,10)):'予定日',uncertain=!!(j.uncertain||j.uncertainty),steps=[];
  const peak=j.peak||0,capacity=F.capacityState(peak),required=capacity.over?capacity.shortage:capacity.full?1:0,deadline=j.peakDate||date,firstProblem=(j.capacityDays||[]).find(d=>F.capacityState(d.count).over)?.date||deadline;
  const within=!(uncertain||j.heat?.caution||j.unavailable||(j.holdPeak||0)>=9||j.age!=null&&j.age<(j.requiredNursingDays??30)),possible=entry?'収容予測上は'+md(date)+'の移入は予定どおり可能です。':'収容予測上、予定どおりでも収容範囲内です。';
  if(capacity.over){
    const start=entry?(j.onDateCount>10?md(date)+'の移入は当日から収容超過の見込みです。そのまま移入せず、受入枠を確認してください。':md(date)+'の移入当日は収容範囲内ですが、'+md(firstProblem)+'から収容超過の見込みです。'):'このままの'+(x.type==='離乳'?'離乳':x.type==='種付け'?'種付け':'予定')+'では、'+md(firstProblem)+'から収容超過の見込みです。';
    steps.push(start+md(deadline)+'までに最低'+required+'室空ける対策を確認してください。');
  }else if(capacity.full){
    steps.push((within?possible:'')+md(deadline)+'に満室になるため、それまでに1室空けられるか確認してください。');
  }else if(capacity.attention){
    steps.push((within?possible:'')+md(deadline)+'は残り1室です。予定日前に入退室を確認し、空室1室を維持できるか確認してください。');
  }
  if(j.holdPeak>=9)steps.push('離乳日の延長で今の部屋を長く使います。'+md(j.holdDate)+'の入室予定と受入枠を確認してから調整してください。');
  if(j.heat?.caution)steps.push('分娩予測'+md(j.birth)+'は'+(j.heat.avoid?'8月の分娩回避推奨期間':'暑熱注意期間')+'です。1周期見送り案と収容・暑熱予測を比較し、暑熱対策を確認してください。');
  if(uncertain)steps.push('未確定の在室・日付を確認してください。空室を実際に確認してから実施日を判断してください。');
  if(j.unavailable)steps.push('現在の妊娠・授乳記録と種付け予定が重なっています。母豚カードの日付を確認してください。');
  if(j.age!==null&&j.age!==undefined&&j.age<(j.requiredNursingDays??30))steps.push('基準日では授乳'+j.age+'日です。あと'+((j.requiredNursingDays??30)-j.age)+'日で'+(j.requiredNursingDays??30)+'日になるため、実分娩日と離乳予定日を確認してください。');
  if(!steps.length)steps.push('予定日の入退室と母豚カードの日付を確認し、年間予測の対象期間で調整案を比較してください。');
  return {steps,required,deadline,firstProblem,proposal:guidanceChoice(j,plan)};
}
Object.assign(F,{workGuidance,guidanceChoice,planActions,targetForDate,actionsForDate,nextCorrection});
})(typeof globalThis!=='undefined'?globalThis:this);
