'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function boot(){
  const map=new Map(),elements=new Map(),listeners={};
  const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',dataset:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(){},appendChild(child){child.parentNode=this;},close(){this.open=false;},showModal(){this.open=true;},insertAdjacentHTML(){},querySelector(){return null;},querySelectorAll(){return [];}});return elements.get(id);};
  const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size;}};
  const document={getElementById:element,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);},documentElement:element('html'),body:element('body'),visibilityState:'visible'};
  const client={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{}}})}};
  const context=vm.createContext({console,document,localStorage:storage,navigator:{onLine:true},location:{protocol:'http:'},setTimeout:()=>1,clearTimeout(){},setInterval(){},queueMicrotask,confirm:()=>true,addEventListener(){},scrollTo(){},supabase:{createClient:()=>client}});
  vm.runInContext('window=globalThis;',context);
  const root=require('node:path').join(__dirname),scripts=[...fs.readFileSync(require('node:path').join(root,'index.html'),'utf8').matchAll(/<script src="([^"?]+)(?:\?[^\"]*)?"><\/script>/g)].map(x=>x[1]);
  for(const name of scripts){
    if(name==='app.js'){
      vm.runInContext('const seed=TanakaModel.migrate(null);TanakaReminders.initialize(seed);',context);
      context.seedRelationships=JSON.parse(fs.readFileSync(require('node:path').join(root,'maternal-lineage-seed.json')));
      vm.runInContext("TanakaMaternal.initialize(seed,seedRelationships);localStorage.setItem('tanaka-db',JSON.stringify(seed));",context);
    }
    vm.runInContext(fs.readFileSync(require('node:path').join(root,name),'utf8'),context,{filename:name});
  }
  return {context,storage,elements,listeners};
}
test('real app boot, settings and local save still work with cloud module',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('fatal',b.context),'');
  vm.runInContext("go('edit');",b.context);
  assert.match(b.elements.get('app').innerHTML,/クラウド保存/);
  const releaseVersion=vm.runInContext('APP_VERSION',b.context);
  assert.match(releaseVersion,/^\d+\.\d+\.\d+$/);
  assert.ok(b.elements.get('app').innerHTML.includes('クロブタアプリ<br><span>Version '+releaseVersion+'</span>'));
  assert.match(b.elements.get('app').innerHTML,/データ保存/);
  assert.match(b.elements.get('app').innerHTML,/データ読込/);
  vm.runInContext("save(d=>{d.sows[0].note='端末保存テスト';});",b.context);
  const saved=JSON.parse(b.storage.getItem('tanaka-db'));
  assert.equal(saved.sows[0].note,'端末保存テスト');
  assert.equal(saved.version,3);
  assert.equal(saved.revision,undefined);
  assert.equal(vm.runInContext('cloudStore.status',b.context),'signedout');
});
test('real app cloud replacement retains all fields and backs up original raw local data',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  const original=b.storage.getItem('tanaka-db');
  vm.runInContext("const cloudCopy=M.clone(db);cloudCopy.sows[0].note='クラウドから復元';cloudCopy.extra={a:null,b:false,c:0};cloudStore.replaceLocal(cloudCopy);",b.context);
  const saved=JSON.parse(b.storage.getItem('tanaka-db'));
  assert.equal(saved.sows[0].note,'クラウドから復元');
  assert.deepEqual(saved.extra,{a:null,b:false,c:0});
  const backups=[];for(let i=0;i<b.storage.length;i++){const k=b.storage.key(i);if(k.startsWith('tanaka-db-before-cloud-'))backups.push(b.storage.getItem(k));}
  assert.deepEqual(backups,[original]);
  vm.runInContext("save(d=>{d.sows[0].note='復元後の編集';});",b.context);
  assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).sows[0].note,'復元後の編集');
});
test('existing JSON export sends only the entire db, never cloud metadata',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  vm.runInContext('let exported=null;download=(text,name)=>{exported={text,name};};',b.context);
  const target={closest:()=>({dataset:{action:'export'}})};
  for(const listener of b.listeners.click)listener({target});
  const exported=JSON.parse(vm.runInContext('exported.text',b.context));
  assert.deepEqual(exported,JSON.parse(b.storage.getItem('tanaka-db')));
  assert.equal(exported.user_id,undefined);assert.equal(exported.revision,undefined);
});
test('recovery export includes data backups and excludes auth tokens',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  b.storage.setItem('sb-kurobuta-auth','fake token');
  b.storage.setItem('tanaka-db-before-cloud-test','original data');
  const entries=vm.runInContext('JSON.stringify(recoveryEntries(localStorage))',b.context);
  assert.match(entries,/tanaka-db-before-cloud-test/);assert.doesNotMatch(entries,/fake token|sb-kurobuta-auth/);
});
test('existing JSON import preserves its before-import backup and all unknown fields',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  const original=b.storage.getItem('tanaka-db'),replacement=JSON.parse(original);
  replacement.sows[0].note='JSONから読込';replacement.extra={oldChecks:[false,null,0]};
  vm.runInContext('let importAction;form=(title,content,label,action)=>{importAction=action;};importData();',b.context);
  await b.elements.get('file').onchange({target:{files:[{text:async()=>JSON.stringify(replacement)}]}});
  vm.runInContext('importAction();',b.context);
  assert.equal(b.storage.getItem('tanaka-db-before-import'),original);
  assert.deepEqual(JSON.parse(b.storage.getItem('tanaka-db')),replacement);
});
test('cloud acceptance switches real app data, revision and header without a cloud write',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  const before=b.storage.getItem('tanaka-db');
  vm.runInContext("cloudStore.user={id:'owner'};const remote=M.clone(db);remote.sows[0].note='cloud chosen';const remoteRow={id:'farm-row',user_id:'owner',data:remote,revision:7};cloudStore.pending={row:remoteRow,localSignature:TanakaCloud.signature(db)};cloudStore.emit('pending','切替待ち');",b.context);
  assert.equal(b.elements.get('network').textContent,'クラウド切替待ち');
  vm.runInContext('cloudStore.acceptCloud();',b.context);
  assert.equal(b.elements.get('network').textContent,'クラウド使用中');
  assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).sows[0].note,'cloud chosen');
  assert.equal(vm.runInContext('cloudStore.row.revision',b.context),7);
  assert.equal(vm.runInContext('TanakaCloud.signature(db)===TanakaCloud.signature(cloudStore.row.data)',b.context),true);
  assert.match(b.elements.get('cloud-settings').innerHTML,/クラウドデータとの一致：一致/);
  assert.match(b.elements.get('cloud-settings').innerHTML,/更新番号：7/);
  assert.equal(vm.runInContext('cloudStore.client.from',b.context),undefined);
  const backups=[];for(let i=0;i<b.storage.length;i++){const key=b.storage.key(i);if(key.startsWith('tanaka-db-before-cloud-'))backups.push(b.storage.getItem(key));}
  assert.deepEqual(backups,[before]);
});
test('network status refresh does not overwrite active cloud indicator',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  vm.runInContext("cloudStore.user={id:'owner'};cloudStore.row={id:'row',user_id:'owner',data:M.clone(db),revision:1};cloudStore.emit('ready','一致');network();",b.context);
  assert.equal(b.elements.get('network').textContent,'クラウド使用中');
  vm.runInContext('navigator.onLine=false;network();',b.context);
  assert.equal(b.elements.get('network').textContent,'クラウド・オフライン');
  vm.runInContext('navigator.onLine=true;network();',b.context);
  assert.equal(b.elements.get('network').textContent,'クラウド使用中');
});
test('local edits and saves display pending cloud sync then confirmed cloud state',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  vm.runInContext("cloudStore.user={id:'owner'};cloudStore.row={id:'row',user_id:'owner',data:M.clone(db),revision:1};cloudStore.emit('ready','一致');save(d=>{d.sows[0].note='未同期';});",b.context);
  assert.equal(b.elements.get('network').textContent,'クラウド未同期');
  vm.runInContext("cloudStore.emit('saving','送信中');",b.context);
  assert.equal(b.elements.get('network').textContent,'クラウド保存中');
  vm.runInContext("cloudStore.row={...cloudStore.row,data:M.clone(db),revision:2};cloudStore.emit('ready','保存済み');",b.context);
  assert.equal(b.elements.get('network').textContent,'クラウド使用中');
  assert.match(b.elements.get('cloud-settings').innerHTML,/更新番号：2/);
});
test('failure and conflict never display cloud save success',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  vm.runInContext("cloudStore.user={id:'owner'};cloudStore.emit('error','保存失敗');",b.context);
  assert.equal(b.elements.get('network').textContent,'端末保存・未同期');
  vm.runInContext("cloudStore.emit('conflict','競合');",b.context);
  assert.equal(b.elements.get('network').textContent,'端末保存・未同期');
});
test('first insert is clearly distinguished from an active cloud row',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  vm.runInContext("cloudStore.user={id:'owner'};cloudStore.emit('empty','未登録');",b.context);
  assert.equal(b.elements.get('network').textContent,'初回保存待ち');
});
test('logout returns header to local mode',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  vm.runInContext("cloudStore.user={id:'owner'};cloudStore.row={user_id:'owner',data:M.clone(db),revision:1};cloudStore.emit('ready','一致');cloudStore.user=null;cloudStore.row=null;cloudStore.emit('signedout','ログアウト');",b.context);
  assert.equal(b.elements.get('network').textContent,'端末保存');
});

