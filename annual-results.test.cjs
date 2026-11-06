'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){const c=vm.createContext({console});for(const file of ['model.js','finishing-model.js','schedules.js','sow-parity.js','annual-results.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);return {c,A:c.TanakaAnnual,P:c.TanakaSowParity,M:c.TanakaModel};}
const sow=()=>({id:'21',active:true,cardBaseline:{parity:1,result:'9－7',wean:'2025-12-01'}});
const birth=(key,date,count=9)=>({key,id:'21',type:'分娩',date,count,stillborn:2});
test('actual births count each cycle once, include retired sow history, never forecasts or prior results at mating',()=>{
 const {A}=setup(),d={sows:[sow()],logs:[birth('a','2026-01-02',9),{key:'w',id:'21',type:'離乳',date:'2026-02-03',count:7},birth('b','2026-09-03',10),{key:'m',id:'21',type:'種付け',date:'2026-11-01'},birth('c','2025-01-01',8)]};
 const before=JSON.stringify(d),s=A.summary(d,'2026');assert.equal(s.farrowings.automatic,2);assert.equal(s.piglets.automatic,19);assert.equal(s.monthly[0].piglets,9);assert.equal(s.monthly[8].piglets,10);assert.equal(JSON.stringify(d),before);
 d.sows[0].active=false;assert.equal(A.summary(d,'2026').piglets.total,19);assert.equal(A.summary(d,'2025').piglets.total,8);
});
test('dated historical cards are included once; yearless cards, snapshots and pregnancy display copies do not fabricate births',()=>{
 const {A}=setup(),s=sow(),history=[{key:'historic',parity:1,card:{birthDateActual:'2024-12-31',birthCount:12},revisions:[]},{key:'duplicate',parity:2,card:{birthDateActual:'2024-12-31',birthCount:12},revisions:[]},{key:'no-year',parity:3,card:{birthDateActual:'9/2',birthCount:9},revisions:[]}];
 s.parityCards={version:1,history,current:{key:'now',parity:4,card:{mating:'2026-01-01',due:'2026-04-25',birthDateActual:''},capturedKeys:[],revisions:[]}};
 const d={sows:[s],logs:[]};assert.equal(A.summary(d,'2024').farrowings.total,1);assert.equal(A.summary(d,'2024').piglets.total,12);assert.equal(A.summary(d,'2026').farrowings.total,0);
 s.parityCards.history.push({key:'legacy-result',parity:0,card:{birthDateActual:'2023-01-01',result:'8－6'},revisions:[]});assert.equal(A.summary(d,'2023').piglets.total,8);
});
test('edited original logs take precedence over captured snapshots; explicit later card corrections apply without double counting',()=>{
 const {A,P}=setup(),d={sows:[sow()],logs:[birth('a','2026-01-02',9)]};
 const page=P.pages(d,'21')[0];P.edit(d,'21',page.key,{...page.card,birthCount:11},JSON.stringify(page));assert.equal(A.summary(d,'2026').piglets.total,11);
 d.logs[0]={...d.logs[0],date:'2025-12-31',count:13,revisions:[{...d.logs[0]}],updatedAt:'9999-01-01T00:00:00Z'};
 assert.equal(A.summary(d,'2026').farrowings.total,0);assert.equal(A.summary(d,'2025').piglets.total,13);
 d.deletedLogs=[d.logs.pop()];assert.equal(A.summary(d,'2026').farrowings.total,0);assert.equal(A.summary(d,'2025').farrowings.total,0);
});
test('card birth date corrections move totals across years; room birth count edits change birth counts not weaning counts',()=>{
 const {A,P}=setup(),d={sows:[sow()],logs:[{...birth('a','2026-01-02',9),roomKey:'r1'}]};
 d.logs.push({key:'r',type:'分娩舎修正',id:'21',roomKey:'r1',date:'2026-01-03',room:{state:'family',birthDate:'2026-01-02',birthCount:10,count:8}});
 assert.equal(A.summary(d,'2026').piglets.total,10);
 const p=P.pages(d,'21')[0];P.edit(d,'21',p.key,{...p.card,birthDateActual:'2025-12-31'},JSON.stringify(p));assert.equal(A.summary(d,'2026').farrowings.total,0);assert.equal(A.summary(d,'2025').farrowings.total,1);
});
test('shipment summary uses actual dates and respects manual additions/exclusions while excluding consignment',()=>{
 const {A}=setup(),d={sows:[],logs:[{key:'s1',type:'肉豚出荷',date:'2026-01-03',count:5},{key:'s2',type:'肉豚出荷',date:'2026-02-01',count:8},{key:'old',type:'肉豚出荷',date:'2025-12-31',count:4},{key:'private',type:'肉豚舎更新',date:'2026-01-03',count:1,privateStockUse:{consignmentCount:1}}],shipmentHistory:{added:[{key:'manual',date:'2026-03-01',count:2}],deletedLogKeys:['s2']}};
 assert.equal(A.summary(d,'2026').shipments.total,7);assert.equal(A.summary(d,'2026').monthly[0].shipments,5);assert.equal(A.summary(d,'2026').monthly[1].shipments,0);assert.equal(A.summary(d,'2025').shipments.total,4);
 d.logs[0].count=6;assert.equal(A.summary(d,'2026').shipments.total,8);
});
test('missing birth counts are visible and not replaced with stillborn, weaned or planned counts',()=>{
 const {A}=setup(),d={sows:[sow()],logs:[birth('a','2026-01-01',null),birth('b','2026-07-01',0)]};const s=A.summary(d,'2026');assert.equal(s.farrowings.total,2);assert.equal(s.piglets.total,0);assert.equal(s.missingPiglets,1);assert.equal(s.monthly[0].missingPiglets,1);
});
test('signed annual adjustments stay separate, survive source edits, have independent years and never enter monthly graphs',()=>{
 const {A}=setup(),d={sows:[],logs:[{key:'s',type:'肉豚出荷',date:'2026-03-01',count:10}]},before=JSON.stringify(d.logs);
 A.setAdjustment(d,'2026','shipments',3,0);A.setAdjustment(d,'2025','shipments',20,0);assert.equal(A.summary(d,'2026').shipments.total,13);assert.equal(A.summary(d,'2026').monthly[2].shipments,10);
 d.logs[0].count=12;assert.equal(A.summary(d,'2026').shipments.total,15);A.setAdjustment(d,'2026','shipments',-2,3);assert.equal(A.summary(d,'2026').shipments.total,10);assert.equal(A.summary(d,'2025').shipments.total,20);
 assert.throws(()=>A.setAdjustment(d,'2026','shipments',-13,-2),/0以上/);assert.throws(()=>A.setAdjustment(d,'2026','shipments',1,3),/更新/);assert.throws(()=>A.setAdjustment(d,'2026','shipments',1.5),/整数/);
 d.logs[0].count=10;assert.equal(JSON.stringify(d.logs),before);d.logs=[];assert.equal(A.summary(d,'2026').shipments.total,-2,'never silently clamp or clear a now-inconsistent correction');
});
test('optional adjustment fields preserve schema3 old data, JSON round trips and enforce signed safe integers',()=>{
 const {A,M}=setup(),d=M.migrate(null);assert.equal(d.annualAdjustments,undefined);const before=JSON.stringify(d);A.summary(d,'2026');assert.equal(JSON.stringify(d),before);
 const next=M.commit(d,x=>A.setAdjustment(x,'2026','piglets',218,0)),restored=M.migrate(JSON.parse(JSON.stringify(next)));assert.equal(restored.version,3);assert.equal(A.summary(restored,'2026').piglets.total,218);
 assert.throws(()=>M.commit(next,x=>x.annualAdjustments['2026'].piglets=1.5),/補正値/);assert.throws(()=>M.commit(next,x=>x.annualAdjustments['2026'].piglets='3'),/補正値/);assert.equal(next.annualAdjustments['2026'].piglets,218);
});
test('month-only shipment totals populate all nine chart bars and yearly sum without inventing dates or changing later months',()=>{
 const {c,A}=setup(),F=c.TanakaFinishing,d={sows:[],logs:[],shipmentHistory:{added:[{key:'oct',date:'2026-10-29',count:20},{key:'nov',date:'2026-11-05',count:7}],deletedLogKeys:[]}};
 const lines='1 35\n2 15\n3 30\n4 21\n5 20\n6 20\n7 23\n8 26\n9 27',facts=JSON.stringify(d.shipmentHistory.added),plan=F.monthlyShipmentPlan(d,'2026',lines,'2026-11-06');F.setMonthlyShipments(d,plan,'2026-11-06');
 const result=A.summary(d,'2026');assert.equal(result.shipments.automatic,244);assert.deepEqual(Array.from(result.monthly,x=>x.shipments),[35,15,30,21,20,20,23,26,27,20,7,0]);assert.equal(JSON.stringify(d.shipmentHistory.added),facts);assert.equal(d.logs.length,0);assert.ok(d.shipmentHistory.monthlyAdded.every(r=>r.month.length===7&&r.date===undefined));
 const keys=d.shipmentHistory.monthlyAdded.map(r=>r.key);F.setMonthlyShipments(d,plan,'2026-11-06');assert.equal(A.summary(d,'2026').shipments.total,244);assert.deepEqual(d.shipmentHistory.monthlyAdded.map(r=>r.key),keys);
});
test('monthly import reconciles existing daily facts, rejects plans/duplicates/impossible lower totals and supports deletion',()=>{
 const {c,A}=setup(),F=c.TanakaFinishing,d={sows:[],logs:[],shipmentHistory:{added:[{key:'jan',date:'2026-01-10',count:5}],deletedLogKeys:[]}};
 F.setMonthlyShipments(d,F.monthlyShipmentPlan(d,'2026','1 10','2026-11-06'),'2026-11-06');assert.equal(d.shipmentHistory.monthlyAdded[0].count,5);assert.equal(A.summary(d,'2026').monthly[0].shipments,10);
 assert.throws(()=>F.monthlyShipmentPlan(d,'2026','1 4','2026-11-06'),/日付付き/);assert.throws(()=>F.monthlyShipmentPlan(d,'2026','12 20','2026-11-06'),/未来月/);assert.throws(()=>F.monthlyShipmentPlan(d,'2026','1 10\n1 10','2026-11-06'),/重複/);assert.throws(()=>F.monthlyShipmentPlan(d,'2026','13 10','2026-11-06'),/1行/);
 F.deleteShipment(d,'monthly',d.shipmentHistory.monthlyAdded[0].key);assert.equal(A.summary(d,'2026').shipments.total,5);assert.equal(d.shipmentHistory.added.length,1);
});
