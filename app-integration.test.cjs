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
 const key=vm.runInContext("db.logs.at(-1).key",b.context),target={closest:s=>s.includes('work-undo')?{dataset:{action:'work-undo',id:key}}:null};for(const fn of b.listeners.click)fn({target});
 assert.equal(vm.runInContext("state.rooms.find(r=>r.key==='r8').state",b.context),'empty');assert.equal(vm.runInContext('db.logs.at(-1).undoOf',b.context),key);assert.equal(vm.runInContext('db.logs.at(-1).type',b.context),'移動取り消し');assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).logs.length,2);
});
test('full barn is explicit and single vacancy is labelled and selected; direct swimgen toggle has no date form',()=>{
 const b=boot();vm.runInContext(`let workSubmit,workHtml;form=(title,body,label,submit)=>{workSubmit=submit;workHtml=body;};save(d=>{const ids=d.sows.map(s=>s.id).filter(id=>id!=='21');d.baseline.forEach((r,i)=>Object.assign(r,{state:i===8?'empty':'waiting',sowId:i===8?'':ids[i],count:null}));});enterWaiting('21');`,b.context);
 assert.equal((vm.runInContext('workHtml',b.context).match(/checked/g)||[]).length,1);assert.match(vm.runInContext('workHtml',b.context),/9号室へ移動します/);
 vm.runInContext(`save(d=>{Object.assign(d.baseline[8],{state:'waiting',sowId:'18',count:null});});enterWaiting('21');`,b.context);assert.match(vm.runInContext('workHtml',b.context),/分娩舎に空きがありません/);assert.doesNotMatch(vm.runInContext('workHtml',b.context),/checked/);
 const target={closest:s=>s.includes('swimgen-toggle')?{dataset:{action:'swimgen-toggle',id:'21'}}:null};for(const fn of b.listeners.click)fn({target});
 assert.equal(vm.runInContext("TanakaSowWork.swimgenDone(TanakaSowParity.pages(db,'21')[0].card)",b.context),true);assert.match(b.elements.get('work-feedback').innerHTML,/スイムジェンを「済」/);
});