test('monthly inventory saves and restores with full JSON and cloud data, without changing daily records',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  const before=JSON.parse(b.storage.getItem('tanaka-db'));
  vm.runInContext("go('inventory');let report=I.clone(inventoryContext().report);report.monthly[9].planned=20;report.monthly[9].actual=18;save(data=>I.saveReport(data,report,'null'));",b.context);
  const saved=JSON.parse(b.storage.getItem('tanaka-db')),daily=JSON.parse(JSON.stringify(saved));delete daily.inventoryMonths;assert.deepEqual(daily,before);
  vm.runInContext('let monthlyExport;download=text=>{monthlyExport=text;};',b.context);
  for(const listener of b.listeners.click)listener({target:{closest:()=>({dataset:{action:'export'}})}});
  assert.deepEqual(JSON.parse(vm.runInContext('monthlyExport',b.context)),saved);
  vm.runInContext('cloudStore.replaceLocal(JSON.parse(JSON.stringify(db)));',b.context);
  assert.deepEqual(JSON.parse(b.storage.getItem('tanaka-db')).inventoryMonths,saved.inventoryMonths);
  vm.runInContext('let monthlyImport;form=(title,content,label,action)=>{monthlyImport=action;};importData();',b.context);
  await b.elements.get('file').onchange({target:{files:[{text:async()=>JSON.stringify(saved)}]}});
  vm.runInContext('monthlyImport();',b.context);
  assert.deepEqual(JSON.parse(b.storage.getItem('tanaka-db')),saved);
});

