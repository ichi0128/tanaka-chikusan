'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){const c=vm.createContext({});for(const f of ['model.js','finishing-model.js','schedules.js','inventory-model.js','sow-parity.js','sow-work.js','cloud-store.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),c);return {c,M:c.TanakaModel,P:c.TanakaSowParity,W:c.TanakaSowWork,d:c.TanakaModel.migrate(null)};}
const stamp={date:'2026-10-26',t:'2026-10-26T02:30:00.000Z'},plain=x=>JSON.parse(JSON.stringify(x));
test('explicit chosen room and true yard origin are saved; undo restores its exact room snapshot and named yard parcel',()=>{
 const {M,P,W,d}=setup(),s=d.sows.find(s=>s.id==='21');s.yardLocation={key:'yard-west',name:'西2番区画',extra:'keep'};d.baseline.find(r=>r.key==='r7').label='3号室';
 const room=JSON.stringify(M.replay(d).rooms.find(r=>r.key==='r7')),cards=JSON.stringify(P.pages(d,'21')),logs=JSON.stringify(d.logs),before=M.replay(d);
 const next=M.commit(d,x=>W.entry(x,{...stamp,id:'21',roomKey:'r7',key:'move21',expectedRoom:room})),entry=next.logs.at(-1),occupied=M.replay(next);
 a.equal(occupied.rooms.find(r=>r.key==='r7').sowId,'21');a.equal(occupied.rooms.find(r=>r.key==='r6').state,'empty');a.equal(entry.movement.from.name,'運動場 西2番区画');a.equal(entry.movement.to.name,'分娩舎3号室');a.equal(entry.t,stamp.t);a.equal(entry.id,'21');a.equal(entry.action.before.yardLocation.key,'yard-west');a.equal(JSON.stringify(P.pages(next,'21')),cards);
 const restored=M.commit(next,x=>W.undo(x,'move21',{...stamp,key:'undo21'})),after=M.replay(restored);
 a.equal(JSON.stringify(after.rooms.find(r=>r.key==='r7')),room);a.deepEqual(plain(after.sows['21'].yardLocation),plain(s.yardLocation));a.deepEqual(plain(after.sows['21'].location),plain(entry.movement.from));a.equal(restored.logs.at(-1).type,'移動取り消し');a.equal(restored.logs.at(-1).undoOf,'move21');a.equal(restored.logs.at(-1).movement.to.name,entry.movement.from.name);a.equal(JSON.stringify(restored.logs.slice(0,-1)),JSON.stringify(next.logs));a.equal(JSON.stringify(d.logs),logs);a.equal(after.rooms.filter(r=>['family','waiting'].includes(r.state)).length,before.rooms.filter(r=>['family','waiting'].includes(r.state)).length);a.throws(()=>M.commit(restored,x=>W.undo(x,'move21',stamp)),/取り消し済み/);
});
test('occupied rooms, stale rooms, duplicate entry, birth and replacement occupancy block unsafe actions atomically',()=>{
 const {M,W,d}=setup(),original=JSON.stringify(d);a.throws(()=>M.commit(d,x=>W.entry(x,{...stamp,id:'21',roomKey:'r1'})),/空いていません/);a.throws(()=>M.commit(d,x=>W.entry(x,{...stamp,id:'21',roomKey:'r6',expectedRoom:'old'})),/変わりました/);a.equal(JSON.stringify(d),original);
 let moved=M.commit(d,x=>W.entry(x,{...stamp,id:'21',roomKey:'r6',key:'first'}));a.throws(()=>M.commit(moved,x=>W.entry(x,{...stamp,id:'21',roomKey:'r7'})),/既に/);
 const birth=M.commit(moved,x=>x.logs.push({...stamp,key:'birth',type:'分娩',id:'21',roomKey:'r6',count:9}));a.throws(()=>M.commit(birth,x=>W.undo(x,'first',stamp)),/出産前/);
 const changed=M.commit(moved,x=>{const r=M.replay(x).rooms.find(r=>r.key==='r6');x.logs.push({...stamp,key:'edit',type:'分娩舎修正',id:'21',roomKey:'r6',room:{...r,label:'東室'}});});a.throws(()=>M.commit(changed,x=>W.undo(x,'first',stamp)),/変更/);
 const back=M.commit(moved,x=>W.returnToYard(x,{...stamp,roomKey:'r6',key:'return'}));const again=M.commit(back,x=>W.entry(x,{...stamp,id:'21',roomKey:'r6',key:'second'}));a.throws(()=>M.commit(again,x=>W.undo(x,'first',stamp)),/取り消し済み/);a.throws(()=>M.commit(again,x=>W.returnToYard(x,{...stamp,roomKey:'r6',expectedEntry:'first'})),/変わりました/);
});
test('old movement records remain usable, generic yard is not given an invented parcel; JSON and cloud restore preserve receipts',()=>{
 const {c,M,W,d}=setup();const moved=M.commit(d,x=>W.entry(x,{...stamp,id:'21',roomKey:'r8',key:'saved'}));a.equal(moved.logs.at(-1).movement.from.name,'運動場');const restored=M.migrate(JSON.parse(JSON.stringify(moved))),cloud=new c.TanakaCloud.CloudStore({model:M});a.equal(JSON.stringify(cloud.validate(restored)),JSON.stringify(moved));const back=M.commit(restored,x=>W.undo(x,'saved',stamp));a.equal(M.replay(back).rooms.find(r=>r.key==='r8').state,'empty');
 const old=M.commit(d,x=>x.logs.push({...stamp,type:'分娩舎へ移動',id:'21',roomKey:'r9',key:'legacy'}));const returned=M.commit(old,x=>W.returnToYard(x,{...stamp,roomKey:'r9',key:'cancel-legacy'}));a.equal(returned.logs.at(-1).undoOf,'legacy');a.equal(returned.logs.at(-1).movement.to.name,'運動場');a.equal(M.replay(returned).rooms.find(r=>r.key==='r9').state,'empty');
});
test('swimgen toggle uses saved status without asking for a vaccination date; history and old dates are retained and undoable',()=>{
 const {M,P,W,d}=setup(),old=P.pages(d,'21')[0],logs=JSON.stringify(d.logs);a.equal(W.swimgenDone(old.card),false);a.equal(W.swimgenDone({swimgen:'10/16 済'}),true);a.equal(W.swimgenDone({swimgen:'済'}),true);
 const done=M.commit(d,x=>W.setSwimgen(x,{...stamp,id:'21',done:true,key:'dose',expectedPage:JSON.stringify(old)}));a.equal(W.swimgenDone(P.pages(done,'21')[0].card),true);a.equal(P.pages(done,'21')[0].card.swimgen,old.card.swimgen);a.equal(M.schedules(done,'2026-10-26').filter(x=>x.id==='21'&&x.type==='スイムジェン 実施').length,0);a.equal(done.logs.at(-1).action.kind,'swimgen-status');a.equal(JSON.stringify(d.logs),logs);
 const undone=M.commit(done,x=>W.undo(x,'dose',{...stamp,key:'undo-dose'}));a.equal(W.swimgenDone(P.pages(undone,'21')[0].card),false);a.equal(undone.logs.at(-1).undoOf,'dose');a.ok(M.schedules(undone,'2026-10-26').some(x=>x.id==='21'&&x.type==='スイムジェン 実施'));
 a.equal(JSON.stringify(M.replay(done).rooms),JSON.stringify(M.replay(d).rooms));
});
test('swimgen old work facts survive marking not done, roundtrip and the next actual birth; later work blocks stale undo',()=>{
 const {M,P,W,d}=setup();d.logs.push({...stamp,key:'old-dose',type:'スイムジェン 実施',id:'21',date:'2026-10-16'});a.equal(W.swimgenDone(P.pages(d,'21')[0].card),true);
 let next=M.commit(d,x=>W.setSwimgen(x,{...stamp,key:'uncheck',id:'21',done:false}));a.equal(W.swimgenDone(P.pages(next,'21')[0].card),false);a.ok(M.schedules(next,stamp.date).some(p=>p.id==='21'&&p.type==='スイムジェン 実施'));a.equal(next.logs.find(l=>l.key==='old-dose').date,'2026-10-16');
 next=M.migrate(JSON.parse(JSON.stringify(next)));const p=P.pages(next,'21')[0];next=M.commit(next,x=>W.setSwimgen(x,{...stamp,key:'recheck',id:'21',done:true,expectedPage:JSON.stringify(p)}));a.throws(()=>M.commit(next,x=>W.undo(x,'uncheck',stamp)),/その後/);
 next=M.commit(next,x=>{const l={...stamp,key:'birth',type:'分娩',id:'21',roomKey:'r6',count:9};P.beforeRecord(x,'21',l);x.logs.push(l);});a.equal(W.swimgenDone(P.pages(next,'21')[0].card),false);a.throws(()=>M.commit(next,x=>W.undo(x,'recheck',stamp)),/その後/);a.equal(next.logs.find(l=>l.key==='old-dose').date,'2026-10-16');
});

