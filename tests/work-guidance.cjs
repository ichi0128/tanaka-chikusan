const fs=require('fs'),vm=require('vm'),a=require('assert/strict'),path=require('path'),c=vm.createContext({});
for(const file of ['model.js','finishing-model.js','schedules.js','inventory-model.js','sow-parity.js','gilt-model.js','farrowing-forecast.js','farrowing-actions.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c);
const F=c.TanakaForecast,f={day:'2026-10-19'},x={id:'test',type:'分娩舎へ移動',date:'2026-11-03'};
let j={level:'warn',date:x.date,peak:10,peakDate:'2026-11-05',onDateCount:9},g=F.workGuidance(f,x,j);a.match(g.steps[0],/11\/3.*予定どおり可能/);a.match(g.steps[0],/11\/5.*1室/);a.equal(g.required,1);a.equal(g.proposal,null);
g=F.workGuidance(f,x,{...j,level:'bad',peak:11,peakDate:'2026-11-06'});a.match(g.steps[0],/当日は収容範囲内/);a.match(g.steps[0],/11\/6までに最低1室/);a.ok(!g.steps[0].includes('予定どおり可能'));
g=F.workGuidance(f,x,{...j,level:'bad',peak:12,onDateCount:11});a.match(g.steps[0],/当日から収容超過/);a.match(g.steps[0],/最低2室/);
g=F.workGuidance(f,x,{...j,peak:9});a.match(g.steps[0],/空室1室を維持/);a.equal(g.required,0);
g=F.workGuidance(f,x,{...j,uncertain:true});a.ok(!g.steps.join('').includes('予定どおり可能'));a.match(g.steps.join(''),/実際に確認/);
for(const extra of [{heat:{caution:true,avoid:true},birth:'2027-08-03'},{uncertainty:true},{holdPeak:9,holdDate:'2026-10-25'},{age:27},{unavailable:true}])a.ok(F.workGuidance(f,{type:'離乳',date:x.date},{level:'warn',peak:5,...extra}).steps.length);
a.equal(F.workGuidance(f,x,{level:'good',peak:8}),null);
// Ten registered stays plus one piglet room. The existing planner cannot reach
// nine; six days' advance is the smallest option that removes the eleven-room peak.
const forecast={day:'2026-10-19',end:'2027-10-19',periods:Array.from({length:10},(_,i)=>({...F.period('s'+i,'2026-07-01',false),key:'s'+i,entry:'2026-11-01',exit:'2026-11-20',moveDate:'2026-11-20',moveBasis:'record',basis:'record'})),childStays:[{id:'piglets:r1',key:'child',roomKey:'r1',entry:'2026-10-19',exit:'2026-11-06',moveDate:'2026-11-06',birth:'2026-09-07',moveBasis:'estimate',actualBirth:true,pigletsOnly:true,basis:'record'}],rows:[],rooms:[],nursery:[],missing:[],unmodelled:[]};
forecast.occupancies=F.occupanciesFor(forecast);forecast.days=[];for(let date=forecast.day;date<=forecast.end;date=F.add(date,1)){const overlaps=F.overlapsAt(forecast,date);forecast.days.push({date,count:overlaps.length,overlaps});}
const before=JSON.stringify(forecast),plan=F.planActions(forecast),planBefore=JSON.stringify(plan),capacityDays=forecast.days.filter(d=>d.date>='2026-11-01'&&d.date<='2026-11-08').map(d=>({date:d.date,count:d.count}));
j={level:'bad',peak:11,peakDate:'2026-11-01',capacityDays};g=F.workGuidance(forecast,x,j,plan);a.ok(g.proposal);a.equal(g.proposal.peak,10);a.equal(g.proposal.option.offset,-6);a.equal(g.proposal.action.kind,'move');
a.equal(F.guidanceChoice({...j,capacityDays:capacityDays.map(d=>({...d,count:d.count+1}))},plan),null);a.equal(F.guidanceChoice({...j,uncertainty:true},plan),null);
a.equal(JSON.stringify(forecast),before);a.equal(JSON.stringify(plan),planBefore);console.log('PASS work guidance: date/room/action instructions for nine/full/overflow, same-day vs later overflow, uncertainty/heat/hold/nursing actions, minimal existing simulation even 11→10, mismatched cohorts blocked, immutable forecast and plan.');
