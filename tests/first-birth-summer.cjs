'use strict';
const fs=require('fs'),vm=require('vm'),a=require('node:assert/strict'),path=require('path'),c=vm.createContext({});
for(const file of ['model.js','finishing-model.js','schedules.js','inventory-model.js','sow-parity.js','gilt-model.js','farrowing-forecast.js','farrowing-actions.js','simulation-model.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c);
const M=c.TanakaModel,F=c.TanakaForecast,copy=x=>JSON.parse(JSON.stringify(x));
function forecast(first=false){return {day:'2027-03-01',end:'2028-03-01',rows:[{id:'s',first,summerFirst:first}],periods:[],childStays:[],unmodelled:[],missing:[],rooms:[],nursery:[]};}
const date='2027-04-10';
for(const first of [false,true]){
 const f=forecast(first),before=JSON.stringify(f),r=F.compare(f,'s',date);
 a.equal(r.birth,'2027-08-09');a.equal(r.heat.avoid,first);a.equal(r.level,first?'warn':'good');a.equal(r.heat.seasonalAvoid,true);
 a.equal(r.reasons.some(x=>x.includes('8月')),first);a.equal(JSON.stringify(f),before);
 // The work assessment and annual-reference comparison share the same condition.
 f.periods=[{...F.period('s',date,first),key:'s:next'}];
 const j=F.nextCorrection(f,'s','','2027-04-10');a.equal(j.heat.avoid,first);a.equal(j.level,first?'warn':'good');
 for(const [others,expected] of [[8,'warn'],[9,'warn'],[10,'bad']]){
  const g=forecast(first);for(let i=0;i<others;i++)g.periods.push({...F.period('other'+i,date,false),key:'other'+i,basis:'record'});
  const r=F.compare(g,'s',date);a.equal(r.peak,others+1);a.equal(r.level,expected);a.equal(F.nextCorrection({...g,periods:[...g.periods,{...F.period('s',date,first),key:'s:next'}]},'s','','2027-04-10').level,expected);
 }
}
// Existing 0/first-parity records qualify; unknown parity is not guessed from a provisional 7-day entry.
function seed(parity){const d=M.migrate(null);d.logs=[];d.sows=[{id:'1',cardBaseline:{parity,mating:date}}];d.baseline.forEach(r=>Object.assign(r,{state:'empty',sowId:'',count:null,birthDate:''}));return d;}
for(const [parity,eligible] of [[0,true],[1,true],[2,false],[5,false],[null,false]]){
 const d=seed(parity),before=JSON.stringify(d),f=F.build(d,'2027-04-11'),p=f.periods[0];
 a.equal(F.periodHeat(p).avoid,eligible);a.equal(f.periods.slice(1).some(p=>F.periodHeat(p).applicable),false);
 a.equal(f.days.length,367);a.equal(JSON.stringify(d),before);a.deepEqual(copy(F.build(M.migrate(copy(d)),'2027-04-11')),copy(f));
}
// A managed first-birth history followed by the next prepared parity is already multiparous.
{
 const d=seed(1),s=d.sows[0];s.parityCards={version:1,current:{key:'next',parity:1,card:{parity:1,mating:date},capturedKeys:[],revisions:[]},history:[{key:'first',parity:0,card:{parity:0,birthDateActual:'2026-09-01'},revisions:[]}]};
 a.equal(F.periodHeat(F.build(d,'2027-04-11').periods[0]).applicable,false);
}
// Capacity success cannot be vetoed merely because a first birth moves into August.
for(const first of [true,false]){
 const source={...F.period('s',F.add('2027-07-31',-121),first),key:'s:next'},f=forecast(first);f.periods=[source];
 for(let i=0;i<9;i++){const exit=F.add(source.entry,3);f.periods.push({...F.period('other'+i,date,false),key:'other'+i,entry:F.add(source.entry,-2),exit,moveDate:exit,moveBasis:'record',basis:'record'});}
 f.occupancies=F.occupanciesFor(f);f.days=F.capacityDays(f.occupancies,f.day,f.end);
 const before=JSON.stringify(f),plan=F.planActions(f),target=plan.targets.find(t=>t.start===source.entry),ctx=target.contexts.find(x=>x.focusId==='s');
 a.ok(ctx.recommended);const action=ctx.actions.find(x=>x.key===ctx.recommended.actionKey),o=action.options.find(x=>x.offset===ctx.recommended.offset);
 a.equal(o.offset,21);a.equal(o.cyclePeak,9);a.equal(o.heat.avoid,first);a.equal(o.heatWorse,first);a.equal(o.recommendable,true);a.equal(JSON.stringify(f),before);
}
// No suggestion to worsen occupancy just to get a first birth outside the heat band.
{
 const base={offset:0,level:'warn',peak:8,heat:{caution:true,avoid:true}},worse=[{offset:1,level:'good',peak:9},{offset:21,level:'warn',peak:10}];
 const advice=F.weanAdvice([base,...worse]);a.equal(advice.choice,base);a.equal(advice.kind,'check');
 const safer={offset:2,level:'good',peak:8};a.equal(F.weanAdvice([base,...worse,safer]).choice,safer);
}
a.equal(F.heat('2027-08-10').avoid,true); // Annual background bands stay calendar based.
console.log('PASS first-birth-only summer preference: parity/gilts vs experienced/unknown, subsequent cycles excluded, capacity 9/10/11 unchanged, seasonal-only warning never danger, annual/work/target simulation parity, first-birth August option allowed to resolve full rooms, no heat-only occupancy worsening, read-only JSON restoration.');
// Real simulation progression uses the same policy, without changing its production source.
for(const [parity,eligible] of [[0,true],[2,false]]){
 const d=seed(parity),before=JSON.stringify(d),result=c.TanakaSimulationFarm.advance(d,'2027-04-11','2027-08-01'),f=F.build(result.data,'2027-08-01');
 a.equal(F.periodHeat(f.periods.find(p=>p.id==='1')).avoid,eligible);a.equal(JSON.stringify(d),before);
}
// A cool full-room option cannot outrank a hot first-birth option which resolves full rooms.
{
 const date='2027-08-01',option=(after,avoid,key)=>({offset:1,effective:true,newFullDays:[],graph:[{date,before:11,after}],cyclePeak:after,currentPeak:1,heat:{avoid,caution:avoid},actionKey:key});
 const hot=option(9,true,'hot'),cool=option(10,false,'cool'),plan={targets:[{start:date,end:date,contexts:[{actions:[{options:[cool,hot]}]}]}]};
 a.equal(F.guidanceChoice({peak:11,capacityDays:[{date,count:11}]},plan).option,hot);
}
