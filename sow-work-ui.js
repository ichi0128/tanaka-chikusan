'use strict';
let lastWorkAction=null;
function swimgenControl(id,card,interactive=false){const done=TanakaSowWork.swimgenDone(card);return `スイムジェン　${interactive?`<button type="button" class="sow-care-status ${done?'done':''}" data-action="swimgen-toggle" data-id="${esc(id)}" aria-label="母豚 ${esc(id)} スイムジェン ${done?'済、未に戻す':'未、済にする'}" aria-pressed="${done}">${done?'済':'未'}</button>`:`<b>${done?'済':'未'}</b>`}`;}
function focusYardWorkCard(id){
  if(page!=='sows')return;const host=document.querySelector('.sow-yard-swipe'),button=document.querySelector('.sow-yard-item .sow-card-open[data-id="'+id+'"]'),card=button?.closest('.sow-yard-item');
  if(host&&card&&host.firstElementChild)host.scrollLeft=card.offsetLeft-host.firstElementChild.offsetLeft;
}
function showWorkAction(log,message=''){
  if(log.movement?.to.area==='yard'||log.action?.kind==='swimgen-status')focusYardWorkCard(log.id);
  lastWorkAction={key:log.key,session:dataSession};
  const host=document.getElementById('work-feedback');
  const text=message||(log.movement?`${log.id}を${log.movement.to.name}へ移動しました`:`${log.id}のスイムジェンを「${log.action.after.done?'済':'未'}」にしました`);
  host.innerHTML=`<span>${esc(simulation?'【仮データ】'+text:text)}</span>${log.action?.kind==='farrowing-entry'||log.action?.kind==='swimgen-status'?`<button type="button" data-action="work-undo" data-id="${esc(log.key)}">取り消す</button>`:''}<button type="button" class="work-feedback-close" data-action="work-dismiss" aria-label="操作結果を閉じる">×</button>`;host.hidden=false;
}
function hideWorkAction(){lastWorkAction=null;const host=document.getElementById('work-feedback');if(host){host.hidden=true;host.innerHTML='';}}
function roomUsage(room){if(room.state==='empty')return '空き';if(room.state==='piglets')return '使用中：'+(room.mixed?'混成・':'')+'子豚'+(room.count===null?'頭数未入力':room.count+'頭');return '使用中：'+room.sowId+' · '+(room.state==='waiting'?'分娩待ち':'授乳中・子豚'+(room.count===null?'頭数未入力':room.count+'頭'));}
function enterWaiting(id){
  const sow=state.sows[id];if(!sow?.active||sow.numberPending){toast('移動できる現役母豚を選んでください');return;}
  if(state.rooms.some(r=>['waiting','family'].includes(r.state)&&r.sowId===id)){toast('この母豚は既に分娩舎にいます');return;}
  const choices=state.rooms.slice().sort((a,b)=>Number(a.key.slice(1))-Number(b.key.slice(1))),empty=choices.filter(r=>r.state==='empty'),sole=empty.length===1?empty[0]:null,basis=db;
  const grid=`<fieldset class="farrowing-room-picker"><legend>移動先を選択</legend><div>${choices.map(r=>`<label class="farrowing-room-choice ${r.state==='empty'?'is-empty':'is-occupied'}"><input type="radio" name="roomKey" value="${esc(r.key)}" ${r.state==='empty'?'required':'disabled'} ${r===sole?'checked':''}><span><b>${esc(TanakaSowWork.roomLabel(r))}</b><small>${esc(roomUsage(r))}</small></span></label>`).join('')}</div></fieldset>`;
  form('母豚 '+id+' · 分娩舎へ',`<p>${esc(TanakaSowWork.yardOrigin(sow).name)}から移動します。</p><p class="muted">出産予定日：${esc(sowDue(id))}</p>${!empty.length?'<p class="notice"><b>分娩舎に空きがありません</b></p>':''}${grid}${empty.length?`<p id="room-choice-summary" role="status">${sole?esc(TanakaSowWork.roomLabel(sole))+'へ移動します':'移動先の空室を選んでください'}</p>`:''}`,empty.length?'移動する':'閉じる',f=>{
    if(!empty.length)return;
    if(db!==basis)throw Error('記録が更新されました。移動先を選び直してください。');
    const key=String(f.get('roomKey')||''),chosen=empty.find(r=>r.key===key);if(!chosen)throw Error('移動先の空室を選んでください。');
    let log;save(d=>{log=TanakaSowWork.entry(d,{...makeLog('分娩舎へ移動',id),id,roomKey:key,expectedRoom:JSON.stringify(chosen)});});showWorkAction(log);
  });
  document.querySelectorAll('.farrowing-room-picker input:not(:disabled)').forEach(input=>input.addEventListener('change',()=>{const room=choices.find(r=>r.key===input.value);document.getElementById('room-choice-summary').textContent=TanakaSowWork.roomLabel(room)+'へ移動します';}));
}
function cancelWaiting(key){
  let ctx;try{ctx=TanakaSowWork.returnContext(db,key);}catch(err){toast(err.message);return;}
  const {room,to}=ctx;
  form('運動場へ戻す',`<p>母豚 ${esc(room.sowId)}を<br><b>${esc(TanakaSowWork.roomLocation(room).name)} → ${esc(to.name)}</b><br>へ戻します。</p><p class="muted">移動履歴を残したまま「移動取消」を記録します。</p>`,'元の場所へ戻す',()=>{let log;save(d=>{log=TanakaSowWork.returnToYard(d,{...makeLog('移動取り消し',room.sowId),roomKey:key,expectedEntry:room.entryKey||''});});showWorkAction(log,room.sowId+'を'+log.movement.to.name+'へ戻しました（移動取消）');});
}
function waitingLog(l){
  const route=l.movement?`${l.movement.from.name} → ${l.movement.to.name}`:`分娩舎${TanakaSowWork.roomLabel(state.rooms.find(r=>r.key===l.roomKey))} ${l.type==='分娩舎へ移動'?'への移動':'からの移動取消'}`;
  form(l.type==='移動取り消し'?'移動取消':l.type,`<p>母豚 ${esc(l.id)}</p><p><b>${esc(route)}</b></p><p>${esc(l.t?new Date(l.t).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):l.date)}</p><p class="muted">出産前の分娩待ちであれば、移動元へ戻せます。</p>`,'閉じる',()=>{});
  if(l.type==='分娩舎へ移動'&&state.rooms.some(r=>r.key===l.roomKey&&r.state==='waiting'&&r.sowId===l.id&&r.entryKey===l.key))modal.insertAdjacentHTML('beforeend',`<button type="button" class="btn secondary" data-action="waiting-cancel" data-id="${esc(l.roomKey)}">運動場へ戻す</button>`);
}
function changeSwimgen(id,done){
  if(!id){form('スイムジェン',sowSelect(''),'保存',f=>changeSwimgen(String(f.get('id')||''),done));return;}
  const p=TanakaSowParity.pages(db,id)[0];let log;
  save(d=>{log=TanakaSowWork.setSwimgen(d,{...makeLog('追記',id),id,done,expectedPage:JSON.stringify(p)});});showWorkAction(log);
}
function sowWorkLog(l){form('スイムジェンの記録',`<p>母豚 ${esc(l.id)} · ${l.action.after.done?'済':'未'}</p><p>${esc(dateText(l))}</p>${l.undoOf?'<p>取り消しの記録です。元の記録は履歴に残っています。</p>':''}`,'閉じる',()=>{});}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action="swimgen-toggle"],[data-action="work-undo"],[data-action="work-dismiss"]');if(!b)return;
  try{
    if(b.dataset.action==='work-dismiss'){hideWorkAction();return;}
    if(b.dataset.action==='swimgen-toggle'){
      const id=b.dataset.id,p=TanakaSowParity.pages(db,id)[0];changeSwimgen(id,!TanakaSowWork.swimgenDone(p.card));
    }else{
      if(lastWorkAction?.key!==b.dataset.id||lastWorkAction.session!==dataSession)throw Error('画面が切り替わりました。現在のカードを確認してください。');
      let log;save(d=>{log=TanakaSowWork.undo(d,b.dataset.id,{...makeLog('追記','')});});
      showWorkAction(log,log.movement?log.id+'を'+log.movement.to.name+'へ戻しました（移動取消）':log.id+'のスイムジェンを元に戻しました');
      // A compensating record remains in history; do not offer an undo-of-undo.
      document.getElementById('work-feedback').innerHTML=`<span>${esc(simulation?'【仮データ】':'')}${esc(log.movement?log.id+'を'+log.movement.to.name+'へ戻しました（移動取消）':log.id+'のスイムジェンを元に戻しました')}</span><button type="button" data-action="work-dismiss">閉じる</button>`;
    }
  }catch(err){toast(err.message);}
});
