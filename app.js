'use strict';
// App release version; independent of the saved-data schema version.
const APP_VERSION='1.7.2';
const M=TanakaModel,KEY='tanaka-db',app=document.getElementById('app'),dlg=document.getElementById('dialog'),modal=document.getElementById('modal');
let db,state,page='home',selected='',fatal='',toastTimer;
// Simulation data lives only in this page's memory. Never serialize this session.
let simulation=null,dataSession=0;
let openPigletCare=new Set();
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{if(simulation)return simulation.day;const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const THEMES={warm:'生成り・茶色',indigo:'白・藍色',green:'薄緑・深緑',dark:'ダーク'};
let theme='warm';try{const saved=localStorage.getItem('tanaka-theme');if(THEMES[saved])theme=saved;}catch(e){}
function applyTheme(){document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',({warm:'#fffaf2',indigo:'#f4f7fc',green:'#f3f7ef',dark:'#1d2425'})[theme]);}
applyTheme();
const nurseryNames={unknown:'未確認',empty:'空き',occupied:'育成中'};
const names={waiting:'分娩待ち',family:'授乳',piglets:'離乳',empty:'空き'};
const roomName=r=>r.state==='empty'?'空き':(r.mixed?'混成':r.sowId?'母豚 '+r.sowId:names[r.state]||'分娩舎')+(r.state==='piglets'&&r.count!==null?' · '+r.count+'頭':'');
const dateText=l=>l.date|| (l.t&&Number.isFinite(Date.parse(l.t))?new Date(l.t).toLocaleString('ja-JP'): '日付未確認');
function toast(s){document.getElementById('toast').textContent=s;document.getElementById('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>document.getElementById('toast').classList.remove('show'),3500);}
function save(fn){if(simulation){const before=db;db=M.commit(db,fn);TanakaSimulationFarm.protectManualChanges(before,db);simulation.checkpoints=(simulation.checkpoints||[]).filter(x=>x.day<simulation.day);simulation.checkpoints.push({day:simulation.day,data:M.clone(db)});simulation.manuallyEdited=true;state=M.replay(db);render();return;}if(localStorage.getItem(KEY)!==JSON.stringify(db))throw Error('別画面でデータが変更されました。画面を開き直してから保存してください。');const next=M.commit(db,fn);localStorage.setItem(KEY,JSON.stringify(next));db=next;state=M.replay(db);render();if(typeof cloudStore!=='undefined')cloudStore.localChanged();}
try{
  const stored=localStorage.getItem(KEY),raw=stored===null?null:JSON.parse(stored);
  db=M.migrate(raw);state=M.replay(db);
  if(raw?.version!==3||raw?.cardRestoration!==db.cardRestoration||raw?.roomCountRestoration!==db.roomCountRestoration||JSON.stringify(raw?.boars)!==JSON.stringify(db.boars)){if(stored!==null)localStorage.setItem(raw?.version===3?(raw.boars===undefined?'tanaka-db-before-boar-registry':'tanaka-db-before-card-restoration'):'tanaka-db-before-v3',stored);localStorage.setItem(KEY,JSON.stringify(db));}
}catch(e){fatal=e.message;}
function sowButton(id){return `<button type="button" class="sowlink" data-action="detail" data-id="${esc(id)}" aria-label="母豚 ${esc(id)}のカードを開く">${esc(id)}</button>`;}
function cardLink(title,value,sub,target,hint='',vacancy='',counts=[]){
  const recordIcon='<svg class="tab-icon" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="21" height="25" rx="3"/><path d="M11 4v25M15 11h8M15 16h8M15 21h6M4 9h4M4 15h4M4 21h4"/></svg>';
  const icon=target==='records'?recordIcon:document.querySelector(`nav button[data-page="${target}"] .tab-icon`)?.outerHTML||'';
  return `<button type="button" class="home-app${counts.length?' home-app-location':''}" data-action="page" data-id="${target}" aria-label="${esc([title,hint,value,...counts.map(([label,n])=>label+' '+n),vacancy,sub].filter(Boolean).join('、'))}" title="${esc(sub||title)}"><span class="home-app-icon">${icon}<span class="home-app-label">${esc(title)}</span><span class="home-app-metric">${counts.length?`<span class="home-location-counts">${counts.map(([label,n])=>`<span><small>${esc(label)}</small><strong>${esc(n)}</strong></span>`).join('')}</span>`:''}${hint?`<small class="home-app-hint">${esc(hint)}</small>`:''}${value?`<strong class="home-app-count${String(value).length>4?' home-app-count-long':''}">${esc(value)}</strong>`:''}${vacancy?`<small class="home-app-vacancy">${esc(vacancy)}</small>`:''}</span></span></button>`;
}

function workRecords(logs){return logs.filter(l=>!['developer','system'].includes(l.origin));}
function recordTitle(l){if(l.type==='種付け'&&l.remating)return '再種付け';return ({'移動取り消し':'移動取消','分娩舎修正':'分娩舎の情報を編集','育成舎修正':'育成舎の情報を編集'})[l.type]||l.type;}
function history(logs,limit=Infinity){const visible=new Set(M.uniqueMatingLogs(db.logs));return logs.filter(l=>visible.has(l)).slice().reverse().slice(0,limit).map(l=>`<button class="row row-action" data-action="log" data-id="${esc(l.key)}"><div><b>${esc(l.nursery?.mixed||l.room?.mixed||l.finishingAfter?.mixed||l.sourceBefore?.mixed||l.mixed?'混成':sowIdentityLabel(l.id)||(l.finishingKey?'肉豚舎':l.nurseryKey?'育成舎':'分娩舎'))}　${esc(recordTitle(l))}${l.origin==='simulation'?' · 予測・仮想':''}</b><p class="muted">${esc(dateText(l))}${l.type==='分娩舎内移動'?' · '+esc(l.count)+'頭を移動':''}${l.nurseryKey?' · 育成舎':''}${l.finishingKey?' · '+esc(finishingPlace(l.finishingKey)):''}${l.type==='肉豚舎へ移動'?' · '+esc(l.sourceArea==='nursery'?'育成舎':finishingPlace(l.sourceKey))+'から '+esc(l.count)+'頭':''}${l.type==='肉豚出荷'?' · '+esc(l.count)+'頭出荷':''}${l.type==='種付け'&&l.boar?' · '+esc(l.boar):''}${l.legacy?' · 旧版記録':''}${l.updatedAt?' · 修正済み':''}</p>${l.movement?`<p class="muted">${esc(l.movement.from.name)} → ${esc(l.movement.to.name)}</p>`:''}${l.type==='分娩'?`<p class="muted">${l.birthTime?esc(l.birthTime)+' · ':''}生存 ${l.count==null?'未入力':esc(l.count)+'頭'} － 死産 ${l.stillborn==null?'未入力':esc(l.stillborn)+'頭'}</p>`:''}${l.type==='離乳'&&l.operator?`<p class="muted">操作者：${esc(l.operator)}${l.nursingDays!==null&&l.nursingDays!==undefined?' · 授乳'+l.nursingDays+'日':''}</p>`:''}${l.type==='再発情確認'&&l.failedMating?`<p class="muted">前回種付け：${esc(sowCardDate(l.failedMating.date))} ${esc(l.failedMating.boar||'')} · 不成立（${esc(l.failedMating.parity??'—')}産）</p>`:''}${l.note?`<p class="muted history-note">${esc(l.note)}</p>`:''}</div><span class="chev">›</span></button>`).join('')||'<div class="empty">まだ記録はありません</div>';}

function homeScheduleEntries(){return [...M.schedules(db,today()),...M.farmReminders(today(),db),...FF.weanSchedules(ffData()),...FF.breedingSchedules(ffData()),...state.rooms.flatMap(r=>M.pigletCare(db,r).filter(x=>!x.done&&x.date).map(x=>({...x,careId:x.id,id:r.mixed?'混成':r.sowId,label:'子豚 '+x.label,type:x.type,care:true})))].sort((a,b)=>a.date.localeCompare(b.date));}
function scheduleHome(){
  const all=homeScheduleEntries(),day=today(),due=all.filter(x=>!x.farm&&x.date<=day),next=all.filter(x=>x.farm||x.date>day);
  const rows=xs=>xs.map(x=>x.farm?`<div class="row"><div><b>${esc(x.label)}</b><p class="muted">${esc(x.date)} · ${esc(x.note)}</p></div>${reminderCompleteButton(x)}</div>`:`<div class="row"><div><b>${esc(x.forecastBreeding?ffLabel(ffData(),x.id):x.id)}　${esc(x.label)}</b><p class="muted">${esc(x.date)}${x.completedKey?' · 実施済み':x.date<day?' · 未実施':''}</p>${!x.completedKey?farrowingDecisionCue(x):''}</div><button class="sowlink" data-action="${x.forecastBreeding&&(!state.sows[x.id]||state.sows[x.id].numberPending)?(state.sows[x.id]?'detail':'page'):x.care?'piglet-check':x.completedKey?'cancel-scheduled':'scheduled-record'}" data-id="${esc(x.forecastBreeding&&!state.sows[x.id]?'finishing':x.care?x.roomKey:x.completedKey||x.id)}" data-care="${esc(x.careId||'')}" data-type="${esc(x.type)}">${x.forecastBreeding&&(!state.sows[x.id]||state.sows[x.id].numberPending)?(state.sows[x.id]?'番号を登録':'運動場を確認'):x.care?'未 → 済':x.completedKey?'取消':'実施'}</button>${x.type==='分娩'&&!state.rooms.some(r=>['waiting','family'].includes(r.state)&&r.sowId===x.id)?`<button class="sowlink" data-action="waiting-enter" data-id="${esc(x.id)}">分娩舎へ移動</button>`:''}</div>`).join('');
  return `<h2>今日の予定</h2><div class="card">${rows(due)||'<div class="empty">今日の予定はありません</div>'}</div><h2>直近の予定</h2><div class="card">${rows(next)||'<div class="empty">直近の予定はありません</div>'}</div><p class="muted">記録した種付け日・分娩日から計算します。元カードの予定も2026年の種付け分として反映しています。定期お知らせは指定日からその月の末日まで表示します。設定で変更できます。</p>`;
}
function homeFarmReminders(){return M.farmReminders(today(),db).map(x=>`<section class="card" aria-label="直近の予定"><div class="row"><div><b>${esc(x.label)}</b><p class="muted">${esc(x.note)}</p></div>${reminderCompleteButton(x)}</div></section>`).join('');}
function homeSummary(label,target){return `<button class="card home-summary" data-action="page" data-id="${target}"><span>${label}</span><span class="chev" aria-hidden="true">›</span></button>`;}
function home(){
  const inFarrowing=new Set(state.rooms.filter(r=>['family','waiting'].includes(r.state)).map(r=>r.sowId).filter(Boolean));
  const yardSows=Object.values(state.sows).filter(s=>s.active&&!s.numberPending&&!TanakaGilts.isGilt(s)&&!inFarrowing.has(s.id)&&!TanakaNurseryYard.inNursery(state,s.id)).length;
  const farrowingSows=inFarrowing.size,yardGilts=TanakaInventory.gilts(state);
  const empty=state.nursery.filter(n=>n.state==='empty').length;
  const headcount=(groups,unknown=0)=>{const total=groups.reduce((sum,r)=>sum+(r.count??0),0),missing=unknown+groups.filter(r=>r.count==null).length;return missing?(total?total+'頭＋?':'—頭'):total+'頭';};
  const farrowingHeads=headcount(state.rooms.filter(r=>['family','piglets'].includes(r.state))),farrowingEmpty=state.rooms.filter(r=>r.state==='empty').length,finishingEmpty=state.finishing.filter(r=>r.key!=='yard'&&r.state==='empty').length;
  const nurseryUnknown=state.nursery.filter(r=>r.state==='unknown').length,nurseryHeads=headcount([...state.nursery.filter(r=>r.state==='occupied'),...simulationVirtualGroups('nursery')],nurseryUnknown);
  const scheduled=homeScheduleEntries().length,updates=workRecords(db.logs).length,targetMonth=inventoryMonth||today().slice(0,7);
  return `<div class="date">${new Date(today()+'T12:00:00').toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}</div><div class="home-app-grid" aria-label="ホームのアプリ一覧">${cardLink('運動場','','現在この場所にいる頭数','sows','','',[['母豚',yardSows+'頭'],['育成母豚',yardGilts+'頭']])}${cardLink('分娩舎','','現在在室中・全10室','rooms','','空き '+farrowingEmpty+'室',[['母豚',farrowingSows+'頭'],['子豚',farrowingHeads]])}${cardLink('育成舎',nurseryHeads,nurseryUnknown?'未確認 '+nurseryUnknown+'室':'全5室','nursery','','空き '+empty+'室')}${cardLink('肉豚舎',finishingTotal()+'頭','運動場含む・空きは24室から集計','finishing','','空き '+finishingEmpty+'室')}${cardLink('頭数調べ',Number(targetMonth.slice(5))+'月','月末の確認・集計・出荷計画','inventory',targetMonth.slice(0,4)+'年')}${cardLink('記録',updates+'件','記録の編集・過去記録','records','最近の更新')}${cardLink('設定','','画面の色・保存・クラウド設定','edit')}</div><div class="home-summaries">${homeSummary('直近の予定 '+scheduled+'件','schedules')}${homeSummary('最近の更新 '+updates+'件','updates')}${homeSummary('今月の出荷 '+TanakaFinishing.shipmentSummary(db,today().slice(0,7)).currentTotal+'頭','shipments')}</div><h2>作業</h2><div class="card">${[['種付け','種付けした'],['分娩','分娩した'],['離乳','離乳した'],['子豚移動','育成舎へ移動した']].map(([type,title])=>`<button class="row row-action" data-action="record" data-id="${type}"><b>${title}</b><span class="chev">›</span></button>`).join('')}</div>`;
}
function updates(){return `<button class="back" data-action="page" data-id="home">‹ ホーム</button><h2>最近の更新</h2><div class="card">${history(workRecords(db.logs))}</div>`;}
function schedules(){return '<button class="back" data-action="page" data-id="home">‹ ホーム</button>'+scheduleHome();}
function yardSowList(){
  const present=new Set(state.rooms.filter(r=>['family','waiting'].includes(r.state)).map(r=>r.sowId));
  const due=new Map(Object.values(state.sows).map(s=>[s.id,M.currentDueDate(db,s.id)]));
  return Object.values(state.sows).filter(s=>s.active&&!s.numberPending&&!TanakaGilts.isGilt(s)&&!present.has(s.id)&&!TanakaNurseryYard.inNursery(state,s.id)).sort((a,b)=>(due.get(a.id)||'9999-12-31').localeCompare(due.get(b.id)||'9999-12-31')||a.id.localeCompare(b.id,'ja',{numeric:true}));
}
function sowList(){
  const yardSows=yardSowList(),yardGilts=yardGiltList(),card=(s,quick=false)=>quick?`<div class="sow-yard-item">${simulationSowBadge(s.id)}${sowCardMarkup(s,null,null,false,true)}<button type="button" class="sow-card-open" data-action="detail" data-id="${esc(s.id)}" aria-label="母豚 ${esc(sowIdentityLabel(s.id))}の詳細"></button></div>`:`<button type="button" class="sow-card-link" data-action="detail" data-id="${esc(s.id)}" aria-label="母豚 ${esc(sowIdentityLabel(s.id))}の詳細">${simulationSowBadge(s.id)}${sowCardMarkup(s)}</button>`;
  return `<div class="subhead"><h2>現役母豚（運動場）</h2><span class="badge green">${yardSows.length+yardGilts.length}頭</span></div><p class="muted sow-swipe-hint">左から出産予定が近い順 · 育成母豚は右端 · 左右にスワイプして確認</p><div class="sow-yard-swipe" role="region" aria-label="運動場の母豚カード・出産予定順" tabindex="0">${[...yardSows,...yardGilts].map(s=>card(s,true)).join('')||'<div class="empty">該当する母豚はいません</div>'}</div><div class="sow-yard-tools"><button class="btn" data-action="add">＋ 新規母豚を追加</button><div class="card"><b>育成母豚 ${TanakaInventory.gilts(state)}頭</b><p class="muted">現役母豚とは別枠・肉豚総数には含めません</p></div>${nurseryYardIndividualCards()}${giltCards()}${maternalTree()}<h2>廃豚済み（履歴保持）</h2><div class="sow-cards">${Object.values(state.sows).filter(s=>!s.active&&!s.numberPending).map(s=>card(s)).join('')||'<div class="empty">該当する母豚はいません</div>'}</div></div>`;
}

function sowCardDate(raw){return String(raw??'').replace(/^\d{4}-(\d{2})-(\d{2})(.*)$/,(_,m,d,suffix)=>Number(m)+'/'+Number(d)+suffix);}
function sowReheatBadge(count){const n=Number(count);return Number.isSafeInteger(n)&&n>0?`<span class="sow-reheat-count" aria-label="再発情${n}回">再${n}</span>`:'';}
function sowCardMarkup(s,card=null,parityLabel=null,blankMissing=false,quick=false,performance=null){const c=card||TanakaSowParity.pages(db,s.id)[0]?.card||M.sowCard(db,s.id),result=performance||(card?TanakaSowParity.cardPerformance(card):TanakaSowParity.performance(db,s.id)),initial=!!s.giltRegistration&&Number(c.parity)===0,parityText=parityLabel??(initial?'初':c.parity===null||c.parity===undefined||c.parity===''?'未入力':c.parity+'産'),value=v=>esc(v===undefined||v===null||v===''?(blankMissing?'':'未入力'):v);return `<div class="sow-card"><div class="sow-card-top"><strong class="${s.numberPending?'gilt-unassigned-number':''}">${esc(s.numberPending?s.giltRegistration.label:s.id)}${s.numberPending?`<small>育成母豚 · 正式番号は種付け時</small>`:''}</strong><div>母 ${value(c.mother)}<br><small>生 ${value(s.birthDate||c.birth||(s.giltRegistration?.birthMonth?s.giltRegistration.birthMonth+'月生':''))}</small></div><b class="${/^(?:\d+産|初)$/.test(parityText)?'sow-parity-large':''}">${esc(parityText)}</b></div>${c.cycleCompleted?'<p class="notice"><b>離乳済み／次回発情待ち</b></p>':''}${c.reheatPending?`<p class="notice"><b>再種付け待ち</b> · 前回の種付けは不成立<br>${esc(sowCardDate(c.lastReheatDate))} 再発情確認</p>`:''}<div class="sow-card-body"><div class="sow-mating-row">${quick&&!TanakaGilts.isGilt(s)?`<button type="button" class="sow-move-button" data-action="waiting-enter" data-id="${esc(s.id)}" aria-label="母豚 ${esc(s.id)}を分娩舎へ">分娩舎へ</button>`:''}${quick?`<button type="button" class="sow-quick-mating" data-action="quick-mating" data-id="${esc(s.id)}" aria-label="母豚 ${esc(sowIdentityLabel(s.id))}の種付けを簡易入力">種付け</button>`:'<small>種付け</small>'}<div class="sow-mating-summary"><b>${value(sowCardDate(c.mating))}</b><span>${value(c.matingSet?.length?[...new Set(c.matingSet.map(l=>l.boar).filter(Boolean))].join('・'):c.boar)}</span>${sowReheatBadge(c.reheatCount)}</div></div><div class="sow-card-dates">${c.lastReheatDate?`<div><small>再発情確認</small><b>${value(sowCardDate(c.lastReheatDate))}</b></div>`:''}<div><small>次回再発予定</small><b>${value(sowCardDate(c.reheat))}</b></div><div><small>分娩予定</small><b>${value(sowCardDate(c.due))}</b></div></div><div class="sow-card-results"><div><small>前回の離乳</small><b>${value(sowCardDate(result.wean))}</b><small>出産数－離乳頭数</small><b>${value(String(result.result||(initial?'初':'')).replace(/→|-/g,'－'))}</b></div><div class="sow-card-vaccines"><p>豚熱　${value(c.csf==='済'?'× 接種済':c.csf)}</p><p>${swimgenControl(s.id,c,quick&&!s.numberPending)}</p></div></div></div></div>`;}
function originalCard(s){return sowParityCard(s)+maternalCardButton(s.id);}
function detail(){const s=state.sows[selected];if(!s)return sowList();const r=state.rooms.find(r=>['family','waiting'].includes(r.state)&&r.sowId===s.id);return `<button class="back" data-action="page" data-id="sows">‹ 母豚一覧</button>${simulationSowBadge(s.id)}${TanakaSowParity.pages(db,s.id)[0]?.awaitingMating?'<p class="notice"><b>離乳済み／次回発情待ち</b> · 完了した産次は下の履歴に保存されています。</p>':''}${M.isReheatPending(db,s.id)?'<p class="notice"><b>再種付け待ち</b> · 前回の種付けは不成立。実際に種付けした日に「作業・追記」から記録できます。</p>':''}${nurserySowLocation(s.id)}${sowHistoryTable(s)}<div class="card">${swimgenControl(s.id,TanakaSowParity.pages(db,s.id)[0]?.card,s.active&&!s.numberPending)}</div>${nurseryReturnSowButton(s.id)}${maternalCardButton(s.id)}<details class="sow-history-logs"><summary>個体の作業履歴</summary><h2>個体の履歴</h2><div class="card">${history(db.logs.filter(l=>String(l.id||'').split(/[・,、\s]+/).includes(s.id)))}</div></details><div class="card sow-profile-actions"><span class="badge ${s.numberPending?'orange':s.active?'green':'gray'}">${s.numberPending?'番号未設定の育成母豚':s.active?'現役':'廃豚済み'}</span><p class="${s.numberPending?'gilt-detail-name':'detail-number'}">${esc(s.numberPending?s.giltRegistration.label:s.id)}</p><p class="muted">生年月日：${esc(s.birthDate||(s.giltRegistration?.birthMonth?s.giltRegistration.birthMonth+'月（日付未入力）':'未入力'))}<br>分娩舎：${r?esc(roomName(r)):'母豚の在室なし'}</p><p class="history-note">${esc(s.note)}</p><button class="btn secondary" data-action="profile" data-id="${esc(s.id)}">個体情報を編集</button>${s.active&&!s.numberPending&&!r?`<button class="btn" data-action="waiting-enter" data-id="${esc(s.id)}">分娩舎へ移動</button>`:r?.state==='waiting'?`<button class="btn secondary" data-action="waiting-cancel" data-id="${r.key}">運動場へ戻す</button>`:''}${s.numberPending?`<button class="btn" data-gilt="assign" data-id="${esc(s.id)}">種付け・正式番号を登録</button><button class="btn secondary" data-gilt="note" data-id="${esc(s.id)}">追記</button>`:`<button class="btn" data-action="sow-record" data-id="${esc(s.id)}">作業・追記</button><button class="btn ${s.active?'danger':'secondary'}" data-action="lifecycle" data-id="${esc(s.id)}">${s.active?'廃豚':'現役に戻す'}</button>` }</div>`;}
function rooms(){return `<h2 style="margin-top:0">分娩舎 · 10室</h2><button class="btn secondary ff-entry-button" data-action="page" data-id="forecast">年間予測 · 混雑と暑熱を見る</button><div class="grid rooms-grid" style="margin-top:16px">${sortedFarrowRooms(state.rooms).map(r=>`<section class="card room"><h3><span class="farrowing-room-number">${esc(TanakaSowWork.roomLabel(r))}</span> <span class="badge ${r.state==='family'?'green':r.state==='piglets'?'orange':'gray'}">${names[r.state]}</span></h3>${feedBoxCard(r)}${pigletCareCard(r)}${r.state==='empty'?`<button class="btn secondary" data-action="room-edit" data-id="${r.key}">編集</button>`:''}${r.state==='waiting'?`<button class="btn" data-action="room-birth" data-id="${r.key}">分娩</button><button class="btn secondary" data-action="waiting-cancel" data-id="${r.key}">運動場へ戻す</button>`:r.state!=='empty'?`<button class="btn" data-action="room-record" data-id="${r.key}">${r.state==='family'?'離乳':'育成舎へ移動'}</button>`:`<button class="btn" data-action="room-birth" data-id="${r.key}">分娩・入室</button>`}</section>`).join('')}</div>`;}
function recordWorkspace(){return `<h2>記録の編集・過去記録</h2><p class="muted">記録をタップして日付・母豚・内容を修正できます。分娩・離乳・子豚移動の修正は、在室状態にも反映します。</p><div class="toolbar"><button class="btn" data-action="record" data-id="追記">＋ 記録を追記</button><button class="btn secondary" data-action="export">データ保存</button><button class="btn secondary" data-action="import">データ読込</button><button class="btn secondary" data-action="recovery-export">以前の保存データを取り出す</button></div><label for="filter">母豚番号・記録内容で絞り込み</label><input id="filter" type="search" placeholder="例：512 / 離乳"><div class="card" id="histories" style="margin-top:15px">${history(db.logs)}</div><div class="notice">データはこの端末・このブラウザに保存されます。定期的に「データ保存」で控えを残してください。記録の日付を変更しても、状態への反映順は登録順です。</div>`;}
function records(){return recordWorkspace();}
function edit(){return `<h2 style="margin-top:0">設定</h2>${simulationSettings()}${typeof cloudSettings==='function'?cloudSettings():''}${sowNotebookImportControls()}${recurringRemindersSettings()}${maternalSettings()}${boarSettings()}<h2>画面の色</h2><div class="card theme-picker" role="group" aria-label="画面の色">${Object.entries(THEMES).map(([key,label])=>`<button class="theme-choice" data-action="theme" data-id="${key}" aria-pressed="${theme===key}"><span class="theme-swatch swatch-${key}" aria-hidden="true"></span>${label}${theme===key?' ✓':''}</button>`).join('')}</div>${recordWorkspace()}<p class="app-version" aria-label="アプリのバージョン">クロブタアプリ<br><span>Version ${esc(APP_VERSION)}</span></p>`;}
function boarSettings(){
  const boars=M.boarRecords(db);
  return `<details class="card boar-settings"><summary>種豚管理 · 在籍 ${M.activeBoars(db).length}頭</summary><p class="muted">在籍の種豚だけを全頭数に含めます。廃用・退役後も種付け履歴の名前は残ります。</p>${boars.map(b=>`<div class="row"><div><b>${esc(b.name)}</b><p class="muted">${esc(b.status||'未確認')} ${b.status==='在籍'?'（頭数に含む）':'（頭数に含めない）'}</p></div><button type="button" class="sowlink" data-action="boar-edit" data-id="${esc(b.id)}" aria-label="種豚 ${esc(b.name)}の在籍状態を変更">状態を変更</button></div>`).join('')||'<p>種豚の登録はありません。</p>'}<button type="button" class="btn secondary" data-action="boar-add">種豚を追加</button></details>`;
}
function boarEdit(id=''){
  const existing=id?M.boarRecords(db).find(b=>b.id===id):null;
  if(id&&!existing)throw Error('種豚が見つかりません。');
  const expected=JSON.stringify(M.boarRecords(db)),month=today().slice(0,7),monthExpected=JSON.stringify(db.inventoryMonths?.[month]??null);
  form(existing?'種豚 '+existing.name+'の在籍状態':'種豚を追加',`${field('boarName','種豚名（例：B3）',existing?.name||'','text',true)}<label for="boarStatus">在籍状態</label><select id="boarStatus" name="boarStatus" required><option value="">選択してください</option>${M.BOAR_STATUSES.map(status=>`<option value="${status}" ${existing?.status===status?'selected':''}>${status}</option>`).join('')}</select><p class="muted">頭数に含むのは「在籍」だけです。登録済みの名前は履歴を残すため変更できません。</p>`,'保存する',f=>{
    const record={id:existing?.id||M.uid(),name:String(f.get('boarName')||'').trim(),status:String(f.get('boarStatus')||'')};
    save(d=>{M.setBoar(d,record,expected);I.syncSavedBoars(d,month);});
    inventorySyncBoarDraft(month,monthExpected);
  });
  document.getElementById('boarName').readOnly=!!existing;
}
function render(){
  updateSimulationBanner();
  openPigletCare=page==='rooms'?new Set([...document.querySelectorAll('details.piglet-care[open]')].map(el=>el.dataset.careRoom)):new Set();
  if(fatal){app.innerHTML=`<h2>保存データを読み込めません</h2><div class="notice">${esc(fatal)}<br>保存データは削除していません。</div><button class="btn" data-action="raw-export">元データを保存</button><button class="btn secondary" data-action="recovery-export">以前の保存データを取り出す</button>`;return;}
  app.innerHTML=simulationProgressSummary()+({home,sows:sowList,detail,rooms,nursery,finishing,shipments:shipmentHistory,forecast:farrowingForecastPage,records,edit,schedules,updates,inventory:inventoryPage}[page]||home)()+`<footer>田中畜産<br>確認できていない情報は未入力で表示</footer>`;
  document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.page===(page==='detail'?'sows':page==='shipments'?'finishing':page==='forecast'?'rooms':page)?'page':'false'));
  inventoryQueuePlanRepair();
  inventoryQueueBoarSync();
  queueRemindersInitialization();
  queueMaternalInitialization();
}
function go(p,id){if(p==='detail')sowParitySelection.delete(id);page=p;selected=id||'';render();window.scrollTo(0,0);}
function syncGlobalHomeButtonLayer(){
  const dock=document.getElementById('global-home-dock');if(!dock)return;
  const host=dlg.open?dlg:document.body;if(dock.parentNode!==host)host.appendChild(dock);const banner=document.getElementById('simulation-banner');if(banner&&banner.parentNode!==host)host.appendChild(banner);
}
function installGlobalHomeButton(){
  if(!document.getElementById('global-home-dock'))return;
  if(typeof MutationObserver!=='undefined')new MutationObserver(syncGlobalHomeButtonLayer).observe(dlg,{attributes:true,attributeFilter:['open']});
  dlg.addEventListener('close',syncGlobalHomeButtonLayer);syncGlobalHomeButtonLayer();
}

function form(title,content,submit,action){const session=dataSession;modal.innerHTML=`<h2>${esc(title)}</h2><form id="form">${content}<p class="error" id="form-error" role="alert"></p><button class="btn" type="submit">${esc(submit)}</button><button class="btn secondary" type="button" data-action="close">閉じる</button></form>`;document.getElementById('form').onsubmit=e=>{e.preventDefault();try{if(session!==dataSession)throw Error('モードが切り替わりました。画面を開き直してください。');action(new FormData(e.target));dlg.close();if(submit!=='次へ')toast(simulation?'仮データを変更しました（本番保存なし）':'保存しました');}catch(err){document.getElementById('form-error').textContent=err.message;}};syncHeadcountControls();if(!dlg.open)dlg.showModal();}
function field(name,label,value='',type='text',required=false){
  const count=type==='number'&&/頭数|子豚数/.test(label);
  const input=`<input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${count?'min="0" step="1" inputmode="numeric" placeholder="未入力"':''}>`;
  return `<label for="${name}">${label}</label>`+(count?`<div class="headcount-controls"><button type="button" data-action="headcount-step" data-id="${name}" data-delta="-1" aria-label="${label}を1頭減らす">−1</button>${input}<button type="button" data-action="headcount-step" data-id="${name}" data-delta="1" aria-label="${label}を1頭増やす">＋1</button></div>`:input);
}
function syncHeadcountControls(){
  modal.querySelectorAll('.headcount-controls').forEach(group=>{
    const input=group.querySelector('input'),buttons=group.querySelectorAll('button');
    buttons.forEach(button=>button.disabled=input.disabled||(button.dataset.delta==='-1'&&(input.value===''||Number(input.value)<=Number(input.min||0))));
  });
}
function stepHeadcount(id,delta){
  const input=document.getElementById(id);if(!input||input.disabled)return;
  if(input.value!==''&&(!Number.isInteger(Number(input.value))||Number(input.value)<0))return;
  input.value=String(Math.max(Number(input.min||0),Math.min(input.max===''?Infinity:Number(input.max),Number(input.value||0)+delta)));
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  syncHeadcountControls();
}
function notes(value=''){return `<label for="note">メモ・理由</label><textarea id="note" name="note">${esc(value)}</textarea>`;}
function sowNumberOptions(value='',activeOnly=true){
  const current=String(value??''),sows=Object.values(state.sows).filter(s=>(!s.numberPending||s.id===current)&&(!activeOnly||s.active||s.id===current));
  const items=sows.map(s=>({value:s.id,label:sowIdentityLabel(s.id)+(s.active?'':'（廃豚済み）')}));
  if(current&&!items.some(x=>x.value===current))items.push({value:current,label:current+'（保存済み）'});
  items.sort((a,b)=>a.value.localeCompare(b.value,'ja',{numeric:true})||a.value.localeCompare(b.value));
  return `<option value="" ${current===''?'selected':''}>未選択</option>`+items.map(x=>`<option value="${esc(x.value)}" ${x.value===current?'selected':''}>${esc(x.label)}</option>`).join('');
}
function sowNumberSelect(name,value='',options={}){
  const {id=name,label='母豚番号',ariaLabel=label||'母豚番号',required=false,activeOnly=true}=options;
  return (label?`<label for="${esc(id)}">${esc(label)}</label>`:'')+`<select class="sow-number-select" id="${esc(id)}" name="${esc(name)}" aria-label="${esc(ariaLabel)}" ${required?'required':''}>${sowNumberOptions(value,activeOnly)}</select>`;
}
function sowSelect(value='',activeOnly=true){return sowNumberSelect('id',value,{required:true,activeOnly});}
function countValue(f){const n=f.get('count');if(n===null||n==='')return null;const v=Number(n);if(!Number.isInteger(v)||v<0)throw Error('子豚頭数は0以上の整数で入力してください。');return v;}
function makeLog(type,id,note=''){return {key:M.uid(),origin:'operator',type,id,date:today(),t:new Date().toISOString(),note};}
function profile(id){if(id&&state.sows[id]?.numberPending){editGiltProfile(id);return;}const s=id?state.sows[id]:{};form(id?'個体情報を編集':'新規母豚を追加',`<p class="muted">分からない項目は空欄のまま保存できます。番号を修正すると在室情報と履歴の番号も更新します。</p>${field('id','母豚番号',id||'','text',true)}${field('birthDate','生年月日',s.birthDate,'date')}${sowNumberSelect('mother',s.cardBaseline?.mother||'',{label:'母親番号（不明なら未選択）'})}${notes(s.note)}`,'保存する',f=>{
  const newId=String(f.get('id')).trim();if(!/^\d+$/.test(newId))throw Error('母豚番号は数字で入力してください。');
  save(d=>{if(newId!==id&&d.sows.some(s=>s.id===newId))throw Error('その母豚番号は既に登録されています。');const data={id:newId,breed:s.breed||'バークシャー',birthDate:f.get('birthDate'),note:f.get('note'),cardBaseline:{...M.clone(s.cardBaseline||{}),mother:String(f.get('mother')||'').trim()}};checkMother(newId,data.cardBaseline.mother,id);if(id){const i=d.sows.findIndex(s=>s.id===id);const before=M.clone(d.sows[i]);if(newId!==id){if(d.finishingBaseline)d.finishingBaseline.forEach(r=>{if(r.sowId===id)r.sowId=newId;});d.sows.forEach(other=>{if(other.cardBaseline?.mother===id)other.cardBaseline.mother=newId;});if(d.nurseryBaseline)d.nurseryBaseline.forEach(r=>{if(r.sowId===id)r.sowId=newId;});d.baseline.forEach(r=>{if(r.sowId===id)r.sowId=newId;});d.plans=M.clone(d.plans||M.PLANS);d.plans.forEach(p=>{p[1]=p[1].map(x=>x===id?newId:x);});d.logs.forEach(l=>{l.id=String(l.id||'').split(/([・,、\s]+)/).map(x=>x===id?newId:x).join('');if(l.room?.sowId===id)l.room.sowId=newId;if(l.nursery?.sowId===id)l.nursery.sowId=newId;for(const field of ['sourceBefore','finishingBefore','finishingAfter'])if(l[field]?.sowId===id)l[field].sowId=newId;});}d.logs.push({...makeLog('追記',newId,'個体情報を編集'+(newId!==id?'（番号 '+id+' → '+newId+'）':'')),profileBefore:before,profileAfter:M.clone(data)});d.sows[i]={...d.sows[i],...data};}else{d.sows.push(data);d.logs.push(makeLog('追記',newId,'新規母豚を追加'));}});
  go('detail',newId);
});}
function matingModeField(id){return `<label for="matingMode">登録内容</label><select id="matingMode" name="matingMode"><option value="supplement" ${TanakaSowParity.matingInput(db,id)?'selected':''}>登録済みの種付けに種豚を追加（日付を保持）</option><option value="new" ${!TanakaSowParity.matingInput(db,id)?'selected':''}>新規種付けを記録</option></select>`;}
function bindMatingMode(id,selectSow=false){
  const mode=document.getElementById('matingMode'),date=document.getElementById('date');
  mode.value=TanakaSowParity.matingInput(db,id)?'supplement':'new';
  const update=()=>{const currentId=selectSow?document.getElementById('id').value:id,basis=TanakaSowParity.matingInput(db,currentId);date.disabled=mode.value==='supplement';date.value=mode.value==='supplement'?(basis||''):today();};
  mode.addEventListener('change',update);
  if(selectSow)document.getElementById('id').addEventListener('change',()=>{mode.value=TanakaSowParity.matingInput(db,document.getElementById('id').value)?'supplement':'new';update();});
  update();
}
function quickMating(id){
  const sow=state.sows[id];
  if(sow?.numberPending){assignGiltNumber(id);return;}
  if(!sow?.active||sow.numberPending||![...yardSowList(),...yardGiltList()].some(s=>s.id===id))throw Error('運動場の母豚を選んでください。');
  const basis=db;
  form('母豚 '+sowIdentityLabel(id)+'・種付',matingModeField(id)+`<details class="quick-mating-date"><summary id="quick-mating-date-label">日付 ${esc(sowCardDate(today()))}（変更）</summary>${field('date','種付け日',today(),'date',true)}</details><div id="quick-mating-previous" role="status"></div><fieldset class="quick-mating-boars"><legend>使用した種雄</legend>${M.activeBoars(db).map(boar=>`<label><input type="radio" name="boar" value="${esc(boar.name)}" required><span>${esc(boar.name)}</span></label>`).join('')||'<p>在籍中の種豚がいません。設定の種豚管理から登録してください。</p>'}</fieldset><p id="quick-mating-kind" class="muted"></p>`,'保存',f=>{
    const date=String(f.get('date')||''),boar=String(f.get('boar')||'');
    if(f.get('matingMode')!=='supplement'&&!TanakaForecast.valid(date))throw Error('種付け日を確認してください。');
    if(!M.activeBoars(db).some(b=>b.name===boar))throw Error('使用した種雄を選んでください。');
    if(db!==basis)throw Error('記録が更新されました。開き直してください。');
    if(f.get('matingMode')==='supplement'){save(d=>TanakaSowParity.addBoar(d,id,boar));return;}
    save(d=>{const l={...makeLog('種付け',id),date,boar,remating:false};TanakaSowParity.beforeRecord(d,id,l);d.logs.push(l);});
  });
  bindMatingMode(id);
  const dateInput=document.getElementById('date'),previous=document.getElementById('quick-mating-previous'),kind=document.getElementById('quick-mating-kind');
  const update=()=>{
    const date=dateInput.value;document.getElementById('quick-mating-date-label').textContent='日付 '+sowCardDate(date)+'（変更）';
    if(!TanakaForecast.valid(date)){previous.innerHTML='';kind.textContent='';return;}
    const yesterday=M.addDays(date,-1),records=M.uniqueMatingLogs(db.logs).filter(l=>!l.legacy&&l.type==='種付け'&&l.id===id&&l.date===yesterday);
    previous.innerHTML=records.length?`<p class="notice">${date===today()?'昨日':'前日'}（${esc(sowCardDate(yesterday))}）：<b>${records.map(l=>esc(l.boar||'種雄未入力')).join(' ／ ')}</b></p>`:'';
    if(document.getElementById('matingMode').value==='supplement'){kind.textContent='登録済みの種付け日を保持して、種豚情報だけを追加します。';return;}
    kind.textContent=TanakaSowParity.matingReturnKey(db,id,date)?'同じ産次の「再種付け」として保存します。再発回数は増やしません。':'日付と、実際に使った種雄を保存します。';
  };
  dateInput.addEventListener('change',update);document.getElementById('matingMode').addEventListener('change',update);update();
}
// A room's weaning action already identifies the sow and room. Keep recording direct.
function quickWeaning(roomKey){
  const room=state.rooms.find(r=>r.key===roomKey);
  if(!room||room.state!=='family'||!state.sows[room.sowId]?.active)throw Error('授乳中の母豚がいる部屋を選んでください。');
  const basis=db,day=today(),id=room.sowId;
  form('母豚 '+sowIdentityLabel(id)+'を離乳',`<p><b>分娩舎${esc(TanakaSowWork.roomLabel(room))}</b></p>${field('date','実際の離乳日',day,'date',true)}${field('count','離乳する子豚頭数',room.count??'','number')}<p class="muted">母豚は運動場へ戻り、子豚はこの部屋に残ります。</p><details><summary>メモを追加（任意）</summary>${notes('')}</details><details id="quick-wean-advice"><summary>離乳の判断を見る（任意）</summary><div id="quick-wean-advice-content"></div></details>`,'離乳を記録',f=>{
    if(db!==basis)throw Error('記録が更新されています。この部屋の離乳を開き直してください。');
    const date=String(f.get('date')||'');if(!FF.valid(date)||date>today())throw Error('実際の離乳日を今日以前の日付で入力してください。');
    let log;save(d=>{log=TanakaWeaning.createLog(d,{...makeLog('離乳',id),id,roomKey,date,count:countValue(f),note:String(f.get('note')||'')});TanakaSowParity.beforeRecord(d,id,log);d.logs.push(log);});
    showWorkAction(log,'母豚 '+id+'を離乳しました'+(log.count===null?'':'（子豚'+log.count+'頭）'));
  });
  document.getElementById('date').max=day;
  const details=document.getElementById('quick-wean-advice');
  const updateAdvice=()=>{
    if(!details.open)return;
    const host=document.getElementById('quick-wean-advice-content');
    try{
      if(db!==basis)throw Error('記録が更新されています。離乳を開き直してください。');
      const date=document.getElementById('date').value;if(!FF.valid(date)||date>today())throw Error('実際の離乳日を今日以前の日付で入力してください。');
      const f=ffData(),assessment=FF.nextCorrection(f,id,date);if(!assessment)throw Error('予測に必要な分娩日などを確認してください。');
      host.innerHTML=`<div class="ff-wean-cue ${assessment.level}"><strong>${FF.verdict(assessment.level)}</strong><span>${esc(date)}に離乳した場合 · 授乳${assessment.age??'未確定'}日</span><b>次回サイクル 最大${assessment.peak}/10室</b></div>${ffResponseHtml({id,type:'離乳',date},assessment,true)}`;
    }catch(err){host.innerHTML='<p class="muted">'+esc(err.message)+'</p>';}
  };
  details.addEventListener('toggle',updateAdvice);document.getElementById('date').addEventListener('change',updateAdvice);
}
function record(type='追記',id='',roomKey='',existing=null,forecastChecked=false){
  if(type==='種付け'&&!existing&&state.sows[id]?.numberPending){assignGiltNumber(id);return;}
  if(type==='スイムジェン 実施'&&!existing){changeSwimgen(id,true);return;}
  const requestedRemating=type==='再種付け';if(requestedRemating)type='種付け';
  if(type==='離乳'&&!existing&&!forecastChecked){ffWeanDialog(id,roomKey,true);return;}
  if(existing){type=existing.type;id=existing.id;roomKey=existing.roomKey||'';}
  const weanBasis=db;
  const legacy=!!existing?.legacy,changesRoom=!legacy&&['分娩','離乳','子豚移動'].includes(type),special=['廃豚','現役復帰'].includes(type);
  if(type==='分娩'&&!existing&&!roomKey&&id)roomKey=state.rooms.find(r=>r.state==='waiting'&&r.sowId===id)?.key||'';
  let roomOptions=state.rooms;
  if(!existing&&changesRoom)roomOptions=state.rooms.filter(r=>type==='分娩'?(r.state==='empty'||r.state==='waiting'&&(!id||r.sowId===id)):r.state===(type==='離乳'?'family':'piglets'));
  let content=`<p class="muted">${legacy?'旧版記録です。内容の修正は履歴に反映し、在室状態は変更しません。':special?'状態の変更を履歴に残します。':changesRoom?'保存すると分娩舎の状態も更新します。':'実際に行った日付を入力してください。'}</p>`;
  if(existing&&!legacy&&!existing.profileAfter)content+=`<label for="recordType">記録内容</label><select id="recordType">${M.TYPES.filter(t=>!TanakaFinishing.TYPES.includes(t)&&!['分娩舎へ移動','移動取り消し','分娩舎内移動','分娩舎修正','育成舎修正','育成舎から移動'].includes(t)).map(t=>`<option ${t===type?'selected':''}>${t}</option>`).join('')}</select>`;
  if(legacy)content+=sowNumberSelect('id',id,{label:'母豚番号（保存済みの複数番号も保持）'})+field('type','記録内容',type,'text',true);
  else content+=sowSelect(id,type!=='現役復帰');
  content+=field('date',type==='分娩'?'出産日':type==='離乳'?'実離乳日':'作業日',existing?.date||(existing?.t&&Number.isFinite(Date.parse(existing.t))?existing.t.slice(0,10):today()),'date',true);
  if(changesRoom)content+=`<label for="roomKey">${type==='分娩'?'入室先':'対象の部屋'}</label><select id="roomKey" name="roomKey" required><option value="">選択してください</option>${roomOptions.map(r=>`<option value="${r.key}" ${r.key===roomKey?'selected':''}>${esc(roomName(r))}${r.sowId?' · '+esc(r.sowId):''}</option>`).join('')}</select>`;
  if(!legacy&&type==='分娩')content+=field('birthTime','出産時刻（不明なら空欄）',existing?.birthTime||'','time')+`<p class="muted">頭数は「生存－死産」で記録します。生存頭数が授乳中の子豚数になります。</p><div class="birth-counts"><div>${field('count','生存頭数',existing?.count??'','number',true)}</div><span aria-hidden="true">－</span><div>${field('stillborn','死産頭数（不明なら空欄）',existing?.stillborn??'','number')}</div></div>`;
  if(!legacy&&type==='離乳')content+=field('count','子豚頭数（不明なら空欄）',existing?.count??'','number');
  if(type==='子豚移動'&&!legacy)content+=`<label for="nurseryKey">移動先の育成舎</label><select id="nurseryKey" name="nurseryKey" ${existing&&!existing.nurseryKey?'':'required'}><option value="">${existing?'旧記録：移動先未登録':'選択してください'}</option>${state.nursery.filter(n=>n.state==='empty'||n.key===existing?.nurseryKey).map(n=>`<option value="${n.key}" ${n.key===existing?.nurseryKey?'selected':''}>${esc(nurseryName(n))}</option>`).join('')}</select><p class="muted">全頭を移動し、頭数を引き継ぎます。移動先が未確認の場合は育成舎タブで空きを確認してください。</p>`;
  if(!legacy&&type==='種付け'&&!existing)content+=matingModeField(id);
  if(!legacy&&type==='種付け')content+=field('boar','種雄豚番号（例：B1・B2）',existing?.boar||M.sowCard(db,id).boar||'')+`<label for="matingKind">種付けの区分</label><select id="matingKind" name="matingKind"><option value="normal">通常の種付け</option><option value="return" ${(existing?.remating||!existing&&(requestedRemating||M.isReheatPending(db,id)))?'selected':''}>再発情後の種付け</option></select><p class="muted">実際に種付けした日を記録します。再発情確認とは別に保存し、同じ産次の予定を更新します。</p>`;
  if(type==='種付け'&&!existing)content+='<div id="ff-breeding-verdict"></div>';
  if(type==='再発情確認'&&!existing)content+='<p class="notice">再発情を確認した事実だけを保存します。再発回数を1回増やし、再種付け待ちにします。種付けは実施したときに別操作で記録できます。</p>';
  content+=notes(existing?.note||'');
  form(existing?'記録を修正':(type==='分娩'?'母豚 '+id+' · 分娩':type==='子豚移動'?'育成舎へ移動':type)+'',content,existing?'修正を保存':type==='再発情確認'?'保存':'記録する',f=>{
    const selectedRoom=state.rooms.find(r=>r.key===f.get('roomKey')),target=type==='子豚移動'&&(selectedRoom?.mixed||existing?.id==='')?'':f.get('id');if(!legacy&&!state.sows[target]&&!(type==='子豚移動'&&(selectedRoom?.mixed||existing?.id==='')))throw Error('登録済みの母豚を選んでください。');
    if(!legacy&&type==='種付け'&&!existing&&f.get('matingMode')==='supplement'){save(d=>TanakaSowParity.addBoar(d,target,String(f.get('boar')||'')));return;}
    let l={...(existing||makeLog(type,target)),id:target,date:f.get('date'),note:f.get('note'),type:legacy?String(f.get('type')).trim():type};
    if(type==='離乳'&&!legacy){if(!existing){if(db!==weanBasis)throw Error('記録が更新されています。離乳ボタンから判定を確認し直してください。');if(!FF.valid(String(f.get('date')||''))||f.get('date')>today())throw Error('実際の離乳日を今日以前の日付で入力してください。');if(target!==id||f.get('roomKey')!==roomKey)throw Error('母豚・部屋が変わっています。離乳ボタンから判定を確認し直してください。');l=TanakaWeaning.createLog(db,{id:target,roomKey:f.get('roomKey'),date:f.get('date'),operator:f.get('operator'),count:countValue(f),note:f.get('note'),key:l.key,t:l.t});}else{l.operator=String(f.get('operator')||existing.operator||'').trim();if(FF.valid(l.birthDate))l.nursingDays=FF.distance(l.birthDate,l.date);}}
    if(!l.type)throw Error('記録内容を入力してください。');
    if(!legacy&&type==='種付け'){l.boar=String(f.get('boar')||'').trim();l.remating=f.get('matingKind')==='return';}
    if(type==='子豚移動'&&!legacy){l.nurseryKey=f.get('nurseryKey')||'';if(!existing&&!l.nurseryKey)throw Error('移動先の育成舎を選んでください。');}
    if(type==='分娩'&&!legacy){l.birthTime=f.get('birthTime')||'';const value=f.get('stillborn');l.stillborn=value===null||value===''?null:Number(value);if(l.stillborn!==null&&(!Number.isInteger(l.stillborn)||l.stillborn<0))throw Error('死産頭数は0以上の整数で入力してください。');}
    if(type==='分娩'&&!existing&&selectedRoom?.state==='waiting'){l.fromWaiting=true;l.waitingEntryKey=selectedRoom.entryKey||'';}
    if(changesRoom)l.roomKey=f.get('roomKey');if(!legacy&&['分娩','離乳'].includes(type))l.count=countValue(f);
    if(!existing&&page==='detail')sowParitySelection.delete(target);
    save(d=>{if(existing){M.assertUniqueMating(d,l,existing.key);const i=d.logs.findIndex(x=>x.key===existing.key);const old=M.clone(d.logs[i]);delete old.revisions;l.updatedAt=new Date().toISOString();l.revisions=[...(d.logs[i].revisions||[]),old];d.logs[i]=l;TanakaSowParity.afterMatingEdit(d,old,l);}else{TanakaSowParity.beforeRecord(d,target,l);d.logs.push(l);}});
  });
  if(type==='種付け'&&!existing){bindMatingMode(id,true);const update=()=>{const id=document.getElementById('id').value,date=document.getElementById('date').value,host=document.getElementById('ff-breeding-verdict');if(document.getElementById('matingMode').value==='supplement'){host.innerHTML='';return;}try{const f=ffData(),c=FF.compare(f,id,date);host.innerHTML=`<div class="ff-wean-cue ${c.level}"><strong>${FF.verdict(c.level)}</strong><span>今日または選択日の種付けによる収容・暑熱予測</span></div><details><summary>予測日付と理由を見る</summary>${ffComparisonCard(f,{...c,label:'今回の種付け'})}<p>種付けは発情確認を優先してください。大きな調整は次の発情を1周期（約21日）見送る案で検討します。日付は自動変更しません。</p></details>`;}catch(err){host.innerHTML=`<p class="notice">注意 · ${esc(err.message)}</p>`;}};document.getElementById('id').addEventListener('change',update);document.getElementById('date').addEventListener('change',update);document.getElementById('matingMode').addEventListener('change',update);update();}
  const typeSelect=document.getElementById('recordType');if(typeSelect)typeSelect.onchange=()=>{const draft={...existing,type:typeSelect.value,id:document.getElementById('id').value,date:document.getElementById('date').value,note:document.getElementById('note').value,roomKey:document.getElementById('roomKey')?.value||''};record(draft.type,draft.id,draft.roomKey,draft);};
  if(type==='離乳'&&!existing){document.getElementById('date').max=today();document.getElementById('id').setAttribute('aria-readonly','true');}
  showRevisions(existing);
  if(changesRoom){const select=document.getElementById('roomKey');select.onchange=()=>{const r=state.rooms.find(r=>r.key===select.value);const mixed=type==='子豚移動'&&(existing?existing.id==='':!!r?.mixed),mother=document.getElementById('id');mother.disabled=mixed;mother.required=!mixed;if(!existing&&r?.sowId){mother.innerHTML=sowNumberOptions(r.sowId);mother.value=r.sowId;}};select.onchange();}
}
function editRoom(key,existing=null){const r=existing?{...existing.room,key}:state.rooms.find(r=>r.key===key);form(existing?'分娩舎の修正記録を編集':roomName(r)+'を編集',`<p class="muted">確認できた内容を入力してください。</p><label for="roomState">在室状態</label><select id="roomState" name="state">${Object.entries(names).map(([s,n])=>`<option value="${s}" ${r.state===s?'selected':''}>${n}</option>`).join('')}</select>${sowSelect(r.sowId)}${r.state==='piglets'?`<label for="pigletMixed">子豚の区分</label><select id="pigletMixed" name="pigletMixed"><option value="single" ${!r.mixed?'selected':''}>同じ母豚の子</option><option value="mixed" ${r.mixed?'selected':''}>混成</option></select>${field('birthDate','生まれた月日（混成は一番若い子）',r.birthDate||'','date')}`:''}${r.state==='family'?field('birthDate','出産日',r.birthDate||roomBirthDate(r)||'','date'):''}${['family','piglets'].includes(r.state)?field('birthCount','出生頭数（不明なら空欄）',existing?.room?.birthCount??roomBirthCount(r)??'','number'):''}${field('count','子豚頭数（不明なら空欄）',r.count??'','number')}${field('date','確認日',existing?.date||today(),'date',true)}${notes(existing?.note||'')}`,'保存する',f=>{
  const st=f.get('state'),mixed=st==='piglets'&&f.get('pigletMixed')==='mixed',sowId=st==='empty'||mixed?'':f.get('id'),room={label:r.label||'',state:st,sowId,mixed,birthDate:st==='empty'?'':(f.get('birthDate')??r.birthDate??''),count:['empty','waiting'].includes(st)?null:countValue(f)};
  if(['family','piglets'].includes(st)){const n=f.get('birthCount');room.birthCount=n===null||n===''?null:Number(n);if(room.birthCount!==null&&(!Number.isInteger(room.birthCount)||room.birthCount<0))throw Error('出生頭数は0以上の整数で入力してください。');}
  if(st!=='empty'&&!mixed&&!sowId)throw Error('母豚番号を選んでください。子豚のみの場合は、その母豚番号を選びます。');
  save(d=>{const l={...(existing||makeLog('分娩舎修正',sowId)),id:sowId,roomKey:key,room,date:f.get('date'),note:f.get('note')};if(existing){const i=d.logs.findIndex(x=>x.key===existing.key),old=M.clone(d.logs[i]);delete old.revisions;l.updatedAt=new Date().toISOString();l.revisions=[...(d.logs[i].revisions||[]),old];d.logs[i]=l;TanakaSowParity.afterMatingEdit(d,old,l);}else d.logs.push(l);});
});showRevisions(existing);const select=document.getElementById('roomState');const change=()=>{const empty=select.value==='empty',group=document.getElementById('pigletMixed'),mixed=select.value==='piglets'&&group?.value==='mixed';document.getElementById('id').required=!empty&&!mixed;document.getElementById('id').disabled=empty||mixed;document.getElementById('count').disabled=empty||select.value==='waiting';if(group)group.disabled=select.value!=='piglets';const birth=document.getElementById('birthDate');if(birth)birth.disabled=empty;};select.onchange=change;const group=document.getElementById('pigletMixed');if(group)group.onchange=change;change();}
function showRevisions(l){if(!l)return;let html=['edit','records'].includes(page)?`<button class="btn danger" type="button" data-action="delete-log" data-id="${esc(l.key)}">この記録を削除</button>`:'';if(l.profileAfter)html+=`<details><summary>個体情報の変更内容</summary><p class="muted history-note">変更前：${esc(JSON.stringify(l.profileBefore))}<br>変更後：${esc(JSON.stringify(l.profileAfter))}</p></details>`;if(l.revisions?.length)html+=`<details><summary>修正前の記録（${l.revisions.length}件）</summary>${l.revisions.map(r=>`<p class="muted history-note">${esc(dateText(r))} · ${esc(r.id)} · ${esc(r.type)}<br>${esc(r.note)}${r.count!=null?'<br>子豚 '+r.count+'頭':''}${r.room?'<br>'+esc(names[r.room.state])+' · '+esc(r.room.label||'部屋未設定'):''}</p>`).join('')}</details>`;if(html)modal.insertAdjacentHTML('beforeend',html);}
function deleteLog(key){
  const l=db.logs.find(x=>x.key===key);if(!l)return;
  if(!window.confirm(`${l.id||'分娩舎'}　${l.type}（${dateText(l)}）を削除しますか？\n最近の更新と個体の履歴からも消え、分娩舎の状態は残った記録から再計算されます。個体情報の編集記録は履歴のみ削除し、個体情報は変更しません。`))return;
  try{
    save(d=>{const i=d.logs.findIndex(x=>x.key===key);if(i<0)throw Error('記録が見つかりません。');const removed=d.logs.splice(i,1)[0];d.deletedLogs=d.deletedLogs||[];d.deletedLogs.push({...removed,deletedAt:new Date().toISOString()});});
    dlg.close();toast('記録を削除しました');
  }catch(e){document.getElementById('form-error').textContent='削除できません：'+e.message+' 関連する後の記録を先に修正または削除してください。';}
}
function download(text,name){if(simulation){toast('シミュレーション中はJSONを出力しません');return;}const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function importData(){if(simulation){toast('シミュレーション中はJSONの保存・読込を停止しています');return;}form('保存データを読み込む',`<div class="notice">選んだデータに置き換えます。現在のデータは読み込み前の控えとして保存します。</div><label for="file">保存したJSONファイル</label><input id="file" type="file" accept=".json,application/json" required><div id="import-summary" class="muted"></div>`,'このデータに置き換える',()=>{if(simulation)throw Error('シミュレーションを終了してから読み込んでください。');if(!pending)throw Error('有効なファイルを選んでください。');localStorage.setItem('tanaka-db-before-import',JSON.stringify(db));localStorage.setItem(KEY,JSON.stringify(pending));db=pending;state=M.replay(db);render();if(typeof cloudStore!=='undefined')cloudStore.localChanged();});let pending=null;document.getElementById('file').onchange=async e=>{pending=null;try{const file=e.target.files[0];if(!file)return;const next=M.migrate(JSON.parse(await file.text()));document.getElementById('import-summary').textContent=`母豚 ${next.sows.length}頭・記録 ${next.logs.length}件。内容を確認してから保存してください。`;pending=next;document.getElementById('form-error').textContent='';}catch(e){document.getElementById('form-error').textContent=e.message;}};}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.page){if(!fatal)go(b.dataset.page);return;}
  const a=b.dataset.action,id=b.dataset.id;
  if(a==='simulation-start'||a==='simulation-end'){try{if(a==='simulation-start')startSimulation();else endSimulation();}catch(err){toast(err.message);}return;}
  if(simulation&&['export','import','raw-export','recovery-export'].includes(a)){toast('シミュレーション中はJSONの保存・読込を停止しています');return;}
  if(a==='page'&&simulation&&b.closest('#simulation-banner')){dlg.close();go(id);return;}
  if(a==='global-home'){try{if(typeof navigator.vibrate==='function')navigator.vibrate(15);}catch{}if(dlg.open)dlg.close();go('home');document.querySelector('.home-app')?.focus({preventScroll:true});return;}
  if(a==='headcount-step'){stepHeadcount(id,Number(b.dataset.delta));return;}
  if(a==='piglet-check'){try{save(d=>M.setPigletCheck(d,id,b.dataset.care));}catch(err){toast(err.message);}return;}
  if(a==='theme'&&THEMES[id]){try{if(!simulation)localStorage.setItem('tanaka-theme',id);theme=id;applyTheme();render();}catch(e){toast('色の設定を保存できませんでした');}return;}
  if(a==='close'){dlg.close();return;}
  if(a==='recovery-export'){exportRecovery();return;}
  if(a==='raw-export'){download(localStorage.getItem(KEY)||'null','tanaka-original-data.json');return;}
  if(fatal)return;
  if(a==='page')go(id);if(a==='detail')go('detail',id);if(a==='add')profile();if(a==='profile')profile(id);if(a==='card-edit')editOriginalCard(id);
  if(a==='quick-mating')quickMating(id);
  if(a==='boar-add'||a==='boar-edit'){try{boarEdit(a==='boar-edit'?id:'');}catch(err){toast(err.message);}return;}
  if(a==='record')record(id);if(a==='sow-record'){form('母豚 '+id+'の作業',`<label for="type">記録内容</label><select id="type" name="type">${['種付け','分娩','離乳','子豚移動','再発情確認','再種付け','スイムジェン 実施','バイコックス 実施','レシュピシュア 実施','フォステラ 実施','追記'].map(t=>`<option>${t}</option>`).join('')}</select>`,'次へ',f=>{setTimeout(()=>record(f.get('type'),id),0);});}
  if(a==='cancel-scheduled')cancelScheduled(id);
  if(a==='scheduled-record'){if(b.dataset.type==='分娩舎へ移動')enterWaiting(id);else record(b.dataset.type,id);}
  if(a==='lifecycle')record(state.sows[id].active?'廃豚':'現役復帰',id);
  if(a==='room-edit')editRoom(id);if(a==='room-group')roomGroup(id);
  if(a==='wean-days'){try{save(d=>TanakaSowParity.setWeanDays(d,{id:b.dataset.sow,roomKey:id,birthDate:b.dataset.birth||'',days:Number(b.dataset.days)+Number(b.dataset.delta),expectedDays:Number(b.dataset.days)}));}catch(err){toast(err.message);}return;}
  if(a==='room-record'){const r=state.rooms.find(r=>r.key===id);if(r?.state==='family')quickWeaning(id);else if(r?.state==='piglets')record('子豚移動',r.sowId,id);else toast('部屋の状態が変わりました。開き直してください。');}
  if(a==='waiting-enter')enterWaiting(id);if(a==='waiting-cancel')cancelWaiting(id);
  if(a==='room-birth'){const r=state.rooms.find(x=>x.key===id);record('分娩',r.state==='waiting'?r.sowId:'',id);}
  if(a==='plan'){form('予定の実施',`<p class="muted">対象の母豚を1頭ずつ記録します。</p><label for="target">母豚番号</label><select id="target" name="target" required><option value="">未選択</option>${id.split(',').sort((a,b)=>a.localeCompare(b,'ja',{numeric:true})).map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select>`,'次へ',f=>{setTimeout(()=>record('スイムジェン 実施',f.get('target')),0);});}
  if(a==='nursery-edit')editNursery(id);if(a==='nursery-out')nurseryOut(id);
  if(a==='log'){const l=db.logs.find(l=>l.key===id);if(l&&TanakaNurseryYard.TYPES.includes(l.type)){nurseryMovementLog(l);return;}if(l?.action?.kind==='swimgen-status'){sowWorkLog(l);return;}if(l&&TanakaFinishing.TYPES.includes(l.type)){finishingRecord(l);return;}if(l?.type==='分娩舎へ移動'||l?.type==='移動取り消し')waitingLog(l);else if(l?.type==='分娩舎内移動')roomGroup(l.roomKey,l);else if(l?.type==='育成舎修正')editNursery(l.nurseryKey,l);else if(l?.type==='育成舎から移動')nurseryOut(l.nurseryKey,l);else if(l?.type==='分娩舎修正'&&!l.legacy)editRoom(l.roomKey,l);else if(l)record(l.type,l.id,l.roomKey,l);}
  if(a==='delete-log'&&['edit','records'].includes(page))deleteLog(id);
  if(a==='export')download(JSON.stringify(db,null,2),'tanaka-data-'+today()+'.json');if(a==='import')importData();
});
document.addEventListener('input',e=>{if(e.target.closest('.headcount-controls'))syncHeadcountControls();if(e.target.id==='filter'){const q=e.target.value.trim();document.getElementById('histories').innerHTML=history(db.logs.filter(l=>`${l.id} ${l.type} ${l.note||''} ${dateText(l)}`.includes(q)));}});
function network(){if(typeof updateCloudBadge==='function'){updateCloudBadge();return;}document.getElementById('network').textContent=navigator.onLine?'端末保存':'オフライン';}window.addEventListener('online',network);window.addEventListener('offline',network);network();
window.addEventListener('storage',e=>{if(simulation)return;if(e.key===KEY){try{db=M.migrate(JSON.parse(e.newValue));state=M.replay(db);fatal='';dlg.close();render();toast('別画面の更新を反映しました');}catch(err){fatal=err.message;render();}}});
installGlobalHomeButton();
render();
if('serviceWorker' in navigator&&location.protocol!=='file:'){
  let reloading=false;const hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!reloading){reloading=true;if(dlg.open){toast('更新があります。保存してからアプリを開き直してください');}else location.reload();}});
  navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>toast('オフライン準備を完了できませんでした。通信状態を確認してください'));
}