test('nursery one-head UI requires individual confirmation, creates a pending gilt card, saves invariant totals and uses common undo',()=>{
 const b=boot();vm.runInContext(`save(d=>{d.nurseryBaseline=M.replay(d).nursery.map(n=>({...n,state:'empty',count:null,sowId:'',birthDate:''}));Object.assign(d.nurseryBaseline[0],{state:'occupied',count:2,sowId:'46',birthDate:'2026-05-01',weight:30});const r=I.create(d,M.replay(d),today().slice(0,7),today(),()=> '');I.saveReport(d,r,'null');});let nurserySubmit,nurseryHtml;form=(title,body,label,submit)=>{nurserySubmit=submit;nurseryHtml=body;};var motherCards=JSON.stringify(db.sows),totalBefore=I.farmSummary(db.inventoryMonths[today().slice(0,7)]).farmTotal;nurseryToYard('n1');`,b.context);
 assert.match(vm.runInContext('nurseryHtml',b.context),/対象個体|個体の番号/);assert.match(vm.runInContext('nurseryHtml',b.context),/移動頭数：1頭/);assert.doesNotMatch(vm.runInContext('nurseryHtml',b.context),/value="all"/);
 b.context.individualForm=new Map([['individualNumber','9001'],['individualLabel','青耳標'],['individualBirth','2026-05-01'],['individualMother','46'],['identifiedConfirmed','yes']]);vm.runInContext('nurserySubmit(individualForm);',b.context);
 assert.equal(vm.runInContext('state.nursery[0].count',b.context),1);assert.equal(vm.runInContext('JSON.stringify(db.sows.filter(s=>!s.numberPending))===motherCards',b.context),true);assert.equal(vm.runInContext('yardGiltList()[0].giltRegistration.label',b.context),'育母01');assert.equal(vm.runInContext('I.farmSummary(db.inventoryMonths[today().slice(0,7)]).farmTotal===totalBefore',b.context),true);assert.match(b.elements.get('work-feedback').innerHTML,/元に戻す/);
 vm.runInContext("go('sows');",b.context);assert.match(b.elements.get('app').innerHTML,/育母01/);assert.match(b.elements.get('app').innerHTML,/育成母豚は右端/);
 const key=vm.runInContext("db.logs.filter(l=>l.type===N.TYPES[0]).at(-1).key",b.context),target={closest:s=>s.includes('work-undo')?{dataset:{action:'work-undo',id:key}}:null};for(const fn of b.listeners.click)fn({target});
 assert.equal(vm.runInContext('state.nursery[0].count',b.context),2);assert.equal(vm.runInContext('state.nursery[0].identifiedIndividuals.length',b.context),1);assert.equal(vm.runInContext('N.pigs(state).length',b.context),0);assert.equal(vm.runInContext('db.logs.at(-1).undoOf',b.context),key);assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).logs.at(-1).type,'育成舎個体移動取消');
});
test('legacy group-to-yard UI redirects to identified one-head transfer; no-origin sow return requires explicit nursery destination',()=>{
 const b=boot();vm.runInContext(`save(d=>{d.nurseryBaseline=M.replay(d).nursery.map(n=>({...n,state:'empty',count:null,sowId:'',birthDate:''}));Object.assign(d.nurseryBaseline[0],{state:'occupied',count:2,sowId:'46',birthDate:'2026-05-01',weight:30});});let nurserySubmit,nurseryHtml;form=(title,body,label,submit)=>{nurserySubmit=submit;nurseryHtml=body;};finishingTransfer('yard','nursery','n1');`,b.context);
 assert.match(vm.runInContext('nurseryHtml',b.context),/移動頭数：1頭/);vm.runInContext("nurseryFromYard('','21');",b.context);assert.match(vm.runInContext('nurseryHtml',b.context),/元の育成舎が記録されていない/);assert.match(vm.runInContext('nurseryHtml',b.context),/value="">選択してください/);
 b.context.returnForm=new Map([['nurseryKey','n2'],['returnConfirmed','yes']]);vm.runInContext('nurserySubmit(returnForm);',b.context);assert.equal(vm.runInContext("!!N.inNursery(state,'21')",b.context),true);assert.equal(vm.runInContext("yardSowList().some(s=>s.id==='21')",b.context),false);vm.runInContext("go('detail','21');",b.context);assert.match(b.elements.get('app').innerHTML,/現在場所：育成舎 2号室/);
});
function seedCandidate(b,count=5){
  vm.runInContext(`save(d=>{d.finishingBaseline=F.baseline(d);Object.assign(d.finishingBaseline.find(r=>r.key==='f3'),{state:'occupied',kind:'育成母豚候補',count:${count},sowId:'46',birthDate:'2026-03-01',weight:70});});`,b.context);
}
test('candidate confirmation is read-only, duplicate guarded, atomic, reversible and headcount neutral',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));seedCandidate(b);
  vm.runInContext(`const initialCandidate=M.clone(db);const candidatePlan=TanakaGilts.prepareConfirmation(db,'f3',{number:'777',birthDate:'2026-03-01'},today());`,b.context);
  assert.equal(b.storage.getItem('tanaka-db'),vm.runInContext('JSON.stringify(initialCandidate)',b.context));
  assert.throws(()=>vm.runInContext("TanakaGilts.prepareConfirmation(db,'f3',{number:'46',birthDate:'2026-03-01'},today())",b.context),/母豚番号 46 はすでに使用されています/);
  vm.runInContext("save(d=>TanakaGilts.confirmCandidate(d,candidatePlan));const candidateAfter=JSON.stringify(db);",b.context);
  assert.equal(vm.runInContext("state.finishing.find(r=>r.key==='f3').count",b.context),4);
  assert.equal(vm.runInContext("state.finishing.find(r=>r.key==='f3').kind",b.context),'育成母豚候補');
  assert.equal(vm.runInContext("I.gilts(state)",b.context),1);
  assert.equal(vm.runInContext("Object.values(state.sows).find(s=>s.numberPending).location.area",b.context),'yard');
  assert.equal(vm.runInContext("TanakaGilts.yardKind(F.yardState(state.finishing.find(r=>r.key==='yard')).individuals[0],state)",b.context),'育成母豚');
  assert.equal(vm.runInContext("I.farmSummary(I.create(db,state,today().slice(0,7),today(),r=>r.birthDate||'')).farmTotal",b.context),vm.runInContext('candidatePlan.total',b.context));
  assert.throws(()=>vm.runInContext("save(d=>TanakaGilts.confirmCandidate(d,candidatePlan))",b.context),/変更/);
  vm.runInContext("save(d=>TanakaGilts.restoreConfirmation(d,initialCandidate,candidateAfter));",b.context);
  assert.equal(b.storage.getItem('tanaka-db'),vm.runInContext('JSON.stringify(initialCandidate)',b.context));
});
test('candidate local storage failure leaves every ledger unchanged; one-head room becomes empty',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));seedCandidate(b,1);
  vm.runInContext("const originalCandidate=JSON.stringify(db);const singlePlan=TanakaGilts.prepareConfirmation(db,'f3',{number:'778',birthDate:'2026-03-01'},today());",b.context);
  const set=b.storage.setItem;b.storage.setItem=()=>{throw Error('storage full');};
  assert.throws(()=>vm.runInContext("save(d=>TanakaGilts.confirmCandidate(d,singlePlan))",b.context),/storage full/);
  assert.equal(vm.runInContext('JSON.stringify(db)',b.context),vm.runInContext('originalCandidate',b.context));
  b.storage.setItem=set;vm.runInContext("save(d=>TanakaGilts.confirmCandidate(d,singlePlan));",b.context);
  assert.equal(vm.runInContext("state.finishing.find(r=>r.key==='f3').state",b.context),'empty');
});
test('candidate review back and repeated confirm perform at most one save',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));seedCandidate(b);
  vm.runInContext("const reviewBefore=JSON.stringify(db);const reviewValues={number:'779',birthDate:'2026-03-01'};const reviewPlan=TanakaGilts.prepareConfirmation(db,'f3',reviewValues,today());finishingGiltReview(reviewPlan,reviewValues,dataSession);",b.context);
  assert.match(b.elements.get('modal').innerHTML,/全豚舎総頭数：変更なし/);
  b.elements.get('gilt-back').onclick();
  assert.equal(vm.runInContext('JSON.stringify(db)',b.context),vm.runInContext('reviewBefore',b.context));
  vm.runInContext('finishingGiltReview(reviewPlan,reviewValues,dataSession);',b.context);
  const confirm=b.elements.get('gilt-confirm').onclick;confirm();confirm();
  assert.equal(vm.runInContext("state.finishing.find(r=>r.key==='f3').count",b.context),4);
  const undo=b.elements.get('gilt-undo').onclick;undo();undo();
  assert.equal(vm.runInContext('JSON.stringify(db)',b.context),vm.runInContext('reviewBefore',b.context));
});
test('candidate confirmation updates only affected current monthly rows and preserves previous months and plans',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));seedCandidate(b);
  vm.runInContext("save(d=>{const report=I.create(d,M.replay(d),today().slice(0,7),today(),r=>r.birthDate||'');I.saveReport(d,report,JSON.stringify(d.inventoryMonths?.[report.month]??null));});const monthlyBefore=M.clone(db.inventoryMonths);const monthlyPlan=TanakaGilts.prepareConfirmation(db,'f3',{number:'780',birthDate:'2026-03-01'},today());save(d=>TanakaGilts.confirmCandidate(d,monthlyPlan));",b.context);
  assert.equal(vm.runInContext("db.inventoryMonths[today().slice(0,7)].rows.find(r=>r.area==='finishing'&&r.roomKey==='f3').count",b.context),4);
  assert.equal(vm.runInContext("I.aggregate(db.inventoryMonths[today().slice(0,7)].rows).gilts",b.context),1);
  assert.equal(vm.runInContext("I.farmSummary(db.inventoryMonths[today().slice(0,7)]).farmTotal",b.context),vm.runInContext('monthlyPlan.total',b.context));
});

test('multi-head candidate review preserves the rest; clearing remaining candidate status is a separate confirmed action',()=>{
 const b=boot();seedCandidate(b,4);vm.runInContext(`const splitPlan=TanakaGilts.prepareConfirmation(db,'f3',{count:2,individuals:[{number:'881',birthDate:'2026-03-01'},{number:'882',birthDate:'2026-03-02'}]},today());finishingGiltReview(splitPlan,{count:2,individuals:splitPlan.individuals},dataSession);`,b.context);
 assert.match(b.elements.get('modal').innerHTML,/運動場へ移動：<b>2頭/);assert.match(b.elements.get('modal').innerHTML,/残り<b>2頭/);assert.match(b.elements.get('modal').innerHTML,/区分：育成母豚候補/);b.elements.get('gilt-confirm').onclick();assert.equal(vm.runInContext("state.finishing.find(r=>r.key==='f3').kind",b.context),'育成母豚候補');
 vm.runInContext(`let clearCandidateAction;form=(title,body,label,action)=>{clearCandidateAction=action;};const beforeClear=JSON.stringify(db);finishingClearCandidate('f3');`,b.context);assert.equal(vm.runInContext('JSON.stringify(db)===beforeClear',b.context),true);vm.runInContext('clearCandidateAction();',b.context);assert.equal(vm.runInContext("state.finishing.find(r=>r.key==='f3').count",b.context),2);assert.equal(vm.runInContext("state.finishing.find(r=>r.key==='f3').kind",b.context),'肉豚');assert.equal(vm.runInContext('I.gilts(state)',b.context),2);
});

