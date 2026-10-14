'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('./model.js');require('./finishing-model.js');require('./birth-validation.js');require('./schedules.js');
const {CloudStore,signature,META}=require('./cloud-store.js');
const M=globalThis.TanakaModel,clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){const d=M.migrate(null);d.unknown={keep:[null,false,0,'']};d.pigletChecks={'["r1","baseline"]':{baycox:false,respisure:true,unknown:false}};d.deletedLogs=[{key:'removed',legacy:true,id:'512',type:'旧記録',note:'削除済み',deletedAt:'2026-10-14T00:00:00Z'}];return d;}
function memory(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),values};}
function fakeClient(seed=null){
  const state={row:clone(seed),writes:[],before:null,error:null,readError:null,commitThenError:false};
  const client={auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:{id:'u1',email:'owner@example.test'}},error:null}),signInWithPassword:async({password})=>password==='bad'?{error:{code:'invalid_credentials',message:'Invalid login credentials'}}:{data:{user:{id:'u1',email:'owner@example.test'}}},signOut:async()=>({error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){
    const q={mode:'read',filters:{},select(){return q;},eq(k,v){q.filters[k]=v;return q;},insert(data){q.mode='insert';q.payload=clone(data);return q;},update(data){q.mode='update';q.payload=clone(data);return q;},single(){return q.run();},maybeSingle(){return q.run();},async run(){
      if(q.mode==='read')return state.readError?{error:state.readError}:{data:clone(state.row),error:null};
      if(state.before)await state.before(q);
      if(state.error)return {error:state.error};
      state.writes.push({mode:q.mode,payload:clone(q.payload),filters:clone(q.filters)});
      if(q.mode==='insert'){
        if(state.row)return {error:{code:'23505',message:'duplicate'}};
        state.row={id:'row1',user_id:q.payload.user_id,data:q.payload.data,revision:1,updated_at:'2026-10-14T00:00:00Z'};
      }else{
        const r=state.row;
        if(!r||r.id!==q.filters.id||r.user_id!==q.filters.user_id||r.revision!==q.filters.revision)return {data:null,error:null};
        assert.equal(q.payload.revision,r.revision+1);state.row={...r,...q.payload};
      }
      if(state.commitThenError){state.commitThenError=false;return {error:{message:'通信結果を確認できません'}};}
      return {data:clone(state.row),error:null};
    }};return q;
  }};return {client,state};
}
function row(data=fixture(),revision=1){return {id:'row1',user_id:'u1',data:clone(data),revision,updated_at:'2026-10-14T00:00:00Z'};}
function setup({local=fixture(),remote=null,storage=memory(),api=fakeClient(remote)}={}){
  const box={data:clone(local),backups:[]};
  const store=new CloudStore({config:{url:'https://test.supabase.co',publishableKey:'sb_publishable_test',table:'farm_state'},storage,model:M,
    getLocal:()=>box.data,replaceLocal:data=>{storage.setItem('before-replace',JSON.stringify(box.data));box.backups.push(clone(box.data));box.data=clone(data);},makeClient:async()=>api.client});
  return {store,box,storage,...api};
}
test('startup with no session leaves local storage unchanged',async()=>{const s=setup();const before=clone(s.box.data);await s.store.start();assert.equal(s.store.status,'signedout');assert.deepEqual(s.box.data,before);assert.equal(s.state.writes.length,0);assert.equal(s.storage.values.size,0);});
test('bad password cannot read or write farm state',async()=>{const s=setup();await assert.rejects(s.store.login('owner@example.test','bad'));assert.equal(s.store.user,null);assert.equal(s.state.writes.length,0);assert.match(s.store.message,/パスワード/);});
test('no cloud row requires explicit initial insert and preserves all v3 fields',async()=>{const s=setup();await s.store.login('owner@example.test','ok');assert.equal(s.store.status,'empty');assert.equal(s.state.writes.length,0);await s.store.flush(true);assert.equal(s.state.row.revision,1);assert.deepEqual(s.state.row.data,s.box.data);assert.deepEqual(Object.keys(s.state.writes[0].payload).sort(),['data','user_id']);});
test('different cloud data does not overwrite local until accepted; original is backed up',async()=>{const remote=fixture();remote.sows[0].note='cloud';const s=setup({remote:row(remote)});const original=clone(s.box.data);await s.store.login('owner@example.test','ok');assert.equal(s.store.status,'pending');assert.deepEqual(s.box.data,original);s.store.acceptCloud();assert.deepEqual(s.box.backups,[original]);assert.deepEqual(s.box.data,remote);assert.equal(s.state.writes.length,0);});
test('cloud acceptance refuses edits made after preview',async()=>{const remote=fixture();remote.sows[0].note='cloud';const s=setup({remote:row(remote)});await s.store.login('owner@example.test','ok');s.box.data.sows[0].note='new local';assert.throws(()=>s.store.acceptCloud(),/変わりました/);assert.equal(s.box.data.sows[0].note,'new local');});
test('backup failure prevents cloud replacement',async()=>{const remote=fixture();remote.sows[0].note='cloud';const s=setup({remote:row(remote)});await s.store.login('owner@example.test','ok');s.storage.setItem=()=>{throw Error('quota');};assert.throws(()=>s.store.acceptCloud(),/quota/);assert.equal(s.box.backups.length,0);assert.notEqual(s.box.data.sows[0].note,'cloud');});
test('invalid cloud v3 data never replaces local',async()=>{const remote=fixture();remote.baseline=[];const s=setup({remote:row(remote)});const old=clone(s.box.data);await assert.rejects(s.store.login('owner@example.test','ok'));assert.deepEqual(s.box.data,old);assert.equal(s.state.writes.length,0);});
test('read network failure is never interpreted as an empty cloud',async()=>{const s=setup();s.state.readError={message:'offline'};await assert.rejects(s.store.login('owner@example.test','ok'));assert.equal(s.store.status,'error');await assert.rejects(s.store.flush(true));assert.equal(s.state.writes.length,0);});
test('object key order differences bind without altering arrays or local JSON',async()=>{const local=fixture(),remote=Object.fromEntries(Object.entries(local).reverse());const s=setup({local,remote:row(remote)});await s.store.login('owner@example.test','ok');assert.equal(s.store.status,'ready');assert.deepEqual(s.box.data,local);assert.equal(s.box.backups.length,0);});
test('updates require id, user and loaded revision; metadata remains outside data',async()=>{const s=setup({remote:row()});await s.store.login('owner@example.test','ok');s.box.data.sows[0].note='new';await s.store.flush();assert.equal(s.state.row.revision,2);assert.deepEqual(s.state.writes[0].filters,{id:'row1',user_id:'u1',revision:1});assert.deepEqual(s.state.row.data,s.box.data);assert.equal(s.state.row.data.revision,undefined);});
test('same state does not generate an unnecessary revision',async()=>{const s=setup({remote:row()});await s.store.login('owner@example.test','ok');await s.store.flush();assert.equal(s.state.writes.length,0);});
test('two tabs cannot overwrite each other with stale revision',async()=>{const api=fakeClient(row());const a=setup({api}),b=setup({api});await a.store.login('a','ok');await b.store.login('b','ok');a.box.data.sows[0].note='a';await a.store.flush();b.box.data.sows[0].note='b';await b.store.flush();assert.equal(b.store.status,'conflict');assert.equal(api.state.row.data.sows[0].note,'a');assert.equal(b.box.data.sows[0].note,'b');});
test('edits made during save are sent sequentially with new revision',async()=>{const s=setup({remote:row()});await s.store.login('a','ok');s.box.data.sows[0].note='first';let once=true;s.state.before=async()=>{if(once){once=false;s.box.data.sows[0].note='second';}};await s.store.flush();assert.equal(s.state.writes.length,2);assert.equal(s.state.row.revision,3);assert.equal(s.state.row.data.sows[0].note,'second');});
test('failed cloud save keeps local edits and stops subsequent automatic writes',async()=>{const s=setup({remote:row()});await s.store.login('a','ok');s.box.data.sows[0].note='offline edit';s.state.error={message:'offline'};await assert.rejects(s.store.flush());assert.equal(s.store.status,'error');assert.equal(s.box.data.sows[0].note,'offline edit');assert.notEqual(s.state.row.data.sows[0].note,'offline edit');s.store.localChanged();assert.equal(s.store.timer,null);});
test('lost response after commit can be reconciled without overwriting newer local edits',async()=>{const s=setup({remote:row()});await s.store.login('a','ok');s.box.data.sows[0].note='sent';s.state.commitThenError=true;await assert.rejects(s.store.flush());s.box.data.sows[0].note='newer';await s.store.reload();assert.equal(s.store.status,'ready');assert.equal(s.store.row.revision,2);assert.equal(s.box.data.sows[0].note,'newer');await s.store.flush();assert.equal(s.state.row.revision,3);assert.equal(s.state.row.data.sows[0].note,'newer');});
test('pending upload can survive page restart and be reconciled',async()=>{const s=setup({remote:row()});await s.store.login('a','ok');s.box.data.sows[0].note='sent';s.state.commitThenError=true;await assert.rejects(s.store.flush());const restart=setup({api:{client:s.client,state:s.state},storage:s.storage,local:s.box.data});await restart.store.login('a','ok');assert.equal(restart.store.status,'ready');assert.equal(restart.store.row.revision,2);});
test('local edits with known unchanged remote survive session reload',async()=>{const s=setup({remote:row()});await s.store.login('a','ok');s.box.data.sows[0].note='unsent';await s.store.reload();assert.equal(s.store.status,'ready');assert.equal(s.box.data.sows[0].note,'unsent');});
test('wrong owner returned by backend is rejected',async()=>{const remote=row();remote.user_id='u2';const s=setup({remote});await assert.rejects(s.store.login('a','ok'));assert.equal(s.state.writes.length,0);});
test('unsafe revision cannot be rounded into a write',async()=>{const s=setup({remote:row(fixture(),Number.MAX_SAFE_INTEGER+1)});await assert.rejects(s.store.login('a','ok'));assert.equal(s.state.writes.length,0);});
test('auth and cross-tab changes invalidate in-flight binding',async()=>{const s=setup({remote:row()});await s.store.login('a','ok');s.box.data.sows[0].note='sent';s.state.before=async()=>s.store.externalChanged();await s.store.flush();assert.equal(s.store.row,null);assert.equal(s.store.status,'conflict');assert.equal(s.box.data.sows[0].note,'sent');});
test('auth state never lives in farm JSON or recovery binding metadata',async()=>{const s=setup();await s.store.login('a','ok');await s.store.flush(true);const meta=s.storage.getItem(META);assert.doesNotMatch(meta,/password|access_token|refresh_token/);assert.deepEqual(s.state.row.data,s.box.data);});
test('backup storage failure prevents sending any cloud write',async()=>{const s=setup({remote:row()});await s.store.login('a','ok');s.box.data.sows[0].note='local';s.storage.setItem=()=>{throw Error('quota');};await assert.rejects(s.store.flush(),/quota/);assert.equal(s.state.writes.length,0);assert.equal(s.box.data.sows[0].note,'local');});
