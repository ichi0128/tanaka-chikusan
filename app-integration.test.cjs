'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function boot(){
  const map=new Map(),elements=new Map(),listeners={};
  const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',dataset:{},classList:{add(){},remove(){}},setAttribute(){},close(){this.open=false;},showModal(){this.open=true;},insertAdjacentHTML(){},querySelector(){return null;},querySelectorAll(){return [];}});return elements.get(id);};
  const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size;}};
  const document={getElementById:element,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);},documentElement:{dataset:{}},visibilityState:'visible'};
  const client={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{}}})}};
  const context=vm.createContext({console,document,localStorage:storage,navigator:{onLine:true},location:{protocol:'http:'},setTimeout:()=>1,clearTimeout(){},setInterval(){},addEventListener(){},scrollTo(){},supabase:{createClient:()=>client}});
  vm.runInContext('window=globalThis;',context);
  const scripts=['model.js','finishing-model.js','birth-validation.js','schedules.js','finishing-ui.js','cloud-config.js','cloud-store.js','inventory-model.js','inventory-ui.js','app.js','cloud-ui.js'];
  for(const name of scripts)vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,name),'utf8'),context,{filename:name});
  return {context,storage,elements,listeners};
}
test('real app boot, settings and local save still work with cloud module',async()=>{
  const b=boot();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('fatal',b.context),'');
  vm.runInContext("go('edit');",b.context);
  assert.match(b.elements.get('app').innerHTML,/クラウド保存/);
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