test('temporary gilt card at right edge receives official number and first mating atomically, without an extra head',()=>{
 const b=boot();seedCandidate(b,4);
 vm.runInContext(`const giltPlan=TanakaGilts.prepareConfirmation(db,'f3',{count:2,individuals:[{birthDate:'2026-03-01'},{birthDate:'2026-03-02'}]},today());save(d=>TanakaGilts.confirmCandidate(d,giltPlan));const originalGilt=yardGiltList()[0],otherGilt=yardGiltList()[1],giltId=originalGilt.id,totalGiltBefore=I.farmSummary(I.create(db,state,today().slice(0,7),today(),()=> '')).farmTotal;let giltSubmit,giltHtml;form=(title,body,label,submit)=>{giltSubmit=submit;giltHtml=body;};quickMating(giltId);go('sows');`,b.context);
 const html=b.elements.get('app').innerHTML;assert.ok(html.indexOf('育母01')>html.indexOf('data-id="21"'));assert.match(html,/育母02/);assert.match(vm.runInContext('giltHtml',b.context),/正式な母豚番号/);assert.doesNotMatch(vm.runInContext('sowCardMarkup(originalGilt)',b.context),/>番号未設定</);
 b.context.mateForm=new Map([['officialNumber','888'],['date','2026-10-11'],['boar','B1']]);
 const set=b.storage.setItem;b.storage.setItem=()=>{throw Error('storage full');};assert.throws(()=>vm.runInContext('giltSubmit(mateForm)',b.context),/storage full/);assert.equal(vm.runInContext('state.sows[giltId].numberPending',b.context),true);b.storage.setItem=set;
 vm.runInContext('giltSubmit(mateForm);',b.context);assert.equal(vm.runInContext("state.sows['888'].numberPending",b.context),false);assert.equal(vm.runInContext("TanakaSowParity.pages(db,'888')[0].parity",b.context),0);assert.equal(vm.runInContext("TanakaSowParity.pages(db,'888')[0].card.due",b.context),'2027-02-02');assert.equal(vm.runInContext("state.sows['888'].birthDate",b.context),'2026-03-01');assert.equal(vm.runInContext("state.sows['888'].cardBaseline.mother",b.context),'46');assert.equal(vm.runInContext("I.farmSummary(I.create(db,state,today().slice(0,7),today(),()=> '')).farmTotal===totalGiltBefore",b.context),true);assert.equal(vm.runInContext("yardGiltList().length",b.context),1);assert.equal(vm.runInContext("yardSowList().some(s=>s.id==='888')",b.context),true);
});
test('812 follows its corrected current due date in the yard, with January rollover and unknown dates last',()=>{
 const b=boot();vm.runInContext(`save(d=>{for(const s of d.sows)s.cardBaseline={...s.cardBaseline,mating:'',due:''};const s=d.sows.find(s=>s.id==='812');s.cardBaseline={...s.cardBaseline,mating:'10/11',due:'2/2'};});const page812=TanakaSowParity.pages(db,'812')[0],previous812=JSON.stringify(page812);save(d=>TanakaSowParity.edit(d,'812',page812.key,{...page812.card,due:'2026-11-01'},previous812));`,b.context);
 assert.equal(vm.runInContext("M.currentDueDate(db,'812')",b.context),'2026-11-01');assert.equal(vm.runInContext('yardSowList()[0].id',b.context),'812');
 vm.runInContext(`const corrected812=TanakaSowParity.pages(db,'812')[0];save(d=>TanakaSowParity.edit(d,'812',corrected812.key,{...corrected812.card,due:'1/31'},JSON.stringify(corrected812)));`,b.context);assert.equal(vm.runInContext("M.currentDueDate(db,'812')",b.context),'2027-01-31');assert.equal(vm.runInContext('yardSowList()[0].id',b.context),'812');
});

test('room weaning opens a direct count confirmation without selectors, operator input or mandatory forecasts; saved sow, room and total remain consistent',()=>{
 const b=boot();vm.runInContext(`save(d=>{Object.assign(d.baseline.find(r=>r.key==='r3'),{state:'family',sowId:'106',count:10,birthDate:'2026-09-23'});});let directWean,directHtml;form=(title,body,label,submit)=>{directWean=submit;directHtml=body;};ffWeanDialog=()=>{throw Error('unexpected forecast detour');};const weanBefore=JSON.stringify(db),weanFarmTotal=I.farmSummary(I.create(db,state,today().slice(0,7),today(),()=> '')).farmTotal;`,b.context);
 const target={closest:s=>s==='button'?{dataset:{action:'room-record',id:'r3'}}:null};for(const fn of b.listeners.click)fn({target});
 assert.match(vm.runInContext('directHtml',b.context),/分娩舎3号室/);assert.match(vm.runInContext('directHtml',b.context),/name="count"[^>]*value="10"/);assert.doesNotMatch(vm.runInContext('directHtml',b.context),/<select|name="operator"|対象の部屋/);assert.match(vm.runInContext('directHtml',b.context),/離乳の判断を見る（任意）/);assert.equal(vm.runInContext('JSON.stringify(db)===weanBefore',b.context),true);
 b.context.directForm=new Map([['count','10'],['date',vm.runInContext('today()',b.context)],['id','512'],['roomKey','r1']]);vm.runInContext('directWean(directForm);',b.context);
 assert.equal(vm.runInContext('db.logs.at(-1).id',b.context),'106');assert.equal(vm.runInContext('db.logs.at(-1).operator',b.context),'');assert.equal(vm.runInContext('db.logs.at(-1).roomKey',b.context),'r3');assert.equal(vm.runInContext('db.logs.at(-1).date===today()',b.context),true);assert.equal(vm.runInContext("state.rooms.find(r=>r.key==='r3').state",b.context),'piglets');assert.equal(vm.runInContext("state.rooms.find(r=>r.key==='r3').count",b.context),10);assert.equal(vm.runInContext("yardSowList().some(s=>s.id==='106')",b.context),true);assert.equal(vm.runInContext("TanakaSowParity.pages(db,'106')[0].card.weanDateActual===today()",b.context),true);assert.equal(vm.runInContext("I.farmSummary(I.create(db,state,today().slice(0,7),today(),()=> '')).farmTotal===weanFarmTotal",b.context),true);assert.match(b.elements.get('work-feedback').innerHTML,/母豚 106を離乳しました/);
 assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).logs.at(-1).operator,'');assert.throws(()=>vm.runInContext('directWean(directForm)',b.context),/更新/);
});
test('quick weaning forecast failure is optional and storage failure leaves sow, room and histories untouched',()=>{
 const b=boot();vm.runInContext(`go('rooms');let weanSubmit,adviceToggle;form=(title,body,label,submit)=>{weanSubmit=submit;};document.getElementById('quick-wean-advice').addEventListener=(type,fn)=>{adviceToggle=fn;};quickWeaning('r3');const weaningOriginal=JSON.stringify(db);ffData=()=>{throw Error('prediction unavailable');};document.getElementById('date').value=today();document.getElementById('quick-wean-advice').open=true;adviceToggle();`,b.context);
 assert.match(b.elements.get('quick-wean-advice-content').innerHTML,/prediction unavailable/);assert.equal(vm.runInContext('JSON.stringify(db)===weaningOriginal',b.context),true);
 b.context.weaningForm=new Map([['count','9'],['date',vm.runInContext('today()',b.context)]]);const set=b.storage.setItem;b.storage.setItem=()=>{throw Error('storage full');};assert.throws(()=>vm.runInContext('weanSubmit(weaningForm)',b.context),/storage full/);assert.equal(vm.runInContext('JSON.stringify(db)===weaningOriginal',b.context),true);b.storage.setItem=set;
 vm.runInContext('weanSubmit(weaningForm)',b.context);assert.equal(vm.runInContext("state.rooms.find(r=>r.key==='r3').state",b.context),'piglets');
});

