/* Field actions use append-only receipts. Undo handlers validate current state,
   then append a compensating record; work history is never deleted. */
(function(root){
'use strict';
const M=root.TanakaModel,P=root.TanakaSowParity,clone=M.clone,handlers=new Map();
function roomLabel(room){const label=String(room?.label||'').trim()||String(Number(String(room?.key||'').replace(/^r/,'')));return /^\d+$/.test(label)?label+'号室':label;}
function roomLocation(room){return {area:'farrowing',key:room.key,number:String(room.label||Number(room.key.slice(1))),name:'分娩舎'+roomLabel(room)};}
function yardOrigin(sow){
  if(sow.location?.area==='yard')return clone(sow.location);
  const parcel=sow.yardLocation;
  if(parcel){const name=typeof parcel==='string'?parcel:parcel.name||parcel.label||'';return {area:'yard',name:name?(String(name).startsWith('運動場')?name:'運動場 '+name):'運動場',parcel:clone(parcel)};}
  return {area:'yard',name:'運動場'};
}
function stamp(type,id,options={}){return {key:options.key||M.uid(),type,id,date:options.date,t:options.t||new Date().toISOString(),origin:options.origin||'operator',note:options.note||''};}
function entry(data,{id,roomKey,expectedRoom,...options}){
  const state=M.replay(data),sow=state.sows[id],room=state.rooms.find(r=>r.key===roomKey);
  if(root.TanakaNurseryYard?.inNursery(state,id))throw Error('この母豚は育成舎にいます。先に対象個体の移動を確認してください。');
  if(!sow?.active||sow.numberPending)throw Error('移動できる現役母豚を選んでください。');
  if(state.rooms.some(r=>['waiting','family'].includes(r.state)&&r.sowId===id))throw Error('この母豚は既に分娩舎にいます。');
  if(!room||room.state!=='empty')throw Error('選択した部屋は空いていません。移動先を選び直してください。');
  if(expectedRoom!==undefined&&JSON.stringify(room)!==expectedRoom)throw Error('部屋の状態が変わりました。移動先を選び直してください。');
  const log=stamp('分娩舎へ移動',id,options),from=yardOrigin(sow),to=roomLocation(room),after={...clone(room),state:'waiting',sowId:id,mixed:false,count:null,birthDate:'',entryKey:log.key};
  log.roomKey=roomKey;log.movement={version:1,from,to};
  log.action={version:1,kind:'farrowing-entry',before:{room:clone(room),location:from,hadYardLocation:Object.hasOwn(sow,'yardLocation'),...(Object.hasOwn(sow,'yardLocation')?{yardLocation:clone(sow.yardLocation)}:{})},after:{room:after,location:to}};
  data.logs.push(log);return log;
}
function returnContext(data,roomKey,expectedEntry){
  const state=M.replay(data),room=state.rooms.find(r=>r.key===roomKey);
  if(!room||room.state!=='waiting')throw Error('出産前の分娩待ちだけ運動場へ戻せます。');
  if(expectedEntry!==undefined&&(room.entryKey||'')!==expectedEntry)throw Error('移動記録が変わりました。開き直してください。');
  const original=data.logs.find(l=>l.key===room.entryKey&&l.type==='分娩舎へ移動'&&l.id===room.sowId&&l.roomKey===roomKey);
  if(original?.action?.after?.room&&!M.sameData(room,original.action.after.room))throw Error('移動後に部屋の内容が変更されています。現在の記録を確認してください。');
  return {room,original,to:clone(original?.movement?.from||yardOrigin(state.sows[room.sowId]))};
}
function returnToYard(data,{roomKey,expectedEntry,...options}){
  const {room,original,to}=returnContext(data,roomKey,expectedEntry),log=stamp('移動取り消し',room.sowId,options);
  log.roomKey=room.key;log.undoOf=original?.key||'';log.movement={version:1,from:clone(original?.movement?.to||roomLocation(room)),to};
  log.action={version:1,kind:'undo',originalKind:'farrowing-entry',originalKey:original?.key||'',before:{room:clone(room)},after:{location:to}};
  data.logs.push(log);return log;
}
function swimgenDone(card){return typeof card?.swimgenDone==='boolean'?card.swimgenDone:/済/.test(String(card?.swimgen||''));}
function setSwimgen(data,{id,done,expectedPage,...options}){
  const sow=M.replay(data).sows[id],p=P.pages(data,id)[0];
  if(!sow?.active||sow.numberPending||!p)throw Error('現在の母豚カードを確認してください。');
  if(expectedPage!==undefined&&JSON.stringify(p)!==expectedPage)throw Error('カードが変更されました。開き直してください。');
  const before=swimgenDone(p.card);if(before===done)throw Error('スイムジェンの状態は既に変更されています。');
  const log=stamp('追記',id,{...options,note:'スイムジェン '+(done?'済':'未')});
  log.action={version:1,kind:'swimgen-status',cycleKey:p.key,before:{done:before},after:{done:!!done}};
  P.edit(data,id,p.key,{...clone(p.card),swimgenDone:!!done},JSON.stringify(p));data.logs.push(log);return log;
}
function registerUndo(kind,handler){if(handlers.has(kind))throw Error('取り消し処理は登録済みです。');handlers.set(kind,handler);}
function undo(data,key,options){
  const original=data.logs.find(l=>l.key===key),handler=original&&handlers.get(original.action?.kind);
  if(!handler)throw Error('この操作の取り消しには対応していません。');
  if(data.logs.some(l=>l.undoOf===key))throw Error('この操作は取り消し済みです。');
  return handler(data,original,options);
}
registerUndo('farrowing-entry',(data,original,options)=>returnToYard(data,{...options,roomKey:original.roomKey,expectedEntry:original.key}));
registerUndo('swimgen-status',(data,original,options)=>{
  const p=P.pages(data,original.id)[0];if(p?.key!==original.action.cycleKey||swimgenDone(p.card)!==original.action.after.done||data.logs.slice(data.logs.indexOf(original)+1).some(l=>l.id===original.id&&(l.action?.kind==='swimgen-status'||['種付け','再発情確認','分娩','離乳','スイムジェン 実施'].includes(l.type))))throw Error('その後の作業があるため、この操作は取り消せません。現在のカードを確認してください。');
  const log=setSwimgen(data,{...options,id:original.id,done:original.action.before.done,expectedPage:JSON.stringify(p)});log.undoOf=original.key;return log;
});
root.TanakaSowWork={roomLabel,roomLocation,yardOrigin,entry,returnContext,returnToYard,swimgenDone,setSwimgen,registerUndo,undo};
})(typeof globalThis!=='undefined'?globalThis:this);