function nurseryByAge(rows){return rows.slice().sort((a,b)=>{const occupied=(a.state==='occupied'?0:1)-(b.state==='occupied'?0:1);if(occupied)return occupied;const x=a.state==='occupied'?a.birthDate||'':'',y=b.state==='occupied'?b.birthDate||'':'';return x&&y?x.localeCompare(y):x?-1:y?1:0;});}
function nurseryName(n){const group=n.state?n:state.nursery.find(r=>r.key===n.key)||n;if(group.state==='empty')return '空き';if(group.state==='unknown')return '在室未確認';const identity=group.mixed||group.sowId==='混成'?'混成':group.sowId?'母豚 '+group.sowId:'母豚番号未入力';return identity+(group.birthDate?' · '+sowCardDate(group.birthDate)+'生まれ':'');}
function nurseryHome(){
  const ns=nurseryByAge(state.nursery),occupied=ns.filter(n=>n.state==='occupied'),unknown=ns.filter(n=>n.state==='unknown').length;
  const chips=xs=>xs.map(n=>`<button class="sowlink room-summary" data-action="nursery-edit" data-id="${n.key}" aria-label="育成舎 ${esc(nurseryName(n))}を編集"><span>${n.state==='occupied'?(n.mixed?'混成':n.sowId?esc(n.sowId):'母豚番号未入力'):nurseryName(n)}</span><small>${n.state==='occupied'?'子豚 '+(n.count===null?'頭数未入力':esc(n.count)+'頭'):nurseryNames[n.state]}</small></button>`).join('');
  return `<h2>育成舎</h2><div class="card"><div class="row"><div><b>育成子豚</b><div>${chips(occupied)||'<span class="muted">なし</span>'}</div></div><b>${occupied.length}室</b></div>${unknown?`<div class="row"><div><b>未確認</b><div>${chips(ns.filter(n=>n.state==='unknown'))}</div></div><b>${unknown}室</b></div>`:''}</div>`;
}
function nursery(){return simulationWaitingList('nursery')+`<h2 style="margin-top:0">育成舎 · 5室</h2><p class="muted">滞在は約1か月。誕生日が古い順に表示しています。</p><div class="grid rooms-grid">${nurseryByAge(state.nursery).map(n=>`<section class="card room"><h3>${esc(TanakaNurseryYard.roomName(n))} <span class="badge">${nurseryNames[n.state]}</span></h3>${simulationGroupBadge('nursery',n.key)}${n.state==='occupied'?`<p>${n.mixed?'混成':n.sowId?esc(n.sowId):'母豚番号未入力'}</p><p class="nursery-count">${n.count===null?'頭数未入力':esc(n.count)+'頭'}</p><p class="muted">生まれた月日：${esc(n.birthDate?n.birthDate.replaceAll('-','/'):'未入力')}</p>`:`<p class="muted">${n.state==='unknown'?'在室状態を確認してください':'入室なし'}</p>`}<button class="btn secondary" data-action="nursery-edit" data-id="${n.key}">編集</button>${n.state==='occupied'?`<button class="btn" data-action="nursery-out" data-id="${n.key}">肉豚舎へ移動</button><button type="button" class="btn secondary" data-action="nursery-individual-out" data-id="${n.key}">対象個体1頭を運動場へ</button>${nurseryIdentifiedSummary(n)}`:''}</section>`).join('')}</div><p class="muted">「肉豚舎へ移動」から、移動先の空室を選んで移動できます。</p>`;}
function nurserySave(l,existing){save(d=>{if(existing){M.assertUniqueMating(d,l,existing.key);const i=d.logs.findIndex(x=>x.key===existing.key),old=M.clone(d.logs[i]);delete old.revisions;l.revisions=[...(d.logs[i].revisions||[]),old];l.updatedAt=new Date().toISOString();d.logs[i]=l;TanakaSowParity.afterMatingEdit(d,old,l);}else d.logs.push(l);});}
function editNursery(key,existing=null){const n=existing?existing.nursery:state.nursery.find(n=>n.key===key);form(existing?'育成舎の記録を修正':'育成舎 · '+nurseryName(n)+'を編集',`<label for="ns">在室状態</label><select id="ns" name="state">${Object.entries(nurseryNames).map(([v,t])=>`<option value="${v}" ${n.state===v?'selected':''}>${t}</option>`).join('')}</select><label for="groupType">子豚の区分</label><select id="groupType" name="groupType"><option value="single" ${!n.mixed?'selected':''}>同じ母豚の子</option><option value="mixed" ${n.mixed?'selected':''}>混成</option></select>${sowNumberSelect('mother',n.sowId,{label:'母豚番号（不明なら未選択）'})}<p class="muted">混成は母豚番号なし。生まれた月日は、一番若い子の誕生日を入力してください。</p>${field('count','子豚頭数（不明なら空欄）',n.count??'','number')}${field('birthDate','生まれた月日（不明なら空欄）',n.birthDate||'','date')}<label for="nurseryCsf">豚熱ワクチン</label><select id="nurseryCsf" name="nurseryCsf"><option value="false">未</option><option value="true" ${n.csf?'selected':''}>済</option></select>${field('date','確認日',existing?.date||today(),'date',true)}${notes(existing?.note??n.groupNote??'')}`,'保存する',f=>{const st=f.get('state'),occupied=st==='occupied',mixed=occupied&&f.get('groupType')==='mixed',mother=mixed?'':String(f.get('mother')||'').trim();if(occupied&&mother&&!/^\d+$/.test(mother))throw Error('母豚番号は数字で入力してください。');const l={...(existing||makeLog('育成舎修正',mother)),id:occupied?mother:'',nurseryKey:key,date:f.get('date'),note:f.get('note'),nursery:{state:st,mixed,sowId:occupied?mother:'',count:occupied?countValue(f):null,entered:occupied?(n.entered||''):'',birthDate:occupied?f.get('birthDate'):'',csf:occupied&&f.get('nurseryCsf')==='true',weight:n.weight??30,kind:n.kind||'肉豚'}};nurserySave(l,existing);});showRevisions(existing);const select=document.getElementById('ns'),change=()=>{const occupied=select.value==='occupied';for(const id of ['groupType','count','birthDate','nurseryCsf'])document.getElementById(id).disabled=!occupied;document.getElementById('mother').disabled=!occupied||document.getElementById('groupType').value==='mixed';syncHeadcountControls();};select.onchange=change;document.getElementById('groupType').onchange=change;change();}
function nurseryOut(key,existing=null){if(!existing){finishingMoveMode=true;finishingPreferred=key;go('finishing');toast('移動先の空室をタップしてください');return;}const n=state.nursery.find(n=>n.key===key);form('肉豚舎へ移動',`<p>このグループの子豚を全頭移動し、育成舎を空きにします。</p>${field('date','移動日',existing?.date||today(),'date',true)}${notes(existing?.note||'')}`,'記録する',f=>nurserySave({...existing,...(existing?{}:makeLog('育成舎から移動',n.sowId)),nurseryKey:key,date:f.get('date'),note:f.get('note'),count:existing?.count??n.count,mixed:existing?!!existing.mixed:!!n.mixed},existing));showRevisions(existing);}

