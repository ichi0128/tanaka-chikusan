'use strict';
const M=TanakaModel,KEY='tanaka-db',app=document.getElementById('app'),dlg=document.getElementById('dialog'),modal=document.getElementById('modal');
let db,state,page='home',selected='',fatal='',toastTimer;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const nurseryNames={unknown:'未確認',empty:'空き',occupied:'育成中'};
const names={waiting:'分娩待ち',family:'授乳',piglets:'離乳',empty:'空き'};
const roomName=r=>r.label?`部屋 ${r.label}`:`管理枠 ${r.key.slice(1)}`;
const dateText=l=>l.date|| (l.t&&Number.isFinite(Date.parse(l.t))?new Date(l.t).toLocaleString('ja-JP'): '日付未確認');
function toast(s){document.getElementById('toast').textContent=s;document.getElementById('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>document.getElementById('toast').classList.remove('show'),3500);}
function save(fn){if(localStorage.getItem(KEY)!==JSON.stringify(db))throw Error('別画面でデータが変更されました。画面を開き直してから保存してください。');const next=M.commit(db,fn);localStorage.setItem(KEY,JSON.stringify(next));db=next;state=M.replay(db);render();}
try{
  const stored=localStorage.getItem(KEY),raw=stored===null?null:JSON.parse(stored);
  db=M.migrate(raw);state=M.replay(db);
  if(raw?.version!==3||raw?.cardRestoration!==db.cardRestoration||raw?.roomCountRestoration!==db.roomCountRestoration){if(stored!==null)localStorage.setItem(raw?.version===3?'tanaka-db-before-card-restoration':'tanaka-db-before-v3',stored);localStorage.setItem(KEY,JSON.stringify(db));}
}catch(e){fatal=e.message;}
function sowButton(id){return `<button class="sowlink" data-action="detail" data-id="${esc(id)}">${esc(id)}</button>`;}
function cardLink(title,value,sub,target){return `<button class="card metric" data-action="page" data-id="${target}"><span class="muted">${title}</span><strong>${value}</strong><small>${sub}　›</small></button>`;}
function workRecords(logs){return logs.filter(l=>!['developer','system'].includes(l.origin));}
function recordTitle(l){return ({'分娩舎修正':'分娩舎の情報を編集','育成舎修正':'育成舎の情報を編集'})[l.type]||l.type;}
function history(logs,limit=Infinity){return logs.slice().reverse().slice(0,limit).map(l=>`<button class="row row-action" data-action="log" data-id="${esc(l.key)}"><div><b>${esc(l.nursery?.mixed||l.room?.mixed||l.mixed?'混成':l.id||(l.nurseryKey?'育成舎':'分娩舎'))}　${esc(recordTitle(l))}</b><p class="muted">${['分娩舎へ移動','移動取り消し'].includes(l.type)?'状態を更新':esc(dateText(l))}${l.type==='分娩舎内移動'?' · 管理枠 '+esc(l.roomKey.slice(1))+' → '+esc(l.targetRoomKey.slice(1))+' · '+esc(l.count)+'頭':''}${l.nurseryKey?' · 育成舎 管理枠 '+esc(l.nurseryKey.slice(1)):''}${l.legacy?' · 旧版記録':''}${l.updatedAt?' · 修正済み':''}</p>${l.type==='分娩'?`<p class="muted">${l.birthTime?esc(l.birthTime)+' · ':''}生存 ${l.count==null?'未入力':esc(l.count)+'頭'} － 死産 ${l.stillborn==null?'未入力':esc(l.stillborn)+'頭'}</p>`:''}${l.note?`<p class="muted history-note">${esc(l.note)}</p>`:''}</div><span class="chev">›</span></button>`).join('')||'<div class="empty">まだ記録はありません</div>';}

function scheduleHome(){
  const all=M.schedules(db),day=today(),due=all.filter(x=>x.date<=day),next=all.filter(x=>x.date>day).slice(0,8);
  const rows=xs=>xs.map(x=>`<div class="row"><div><b>${esc(x.id)}　${esc(x.label)}</b><p class="muted">${esc(x.date)}${x.completedKey?' · 実施済み':x.date<day?' · 未実施':''}</p></div><button class="sowlink" data-action="${x.completedKey?'cancel-scheduled':'scheduled-record'}" data-id="${esc(x.completedKey||x.id)}" data-type="${esc(x.type)}">${x.completedKey?'取消':'実施'}</button>${x.type==='分娩'&&!state.rooms.some(r=>['waiting','family'].includes(r.state)&&r.sowId===x.id)?`<button class="sowlink" data-action="waiting-enter" data-id="${esc(x.id)}">分娩舎へ移動</button>`:''}</div>`).join('');
  return `<h2>今日の予定</h2><div class="card">${rows(due)||'<div class="empty">今日の予定はありません</div>'}</div><h2>直近の予定</h2><div class="card">${rows(next)||'<div class="empty">直近の予定はありません</div>'}</div><p class="muted">記録した種付け日・分娩日から計算します。元カードの予定も2026年の種付け分として反映しています。</p>`;
}
function home(){
  const active=Object.values(state.sows).filter(s=>s.active).length,used=state.rooms.filter(r=>r.state!=='empty').length;
  const nurseryUsed=state.nursery.filter(n=>n.state==='occupied').length,nurseryUnknown=state.nursery.filter(n=>n.state==='unknown').length,nurseryEmpty=state.nursery.filter(n=>n.state==='empty').length;
  const plans=db.plans||M.PLANS;
  return `<div class="date">${new Date().toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}</div><div class="grid home-metrics">${cardLink('現役母豚',active+'頭','個体・履歴を確認','sows')}${cardLink('分娩舎',used+' / 10','空き '+(10-used)+'室','rooms')}${cardLink('育成舎',nurseryUsed+' / 5',nurseryUnknown?'未確認 '+nurseryUnknown+'室':'空き '+nurseryEmpty+'室','nursery')}</div><h2>分娩舎</h2><div class="card">${['waiting','family','piglets'].map(st=>`<div class="row"><div><b>${names[st]}</b><div>${state.rooms.filter(r=>r.state===st).map(r=>`<button class="sowlink room-summary" data-action="page" data-id="rooms"><span>${r.mixed?'混成':esc(r.sowId)}</span><small>${r.state==='waiting'?esc(dueMonthDay(r.sowId)):'子豚 '+(r.count===null||r.count===undefined?'頭数未入力':esc(r.count)+'頭')}</small></button>`).join('')||'<span class="muted">なし</span>'}</div></div><b>${state.rooms.filter(r=>r.state===st).length}室</b></div>`).join('')}</div>${nurseryHome()}${scheduleHome()}<h2>作業を記録</h2><div class="card">${[['種付け','種付けした'],['分娩','分娩した'],['離乳','離乳した'],['子豚移動','育成舎へ移動した']].map(([type,title])=>`<button class="row row-action" data-action="record" data-id="${type}"><b>${title}</b><span class="chev">›</span></button>`).join('')}</div><h2>最近の更新</h2><div class="card">${history(workRecords(db.logs),6)}</div>`;
}
function sowList(){return `<div class="subhead"><h2>母豚管理</h2><span class="badge green">現役 ${Object.values(state.sows).filter(s=>s.active).length}頭</span></div><button class="btn" data-action="add">＋ 新規母豚を追加</button>${[true,false].map(active=>`<h2>${active?'現役母豚':'廃豚済み（履歴保持）'}</h2><div class="card">${Object.values(state.sows).filter(s=>s.active===active).map(s=>`<button class="row row-action" data-action="detail" data-id="${esc(s.id)}"><div><b>母豚 ${esc(s.id)}</b><p class="muted">${s.birthDate?esc(s.birthDate)+'生まれ':'生年月日未入力'}</p></div><span class="chev">›</span></button>`).join('')||'<div class="empty">該当する母豚はいません</div>'}</div>`).join('')}`;}
function originalCard(s){const c=s.cardBaseline;if(!c)return '';return `<h2>母豚カードの元記録</h2><button class="btn secondary" data-action="card-edit" data-id="${esc(s.id)}">元記録・過去成績を編集</button><p class="muted">保存されていたカードから復旧。月日のみの日付は記録時点の情報です。</p><div class="card">${[['生年月日（元記録）',c.birth],['産次（出産回数）',c.parity],['母親番号',c.mother],['種豚',c.boar],['種付け日',c.mating],['再発情確認予定',c.reheat],['分娩予定日',c.due],['前回離乳日',c.wean],['前回成績（出生→離乳）',c.result],['豚熱',c.csf],['スイムジェン',c.swimgen],['確認済み再発情回数',c.reheatCount]].map(([label,value])=>`<div class="row"><span class="muted">${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}${(c.history||[]).map(l=>`<p>${esc(l.date)}　${esc(l.event)} ${esc(l.boar||'')}</p>`).join('')}</div>`;}
function detail(){const s=state.sows[selected];if(!s)return sowList();const r=state.rooms.find(r=>['family','waiting'].includes(r.state)&&r.sowId===s.id);return `<button class="back" data-action="page" data-id="sows">‹ 母豚一覧</button><div class="card"><span class="badge ${s.active?'green':'gray'}">${s.active?'現役':'廃豚済み'}</span><p class="detail-number">${esc(s.id)}</p><p class="muted">生年月日：${esc(s.birthDate||'未入力')}<br>分娩舎：${r?esc(roomName(r)):'母豚の在室なし'}</p><p class="history-note">${esc(s.note)}</p><button class="btn secondary" data-action="profile" data-id="${esc(s.id)}">個体情報を編集</button>${s.active&&!r?`<button class="btn" data-action="waiting-enter" data-id="${esc(s.id)}">分娩舎へ移動</button>`:r?.state==='waiting'?`<button class="btn secondary" data-action="waiting-cancel" data-id="${r.key}">移動を取り消す</button>`:''}<button class="btn" data-action="sow-record" data-id="${esc(s.id)}">作業・追記を記録</button><button class="btn ${s.active?'danger':'secondary'}" data-action="lifecycle" data-id="${esc(s.id)}">${s.active?'廃豚を記録':'現役に戻す'}</button></div>${originalCard(s)}${birthResults(s)}<h2>個体の履歴</h2><div class="card">${history(db.logs.filter(l=>String(l.id||'').split(/[・,、\s]+/).includes(s.id)))}</div>`;}
function rooms(){return `<h2 style="margin-top:0">分娩舎管理 · 10室</h2><div class="notice">既存データには部屋番号がありません。「管理枠」は表示上の区分です。実際の部屋番号は各カードの「編集」で設定してください。子豚頭数も未確認のため空欄で引き継いでいます。</div><div class="grid rooms-grid" style="margin-top:16px">${sortedFarrowRooms(state.rooms).map(r=>`<section class="card room"><h3>${esc(roomName(r))}<span class="badge ${r.state==='family'?'green':r.state==='piglets'?'orange':'gray'}">${names[r.state]}</span></h3><div>${r.state!=='empty'?(r.mixed?'<span class="sowlink">混成</span>':sowButton(r.sowId)):'<p class="muted">入室なし</p>'}</div>${r.state==='waiting'?`<p class="muted">${esc(dueMonthDay(r.sowId))}</p>`:r.state!=='empty'?`<p class="muted">子豚 ${r.count===null?'頭数未入力':r.count+'頭'}</p>`:''}${r.state==='piglets'?`<button class="btn secondary" data-action="room-group" data-id="${r.key}">分ける・混ぜる</button>`:''}<button class="btn secondary" data-action="room-edit" data-id="${r.key}">編集</button>${r.state==='waiting'?`<button class="btn" data-action="room-birth" data-id="${r.key}">分娩を記録</button><button class="btn secondary" data-action="waiting-cancel" data-id="${r.key}">移動を取り消す</button>`:r.state!=='empty'?`<button class="btn" data-action="room-record" data-id="${r.key}">${r.state==='family'?'離乳を記録':'育成舎へ移動を記録'}</button>`:`<button class="btn" data-action="room-birth" data-id="${r.key}">分娩・入室を記録</button>`}</section>`).join('')}</div>`;}
function edit(){return `<h2 style="margin-top:0">編集・過去記録</h2><p class="muted">記録をタップして日付・母豚・内容を修正できます。分娩・離乳・子豚移動の修正は、在室状態にも反映します。</p><div class="toolbar"><button class="btn" data-action="record" data-id="追記">＋ 記録を追記</button><button class="btn secondary" data-action="export">データ保存</button><button class="btn secondary" data-action="import">データ読込</button><button class="btn secondary" data-action="recovery-export">以前の保存データを取り出す</button></div><label for="filter">母豚番号・記録内容で絞り込み</label><input id="filter" type="search" placeholder="例：512 / 離乳"><div class="card" id="histories" style="margin-top:15px">${history(db.logs)}</div><div class="notice">データはこの端末・このブラウザに保存されます。定期的に「データ保存」で控えを残してください。記録の日付を変更しても、状態への反映順は登録順です。</div>`;}
function render(){
  if(fatal){app.innerHTML=`<h2>保存データを読み込めません</h2><div class="notice">${esc(fatal)}<br>保存データは削除していません。</div><button class="btn" data-action="raw-export">元データを保存</button><button class="btn secondary" data-action="recovery-export">以前の保存データを取り出す</button>`;return;}
  app.innerHTML=({home,sows:sowList,detail,rooms,nursery,edit}[page]||home)()+`<footer>田中畜産 · 更新版 2026.10.11<br>確認できていない情報は未入力で表示</footer>`;
  document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.page===(page==='detail'?'sows':page)?'page':'false'));
}
function go(p,id){page=p;selected=id||'';render();window.scrollTo(0,0);}
function form(title,content,submit,action){modal.innerHTML=`<h2>${esc(title)}</h2><form id="form">${content}<p class="error" id="form-error" role="alert"></p><button class="btn" type="submit">${esc(submit)}</button><button class="btn secondary" type="button" data-action="close">閉じる</button></form>`;document.getElementById('form').onsubmit=e=>{e.preventDefault();try{action(new FormData(e.target));dlg.close();if(submit!=='次へ')toast('保存しました');}catch(err){document.getElementById('form-error').textContent=err.message;}};if(!dlg.open)dlg.showModal();}
function field(name,label,value='',type='text',required=false){return `<label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}>`;}
function notes(value=''){return `<label for="note">メモ・理由</label><textarea id="note" name="note">${esc(value)}</textarea>`;}
function sowSelect(value='',activeOnly=false){return `<label for="id">母豚番号</label><select id="id" name="id" required><option value="">選択してください</option>${Object.values(state.sows).filter(s=>!activeOnly||s.active||s.id===value).map(s=>`<option value="${esc(s.id)}" ${s.id===value?'selected':''}>${esc(s.id)}${s.active?'':'（廃豚済み）'}</option>`).join('')}</select>`;}
function countValue(f){const n=f.get('count');if(n===null||n==='')return null;const v=Number(n);if(!Number.isInteger(v)||v<0)throw Error('子豚頭数は0以上の整数で入力してください。');return v;}
function makeLog(type,id,note=''){return {key:M.uid(),origin:'operator',type,id,date:today(),t:new Date().toISOString(),note};}
function profile(id){const s=id?state.sows[id]:{};form(id?'個体情報を編集':'新規母豚を追加',`<p class="muted">分からない項目は空欄のまま保存できます。番号を修正すると在室情報と履歴の番号も更新します。</p>${field('id','母豚番号',id||'','text',true)}${field('birthDate','生年月日',s.birthDate,'date')}${notes(s.note)}`,'保存する',f=>{
  const newId=String(f.get('id')).trim();if(!/^\d+$/.test(newId))throw Error('母豚番号は数字で入力してください。');
  save(d=>{if(newId!==id&&d.sows.some(s=>s.id===newId))throw Error('その母豚番号は既に登録されています。');const data={id:newId,breed:s.breed||'バークシャー',birthDate:f.get('birthDate'),note:f.get('note')};if(id){const i=d.sows.findIndex(s=>s.id===id);const before=M.clone(d.sows[i]);if(newId!==id){d.baseline.forEach(r=>{if(r.sowId===id)r.sowId=newId;});d.plans=M.clone(d.plans||M.PLANS);d.plans.forEach(p=>{p[1]=p[1].map(x=>x===id?newId:x);});d.logs.forEach(l=>{l.id=String(l.id||'').split(/([・,、\s]+)/).map(x=>x===id?newId:x).join('');if(l.room?.sowId===id)l.room.sowId=newId;if(l.nursery?.sowId===id)l.nursery.sowId=newId;});}d.logs.push({...makeLog('追記',newId,'個体情報を編集'+(newId!==id?'（番号 '+id+' → '+newId+'）':'')),profileBefore:before,profileAfter:M.clone(data)});d.sows[i]={...d.sows[i],...data};}else{d.sows.push(data);d.logs.push(makeLog('追記',newId,'新規母豚を追加'));}});
  go('detail',newId);
});}
function record(type='追記',id='',roomKey='',existing=null){
  if(existing){type=existing.type;id=existing.id;roomKey=existing.roomKey||'';}
  const legacy=!!existing?.legacy,changesRoom=!legacy&&['分娩','離乳','子豚移動'].includes(type),special=['廃豚','現役復帰'].includes(type);
  if(type==='分娩'&&!existing&&!roomKey&&id)roomKey=state.rooms.find(r=>r.state==='waiting'&&r.sowId===id)?.key||'';
  let roomOptions=state.rooms;
  if(!existing&&changesRoom)roomOptions=state.rooms.filter(r=>type==='分娩'?(r.state==='empty'||r.state==='waiting'&&(!id||r.sowId===id)):r.state===(type==='離乳'?'family':'piglets'));
  let content=`<p class="muted">${legacy?'旧版記録です。内容の修正は履歴に反映し、在室状態は変更しません。':special?'状態の変更を履歴に残します。':changesRoom?'保存すると分娩舎の状態も更新します。':'実際に行った日付を入力してください。'}</p>`;
  if(existing&&!legacy&&!existing.profileAfter)content+=`<label for="recordType">記録内容</label><select id="recordType">${M.TYPES.filter(t=>!['分娩舎へ移動','移動取り消し','分娩舎内移動','分娩舎修正','育成舎修正','育成舎から移動'].includes(t)).map(t=>`<option ${t===type?'selected':''}>${t}</option>`).join('')}</select>`;
  if(legacy)content+=field('id','母豚番号（複数は「・」区切り）',id,'text',true)+field('type','記録内容',type,'text',true);
  else content+=sowSelect(id,!existing&&['種付け','分娩','離乳','スイムジェン 実施'].includes(type));
  content+=field('date',type==='分娩'?'出産日':'作業日',existing?.date||(existing?.t&&Number.isFinite(Date.parse(existing.t))?existing.t.slice(0,10):today()),'date',true);
  if(changesRoom)content+=`<label for="roomKey">${type==='分娩'?'入室先':'対象の部屋'}</label><select id="roomKey" name="roomKey" required><option value="">選択してください</option>${roomOptions.map(r=>`<option value="${r.key}" ${r.key===roomKey?'selected':''}>${esc(roomName(r))}${r.sowId?' · '+esc(r.sowId):''}</option>`).join('')}</select>`;
  if(!legacy&&type==='分娩')content+=field('birthTime','出産時刻（不明なら空欄）',existing?.birthTime||'','time')+`<p class="muted">頭数は「生存－死産」で記録します。生存頭数が授乳中の子豚数になります。</p><div class="birth-counts"><div>${field('count','生存頭数',existing?.count??'','number',true)}</div><span aria-hidden="true">－</span><div>${field('stillborn','死産頭数（不明なら空欄）',existing?.stillborn??'','number')}</div></div>`;
  if(!legacy&&type==='離乳')content+=field('count','子豚頭数（不明なら空欄）',existing?.count??'','number');
  if(type==='子豚移動'&&!legacy)content+=`<label for="nurseryKey">移動先の育成舎</label><select id="nurseryKey" name="nurseryKey" ${existing&&!existing.nurseryKey?'':'required'}><option value="">${existing?'旧記録：移動先未登録':'選択してください'}</option>${state.nursery.filter(n=>n.state==='empty'||n.key===existing?.nurseryKey).map(n=>`<option value="${n.key}" ${n.key===existing?.nurseryKey?'selected':''}>${nurseryName(n)}</option>`).join('')}</select><p class="muted">全頭を移動し、頭数を引き継ぎます。移動先が未確認の場合は育成舎タブで空きを確認してください。</p>`;
  content+=notes(existing?.note||'');
  form(existing?'記録を修正':(type==='分娩'?'母豚 '+id+' · 分娩':type==='子豚移動'?'育成舎へ移動':type)+'を記録',content,existing?'修正を保存':'記録する',f=>{
    const selectedRoom=state.rooms.find(r=>r.key===f.get('roomKey')),target=type==='子豚移動'&&(selectedRoom?.mixed||existing?.id==='')?'':f.get('id');if(!legacy&&!state.sows[target]&&!(type==='子豚移動'&&(selectedRoom?.mixed||existing?.id==='')))throw Error('登録済みの母豚を選んでください。');
    const l={...(existing||makeLog(type,target)),id:target,date:f.get('date'),note:f.get('note'),type:legacy?String(f.get('type')).trim():type};
    if(!l.type)throw Error('記録内容を入力してください。');
    if(type==='子豚移動'&&!legacy){l.nurseryKey=f.get('nurseryKey')||'';if(!existing&&!l.nurseryKey)throw Error('移動先の育成舎を選んでください。');}
    if(type==='分娩'&&!legacy){l.birthTime=f.get('birthTime')||'';const value=f.get('stillborn');l.stillborn=value===null||value===''?null:Number(value);if(l.stillborn!==null&&(!Number.isInteger(l.stillborn)||l.stillborn<0))throw Error('死産頭数は0以上の整数で入力してください。');}
    if(type==='分娩'&&!existing&&selectedRoom?.state==='waiting'){l.fromWaiting=true;l.waitingEntryKey=selectedRoom.entryKey||'';}
    if(changesRoom)l.roomKey=f.get('roomKey');if(!legacy&&['分娩','離乳'].includes(type))l.count=countValue(f);
    save(d=>{if(existing){const i=d.logs.findIndex(x=>x.key===existing.key);const old=M.clone(d.logs[i]);delete old.revisions;l.updatedAt=new Date().toISOString();l.revisions=[...(d.logs[i].revisions||[]),old];d.logs[i]=l;}else d.logs.push(l);});
  });
  const typeSelect=document.getElementById('recordType');if(typeSelect)typeSelect.onchange=()=>{const draft={...existing,type:typeSelect.value,id:document.getElementById('id').value,date:document.getElementById('date').value,note:document.getElementById('note').value,roomKey:document.getElementById('roomKey')?.value||''};record(draft.type,draft.id,draft.roomKey,draft);};
  showRevisions(existing);
  if(changesRoom){const select=document.getElementById('roomKey');select.onchange=()=>{const r=state.rooms.find(r=>r.key===select.value);const mixed=type==='子豚移動'&&(existing?existing.id==='':!!r?.mixed),mother=document.getElementById('id');mother.disabled=mixed;mother.required=!mixed;if(!existing&&r?.sowId)mother.value=r.sowId;};select.onchange();}
}
function editRoom(key,existing=null){const r=existing?{...existing.room,key}:state.rooms.find(r=>r.key===key);form(existing?'分娩舎の修正記録を編集':roomName(r)+'を編集',`<p class="muted">確認できた内容を入力してください。部屋番号は空欄でも保存できます。</p>${field('label','実際の部屋番号',r.label)}<label for="roomState">在室状態</label><select id="roomState" name="state">${Object.entries(names).map(([s,n])=>`<option value="${s}" ${r.state===s?'selected':''}>${n}</option>`).join('')}</select>${sowSelect(r.sowId)}${r.state==='piglets'?`<label for="pigletMixed">子豚の区分</label><select id="pigletMixed" name="pigletMixed"><option value="single" ${!r.mixed?'selected':''}>同じ母豚の子</option><option value="mixed" ${r.mixed?'selected':''}>混成</option></select>${field('birthDate','生まれた月日（混成は一番若い子）',r.birthDate||'','date')}`:''}${field('count','子豚頭数（不明なら空欄）',r.count??'','number')}${field('date','確認日',existing?.date||today(),'date',true)}${notes(existing?.note||'')}`,'保存する',f=>{
  const st=f.get('state'),mixed=st==='piglets'&&f.get('pigletMixed')==='mixed',sowId=st==='empty'||mixed?'':f.get('id'),room={label:String(f.get('label')).trim(),state:st,sowId,mixed,birthDate:st==='empty'?'':(f.get('birthDate')??r.birthDate??''),count:['empty','waiting'].includes(st)?null:countValue(f)};
  if(st!=='empty'&&!mixed&&!sowId)throw Error('母豚番号を選んでください。子豚のみの場合は、その母豚番号を選びます。');
  save(d=>{const l={...(existing||makeLog('分娩舎修正',sowId)),id:sowId,roomKey:key,room,date:f.get('date'),note:f.get('note')};if(existing){const i=d.logs.findIndex(x=>x.key===existing.key),old=M.clone(d.logs[i]);delete old.revisions;l.updatedAt=new Date().toISOString();l.revisions=[...(d.logs[i].revisions||[]),old];d.logs[i]=l;}else d.logs.push(l);});
});showRevisions(existing);const select=document.getElementById('roomState');const change=()=>{const empty=select.value==='empty',group=document.getElementById('pigletMixed'),mixed=select.value==='piglets'&&group?.value==='mixed';document.getElementById('id').required=!empty&&!mixed;document.getElementById('id').disabled=empty||mixed;document.getElementById('count').disabled=empty||select.value==='waiting';if(group)group.disabled=select.value!=='piglets';const birth=document.getElementById('birthDate');if(birth)birth.disabled=empty;};select.onchange=change;const group=document.getElementById('pigletMixed');if(group)group.onchange=change;change();}
function showRevisions(l){if(!l)return;let html=page==='edit'?`<button class="btn danger" type="button" data-action="delete-log" data-id="${esc(l.key)}">この記録を削除</button>`:'';if(l.profileAfter)html+=`<details><summary>個体情報の変更内容</summary><p class="muted history-note">変更前：${esc(JSON.stringify(l.profileBefore))}<br>変更後：${esc(JSON.stringify(l.profileAfter))}</p></details>`;if(l.revisions?.length)html+=`<details><summary>修正前の記録（${l.revisions.length}件）</summary>${l.revisions.map(r=>`<p class="muted history-note">${esc(dateText(r))} · ${esc(r.id)} · ${esc(r.type)}<br>${esc(r.note)}${r.count!=null?'<br>子豚 '+r.count+'頭':''}${r.room?'<br>'+esc(names[r.room.state])+' · '+esc(r.room.label||'部屋未設定'):''}</p>`).join('')}</details>`;if(html)modal.insertAdjacentHTML('beforeend',html);}
function deleteLog(key){
  const l=db.logs.find(x=>x.key===key);if(!l)return;
  if(!window.confirm(`${l.id||'分娩舎'}　${l.type}（${dateText(l)}）を削除しますか？\n最近の更新と個体の履歴からも消え、分娩舎の状態は残った記録から再計算されます。個体情報の編集記録は履歴のみ削除し、個体情報は変更しません。`))return;
  try{
    save(d=>{const i=d.logs.findIndex(x=>x.key===key);if(i<0)throw Error('記録が見つかりません。');const removed=d.logs.splice(i,1)[0];d.deletedLogs=d.deletedLogs||[];d.deletedLogs.push({...removed,deletedAt:new Date().toISOString()});});
    dlg.close();toast('記録を削除しました');
  }catch(e){document.getElementById('form-error').textContent='削除できません：'+e.message+' 関連する後の記録を先に修正または削除してください。';}
}
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function importData(){form('保存データを読み込む',`<div class="notice">選んだデータに置き換えます。現在のデータは読み込み前の控えとして保存します。</div><label for="file">保存したJSONファイル</label><input id="file" type="file" accept=".json,application/json" required><div id="import-summary" class="muted"></div>`,'このデータに置き換える',()=>{if(!pending)throw Error('有効なファイルを選んでください。');localStorage.setItem('tanaka-db-before-import',JSON.stringify(db));localStorage.setItem(KEY,JSON.stringify(pending));db=pending;state=M.replay(db);render();});let pending=null;document.getElementById('file').onchange=async e=>{pending=null;try{const file=e.target.files[0];if(!file)return;const next=M.migrate(JSON.parse(await file.text()));document.getElementById('import-summary').textContent=`母豚 ${next.sows.length}頭・記録 ${next.logs.length}件。内容を確認してから保存してください。`;pending=next;document.getElementById('form-error').textContent='';}catch(e){document.getElementById('form-error').textContent=e.message;}};}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.page){if(!fatal)go(b.dataset.page);return;}
  const a=b.dataset.action,id=b.dataset.id;
  if(a==='close'){dlg.close();return;}
  if(a==='recovery-export'){exportRecovery();return;}
  if(a==='raw-export'){download(localStorage.getItem(KEY)||'null','tanaka-original-data.json');return;}
  if(fatal)return;
  if(a==='page')go(id);if(a==='detail')go('detail',id);if(a==='add')profile();if(a==='profile')profile(id);if(a==='card-edit')editOriginalCard(id);
  if(a==='record')record(id);if(a==='sow-record'){form('母豚 '+id+'の作業',`<label for="type">記録内容</label><select id="type" name="type">${['種付け','分娩','離乳','子豚移動','再発情確認','スイムジェン 実施','バイコックス 実施','レシュピシュア 実施','フォステラ 実施','追記'].map(t=>`<option>${t}</option>`).join('')}</select>`,'次へ',f=>{setTimeout(()=>record(f.get('type'),id),0);});}
  if(a==='cancel-scheduled')cancelScheduled(id);
  if(a==='scheduled-record'){if(b.dataset.type==='分娩舎へ移動')enterWaiting(id);else record(b.dataset.type,id);}
  if(a==='lifecycle')record(state.sows[id].active?'廃豚':'現役復帰',id);
  if(a==='room-edit')editRoom(id);if(a==='room-group')roomGroup(id);
  if(a==='room-record'){const r=state.rooms.find(r=>r.key===id);record(r.state==='family'?'離乳':'子豚移動',r.sowId,id);}
  if(a==='waiting-enter')enterWaiting(id);if(a==='waiting-cancel')cancelWaiting(id);
  if(a==='room-birth'){const r=state.rooms.find(x=>x.key===id);record('分娩',r.state==='waiting'?r.sowId:'',id);}
  if(a==='plan'){form('予定の実施を記録',`<p class="muted">対象の母豚を1頭ずつ記録します。</p><label for="target">母豚番号</label><select id="target" name="target">${id.split(',').map(s=>`<option>${s}</option>`).join('')}</select>`,'次へ',f=>{setTimeout(()=>record('スイムジェン 実施',f.get('target')),0);});}
  if(a==='nursery-edit')editNursery(id);if(a==='nursery-out')nurseryOut(id);
  if(a==='log'){const l=db.logs.find(l=>l.key===id);if(l?.type==='分娩舎へ移動'||l?.type==='移動取り消し')waitingLog(l);else if(l?.type==='分娩舎内移動')roomGroup(l.roomKey,l);else if(l?.type==='育成舎修正')editNursery(l.nurseryKey,l);else if(l?.type==='育成舎から移動')nurseryOut(l.nurseryKey,l);else if(l?.type==='分娩舎修正'&&!l.legacy)editRoom(l.roomKey,l);else if(l)record(l.type,l.id,l.roomKey,l);}
  if(a==='delete-log'&&page==='edit')deleteLog(id);
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



function nurseryName(n){return '管理枠 '+n.key.slice(1);}
function nurseryHome(){
  const ns=state.nursery,occupied=ns.filter(n=>n.state==='occupied'),unknown=ns.filter(n=>n.state==='unknown').length;
  const chips=xs=>xs.map(n=>`<button class="sowlink room-summary" data-action="nursery-edit" data-id="${n.key}" aria-label="育成舎 ${nurseryName(n)}を編集"><span>${n.state==='occupied'?(n.mixed?'混成':n.sowId?esc(n.sowId):'母豚番号未入力'):nurseryName(n)}</span><small>${n.state==='occupied'?'子豚 '+(n.count===null?'頭数未入力':esc(n.count)+'頭'):nurseryNames[n.state]}</small></button>`).join('');
  return `<h2>育成舎</h2><div class="card"><div class="row"><div><b>育成子豚</b><div>${chips(occupied)||'<span class="muted">なし</span>'}</div></div><b>${occupied.length}室</b></div>${unknown?`<div class="row"><div><b>未確認</b><div>${chips(ns.filter(n=>n.state==='unknown'))}</div></div><b>${unknown}室</b></div>`:''}</div>`;
}
function nursery(){return `<h2 style="margin-top:0">育成舎 · 5室</h2><p class="muted">滞在は約1か月。管理枠は画面上の区分です。まず現在の在室状態を入力してください。</p><div class="grid rooms-grid">${state.nursery.map(n=>`<section class="card room"><h3>${nurseryName(n)}<span class="badge">${nurseryNames[n.state]}</span></h3>${n.state==='occupied'?`<p>${n.mixed?'混成':n.sowId?esc(n.sowId):'母豚番号未入力'}</p><p class="nursery-count">${n.count===null?'頭数未入力':esc(n.count)+'頭'}</p><p class="muted">生まれた月日：${esc(n.birthDate?n.birthDate.replaceAll('-','/'):'未入力')}</p>`:`<p class="muted">${n.state==='unknown'?'在室状態を確認してください':'入室なし'}</p>`}<button class="btn secondary" data-action="nursery-edit" data-id="${n.key}">編集</button>${n.state==='occupied'?`<button class="btn" data-action="nursery-out" data-id="${n.key}">肉豚舎へ移動を記録</button>`:''}</section>`).join('')}</div><p class="muted">肉豚舎へ移動した履歴は残りますが、移動後の頭数管理はまだありません。</p>`;}
function nurserySave(l,existing){save(d=>{if(existing){const i=d.logs.findIndex(x=>x.key===existing.key),old=M.clone(d.logs[i]);delete old.revisions;l.revisions=[...(d.logs[i].revisions||[]),old];l.updatedAt=new Date().toISOString();d.logs[i]=l;}else d.logs.push(l);});}
function editNursery(key,existing=null){const n=existing?existing.nursery:state.nursery.find(n=>n.key===key);form(existing?'育成舎の記録を修正':nurseryName({key})+'を編集',`<label for="ns">在室状態</label><select id="ns" name="state">${Object.entries(nurseryNames).map(([v,t])=>`<option value="${v}" ${n.state===v?'selected':''}>${t}</option>`).join('')}</select><label for="groupType">子豚の区分</label><select id="groupType" name="groupType"><option value="single" ${!n.mixed?'selected':''}>同じ母豚の子</option><option value="mixed" ${n.mixed?'selected':''}>混成</option></select>${field('mother','母豚番号（不明なら空欄）',n.sowId)}<p class="muted">混成は母豚番号なし。生まれた月日は、一番若い子の誕生日を入力してください。</p>${field('count','子豚頭数（不明なら空欄）',n.count??'','number')}${field('birthDate','生まれた月日（不明なら空欄）',n.birthDate||'','date')}${field('date','確認日',existing?.date||today(),'date',true)}${notes(existing?.note||'')}`,'保存する',f=>{const st=f.get('state'),occupied=st==='occupied',mixed=occupied&&f.get('groupType')==='mixed',mother=mixed?'':String(f.get('mother')||'').trim();if(occupied&&mother&&!/^\d+$/.test(mother))throw Error('母豚番号は数字で入力してください。');const l={...(existing||makeLog('育成舎修正',mother)),id:occupied?mother:'',nurseryKey:key,date:f.get('date'),note:f.get('note'),nursery:{state:st,mixed,sowId:occupied?mother:'',count:occupied?countValue(f):null,entered:occupied?(n.entered||''):'',birthDate:occupied?f.get('birthDate'):''}};nurserySave(l,existing);});showRevisions(existing);const select=document.getElementById('ns'),change=()=>{const occupied=select.value==='occupied';for(const id of ['groupType','count','birthDate'])document.getElementById(id).disabled=!occupied;document.getElementById('mother').disabled=!occupied||document.getElementById('groupType').value==='mixed';};select.onchange=change;document.getElementById('groupType').onchange=change;change();}
function nurseryOut(key,existing=null){const n=state.nursery.find(n=>n.key===key);form('肉豚舎へ移動を記録',`<p>この枠の子豚を全頭移動し、育成舎を空きにします。</p>${field('date','移動日',existing?.date||today(),'date',true)}${notes(existing?.note||'')}`,'記録する',f=>nurserySave({...existing,...(existing?{}:makeLog('育成舎から移動',n.sowId)),nurseryKey:key,date:f.get('date'),note:f.get('note'),count:existing?.count??n.count,mixed:existing?!!existing.mixed:!!n.mixed},existing));showRevisions(existing);}

function roomGroup(key,existing=null){
  const r=state.rooms.find(x=>x.key===key),targets=state.rooms.filter(x=>x.key!==key&&(['empty','piglets'].includes(x.state)||existing?.targetRoomKey===x.key));
  const sourceDate=existing?.sourceBirthDate??roomBirthDate(r);
  form(existing?'分ける・混ぜる記録を修正':'子豚を分ける・混ぜる',`<p class="muted">${esc(roomName(r))}から移動します。生まれた月日は自動で引き継ぎ、混成は一番若い子を基準にします。</p><label for="targetRoomKey">移動先</label><select id="targetRoomKey" name="targetRoomKey" required><option value="">選択してください</option>${targets.map(x=>`<option value="${x.key}" ${existing?.targetRoomKey===x.key?'selected':''}>${esc(roomName(x))} · ${x.state==='empty'?'空き':x.mixed?'混成':esc(x.sowId)}${x.state==='piglets'?' · '+(x.count===null?'頭数未入力':x.count+'頭'):''}</option>`).join('')}</select>${field('count','移動する子豚数',existing?.count??'','number',true)}<div id="source-birth-field" ${!existing&&sourceDate?'hidden':''}>${field('sourceBirthDate','移動元の生まれた月日（未入力のため必要）',sourceDate,'date',true)}</div><div id="target-birth-field" ${!existing?'hidden':''}>${field('targetBirthDate','移動先の生まれた月日（未入力のため必要）',existing?.targetBirthDate??'','date')}</div>${existing?field('date','作業日',existing.date,'date',true):''}${notes(existing?.note||'')}`,'記録する',f=>{
    const target=state.rooms.find(x=>x.key===f.get('targetRoomKey'));if(!target)throw Error('移動先を選んでください。');
    const l={...(existing||makeLog('分娩舎内移動',r.sowId)),roomKey:key,targetRoomKey:target.key,count:countValue(f),sourceBirthDate:existing?f.get('sourceBirthDate'):(roomBirthDate(r)||f.get('sourceBirthDate')||''),targetBirthDate:existing?f.get('targetBirthDate'):(target.state==='piglets'?(roomBirthDate(target)||f.get('targetBirthDate')||''):''),date:existing?f.get('date'):today(),note:f.get('note')};
    save(d=>{if(existing){const i=d.logs.findIndex(x=>x.key===existing.key),old=M.clone(d.logs[i]);delete old.revisions;l.revisions=[...(d.logs[i].revisions||[]),old];l.updatedAt=new Date().toISOString();d.logs[i]=l;}else d.logs.push(l);});
  });showRevisions(existing);
  const select=document.getElementById('targetRoomKey');select.onchange=()=>{
    const target=state.rooms.find(x=>x.key===select.value),input=document.getElementById('targetBirthDate');
    if(!existing){const need=target?.state==='piglets'&&!roomBirthDate(target);document.getElementById('target-birth-field').hidden=!need;input.required=!!need;input.value=target?roomBirthDate(target):'';}
  };if(!existing)select.onchange();
}

function birthCycles(logs,id){
  const events=logs.map((l,index)=>({...l,index})).filter(l=>!l.legacy&&l.id===id&&['分娩','離乳'].includes(l.type)).sort((a,b)=>a.date.localeCompare(b.date)||a.index-b.index);
  const cycles=[];let current=null;
  for(const l of events){if(l.type==='分娩'){current={birth:l,wean:null};cycles.push(current);}else if(current&&!current.wean&&l.roomKey===current.birth.roomKey){current.wean=l;}}
  return cycles.reverse();
}
function birthResults(s){
  const cycles=birthCycles(db.logs,s.id),heads=n=>n===null||n===undefined?'未入力':esc(n)+'頭';
  return `<h2>出産成績</h2>${cycles.map(c=>`<section class="card"><div class="row"><b>分娩日</b><span>${esc(c.birth.date)}${c.birth.birthTime?' '+esc(c.birth.birthTime):''}</span></div><div class="row"><span class="muted">生存－死産</span><b>${heads(c.birth.count)} － ${heads(c.birth.stillborn)}</b></div><div class="row"><span class="muted">離乳日</span><span>${c.wean?esc(c.wean.date):'離乳の記録なし'}</span></div><div class="row"><span class="muted">離乳した頭数</span><b>${c.wean?heads(c.wean.count):'未記録'}</b></div>${c.birth.note?`<p class="muted history-note">分娩メモ：${esc(c.birth.note)}</p>`:''}${c.wean?.note?`<p class="muted history-note">離乳メモ：${esc(c.wean.note)}</p>`:''}</section>`).join('')||'<div class="card"><p class="muted">新しく記録した分娩がまだありません。元カードの前回成績は上に残しています。</p></div>'}<p class="muted">入力した分娩・離乳の頭数を表示します。里子の受け入れ・移動などがあるため、頭数の差を死亡数とは扱いません。</p>`;
}

const cardFields=[['birth','生年月日（元の表記）'],['parity','産次（出産回数）'],['mother','母親番号'],['boar','種豚'],['mating','種付け日'],['reheat','再発情確認予定'],['due','分娩予定日'],['wean','前回離乳日'],['result','前回成績（出生→離乳）'],['csf','豚熱'],['swimgen','スイムジェン'],['reheatCount','確認済み再発情回数']];
function editOriginalCard(id){
  const sow=db.sows.find(s=>s.id===id),card=sow?.cardBaseline;if(!card)return;
  const rows=[...(card.history||[]),{date:'',event:'',boar:''}];
  form('母豚 '+id+' · 元記録・過去成績を編集',`<p class="muted">元カードの情報を修正できます。日付は元の表記（例：6/8）のまま入力できます。アプリで記録した分娩・離乳は「編集」から変更してください。</p>${cardFields.map(([key,label])=>field('card_'+key,label,card[key]??'')).join('')}<h3>元カードの過去履歴</h3><p class="muted">追加は一番下の空欄へ。削除する行は3項目を空欄にしてください。</p>${rows.map((r,i)=>`<fieldset><legend>履歴 ${i+1}</legend>${field('history_date_'+i,'月日',r.date)}${field('history_event_'+i,'内容',r.event)}${field('history_boar_'+i,'種豚',r.boar||'')}</fieldset>`).join('')}`,'保存する',f=>{
    const next=M.clone(card);for(const [key] of cardFields){const value=String(f.get('card_'+key)||'').trim();if(['parity','reheatCount'].includes(key)&&value!==''&&!/^\d+$/.test(value))throw Error('産次・再発情回数は0以上の整数で入力してください。');next[key]=['parity','reheatCount'].includes(key)&&value!==''?Number(value):value;}
    next.history=rows.map((r,i)=>({...r,date:String(f.get('history_date_'+i)||'').trim(),event:String(f.get('history_event_'+i)||'').trim(),boar:String(f.get('history_boar_'+i)||'').trim()})).filter(r=>r.date||r.event||r.boar);
    if(next.history.some(r=>!r.date||!r.event))throw Error('履歴の月日と内容を入力してください。');
    if(JSON.stringify(next)===JSON.stringify(card))return;
    save(d=>{const target=d.sows.find(s=>s.id===id);target.cardBaselineOriginal=target.cardBaselineOriginal||M.clone(target.cardBaseline);target.cardRevisions=target.cardRevisions||[];target.cardRevisions.push({date:today(),t:new Date().toISOString(),before:M.clone(target.cardBaseline),after:M.clone(next)});target.cardBaseline=next;d.logs.push({...makeLog('追記',id,'母豚カードの元記録・過去成績を編集'),cardBefore:M.clone(card),cardAfter:M.clone(next)});});
  });
}

function sowDue(id){return M.schedules(db).find(x=>x.id===id&&x.type==='分娩')?.date||state.sows[id]?.cardBaseline?.due||'予定日未入力';}
function enterWaiting(id){const sow=state.sows[id];if(!sow?.active)return;const occupied=state.rooms.find(r=>['waiting','family'].includes(r.state)&&r.sowId===id);if(occupied){toast('この母豚は既に分娩舎にいます');return;}const room=state.rooms.filter(r=>r.state==='empty').sort((a,b)=>Number(a.key.slice(1))-Number(b.key.slice(1)))[0];if(!room){toast('分娩舎が満室です');return;}form('分娩舎へ移動',`<p>母豚 ${esc(id)}を分娩待ちにします。</p><p class="muted">出産予定日：${esc(sowDue(id))}<br>空いている ${esc(roomName(room))}に入ります。</p>`,'移動する',()=>save(d=>d.logs.push({...makeLog('分娩舎へ移動',id),roomKey:room.key})));}
function cancelWaiting(key){const r=state.rooms.find(x=>x.key===key);if(r?.state!=='waiting'){toast('出産前の分娩待ちだけ取り消せます');return;}form('移動を取り消す',`<p>母豚 ${esc(r.sowId)}を母豚舎に戻し、この管理枠を空けます。</p>`,'取り消す',()=>save(d=>d.logs.push({...makeLog('移動取り消し',r.sowId),roomKey:key})));}
function waitingLog(l){form(l.type,`<p>母豚 ${esc(l.id)} · ${esc(l.roomKey)}</p><p class="muted">${l.type==='分娩舎へ移動'?'分娩待ちへの移動記録です。出産前なら移動を取り消せます。':'移動を取り消した記録です。'}</p>`,'閉じる',()=>{});showRevisions(l);if(l.type==='分娩舎へ移動'&&state.rooms.some(r=>r.key===l.roomKey&&r.state==='waiting'&&r.sowId===l.id))modal.insertAdjacentHTML('beforeend',`<button class="btn secondary" data-action="waiting-cancel" data-id="${l.roomKey}">移動を取り消す</button>`);}

function cancelScheduled(key){const l=db.logs.find(x=>x.key===key);if(!l)return;form('実施を取り消す',`<p>母豚 ${esc(l.id)} · ${esc(recordTitle(l))}を取り消し、未実施に戻します。</p><p class="muted">頭数・在室状態も取り消し前に戻ります。後の記録と矛盾する場合は取消できません。</p>`,'取消する',()=>save(d=>{const i=d.logs.findIndex(x=>x.key===key);if(i<0)throw Error('対象の記録が見つかりません。');const removed=d.logs.splice(i,1)[0];d.deletedLogs=d.deletedLogs||[];d.deletedLogs.push({...removed,deletedAt:new Date().toISOString(),reason:'予定の実施を取消'});}));}

function dueMonthDay(id){const raw=sowDue(id),match=/^(?:\d{4}-)?(\d{1,2})[-/](\d{1,2})$/.exec(raw);return match?Number(match[1])+'月'+Number(match[2])+'日':raw;}

function roomBirthDate(room){
  if(room.birthDate)return room.birthDate;
  if(room.mixed||!room.sowId)return '';
  const births=db.logs.map((l,index)=>({l,index})).filter(x=>!x.l.legacy&&x.l.type==='分娩'&&x.l.id===room.sowId);
  const last=births.at(-1);if(!last||last.l.roomKey!==room.key)return '';
  const after=db.logs.slice(last.index+1);
  if(after.some(l=>!l.legacy&&(l.roomKey===room.key&&(l.type==='子豚移動'||l.type==='分娩舎修正'&&(l.room.state==='empty'||l.room.sowId!==room.sowId)||l.type==='分娩舎内移動')||l.targetRoomKey===room.key)))return '';
  return last.l.date||'';
}

function recoveryEntries(storage){const entries=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&(/^(tanaka(?:[-_]|$)|T[YC]\d)/i.test(key)))entries.push({key,raw:storage.getItem(key)});}return entries.sort((a,b)=>a.key.localeCompare(b.key));}
function exportRecovery(){try{const entries=recoveryEntries(localStorage);if(!entries.length){toast('このブラウザにはアプリの保存データが見つかりません');return;}download(JSON.stringify({format:'tanaka-recovery-export',version:1,exportedAt:new Date().toISOString(),entries},null,2),'tanaka-recovery-'+today()+'.json');toast('確認用ファイルを保存しました。今の記録は変更していません');}catch(e){toast('取り出せません：'+e.message);}}

function sortedFarrowRooms(rooms){
  const dates=new Map(rooms.map(r=>[r.key,r.state==='waiting'||r.state==='empty'?'':roomBirthDate(r)]));
  const rank=r=>r.state==='empty'?3:r.state==='waiting'?2:dates.get(r.key)?0:1;
  return rooms.slice().sort((a,b)=>rank(a)-rank(b)||(dates.get(a.key)||'').localeCompare(dates.get(b.key)||'')||Number(a.key.slice(1))-Number(b.key.slice(1)));
}
