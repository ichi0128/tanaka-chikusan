/* Read-only projections. No migration, ledger writes or automatic date changes. */
(function(root){
'use strict';
const M=root.TanakaModel,DAY=86400000;
const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const add=(s,n)=>M.addDays(s,n),distance=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/DAY);
// Resolve month/day in a known cycle without rewriting stored cards.
function normalizeDate(value,anchor){
  if(valid(value))return value;const m=/^(\d{1,2})[\/.-](\d{1,2})$/.exec(String(value||''));if(!m||!valid(anchor))return '';
  const year=Number(anchor.slice(0,4)),dates=[year-1,year,year+1].map(y=>y+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0')).filter(valid);
  return dates.sort((a,b)=>Math.abs(distance(anchor,a))-Math.abs(distance(anchor,b)))[0]||'';
}
function months(date,n){const d=new Date(date+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);}
function heat(day){const md=day.slice(5);return {caution:md>='07-21'&&md<='09-10',avoid:md>='08-01'&&md<='08-31'};}
// Shared counting and capacity classification. Callers choose their own cohort.
function capacityState(n){const level=n>=11?'over':n===10?'full':n===9?'caution':'normal';return {level,decision:n>=11?'bad':n>=9?'warn':'good',attention:n>=9,full:n===10,atCapacity:n>=10,over:n>=11,empty:Math.max(0,10-n),shortage:Math.max(0,n-10)};}
const level=n=>capacityState(n).level;
const status=n=>({over:'オーバー',full:'満室',caution:'注意',normal:'通常'})[level(n)];
const intersects=(p,start,end)=>p.entry<=end&&(!valid(p.exit)||p.exit>=start);
function capacityAt(occupancies,date,unknown=[]){const extras=unknown.filter(u=>!occupancies.some(p=>u.roomKey&&p.roomKey===u.roomKey||u.key&&p.key===u.key)),overlaps=[...occupancies,...extras].filter(p=>intersects(p,date,date));return {date,count:overlaps.length,overlaps,unmodelled:overlaps.filter(p=>p.unknown)};}
function capacityDays(occupancies,start,end,unknown=[]){const days=[];for(let date=start;date<=end;date=add(date,1))days.push(capacityAt(occupancies,date,unknown));return days;}
function capacityPeak(days,start=days[0]?.date||'',end=days.at(-1)?.date||start){return days.filter(d=>d.date>=start&&d.date<=end).reduce((best,d)=>d.count>best.count?{count:d.count,date:d.date}:best,{count:0,date:start});}
function unknownRoomStays(f){return (f.unmodelled||[]).map(r=>({...r,key:'unknown:'+r.key,roomKey:r.key,id:r.state==='piglets'?'piglets:'+r.key:r.sowId,entry:f.day,exit:'',unknown:true,basis:'record',source:'現在の在室記録・誕生日または退室日未確定'}));}

function period(id,mating,first,source='基本周期から予測',plannedWeanDays=30){
  plannedWeanDays=M.plannedWeanDays({plannedWeanDays});
  const due=add(mating,114),birth=add(due,7);return {id,mating,due,birth,entry:add(due,first?-7:-4),exit:add(birth,plannedWeanDays),plannedWeanDays,first,basis:'estimate',source,actualBirth:false,actualWean:false,current:false,uncertain:false};
}
// Movement assumptions are projections only, never new ledger events.
function pigletMove(data,birth,id='',roomKey=''){
  if(!valid(birth))return {moveDate:'',moveBasis:'unknown',moveSource:'子豚の誕生日が不明'};
  const at=data.logs.findIndex(l=>!l.legacy&&l.type==='分娩'&&l.id===id&&l.date===birth&&(!roomKey||l.roomKey===roomKey));
  let actual=null;if(at>=0){const source=data.logs[at].roomKey;for(const l of data.logs.slice(at+1)){if(l.legacy)continue;if(l.roomKey===source&&l.type==='子豚移動'&&l.id===id&&valid(l.date)&&l.date>=birth){actual=l;break;}if(l.roomKey===source&&(['分娩','分娩舎へ移動','分娩舎内移動'].includes(l.type)||l.type==='分娩舎修正'&&(l.room?.state==='empty'||l.room?.sowId!==id)))break;}}
  return actual?{moveDate:actual.date,moveBasis:'record',moveSource:'子豚移動の実績日を優先'}:{moveDate:add(birth,60),moveBasis:'estimate',moveSource:'実績未入力のため分娩日＋60日で仮計算'};
}
function roomStay(p){
  const moveDate=valid(p.moveDate)?p.moveDate:valid(p.birth)?add(p.birth,60):'',wean=p.wean||p.exit;
  // Use the recorded move or birth +60. A delayed mother must still have a room;
  // her wean date alone never releases the piglets' room.
  const exit=!moveDate?'':valid(p.exit)&&p.exit>moveDate?p.exit:moveDate;
  return {...p,wean,exit,roomExit:exit,moveDate,moveBasis:p.moveBasis||'estimate',moveSource:p.moveSource||'分娩予測日＋60日で仮計算'};
}
function occupanciesFor(f,periods=f.periods){return [...periods.map(roomStay),...(f.childStays||[]).map(roomStay)];}

function targets(data,state){
  const out=Object.values(state.sows).filter(s=>s.active&&!s.numberPending).map(s=>({id:s.id,label:'母豚 '+s.id,sow:s,birthDate:s.birthDate||'',gilt:false}));
  const yard=state.finishing.find(r=>r.key==='yard');
  if(yard)root.TanakaFinishing.yardState(yard).individuals.forEach((p,i)=>{
    if(root.TanakaGilts.yardKind(p,state)!=='育成母豚')return;
    const sow=root.TanakaGilts.linkedSow(p,state);
    out.push({id:sow?.id||'yard:'+p.key,label:sow?sow.giltRegistration.label+'（育成）':'育成母豚 '+(i+1),sow:sow||null,birthDate:sow?.birthDate||p.birthDate||'',birthMonth:root.TanakaFinishing.yardBirthMonth(p),gilt:true});
  });
  return out.sort((a,b)=>a.gilt-b.gilt||a.label.localeCompare(b.label,'ja',{numeric:true}));
}
function build(data,day){
  if(!valid(day))throw Error('予測の基準日を確認してください。');
  const end=months(day,12),state=M.replay(data),rows=targets(data,state),periods=[],warnings=[],scheduled=M.schedules(data,day),horizon=add(end,200);
  const occupied=state.rooms.filter(r=>r.state!=='empty');
  const childRooms=state.rooms.filter(r=>r.state==='piglets');
  const childStays=childRooms.flatMap(r=>{const birth=M.roomBirthDate(data,r),move=pigletMove(data,birth,r.sowId,r.key);if(!move.moveDate){warnings.push('離乳後の子豚（'+r.key+'）：誕生日が不明のため引っ越し日を計算できません。');return [];}return [{id:'piglets:'+r.key,key:'piglets:'+r.key,roomKey:r.key,label:'離乳後の子豚（管理枠'+r.key.slice(1)+'）',birth,entry:day,exit:move.moveDate<day?day:move.moveDate,...move,basis:'record',source:move.moveSource,actualBirth:true,pigletsOnly:true,current:true,uncertain:false}];});
  for(const target of rows){
    const s=target.sow,logs=data.logs.map((l,i)=>({...l,index:i})).filter(l=>!l.legacy&&l.id===target.id&&valid(l.date)).sort((a,b)=>a.date.localeCompare(b.date)||a.index-b.index);
    const last=t=>logs.filter(l=>l.type===t).at(-1),card=s?(root.TanakaSowParity.pages(data,s.id)[0]?.card||s.cardBaseline||{}):{};
    if(card.reheatPending){target.missing='再種付け待ち（前回の種付けは不成立）';continue;}
    const plannedWeanDays=M.plannedWeanDays(card);
    const pick=(value,fallback)=>valid(value)?value:valid(fallback)?fallback:'';
    const matingAnchor=last('種付け')?.date||(card.mating===s?.cardBaseline?.mating?String(card.mating||'').replace(/^(\d{1,2})\/(\d{1,2})$/,(_,m,d)=>'2026-'+m.padStart(2,'0')+'-'+d.padStart(2,'0')):''),mating=pick(normalizeDate(card.mating,matingAnchor),last('種付け')?.date),birth=pick(normalizeDate(card.birthDateActual,last('分娩')?.date||(mating?add(mating,121):'')),last('分娩')?.date),wean=pick(normalizeDate(card.weanDateActual,last('離乳')?.date||(birth?add(birth,plannedWeanDays):'')),last('離乳')?.date),normalizedDue=normalizeDate(card.due,mating?add(mating,114):'');
    const room=state.rooms.find(r=>['family','waiting'].includes(r.state)&&r.sowId===target.id);
    const parityKnown=card.parity!==undefined&&card.parity!==null&&card.parity!=='';
    const first=target.gilt||(!birth&&(!parityKnown||Number(card.parity)===0));target.first=first;target.parityUnknown=!target.gilt&&!birth&&!parityKnown;target.roomKey=room?.key||'';
    if(target.parityUnknown)warnings.push(target.label+'：産次未入力のため、最初の入室を初産と同じ7日前で仮置きします。');
    let p=null,nextMating='',reason='';
    const currentBirth=room?.state==='family'?pick(M.roomBirthDate(data,room),s?.parityCards?.current.card.birthDateActual):birth;
    if(currentBirth&&(!mating||currentBirth>=mating)&&(!wean||currentBirth>wean||room?.state==='family')){
      const due=mating?add(mating,114):add(currentBirth,-7),entry=logs.filter(l=>l.type==='分娩舎へ移動'&&l.date<=currentBirth).at(-1)?.date||[add(due,first?-7:-4),currentBirth].sort()[0];
      const knownWean=wean&&wean>=currentBirth&&!room?wean:'';
      p={id:target.id,mating,due,birth:currentBirth,entry,exit:knownWean||add(currentBirth,plannedWeanDays),plannedWeanDays,first,basis:'record',source:'実際の分娩日'+(knownWean?'・離乳日':'＋離乳設定'+plannedWeanDays+'日'),actualBirth:true,actualWean:!!knownWean,current:!!room,uncertain:false};
      if(room&&p.exit<day){p.exit=day;p.uncertain=true;p.source+='（離乳予定超過・今日退室する仮定）';warnings.push(target.label+'：離乳予定を過ぎています。実際の在室・離乳記録を確認してください。');}
      nextMating=add(p.exit,4);
    }else if(mating&&(!birth||mating>birth)){
      p=period(target.id,mating,first,'記録済み種付け日＋標準日数',plannedWeanDays);p.basis='record';
      if(normalizedDue){p.due=normalizedDue;p.entry=add(p.due,first?-7:-4);p.birth=add(p.due,7);p.exit=add(p.birth,plannedWeanDays);p.source='カードの分娩予定日＋7日・離乳設定'+plannedWeanDays+'日';}
      if(p.birth<day){p.birth=day;p.exit=add(day,plannedWeanDays);p.uncertain=true;p.source+='（分娩未記録・今日分娩する仮定）';warnings.push(target.label+'：分娩予測日を過ぎています。分娩・離乳の記録を確認してください。');}
      p.current=!!room;nextMating=add(p.exit,4);
    }else if(wean){
      nextMating=add(wean,4);while(nextMating<day)nextMating=add(nextMating,21);
      reason=nextMating>add(wean,4)?'種付け未記録のため次の21日周期を仮置き':'実際の離乳日＋4日';
    }else if(target.gilt||s?.giltRegistration){
      if(valid(target.birthDate)){nextMating=months(target.birthDate,8);while(nextMating<day)nextMating=add(nextMating,21);reason='8か月齢で初回種付け（過ぎていれば21日周期を仮置き）';}
      else target.missing='誕生日の年月日が未確定（8か月齢を計算できません）';
    }else{
      const changedMonthDay=card.due&&card.due!==s?.cardBaseline?.due&&!valid(card.due);
      const legacyDue=valid(card.due)?card.due:changedMonthDay?'':scheduled.find(x=>x.id===target.id&&x.type==='分娩'&&x.baseKey==='card')?.date;
      if(legacyDue){p=period(target.id,add(legacyDue,-114),first,valid(card.due)?'カードの分娩予定日（年月日）':'元カードの分娩予定（年は既存の予定表示に準拠）',plannedWeanDays);p.basis='record';if(p.birth<day){p.birth=day;p.exit=add(day,plannedWeanDays);p.uncertain=true;p.source+='・予定超過、今日分娩する仮定';warnings.push(target.label+'：元カードの予定が過ぎています。実績を確認してください。');}p.current=!!room;nextMating=add(p.exit,4);}
      else target.missing=changedMonthDay?'変更した分娩予定が月日のみ（年を含む日付か種付け記録が必要）':'種付け日・分娩日・離乳日の記録が不足';
    }
    if(room?.state==='family'&&!currentBirth){target.missing='現在授乳中ですが実際の分娩日が不明';nextMating='';p=null;}
    if(room&&p){const actualEntry=data.logs.find(l=>l.key===room.entryKey&&valid(l.date));if(actualEntry)p.entry=actualEntry.date;}
    if(room&&!p)warnings.push(target.label+'：現在の在室は確認できますが、退室予測に必要な日付が不足しています。');
    if(p){if(target.parityUnknown&&p.first)p.source+='（産次未入力・7日前の仮入室）';p.key=target.id+':current';periods.push(p);}
    for(let i=0;nextMating&&i<6;i++){
      const future=period(target.id,nextMating,p?false:first,reason||'離乳30日・離乳後4日で次回種付け');future.key=target.id+':cycle:'+i;if(target.parityUnknown&&future.first)future.source+='（産次未入力・7日前の仮入室）';
      if(future.entry>horizon)break;periods.push(future);nextMating=add(future.exit,4);p=future;reason='基本周期から予測';
    }
  }
  periods.forEach(p=>{Object.assign(p,p.actualBirth?pigletMove(data,p.birth,p.id):{moveDate:add(p.birth,60),moveBasis:'estimate',moveSource:'分娩予測日＋60日で仮計算'});p.roomExit=roomStay(p).exit;});
  const occupancies=occupanciesFor({periods,childStays}),unmodelled=occupied.filter(r=>r.state==='piglets'?!childStays.some(p=>p.roomKey===r.key):!periods.some(p=>p.current&&p.id===r.sowId));
  const forecast={day,end,rooms:state.rooms,nursery:state.nursery,rows,periods,occupancies,childStays,warnings,childRooms,unmodelled,missing:rows.filter(r=>r.missing)};
  const days=capacityDays(occupancies,day,end,unknownRoomStays(forecast)).map(d=>({...d,heat:heat(d.date)}));
  return {...forecast,days,peak:capacityPeak(days).count};
}

function riskSegments(f){const out=[];for(const d of f.days){if(!capacityState(d.count).attention)continue;const type=level(d.count),previous=out.at(-1);if(previous&&previous.level===type&&add(previous.end,1)===d.date)previous.end=d.date;else out.push({start:d.date,end:d.date,level:type});}return out.map(r=>{const peak=capacityPeak(f.days,r.start,r.end);return {...r,peak:peak.count,peakDate:peak.date};});}
function overlapsAt(f,date,periods=f.occupancies||f.periods){return capacityAt(periods,date,unknownRoomStays(f)).overlaps;}
function peakBetween(periods,start,end,unknown=[]){return capacityPeak(capacityDays(periods,start,end,unknown),start,end);}
// Physical-room cohort for entry decisions. Counting itself uses the same engine.
function nearCapacity(f,date,{id='',wean='',enter=false}={}){
  const rooms=f.rooms||[],occupied=rooms.filter(r=>r.state!=='empty'),resident=new Set(occupied.filter(r=>r.state!=='piglets').map(r=>r.sowId));
  const current=occupied.map(r=>{const child=f.childStays?.find(p=>p.roomKey===r.key),p=f.periods.find(p=>p.current&&p.id===r.sowId);return child?roomStay(child):p?roomStay({...p,exit:r.sowId===id&&wean?wean:p.exit}):unknownRoomStays({day:f.day,unmodelled:[r]})[0];});
  const incoming=f.periods.map(roomStay).filter(p=>!(resident.has(p.id)&&p.current)&&p.entry>=f.day&&p.entry<=date&&intersects(p,date,date)&&p.id!==id);
  const stays=[...current,...incoming];if(enter&&!resident.has(id)){const p=f.periods.find(p=>p.id===id&&(!valid(roomStay(p).exit)||roomStay(p).exit>=date));stays.push(p?{...roomStay(p),entry:date}:{id,entry:date,exit:'',basis:'estimate',source:'指定日の移入を仮定'});}
  return {...capacityAt(stays,date),incoming};
}

const verdict=level=>({good:'問題なし',warn:'注意',bad:'危険'})[level];
function compare(f,id,mating,options={}){
  const target=f.rows.find(x=>x.id===id);if(!target||!valid(mating)||mating<f.day||mating>f.end)throw Error('予測対象の母豚と種付け日を確認してください。');
  const current=f.periods.find(p=>p.id===id&&((p.current&&p.actualBirth)||(p.basis==='record'&&p.mating&&p.mating<=f.day&&p.exit>=f.day))),first=target.first&&!current;
  const proposed=period(id,mating,first,'シミュレーション（保存しません）');proposed.key='simulation';
  const other=f.periods.filter(p=>p.id!==id),all=other.slice();
  if(current){const c={...current};if(options.wean)c.exit=options.wean;all.push(c);}
  all.push(proposed);
  const roomAll=occupanciesFor(f,all),proposedStay=roomStay(proposed),unknown=unknownRoomStays(f),riskDays=capacityDays(roomAll,proposed.entry,proposedStay.exit,unknown),peak=capacityPeak(riskDays),heatState=heat(proposed.birth),risks=riskSegments({days:riskDays}),birthCount=capacityAt(roomAll,proposed.birth,unknown).count,peakOverlaps=capacityAt(roomAll,peak.date,unknown).overlaps;

  const overlapping=occupanciesFor(f,other).filter(p=>p.entry<=proposedStay.exit&&p.exit>=proposed.entry),ids=new Set();
  const neighbours=overlapping.filter(p=>{if(ids.has(p.id))return false;ids.add(p.id);return true;});
  const uncertain=f.missing.length>0||f.rows.some(r=>r.parityUnknown)||f.unmodelled.length>0||f.periods.some(p=>p.uncertain),bad=capacityState(peak.count).over||heatState.avoid,warn=capacityState(peak.count).attention||heatState.caution||uncertain;
  const holdBase=options.baseDate||f.day,holdDays=[];if(current&&options.wean)for(let date=add(holdBase,1);date<=options.wean;date=add(date,1)){const held=nearCapacity(f,date,{id,wean:options.wean}),released=nearCapacity(f,date,{id,wean:holdBase});holdDays.push({date,...held,added:held.count>released.count});}
  const addedDays=holdDays.filter(d=>d.added),holdMaximum=capacityPeak(addedDays),hold=addedDays.find(d=>d.date===holdMaximum.date),holdPeak=hold?.count||0,holdLevel=capacityState(holdPeak).decision;
  const currentEnd=options.wean||current?.exit,unavailable=!!current&&mating<add(currentEnd,4),age=current&&options.wean?distance(current.birth,options.wean):null,requiredNursingDays=M.plannedWeanDays(current);
  const reasons=[];if(capacityState(peak.count).attention)reasons.push('次回の分娩舎使用見込みが最大'+peak.count+'/10室');if(heatState.avoid)reasons.push('次回分娩予測が8月の分娩回避推奨期間');else if(heatState.caution)reasons.push('次回分娩予測が暑熱注意期間');if(f.unmodelled.length)reasons.push('離乳後の子豚・退室日不明の在室'+f.unmodelled.length+'室の移動・退室予定が未確定');if(f.missing.length)reasons.push('予測に必要な日付が不足している母豚'+f.missing.length+'頭');if(f.rows.some(r=>r.parityUnknown))reasons.push('産次未入力の母豚があり、入室日を仮置き');if(f.periods.some(p=>p.uncertain))reasons.push('分娩・離乳予定を過ぎた未確認の記録あり');if(holdLevel!=='good')reasons.push('現在の部屋の使用延長中に最大'+holdPeak+'/10室');if(unavailable)reasons.push('現周期の退室見込み＋4日より前の種付け予測');if(age!==null&&age<requiredNursingDays)reasons.push('比較日の授乳日数が'+age+'日（離乳設定'+requiredNursingDays+'日より前）');
  return {mating,...proposed,roomExit:proposedStay.exit,moveDate:proposedStay.moveDate,moveBasis:proposedStay.moveBasis,moveSource:proposedStay.moveSource,reasons,peak:peak.count,peakDate:peak.date,birthCount,peakOverlaps,risks,heat:heatState,neighbours,level:bad||holdLevel==='bad'?'bad':warn||holdLevel==='warn'||unavailable||age!==null&&age<requiredNursingDays?'warn':'good',holdPeak,holdDate:hold?.date||'',holdLevel,holdNeighbours:hold?.incoming||[],uncertain,unavailable,earlyWean:age!==null&&age<requiredNursingDays,age,requiredNursingDays,currentExit:currentEnd||'',currentDelta:current&&options.wean?distance(current.exit,options.wean):0,currentPeak:currentEnd?peakBetween(roomAll,f.day,currentEnd>=f.day?currentEnd:f.day,unknown).count:null};
}
function capacitySummary(c){
  const atBirth=c.birthCount>=c.peak,when=atBirth?'次回分娩時':'次回サイクル中';
  if(capacityState(c.peak).over)return {message:when+'に収容超過予測（分娩舎に入りきらない可能性あり）',dateLabel:'収容超過予測日',state:'収容超過'};
  if(capacityState(c.peak).full)return {message:when+'に満室予測（収容可能・余裕なし）',dateLabel:'満室予測日',state:'満室・余裕なし'};
  if(c.peak===9)return {message:when+'に9室使用予測（残り1室）',dateLabel:'最大になる日',state:'注意・残り1室'};
  return {message:'収容予測上は問題なし',dateLabel:'最大になる日',state:'収容可能'};
}
function weanBaseDate(f,id){const date=weanSchedules(f).find(x=>x.id===id)?.date;return date&&date>=f.day?date:f.day;}
function weanOptions(f,id,date){if(!valid(date)||date<f.day||date>f.end)throw Error('離乳の比較日は年間予測の範囲内で選んでください。');const current=f.periods.find(p=>p.id===id&&p.current&&p.actualBirth);if(!current)throw Error('実際の分娩日と現在の授乳を確認できる母豚で比較してください。');return [0,1,2,3,4,5,21].map(n=>{const wean=add(date,n===21?0:n),mating=add(wean,n===21?25:4);return {...compare(f,id,mating,{wean,baseDate:date}),wean,baseDate:date,offset:n,label:n===21?date+' 離乳・1周期見送り':n===0?date+' 予定どおり':wean+'（＋'+n+'日）'};});}
function weanAdvice(options){
  const base=options[0],small=options.filter(x=>x.offset>=1&&x.offset<=5&&x.level==='good').sort((a,b)=>a.offset-b.offset)[0],skip=options.find(x=>x.offset===21);
  if(base.level==='good')return {title:'このまま離乳してよさそう',choice:base,kind:'unchanged'};
  if(small)return {title:'＋'+small.offset+'日離乳で解消',message:small.offset+'日遅らせる案がおすすめ',choice:small,kind:'delay'};
  if(base.peak===10&&base.level==='warn'&&!base.heat?.caution&&!base.uncertain&&!base.unavailable&&!base.earlyWean&&(!base.holdLevel||base.holdLevel==='good'))return {title:'10室で収容可能・余裕なし',message:'満室予測日の入退室を確認してください。収容超過の予測ではありません。',choice:base,kind:'full'};
  if(base.earlyWean){const remaining=Number.isFinite(base.age)?(base.requiredNursingDays??30)-base.age:null,arrival=remaining!==null?add(base.wean,remaining):'';return {title:remaining!==null?'あと'+remaining+'日で授乳'+(base.requiredNursingDays??30)+'日':'授乳日数を確認',message:arrival?arrival+'に、登録済みの実分娩日から'+(base.requiredNursingDays??30)+'日になります。収容・暑熱の注意理由は別に確認してください。':'登録済みの実分娩日を確認してください。',choice:options.find(x=>x.offset>=1&&x.offset<=5&&!x.earlyWean)||base,kind:'check'};}
  if(base.uncertain&&base.peak<=8&&!base.heat?.caution&&(!base.holdLevel||base.holdLevel==='good'))return {title:'日付・退室予定の確認が必要',message:'混雑が解消したと断定できる情報が不足しています。1周期見送りだけでは未確定の情報は解消しません。',choice:base,kind:'check'};
  if(skip&&skip.level!=='bad')return {title:'1周期見送りを検討',message:skip.level==='good'?'1〜5日の調整では解消しません。次の発情を見送る案で改善します。':skip.uncertain?'1〜5日の調整では解消しません。1周期見送りも未確定情報の確認が必要です。':'1周期見送りの案にも注意条件が残ります。詳細の判定理由を確認してください。',choice:skip,kind:'skip'};
  return {title:'別の母豚との重なり調整が必要',message:'1〜5日の調整・1周期見送りでも混雑や暑熱リスクが残ります。',choice:skip||base,kind:'unresolved'};
}
function weanConclusion(options){return weanAdvice(options).title;}
function weanJudgement(f,id){const options=weanOptions(f,id,weanBaseDate(f,id)),base=options[0],advice=weanAdvice(options),capacity=capacitySummary(base),message=base.level==='good'?'このまま離乳してよさそう':base.peak>=11?capacity.message:base.heat.avoid?'次回分娩が8月の分娩回避推奨期間に重なる予測':base.peak>=9?capacity.message:base.heat.caution?'次回分娩が暑熱期間に重なる予測':base.reasons[0]||'離乳日の調整を検討';return {level:base.level,text:verdict(base.level),message,capacity,peak:base.peak,peakDate:base.peakDate,birthCount:base.birthCount,reasons:base.reasons,conclusion:advice.title,advice,options};}
function breedingSchedules(f){return f.rows.flatMap(r=>{const p=f.periods.find(p=>p.id===r.id&&p.basis==='estimate'&&p.mating>=f.day&&p.mating<=f.end);return p?[{id:r.id,date:p.mating,label:'種付け予定（予測）',type:'種付け',forecastBreeding:true}]:[];});}
function entryJudgement(f,id,date){
  date=valid(date)&&date>=f.day?date:f.day;const target=f.rows.find(r=>r.id===id),p=f.periods.find(p=>p.id===id&&p.exit>=date),resident=(f.rooms||[]).some(r=>r.state!=='empty'&&r.sowId===id);
  const days=[];for(let d=date;d<=add(date,7);d=add(d,1)){const enter=!resident&&(!p||!valid(roomStay(p).exit)||d<=roomStay(p).exit),capacity=nearCapacity(f,d,{id,enter});days.push({date:d,...capacity});}
  const max=capacityPeak(days),peak=days.find(d=>d.date===max.date)||days[0],unknown=f.unmodelled.length>0||f.missing.length>0,lev=capacityState(peak.count).over?'bad':capacityState(peak.count).attention||unknown||!target||!p?'warn':'good';
  const message=lev==='bad'?'収容超過予測・日程調整が必要':peak.count===10?'満室予測・収容可能ですが余裕なし':peak.count===9?'残り1室のため注意':lev==='good'?'移入可能':'未確定の在室・日付を確認';
  return {level:lev,text:verdict(lev),message,date,end:add(date,7),onDateCount:days[0].count,capacityDays:days.map(d=>({date:d.date,count:d.count})),peak:peak.count,peakDate:peak.date,empty:(f.rooms||[]).filter(r=>r.state==='empty').length,projectedEmpty:capacityState(days[0].count).empty,neighbours:peak.incoming,overlaps:peak.overlaps,uncertain:unknown||!target||!p,resident};
}
function decision(f,x){if(x.type==='離乳')return weanJudgement(f,x.id);if(x.type==='種付け'){const c=compare(f,x.id,x.date<f.day?f.day:x.date);return {...c,text:verdict(c.level),message:c.level==='good'?'収容・暑熱予測上は問題なし':'次の発情を1周期見送る案も確認'};}if(x.type==='分娩舎へ移動')return entryJudgement(f,x.id,x.date||f.day);return null;}
function weanSchedules(f){return f.periods.filter(p=>p.current&&p.actualBirth&&!p.actualWean).map(p=>({id:p.id,date:add(p.birth,M.plannedWeanDays(p)),label:'離乳予定',type:'離乳',forecastWean:true,roomKey:f.rows.find(r=>r.id===p.id)?.roomKey||''}));}
root.TanakaForecast={capacityState,capacityAt,capacityDays,capacityPeak,unknownRoomStays,intersects,valid,normalizeDate,add,months,distance,heat,level,status,period,pigletMove,roomStay,occupanciesFor,build,riskSegments,overlapsAt,compare,capacitySummary,weanOptions,weanBaseDate,weanJudgement,weanSchedules,weanConclusion,weanAdvice,breedingSchedules,entryJudgement,decision,nearCapacity,verdict};
})(typeof globalThis!=='undefined'?globalThis:this);