function roomGroup(key,existing=null){
  const r=state.rooms.find(x=>x.key===key),targets=state.rooms.filter(x=>x.key!==key&&(['empty','piglets'].includes(x.state)||existing?.targetRoomKey===x.key));
  const sourceDate=existing?.sourceBirthDate??roomBirthDate(r);
  form(existing?'分ける・混ぜる記録を修正':'子豚を分ける・混ぜる',`<p class="muted">${esc(roomName(r))}から移動します。生まれた月日は自動で引き継ぎ、混成は一番若い子を基準にします。</p><label for="targetRoomKey">移動先</label><select id="targetRoomKey" name="targetRoomKey" required><option value="">選択してください</option>${targets.map(x=>`<option value="${x.key}" ${existing?.targetRoomKey===x.key?'selected':''}>${esc(roomName(x))} · ${x.state==='empty'?'空き':x.mixed?'混成':esc(x.sowId)}${x.state==='piglets'?' · '+(x.count===null?'頭数未入力':x.count+'頭'):''}</option>`).join('')}</select>${field('count','移動する子豚数',existing?.count??'','number',true)}<div id="source-birth-field" ${!existing&&sourceDate?'hidden':''}>${field('sourceBirthDate','移動元の生まれた月日（未入力のため必要）',sourceDate,'date',true)}</div><div id="target-birth-field" ${!existing?'hidden':''}>${field('targetBirthDate','移動先の生まれた月日（未入力のため必要）',existing?.targetBirthDate??'','date')}</div>${existing?field('date','作業日',existing.date,'date',true):''}${notes(existing?.note||'')}`,'記録する',f=>{
    const target=state.rooms.find(x=>x.key===f.get('targetRoomKey'));if(!target)throw Error('移動先を選んでください。');
    const l={...(existing||makeLog('分娩舎内移動',r.sowId)),roomKey:key,targetRoomKey:target.key,count:countValue(f),sourceBirthDate:existing?f.get('sourceBirthDate'):(roomBirthDate(r)||f.get('sourceBirthDate')||''),targetBirthDate:existing?f.get('targetBirthDate'):(target.state==='piglets'?(roomBirthDate(target)||f.get('targetBirthDate')||''):''),date:existing?f.get('date'):today(),note:f.get('note')};
    save(d=>{if(existing){M.assertUniqueMating(d,l,existing.key);const i=d.logs.findIndex(x=>x.key===existing.key),old=M.clone(d.logs[i]);delete old.revisions;l.revisions=[...(d.logs[i].revisions||[]),old];l.updatedAt=new Date().toISOString();d.logs[i]=l;TanakaSowParity.afterMatingEdit(d,old,l);}else d.logs.push(l);});
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

const cardFields=[['birth','生年月日（元の表記）'],['parity','産次（出産回数）'],['mother','母親番号'],['boar','種豚'],['mating','種付け日'],['reheat','次回再発予定'],['due','分娩予定日'],['wean','前回離乳日'],['result','前回成績（出生→離乳）'],['csf','豚熱'],['swimgen','スイムジェン'],['reheatCount','確認済み再発情回数']];
function editOriginalCard(id){
  const sow=db.sows.find(s=>s.id===id),card=sow?.cardBaseline;if(!card)return;
  const rows=[...(card.history||[]),{date:'',event:'',boar:''}];
  form('母豚 '+id+' · 元記録・過去成績を編集',`<p class="muted">元カードの情報を修正できます。日付は元の表記（例：6/8）のまま入力できます。アプリで記録した分娩・離乳は「編集」から変更してください。</p>${cardFields.map(([key,label])=>key==='mother'?sowNumberSelect('card_'+key,card[key]??'',{label}):field('card_'+key,label,card[key]??'')).join('')}<h3>元カードの過去履歴</h3><p class="muted">追加は一番下の空欄へ。削除する行は3項目を空欄にしてください。</p>${rows.map((r,i)=>`<fieldset><legend>履歴 ${i+1}</legend>${field('history_date_'+i,'月日',r.date)}${field('history_event_'+i,'内容',r.event)}${field('history_boar_'+i,'種豚',r.boar||'')}</fieldset>`).join('')}`,'保存する',f=>{
    const next=M.clone(card);for(const [key] of cardFields){const value=String(f.get('card_'+key)||'').trim();if(['parity','reheatCount'].includes(key)&&value!==''&&!/^\d+$/.test(value))throw Error('産次・再発情回数は0以上の整数で入力してください。');next[key]=['parity','reheatCount'].includes(key)&&value!==''?Number(value):value;}
    checkMother(id,next.mother);
    next.history=rows.map((r,i)=>({...r,date:String(f.get('history_date_'+i)||'').trim(),event:String(f.get('history_event_'+i)||'').trim(),boar:String(f.get('history_boar_'+i)||'').trim()})).filter(r=>r.date||r.event||r.boar);
    if(next.history.some(r=>!r.date||!r.event))throw Error('履歴の月日と内容を入力してください。');
    if(JSON.stringify(next)===JSON.stringify(card))return;
    save(d=>{const target=d.sows.find(s=>s.id===id);target.cardBaselineOriginal=target.cardBaselineOriginal||M.clone(target.cardBaseline);target.cardRevisions=target.cardRevisions||[];target.cardRevisions.push({date:today(),t:new Date().toISOString(),before:M.clone(target.cardBaseline),after:M.clone(next)});target.cardBaseline=next;d.logs.push({...makeLog('追記',id,'母豚カードの元記録・過去成績を編集'),cardBefore:M.clone(card),cardAfter:M.clone(next)});});
  });
}

function sowDue(id){return M.schedules(db,today()).find(x=>x.id===id&&x.type==='分娩')?.date||state.sows[id]?.cardBaseline?.due||'予定日未入力';}

function cancelScheduled(key){const l=db.logs.find(x=>x.key===key);if(!l)return;if(l.type==='分娩舎へ移動'){if(!state.rooms.some(r=>r.key===l.roomKey&&r.state==='waiting'&&r.entryKey===l.key)){toast('この移動は現在の分娩待ちと一致しません');return;}cancelWaiting(l.roomKey);return;}if(l.type==='スイムジェン 実施'){changeSwimgen(l.id,false);return;}form('実施を取り消す',`<p>母豚 ${esc(sowIdentityLabel(l.id))} · ${esc(recordTitle(l))}を取り消し、未実施に戻します。</p><p class="muted">頭数・在室状態も取り消し前に戻ります。後の記録と矛盾する場合は取消できません。</p>`,'取消する',()=>save(d=>{const i=d.logs.findIndex(x=>x.key===key);if(i<0)throw Error('対象の記録が見つかりません。');const removed=d.logs.splice(i,1)[0];d.deletedLogs=d.deletedLogs||[];d.deletedLogs.push({...removed,deletedAt:new Date().toISOString(),reason:'予定の実施を取消'});}));}

function dueMonthDay(id){const raw=sowDue(id),match=/^(?:\d{4}-)?(\d{1,2})[-/](\d{1,2})$/.exec(raw);return match?Number(match[1])+'月'+Number(match[2])+'日':raw;}

// Display only: calendar-day difference from the existing due date, using virtual today in simulation.
function farrowingOverdueBadge(room){
  if(room.state!=='waiting'||room.mixed||!room.sowId)return '';
  const raw=sowDue(room.sowId),day=today(),card=TanakaSowParity.pages(db,room.sowId)[0]?.card||{};
  const mating=M.matingSet(db.logs.filter(l=>l.id===room.sowId))[0]?.date;
  const due=FF.valid(raw)?raw:FF.normalizeDate(raw,mating?FF.add(mating,114):'');
  if(!FF.valid(due)||!FF.valid(day))return '';
  const actual=FF.normalizeDate(card.birthDateActual,FF.add(due,7));
  // A previous parity's birth must not hide the current pregnancy's badge.
  if(actual&&actual>=FF.add(due,-114))return '';
  const days=FF.distance(due,day);if(days<=0)return '';
  const basis=`計算基準：${day} − 分娩予定日 ${due}（暦日）${simulation?'・シミュレーション日付':''}`;
  return `<span class="farrowing-overdue-badge${days>=10?' is-late':''}" aria-label="分娩予定日を${days}日超過。${esc(basis)}" title="${esc(basis)}">+${days}</span>`;
}

function roomBirthDate(room){return M.roomBirthDate(db,room);}

function recoveryEntries(storage){const entries=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&(/^(tanaka(?:[-_]|$)|T[YC]\d)/i.test(key)))entries.push({key,raw:storage.getItem(key)});}return entries.sort((a,b)=>a.key.localeCompare(b.key));}
function exportRecovery(){if(simulation){toast('シミュレーションを終了してから取り出してください');return;}try{const entries=recoveryEntries(localStorage);if(!entries.length){toast('このブラウザにはアプリの保存データが見つかりません');return;}download(JSON.stringify({format:'tanaka-recovery-export',version:1,exportedAt:new Date().toISOString(),entries},null,2),'tanaka-recovery-'+today()+'.json');toast('確認用ファイルを保存しました。今の記録は変更していません');}catch(e){toast('取り出せません：'+e.message);}}

function sortedFarrowRooms(rooms){
  const dates=new Map(rooms.map(r=>[r.key,r.state==='waiting'||r.state==='empty'?'':roomBirthDate(r)]));
  const rank=r=>r.state==='empty'?3:r.state==='waiting'?2:dates.get(r.key)?0:1;
  return rooms.slice().sort((a,b)=>rank(a)-rank(b)||(dates.get(a.key)||'').localeCompare(dates.get(b.key)||'')||Number(a.key.slice(1))-Number(b.key.slice(1)));
}

function monthDayText(raw){const m=/^(?:\d{4}-)?(\d{1,2})[-/](\d{1,2})$/.exec(raw||'');return m?Number(m[1])+'月'+Number(m[2])+'日':raw;}

function sowParityText(id){const sow=state.sows[id],base=sow?.cardBaseline?.parity;if(base===null||base===undefined||base===''||!Number.isInteger(Number(base))||Number(base)<0)return '未入力';const births=db.logs.filter(l=>!l.legacy&&l.id===id&&l.type==='分娩').length;return (Number(base)+births)+'産目';}

function pigletAgeText(birthDate,day=today()){const birth=Date.parse(birthDate+'T00:00:00Z'),now=Date.parse(day+'T00:00:00Z');if(!Number.isFinite(birth)||!Number.isFinite(now))return '日令不明';const days=Math.round((now-birth)/86400000);return days<0?'出産日を確認':days+'日令';}
let ageDisplayDay=today();setInterval(()=>{const day=today();if(day!==ageDisplayDay){ageDisplayDay=day;if(!fatal&&!dlg.open)render();}},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!fatal&&!dlg.open){ageDisplayDay=today();render();}});