test('quick and standard weaning save the selected past date, reject future or pre-birth dates, and calculate nursing days from the actual date',()=>{
 for(const quick of [true,false]){
  const b=boot();vm.runInContext(`go('rooms');const historicalDay=M.addDays(today(),-2),birthDay=M.addDays(today(),-30);save(d=>Object.assign(d.baseline.find(r=>r.key==='r3'),{birthDate:birthDay,count:10}));let historyWeanSubmit,historyWeanHtml;form=(title,body,label,submit)=>{historyWeanSubmit=submit;historyWeanHtml=body;};${quick?"quickWeaning('r3')":"record('離乳','106','r3',null,true)"};const historicalBefore=JSON.stringify(db);`,b.context);
  assert.match(vm.runInContext('historyWeanHtml',b.context),/type="date"/);assert.notEqual(b.elements.get('date').readOnly,true);
  const date=vm.runInContext('historicalDay',b.context);b.context.historyWeanForm=new Map([['date',vm.runInContext('M.addDays(today(),1)',b.context)],['count','10'],['id','106'],['roomKey','r3']]);assert.throws(()=>vm.runInContext('historyWeanSubmit(historyWeanForm)',b.context),/今日以前/);assert.equal(vm.runInContext('JSON.stringify(db)===historicalBefore',b.context),true);
  b.context.historyWeanForm.set('date',vm.runInContext('M.addDays(birthDay,-1)',b.context));assert.throws(()=>vm.runInContext('historyWeanSubmit(historyWeanForm)',b.context),/出産日より前/);assert.equal(vm.runInContext('JSON.stringify(db)===historicalBefore',b.context),true);
  b.context.historyWeanForm.set('date',date);vm.runInContext('historyWeanSubmit(historyWeanForm)',b.context);assert.equal(vm.runInContext('db.logs.at(-1).date',b.context),date);assert.equal(vm.runInContext('db.logs.at(-1).nursingDays',b.context),28);assert.equal(vm.runInContext("TanakaSowParity.pages(db,'106')[0].card.weanDateActual",b.context),date);assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).logs.at(-1).date,date);
 }
});

test('swimgen appointment is the one-tap completion button, restores after undo and never shows a legacy dose date as the plan',()=>{
 const b=boot();vm.runInContext(`const swimPage=TanakaSowParity.pages(db,'21')[0];save(d=>TanakaSowParity.edit(d,'21',swimPage.key,{...swimPage.card,mating:'2026-10-11'},JSON.stringify(swimPage)));const swimBefore=JSON.stringify(db);const swimMarkup=swimgenControl('21',TanakaSowParity.pages(db,'21')[0].card,true);`,b.context);
 assert.match(vm.runInContext('swimMarkup',b.context),/>接種予定1\/19<\/button>/);assert.equal(vm.runInContext('JSON.stringify(db)===swimBefore',b.context),true);
 vm.runInContext(`changeSwimgen('21',true);const doneMarkup=swimgenControl('21',TanakaSowParity.pages(db,'21')[0].card,true);`,b.context);assert.match(vm.runInContext('doneMarkup',b.context),/>済<\/button>/);assert.doesNotMatch(vm.runInContext('doneMarkup',b.context),/>接種予定/);vm.runInContext("changeSwimgen('21',false);",b.context);assert.match(vm.runInContext("swimgenControl('21',TanakaSowParity.pages(db,'21')[0].card,true)",b.context),/>接種予定1\/19<\/button>/);
 assert.equal(vm.runInContext("swimgenPlannedDate({mating:'2026-10-11',swimgen:'10/16 済'})",b.context),'1/19');assert.equal(vm.runInContext("swimgenPlannedDate({mating:'2026-10-11',swimgen:'2027-01-20',swimgenDone:true})",b.context),'1/20');assert.equal(vm.runInContext("swimgenPlannedDate({swimgen:'10/16 済'})",b.context),'');
 for(const flag of ['reheatPending','cycleCompleted','birthDateActual'])assert.equal(vm.runInContext(`swimgenPlannedDate({mating:'10/11',swimgen:'1/19',${flag}:true})`,b.context),'');
 assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).sows.find(s=>s.id==='21').parityCards.current.card.swimgen,'2027-01-19');
});