test('cloud JSON key reordering does not block move cancellation or subsequent restore',()=>{
 const {M,W,d}=setup(),moved=M.commit(d,x=>W.entry(x,{...stamp,id:'21',roomKey:'r6',key:'cloud-move'}));
 const reorder=x=>Array.isArray(x)?x.map(reorder):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().reverse().map(k=>[k,reorder(x[k])])):x;
 const cloudData=M.migrate(reorder(plain(moved)));const cancelled=M.commit(cloudData,x=>W.undo(x,'cloud-move',{...stamp,key:'cloud-undo'}));
 a.equal(M.replay(M.migrate(reorder(plain(cancelled)))).rooms.find(r=>r.key==='r6').state,'empty');a.equal(cancelled.logs.at(-1).undoOf,'cloud-move');
});

test('no reheat receipt completes only this check; undo and JSON/cloud restore retain reproductive facts and future schedules',()=>{
 const {c,M,P,W,d}=setup(),id='812',day='2026-10-28',page=JSON.stringify(P.pages(d,id)),rooms=JSON.stringify(M.replay(d).rooms),logs=JSON.stringify(d.logs);
 const before=M.schedules(d,day).filter(x=>x.id===id&&x.type!=='再発情確認');a.ok(M.schedules(d,day).some(x=>x.id===id&&x.type==='再発情確認'));
 let next=M.commit(d,x=>W.clearReheat(x,{id,date:day,key:'no-reheat',expectedPage:JSON.stringify(P.pages(d,id)[0])}));
 a.equal(JSON.stringify(P.pages(next,id)),page);a.equal(JSON.stringify(M.replay(next).rooms),rooms);a.equal(JSON.stringify(d.logs),logs);a.equal(next.logs.at(-1).type,'追記');a.equal(next.logs.at(-1).note,'再発情なし（確認済み）');a.ok(!M.schedules(next,day).some(x=>x.id===id&&x.type==='再発情確認'));a.deepEqual(plain(M.schedules(next,day).filter(x=>x.id===id)),plain(before));
 a.throws(()=>M.commit(next,x=>W.clearReheat(x,{id,date:day,key:'double'})),/現在の/);
 next=M.migrate(JSON.parse(JSON.stringify(next)));const cloud=new c.TanakaCloud.CloudStore({model:M});next=cloud.validate(next);a.ok(!M.schedules(next,day).some(x=>x.id===id&&x.type==='再発情確認'));
 const back=M.commit(next,x=>W.undo(x,'no-reheat',{date:day,key:'undo-none'}));a.equal(back.logs.at(-1).undoOf,'no-reheat');a.ok(M.schedules(back,day).some(x=>x.id===id&&x.type==='再発情確認'));a.throws(()=>M.commit(back,x=>W.undo(x,'no-reheat',{date:day})),/取り消し済み/);
});
test('later mating or corrected dates require a fresh check and reject old undo; positive findings retain their existing semantics',()=>{
 const {M,P,W,d}=setup(),id='812',day='2026-10-28';let next=M.commit(d,x=>W.clearReheat(x,{id,date:day,key:'first-none'}));
 const p=P.pages(next,id)[0];next=M.commit(next,x=>P.edit(x,id,p.key,{...p.card,mating:'10/10'},JSON.stringify(p),true));a.ok(M.schedules(next,day).some(x=>x.id===id&&x.type==='再発情確認'&&x.date==='2026-10-31'));a.throws(()=>M.commit(next,x=>W.undo(x,'first-none',{date:day})),/その後/);
 next=M.commit(next,x=>W.clearReheat(x,{id,date:day,key:'second-none'}));next=M.commit(next,x=>{const l={key:'positive',type:'再発情確認',id,date:day};P.beforeRecord(x,id,l);x.logs.push(l);});a.equal(P.pages(next,id)[0].card.reheatPending,true);a.equal(P.pages(next,id)[0].card.reheatCount,1);a.throws(()=>M.commit(next,x=>W.undo(x,'second-none',{date:day})),/その後/);
 next=M.commit(next,x=>{const l={key:'next-mate',type:'種付け',id,date:'2026-10-29',boar:'B1'};P.beforeRecord(x,id,l);x.logs.push(l);});a.ok(M.schedules(next,'2026-11-20').some(x=>x.id===id&&x.type==='再発情確認'&&x.date==='2026-11-19'));
});

test('old baseline checks before schedule import cutoff can be completed from their cards; December dates use the following year',()=>{
 const {M,P,W,d}=setup();const next=M.commit(d,x=>W.clearReheat(x,{id:'98',date:'2026-10-28',key:'old-check'}));a.ok(W.reheatReceipt(next,'98','2026-08-10'));a.equal(JSON.stringify(P.pages(next,'98')),JSON.stringify(P.pages(d,'98')));
 const p=P.pages(d,'812')[0],year=M.commit(d,x=>P.edit(x,'812',p.key,{...p.card,mating:'2026-12-20'},JSON.stringify(p),true));a.equal(W.reheatPlanDate(year,'812'),'2027-01-10');
});
