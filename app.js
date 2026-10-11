'use strict';
const M=TanakaModel,KEY='tanaka-db',app=document.getElementById('app'),dlg=document.getElementById('dialog'),modal=document.getElementById('modal');
let db,state,page='home',selected='',fatal='',toastTimer;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const names={family:'母豚＋子豚',piglets:'子豚のみ',empty:'空き'};
const roomName=r=>r.label?`部屋 ${r.label}`:`管理枠 ${r.key.slice(1)}（部屋未設定）`;
const dateText=l=>l.date|| (l.t&&Number.isFinite(Date.parse(l.t))?new Date(l.t).toLocaleString('ja-JP'): '日付未確認');
function toast(s){document.getElementById('toast').textContent=s;document.getElementById('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>document.getElementById('toast').classList.remove('show'),3500);}
function save(fn){if(localStorage.getItem(KEY)!==JSON.stringify(db))throw Error('別画面でデータが変更されました。画面を開き直してから保存してください。');const next=M.commit(db,fn);localStorage.setItem(KEY,JSON.stringify(next));db=next;state=M.replay(db);render();}
try{
  const stored=localStorage.getItem(KEY),raw=stored===null?null:JSON.parse(stored);
  db=M.migrate(raw);state=M.replay(db);
  if(raw?.version!==3){if(stored!==null)localStorage.setItem('tanaka-db-before-v3',stored);localStorage.setItem(KEY,JSON.stringify(db));}
}catch(e){fatal=e.message;}
function sowButton(id){return `<button class="sowlink" data-action="detail" data-id="${esc(id)}">${esc(id)}</button>`;}
function cardLink(title,value,sub,target){return `<button class="card metric" data-action="page" data-id="${target}"><span class="muted">${title}</span><strong>${value}</strong><small>${sub}　›</small></button>`;}
function history(logs,limit=Infinity){return logs.slice().reverse().slice(0,limit).map(l=>`<button class="row row-action" data-action="log" data-id="${esc(l.key)}"><div><b>${esc(l.id||'分娩舎')}　${esc(l.type)}</b><p class="muted">${esc(dateText(l))}${l.legacy?' · 旧版記録':''}${l.updatedAt?' · 修正済み':''}</p>${l.note?`<p class="muted history-note">${esc(l.note)}</p>`:''}</div><span class="chev">›</span></button>`).join('')||'<div class="empty">まだ記録はありません</div>';}
function home(){
  const active=Object.values(state.sows).filter(s=>s.active).length,used=state.rooms.filter(r=>r.state!=='empty').length;
  const plans=db.plans||M.PLANS;
  return `<div class="date">${new Date().toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}</div><div class="grid">${cardLink('現役母豚',active+'頭','個体・履歴を確認','sows')}${cardLink('分娩舎',used+' / 10','空き '+(10-used)+'室','rooms')}</div><div class="card">${['family','piglets'].map(st=>`<div class="row"><div><b>${names[st]}</b><div>${state.rooms.filter(r=>r.state===st).map(r=>sowButton(r.sowId)+(st==='piglets'?'<span class="muted">の子</span>':'')).join('')||'<span class="muted">なし</span>'}</div></div><b>${state.rooms.filter(r=>r.state===st).length}室</b></div>`).join('')}</div><h2>すぐ作業を記録</h2><div class="card">${[['種付け','種付けした'],['分娩','分娩した'],['離乳','離乳した'],['子豚移動','子豚を移動した']].map(([type,title])=>`<button class="row row-action" data-action="record" data-id="${type}"><b>${title}</b><span class="chev">›</span></button>`).join('')}</div><h2>引き継いだ予定</h2><p class="muted">既存アプリの予定です。年・実施状況は未確認です。</p><div class="card">${plans.map(([date,ids,type])=>`<div class="row"><div><b>${date}　${type}</b><div>${ids.map(sowButton).join('')}</div></div>${type==='スイムジェン'?`<button class="sowlink" data-action="plan" data-id="${ids.join(',')}">実施記録</button>`:''}</div>`).join('')}</div><h2>最近の更新</h2><div class="card">${history(db.logs,6)}</div>`;
}
function sowList(){return `<div class="subhead"><h2>母豚管理</h2><span class="badge green">現役 ${Object.values(state.sows).filter(s=>s.active).length}頭</span></div><button class="btn" data-action="add">＋ 新規母豚を追加</button>${[true,false].map(active=>`<h2>${active?'現役母豚':'廃豚済み（履歴保持）'}</h2><div class="card">${Object.values(state.sows).filter(s=>s.active===active).map(s=>`<button class="row row-action" data-action="detail" data-id="${esc(s.id)}"><div><b>母豚 ${esc(s.id)}</b><p class="muted">${esc(s.breed||'品種未入力')} ${s.birthDate?' · '+esc(s.birthDate)+'生まれ':''}</p></div><span class="chev">›</span></button>`).join('')||'<div class="empty">該当する母豚はいません</div>'}</div>`).join('')}`;}
function detail(){const s=state.sows[selected];if(!s)return sowList();const r=state.rooms.find(r=>r.state==='family'&&r.sowId===s.id);return `<button class="back" data-action="page" data-id="sows">‹ 母豚一覧</button><div class="card"><span class="badge ${s.active?'green':'gray'}">${s.active?'現役':'廃豚済み'}</span><p class="detail-number">${esc(s.id)}</p><p class="muted">品種：${esc(s.breed||'未入力')}<br>生年月日：${esc(s.birthDate||'未入力')}<br>分娩舎：${r?esc(roomName(r)):'母豚の在室なし'}</p><p class="history-note">${esc(s.note)}</p><button class="btn secondary" data-action="profile" data-id="${esc(s.id)}">個体情報を編集</button><button class="btn" data-action="sow-record" data-id="${esc(s.id)}">作業・追記を記録</button><button class="btn ${s.active?'danger':'secondary'}" data-action="lifecycle" data-id="${esc(s.id)}">${s.active?'廃豚を記録':'現役に戻す'}</button></div><h2>個体の履歴</h2><div class="card">${history(db.logs.filter(l=>String(l.id||'').split(/[・,、\s]+/).includes(s.id)))}</div>`;}
function rooms(){return `<h2 style="margin-top:0">分娩舎管理 · 10室</h2><div class="notice">既存データには部屋番号がありません。「管理枠」は表示上の区分です。実際の部屋番号は各カードの「編集」で設定してください。子豚頭数も未確認のため空欄で引き継いでいます。</div><div class="grid rooms-grid" style="margin-top:16px">${state.rooms.map(r=>`<section class="card room"><h3>${esc(roomName(r))}<span class="badge ${r.state==='family'?'green':r.state==='piglets'?'orange':'gray'}">${names[r.state]}</span></h3><div>${r.state!=='empty'?sowButton(r.sowId)+(r.state==='piglets'?'<span class="muted">の子</span>':''):'<p class="muted">入室なし</p>'}</div>${r.state!=='empty'?`<p class="muted">子豚 ${r.count===null?'頭数未入力':r.count+'頭'}</p>`:''}<button class="btn secondary" data-action="room-edit" data-id="${r.key}">編集</button>${r.state!=='empty'?`<button class="btn" data-action="room-record" data-id="${r.key}">${r.state==='family'?'離乳を記録':'子豚移動を記録'}</button>`:`<button class="btn" data-action="room-birth" data-id="${r.key}">分娩・入室を記録</button>`}</section>`).join('')}</div>`;}
function edit(){return `<h2 style="margin-top:0">編集・過去記録</h2><p class="muted">記録をタップして日付・母豚・内容を修正できます。分娩・離乳・子豚移動の修正は、在室状態にも反映します。</p><div class="toolbar"><button class="btn" data-action="record" data-id="追記">＋ 記録を追記</button><button class="btn secondary" data-action="export">データ保存</button><button class="btn secondary" data-action="import">データ読込</button></div><label for="filter">母豚番号・記録内容で絞り込み</label><input id="filter" type="search" placeholder="例：512 / 離乳"><div class="card" id="histories" style="margin-top:15px">${history(db.logs)}</div><div class="notice">データはこの端末・このブラウザに保存されます。定期的に「データ保存」で控えを残してください。記録の日付を変更しても、状態への反映順は登録順です。</div>`;}
function render(){
  if(fatal){app.innerHTML=`<h2>保存データを読み込めません</h2><div class="notice">${esc(fatal)}<br>保存データは削除していません。</div><button class="btn" data-action="raw-export">元データを保存</button>`;return;}
  app.innerHTML=({home,sows:sowList,detail,rooms,edit}[page]||home)()+`<footer>田中畜産 · 更新版 2026.10.11<br>確認できていない情報は未入力で表示</footer>`;
  document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.page===(page==='detail'?'sows':page)?'page':'false'));
}
function go(p,id){page=p;selected=id||'';render();window.scrollTo(0,0);}
function form(title,content,submit,action){modal.innerHTML=`<h2>${esc(title)}</h2><form id="form">${content}<p class="error" id="form-error" role="alert"></p><button class="btn" type="submit">${esc(submit)}</button><button class="btn secondary" type="button" data-action="close">閉じる</button></form>`;document.getElementById('form').onsubmit=e=>{e.preventDefault();try{action(new FormData(e.target));dlg.close();if(submit!=='次へ')toast('保存しました');}catch(err){document.getElementById('form-error').textContent=err.message;}};if(!dlg.open)dlg.showModal();}
function field(name,label,value='',type='text',required=false){return `<label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}>`;}
function notes(value=''){return `<label for="note">メモ・理由</label><textarea id="note" name="note">${esc(value)}</textarea>`;}
function sowSelect(value='',activeOnly=false){return `<label for="id">母豚番号</label><select id="id" name="id" required><option value="">選択してください</option>${Object.values(state.sows).filter(s=>!activeOnly||s.active||s.id===value).map(s=>`<option value="${esc(s.id)}" ${s.id===value?'selected':''}>${esc(s.id)}${s.active?'':'（廃豚済み）'}</option>`).join('')}</select>`;}
function countValue(f){const n=f.get('count');if(n===null||n==='')return null;const v=Number(n);if(!Number.isInteger(v)||v<0)throw Error('子豚頭数は0以上の整数で入力してください。');return v;}
function makeLog(type,id,note=''){return {key:M.uid(),type,id,date:today(),t:new Date().toISOString(),note};}
function profile(id){const s=id?state.sows[id]:{};form(id?'個体情報を編集':'新規母豚を追加',`<p class="muted">分からない項目は空欄のまま保存できます。番号を修正すると在室情報と履歴の番号も更新します。</p>${field('id','母豚番号',id||'','text',true)}${field('breed','品種',s.breed)}${field('birthDate','生年月日',s.birthDate,'date')}${notes(s.note)}`,'保存する',f=>{
  const newId=String(f.get('id')).trim();if(!/^\d+$/.test(newId))throw Error('母豚番号は数字で入力してください。');
  save(d=>{if(newId!==id&&d.sows.some(s=>s.id===newId))throw Error('その母豚番号は既に登録されています。');const data={id:newId,breed:String(f.get('breed')).trim(),birthDate:f.get('birthDate'),note:f.get('note')};if(id){const i=d.sows.findIndex(s=>s.id===id);const before=M.clone(d.sows[i]);if(newId!==id){d.baseline.forEach(r=>{if(r.sowId===id)r.sowId=newId;});d.plans=M.clone(d.plans||M.PLANS);d.plans.forEach(p=>{p[1]=p[1].map(x=>x===id?newId:x);});d.logs.forEach(l=>{l.id=String(l.id||'').split(/([・,、\s]+)/).map(x=>x===id?newId:x).join('');if(l.room?.sowId===id)l.room.sowId=newId;});}d.logs.push({...makeLog('追記',newId,'個体情報を編集'+(newId!==id?'（番号 '+id+' → '+newId+'）':'')),profileBefore:before,profileAfter:M.clone(data)});d.sows[i]={...d.sows[i],...data};}else{d.sows.push(data);d.logs.push(makeLog('追記',newId,'新規母豚を追加'));}});
  go('detail',newId);
});}
function record(type='追記',id='',roomKey='',existing=null){
  if(existing){type=existing.type;id=existing.id;roomKey=existing.roomKey||'';}
  const legacy=!!existing?.legacy,changesRoom=!legacy&&['分娩','離乳','子豚移動'].includes(type),special=['廃豚','現役復帰'].includes(type);
  let roomOptions=state.rooms;
  if(!existing&&changesRoom)roomOptions=state.rooms.filter(r=>type==='分娩'?r.state==='empty':r.state===(type==='離乳'?'family':'piglets'));
  let content=`<p class="muted">${legacy?'旧版記録です。内容の修正は履歴に反映し、在室状態は変更しません。':special?'状態の変更を履歴に残します。':changesRoom?'保存すると分娩舎の状態も更新します。':'実際に行った日付を入力してください。'}</p>`;
  if(existing&&!legacy&&!existing.profileAfter)content+=`<label for="recordType">記録内容</label><select id="recordType">${M.TYPES.filter(t=>t!=='分娩舎修正').map(t=>`<option ${t===type?'selected':''}>${t}</option>`).join('')}</select>`;
  if(legacy)content+=field('id','母豚番号（複数は「・」区切り）',id,'text',true)+field('type','記録内容',type,'text',true);
  else content+=sowSelect(id,!existing&&['種付け','分娩','離乳','スイムジェン 実施'].includes(type));
  content+=field('date','作業日',existing?.date||(existing?.t&&Number.isFinite(Date.parse(existing.t))?existing.t.slice(0,10):today()),'date',true);
  if(changesRoom)content+=`<label for="roomKey">${type==='分娩'?'入室先':'対象の部屋'}</label><select id="roomKey" name="roomKey" required><option value="">選択してください</option>${roomOptions.map(r=>`<option value="${r.key}" ${r.key===roomKey?'selected':''}>${esc(roomName(r))}${r.sowId?' · '+esc(r.sowId):''}</option>`).join('')}</select>`;
  if(!legacy&&['分娩','離乳'].includes(type))content+=field('count','子豚頭数（不明なら空欄）',existing?.count??'','number');
  content+=notes(existing?.note||'');
  form(existing?'記録を修正':type+'を記録',content,existing?'修正を保存':'記録する',f=>{
    const target=f.get('id');if(!legacy&&!state.sows[target])throw Error('登録済みの母豚を選んでください。');
    const l={...(existing||makeLog(type,target)),id:target,date:f.get('date'),note:f.get('note'),type:legacy?String(f.get('type')).trim():type};
    if(!l.type)throw Error('記録内容を入力してください。');
    if(changesRoom)l.roomKey=f.get('roomKey');if(!legacy&&['分娩','離乳'].includes(type))l.count=countValue(f);
    save(d=>{if(existing){const i=d.logs.findIndex(x=>x.key===existing.key);const old=M.clone(d.logs[i]);delete old.revisions;l.updatedAt=new Date().toISOString();l.revisions=[...(d.logs[i].revisions||[]),old];d.logs[i]=l;}else d.logs.push(l);});
  });
  const typeSelect=document.getElementById('recordType');if(typeSelect)typeSelect.onchange=()=>{const draft={...existing,type:typeSelect.value,id:document.getElementById('id').value,date:document.getElementById('date').value,note:document.getElementById('note').value,roomKey:document.getElementById('roomKey')?.value||''};record(draft.type,draft.id,draft.roomKey,draft);};
  showRevisions(existing);
  if(changesRoom&&!existing){const select=document.getElementById('roomKey');select.onchange=()=>{const r=state.rooms.find(r=>r.key===select.value);if(r?.sowId)document.getElementById('id').value=r.sowId;};if(roomKey)select.onchange();}
}
function editRoom(key,existing=null){const r=existing?{...existing.room,key}:state.rooms.find(r=>r.key===key);form(existing?'分娩舎の修正記録を編集':roomName(r)+'を編集',`<p class="muted">確認できた内容を入力してください。部屋番号は空欄でも保存できます。</p>${field('label','実際の部屋番号',r.label)}<label for="roomState">在室状態</label><select id="roomState" name="state">${Object.entries(names).map(([s,n])=>`<option value="${s}" ${r.state===s?'selected':''}>${n}</option>`).join('')}</select>${sowSelect(r.sowId)}${field('count','子豚頭数（不明なら空欄）',r.count??'','number')}${field('date','確認日',existing?.date||today(),'date',true)}${notes(existing?.note||'')}`,'保存する',f=>{
  const st=f.get('state'),sowId=st==='empty'?'':f.get('id'),room={label:String(f.get('label')).trim(),state:st,sowId,count:st==='empty'?null:countValue(f)};
  if(st!=='empty'&&!sowId)throw Error('母豚番号を選んでください。子豚のみの場合は、その母豚番号を選びます。');
  save(d=>{const l={...(existing||makeLog('分娩舎修正',sowId)),id:sowId,roomKey:key,room,date:f.get('date'),note:f.get('note')};if(existing){const i=d.logs.findIndex(x=>x.key===existing.key),old=M.clone(d.logs[i]);delete old.revisions;l.updatedAt=new Date().toISOString();l.revisions=[...(d.logs[i].revisions||[]),old];d.logs[i]=l;}else d.logs.push(l);});
});showRevisions(existing);const select=document.getElementById('roomState');const change=()=>{const empty=select.value==='empty';document.getElementById('id').required=!empty;document.getElementById('id').disabled=empty;document.getElementById('count').disabled=empty;};select.onchange=change;change();}
function showRevisions(l){if(!l)return;let html='';if(l.profileAfter)html+=`<details><summary>個体情報の変更内容</summary><p class="muted history-note">変更前：${esc(JSON.stringify(l.profileBefore))}<br>変更後：${esc(JSON.stringify(l.profileAfter))}</p></details>`;if(l.revisions?.length)html+=`<details><summary>修正前の記録（${l.revisions.length}件）</summary>${l.revisions.map(r=>`<p class="muted history-note">${esc(dateText(r))} · ${esc(r.id)} · ${esc(r.type)}<br>${esc(r.note)}${r.count!=null?'<br>子豚 '+r.count+'頭':''}${r.room?'<br>'+esc(names[r.room.state])+' · '+esc(r.room.label||'部屋未設定'):''}</p>`).join('')}</details>`;if(html)modal.insertAdjacentHTML('beforeend',html);}
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function importData(){form('保存データを読み込む',`<div class="notice">選んだデータに置き換えます。現在のデータは読み込み前の控えとして保存します。</div><label for="file">保存したJSONファイル</label><input id="file" type="file" accept=".json,application/json" required><div id="import-summary" class="muted"></div>`,'このデータに置き換える',()=>{if(!pending)throw Error('有効なファイルを選んでください。');localStorage.setItem('tanaka-db-before-import',JSON.stringify(db));localStorage.setItem(KEY,JSON.stringify(pending));db=pending;state=M.replay(db);render();});let pending=null;document.getElementById('file').onchange=async e=>{pending=null;try{const file=e.target.files[0];if(!file)return;const next=M.migrate(JSON.parse(await file.text()));document.getElementById('import-summary').textContent=`母豚 ${next.sows.length}頭・記録 ${next.logs.length}件。内容を確認してから保存してください。`;pending=next;document.getElementById('form-error').textContent='';}catch(e){document.getElementById('form-error').textContent=e.message;}};}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.page){if(!fatal)go(b.dataset.page);return;}
  const a=b.dataset.action,id=b.dataset.id;
  if(a==='close'){dlg.close();return;}
  if(a==='raw-export'){download(localStorage.getItem(KEY)||'null','tanaka-original-data.json');return;}
  if(fatal)return;
  if(a==='page')go(id);if(a==='detail')go('detail',id);if(a==='add')profile();if(a==='profile')profile(id);
  if(a==='record')record(id);if(a==='sow-record'){form('母豚 '+id+'の作業',`<label for="type">記録内容</label><select id="type" name="type">${['種付け','分娩','離乳','子豚移動','スイムジェン 実施','追記'].map(t=>`<option>${t}</option>`).join('')}</select>`,'次へ',f=>{setTimeout(()=>record(f.get('type'),id),0);});}
  if(a==='lifecycle')record(state.sows[id].active?'廃豚':'現役復帰',id);
  if(a==='room-edit')editRoom(id);
  if(a==='room-record'){const r=state.rooms.find(r=>r.key===id);record(r.state==='family'?'離乳':'子豚移動',r.sowId,id);}
  if(a==='room-birth')record('分娩','',id);
  if(a==='plan'){form('予定の実施を記録',`<p class="muted">対象の母豚を1頭ずつ記録します。</p><label for="target">母豚番号</label><select id="target" name="target">${id.split(',').map(s=>`<option>${s}</option>`).join('')}</select>`,'次へ',f=>{setTimeout(()=>record('スイムジェン 実施',f.get('target')),0);});}
  if(a==='log'){const l=db.logs.find(l=>l.key===id);if(l?.type==='分娩舎修正'&&!l.legacy)editRoom(l.roomKey,l);else if(l)record(l.type,l.id,l.roomKey,l);}
  if(a==='export')download(JSON.stringify(db,null,2),'tanaka-data-'+today()+'.json');if(a==='import')importData();
});
document.addEventListener('input',e=>{if(e.target.id==='filter'){const q=e.target.value.trim();document.getElementById('histories').innerHTML=history(db.logs.filter(l=>`${l.id} ${l.type} ${l.note||''} ${dateText(l)}`.includes(q)));}});
function network(){document.getElementById('network').textContent=navigator.onLine?'端末保存':'オフライン';}window.addEventListener('online',network);window.addEventListener('offline',network);network();
window.addEventListener('storage',e=>{if(e.key===KEY){try{db=M.migrate(JSON.parse(e.newValue));state=M.replay(db);fatal='';dlg.close();render();toast('別画面の更新を反映しました');}catch(err){fatal=err.message;render();}}});
render();
if('serviceWorker' in navigator&&location.protocol!=='file:'){
  let reloading=false;const hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!reloading){reloading=true;if(dlg.open){toast('更新があります。保存してからアプリを開き直してください');}else location.reload();}});
  navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>toast('オフライン準備を完了できませんでした。通信状態を確認してください'));
}