function roomBirthCount(room){
  if(room.mixed)return null;
  const logs=db.logs;
  for(let i=logs.length-1;i>=0;i--){const l=logs[i];if(l.legacy)continue;
    if(l.roomKey===room.key&&l.type==='分娩舎修正'&&Object.prototype.hasOwnProperty.call(l.room,'birthCount'))return l.room.birthCount??null;
    if(l.type==='分娩舎内移動'&&(l.roomKey===room.key||l.targetRoomKey===room.key)||l.type==='子豚移動'&&l.roomKey===room.key)return null;
    if(l.type==='分娩'&&l.roomKey===room.key)return l.id===room.sowId&&l.date===roomBirthDate(room)?l.count??null:null;
    if(l.type==='分娩舎修正'&&l.roomKey===room.key&&(l.room.state==='empty'||l.room.sowId!==room.sowId))return null;
  }
  return room.birthCount??null;
}
function feedBoxCard(r){
  if(r.state==='empty')return '<div class="feed-box feed-empty"><span>空き</span></div>';
  const waiting=r.state==='waiting',birth=roomBirthDate(r),date=waiting?dueMonthDay(r.sowId):birth?monthDayText(birth):'未入力',birthCount=roomBirthCount(r);
  return simulationGroupBadge('rooms',r.key)+`<div class="feed-box"><div class="feed-number">${r.mixed?'混成':sowButton(r.sowId)}</div><div class="feed-parity">${r.mixed?'':esc(sowParityText(r.sowId))}</div><div class="feed-date"><small>${waiting?'予定日':r.mixed?'一番若い子の出産日':'出産日'}</small><span class="feed-due-value"><strong>${esc(date)}</strong>${waiting?farrowingOverdueBadge(r):''}</span></div><div class="feed-age">${waiting?'':birth?esc(pigletAgeText(birth)):'日令未入力'}</div><div class="feed-count">${waiting?'':`<small>出生－現在</small><strong>${birthCount===null?'―':esc(birthCount)}－${r.count===null?'―':esc(r.count)}</strong>`}</div></div>`;
}