test('nursery displays older birthdays first without exposing internal slot names or changing saved data',async()=>{
 const b=boot();await new Promise(resolve=>setImmediate(resolve));
 vm.runInContext(`state.nursery=[
 {key:'n1',state:'occupied',sowId:'149',count:4,birthDate:'2026-09-01',weight:20},
 {key:'n2',state:'occupied',sowId:'512',count:5,birthDate:'2026-07-01',weight:30},
 {key:'n3',state:'occupied',mixed:true,sowId:'',count:6,birthDate:'2026-07-01',weight:30},
 {key:'n4',state:'occupied',sowId:'106',count:3,birthDate:'',weight:20},
 {key:'n5',state:'empty',sowId:'',count:0,birthDate:''}];`,b.context);
 const saved=b.storage.getItem('tanaka-db'),original=vm.runInContext('JSON.stringify(state.nursery)',b.context),dbBefore=vm.runInContext('JSON.stringify(db)',b.context);
 vm.runInContext("go('nursery');",b.context);const html=b.elements.get('app').innerHTML;
 assert.deepEqual([...html.matchAll(/data-action="nursery-edit" data-id="([^"]+)"/g)].map(m=>m[1]),['n2','n3','n1','n4','n5']);
 assert.doesNotMatch(html,/管理枠/);assert.match(html,/混成/);assert.match(html,/512/);
 assert.equal(vm.runInContext('JSON.stringify(state.nursery)',b.context),original);
 assert.equal(vm.runInContext('JSON.stringify(db)',b.context),dbBefore);assert.equal(b.storage.getItem('tanaka-db'),saved);
 assert.doesNotMatch(vm.runInContext("finishingSourceName('nursery',state.nursery[0])",b.context),/管理枠/);
 const label=vm.runInContext("inventoryDisplayPlace({area:'nursery',state:'occupied',roomKey:'n1',place:'育成舎 管理枠1',sowId:'149',birthDate:'2026-09-01'})",b.context);
 assert.match(label,/149/);assert.doesNotMatch(label,/管理枠/);
 assert.equal(vm.runInContext("nurseryName({key:'n5'})",b.context),'空き');
});

test('farrowing overdue badges use calendar dates and virtual today without changing saved data',async()=>{
 const b=boot();await new Promise(resolve=>setImmediate(resolve));
 const saved=b.storage.getItem('tanaka-db');
 vm.runInContext(`db={...db,sows:[{id:'badge-test',active:true,cardBaseline:{parity:1,due:'2026-10-30'}},...db.sows],logs:[]};state=M.replay(db);var badgeRoom={key:'r1',state:'waiting',sowId:'badge-test'};simulation={day:'2026-10-29'};`,b.context);
 const before=vm.runInContext('JSON.stringify(db)',b.context);
 const badge=(day,due='2026-10-30',birth='')=>vm.runInContext(`simulation.day=${JSON.stringify(day)};db.sows[0].cardBaseline.due=${JSON.stringify(due)};db.sows[0].cardBaseline.birthDateActual=${JSON.stringify(birth)};state=M.replay(db);farrowingOverdueBadge(badgeRoom);`,b.context);
 assert.equal(badge('2026-10-29'),'');assert.equal(badge('2026-10-30'),'');
 assert.match(badge('2026-10-31'),/>\+1<\/span>/);
 assert.doesNotMatch(badge('2026-11-08'),/is-late/);
 assert.match(badge('2026-11-08'),/>\+9<\/span>/);
 assert.match(badge('2026-11-09'),/class="farrowing-overdue-badge is-late"/);
 assert.match(badge('2026-11-11'),/>\+12<\/span>/);
 assert.match(badge('2027-01-01','2026-12-31'),/>\+1<\/span>/);
 assert.match(badge('2028-03-01','2028-02-28'),/>\+2<\/span>/);
 assert.equal(badge('2026-11-01',''),'');assert.equal(badge('2026-11-01','未入力'),'');
 assert.equal(badge('2026-11-01','2026-02-30'),'');
 assert.equal(badge('2026-11-01','2026-10-30','2026-10-31'),'');
 assert.match(badge('2026-11-01','2026-10-30','2026-02-01'),/>\+2<\/span>/);
 badge('2026-11-01');
 for(const kind of ['family','piglets','empty'])assert.equal(vm.runInContext(`farrowingOverdueBadge({...badgeRoom,state:${JSON.stringify(kind)}})`,b.context),'');
 assert.match(vm.runInContext('farrowingOverdueBadge(badgeRoom)',b.context),/2026-11-01 − 分娩予定日 2026-10-30（暦日）・シミュレーション日付/);
 vm.runInContext('delete db.sows[0].cardBaseline.birthDateActual;',b.context);
 assert.equal(vm.runInContext('JSON.stringify(db)',b.context),before);
 assert.equal(b.storage.getItem('tanaka-db'),saved);
});

test('annual screen distinguishes first-birth summer preference and keeps seasonal bands without writes',async()=>{
 const b=boot();await new Promise(resolve=>setImmediate(resolve));const saved=b.storage.getItem('tanaka-db');
 vm.runInContext(`db=M.clone(db);db.logs=[];db.sows=[{id:'1',active:true,cardBaseline:{parity:0,mating:'2027-04-10'}},{id:'2',active:true,cardBaseline:{parity:2,mating:'2027-04-10'}}];db.baseline.forEach(r=>Object.assign(r,{state:'empty',sowId:'',count:null,birthDate:''}));state=M.replay(db);simulation={day:'2027-03-01',baseDay:'2027-03-01'};go('forecast');`,b.context);
 const html=b.elements.get('app').innerHTML;
 assert.match(html,/初産・8月の分娩予測<\/small><strong>1件/);assert.match(html,/8\/1〜8\/31 初産のみ回避配慮/);
 assert.match(vm.runInContext("ffHeatLabel(FF.compare(ffData(),'1','2027-04-10').heat)",b.context),/初産のみ/);
 assert.match(vm.runInContext("ffHeatLabel(FF.compare(ffData(),'2','2027-04-10').heat)",b.context),/対象外/);
 assert.equal(vm.runInContext("FF.compare(ffData(),'2','2027-04-10').level",b.context),'good');
 assert.equal(b.storage.getItem('tanaka-db'),saved);
});

function seedFinishingWeight(b){
 vm.runInContext(`save(d=>{d.finishingBaseline=F.baseline(d);Object.assign(d.finishingBaseline[0],{state:'occupied',count:7,weight:30,sowId:'149',birthDate:'2026-07-01',csf:true,note:'体重テスト'});});
 var weightMonth=today().slice(0,7);
 save(d=>{const r=I.create(d,M.replay(d),weightMonth,today(),roomBirthDate);I.saveReport(d,r,'null');const previous=I.clone(r);previous.month=I.previousMonth(weightMonth);previous.monthly=previous.monthly.map(x=>({...x,month:previous.month.slice(0,4)+x.month.slice(4)}));d.inventoryMonths[previous.month]=previous;});
 var oldWeightMonth=JSON.stringify(db.inventoryMonths[I.previousMonth(weightMonth)]);
 go('finishing');`,b.context);
}
test('inline weight click saves the formal ledger, syncs this month and keeps the dialog closed',async()=>{
 const b=boot();await new Promise(resolve=>setImmediate(resolve));seedFinishingWeight(b);
 let stopped=false;
 const button={disabled:false,dataset:{action:'fin-weight-inline',id:'f1',delta:'10'},closest:()=>null};
 const event={target:{closest:selector=>selector==='button'?button:null},stopPropagation(){stopped=true;}};
 for(const listener of b.listeners.click)listener(event);
 assert.equal(stopped,true);assert.equal(b.elements.get('dialog').open,undefined);
 assert.match(b.elements.get('app').innerHTML,/重量の目安 40kg/);
 const result=vm.runInContext(`JSON.stringify({room:state.finishing[0],report:db.inventoryMonths[weightMonth],past:JSON.stringify(db.inventoryMonths[I.previousMonth(weightMonth)]),old:oldWeightMonth,log:db.logs.at(-1)})`,b.context),x=JSON.parse(result);
 assert.equal(x.room.weight,40);assert.equal(x.room.count,7);assert.equal(x.room.note,'体重テスト');assert.equal(x.room.csf,true);
 assert.equal(x.log.type,'肉豚舎更新');assert.equal(x.log.finishingBefore.weight,30);assert.equal(x.log.finishingAfter.weight,40);
 assert.equal(x.report.rows.find(r=>r.roomKey==='f1').category,'40');assert.equal(x.report.plannedStock['40'],7);assert.equal(x.report.plannedStock['30'],0);
 assert.equal(x.report.revisions.at(-1).report.rows.find(r=>r.roomKey==='f1').registeredWeight,30);assert.equal(x.past,x.old);
 assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).logs.at(-1).finishingAfter.weight,40);
 vm.runInContext(`const reloaded=M.migrate(JSON.parse(localStorage.getItem(KEY)));if(M.replay(reloaded).finishing[0].weight!==40)throw Error('JSON roundtrip');cloudStore.validate(reloaded);`,b.context);
 const detail={...button,dataset:{action:'fin-detail',id:'f1'}};
 for(const listener of b.listeners.click)listener({target:{closest:selector=>selector==='button'?detail:null}});
 assert.equal(b.elements.get('dialog').open,true);
});
test('weight changes reach zero, keep dirty monthly edits and preserve manually entered shipping plans',async()=>{
 const b=boot();await new Promise(resolve=>setImmediate(resolve));seedFinishingWeight(b);
 vm.runInContext(`inventoryMonth=weightMonth;var cachedWeight=inventoryContext();cachedWeight.dirty=true;cachedWeight.report.remarks='未保存メモ';cachedWeight.report.rows.find(r=>r.roomKey==='f1').count=6;
 save(d=>{const r=I.clone(d.inventoryMonths[weightMonth]);r.stockPlanEdited=['90'];r.plannedStock['90']=12;I.saveReport(d,r,JSON.stringify(d.inventoryMonths[weightMonth]));});
 cachedWeight.expected=JSON.stringify(db.inventoryMonths[weightMonth]);
 finishingUpdate('f1',g=>g.weight=20,false);finishingUpdate('f1',g=>g.weight=10,false);finishingUpdate('f1',g=>g.weight=0,false);
 var zeroLogs=db.logs.length;finishingUpdate('f1',g=>g.weight=Math.max(0,g.weight-10),false);`,b.context);
 const x=JSON.parse(vm.runInContext(`JSON.stringify({weight:state.finishing[0].weight,logs:db.logs.length,old:zeroLogs,draft:cachedWeight,expected:JSON.stringify(db.inventoryMonths[weightMonth]),report:db.inventoryMonths[weightMonth],stats:I.aggregate(db.inventoryMonths[weightMonth].rows)})`,b.context));
 assert.equal(x.weight,0);assert.equal(x.logs,x.old);assert.equal(x.report.rows.find(r=>r.roomKey==='f1').registeredWeight,0);
 assert.equal(x.stats.unclassified>=7,true);assert.equal(x.draft.report.remarks,'未保存メモ');assert.equal(x.draft.report.rows.find(r=>r.roomKey==='f1').count,6);
 assert.equal(x.draft.report.rows.find(r=>r.roomKey==='f1').registeredWeight,0);assert.equal(x.draft.expected,x.expected);assert.equal(x.report.plannedStock['90'],12);
 assert.match(b.elements.get('app').innerHTML,/data-delta="-10"[^>]*disabled/);
 assert.throws(()=>vm.runInContext(`finishingUpdate('f1',g=>g.weight=-10,false)`,b.context),/0kg/);
 vm.runInContext(`M.migrate(JSON.parse(localStorage.getItem(KEY)));`,b.context);
});

