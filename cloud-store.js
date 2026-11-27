(function(root){
  'use strict';
  const META='tanaka-cloud-binding',BACKUP='tanaka-db-before-cloud-save';
  const clone=x=>JSON.parse(JSON.stringify(x));
  function signature(x){
    if(Array.isArray(x))return '['+x.map(signature).join(',')+']';
    if(x!==null&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+signature(x[k])).join(',')+'}';
    return JSON.stringify(x);
  }
  // Binding metadata stores SHA-256 fingerprints, never another full farm-data copy.
  // Canonical signatures stay unchanged for the existing equality/replay checks.
  function compactSignature(text){
    const bytes=[];
    for(const char of text){const n=char.codePointAt(0);if(n<128)bytes.push(n);else if(n<2048)bytes.push(192|(n>>>6),128|(n&63));else if(n<65536)bytes.push(224|(n>>>12),128|((n>>>6)&63),128|(n&63));else bytes.push(240|(n>>>18),128|((n>>>12)&63),128|((n>>>6)&63),128|(n&63));}
    const size=bytes.length,bitLength=size*8;bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
    const high=Math.floor(bitLength/4294967296),low=bitLength>>>0;for(let i=3;i>=0;i--)bytes.push((high>>>(i*8))&255);for(let i=3;i>=0;i--)bytes.push((low>>>(i*8))&255);
    const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const hash=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Int32Array(64),rotr=(n,b)=>(n>>>b)|(n<<(32-b));
    for(let at=0;at<bytes.length;at+=64){
      for(let i=0;i<16;i++)w[i]=(bytes[at+i*4]<<24)|(bytes[at+i*4+1]<<16)|(bytes[at+i*4+2]<<8)|bytes[at+i*4+3];
      for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10)))|0;}
      let [a,b,c,d,e,f,g,h]=hash;
      for(let i=0;i<64;i++){const t1=(h+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
      [a,b,c,d,e,f,g,h].forEach((v,i)=>{hash[i]=(hash[i]+v)|0;});
    }
    return 'sha256:'+hash.map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
  }
  const signatureMatches=(stored,canonical)=>typeof stored==='string'&&(stored===canonical||stored===compactSignature(canonical));
  class CloudStore{
    constructor(options){
      Object.assign(this,options);
      this.status='signedout';this.message='端末に保存しています';this.user=null;
      this.row=null;this.pending=null;this.busy=false;this.saving=null;this.timer=null;
      this.paused=false;this.generation=0;this.subscription=null;this.client=null;this.failedWrite=false;
    }
    pause(){
      if(this.busy||this.saving||this.status==='saving')throw Error('クラウドの保存・読込が終わってから開始してください。');
      this.cancelTimers();this.generation++;this.paused=true;
    }
    resume(){this.paused=false;}
    assertNotPaused(){if(this.paused)throw Error('シミュレーション中はクラウド保存・復元を停止しています。');}
    emit(status,message){this.status=status;this.message=message;this.onChange?.(this);}
    validate(data){
      if(!data||data.version!==3||Array.isArray(data))throw Error('クラウドのデータ形式を確認できません。端末の記録は変更していません。');
      const copy=clone(data);this.model.validate(copy);return copy;
    }
    checkedRow(row){
      if(row.user_id!==this.user?.id||typeof row.id!=='string'||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('クラウドの所有者・更新番号を確認できません。');
      this.validate(row.data);return row;
    }
    local(){return this.validate(this.getLocal());}
    meta(){
      const raw=this.storage.getItem(META);if(!raw)return null;
      try{const value=JSON.parse(raw);return value.project===this.config.url&&value.userId===this.user?.id?value:null;}catch(e){return null;}
    }
    remember(row,attempt=null){
      this.assertNotPaused();
      this.storage.setItem(META,JSON.stringify({project:this.config.url,userId:this.user.id,
        rowId:row?.id||null,revision:row?.revision||0,signature:row?compactSignature(signature(row.data)):'',format:2,attempt:attempt?{...attempt,signature:compactSignature(attempt.signature)}:null}));
    }
    capture(){return {generation:this.generation,userId:this.user?.id};}
    current(token){return !this.paused&&token.generation===this.generation&&token.userId===this.user?.id;}
    cancelTimers(){clearTimeout(this.timer);this.timer=null;}
    fail(error,status='error'){
      if(error?.name==='QuotaExceededError'||error?.code===22||error?.code===1014){this.emit(status,'端末の保存容量が不足しています。記録は削除していません。JSONバックアップを保存してから再確認してください。');return;}
      const messages={invalid_credentials:'メールアドレスまたはパスワードを確認してください。',
        email_not_confirmed:'確認メールからメールアドレスを確認してください。',
        '42501':'クラウドの保存権限を確認してください。端末の記録は残っています。',
        '23505':'クラウドに既にデータがあります。再確認してください。',
        PGRST205:'farm_stateテーブルの接続設定を確認してください。'};
      this.emit(status,messages[error?.code]||error?.message||'クラウドへ接続できません。端末の記録は残っています。');
    }
    async ensureClient(){
      if(this.client)return this.client;
      const c=this.config;
      if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url)||!/^sb_publishable_/.test(c.publishableKey))throw Error('Project URLとPublishable keyを確認してください。');
      this.client=await this.makeClient(c);
      this.subscription=this.client.auth.onAuthStateChange((event,session)=>{
        // Avoid SDK auth callback locks: never perform async auth calls in this callback.
        if(event==='SIGNED_OUT'){
          this.generation++;this.cancelTimers();this.user=null;this.row=null;this.pending=null;
          this.emit('signedout','ログアウトしました。端末の記録は残っています。');
        }else if(this.user&&session?.user?.id!==this.user.id){
          this.generation++;this.cancelTimers();this.row=null;this.pending=null;this.user=null;
          this.emit('signedout','アカウントが変わりました。再度ログインしてください。');
        }
      }).data?.subscription;
      return this.client;
    }
    async start(){
      this.assertNotPaused();
      this.busy=true;this.emit('loading','ログイン状態を確認しています');
      try{
        const client=await this.ensureClient();const {data,error}=await client.auth.getSession();
        if(error)throw error;
        if(!data.session){this.emit('signedout','端末に保存しています。クラウドを使うにはログインしてください。');return;}
        const checked=await client.auth.getUser();if(checked.error)throw checked.error;
        if(!checked.data.user)throw Error('ログインし直してください。');
        this.user=checked.data.user;this.generation++;await this.load();
      }catch(e){this.fail(e);}finally{this.busy=false;this.onChange?.(this);}
    }
    async login(email,password){
      this.assertNotPaused();
      if(this.busy||this.saving)throw Error('処理が終わるまでお待ちください。');
      this.busy=true;this.emit('loading','ログインしています');
      try{
        const client=await this.ensureClient();
        const {data,error}=await client.auth.signInWithPassword({email:email.trim(),password});
        if(error)throw error;if(!data.user)throw Error('ログインを確認できません。');
        this.user=data.user;this.generation++;this.row=null;this.pending=null;await this.load();
      }catch(e){this.fail(e);throw e;}finally{this.busy=false;this.onChange?.(this);}
    }
    async logout(){
      this.assertNotPaused();
      if(this.saving||this.busy)throw Error('保存・読込が終わるまでお待ちください。');
      this.cancelTimers();
      const {error}=await this.client.auth.signOut({scope:'local'});if(error)throw error;
      this.generation++;this.user=null;this.row=null;this.pending=null;
      this.emit('signedout','ログアウトしました。端末の記録は残っています。');
    }
    async readRow(){
      this.assertNotPaused();
      const {data,error}=await this.client.from(this.config.table).select('id,user_id,data,revision,updated_at')
        .eq('user_id',this.user.id).maybeSingle();
      if(error)throw error;return data?this.checkedRow(data):null;
    }
    async load(force=false){
      this.assertNotPaused();
      if(!this.user)throw Error('先にログインしてください。');
      this.cancelTimers();const token=this.capture();this.emit('loading','クラウドの記録を確認しています');
      try{
        const row=await this.readRow();if(!this.current(token))return;
        const meta=this.meta(),local=this.local(),localSig=signature(local);
        if(!row){
          this.row=null;this.pending=null;
          if(meta?.rowId){this.emit('conflict','以前のクラウドデータが見つかりません。端末の記録は残っています。');return;}
          this.emit('empty','クラウドに記録はありません。この端末の記録を初回保存できます。');return;
        }
        const serverSig=signature(row.data);
        const known=meta?.rowId===row.id&&meta.revision===row.revision&&signatureMatches(meta.signature,serverSig);
        const attempt=meta?.attempt;
        const acknowledged=attempt&&row.revision===attempt.revision&&signatureMatches(attempt.signature,serverSig)&&(!attempt.rowId||attempt.rowId===row.id);
        if(!force&&(localSig===serverSig||known||acknowledged)){
          this.remember(row);this.row=row;this.pending=null;this.failedWrite=false;
          this.emit('ready',localSig===serverSig?'クラウドと端末の記録は一致しています':'端末に未送信の記録があります。クラウドへ保存できます。');return;
        }
        this.pending={row,localSignature:localSig};this.row=null;
        this.emit('pending','クラウドの記録を読み込みました。端末の記録を退避して切り替えられます。');
      }catch(e){if(this.current(token))this.fail(e);throw e;}
    }
    async reload(force=false){
      this.assertNotPaused();
      if(this.busy||this.saving)throw Error('処理が終わるまでお待ちください。');
      this.busy=true;try{await this.load(force);}finally{this.busy=false;this.onChange?.(this);}
    }
    acceptCloud(){
      this.assertNotPaused();
      if(this.busy||this.saving||!this.pending)throw Error('読み込み待ちの記録がありません。');
      const {row,localSignature}=this.pending;
      if(signature(this.local())!==localSignature)throw Error('確認中に端末の記録が変わりました。クラウドを再確認してください。');
      const data=this.validate(row.data);
      this.replaceLocal(data); // Adapter must back up before replacing, and retain exact v3 fields.
      this.remember(row);this.row=row;this.pending=null;this.failedWrite=false;
      this.emit('ready','クラウドの記録を使用しています。切替前の端末データは退避済みです。');
    }
    localChanged(){
      if(this.paused)return;
      if(this.status!=='ready'||!this.user)return;
      this.emit('ready','端末に保存しました。クラウドへ送信待ちです');
      this.cancelTimers();this.timer=setTimeout(()=>{this.timer=null;this.flush().catch(()=>{});},500);
    }
    externalChanged(){
      this.generation++;this.cancelTimers();this.row=null;this.pending=null;
      if(this.user)this.emit('conflict','別画面で保存状態が変わりました。クラウドを再確認してください。');
    }
    async flush(initial=false){
      this.assertNotPaused();
      if(this.saving)return this.saving;
      if(this.busy||!this.user)throw Error('ログイン・読込が終わってから保存してください。');
      if(initial?this.status!=='empty':this.status!=='ready'||!this.row)throw Error('先にクラウドの記録を確認してください。');
      this.cancelTimers();this.saving=this.write(initial);
      try{await this.saving;}finally{this.saving=null;this.onChange?.(this);}
    }
    async write(initial){
      this.assertNotPaused();
      const token=this.capture();
      try{
        do{
          const data=this.local(),sentSignature=signature(data),before=this.row;
          if(before&&signature(before.data)===sentSignature){this.emit('ready','クラウドと端末の記録は一致しています');return;}
          const revision=before?before.revision+1:1;
          if(!Number.isSafeInteger(revision))throw Error('更新番号を確認してください。');
          // If backup/metadata storage fails, no cloud write is attempted.
          this.storage.setItem(BACKUP,JSON.stringify(before?before.data:data));
          this.remember(before,{rowId:before?.id||null,revision,signature:sentSignature});
          this.failedWrite=true;this.emit('saving','端末保存済み・クラウドへ保存しています');
          let result;
          if(!before){
            result=await this.client.from(this.config.table).insert({user_id:token.userId,data})
              .select('id,user_id,data,revision,updated_at').single();
          }else{
            result=await this.client.from(this.config.table).update({data,revision})
              .eq('id',before.id).eq('user_id',token.userId).eq('revision',before.revision)
              .select('id,user_id,data,revision,updated_at').maybeSingle();
          }
          if(!this.current(token))return;
          if(result.error){
            if(result.error.code==='23505'||result.error.code==='P0001'){this.fail(result.error,'conflict');return;}
            throw result.error;
          }
          if(!result.data){this.emit('conflict','クラウドが別画面で更新されたか、保存権限が変わりました。端末の記録は残っています。');return;}
          const saved=this.checkedRow(result.data);
          if(saved.revision!==revision||signature(saved.data)!==sentSignature)throw Error('保存結果を確認できません。再確認してください。');
          this.remember(saved);this.row=saved;this.failedWrite=false;initial=false;
          this.emit('ready','クラウドへ保存しました');
          // Local edits made during the request are sent in order with the returned revision.
        }while(this.current(token)&&signature(this.local())!==signature(this.row.data));
      }catch(e){if(this.current(token))this.fail(e);throw e;}
    }
  }
  root.TanakaCloud={CloudStore,signature,fingerprint:data=>compactSignature(signature(data)),META,BACKUP};
  if(typeof module!=='undefined')module.exports=root.TanakaCloud;
})(typeof globalThis!=='undefined'?globalThis:this);