function roomWeanSettings(room){
  if(!['waiting','family'].includes(room.state)||room.mixed||!room.sowId)return '';
  const card=TanakaSowParity.pages(db,room.sowId)[0]?.card||{},days=M.plannedWeanDays(card),birth=room.state==='family'?M.roomBirthDate(db,room)||'':'';
  const date=birth?M.addDays(birth,days):'';
  const button=(delta,label)=>`<button type="button" data-action="wean-days" data-id="${esc(room.key)}" data-sow="${esc(room.sowId)}" data-birth="${esc(birth)}" data-days="${days}" data-delta="${delta}" aria-label="離乳日数を1日${delta<0?'減らす':'増やす'}" ${delta<0&&days<=1||delta>0&&days>=365?'disabled':''}>${label}</button>`;
  return `<section class="room-wean-settings"><h3>離乳設定</h3><div class="wean-days-controls">${button(-1,'−')}<strong aria-live="polite">${days}日</strong>${button(1,'＋')}</div><p class="muted">離乳予定：${date?esc(monthDayText(date)):'出産日登録後に計算'}<br>この母豚・この産次のみ</p></section>`;
}
function pigletCareCard(room){
  const checks=M.pigletCare(db,room);if(room.state==='empty')return '';
  const complete=checks.every(x=>x.done);
  return `<details class="piglet-care" data-care-room="${esc(room.key)}" ${openPigletCare.has(room.key)?'open':''}><summary>詳細操作（接種記録・離乳設定）</summary><div class="piglet-care-content">${checks.length?`<h3>投薬・ワクチン <span class="badge ${complete?'green':'orange'}">${complete?'全て完了':checks.filter(x=>!x.done).length+'件 未'}</span></h3>${checks.map(x=>`<div class="care-row"><div><b>${esc(x.label)}</b><small>${x.days}日齢 · ${x.date?esc(monthDayText(x.date))+'予定':'出産日未入力'}${!x.done&&x.date&&x.date<today()?' · 予定日超過':''}</small></div><button class="care-toggle ${x.done?'done':''}" data-action="piglet-check" data-id="${room.key}" data-care="${x.id}" aria-pressed="${x.done}" aria-label="${esc(room.mixed?'混成':room.sowId)} ${esc(x.label)} ${x.done?'済、未に戻す':'未、済にする'}">${x.done?'✓ 済':'未'}</button></div>`).join('')}${checks.some(x=>!x.date)?'<p class="muted">出産日を編集すると予定日が表示されます。</p>':''}${room.mixed?'<p class="muted">混成は枠全体をチェック。予定日は一番若い子の出産日から計算します。</p>':''}`:''}${roomWeanSettings(room)}${room.state==='waiting'?'<p class="muted overdue-basis">超過日数＝現在日 − 分娩予定日（暦日）。シミュレーション中は仮想日付を使用します。予定日未入力・当日以前・分娩後は表示しません。</p>':''}${room.state==='piglets'?`<button class="btn secondary" data-action="room-group" data-id="${room.key}">分ける・混ぜる</button>`:''}<button class="btn secondary" data-action="room-edit" data-id="${room.key}">編集</button></div></details>`;
}
function maternalTree(){return maternalTreeOverview();}
function checkMother(id,mother,oldId=id){
  if(!mother)return;
  const seen=new Set([id,oldId]);let current=mother;
  while(current){if(seen.has(current))throw Error('母親番号が自身または子孫につながっています。母親番号を確認してください。');seen.add(current);current=String(state.sows[current]?.cardBaseline?.mother||'').trim();}
}

