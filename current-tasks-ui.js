'use strict';
let currentTaskCache=null;
function currentTaskGroups(){const day=today();if(currentTaskCache?.db!==db||currentTaskCache?.state!==state||currentTaskCache?.day!==day)currentTaskCache={db,state,day,value:TanakaTasks.collect(db,day,state)};return currentTaskCache.value;}
function taskDate(date){return date.slice(0,4)===today().slice(0,4)?Number(date.slice(5,7))+'/'+Number(date.slice(8)):date.replaceAll('-','/');}
function taskRows(rows){return rows.map(x=>{
 if(x.farm)return `<article class="task-row"><div><b>${esc(x.label)}</b><p class="muted">${esc(taskDate(x.date))} · ${esc(x.note)}</p></div>${reminderCompleteButton(x)}</article>`;
 const action=x.care?'piglet-check':x.type==='再発情確認'?'reheat-open':x.type==='スイムジェン 実施'?'swimgen-toggle':x.type==='離乳'?'room-record':'scheduled-record';
 const target=x.care||x.type==='離乳'?x.roomKey:x.id,label=x.care||x.type==='スイムジェン 実施'?'未 → 済':x.type==='再発情確認'?'確認する':x.type==='分娩舎へ移動'?'移入する':x.type==='離乳'?'離乳を記録':'分娩を記録';
 return `<article class="task-row"><div class="task-main"><b>${esc(sowIdentityLabel(x.id)||x.id)}　${esc(x.label)}</b><p class="muted">${esc(taskDate(x.date))}${x.roomKey?' · 分娩舎'+esc(TanakaSowWork.roomLabel(state.rooms.find(r=>r.key===x.roomKey))):''}</p><div class="task-links">${x.id==='混成'?'':`<button type="button" class="sowlink" data-action="detail" data-id="${esc(x.id)}">母豚カード</button>`}${['離乳','分娩舎へ移動'].includes(x.type)?`<button type="button" class="sowlink" data-ff="decision" data-id="${esc(x.id)}" data-type="${esc(x.type)}" data-date="${esc(x.date)}">予測・判断を見る</button>`:''}</div></div><button type="button" class="sowlink task-execute" data-action="${action}" data-id="${esc(target)}" data-care="${esc(x.careId||'')}" data-type="${esc(x.type)}">${label}</button></article>`;
 }).join('');}
function taskSchedulePage(view='today'){
 const tasks=currentTaskGroups(),isToday=view==='today',items=isToday?tasks.today:tasks.upcoming;
 return `<div class="task-switch" role="group" aria-label="予定の表示切替"><button type="button" data-action="page" data-id="todayTasks" aria-pressed="${isToday}">今日 ${tasks.today.length}件${tasks.overdue.length?`<small>未完了 ${tasks.overdue.length}件</small>`:''}</button><button type="button" data-action="page" data-id="schedules" aria-pressed="${!isToday}">直近 ${tasks.upcoming.length}件<small>明日〜30日先</small></button></div><h2>${isToday?'今日の予定':'直近の予定'}</h2><p class="muted">${isToday?tasks.day.replaceAll('-','/')+' 当日の作業だけを表示します。':taskDate(M.addDays(tasks.day,1))+'〜'+taskDate(tasks.end)+'の予定を日付順に表示します。今日の作業は含みません。'}</p>${isToday&&tasks.overdue.length?`<details class="task-overdue" aria-label="未完了の予定"><summary>未完了 <span>${tasks.overdue.length}件</span><small>予定日を過ぎた作業を確認</small></summary><p class="muted">予定日を過ぎた未実施の作業です。実施した内容を記録してください。</p><div class="card">${taskRows(tasks.overdue)}</div></details>`:''}<section aria-label="${isToday?'今日が対象日の作業':'明日から30日以内の作業'}"><div class="card">${taskRows(items)||`<p class="empty">${isToday?'今日が対象日の作業はありません。':'明日から30日以内の予定はありません。'}</p>`}</div></section><p class="muted">現在の母豚カード・在室状態から集計しています。未登録の次回サイクルは予測で追加しません。</p><button type="button" class="btn secondary" data-action="page" data-id="forecast">年間予測・分娩舎の混雑を見る</button>`;
}
function todayTasksPage(){return '<button class="back" data-action="page" data-id="home">‹ ホーム</button>'+taskSchedulePage('today');}
function refreshTaskDay(){if(!fatal&&['home','todayTasks','schedules'].includes(page)&&currentTaskCache&&currentTaskCache.day!==today())render();}
window.addEventListener('focus',refreshTaskDay);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshTaskDay();});
setInterval(refreshTaskDay,60000);
