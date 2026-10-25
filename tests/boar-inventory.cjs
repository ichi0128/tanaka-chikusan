'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){const c=vm.createContext({});for(const f of ['model.js','finishing-model.js','schedules.js','inventory-model.js','cloud-store.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),c);return {M:c.TanakaModel,I:c.TanakaInventory,F:c.TanakaFinishing,Cloud:c.TanakaCloud.CloudStore};}
const plain=x=>JSON.parse(JSON.stringify(x));
test('boar migration seeds known B1/B2 only; missing/retired statuses never count as resident',()=>{
 const {M}=setup(),data=M.migrate(null);assert.deepEqual(plain(M.activeBoars(data)).map(x=>x.name),['B1','B2']);
 const old=M.clone(data);delete old.boars;old.logs=[{key:'historic',legacy:true,boar:'OLD-BOAR',type:'種付け'}];
 const restored=M.migrate(old);assert.deepEqual(plain(restored.boars),plain(data.boars));assert.equal(restored.logs[0].boar,'OLD-BOAR');assert.equal(old.boars,undefined);
 old.boars=[{id:'old',name:'過去種豚'},{id:'retired',name:'B0',status:'廃用／退役'}];
 assert.equal(M.activeBoars(old).length,0);const checked=M.migrate(old);assert.equal(checked.boars[0].status,'未確認');assert.equal(M.activeBoars(checked).length,0);
 old.boars=[];assert.equal(M.activeBoars(M.migrate(old)).length,0);
});
test('new resident boars, retirement and replacements are data-driven and leave mating history intact',()=>{
 const {M}=setup();let d=M.migrate(null);d.logs=[{key:'mate',type:'種付け',id:'53',date:'2026-10-01',boar:'B1'}];const logs=JSON.stringify(d.logs);
 const set=r=>{const expected=JSON.stringify(M.boarRecords(d));d=M.commit(d,x=>M.setBoar(x,r,expected));};
 set({id:'b3',name:'B3',status:'在籍'});assert.equal(M.activeBoars(d).length,3);
 set({id:'B1',name:'B1',status:'廃用／退役'});assert.equal(M.activeBoars(d).length,2);assert.equal(JSON.stringify(d.logs),logs);
 set({id:'b4',name:'B4',status:'廃用／退役'});assert.equal(M.activeBoars(d).length,2);
 assert.throws(()=>M.commit(d,x=>M.setBoar(x,{id:'dup',name:'b2',status:'在籍'},JSON.stringify(M.boarRecords(d)))),/重複/);
 assert.throws(()=>M.commit(d,x=>M.setBoar(x,{id:'B1',name:'New B1',status:'在籍'},JSON.stringify(M.boarRecords(d)))),/変更できません/);
 assert.throws(()=>M.setBoar(d,{id:'b5',name:'B5',status:'在籍'},'stale'),/変更されました/);
 const before=JSON.stringify(d);assert.throws(()=>M.commit(d,x=>M.setBoar(x,{id:'b5',name:'B5',status:'任意'},JSON.stringify(M.boarRecords(d)))));assert.equal(JSON.stringify(d),before);
});
test('farm totals allocate mothers once and add only resident boars with identical area breakdown',()=>{
 const {I}=setup();const r={sowSnapshot:{ids:['1','2','3']},boarSnapshot:{boars:[{id:'a',name:'A',status:'在籍'},{id:'b',name:'B',status:'廃用／退役'},{id:'c',name:'C'}]},rows:[
 {area:'farrowing',state:'family',sowId:'1',count:7,kind:'肉豚',category:'授乳'},
 {area:'farrowing',state:'waiting',sowId:'2',count:0,kind:'肉豚',category:''},
 {area:'nursery',count:5,kind:'肉豚',category:'20'},
 {area:'finishing',count:9,kind:'肉豚',category:'90'},
 {area:'yard',count:1,kind:'母豚',registeredSowId:'3',category:''},
 {area:'yard',count:2,kind:'肉豚',category:'80'}]};
 const sum=I.farmSummary(r);assert.deepEqual(plain(sum.areaTotals),{farrowing:9,nursery:5,finishing:9,yard:3});assert.equal(sum.boarCount,1);assert.equal(sum.farmTotal,27);assert.equal(sum.sowCount,3);
 r.rows.push({...r.rows[4]});assert.equal(I.farmSummary(r).farmTotal,27);
 r.boarSnapshot.boars[0].status='廃用／退役';assert.equal(I.farmSummary(r).farmTotal,26);
 delete r.boarSnapshot;assert.equal(I.farmSummary(r).boarCount,null);
});
test('monthly totals persist residency snapshots, keep old months and roundtrip JSON/cloud',()=>{
 const {M,I,Cloud}=setup();let d=M.migrate(null);let report=I.create(d,M.replay(d),'2026-10','2026-10-25',()=> '');I.saveReport(d,report,'null');
 const previous=I.create(d,M.replay(d),'2026-09','2026-09-25',()=> '');I.saveReport(d,previous,'null');const past=JSON.stringify(d.inventoryMonths['2026-09']),before=JSON.stringify(d.inventoryMonths['2026-10']);
 const expected=JSON.stringify(M.boarRecords(d));d=M.commit(d,x=>{M.setBoar(x,{id:'B2',name:'B2',status:'廃用／退役'},expected);I.syncSavedBoars(x,'2026-10');});
 assert.equal(I.farmSummary(d.inventoryMonths['2026-10']).boarCount,1);assert.equal(JSON.stringify(d.inventoryMonths['2026-09']),past);
 const archived=d.inventoryMonths['2026-10'].revisions.at(-1).report;assert.equal(I.farmSummary(archived).boarCount,2);assert.equal(archived.boarSnapshot.boars[1].status,'在籍');
 assert.equal(I.farmSummary(d.inventoryMonths['2026-10']).farmTotal,I.farmSummary(JSON.parse(before)).farmTotal-1);
 const reload=M.migrate(JSON.parse(JSON.stringify(d))),cloud=new Cloud({model:M});assert.deepEqual(plain(cloud.validate(reload)),plain(d));
 const old=I.clone(d.inventoryMonths['2026-09']);delete old.boarSnapshot;I.validateReport(old,old.month);assert.equal(I.farmSummary(old).boarCount,null);
 const invalid=I.clone(report);invalid.boarSnapshot={boars:[{id:'x',name:'X',status:'間違い'}]};assert.throws(()=>I.validateReport(invalid,invalid.month),/在籍状態/);
});