test('boar management UI updates local saved totals, keeps dirty edits and leaves past months/history unchanged',async()=>{
 const b=boot();await new Promise(resolve=>setImmediate(resolve));seedFinishingWeight(b);
 vm.runInContext(`inventoryMonth=weightMonth;var boarDraft=inventoryContext();boarDraft.dirty=true;boarDraft.report.remarks='未保存の計画メモ';
 var boarHistoryBefore=JSON.stringify(db.logs),boarPastBefore=JSON.stringify(db.inventoryMonths[I.previousMonth(weightMonth)]);
 var boarFormContent='',boarSubmit;form=(title,content,label,action)=>{boarFormContent=content;boarSubmit=action;};
 boarEdit('B1');boarSubmit(new Map([['boarName','B1'],['boarStatus','廃用／退役']]));go('edit');`,b.context);
 assert.match(b.elements.get('app').innerHTML,/種豚管理 · 在籍 1頭/);
 let x=JSON.parse(vm.runInContext(`JSON.stringify({count:I.farmSummary(db.inventoryMonths[weightMonth]).boarCount,notes:boarDraft.report.remarks,cached:I.farmSummary(boarDraft.report).boarCount,expected:boarDraft.expected===JSON.stringify(db.inventoryMonths[weightMonth]),logs:JSON.stringify(db.logs)===boarHistoryBefore,past:JSON.stringify(db.inventoryMonths[I.previousMonth(weightMonth)])===boarPastBefore})`,b.context));
 assert.deepEqual(x,{count:1,notes:'未保存の計画メモ',cached:1,expected:true,logs:true,past:true});
 const saved=JSON.parse(b.storage.getItem('tanaka-db'));assert.equal(saved.boars.find(b=>b.name==='B1').status,'廃用／退役');
 assert.equal(saved.inventoryMonths[Object.keys(saved.inventoryMonths).sort().at(-1)].boarSnapshot.boars.find(b=>b.name==='B1').status,'廃用／退役');
 vm.runInContext(`boarEdit();boarSubmit(new Map([['boarName','B3'],['boarStatus','在籍']]));go('edit');`,b.context);
 assert.match(b.elements.get('app').innerHTML,/種豚管理 · 在籍 2頭/);assert.match(b.elements.get('app').innerHTML,/B3/);
 assert.equal(vm.runInContext('M.activeBoars(db).length',b.context),2);
 const render=vm.runInContext(`inventoryFarmTotals(db.inventoryMonths[weightMonth])`,b.context);assert.match(render,/種豚 2頭/);assert.match(render,/全豚舎の頭数/);
 for(const script of [`inventoryTotals(db.inventoryMonths[weightMonth])`,`inventoryPlan(db.inventoryMonths[weightMonth])`,`inventoryPrintCount(db.inventoryMonths[weightMonth])`,`inventoryPrintAggregate(db.inventoryMonths[weightMonth])`,`inventoryPrintPlan(db.inventoryMonths[weightMonth])`])assert.match(vm.runInContext(script,b.context),/種豚 2頭/);
 vm.runInContext(`cloudStore.validate(M.migrate(JSON.parse(localStorage.getItem(KEY))));`,b.context);
});
test('an old current-month report gains an archived boar snapshot without rewriting past months',async()=>{
 const b=boot();await new Promise(resolve=>setImmediate(resolve));seedFinishingWeight(b);
 vm.runInContext(`save(d=>{delete d.inventoryMonths[weightMonth].boarSnapshot;});`,b.context);
 await new Promise(resolve=>setImmediate(resolve));
 const x=JSON.parse(vm.runInContext(`JSON.stringify({now:I.farmSummary(db.inventoryMonths[weightMonth]).boarCount,archived:db.inventoryMonths[weightMonth].revisions.at(-1).report.boarSnapshot??null,past:JSON.stringify(db.inventoryMonths[I.previousMonth(weightMonth)])===oldWeightMonth})`,b.context));
 assert.deepEqual(x,{now:2,archived:null,past:true});
});

