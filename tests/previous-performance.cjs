'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const c=vm.createContext({});for(const f of ['model.js','finishing-model.js','schedules.js','inventory-model.js','sow-parity.js','weaning-record.js','cloud-store.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),c);
 const M=c.TanakaModel,P=c.TanakaSowParity,W=c.TanakaWeaning;let d=M.migrate(null);d.logs=[];d.sows=d.sows.filter(s=>s.id==='912');d.baseline.forEach(r=>Object.assign(r,{state:'empty',sowId:'',count:null,birthDate:''}));
 d.sows[0].cardBaseline={parity:3,mating:'2026-05-29',due:'2026-09-20',birthDateActual:'2026-09-21',birthCount:9,result:'7→6',wean:'5/25',mother:'60',csf:'済'};
 Object.assign(d.baseline[0],{state:'family',sowId:'912',birthDate:'2026-09-21',birthCount:9,count:9});
 const l=W.createLog(d,{id:'912',roomKey:'r1',date:'2026-10-21',operator:'担当者',count:9,note:'離乳記録'});d=M.commit(d,x=>{P.beforeRecord(x,'912',l);x.logs.push(l);});
 return {c,M,P,W,d,record:(data,l)=>M.commit(data,x=>{P.beforeRecord(x,'912',l);x.logs.push(l);})};
}
const plain=x=>JSON.parse(JSON.stringify(x));
test('completed performance remains visible after mating and remating without polluting the new parity',()=>{
 const {M,P,d,record}=setup(),original=JSON.stringify(d),history=JSON.stringify(d.sows[0].parityCards.history);
 let next=record(d,{key:'mating',type:'種付け',id:'912',date:'2026-10-26',boar:'B2'});
 const before=JSON.stringify(next);for(let i=0;i<3;i++)assert.deepEqual(plain(P.performance(next,'912')),{birthCount:9,weanCount:9,wean:'2026-10-21',result:'9－9',previous:true,sourceKey:d.sows[0].parityCards.history.at(-1).key});
 assert.equal(JSON.stringify(next),before);assert.equal(JSON.stringify(d),original);
 const current=P.pages(next,'912')[0];assert.equal(current.parity,4);assert.equal(current.card.mating,'2026-10-26');assert.equal(current.card.due,M.addDays('2026-10-26',114));assert.equal(current.card.birthCount,undefined);assert.equal(current.card.weanCount,undefined);
 next=record(next,{key:'return',type:'再発情確認',id:'912',date:'2026-11-16'});next=record(next,{key:'remate',type:'種付け',id:'912',date:'2026-11-17',boar:'B1'});
 assert.equal(P.performance(next,'912').result,'9－9');assert.equal(P.performance(next,'912').wean,'2026-10-21');assert.equal(JSON.stringify(next.sows[0].parityCards.history),history);
});
test('actual next birth switches to new counts and clears only the new parity weaning; old history stays frozen',()=>{
 const {P,W,d,record}=setup(),history=JSON.stringify(d.sows[0].parityCards.history);
 let next=record(d,{key:'mate',type:'種付け',id:'912',date:'2026-10-26',boar:'B2'});
 next=record(next,{key:'birth',type:'分娩',id:'912',date:'2027-02-17',roomKey:'r2',count:11,stillborn:1});
 assert.deepEqual(plain(P.performance(next,'912')),{birthCount:11,weanCount:null,wean:'',result:'11－'});assert.equal(JSON.stringify(next.sows[0].parityCards.history),history);
 const current=P.pages(next,'912')[0];assert.equal(current.parity,4);assert.equal(current.card.weanDateActual,'');assert.equal(current.card.weanCount,null);
 const l=W.createLog(next,{id:'912',roomKey:'r2',date:'2027-03-19',count:10,operator:'担当者'});next=record(next,l);
 next=record(next,{key:'third-cycle-mate',type:'種付け',id:'912',date:'2027-03-23',boar:'B1'});
 assert.equal(P.performance(next,'912').result,'11－10');assert.equal(P.performance(next,'912').wean,'2027-03-19');assert.equal(P.pages(next,'912')[0].parity,5);
 assert.equal(JSON.stringify(next.sows[0].parityCards.history[0]),JSON.stringify(JSON.parse(history)[0]));assert.equal(next.sows[0].parityCards.history.filter(p=>p.parity===3).length,1);
});
test('already-cleared saved pregnancy cards recover their display on JSON/cloud restore and history edits stay separate',()=>{
 const {c,M,P,d,record}=setup();let next=record(d,{key:'old-mating',type:'種付け',id:'912',date:'2026-10-26',boar:'B2'}),p=P.pages(next,'912')[1];
 const historyBefore=JSON.stringify(next.sows[0].parityCards.history);assert.equal(P.performance(next,'912').result,'9－9');
 const restored=M.migrate(JSON.parse(JSON.stringify(next))),cloud=new c.TanakaCloud.CloudStore({model:M});assert.equal(JSON.stringify(cloud.validate(restored)),JSON.stringify(next));assert.equal(P.performance(restored,'912').result,'9－9');assert.equal(JSON.stringify(next.sows[0].parityCards.history),historyBefore);
 const rooms=JSON.stringify(M.replay(next).rooms);P.editHistory(next,'912',p.key,{birthCount:'10',weanCount:'8'},JSON.stringify(p));
 assert.equal(P.performance(next,'912').result,'10－8');assert.equal(JSON.stringify(M.replay(next).rooms),rooms);assert.equal(P.pages(next,'912')[0].card.birthCount,undefined);
 const older=P.pages(next,'912')[1];assert.equal(P.performance(next,'912',older.key).result,'10－8');assert.equal(older.revisions.at(-1).card.birthCount,9);
});
test('zero and unknown results stay distinct; missing histories never manufacture a birth count',()=>{
 const {M,P,d,record}=setup();assert.equal(P.cardPerformance({birthCount:0,weanCount:0,result:'9→9'}).result,'0－0');assert.equal(P.cardPerformance({birthCount:9,result:'9→8',wean:'10/21'}).result,'9－8');assert.equal(P.cardPerformance({birthCount:11,result:'9→8'}).result,'11－');
 const next=record(d,{key:'old-mating',type:'種付け',id:'912',date:'2026-10-26',boar:'B2'});next.sows[0].parityCards.history=[];
 const wean=next.logs.find(l=>l.type==='離乳');wean.sourceRoom.birthCount=null;
 assert.equal(P.performance(next,'912').birthCount,null);assert.equal(P.performance(next,'912').weanCount,9);
 next.logs=[];next.sows[0].parityCards.current.capturedKeys=[];assert.equal(P.performance(next,'912').result,'');M.validate(next);
});

test('an actual birth without a recorded intervening mating still replaces the previous results once',()=>{
 const {P,d,record}=setup(),history=JSON.stringify(d.sows[0].parityCards.history);
 const next=record(d,{key:'birth-without-mate',type:'分娩',id:'912',date:'2027-02-17',roomKey:'r2',count:10});
 assert.equal(P.pages(next,'912')[0].awaitingMating,undefined);assert.equal(P.pages(next,'912')[0].parity,4);
 assert.deepEqual(plain(P.performance(next,'912')),{birthCount:10,weanCount:null,wean:'',result:'10－'});assert.equal(JSON.stringify(next.sows[0].parityCards.history),history);
});
