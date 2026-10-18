/* Read-only projections. No migration, ledger writes or automatic date changes. */
(function(root){
'use strict';
const M=root.TanakaModel,DAY=86400000;
const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const add=(s,n)=>M.addDays(s,n),distance=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/DAY);
function months(date,n){const d=new Date(date+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);}
function heat(day){const md=day.slice(5);return {caution:md>='07-21'&&md<='09-10',avoid:md>='08-01'&&md<='08-31'};}
const level=n=>n>=11?'over':n===10?'full':n===9?'caution':'normal';
const status=n=>({over:'オーバー',full:'満室',caution:'注意',normal:'通常'})[level(n)];
function period(id,mating,first,source='基本周期から予測'){
  const due=add(mating,114),birth=add(due,7);return {id,mating,due,birth,entry:add(due,first?-7:-4),exit:add(birth,30),first,basis:'estimate',source,actualBirth:false,actualWean:false,current:false,uncertain:false};
}
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
  if(childRooms.length)warnings.push('離乳後の子豚が残る '+childRooms.length+'室は移動日未定です。今日の室数に含め、明日以降の空きは要確認です。');
  for(const target of rows){
    const s=target.sow,logs=data.logs.map((l,i)=>({...l,index:i})).filter(l=>!l.legacy&&l.id===target.id&&valid(l.date)).sort((a,b)=>a.date.localeCompare(b.date)||a.index-b.index);
    const last=t=>logs.filter(l=>l.type===t).at(-1),card=s?(root.TanakaSowParity.pages(data,s.id)[0]?.card||s.cardBaseline||{}):{};
    const pick=(value,fallback)=>valid(value)?value:valid(fallback)?fallback:'';
    const mating=pick(card.mating,last('種付け')?.date),birth=pick(card.birthDateActual,last('分娩')?.date),wean=pick(card.weanDateActual,last('離乳')?.date);
    const room=state.rooms.find(r=>['family','waiting'].includes(r.state)&&r.sowId===target.id);
    const parityKnown=card.parity!==undefined&&card.parity!==null&&card.parity!=='';
    const first=target.gilt||(!birth&&(!parityKnown||Number(card.parity)===0));target.first=first;target.parityUnknown=!target.gilt&&!birth&&!parityKnown;target.roomKey=room?.key||'';
    if(target.parityUnknown)warnings.push(target.label+'：産次未入力のため、最初の入室を初産と同じ7日前で仮置きします。');
    let p=null,nextMating='',reason='';
    const currentBirth=room?.state==='family'?pick(M.roomBirthDate(data,room),s?.parityCards?.current.card.birthDateActual):birth;
    if(currentBirth&&(!mating||currentBirth>=mating)&&(!wean||currentBirth>wean||room?.state==='family')){
      const due=mating?add(mating,114):add(currentBirth,-7),entry=logs.filter(l=>l.type==='分娩舎へ移動'&&l.date<=currentBirth).at(-1)?.date||[add(due,first?-7:-4),currentBirth].sort()[0];
      const knownWean=wean&&wean>=currentBirth&&!room?wean:'';
      p={id:target.id,mating,due,birth:currentBirth,entry,exit:knownWean||add(currentBirth,30),first,basis:'record',source:'実際の分娩日'+(knownWean?'・離乳日':'＋標準離乳30日'),actualBirth:true,actualWean:!!knownWean,current:!!room,uncertain:false};
      if(room&&p.exit<day){p.exit=day;p.uncertain=true;p.source+='（離乳予定超過・今日退室する仮定）';warnings.push(target.label+'：離乳予定を過ぎています。実際の在室・離乳記録を確認してください。');}
      nextMating=add(p.exit,4);
    }else if(mating&&(!birth||mating>birth)){
      p=period(target.id,mating,first,'記録済み種付け日＋標準日数');p.basis='record';
      if(valid(card.due)){p.due=card.due;p.entry=add(p.due,first?-7:-4);p.birth=add(p.due,7);p.exit=add(p.birth,30);p.source='カードの分娩予定日＋7日・授乳30日';}
      if(p.birth<day){p.birth=day;p.exit=add(day,30);p.uncertain=true;p.source+='（分娩未記録・今日分娩する仮定）';warnings.push(target.label+'：分娩予測日を過ぎています。分娩・離乳の記録を確認してください。');}
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
      if(legacyDue){p=period(target.id,add(legacyDue,-114),first,valid(card.due)?'カードの分娩予定日（年月日）':'元カードの分娩予定（年は既存の予定表示に準拠）');p.basis='record';if(p.birth<day){p.birth=day;p.exit=add(day,30);p.uncertain=true;p.source+='・予定超過、今日分娩する仮定';warnings.push(target.label+'：元カードの予定が過ぎています。実績を確認してください。');}p.current=!!room;nextMating=add(p.exit,4);}
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
  const days=[];for(let date=day;date<=end;date=add(date,1)){
    const overlaps=periods.filter(p=>p.entry<=date&&p.exit>=date),known=new Set(overlaps.filter(p=>p.current).map(p=>p.id));
    const unmodelled=date===day?occupied.filter(r=>!known.has(r.sowId)||r.state==='piglets'):[];
    days.push({date,count:overlaps.length+unmodelled.length,overlaps,unmodelled,heat:heat(date)});
  }
  return {day,end,rows,periods,days,warnings,childRooms,unmodelled:occupied.filter(r=>r.state==='piglets'||!periods.some(p=>p.current&&p.id===r.sowId)),missing:rows.filter(r=>r.missing),peak:Math.max(0,...days.map(d=>d.count))};
}
function riskSegments(f){const out=[];for(const d of f.days){if(d.count<9)continue;const type=level(d.count),previous=out.at(-1);if(previous&&previous.level===type&&add(previous.end,1)===d.date){previous.end=d.date;if(d.count>previous.peak){previous.peak=d.count;previous.peakDate=d.date;}}else out.push({start:d.date,end:d.date,level:type,peak:d.count,peakDate:d.date});}return out;}
function overlapsAt(f,date,periods=f.periods){return periods.filter(p=>p.entry<=date&&p.exit>=date);}
function peakBetween(periods,start,end){let count=0,date=start;for(let d=start;d<=end;d=add(d,1)){const n=periods.filter(p=>p.entry<=d&&p.exit>=d).length;if(n>count){count=n;date=d;}}return {count,date};}
function compare(f,id,mating,options={}){
  const target=f.rows.find(x=>x.id===id);if(!target||!valid(mating)||mating<f.day||mating>f.end)throw Error('予測対象の母豚と種付け日を確認してください。');
  const current=f.periods.find(p=>p.id===id&&((p.current&&p.actualBirth)||(p.basis==='record'&&p.mating&&p.mating<=f.day&&p.exit>=f.day))),first=target.first&&!current;
  const proposed=period(id,mating,first,'シミュレーション（保存しません）');proposed.key='simulation';
  const other=f.periods.filter(p=>p.id!==id),all=other.slice();
  if(current){const c={...current};if(options.wean)c.exit=options.wean;all.push(c);}
  all.push(proposed);
  const peak=peakBetween(all,proposed.entry,proposed.exit),heatState=heat(proposed.birth);
  const overlapping=other.filter(p=>p.entry<=proposed.exit&&p.exit>=proposed.entry),ids=new Set();
  const neighbours=overlapping.filter(p=>{if(ids.has(p.id))return false;ids.add(p.id);return true;});
  const uncertain=f.missing.length>0||f.rows.some(r=>r.parityUnknown)||f.unmodelled.length>0||f.periods.some(p=>p.uncertain),bad=peak.count>=10||heatState.avoid,warn=peak.count===9||heatState.caution||uncertain;
  const currentEnd=options.wean||current?.exit,unavailable=!!current&&mating<add(currentEnd,4),age=current&&options.wean?distance(current.birth,options.wean):null;
  return {mating,...proposed,peak:peak.count,peakDate:peak.date,heat:heatState,neighbours,level:bad?'bad':warn||unavailable||age!==null&&age<30?'warn':'good',uncertain,unavailable,earlyWean:age!==null&&age<30,age,currentExit:currentEnd||'',currentDelta:current&&options.wean?distance(current.exit,options.wean):0,currentPeak:currentEnd?Math.max(peakBetween(all,f.day,currentEnd>=f.day?currentEnd:f.day).count,overlapsAt(f,f.day,all).length+f.unmodelled.length):null};
}
function weanOptions(f,id,date){if(!valid(date)||date<f.day||date>add(f.day,30))throw Error('離乳の比較日は今日から30日以内で選んでください。');const current=f.periods.find(p=>p.id===id&&p.current&&p.actualBirth);if(!current)throw Error('実際の分娩日と現在の授乳を確認できる母豚で比較してください。');return [0,1,2,3,4,5,21].map(n=>{const wean=add(date,n===21?0:n),mating=add(wean,n===21?25:4);return {...compare(f,id,mating,{wean}),wean,offset:n,label:n===21?(date===f.day?'今日':'基準日に')+'離乳・1周期見送り':n===0?(date===f.day?'今日離乳':'基準日に離乳'):n+'日遅らせる'};});}
function weanJudgement(f,id){const options=weanOptions(f,id,f.day),base=options[0];if(base.level==='good')return {level:'good',text:'〇 今日離乳して問題なし',options};if(base.level==='warn'||options.some(x=>x.level==='good'))return {level:'warn',text:'△ 離乳日の調整を検討',options};return {level:'bad',text:'× 注意：次回分娩が混雑・真夏に重なる',options};}
function weanSchedules(f){return f.periods.filter(p=>p.current&&p.actualBirth&&!p.actualWean).map(p=>({id:p.id,date:add(p.birth,30),label:'離乳予定',type:'離乳',forecastWean:true,roomKey:f.rows.find(r=>r.id===p.id)?.roomKey||''}));}
root.TanakaForecast={valid,add,months,distance,heat,level,status,period,build,riskSegments,overlapsAt,compare,weanOptions,weanJudgement,weanSchedules};
})(typeof globalThis!=='undefined'?globalThis:this);