test('cull candidate and final departure are separate date-free screens from yard and farrowing; clearing and double submission cannot retire accidentally',()=>{
 const b=boot();vm.runInContext(`go('rooms');let cullSubmit,cullHtml;form=(title,body,label,submit)=>{cullSubmit=submit;cullHtml=body;};const cullOriginal=JSON.stringify(db),cullTotal=I.farmSummary(I.create(db,state,today().slice(0,7),today(),()=> '')).farmTotal;openCulling('106');`,b.context);
 assert.doesNotMatch(vm.runInContext('cullHtml',b.context),/type="date"|<select|廃豚を確定/);assert.equal(vm.runInContext('JSON.stringify(db)===cullOriginal',b.context),true);vm.runInContext('cullSubmit();',b.context);assert.equal(vm.runInContext("state.sows['106'].cullCandidate",b.context),true);assert.equal(vm.runInContext("state.rooms.find(r=>r.key==='r3').state",b.context),'family');assert.equal(vm.runInContext('I.farmSummary(I.create(db,state,today().slice(0,7),today(),()=> \'\')).farmTotal===cullTotal',b.context),true);assert.match(b.elements.get('app').innerHTML,/廃豚候補/);assert.throws(()=>vm.runInContext('cullSubmit();',b.context),/更新/);
 vm.runInContext("openCulling('106');",b.context);assert.match(vm.runInContext('cullHtml',b.context),/実際に農場から出した後/);assert.doesNotMatch(vm.runInContext('cullHtml',b.context),/type="date"/);b.elements.get('cull-clear').onclick();assert.equal(vm.runInContext("state.sows['106'].cullCandidate",b.context),false);assert.equal(vm.runInContext("state.sows['106'].active",b.context),true);
 vm.runInContext("openCulling('106');cullSubmit();openCulling('106');cullSubmit();",b.context);assert.equal(vm.runInContext("state.sows['106'].active",b.context),false);assert.equal(vm.runInContext("state.rooms.find(r=>r.key==='r3').count",b.context),9);assert.equal(vm.runInContext('I.farmSummary(db.inventoryMonths[today().slice(0,7)]).farmTotal===cullTotal-1',b.context),true);assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).logs.at(-1).type,'廃豚');
});
test('culling guards stale screens and monthly drafts, preserves atomic state on storage failure, and protects grouped history',()=>{
 const b=boot();vm.runInContext(`let cullSubmit;form=(title,body,label,submit)=>{cullSubmit=submit;};openCulling('21');cullSubmit();openCulling('21');const cullMarked=JSON.stringify(db);inventoryDrafts.set(today().slice(0,7),{dirty:true});`,b.context);assert.throws(()=>vm.runInContext('cullSubmit()',b.context),/頭数調べ/);assert.equal(vm.runInContext('JSON.stringify(db)===cullMarked',b.context),true);vm.runInContext('inventoryDrafts.clear()',b.context);
 const set=b.storage.setItem;b.storage.setItem=()=>{throw Error('storage full');};assert.throws(()=>vm.runInContext('cullSubmit()',b.context),/storage full/);assert.equal(vm.runInContext('JSON.stringify(db)===cullMarked',b.context),true);b.storage.setItem=set;
 vm.runInContext("cullSubmit();const cullFinal=JSON.stringify(db);deleteLog(db.logs.at(-1).key);",b.context);assert.equal(vm.runInContext('JSON.stringify(db)===cullFinal',b.context),true);assert.throws(()=>vm.runInContext('cullSubmit()',b.context),/更新/);
 vm.runInContext("go('sows');",b.context);assert.match(b.elements.get('app').innerHTML,/廃豚済み（履歴保持）/);
});

test('consignment is two stages: marker keeps stock; final date-only history never raises commercial shipment totals',()=>{
 const b=boot();seedCandidate(b,4);vm.runInContext(`save(d=>{d.finishingBaseline.find(r=>r.key==='f3').kind='肉豚';});go('finishing');let privateSubmit,privateHtml;form=(title,body,label,submit)=>{privateSubmit=submit;privateHtml=body;};const privateBefore=JSON.stringify(db),commercialBefore=F.shipmentSummary(db,today().slice(0,7)).currentTotal;openConsignment('f3');`,b.context);
 assert.equal(vm.runInContext('JSON.stringify(db)===privateBefore',b.context),true);b.context.privateForm=new Map([['consignmentCount','2']]);vm.runInContext('privateSubmit(privateForm);',b.context);assert.equal(vm.runInContext("state.finishing.find(r=>r.key==='f3').count",b.context),4);assert.match(b.elements.get('app').innerHTML,/委託候補 2頭/);
 vm.runInContext("openConsignment('f3');",b.context);assert.match(vm.runInContext('privateHtml',b.context),/委託日（実際に出した日）/);b.context.privateDate=new Map([['consignmentDate',vm.runInContext('M.addDays(today(),-1)',b.context)]]);vm.runInContext('privateSubmit(privateDate);',b.context);
 assert.equal(vm.runInContext("state.finishing.find(r=>r.key==='f3').count",b.context),2);assert.equal(vm.runInContext('F.shipmentSummary(db,today().slice(0,7)).currentTotal===commercialBefore',b.context),true);assert.doesNotMatch(b.elements.get('app').innerHTML,/委託候補 2頭/);vm.runInContext("go('consignments');",b.context);assert.match(b.elements.get('app').innerHTML,/<time datetime="\d{4}-\d{2}-\d{2}">/);assert.match(b.elements.get('app').innerHTML,/2頭/);assert.doesNotMatch(b.elements.get('app').innerHTML,/母豚番号|肉豚舎 右3番/);assert.equal(vm.runInContext('workRecords(db.logs).some(l=>l.privateStockUse)',b.context),false);assert.equal(JSON.parse(b.storage.getItem('tanaka-db')).consignmentDates[0],vm.runInContext('M.addDays(today(),-1)',b.context));assert.throws(()=>vm.runInContext('privateSubmit(privateDate)',b.context),/更新/);
});
test('normal shipment cannot consume reserved consignment heads; yard consignments exclude breeding cards; failed save is atomic',()=>{
 const b=boot();seedCandidate(b,4);vm.runInContext(`save(d=>{d.finishingBaseline.find(r=>r.key==='f3').kind='肉豚';Consignment.mark(d,{roomKey:'f3',count:3});const y=d.finishingBaseline.find(r=>r.key==='yard');Object.assign(y,F.yardState({individuals:[F.yardPig({kind:'肉豚',birthDate:'2026-03-01'},'private-meat'),F.yardPig({kind:'肉豚',registeredSowId:'21'},'mother')]}));});let shipmentSubmit;form=(title,body,label,submit)=>{shipmentSubmit=submit;};finishingShip('f3');`,b.context);b.context.normalShip=new Map([['count','2'],['date',vm.runInContext('today()',b.context)]]);assert.throws(()=>vm.runInContext('shipmentSubmit(normalShip)',b.context),/委託候補/);assert.throws(()=>vm.runInContext("openConsignment('yard','mother')",b.context),/肉豚/);
 vm.runInContext("openConsignment('yard','private-meat');shipmentSubmit(new Map());openConsignment('yard','private-meat');const privateMarked=JSON.stringify(db);",b.context);b.context.finalPrivate=new Map([['consignmentDate',vm.runInContext('today()',b.context)]]);const set=b.storage.setItem;b.storage.setItem=()=>{throw Error('storage full');};assert.throws(()=>vm.runInContext('shipmentSubmit(finalPrivate)',b.context),/storage full/);assert.equal(vm.runInContext('JSON.stringify(db)===privateMarked',b.context),true);b.storage.setItem=set;vm.runInContext('shipmentSubmit(finalPrivate)',b.context);assert.equal(vm.runInContext("F.yardState(state.finishing.find(r=>r.key==='yard')).individuals.some(p=>p.key==='private-meat')",b.context),false);assert.equal(vm.runInContext("state.sows['21'].active",b.context),true);
});

