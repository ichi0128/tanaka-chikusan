const fs=require('fs'),vm=require('vm'),path=require('path'),a=require('assert/strict'),c=vm.createContext({});
for(const file of ['model.js','finishing-model.js','birth-validation.js','recurring-reminders.js','schedules.js','inventory-model.js','sow-parity.js','gilt-model.js','weaning-record.js','farrowing-forecast.js','cloud-store.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c);
const M=c.TanakaModel,P=c.TanakaSowParity,F=c.TanakaForecast;
function seed(){const d=M.migrate(null);d.sows=d.sows.filter(s=>s.id==='149');d.baseline.forEach(r=>Object.assign(r,{state:'empty',sowId:'',count:null,birthDate:''}));const sow=d.sows[0];sow.cardBaseline={parity:5,mating:'9/4',due:'12/27',boar:'B2',reheatCount:0,history:[]};d.logs=[];const page=P.pages(d,'149')[0];P.edit(d,'149',page.key,{...page.card,birthDateActual:'2026-07-21',weanDateActual:'2026-08-20'},JSON.stringify(page));return d;}
function append(d,l){return M.commit(d,x=>{P.beforeRecord(x,'149',l);x.logs.push(l);});}
let d=seed(),original=JSON.stringify(d),hist=JSON.stringify(d.sows[0].parityCards.history),barns=JSON.stringify(M.replay(d).rooms);const confirmation={key:'return',type:'再発情確認',id:'149',date:'2026-10-20',note:''};d=append(d,confirmation);let card=P.pages(d,'149')[0].card;
a.equal(card.reheatCount,1);a.equal(card.reheatPending,true);a.equal(card.reproductionStatus,'再種付け待ち');a.equal(card.mating,'9/4');a.equal(card.due,'');a.equal(P.pages(d,'149')[0].parity,5);a.equal(JSON.stringify(d.sows[0].parityCards.history),hist);a.equal(confirmation.failedMating.date,'9/4');a.equal(confirmation.failedMating.due,'12/27');a.equal(M.sowCard(d,'149').reheatCount,1);a.equal(M.sowCard(d,'149').due,'');a.equal(M.schedules(d,'2026-10-20').filter(p=>p.id==='149').length,0);a.equal(F.build(d,'2026-10-20').periods.filter(p=>p.id==='149').length,0);a.equal(JSON.stringify(M.replay(d).rooms),barns);
const waiting=M.migrate(JSON.parse(JSON.stringify(d)));a.equal(P.pages(waiting,'149')[0].card.reheatPending,true);const cloud=new c.TanakaCloud.CloudStore({model:M});a.equal(JSON.stringify(cloud.validate(waiting)),JSON.stringify(d));a.throws(()=>append(d,{key:'duplicate',type:'再発情確認',id:'149',date:'2026-10-20'}),/既に再種付け待ち/);
// A normal mating command while waiting is a remating in the same parity.
let mating={key:'mating',type:'種付け',id:'149',date:'2026-10-20',boar:'B1',remating:false};d=append(d,mating);card=P.pages(d,'149')[0].card;a.equal(mating.remating,true);a.equal(mating.reheatConfirmationKey,'return');a.equal(card.reheatPending,false);a.equal(card.reheatCount,1);a.equal(card.mating,'2026-10-20');a.equal(card.boar,'B1');a.equal(card.due,M.addDays('2026-10-20',114));a.equal(P.pages(d,'149')[0].parity,5);a.equal(JSON.stringify(d.sows[0].parityCards.history),hist);a.equal(d.logs.length,2);a.equal(M.sowCard(d,'149').reheatCount,1);a.ok(M.schedules(d,'2026-10-20').some(p=>p.id==='149'&&p.type==='分娩'&&p.date===M.addDays('2026-10-20',114)));a.equal(F.build(d,'2026-10-20').periods.find(p=>p.id==='149').mating,'2026-10-20');
// Confirmation can stand alone across saves/reloads, with mating on another day.
let later=append(waiting,{key:'later',type:'種付け',id:'149',date:'2026-10-23',boar:'B1',remating:true});a.equal(P.pages(later,'149')[0].parity,5);a.equal(P.pages(later,'149')[0].card.reheatCount,1);a.equal(P.pages(later,'149')[0].card.due,M.addDays('2026-10-23',114));
// Repeated cycles count each observed return once, and old remating-only data retain their count.
d=append(d,{key:'return2',type:'再発情確認',id:'149',date:'2026-11-10'});a.equal(P.pages(d,'149')[0].card.reheatCount,2);d=append(d,{key:'mate2',type:'種付け',id:'149',date:'2026-11-11',boar:'B2',remating:true});a.equal(P.pages(d,'149')[0].card.reheatCount,2);a.equal(M.sowCard(d,'149').reheatCount,2);const legacy=seed();legacy.logs.push({key:'legacy-remating',type:'種付け',id:'149',date:'2026-10-20',boar:'B1',remating:true});a.equal(P.pages(legacy,'149')[0].card.reheatCount,1);a.equal(M.sowCard(legacy,'149').reheatCount,1);
a.equal(JSON.stringify(M.replay(d).rooms),barns);a.notEqual(JSON.stringify(d),original);a.equal(JSON.stringify(P.historyRows(M.migrate(JSON.parse(JSON.stringify(d))),'149')),JSON.stringify(P.historyRows(d,'149')));console.log('PASS standalone observed return: +1 at confirmation, prior mating retained as failed, waiting state, no old pregnancy forecast, no duplicate confirmation, same/later-day remating without double count or new parity, repeated/legacy counts, barns/history preserved, JSON/cloud roundtrip.');

const plain=seed();delete plain.sows[0].parityCards;plain.sows[0].cardBaseline.parity=5;let pregnancy=append(plain,{key:'plain-return',type:'再発情確認',id:'149',date:'2026-10-20'});pregnancy=append(pregnancy,{key:'plain-mate',type:'種付け',id:'149',date:'2026-10-20',boar:'B1'});pregnancy=append(pregnancy,{key:'plain-birth',type:'分娩',id:'149',date:'2027-02-18',roomKey:'r1',count:10});a.equal(P.pages(pregnancy,'149')[0].parity,5);console.log('PASS confirmed current parity remains unchanged through the eventual birth, including original baseline cards.');

const withCare=append(d,{key:'swim',type:'スイムジェン 実施',id:'149',date:'2027-02-19'});a.equal(M.sowCard(withCare,'149').swimgen,'2/19 済');

// Both days following a confirmed return are rematings in the same parity.
let twoDays=append(seed(),{key:'two-return',type:'再発情確認',id:'149',date:'2026-10-20'});
for(const [key,date,boar] of [['two-first','2026-10-20','B1'],['two-second','2026-10-21','B2']]){a.equal(P.matingReturnKey(twoDays,'149',date),'two-return');const l={key,type:'種付け',id:'149',date,boar,remating:false};twoDays=append(twoDays,l);a.equal(l.remating,true);a.equal(l.reheatConfirmationKey,'two-return');a.equal(P.pages(twoDays,'149')[0].parity,5);a.equal(P.pages(twoDays,'149')[0].card.reheatCount,1);}
a.equal(twoDays.logs.filter(l=>l.type==='種付け'&&l.remating).length,2);a.equal(P.pages(twoDays,'149')[0].card.boar,'B2');a.equal(P.pages(twoDays,'149')[0].card.mating,'2026-10-20');a.equal(JSON.stringify(P.historyRows(M.migrate(JSON.parse(JSON.stringify(twoDays))),'149')),JSON.stringify(P.historyRows(twoDays,'149')));
console.log('PASS two-day remating: both standard-format records automatically link the same confirmation; user-selected B1 then B2; parity and return count unchanged; JSON restored.');

// Shared baseline: 10/20 + 21 = 11/10; +114 = 2/11, never day two.
card=P.pages(twoDays,'149')[0].card;
a.equal(card.lastReheatDate,'2026-10-20');a.equal(card.reheat,'2026-11-10');a.equal(card.due,'2027-02-11');a.equal(card.matingSet.length,2);
a.equal(M.sowCard(twoDays,'149').mating,'10/20');
a.ok(M.schedules(twoDays,'2026-10-21').some(p=>p.type==='分娩'&&p.date==='2027-02-11'));
a.ok(M.schedules(twoDays,'2026-10-21').some(p=>p.type==='再発情確認'&&p.date==='2026-11-10'));
a.equal(F.build(twoDays,'2026-10-21').periods.find(p=>p.id==='149').mating,'2026-10-20');
// Older captured card with day-two values is repaired as a view, not a storage migration.
const captured=M.clone(twoDays),store=captured.sows[0].parityCards;
store.current.card=M.clone(card);delete store.current.card.matingSet;Object.assign(store.current.card,{mating:'2026-10-21',reheat:'2026-11-11',due:'2027-02-12'});store.current.capturedKeys=captured.logs.map(l=>l.key);
const untouched=JSON.stringify(captured);a.equal(P.pages(captured,'149')[0].card.due,'2027-02-11');a.equal(JSON.stringify(captured),untouched);
a.equal(M.sowCard(captured,'149').mating,'10/20');
a.equal(P.pages(cloud.validate(M.migrate(JSON.parse(JSON.stringify(captured)))),'149')[0].card.reheat,'2026-11-10');
// Confirmation breaks even a same-day set; a new estrus has its own anchor.
let nextReturn=append(twoDays,{key:'another-return',type:'再発情確認',id:'149',date:'2026-11-10'});
nextReturn=append(nextReturn,{key:'another-first',type:'種付け',id:'149',date:'2026-11-10',boar:'B2'});
nextReturn=append(nextReturn,{key:'another-second',type:'種付け',id:'149',date:'2026-11-11',boar:'B1'});
a.equal(P.pages(nextReturn,'149')[0].card.mating,'2026-11-10');a.equal(P.pages(nextReturn,'149')[0].card.reheatCount,2);
console.log('PASS first-date mating set: cards, schedules, forecast, captured older cards, cloud/JSON roundtrip and distinct returned cycle.');
