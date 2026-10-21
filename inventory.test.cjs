'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){const c=vm.createContext({});for(const file of ['model.js','finishing-model.js','birth-validation.js','schedules.js','inventory-model.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),c);return {I:c.TanakaInventory,M:c.TanakaModel};}
const plain=x=>JSON.parse(JSON.stringify(x));
const date='2026-10-15',born=days=>new Date(Date.parse(date+'T00:00:00Z')-days*86400000).toISOString().slice(0,10);
const source={sows:{},rooms:[{key:'r1',state:'family',count:8,birthDate:born(49),sowId:'1'}],nursery:[{key:'n1',state:'occupied',count:5,birthDate:born(71),csf:true}],finishing:[{key:'f1',state:'occupied',count:4,kind:'育成母豚',weight:70,birthDate:born(90),csf:false},{key:'yard',state:'occupied',count:3,birthDate:'',individuals:[1,2,3].map(n=>({key:'test-yard-'+n,count:1,kind:'肉豚',birthDate:'',weight:null}))}]};
test('age boundaries classify 49, 50, 70 and 71 days without guessing missing dates',()=>{
 const {I}=setup();assert.equal(I.category('farrowing',{state:'family'},date,born(49)),'授乳');assert.equal(I.category('farrowing',{state:'piglets'},date,born(49)),'離乳');
 for(const area of ['farrowing','nursery'])for(const days of [50,70])assert.equal(I.category(area,{state:'occupied'},date,born(days)),'20');
 assert.equal(I.category('nursery',{state:'occupied'},date,born(71)),'30');assert.equal(I.category('farrowing',{state:'family'},date,born(71)),'');
 assert.equal(I.category('nursery',{state:'occupied'},date,''),'');assert.equal(I.category('nursery',{state:'occupied'},date,'2026-10-16'),'');
 assert.equal(I.category('finishing',{state:'occupied',weight:110},date,''),'');
});
test('snapshot preserves candidates as meat and permits individually unfilled yard rows',()=>{
 const {I}=setup(),before=JSON.stringify(source),r=I.create({},source,'2026-10',date,r=>r.birthDate||'');
 assert.equal(JSON.stringify(source),before);assert.equal(I.gilts(source),0);
 const s=I.aggregate(r.rows);assert.equal(s.totals['授乳'],8);assert.equal(s.totals['30'],5);assert.equal(s.gilts,0);assert.equal(s.totals['70'],4);assert.equal(s.total,17);assert.equal(s.unclassified,3);
 I.validateReport({...r,status:'confirmed'},r.month);
 const incomplete=I.clone(r);incomplete.rows.find(x=>x.area==='nursery').count=null;assert.throws(()=>I.validateReport({...incomplete,status:'confirmed'},r.month),/未入力/);
 r.rows.filter(x=>x.area==='yard').forEach(x=>x.category='90');r.shipping110=5;assert.equal(I.aggregate(r.rows).total,20);assert.equal(I.currentStock(r)['110'],5);
 I.validateReport({...r,status:'confirmed'},r.month);
});
test('month carry preserves planned and actual values and leaves earlier reports intact',()=>{
 const {I}=setup(),db={},r=I.create(db,source,'2026-10',date,r=>r.birthDate||'');
 r.rows.filter(x=>x.area==='yard').forEach(x=>x.category='90');I.syncPlan(r);r.status='confirmed';r.monthly[9].planned=20;r.monthly[9].actual=18;r.monthly[10].planned=22;I.saveReport(db,r,'null');
 const before=JSON.stringify(db.inventoryMonths['2026-10']),next=I.create(db,source,'2026-11',date,r=>r.birthDate||'');
 assert.equal(next.monthly[9].planned,20);assert.equal(next.monthly[9].actual,18);assert.equal(next.monthly[10].planned,22);assert.equal(next.previousStock['90'],3);
 next.monthly[10].planned=24;I.saveReport(db,next,'null');assert.equal(JSON.stringify(db.inventoryMonths['2026-10']),before);
 const revision=I.clone(db.inventoryMonths['2026-10']);revision.monthly[9].actual=19;I.saveReport(db,revision,JSON.stringify(db.inventoryMonths['2026-10']));
 assert.equal(db.inventoryMonths['2026-10'].revisions[0].report.monthly[9].actual,18);
 assert.throws(()=>I.saveReport(db,r,before),/別の画面/);
 const december=I.create(db,source,'2026-12',date,r=>r.birthDate||'');I.saveReport(db,december,'null');
 const january=I.create(db,source,'2027-01',date,r=>r.birthDate||'');assert.equal(january.monthly[0].month,'2027-01');assert.equal(january.monthly[0].actual,null);
 assert.equal(I.previousMonth('2027-01'),'2026-12');
});
test('version 3 JSON preserves monthly data, rejects invalid input, and remains backward compatible',()=>{
 const {I,M}=setup(),db=M.migrate(null),before=JSON.stringify(db),r=I.create(db,source,'2026-10',date,r=>r.birthDate||'');
 I.saveReport(db,r,'null');const restored=M.migrate(plain(db));assert.equal(restored.version,3);assert.deepEqual(plain(restored.inventoryMonths),plain(db.inventoryMonths));
 assert.equal(JSON.stringify(M.migrate(JSON.parse(before))),before);
 const bad=plain(db);bad.inventoryMonths['2026-10'].rows[0].count=-1;assert.throws(()=>M.validate(bad),/明細/);
 const badPlan=plain(db);badPlan.inventoryMonths['2026-10'].monthly[0].actual=1.2;assert.throws(()=>M.validate(badPlan),/出荷計画/);
 const unknown=plain(db);unknown.extra={keep:[null,false,0]};assert.deepEqual(plain(M.migrate(unknown).extra),unknown.extra);
});
