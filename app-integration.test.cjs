'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function boot(){
  const map=new Map(),elements=new Map(),listeners={};
  const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',dataset:{},classList:{add(){},remove(){}},setAttribute(){},close(){this.open=false;},showModal(){this.open=true;},insertAdjacentHTML(){},querySelector(){return null;}});return elements.get(id);};
  const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size;}};
  const document={getElementById:element,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);},documentElement:{dataset:{}},visibilityState:'visible'};
  const client={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{}}})}};
  const context=vm.createContext({console,document,localStorage:storage,navigator:{onLine:true},location:{protocol:'http:'},setTimeout:()=>1,clearTimeout(){},setInterval(){},addEventListener(){},scrollTo(){},supabase:{createClient:()=>client}});
  vm.runInContext('window=globalThis;',context);
  const scripts=['model.js','finishing-model.js','birth-validation.js','schedules.js','finishing-ui.js','cloud-config.js','cloud-store.js','app.js','cloud-ui.js'];
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
