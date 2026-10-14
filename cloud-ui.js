'use strict';
let cloudStore;
function cloudSettings(){
  return `<h2>クラウド保存</h2><section class="card" id="cloud-settings">${cloudSettingsBody()}</section>`;
}
function cloudSettingsBody(){
  const c=cloudStore,locked=!c||c.busy||!!c.saving||c.status==='saving',disabled=locked?'disabled':'';
  const email=c?.user?.email||'',status=c?.message||'接続を準備しています';
  let actions=!c?.user?`<button class="btn" data-cloud="login" ${disabled}>メール・パスワードでログイン</button>`:
    `<p class="muted">${esc(email)}${c.row?' · 更新番号 '+c.row.revision:''}</p>`;
  if(c?.user){
    if(c.status==='empty')actions+=`<button class="btn" data-cloud="first" ${disabled}>この端末の記録を初回保存</button>`;
    if(c.status==='pending'){
      const remote=c.pending.row.data;
      actions+=`<div class="notice">クラウド：母豚 ${remote.sows.length}頭・記録 ${remote.logs.length}件<br>端末：母豚 ${db.sows.length}頭・記録 ${db.logs.length}件<br>内容を混ぜず、クラウドの記録に切り替えます。切替前の端末データは控えに残します。</div><button class="btn" data-cloud="accept" ${disabled}>クラウドの記録を使う</button>`;
    }
    if(c.status==='ready')actions+=`<button class="btn" data-cloud="save" ${disabled}>クラウドへ保存</button>`;
    actions+=`<button class="btn secondary" data-cloud="check" ${disabled}>クラウドを再確認</button><button class="btn secondary" data-cloud="restore" ${disabled}>クラウドから復元</button><button class="btn secondary" data-cloud="logout" ${disabled}>ログアウト</button>`;
  }
  return `<p class="cloud-message" role="status">${esc(status)}</p>${actions}<p class="muted">端末保存とJSONの保存・読込も引き続き使えます。クラウド使用中の変更は、端末保存後に送信します。</p>`;
}
function updateCloudUI(){
  const panel=document.getElementById('cloud-settings');if(panel)panel.innerHTML=cloudSettingsBody();
  const strip=document.getElementById('cloud-status');
  if(strip){strip.textContent=cloudStore?.message||'端末に保存しています';strip.dataset.state=cloudStore?.status||'signedout';}
}
let sdkLoading;
function loadSupabaseSDK(url){
  if(globalThis.supabase?.createClient)return Promise.resolve(globalThis.supabase);
  if(sdkLoading)return sdkLoading;
  sdkLoading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=url;script.async=true;
    const timer=setTimeout(()=>{script.remove();sdkLoading=null;reject(Error('クラウド接続を読み込めません。通信を確認してください。端末保存は使えます。'));},20000);
    script.onload=()=>{clearTimeout(timer);if(globalThis.supabase?.createClient)resolve(globalThis.supabase);else{sdkLoading=null;reject(Error('クラウド接続の読込に失敗しました。'));}};
    script.onerror=()=>{clearTimeout(timer);script.remove();sdkLoading=null;reject(Error('クラウドへ接続できません。端末保存は使えます。'));};
    document.head.append(script);
  });
  return sdkLoading;
}
async function cloudFetch(url,options={}){
  const controller=new AbortController(),abort=()=>controller.abort();
  if(options.signal?.aborted)abort();
  options.signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(abort,20000);
  try{return await fetch(url,{...options,signal:controller.signal});}
  finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);}
}
function cloudPrompt(title,body,label,action){
  modal.innerHTML=`<h2>${esc(title)}</h2><form id="cloud-form">${body}<p class="error" id="cloud-error" role="alert"></p><button class="btn" type="submit">${esc(label)}</button><button class="btn secondary" type="button" data-action="close">閉じる</button></form>`;
  document.getElementById('cloud-form').onsubmit=async e=>{
    e.preventDefault();const submitted=e.target,button=submitted.querySelector('[type="submit"]');button.disabled=true;
    try{await action(new FormData(submitted));if(document.getElementById('cloud-form')===submitted)dlg.close();}
    catch(err){const message=cloudStore?.status==='error'?cloudStore.message:err.message;if(document.getElementById('cloud-form')===submitted){document.getElementById('cloud-error').textContent=message;button.disabled=false;}else toast(message);}
  };
  if(!dlg.open)dlg.showModal();
}
cloudStore=new TanakaCloud.CloudStore({
  config:TanakaCloudConfig,model:M,storage:localStorage,
  makeClient:async config=>{
    const sdk=await loadSupabaseSDK(config.sdkUrl);
    return sdk.createClient(config.url,config.publishableKey,{global:{fetch:cloudFetch},auth:{
      persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,
      // Auth tokens are not part of tanaka-* recovery exports.
      storageKey:'sb-kurobuta-auth',storage:localStorage
    }});
  },
  getLocal:()=>{
    if(fatal||!db)throw Error('端末データを読み込めないため、クラウド保存を止めています。');
    if(localStorage.getItem(KEY)!==JSON.stringify(db))throw Error('別画面で記録が変わりました。画面を開き直してください。');
    return db;
  },
  replaceLocal:data=>{
    const old=localStorage.getItem(KEY),nextState=M.replay(data);
    if(fatal||old!==JSON.stringify(db))throw Error('端末データを確認できません。画面を開き直してください。');
    const unique=new Date().toISOString().replace(/[:.]/g,'-')+'-'+M.uid();
    localStorage.setItem('tanaka-db-before-cloud-'+unique,old);
    localStorage.setItem(KEY,JSON.stringify(data));
    db=data;state=nextState;render();
  },
  onChange:updateCloudUI
});
document.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-cloud]');if(!button||button.disabled)return;
  try{
    const action=button.dataset.cloud;
    if(action==='login'){
      cloudPrompt('クラウドへログイン',`<p class="muted">作成済みのアカウントでログインしてください。</p><label for="cloud-email">メールアドレス</label><input id="cloud-email" name="email" type="email" autocomplete="username" required><label for="cloud-password">パスワード</label><input id="cloud-password" name="password" type="password" autocomplete="current-password" required>`,'ログイン',async f=>{
        const password=f.get('password');document.getElementById('cloud-password').value='';
        await cloudStore.login(String(f.get('email')),String(password));
      });return;
    }
    if(action==='first'){
      cloudPrompt('この端末の記録を初回保存',`<p>保存先：${esc(cloudStore.user.email)}</p><p>母豚 ${db.sows.length}頭・記録 ${db.logs.length}件</p><p class="muted">端末の記録とJSONバックアップは残ります。</p>`,'クラウドへ初回保存',()=>cloudStore.flush(true));return;
    }
    if(action==='accept'){
      cloudPrompt('クラウドの記録へ切替',`<div class="notice">今の端末データを控えに残してから、クラウドの記録に切り替えます。</div>`,'退避して切り替える',()=>cloudStore.acceptCloud());return;
    }
    if(action==='save')await cloudStore.flush();
    if(action==='check')await cloudStore.reload();
    if(action==='restore')await cloudStore.reload(true);
    if(action==='logout')await cloudStore.logout();
  }catch(err){toast(err.message);updateCloudUI();}
});
window.addEventListener('storage',e=>{
  if([KEY,TanakaCloud.META,'sb-kurobuta-auth'].includes(e.key)||e.key===null)cloudStore.externalChanged();
});
window.addEventListener('beforeunload',e=>{
  if(cloudStore.user&&(cloudStore.saving||cloudStore.failedWrite||cloudStore.status==='ready'&&cloudStore.row&&TanakaCloud.signature(db)!==TanakaCloud.signature(cloudStore.row.data))){e.preventDefault();e.returnValue='';}
});
updateCloudUI();
if(!fatal)cloudStore.start();
