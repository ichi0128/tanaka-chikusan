/* Per-parity cards are detached snapshots; barn event replay stays unchanged. */
(function(root){
'use strict';
const M=root.TanakaModel,clone=M.clone;
const blank=(s,parity)=>({birth:s.cardBaseline?.birth||'',mother:s.cardBaseline?.mother||'',parity,boar:'',mating:'',reheat:'',due:'',wean:'',result:'',csf:'',swimgen:'',reheatCount:'',history:[],birthDateActual:'',weanDateActual:''});
const number=v=>v!==''&&v!==null&&v!==undefined&&Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
function apply(card,events){
  for(const l of events){
    M.applyReproductionEvent(card,l);
    if(l.type==='分娩'){card.wean='';card.weanDateActual='';card.weanCount=null;card.weanNote='';card.weanOperator='';card.nursingDays=null;card.birthDateActual=l.date;card.birthTime=l.birthTime||'';card.birthCount=l.count??null;card.stillborn=l.stillborn??null;card.birthNote=l.note||'';card.result=(l.count??'')+'－';}
    if(l.type==='離乳'){
      if(!card.birthDateActual&&l.birthDate)card.birthDateActual=l.birthDate;
      if(card.birthCount==null&&Number.isInteger(l.sourceRoom?.birthCount))card.birthCount=l.sourceRoom.birthCount;
      card.wean=l.date;card.weanDateActual=l.date;card.weanCount=l.count??null;card.weanNote=l.note||'';card.result=(card.birthCount??'')+'－'+(l.count??'');
      if(l.nursingDays!==undefined)card.nursingDays=l.nursingDays;
      if(l.operator)card.weanOperator=l.operator;
    }
    if(l.type==='スイムジェン 実施')card.swimgen=l.date+' 済';
  }
  return card;
}
function events(data,id){return data.logs.map((l,i)=>({l,i})).filter(x=>!x.l.legacy&&x.l.id===id).sort((a,b)=>a.l.date.localeCompare(b.l.date)||a.i-b.i).map(x=>x.l);}
function rawPages(data,id){
  const s=data.sows.find(s=>s.id===id);if(!s)return [];
  const logs=events(data,id),managed=s.parityCards;
  if(managed){
    const current=clone(managed.current),known=new Set(current.capturedKeys||[]);
    apply(current.card,logs.filter(l=>!known.has(l.key)));
    M.reconcileMating(current.card,logs);
    M.resetSwimgenAfterBirth(current.card,logs);
    return [...clone(managed.history),current].reverse();
  }
  const base=number(s.cardBaseline?.parity),out=[{key:'baseline',parity:base,card:{...blank(s,base),...clone(s.cardBaseline||{})},source:'元カード',revisions:[]}];
  const older=new Map();
  for(const candidate of [s.cardBaselineOriginal,...(s.cardRevisions||[]).flatMap(x=>[x.before,x.after])]){
    const n=number(candidate?.parity);if(n!==null&&base!==null&&n<base)older.set(n,clone(candidate));
  }
  out.unshift(...[...older].sort((a,b)=>a[0]-b[0]).map(([parity,card])=>({key:'legacy:'+parity,parity,card,source:'保存済み元カード',revisions:[]})));
  const births=logs.filter(l=>l.type==='分娩');
  for(let i=0;i<births.length;i++){
    const b=births[i],at=logs.indexOf(b),end=i+1<births.length?logs.indexOf(births[i+1]):logs.length,previous=i?logs.indexOf(births[i-1]):-1;
    const mating=logs.slice(previous+1,at).filter(l=>['種付け','再発情確認'].includes(l.type));
    const parity=base===null?null:base+i+1,card=blank(s,parity);
    apply(card,[...mating,b,...logs.slice(at+1,end).filter(l=>l.type==='離乳'||l.type==='スイムジェン 実施'||l.type==='再発情確認')]);
    out.push({key:'birth:'+b.key,parity,card,source:'出産履歴',revisions:[]});
  }
  const lastBirth=births.at(-1),after=lastBirth?logs.slice(logs.indexOf(lastBirth)+1):logs;
  const lastWean=after.filter(l=>l.type==='離乳').at(-1),pending=after.filter(l=>l.type==='種付け'&&(!lastWean||logs.indexOf(l)>logs.indexOf(lastWean)));
  if(lastBirth&&pending.length){const parity=base===null?null:base+births.length+1;out.push({key:'mating:'+pending[0].key,parity,card:apply(blank(s,parity),after.slice(after.indexOf(pending[0])).filter(l=>l.type!=='離乳')),source:'作業履歴',revisions:[]});}
  else if(!lastBirth){apply(out.find(p=>p.key==='baseline').card,logs);}
  // Do not infer a year's date or populate missing older parities.
  return out.reverse();
}
// Weaning prepares the next parity; mating fills it without another increment.
function waitingPage(s,completed,logs){
  const previous=number(completed.parity),parity=previous===null?null:previous+1;
  const c=completed.card,card={...blank(s,parity),birth:c.birth||'',mother:c.mother||'',csf:c.csf||'',wean:c.weanDateActual||'',weanDateActual:c.weanDateActual||'',weanCount:c.weanCount??null,birthCount:null,stillborn:null,nursingDays:null,reheatPending:false,cycleCompleted:true,reproductionStatus:'離乳済み／次回発情待ち'};
  return {key:'postwean:'+completed.key,parity,card,source:'離乳後・次回種付け待ち',revisions:[],awaitingMating:true,completedKey:completed.key,capturedKeys:logs.map(l=>l.key)};
}
function pages(data,id){
  const all=rawPages(data,id),current=all[0],s=data.sows.find(s=>s.id===id);if(!current)return all;
  if(current.awaitingMating){
    const completed=all.find(p=>p.key===current.completedKey);
    if(completed){const n=number(completed.parity);current.parity=n===null?null:n+1;current.card.parity=current.parity;for(const k of ['wean','weanDateActual','weanCount'])current.card[k]=clone(completed.card[k]??(k==='weanCount'?null:''));}
    return all;
  }
  // Existing weaning records are projected read-only; opening a card never migrates storage.
  const logs=events(data,id),last=logs.filter(l=>['種付け','分娩','離乳'].includes(l.type)).at(-1);
  if(last?.type!=='離乳'||current.card.weanDateActual!==last.date)return all;
  const mating=String(current.card.mating||'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(mating)&&mating>last.date)return all;
  const md=/^(\d{1,2})\/(\d{1,2})$/.exec(mating);
  if(md){let year=Number(last.date.slice(0,4));if(Number(md[1])-Number(last.date.slice(5,7))>6)year--;const date=year+'-'+md[1].padStart(2,'0')+'-'+md[2].padStart(2,'0');if(date>last.date)return all;}
  const completed={...current,card:apply(clone(current.card),[last]),completedAt:last.date,completionLogKey:last.key};
  return [waitingPage(s,completed,logs),completed,...all.slice(1)];
}
// Display previous results during pregnancy without copying those results into
// the new parity's actual birth fields, forecast inputs or editable history rows.
function cardPerformance(card){
  let born=number(card.birthCount),weaned=number(card.weanCount);
  // Older cards stored both counts only in the result string. Use that saved
  // pair only when it agrees with every explicit count; never carry a stale pair
  // into a different birth or replace an explicit zero.
  const pair=/^\s*(\d+)\s*(?:→|－|―|-)\s*(\d+)\s*$/.exec(String(card.result||''));
  if(pair&&(born===null||born===number(pair[1]))&&(weaned===null||weaned===number(pair[2]))){born=born??number(pair[1]);weaned=weaned??number(pair[2]);}
  const result=born!==null||weaned!==null?(born??'')+'－'+(weaned??''):String(card.result||'');
  return {birthCount:born,weanCount:weaned,wean:card.weanDateActual||card.wean||'',result};
}
function performance(data,id,key){
  const all=pages(data,id),current=all[0],selected=key?all.find(p=>p.key===key):current;
  if(!selected)return cardPerformance({});
  const card=selected.card;
  if(selected!==current||card.birthDateActual)return cardPerformance(card);
  const prior=all.slice(1).filter(p=>
    (current.completedKey===p.key||number(p.parity)!==null&&number(current.parity)!==null&&number(p.parity)<number(current.parity))&&
    (p.card.weanDateActual||p.card.wean)&&
    (number(p.card.birthCount)!==null||number(p.card.weanCount)!==null||p.card.result)
  ).sort((a,b)=>(number(b.parity)??-1)-(number(a.parity)??-1));
  if(prior.length)return {...cardPerformance(prior[0].card),previous:true,sourceKey:prior[0].key};
  // Legacy cards may have no detached history yet. Recover only recorded facts
  // from the latest weaning and its source room; never manufacture a count.
  const logs=events(data,id),wean=logs.filter(l=>l.type==='離乳').at(-1);
  if(wean){
    const birth=logs.filter(l=>l.type==='分娩'&&l.date<=wean.date).at(-1);
    return {...cardPerformance({birthCount:wean.sourceRoom?.birthCount??birth?.count??null,weanCount:wean.count??null,weanDateActual:wean.date}),previous:true,sourceKey:wean.key};
  }
  return cardPerformance(card);
}
function ensure(data,id){
  const s=data.sows.find(s=>s.id===id);if(!s)throw Error('母豚が見つかりません。');
  const all=pages(data,id),current=all[0];
  if(!s.parityCards){s.parityCards={version:1,history:all.slice(1).reverse(),current:{...current,capturedKeys:events(data,id).map(l=>l.key)}};}
  else if(current.awaitingMating&&s.parityCards.current.key!==current.key){
    // Materialize the already saved completion only during an explicit edit/action.
    s.parityCards.history=all.slice(1).reverse();s.parityCards.current=clone(current);
  }
  return s.parityCards;
}
function start(data,id,expected){
  const before=pages(data,id);if(expected!==undefined&&JSON.stringify(before)!==expected)throw Error('カードが更新されました。開き直してください。');
  const s=data.sows.find(s=>s.id===id),latest=before[0],parity=number(latest.parity);if(parity===null)throw Error('現在の産次を入力してから新しい産次を開始してください。');
  const store=ensure(data,id),archived={...clone(latest),savedAt:new Date().toISOString()};delete archived.capturedKeys;if(!latest.awaitingMating)store.history.push(archived);
  const nextParity=latest.awaitingMating?parity:parity+1,next=blank(s,nextParity);if(latest.awaitingMating){for(const k of ['birth','mother','csf','wean'])next[k]=latest.card[k]||'';}
  store.current={key:M.uid(),parity:nextParity,card:next,capturedKeys:events(data,id).map(l=>l.key),source:'新しい産次',revisions:[]};
}
function matingReturnKey(data,id,date){
  const current=pages(data,id)[0],card=current?.card;
  if(!card||current.awaitingMating)return '';
  return card.lastReheatKey&&(card.reheatPending||card.lastReheatDate<=date)?card.lastReheatKey:'';
}
function beforeRecord(data,id,log){
  M.assertUniqueMating(data,log);
  const current=pages(data,id)[0];if(!current)return;
  if(log.type==='離乳'){
    if(current.awaitingMating)throw Error('この産次は離乳済みです。記録を確認してください。');
    const store=ensure(data,id),completed={...clone(current),card:apply(clone(current.card),[log]),completedAt:log.date,completionLogKey:log.key,savedAt:new Date().toISOString()};delete completed.capturedKeys;
    store.history.push(completed);store.current=waitingPage(data.sows.find(s=>s.id===id),completed,[...events(data,id),log]);return;
  }
  if(log.type==='分娩'&&current.awaitingMating){start(data,id);return;}
  if(log.type==='種付け'&&current.awaitingMating){start(data,id);log.remating=false;delete log.reheatConfirmationKey;return;}
  if(log.type==='再発情確認'){
    if(current.card.reheatPending)throw Error('既に再種付け待ちです。実際に種付けしたときに記録してください。');
    const store=ensure(data,id);
    if(store.current.source==='元カード')store.current.source='作業履歴';
    log.failedMating={date:current.card.mating||'',boar:current.card.boar||'',due:current.card.due||'',parity:current.parity};
    return;
  }
  if(log.type==='種付け'){const key=matingReturnKey(data,id,log.date);if(key){log.remating=true;log.reheatConfirmationKey=key;return;}}
  if(log.type==='種付け'&&!log.remating&&current.card.birthDateActual&&current.card.weanDateActual)start(data,id);
  else if(log.type==='分娩'&&current.source==='元カード'){
    start(data,id);
    const card=data.sows.find(s=>s.id===id).parityCards.current.card;
    for(const k of ['boar','mating','reheat','due','swimgen','csf','reheatCount'])card[k]=clone(current.card[k]??'');
    if(current.card.plannedWeanDays!==undefined)card.plannedWeanDays=current.card.plannedWeanDays;
  }
}
function edit(data,id,key,card,expected){
  const list=pages(data,id),old=list.find(p=>p.key===key);if(!old||JSON.stringify(old)!==expected)throw Error('カードが更新されました。開き直してください。');
  const store=ensure(data,id),target=store.current.key===key?store.current:store.history.find(p=>p.key===key);
  target.revisions=[...(target.revisions||[]),{savedAt:new Date().toISOString(),card:clone(old.card)}];target.card=clone(card);target.parity=number(card.parity);target.updatedAt=new Date().toISOString();
  if(target===store.current)target.capturedKeys=events(data,id).map(l=>l.key);
}
function setWeanDays(data,{id,roomKey,birthDate,days,expectedDays}){
  if(!Number.isInteger(days)||days<1||days>365)throw Error('離乳日数は1〜365日の整数で設定してください。');
  const room=M.replay(data).rooms.find(r=>r.key===roomKey),current=pages(data,id)[0];
  if(!room||!['family','waiting'].includes(room.state)||room.mixed||room.sowId!==id||!current||current.awaitingMating)throw Error('対象の母豚と分娩舎を確認してください。');
  if((room.state==='family'?M.roomBirthDate(data,room)||'':'')!==(birthDate||'')||M.plannedWeanDays(current.card)!==expectedDays)throw Error('離乳設定が更新されました。カードを開き直してください。');
  edit(data,id,current.key,{...clone(current.card),plannedWeanDays:days},JSON.stringify(current));
}
// The compact history is a view of the existing parity cards, never a second ledger.
const historyCounts=['birthCount','weanCount','nursingDays','foster','fosterOut','fosterIn','blackPiglets','crushed','weakDeaths','stillborn'];
const historyDates=['mating','due','birthDateActual','weanDateActual'];
function historyDate(value){
  const text=String(value??'').trim();if(!text)return '';
  const full=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text),md=/^(\d{1,2})\/(\d{1,2})$/.exec(text);
  if(!full&&!md)throw Error('日付は 4/4 または 2026-04-04 の形で入力してください。');
  const year=full?Number(full[1]):2000,month=Number(full?full[2]:md[1]),day=Number(full?full[3]:md[2]);
  const iso=String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'),date=new Date(iso+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)throw Error('存在する日付を入力してください。');
  return full?iso:month+'/'+day;
}
function historyRows(data,id){const all=pages(data,id).filter(p=>!p.awaitingMating),current=all.shift();all.sort((a,b)=>(a.parity??9999)-(b.parity??9999)||String(a.card.birthDateActual||'').localeCompare(String(b.card.birthDateActual||'')));return [...all,...(current?[current]:[])];}
function editHistory(data,id,key,patch,expected){
  const old=pages(data,id).find(p=>p.key===key);if(!old||JSON.stringify(old)!==expected)throw Error('カードが更新されました。開き直してください。');
  const card=clone(old.card);
  for(const [name,value] of Object.entries(patch)){
    if(name==='parity'){
      const text=String(value??'').trim();
      if(text&&(!/^\d+$/.test(text)||!Number.isSafeInteger(Number(text))))throw Error('産次は0以上の整数で入力してください。');
      const parity=text?Number(text):null;
      if(parity!==null&&parity!==old.parity&&pages(data,id).some(p=>p.key!==key&&p.parity===parity))throw Error('同じ産次の履歴が既にあります。産次を確認してください。');
      card.parity=parity;
    }
    else if(historyDates.includes(name))card[name]=historyDate(value);
    else if(historyCounts.includes(name)){const text=String(value??'').trim();if(text&&!/^\d+$/.test(text)||text&&!Number.isSafeInteger(Number(text)))throw Error('頭数・日数は0以上の整数で入力してください。');card[name]=text?Number(text):null;}
    else if(['birthNote','weanNote','note'].includes(name))card[name]=String(value??'');
    else throw Error('編集する項目を確認してください。');
  }
  if('birthCount' in patch||'weanCount' in patch)card.result=(card.birthCount??'')+'－'+(card.weanCount??'');
  if('weanDateActual' in patch&&(card.weanDateActual||card.wean===old.card.weanDateActual))card.wean=card.weanDateActual;
  edit(data,id,key,card,expected);
}
const validate=M.validate;
M.validate=function(data){validate(data);for(const s of data.sows){if(!s.parityCards)continue;const p=s.parityCards;if(p.version!==1||!Array.isArray(p.history)||!p.current)throw Error('母豚の産次カード形式を確認してください。');const keys=new Set();for(const x of [...p.history,p.current]){if(x?.card?.plannedWeanDays!==undefined&&(!Number.isInteger(x.card.plannedWeanDays)||x.card.plannedWeanDays<1||x.card.plannedWeanDays>365))throw Error('産次ごとの離乳日数を確認してください。');if(!x||typeof x.key!=='string'||keys.has(x.key)||!x.card||typeof x.card!=='object'||(x.parity!==null&&number(x.parity)===null)||!Array.isArray(x.revisions))throw Error('母豚の産次カードを確認してください。');keys.add(x.key);}if(!Array.isArray(p.current.capturedKeys))throw Error('母豚カードの履歴を確認してください。');}};
const migrate=M.migrate,commit=M.commit;
M.migrate=function(raw){const data=migrate(raw);M.validate(data);return data;};
M.commit=function(data,fn){const next=commit(data,fn);M.validate(next);return next;};
root.TanakaSowParity={performance,cardPerformance,pages,start,edit,beforeRecord,historyRows,editHistory,matingReturnKey,setWeanDays};
})(typeof globalThis!=='undefined'?globalThis:this);
