const fs=require('fs'),vm=require('vm'),path=require('path'),a=require('assert/strict'),c=vm.createContext({});
for(const file of ['model.js','finishing-model.js','birth-validation.js','schedules.js','inventory-model.js','sow-parity.js','cloud-store.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c);
const M=c.TanakaModel,P=c.TanakaSowParity;let d=M.migrate(null);d.sows=d.sows.filter(s=>s.id==='149');d.sows[0].cardBaseline={parity:5,mating:'',reheatCount:0};d.logs=[];d.baseline.forEach(r=>Object.assign(r,{state:'empty',sowId:'',count:null,birthDate:''}));
function append(data,l){return M.commit(data,x=>{P.beforeRecord(x,'149',l);x.logs.push(l);});}
d=append(d,{key:'mating',type:'種付け',id:'149',date:'2026-10-20',boar:'B1'});
d=append(d,{key:'mating2',type:'種付け',id:'149',date:'2026-10-21',boar:'B2'});
a.equal(P.pages(d,'149')[0].card.due,'2027-02-11');a.equal(P.pages(d,'149')[0].card.swimgen,'2027-01-28');
d=append(d,{key:'swim',type:'スイムジェン 実施',id:'149',date:'2027-01-28'});
a.equal(P.pages(d,'149')[0].card.swimgen,'2027-01-28 済');
d=append(d,{key:'entry',type:'分娩舎へ移動',id:'149',date:'2027-02-07',roomKey:'r1'});
a.equal(P.pages(d,'149')[0].card.swimgen,'2027-01-28 済');
const oldLogs=JSON.stringify(d.logs);
d=append(d,{key:'birth',type:'分娩',id:'149',date:'2027-02-18',roomKey:'r1',count:9});
a.equal(P.pages(d,'149')[0].card.swimgen,'');a.equal(M.sowCard(d,'149').swimgen,'');a.equal(JSON.stringify(d.logs.slice(0,-1)),oldLogs);
a.equal(M.schedules(d,'2027-02-18').filter(p=>p.type==='スイムジェン 実施').length,0);
// Older captured cards are corrected on read without rewriting saved data/history.
let page=P.pages(d,'149')[0];P.edit(d,'149',page.key,{...page.card,swimgen:'2027-01-28 済'},JSON.stringify(page));
const captured=JSON.stringify(d);a.equal(P.pages(d,'149')[0].card.swimgen,'');a.equal(M.sowCard(d,'149').swimgen,'');a.equal(JSON.stringify(d),captured);
const cloud=new c.TanakaCloud.CloudStore({model:M}),restored=cloud.validate(M.migrate(JSON.parse(JSON.stringify(d))));a.equal(P.pages(restored,'149')[0].card.swimgen,'');a.equal(restored.logs.find(l=>l.key==='swim').date,'2027-01-28');
// A new mating gets a fresh due-minus-14 reminder, without reusing the old dose.
d=append(d,{key:'wean',type:'離乳',id:'149',date:'2027-03-20',roomKey:'r1',count:9});d=append(d,{key:'next-mating',type:'種付け',id:'149',date:'2027-03-24',boar:'B2'});
const card=P.pages(d,'149')[0].card;a.equal(card.swimgen,M.addDays(card.due,-14));a.equal(card.swimgen,M.addDays('2027-03-24',100));a.ok(!card.swimgen.includes('済'));a.equal(d.logs.find(l=>l.key==='swim').date,'2027-01-28');
console.log('PASS Swimgen reset at actual birth, retained until birth and in work history, captured-card read-only repair, JSON/cloud restore, fresh next-cycle due-minus-14 date.');
