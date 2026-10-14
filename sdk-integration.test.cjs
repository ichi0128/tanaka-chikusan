'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
globalThis.self=globalThis;
globalThis.window=globalThis;
globalThis.location={href:'https://example.test/'};
globalThis.document={currentScript:{tagName:'SCRIPT',src:'https://example.test/vendor/supabase-2.49.8.js'},getElementsByTagName:()=>[],visibilityState:'visible'};
globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
const sdk=require('./vendor/supabase-2.49.8.js');
require('./model.js');require('./finishing-model.js');require('./birth-validation.js');require('./schedules.js');
const M=globalThis.TanakaModel,{CloudStore}=require('./cloud-store.js');
test('bundled Supabase SDK performs email login, owner read, initial insert and CAS update',async()=>{
  const requests=[],local=M.migrate(null),storageMap=new Map();let remote=null;
  const user={id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test'};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600},'test'].map((x,i)=>i===2?x:Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  const fetchMock=async(input,options={})=>{
    const url=new URL(String(input)),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    requests.push({url,method,body,headers:options.headers});
    if(url.pathname==='/auth/v1/token'){
      assert.deepEqual(body,{email:user.email,password:'test-password',gotrue_meta_security:{}});
      return Response.json({access_token:jwt,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user});
    }
    if(url.pathname==='/rest/v1/farm_state'){
      if(method==='GET'){assert.equal(url.searchParams.get('user_id'),'eq.'+user.id);return Response.json(remote?[remote]:[]);}
      if(method==='POST'){
        assert.deepEqual(Object.keys(body).sort(),['data','user_id']);
        remote={id:'22222222-2222-4222-8222-222222222222',...body,revision:1,updated_at:'2026-10-14T00:00:00Z'};
        return Response.json(remote,{status:201});
      }
      if(method==='PATCH'){
        assert.equal(url.searchParams.get('id'),'eq.'+remote.id);
        assert.equal(url.searchParams.get('user_id'),'eq.'+user.id);
        assert.equal(url.searchParams.get('revision'),'eq.1');
        assert.deepEqual(Object.keys(body).sort(),['data','revision']);
        remote={...remote,...body};return Response.json(remote);
      }
    }
    throw Error('Unexpected SDK request '+method+' '+url.pathname);
  };
  const client=sdk.createClient('https://test.supabase.co','sb_publishable_test',{global:{fetch:fetchMock},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const store=new CloudStore({config:{url:'https://test.supabase.co',publishableKey:'sb_publishable_test',table:'farm_state'},model:M,
    storage:{getItem:k=>storageMap.get(k)??null,setItem:(k,v)=>storageMap.set(k,v)},getLocal:()=>local,replaceLocal(){throw Error('unexpected replacement');},makeClient:async()=>client});
  await store.login(user.email,'test-password');assert.equal(store.status,'empty');
  await store.flush(true);assert.equal(store.row.revision,1);
  local.sows[0].note='SDK接続確認';await store.flush();assert.equal(store.row.revision,2);
  assert.equal(remote.data.sows[0].note,'SDK接続確認');
  for(const r of requests.filter(r=>r.url.pathname.startsWith('/rest/'))){const headers=new Headers(r.headers);assert.equal(headers.get('apikey'),'sb_publishable_test');assert.equal(headers.get('authorization'),'Bearer '+jwt);}
  store.subscription?.unsubscribe();client.auth.stopAutoRefresh();client.removeAllChannels();
});