test('no reheat UI is shared by recording and yard card, retains due dates, supports undo and fails atomically',()=>{
 const b=boot();vm.runInContext(`let checkSubmit,checkHtml,checkLabel;form=(title,body,label,submit)=>{checkSubmit=submit;checkHtml=body;checkLabel=label;};record('再発情確認','812');const checkBefore=JSON.stringify(db),checkCard=JSON.stringify(TanakaSowParity.pages(db,'812'));`,b.context);
 assert.equal(vm.runInContext('checkLabel',b.context),'再発情なし');assert.match(vm.runInContext('checkHtml',b.context),/分娩予定・再発回数は変わりません/);
 b.context.storageForFailure=b.storage;vm.runInContext(`const realCheckSave=localStorage.setItem;localStorage.setItem=()=>{throw Error('disk full');};`,b.context);assert.throws(()=>vm.runInContext('checkSubmit()',b.context),/disk full/);assert.equal(vm.runInContext('JSON.stringify(db)===checkBefore',b.context),true);vm.runInContext(`localStorage.setItem=realCheckSave;checkSubmit();`,b.context);assert.equal(vm.runInContext(`JSON.stringify(TanakaSowParity.pages(db,'812'))===checkCard`,b.context),true);assert.match(vm.runInContext(`reheatControl('812',TanakaSowParity.pages(db,'812')[0].card)`,b.context),/確認済み/);assert.match(b.elements.get('work-feedback').innerHTML,/取り消す/);
 vm.runInContext(`const checkKey=db.logs.at(-1).key;save(d=>TanakaSowWork.undo(d,checkKey,makeLog('追記','812')));`,b.context);assert.match(vm.runInContext(`reheatControl('812',TanakaSowParity.pages(db,'812')[0].card)`,b.context),/確認する/);
 vm.runInContext(`record('再発情確認','812','',null,false,true);`,b.context);assert.equal(vm.runInContext('checkLabel',b.context),'保存');assert.match(vm.runInContext('checkHtml',b.context),/再発回数を1回増やし/);
});

test('meat yard list excludes breeding individuals without changing their registration or farm totals',()=>{
 const b=boot();vm.runInContext(`save(d=>{d.finishingBaseline=F.baseline(d);const y=d.finishingBaseline.find(r=>r.key==='yard');Object.assign(y,F.yardState({individuals:[F.yardPig({kind:'肉豚',weight:80},'meat-a'),F.yardPig({kind:'肉豚',weight:90},'meat-b'),F.yardPig({kind:'育成母豚',weight:80},'breeding-a'),F.yardPig({kind:'肉豚',registeredSowId:'21',weight:90},'linked-mother')]}));});const yardBeforeDisplay=JSON.stringify(db),yardTotalBeforeDisplay=I.farmSummary(I.create(db,state,today().slice(0,7),today(),()=> '')).farmTotal;go('finishing');`,b.context);
 const html=vm.runInContext('finishingYardList()',b.context);assert.match(html,/運動場（肉豚）.*2頭/);assert.match(html,/data-yard-pig="meat-a"/);assert.match(html,/data-yard-pig="meat-b"/);assert.doesNotMatch(html,/data-yard-pig="breeding-a"|data-yard-pig="linked-mother"/);assert.equal(vm.runInContext('JSON.stringify(db)===yardBeforeDisplay',b.context),true);assert.equal(vm.runInContext(`I.farmSummary(I.create(db,state,today().slice(0,7),today(),()=> '')).farmTotal===yardTotalBeforeDisplay`,b.context),true);
 vm.runInContext(`save(d=>{const y=d.finishingBaseline.find(r=>r.key==='yard');Object.assign(y,F.yardState({individuals:F.yardState(y).individuals.filter(p=>p.key==='breeding-a')}));});`,b.context);assert.match(vm.runInContext('finishingYardList()',b.context),/肉豚はいません/);assert.equal(vm.runInContext(`F.yardState(state.finishing.find(r=>r.key==='yard')).count`,b.context),1);
});

test('weekly shipment plan is for the following month in screen, history and print, including year rollover; saved values stay intact',()=>{
 const b=boot();for(const [month,label] of [['2026-10','2026年11月'],['2026-12','2027年1月']]){
  b.context.planMonthForTest=month;vm.runInContext(`var weeklyReport=I.create(db,state,planMonthForTest,planMonthForTest+'-28',()=> '');weeklyReport.weekly=[1,2,3,4,5];var weeklyBefore=JSON.stringify(weeklyReport);`,b.context);
  for(const expr of ['inventoryPlan(weeklyReport)','inventoryPlan(weeklyReport,true)','inventoryPrintPlan(weeklyReport)']){const html=vm.runInContext(expr,b.context);assert.ok(html.includes(label),expr);assert.match(html,/週別出荷計画/);}
  assert.equal(vm.runInContext('JSON.stringify(weeklyReport)===weeklyBefore',b.context),true);assert.equal(vm.runInContext('I.weeklyTotal(weeklyReport)',b.context),15);
 }
});

