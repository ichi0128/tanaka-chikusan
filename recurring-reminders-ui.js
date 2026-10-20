'use strict';
let remindersInitializationQueued=false;
function queueRemindersInitialization(){
  if(db.recurringReminders!==undefined||remindersInitializationQueued)return;
  remindersInitializationQueued=true;const session=dataSession;
  queueMicrotask(()=>{try{if(session!==dataSession)return;if(db.recurringReminders===undefined)save(d=>TanakaReminders.initialize(d));}catch(err){toast('定期お知らせを保存できませんでした：'+err.message);}finally{remindersInitializationQueued=false;}});
}
function recurringRemindersSettings(){
  const items=TanakaReminders.list(db).slice().sort((a,b)=>a.month-b.month||a.day-b.day||a.id.localeCompare(b.id));
  return `<section aria-labelledby="recurring-reminders-title"><h2 id="recurring-reminders-title">定期お知らせ</h2><p class="muted">毎年、指定日からその月の末日までホームと「直近の予定」に表示します。「実施済」にするとその年の分だけ非表示になります。2月29日はうるう年のみ表示します。</p><button type="button" class="btn secondary" data-reminder="add">お知らせを追加</button><div class="card">${items.map(x=>`<div class="reminder-setting"><div><b>${x.month}月${x.day}日</b>${TanakaReminders.isComplete(db,x.id,Number(today().slice(0,4)))?'<span class="badge green">今年は実施済</span>':''}<p class="history-note">${esc(x.message)}</p></div><div class="reminder-setting-actions"><button type="button" class="sowlink" data-reminder="edit" data-id="${esc(x.id)}">編集</button><button type="button" class="sowlink" data-reminder="delete" data-id="${esc(x.id)}">削除</button></div></div>`).join('')||'<p class="muted">定期お知らせはありません。</p>'}</div></section>`;
}
function reminderForm(id){
  const old=id?TanakaReminders.list(db).find(x=>x.id===id):null;if(id&&!old)throw Error('お知らせが見つかりません。');
  const item=old?M.clone(old):{id:M.uid(),month:Number(today().slice(5,7)),day:1,message:''},expected=JSON.stringify(old??null);
  const days=(m,d)=>Array.from({length:TanakaReminders.days(m)},(_,i)=>`<option value="${i+1}" ${i+1===d?'selected':''}>${i+1}日</option>`).join('');
  form(old?'定期お知らせを編集':'定期お知らせを追加',`<label for="reminder-month">月</label><select id="reminder-month" name="month">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===item.month?'selected':''}>${i+1}月</option>`).join('')}</select><label for="reminder-day">日</label><select id="reminder-day" name="day">${days(item.month,item.day)}</select><label for="reminder-message">通知文</label><textarea id="reminder-message" name="message" rows="3" maxlength="500" required>${esc(item.message)}</textarea><p class="muted">毎年繰り返します。個体別の接種記録は作りません。</p>`,'保存する',f=>{
    const next={...item,month:Number(f.get('month')),day:Number(f.get('day')),message:String(f.get('message')||'').trim()};
    save(d=>TanakaReminders.update(d,next,expected));
  });
  document.getElementById('reminder-month').onchange=e=>{const day=document.getElementById('reminder-day'),month=Number(e.target.value);day.innerHTML=days(month,Math.min(Number(day.value),TanakaReminders.days(month)));};
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-reminder]');if(!b||page!=='edit')return;
  try{
    if(b.dataset.reminder==='add')reminderForm();
    if(b.dataset.reminder==='edit')reminderForm(b.dataset.id);
    if(b.dataset.reminder==='delete'){
      const item=TanakaReminders.list(db).find(x=>x.id===b.dataset.id);if(!item)return;
      const expected=JSON.stringify(item);
      form('定期お知らせを削除',`<p>${item.month}月${item.day}日</p><p class="history-note">${esc(item.message)}</p><p class="muted">このお知らせの毎年の表示を削除します。</p>`,'削除する',()=>save(d=>TanakaReminders.remove(d,item.id,expected)));
    }
  }catch(err){toast(err.message);}
});
// Initial defaults can be saved before the signed-in cloud connection is ready.
// Once that same cloud row is ready, queue the normal guarded upload as well.
window.addEventListener('load',()=>{
  if(typeof cloudStore==='undefined'||!cloudStore)return;
  const previous=cloudStore.onChange;let scheduled='';
  const syncInitial=()=>{
    const c=cloudStore;if(c.status!=='ready'||!c.user||!c.row||db.recurringReminders===undefined||c.row.data.recurringReminders!==undefined)return;
    const token=c.user.id+':'+c.row.id+':'+c.row.revision;if(scheduled===token)return;
    scheduled=token;c.localChanged();
  };
  cloudStore.onChange=function(...args){previous?.apply(this,args);syncInitial();};syncInitial();
});

function reminderCompleteButton(item){return `<button type="button" class="sowlink reminder-complete" data-reminder-complete="${esc(item.reminderId)}" data-occurrence="${esc(item.date)}" aria-label="${esc(item.label)}を実施済にする">実施済</button>`;}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-reminder-complete]');if(!b||!['home','schedules'].includes(page))return;
  try{save(d=>TanakaReminders.complete(d,b.dataset.reminderComplete,b.dataset.occurrence));toast('今年の分を実施済にしました。翌年はまた表示します。');}
  catch(err){toast('実施済にできませんでした：'+err.message);}
});