test('print output keeps all four report sections, values and final notes without changing saved data',async()=>{
 const b=boot();await new Promise(resolve=>setImmediate(resolve));seedFinishingWeight(b);
 const raw=b.storage.getItem('tanaka-db');
 vm.runInContext(`var printReport=I.clone(db.inventoryMonths[weightMonth]);printReport.remarks='印刷確認用の備考';printReport.weekly=[3,4,5,6,7];`,b.context);
 const html=vm.runInContext(`inventoryPrintDocument(printReport,'all')`,b.context);
 assert.equal((html.match(/<section class="sheet /g)||[]).length,4);
 for(const [mode,pages] of [[1,2],[2,1],[3,1]]){
   const part=vm.runInContext(`inventoryPrintDocument(printReport,${mode})`,b.context);
   assert.equal((part.match(/<section class="sheet /g)||[]).length,pages);
 }
 assert.match(html,/印刷確認用の備考/);assert.match(html,/25頭/);assert.match(html,/種豚 2頭/);
 assert.match(html,/単位：頭（体重はkg）。/);assert.match(html,/年間見込は過去月の入力済み実績を優先/);
 assert.ok(html.indexOf('<script>')<html.indexOf('</head>'));
 const body=html.slice(html.indexOf('<body>'));assert.ok(body.endsWith('</section></body></html>'));
 assert.throws(()=>vm.runInContext(`inventoryPrintDocument(printReport,9)`,b.context),/帳票を選んで/);
 assert.equal(b.storage.getItem('tanaka-db'),raw);
 vm.runInContext(`inventoryMonth=weightMonth;inventoryCanEdit=()=>false;var printWritten='';var printOpened={opener:window,document:{open(){},write(html){printWritten=html;},close(){}}};window.open=()=>printOpened;inventoryPrint('all');`,b.context);
 assert.equal(vm.runInContext('printOpened.opener',b.context),null);assert.match(vm.runInContext('printWritten',b.context),/印刷する \/ PDFに保存/);
 assert.equal(b.storage.getItem('tanaka-db'),raw);
});

test('sow card list and detail retain previous results during pregnancy and switch only at actual birth',async()=>{
 const b=boot();await new Promise(resolve=>setImmediate(resolve));
 vm.runInContext(`save(d=>{d.logs=[];d.baseline.forEach(r=>Object.assign(r,{state:'empty',sowId:'',count:null,birthDate:''}));const s=d.sows.find(s=>s.id==='912');s.cardBaseline={parity:3,mating:'2026-05-29',birthDateActual:'2026-09-21',birthCount:9,result:'7→6'};Object.assign(d.baseline[0],{state:'family',sowId:'912',birthDate:'2026-09-21',birthCount:9,count:9});});
 save(d=>{const l=TanakaWeaning.createLog(d,{id:'912',roomKey:'r1',date:'2026-10-21',operator:'担当者',count:9});TanakaSowParity.beforeRecord(d,'912',l);d.logs.push(l);});
 save(d=>{const l={key:'ui-mate',type:'種付け',id:'912',date:'2026-10-26',boar:'B2'};TanakaSowParity.beforeRecord(d,'912',l);d.logs.push(l);});`,b.context);
 const raw=b.storage.getItem('tanaka-db'),card=vm.runInContext(`sowCardMarkup(state.sows['912'])`,b.context),detail=vm.runInContext(`sowParityCard(state.sows['912'])`,b.context);
 for(const html of [card,detail]){assert.match(html,/9－9/);assert.match(html,/10\/21/);assert.match(html,/10\/26/);}
 assert.equal(b.storage.getItem('tanaka-db'),raw);
 vm.runInContext(`save(d=>{const l={key:'ui-next-birth',type:'分娩',id:'912',date:'2027-02-17',roomKey:'r2',count:11};TanakaSowParity.beforeRecord(d,'912',l);d.logs.push(l);});`,b.context);
 const born=vm.runInContext(`sowCardMarkup(state.sows['912'])`,b.context);assert.match(born,/11－/);assert.doesNotMatch(born,/9－9|10\/21/);
 assert.match(vm.runInContext(`sowHistoryTable(state.sows['912'])`,b.context),/2026-10-21/);
});

test('quick and standard mating supplement preserve 132 date; explicit new mating and table edits share schedules',()=>{
 const b=boot();
 vm.runInContext(`let matingSubmit,matingHtml;form=(title,body,label,submit)=>{matingSubmit=submit;matingHtml=body;};quickMating('132');`,b.context);
 assert.match(vm.runInContext('matingHtml',b.context),/種豚を追加（日付を保持）/);
 assert.equal(b.elements.get('date').value,'2026-10-11');
 b.context.formValues=new Map([['matingMode','supplement'],['boar','B1'],['id','132']]);
 vm.runInContext('matingSubmit(formValues);',b.context);
 assert.equal(vm.runInContext("TanakaSowParity.pages(db,'132')[0].card.mating",b.context),'10/11');
 assert.equal(vm.runInContext("db.logs.filter(l=>l.id==='132'&&l.type==='種付け').length",b.context),0);
 vm.runInContext("record('種付け','132');matingSubmit(formValues);",b.context);
 assert.equal(vm.runInContext("TanakaSowParity.pages(db,'132')[0].card.mating",b.context),'10/11');
 b.context.formValues=new Map([['matingMode','new'],['id','132'],['date','2026-10-26'],['boar','B2'],['matingKind','normal'],['note','']]);
 vm.runInContext("record('種付け','132');matingSubmit(formValues);",b.context);
 assert.equal(vm.runInContext("TanakaSowParity.pages(db,'132')[0].card.mating",b.context),'2026-10-26');
 vm.runInContext("editSowHistoryCell('132',TanakaSowParity.pages(db,'132')[0].key,'mating');",b.context);
 b.context.formValues=new Map([['historyValue','10/11']]);vm.runInContext('matingSubmit(formValues);',b.context);
 assert.equal(vm.runInContext("TanakaSowParity.pages(db,'132')[0].card.due",b.context),'2027-02-02');
 assert.equal(vm.runInContext("M.schedules(db,today()).find(p=>p.id==='132'&&p.type==='分娩').date",b.context),'2027-02-02');
 assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).sows.find(s=>s.id==='132').parityCards.current.card.matingDateOverride,'2026-10-11');
});

test('yard move button, ten explicit rooms, occupied guards and undo feedback use the real save and append-only history',()=>{
 const b=boot();vm.runInContext(`let workSubmit,workHtml;form=(title,body,label,submit)=>{workSubmit=submit;workHtml=body;};go('sows');`,b.context);
 assert.match(b.elements.get('app').innerHTML,/aria-label="母豚 21を分娩舎へ"/);
 vm.runInContext(`enterWaiting('21');`,b.context);const html=vm.runInContext('workHtml',b.context);
 assert.equal((html.match(/class="farrowing-room-choice /g)||[]).length,10);assert.match(html,/1号室/);assert.match(html,/使用中：512/);assert.match(html,/子豚6頭/);assert.equal((html.match(/disabled/g)||[]).length,5);assert.doesNotMatch(html,/checked|自動で入/);
 b.context.moveValues=new Map([['roomKey','r8']]);vm.runInContext('workSubmit(moveValues);',b.context);
 assert.equal(vm.runInContext("state.rooms.find(r=>r.key==='r8').sowId",b.context),'21');assert.match(b.elements.get('work-feedback').innerHTML,/21を分娩舎8号室へ移動しました/);assert.match(b.elements.get('work-feedback').innerHTML,/取り消す/);
 const key=vm.runInContext('db.logs.at(-1).key',b.context),target={closest:s=>s.includes('work-undo')?{dataset:{action:'work-undo',id:key}}:null};for(const fn of b.listeners.click)fn({target});
 assert.equal(vm.runInContext("state.rooms.find(r=>r.key==='r8').state",b.context),'empty');assert.equal(vm.runInContext('db.logs.at(-1).undoOf',b.context),key);assert.equal(vm.runInContext('db.logs.at(-1).type',b.context),'移動取り消し');assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).logs.length,2);
});
test('full barn is explicit and single vacancy is labelled and selected; direct swimgen toggle has no date form',()=>{
 const b=boot();vm.runInContext(`let workSubmit,workHtml;form=(title,body,label,submit)=>{workSubmit=submit;workHtml=body;};save(d=>{const ids=d.sows.map(s=>s.id).filter(id=>id!=='21');d.baseline.forEach((r,i)=>Object.assign(r,{state:i===8?'empty':'waiting',sowId:i===8?'':ids[i],count:null}));});enterWaiting('21');`,b.context);
 assert.equal((vm.runInContext('workHtml',b.context).match(/checked/g)||[]).length,1);assert.match(vm.runInContext('workHtml',b.context),/9号室へ移動します/);
 vm.runInContext(`save(d=>{Object.assign(d.baseline[8],{state:'waiting',sowId:'18',count:null});});enterWaiting('21');`,b.context);assert.match(vm.runInContext('workHtml',b.context),/分娩舎に空きがありません/);assert.doesNotMatch(vm.runInContext('workHtml',b.context),/checked/);
 const target={closest:s=>s.includes('swimgen-toggle')?{dataset:{action:'swimgen-toggle',id:'21'}}:null};for(const fn of b.listeners.click)fn({target});
 assert.equal(vm.runInContext("TanakaSowWork.swimgenDone(TanakaSowParity.pages(db,'21')[0].card)",b.context),true);assert.match(b.elements.get('work-feedback').innerHTML,/スイムジェンを「済」/);
});