test('editing previous inventory stock saves only the displayed month and survives JSON/cloud restore, history and printing',()=>{
 const b=boot();vm.runInContext(`
  save(d=>{for(const month of ['2026-09','2026-10']){const r=I.create(d,M.replay(d),month,month+'-25',()=> '');r.weekly=[7,5,5,5,5];r.plannedStock['110']=15;r.plannedStock['100']=15;r.stockPlanEdited=['110','100'];I.saveReport(d,r,'null');}});
  inventoryMonth='2026-10';var previousContext=inventoryContext();previousContext.editing=true;
  var untouchedSeptember=JSON.stringify(db.inventoryMonths['2026-09']),untouchedFarm=JSON.stringify({...db,inventoryMonths:null}),untouchedOctober=I.clone(previousContext.report);
  var previousFields=new Map([['date',previousContext.report.date],['remarks',previousContext.report.remarks]]);
  previousContext.report.rows.forEach((row,i)=>{for(const [name,value] of [['count',row.count],['birth',row.birthDate],['sow',row.sowId],['csf',row.csf],['category',row.category]])previousFields.set(name+'_'+i,value===null?'':String(value));});
  I.STOCK.forEach(k=>{previousFields.set('stock_previous_'+k,previousContext.report.previousStock[k]??'');previousFields.set('stock_plan_'+k,previousContext.report.plannedStock[k]??'');});
  previousContext.report.weekly.forEach((n,i)=>previousFields.set('week_'+i,n??''));
  previousContext.report.monthly.forEach((x,i)=>{previousFields.set('planned_'+i,x.planned??'');previousFields.set('actual_'+i,x.actual??'');});
  FormData=class{get(name){return previousFields.has(name)?previousFields.get(name):null;}};
  previousFields.set('stock_previous_110','10');previousFields.set('stock_previous_100','5');previousFields.set('stock_previous_90','');previousFields.set('stock_previous_80','0');
  inventoryUpdate({name:'stock_previous_110'});
  var editedPrevious=inventoryRead();I.syncPlan(editedPrevious);inventoryStoreSnapshot(previousContext,editedPrevious);
 `,b.context);
 const x=JSON.parse(vm.runInContext(`JSON.stringify({r:db.inventoryMonths['2026-10'],before:untouchedOctober,septSame:JSON.stringify(db.inventoryMonths['2026-09'])===untouchedSeptember,farmSame:JSON.stringify({...db,inventoryMonths:null})===untouchedFarm})`,b.context));
 assert.equal(x.r.previousStock['110'],10);assert.equal(x.r.previousStock['100'],5);assert.equal(x.r.previousStock['90'],null);assert.equal(x.r.previousStock['80'],0);
 assert.ok(x.septSame);assert.ok(x.farmSame);
 for(const field of ['rows','plannedStock','stockPlanEdited','weekly','monthly','date','remarks'])assert.deepEqual(x.r[field],x.before[field],field);
 assert.deepEqual(x.r.revisions.at(-1).report.previousStock,x.before.previousStock);
 assert.match(vm.runInContext(`inventoryPlan(previousContext.report)`,b.context),/name="stock_previous_110"[^>]*value="10"/);
 assert.doesNotMatch(vm.runInContext(`inventoryPlan(previousContext.report,true)`,b.context),/name="stock_previous_/);
 assert.match(vm.runInContext(`inventoryPrintPlan(previousContext.report)`,b.context),/<th>110kg<\/th><td>10<\/td>/);
 vm.runInContext(`var restoredPrevious=M.migrate(JSON.parse(localStorage.getItem('tanaka-db')));M.validate(restoredPrevious);cloudStore.validate(restoredPrevious);cloudStore.replaceLocal(restoredPrevious);inventoryDrafts.clear();`,b.context);
 assert.equal(vm.runInContext(`inventoryContext().report.previousStock['110']`,b.context),10);
 vm.runInContext(`previousFields.set('stock_previous_100','-1');inventoryContext().editing=true;`,b.context);assert.throws(()=>vm.runInContext('inventoryRead()',b.context),/0以上の整数/);
});

function seedDeaths(b){vm.runInContext(`save(d=>{
 d.finishingBaseline=F.baseline(d);Object.assign(d.finishingBaseline.find(r=>r.key==='f3'),{state:'occupied',count:5,birthDate:'2025-01-01',sowId:'46',weight:90,kind:'肉豚'});
 Object.assign(d.finishingBaseline.find(r=>r.key==='yard'),F.yardState({individuals:[F.yardPig({birthDate:'2025-01-01',sowId:'46',weight:90},'death-meat')]}));
 d.nurseryBaseline=M.replay(d).nursery;Object.assign(d.nurseryBaseline[0],{state:'occupied',count:3,birthDate:'2025-01-01',sowId:'46',weight:30,kind:'肉豚'});
 for(const month of [I.previousMonth(today().slice(0,7)),today().slice(0,7)]){const r=I.create(d,M.replay(d),month,month+'-25',r=>M.roomBirthDate(d,r));r.plannedStock['110']=15;r.stockPlanEdited=['110'];r.previousStock['110']=10;r.weekly=[7,5,5,5,5];I.saveReport(d,r,'null');}
});var deathBefore=JSON.stringify(db),deathStockBefore=I.farmSummary(db.inventoryMonths[today().slice(0,7)]).farmTotal,deathPast=JSON.stringify(db.inventoryMonths[I.previousMonth(today().slice(0,7))]),deathPlan=JSON.stringify(db.inventoryMonths[today().slice(0,7)].plannedStock);`,b.context);}

test('mortality and undo preserve exact stock across every barn and breeding animals; plans, old reports and reproductive history stay intact',()=>{
 for(const [token,count] of [['finishing:f3',1],['finishing:f3',5],['farrowing:r1',2],['farrowing:r1',9],['nursery:n1',1],['nursery:n1',3],['yard:death-meat',1],['sow:21',1],['sow:512',1],['boar:B1',1]]){
  const b=boot();seedDeaths(b);b.context.deathToken=token;b.context.deathCount=count;
  vm.runInContext(`var deathReceipt;save(d=>{deathReceipt=Deaths.finalize(d,{token:deathToken,date:today(),count:deathCount,now:today()});});`,b.context);
  assert.equal(vm.runInContext(`I.farmSummary(db.inventoryMonths[today().slice(0,7)]).farmTotal`,b.context),vm.runInContext('deathStockBefore',b.context)-count,token);
  assert.equal(vm.runInContext(`JSON.stringify(db.inventoryMonths[I.previousMonth(today().slice(0,7))])===deathPast`,b.context),true,token);
  assert.equal(vm.runInContext(`JSON.stringify(db.inventoryMonths[today().slice(0,7)].plannedStock)===deathPlan`,b.context),true,token);
  assert.equal(vm.runInContext(`F.shipmentSummary(db,today().slice(0,7)).currentTotal`,b.context),0);
  assert.equal(vm.runInContext(`Consignment.history(db).length`,b.context),0);
  vm.runInContext(`M.validate(db);cloudStore.validate(M.migrate(JSON.parse(localStorage.getItem('tanaka-db'))));save(d=>Deaths.undo(d,deathReceipt.key,{date:today()}));`,b.context);
  assert.equal(vm.runInContext(`I.farmSummary(db.inventoryMonths[today().slice(0,7)]).farmTotal===deathStockBefore`,b.context),true,token);
  assert.equal(vm.runInContext(`M.sameData(M.replay(db),M.replay(JSON.parse(deathBefore)))`,b.context),true,token);
  assert.equal(vm.runInContext(`db.inventoryMonths[today().slice(0,7)].rows.find(r=>r.roomKey==='f3'&&r.area==='finishing').birthDate`,b.context),'2025-01-01',token);
  assert.equal(vm.runInContext(`db.inventoryMonths[today().slice(0,7)].rows.find(r=>r.roomKey==='n1'&&r.area==='nursery').birthDate`,b.context),'2025-01-01',token);
  assert.equal(vm.runInContext(`Deaths.history(db)[0].cancelled`,b.context),true);
  assert.equal(vm.runInContext(`Deaths.years(db,today().slice(0,4)).reduce((n,y)=>n+y.count,0)`,b.context),0);
  assert.equal(vm.runInContext(`JSON.stringify(db.sows)===JSON.stringify(JSON.parse(deathBefore).sows)`,b.context),true);
 }
});

test('mortality year totals use actual death dates, retain the four agreed fields, and do not fabricate stillbirths from performance differences',()=>{
 const b=boot();seedDeaths(b);vm.runInContext(`save(d=>Deaths.finalize(d,{token:'finishing:f3',date:'2025-12-31',count:2,now:today()}));save(d=>Deaths.finalize(d,{token:'finishing:f3',date:today(),count:1,now:today()}));go('records');`,b.context);
 const html=b.elements.get('app').innerHTML;assert.ok(html.indexOf('年別の死亡頭数')<html.indexOf('記録をタップして'));assert.match(html,/2025年：2頭/);assert.match(html,/2026年：1頭/);
 const receipt=JSON.parse(vm.runInContext(`JSON.stringify(Deaths.history(db)[0])`,b.context));assert.equal(receipt.birthDate,'2025-01-01');assert.equal(receipt.motherId,'46');assert.equal(receipt.count,1);
 vm.runInContext(`save(d=>Deaths.undo(d,Deaths.history(d)[0].key,{date:today()}));`,b.context);assert.equal(vm.runInContext(`Deaths.years(db,'2026').find(y=>y.year==='2025').count`,b.context),2);assert.equal(vm.runInContext(`Deaths.years(db,'2026').find(y=>y.year==='2026').count`,b.context),0);
});

test('mortality guards stale state, impossible counts/dates, repeated undo and later room operations atomically',()=>{
 const b=boot();seedDeaths(b);
 for(const input of [{count:0},{count:6},{date:'2099-01-01'},{date:'2024-12-31'},{expected:'old'},{count:1.5}]){
  b.context.deathInput=input;assert.throws(()=>vm.runInContext(`save(d=>Deaths.finalize(d,{token:'finishing:f3',date:today(),count:1,now:today(),...deathInput}));`,b.context));assert.equal(vm.runInContext(`JSON.stringify(db)===deathBefore`,b.context),true);
 }
 vm.runInContext(`save(d=>Deaths.finalize(d,{token:'finishing:f3',date:today(),count:1,now:today()}));var deathKey=Deaths.history(db)[0].key;save(d=>{const room=M.replay(d).finishing.find(r=>r.key==='f3');d.logs.push({...makeLog('肉豚舎更新',''),finishingKey:'f3',finishingBefore:F.group(room),finishingAfter:{...F.group(room),weight:80}});});var laterDeathState=JSON.stringify(db);`,b.context);
 assert.throws(()=>vm.runInContext(`save(d=>Deaths.undo(d,deathKey,{date:today()}))`,b.context),/その後/);assert.equal(vm.runInContext(`JSON.stringify(db)===laterDeathState`,b.context),true);
});

test('death form has no cause/operator input, inherits group identity, persists and supports immediate undo without touching shipments',()=>{
 const b=boot();seedDeaths(b);vm.runInContext(`let deathSubmit,deathForm;form=(title,body,label,submit)=>{deathSubmit=submit;deathForm=body;};openDeath('finishing:f3');`,b.context);const form=vm.runInContext('deathForm',b.context);assert.doesNotMatch(form,/操作者|原因/);assert.match(form,/2025-01-01/);assert.match(form,/母豚番号：46/);
 vm.runInContext(`deathSubmit({get:k=>({deathDate:today(),deathCount:'1'}[k]??'')});`,b.context);assert.match(b.elements.get('work-feedback').innerHTML,/取り消す/);
 const button={dataset:{action:'work-undo',id:vm.runInContext('lastWorkAction.key',b.context)}};for(const listener of b.listeners.click)listener({target:{closest:selector=>selector.includes('work-undo')?button:null}});
 assert.equal(vm.runInContext(`Deaths.history(db)[0].cancelled`,b.context),true);assert.match(b.elements.get('work-feedback').innerHTML,/死亡記録を取り消し/);
});

test('mortality handles unnumbered gilts and identified nursery animals once, without losing reproductive history or group members',()=>{
 const b=boot();seedDeaths(b);vm.runInContext(`save(d=>{const y=d.finishingBaseline.find(r=>r.key==='yard');y.individuals.push(F.yardPig({kind:'育成母豚',birthDate:'2025-01-01',sowId:'46',weight:80},'death-gilt'));Object.assign(y,F.yardState(y));TanakaGilts.ensureYardCards(d,today(),['death-gilt']);});inventoryDrafts.clear();var deadGilt=Object.values(state.sows).find(s=>s.giltRegistration?.yardPigKey==='death-gilt');var giltHistory=JSON.stringify(TanakaSowParity.pages(db,deadGilt.id));`,b.context);
 assert.equal(vm.runInContext(`Deaths.targets(db).filter(t=>t.pigKey==='death-gilt').length`,b.context),1);
 vm.runInContext(`save(d=>Deaths.finalize(d,{token:'sow:'+deadGilt.id,date:today(),now:today()}));`,b.context);assert.equal(vm.runInContext(`state.sows[deadGilt.id].active`,b.context),false);assert.equal(vm.runInContext(`JSON.stringify(TanakaSowParity.pages(db,deadGilt.id))===giltHistory`,b.context),true);
 vm.runInContext(`save(d=>Deaths.undo(d,Deaths.history(d)[0].key,{date:today()}));save(d=>{const r=d.nurseryBaseline[0];r.identifiedIndividuals=[F.yardPig({identityLabel:'育成個体',kind:'育成母豚',birthDate:'2025-01-01',weight:30},'nursery-death')];});`,b.context);
 assert.equal(vm.runInContext(`Deaths.target(db,'nursery:n1').count`,b.context),2);
 assert.throws(()=>vm.runInContext(`save(d=>Deaths.finalize(d,{token:'nursery:n1',count:3,date:today(),now:today()}))`,b.context),/死亡頭数/);
 vm.runInContext(`save(d=>Deaths.finalize(d,{token:'nursery-pig:nursery-death',count:1,date:today(),now:today()}));`,b.context);assert.equal(vm.runInContext(`state.nursery[0].count`,b.context),2);assert.equal(vm.runInContext(`state.nursery[0].identifiedIndividuals.length`,b.context),0);
 vm.runInContext(`save(d=>Deaths.undo(d,Deaths.history(d).find(l=>!l.cancelled).key,{date:today()}));`,b.context);assert.equal(vm.runInContext(`state.nursery[0].identifiedIndividuals[0].key`,b.context),'nursery-death');
});

test('mortality clears a consignment reservation explicitly, restores it on undo, blocks double undo and fails safely on a full disk',()=>{
 const b=boot();seedDeaths(b);vm.runInContext(`save(d=>Consignment.mark(d,{roomKey:'f3',count:2}));var reservedBefore=JSON.stringify(db);var realDeathWrite=localStorage.setItem;localStorage.setItem=()=>{throw Error('disk full');};`,b.context);
 assert.throws(()=>vm.runInContext(`save(d=>Deaths.finalize(d,{token:'finishing:f3',count:1,date:today(),now:today()}))`,b.context),/disk full/);assert.equal(vm.runInContext(`JSON.stringify(db)===reservedBefore`,b.context),true);
 vm.runInContext(`localStorage.setItem=realDeathWrite;save(d=>Deaths.finalize(d,{token:'finishing:f3',count:1,date:today(),now:today()}));var reservedDeathKey=Deaths.history(db)[0].key;`,b.context);assert.equal(vm.runInContext(`Consignment.candidate(db,state,'f3')`,b.context),null);
 vm.runInContext(`save(d=>Deaths.undo(d,reservedDeathKey,{date:today()}));`,b.context);assert.equal(vm.runInContext(`Consignment.candidate(db,state,'f3').count`,b.context),2);
 assert.throws(()=>vm.runInContext(`save(d=>Deaths.undo(d,reservedDeathKey,{date:today()}))`,b.context),/取り消し済み/);
});
