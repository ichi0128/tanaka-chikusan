/* Per-parity cards are detached snapshots; barn event replay stays unchanged. */
(function(root){
'use strict';
const M=root.TanakaModel,clone=M.clone;
const blank=(s,parity)=>({birth:s.cardBaseline?.birth||'',mother:s.cardBaseline?.mother||'',parity,boar:'',mating:'',reheat:'',due:'',wean:'',result:'',csf:'',swimgen:'',reheatCount:'',history:[],birthDateActual:'',weanDateActual:''});
const number=v=>v!==''&&v!==null&&v!==undefined&&Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
function apply(card,events){
  for(const l of events){
    if(l.type==='種付け'){
      card.boar=l.boar||'';card.mating=l.date;card.reheat=M.addDays(l.date,21);card.due=M.addDays(l.date,114);card.swimgen=M.addDays(l.date,100);
      if(l.remating)card.reheatCount=(Number(card.reheatCount)||0)+1;
    }
    if(l.type==='分娩'){card.birthDateActual=l.date;card.birthTime=l.birthTime||'';card.birthCount=l.count??null;card.stillborn=l.stillborn??null;card.birthNote=l.note||'';card.result=(l.count??'')+'－';}
    if(l.type==='離乳'){card.wean=l.date;card.weanDateActual=l.date;card.weanCount=l.count??null;card.weanNote=l.note||'';card.result=(card.birthCount??'')+'－'+(l.count??'');}
    if(l.type==='スイムジェン 実施')card.swimgen=l.date+' 済';
  }
  return card;
}
function events(data,id){return data.logs.map((l,i)=>({l,i})).filter(x=>!x.l.legacy&&x.l.id===id).sort((a,b)=>a.l.date.localeCompare(b.l.date)||a.i-b.i).map(x=>x.l);}
function pages(data,id){
  const s=data.sows.find(s=>s.id===id);if(!s)return [];
  const logs=events(data,id),managed=s.parityCards;
  if(managed){
    const current=clone(managed.current),known=new Set(current.capturedKeys||[]);
    apply(current.card,logs.filter(l=>!known.has(l.key)));
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
    const mating=logs.slice(previous+1,at).filter(l=>l.type==='種付け');
    const parity=base===null?null:base+i+1,card=blank(s,parity);
    apply(card,[...mating,b,...logs.slice(at+1,end).filter(l=>l.type==='離乳'||l.type==='スイムジェン 実施')]);
    out.push({key:'birth:'+b.key,parity,card,source:'出産履歴',revisions:[]});
  }
  const lastBirth=births.at(-1),after=lastBirth?logs.slice(logs.indexOf(lastBirth)+1):logs;
  const lastWean=after.filter(l=>l.type==='離乳').at(-1),pending=after.filter(l=>l.type==='種付け'&&(!lastWean||logs.indexOf(l)>logs.indexOf(lastWean)));
  if(lastBirth&&pending.length){const parity=base===null?null:base+births.length+1;out.push({key:'mating:'+pending[0].key,parity,card:apply(blank(s,parity),after.slice(after.indexOf(pending[0])).filter(l=>l.type!=='離乳')),source:'作業履歴',revisions:[]});}
  else if(!lastBirth){apply(out.find(p=>p.key==='baseline').card,logs);}
  // Do not infer a year's date or populate missing older parities.
  return out.reverse();
}
function ensure(data,id){
  const s=data.sows.find(s=>s.id===id);if(!s)throw Error('母豚が見つかりません。');
  if(!s.parityCards){const all=pages(data,id).reverse(),current=all.pop();s.parityCards={version:1,history:all,current:{...current,capturedKeys:events(data,id).map(l=>l.key)}};}
  return s.parityCards;
}
function start(data,id,expected){
  const before=pages(data,id);if(expected!==undefined&&JSON.stringify(before)!==expected)throw Error('カードが更新されました。開き直してください。');
  const s=data.sows.find(s=>s.id===id),latest=before[0],parity=number(latest.parity);if(parity===null)throw Error('現在の産次を入力してから新しい産次を開始してください。');
  const store=ensure(data,id),archived={...clone(latest),savedAt:new Date().toISOString()};delete archived.capturedKeys;store.history.push(archived);
  store.current={key:M.uid(),parity:parity+1,card:blank(s,parity+1),capturedKeys:events(data,id).map(l=>l.key),source:'新しい産次',revisions:[]};
}
function beforeRecord(data,id,log){
  const current=pages(data,id)[0];if(!current)return;
  if(log.type==='種付け'&&!log.remating&&current.card.birthDateActual&&current.card.weanDateActual)start(data,id);
  else if(log.type==='分娩'&&current.source==='元カード'){
    start(data,id);
    const card=data.sows.find(s=>s.id===id).parityCards.current.card;
    for(const k of ['boar','mating','reheat','due','swimgen','csf','reheatCount'])card[k]=clone(current.card[k]??'');
  }
}
function edit(data,id,key,card,expected){
  const list=pages(data,id),old=list.find(p=>p.key===key);if(!old||JSON.stringify(old)!==expected)throw Error('カードが更新されました。開き直してください。');
  const store=ensure(data,id),target=store.current.key===key?store.current:store.history.find(p=>p.key===key);
  target.revisions=[...(target.revisions||[]),{savedAt:new Date().toISOString(),card:clone(old.card)}];target.card=clone(card);target.parity=number(card.parity);target.updatedAt=new Date().toISOString();
  if(target===store.current)target.capturedKeys=events(data,id).map(l=>l.key);
}
const validate=M.validate;
M.validate=function(data){validate(data);for(const s of data.sows){if(!s.parityCards)continue;const p=s.parityCards;if(p.version!==1||!Array.isArray(p.history)||!p.current)throw Error('母豚の産次カード形式を確認してください。');const keys=new Set();for(const x of [...p.history,p.current]){if(!x||typeof x.key!=='string'||keys.has(x.key)||!x.card||typeof x.card!=='object'||(x.parity!==null&&number(x.parity)===null)||!Array.isArray(x.revisions))throw Error('母豚の産次カードを確認してください。');keys.add(x.key);}if(!Array.isArray(p.current.capturedKeys))throw Error('母豚カードの履歴を確認してください。');}};
const migrate=M.migrate,commit=M.commit;
M.migrate=function(raw){const data=migrate(raw);M.validate(data);return data;};
M.commit=function(data,fn){const next=commit(data,fn);M.validate(next);return next;};
root.TanakaSowParity={pages,start,edit,beforeRecord};
})(typeof globalThis!=='undefined'?globalThis:this);
