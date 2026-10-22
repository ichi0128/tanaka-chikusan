/* In-memory farm progression. This module never reads or writes browser/cloud storage. */
(function(root){
'use strict';
const M=root.TanakaModel,F=root.TanakaFinishing,P=root.TanakaSowParity,FF=root.TanakaForecast;
const add=FF.add,valid=FF.valid,clone=M.clone;
function birthEstimate(data,id){
  const pages=P.pages(data,id);for(const p of pages){const n=p.card.birthCount;if(Number.isInteger(n)&&n>=0)return {count:n,source:'同じ母豚の直近の出生頭数を仮使用'};}
  const births=data.logs.filter(l=>!l.legacy&&l.id===id&&l.type==='分娩'&&Number.isInteger(l.count)).sort((a,b)=>b.date.localeCompare(a.date));
  if(births.length)return {count:births[0].count,source:'同じ母豚の直近の出生頭数を仮使用'};
  const room=M.replay(data).rooms.find(r=>r.sowId===id&&Number.isInteger(r.birthCount));
  return room?{count:room.birthCount,source:'同じ母豚の出生頭数を仮使用'}:{count:null,source:'出生頭数の実績なし・仮頭数は未入力'};
}
function advance(source,from,to){
  if(!valid(from)||!valid(to)||to<from)throw Error('進行先の日付を確認してください。');
  let data=clone(source);const events=[],blocked=new Map();
  data.simulationProjection=data.simulationProjection||{virtualGroups:[]};
  data.simulationProjection.virtualShipments ||= [];
  data.simulationProjection.manualShipmentOverrides ||= [];
  const groups=()=>data.simulationProjection.virtualGroups;
  const protectedGroup=(key,birth)=>data.simulationProjection.manualShipmentOverrides.includes(key+'|'+(birth||''));
  function recordShipment(record){data.simulationProjection.virtualShipments.push(record);events.push({type:'仮想出荷',...record});}

  const virtualGroup=(r,area,date)=>({key:'virtual:'+area+':'+r.key+':'+(r.birthDate||date)+':'+date,area,sourceKey:r.key,sowId:r.sowId||'',mixed:!!r.mixed,count:r.count??null,birthDate:r.birthDate||'',entered:date,weight:area==='finishing'?Math.max(30,r.weight||30):20,csf:!!r.csf,kind:r.kind||'肉豚',note:'仮想受入待ち・空室不足（実在する部屋ではありません）'});
  const log=(type,id,date,extra={})=>({key:M.uid(),origin:'simulation',type,id,date,t:date+'T12:00:00.000Z',note:'シミュレーション上の予測・仮想記録（実績ではありません）',simulation:{predicted:true},...extra});
  function append(l,update=()=>{}){data=M.commit(data,d=>{
    if(l.type==='分娩'){const sow=d.sows.find(s=>s.id===l.id);if(!sow.parityCards){const page=P.pages(d,l.id)[0];P.edit(d,l.id,page.key,clone(page.card),JSON.stringify(page));}}
    else if(['種付け','離乳'].includes(l.type))P.beforeRecord(d,l.id,l);
    d.logs.push(l);update(d)});events.push({key:l.key,type:l.type,id:l.id,date:l.date,roomKey:l.roomKey||l.nurseryKey||l.finishingKey||''});}
  const priority={ship:-1,virtualFinish:0,finish:1,move:2,wean:3,mating:4,entry:5,birth:6};
  function putVirtual(g,date){
    const state=M.replay(data),dest=g.area==='nursery'?state.nursery.find(n=>n.state==='empty'):state.finishing.find(r=>r.key!=='yard'&&r.state==='empty');
    if(!dest||g.area==='finishing'&&(g.count===null||g.count<=0))return false;
    const remove=d=>{d.simulationProjection.virtualGroups=d.simulationProjection.virtualGroups.filter(x=>x.key!==g.key);if(protectedGroup(g.key,g.birthDate)&&g.area==='finishing')d.simulationProjection.manualShipmentOverrides.push(dest.key+'|'+(g.birthDate||''));};
    if(g.area==='nursery')append(log('育成舎修正',g.sowId,date,{nurseryKey:dest.key,nursery:{state:'occupied',sowId:g.sowId,mixed:g.mixed,count:g.count,birthDate:g.birthDate,entered:g.entered,weight:g.weight,kind:g.kind,csf:g.csf},note:'仮想子豚・受入待ちから育成舎へ移動'}),remove);
    else append(log('肉豚舎更新',g.sowId,date,{finishingKey:dest.key,finishingBefore:clone(dest),finishingAfter:{...F.group(g),weight:Math.max(30,g.weight||30),count:g.count},note:'仮想子豚・受入待ちから肉豚舎へ移動'}),remove);
    return true;
  }
  function allocateWaiting(date){for(const g of groups().slice().sort((a,b)=>a.entered.localeCompare(b.entered)||a.key.localeCompare(b.key)))putVirtual(g,date);}
  function segment(start,end){
    const f=FF.build(data,start),queue=[],known=new Set();
    // Keep due+7 stable instead of moving an unplaced litter to every new today.
    for(const row of f.rows){const ps=f.periods.filter(p=>p.id===row.id),first=ps[0];if(first&&!first.actualBirth&&first.uncertain&&valid(first.due)){const birth=add(first.due,7),delta=FF.distance(first.birth,birth);first.birth=birth;first.exit=add(birth,M.plannedWeanDays(first));first.moveDate=add(birth,60);for(const p of ps.slice(1))for(const key of ['mating','due','birth','entry','exit','moveDate'])if(valid(p[key]))p[key]=add(p[key],delta);}}
    let cursor=start;
    const enqueue=(kind,date,values)=>{if(!valid(date)||date>end)return;const key=[kind,values.id||'',values.birth||'',values.pigKey||values.roomKey||values.nurseryKey||values.groupKey||'',date].join(':');if(known.has(key))return;known.add(key);queue.push({kind,date:date<cursor?cursor:date,planned:date,...values,key});};
    for(const p of f.periods){
      if(!p.actualBirth){
        if(p.mating>=start)enqueue('mating',p.mating,{id:p.id,birth:p.birth});enqueue('entry',p.entry,{id:p.id,birth:p.birth});enqueue('birth',p.birth,{id:p.id,birth:p.birth});
      }
      // Actual dates win. Mothers use their per-parity weaning plan; piglets keep the room to 60.
      if(!p.actualWean)enqueue('wean',p.exit,{id:p.id,birth:p.birth});
      enqueue('move',p.moveDate,{id:p.id,birth:p.birth});
    }
    for(const p of f.childStays)enqueue('move',p.moveDate,{id:p.id,birth:p.birth,roomKey:p.roomKey});
    const nurseryMoves=state=>{for(const n of state.nursery.filter(n=>n.state==='occupied')){const entry=valid(n.entered)?n.entered:valid(n.birthDate)?add(n.birthDate,60):'';if(entry)enqueue('finish',add(entry,30),{id:n.sowId,birth:n.birthDate,nurseryKey:n.key});}};
    nurseryMoves(M.replay(data));
    for(const g of groups().filter(g=>g.area==='nursery'))enqueue('virtualFinish',add(g.entered,30),{groupKey:g.key,id:g.sowId,birth:g.birthDate});
    function shipmentQueue(state){
      for(const room of state.finishing){
        if(room.key==='yard'){
          for(const pig of F.yardState(room).individuals)if((root.TanakaGilts?.yardKind(pig,state)||pig.kind)==='肉豚'&&valid(pig.birthDate)&&!protectedGroup(pig.key,pig.birthDate))enqueue('ship',FF.months(pig.birthDate,8),{id:pig.sowId,birth:pig.birthDate,roomKey:'yard',pigKey:pig.key,groupKey:pig.key});
        }else if(room.state==='occupied'&&valid(room.birthDate)&&!protectedGroup(room.key,room.birthDate))enqueue('ship',FF.months(room.birthDate,8),{id:room.sowId,birth:room.birthDate,roomKey:room.key});
      }
      for(const g of groups().filter(g=>g.area==='finishing'))if(valid(g.birthDate)&&!protectedGroup(g.key,g.birthDate))enqueue('ship',FF.months(g.birthDate,8),{id:g.sowId,birth:g.birthDate,groupKey:g.key});
    }
    shipmentQueue(M.replay(data));
    const pending=[];
    function execute(e,date){
      const state=M.replay(data),s=state.sows[e.id],birthRoom=state.rooms.find(r=>['family','piglets'].includes(r.state)&&(e.roomKey?r.key===e.roomKey:r.sowId===e.id)&&M.roomBirthDate(data,r)===e.birth);
      if(e.kind==='ship'){
        const key=e.pigKey||e.groupKey||e.roomKey;
        if(protectedGroup(key,e.birth))return true;
        if(e.roomKey){
          const room=state.finishing.find(r=>r.key===e.roomKey);if(!room||room.state!=='occupied')return true;
          if(e.pigKey){
            const before=F.yardState(room),pig=before.individuals.find(p=>p.key===e.pigKey&&p.birthDate===e.birth);
            if(!pig||(root.TanakaGilts?.yardKind(pig,state)||pig.kind)!=='肉豚')return true;
            const after=F.yardState({individuals:before.individuals.filter(p=>p.key!==pig.key)});
            append(log('肉豚舎更新',pig.sowId,date,{finishingKey:'yard',yardIndividuals:1,finishingBefore:before,finishingAfter:after,simulation:{predicted:true,kind:'virtualShipment'},note:'仮想出荷・生後8か月（実際の出荷履歴には含めません）'}));
            recordShipment({key,date,scheduled:e.planned,birthDate:e.birth,count:1,place:'yard'});
          }else{
            if(room.birthDate!==e.birth)return true;
            const count=room.count;append(log('肉豚舎更新',room.sowId,date,{finishingKey:room.key,finishingBefore:clone(room),finishingAfter:F.group(F.empty(room.key)),simulation:{predicted:true,kind:'virtualShipment'},note:'仮想出荷・生後8か月 '+count+'頭（実際の出荷履歴には含めません）'}));
            recordShipment({key,date,scheduled:e.planned,birthDate:e.birth,count,place:room.key});
          }
        }else{
          const g=groups().find(g=>g.key===e.groupKey&&g.birthDate===e.birth&&g.area==='finishing');if(!g||g.count===null)return true;
          const count=g.count;data=M.commit(data,d=>{d.simulationProjection.virtualGroups=d.simulationProjection.virtualGroups.filter(x=>x.key!==g.key)});
          recordShipment({key,date,scheduled:e.planned,birthDate:e.birth,count,place:'waiting'});
        }
        known.delete(e.key); // A later group may reuse this room with the same birthday.
        return true;
      }
      if(e.kind==='virtualFinish'){const g=groups().find(x=>x.key===e.groupKey);if(g?.area==='nursery'){data=M.commit(data,d=>{const x=d.simulationProjection.virtualGroups.find(x=>x.key===g.key);x.area='finishing';x.entered=date;x.weight=30;});events.push({type:'肉豚舎へ移動',id:g.sowId,date,virtual:true});putVirtual(groups().find(x=>x.key===g.key),date);}return true;}
      const fail=reason=>{blocked.set(e.key,{...e,reason});return false};
      const done=()=>{blocked.delete(e.key);return true};
      if(e.kind==='finish'){
        const n=state.nursery.find(n=>n.key===e.nurseryKey);if(!n||n.state!=='occupied'||n.birthDate!==e.birth)return done();

        if(n.count===0){append(log('育成舎から移動',n.sowId,date,{nurseryKey:n.key,count:0}));return done();}
        const dest=state.finishing.find(r=>r.key!=='yard'&&r.state==='empty');if(!dest||n.count===null){const group=virtualGroup(n,'finishing',date);append(log('育成舎から移動',n.sowId,date,{nurseryKey:n.key,count:n.count,simulation:{predicted:true,virtualGroupKey:group.key},note:'仮想移動・肉豚舎受入待ちへ（頭数を別枠で保持）'}),d=>d.simulationProjection.virtualGroups.push(group));return done();}
        if((n.weight??30)<30)append(log('育成舎修正',n.sowId,date,{nurseryKey:n.key,nursery:{...n,weight:30},note:'仮想子豚・肉豚舎入室時の目安30kg（実測ではありません）'}));
        const source=M.replay(data).nursery.find(x=>x.key===n.key);append(log('肉豚舎へ移動',n.sowId,date,{sourceArea:'nursery',sourceKey:n.key,sourceBefore:clone(source),finishingKey:dest.key,count:n.count,sourceTotal:n.count}));return done();
      }
      if(e.kind==='move'){
        if(!birthRoom){if(pending.some(x=>x.kind==='birth'&&x.id===e.id&&x.birth===e.birth))return fail('予測分娩が収容待ちのため子豚移動が待機中です');return done();}if(birthRoom.state!=='piglets')return fail('仮想離乳が未完了のため子豚が移動待ちです');
        const dest=state.nursery.find(n=>n.state==='empty');if(!dest){const group=virtualGroup({...birthRoom,birthDate:e.birth},'nursery',date);append(log('子豚移動',birthRoom.sowId,date,{roomKey:birthRoom.key,simulation:{predicted:true,birth:e.birth,virtualGroupKey:group.key},note:'仮想移動・育成舎受入待ちへ（頭数を別枠で保持）'}),d=>d.simulationProjection.virtualGroups.push(group));enqueue('virtualFinish',add(date,30),{groupKey:group.key,id:group.sowId,birth:group.birthDate});return done();}
        append(log('子豚移動',birthRoom.sowId,date,{roomKey:birthRoom.key,nurseryKey:dest.key,simulation:{predicted:true,birth:e.birth}}));
        // Use the normal nursery update path to give the virtual group its starting weight.
        const n=M.replay(data).nursery.find(n=>n.key===dest.key);append(log('育成舎修正',n.sowId,date,{nurseryKey:n.key,nursery:{...n,weight:20},note:'仮想子豚・育成舎移動予測（体重20kgは仮の目安）'}));
        nurseryMoves(M.replay(data));return done();
      }
      if(!s?.active)return done();
      if(s.numberPending)return fail('番号未設定の育成母豚です。仮想カードで番号を登録すると進行できます');
      if(e.kind==='wean'){
        if(!birthRoom){if(pending.some(x=>x.kind==='birth'&&x.id===e.id&&x.birth===e.birth))return fail('予測分娩が収容待ちのため仮想離乳が待機中です');return done();}if(birthRoom.state!=='family')return done();
        append({...root.TanakaWeaning.createLog(data,{id:e.id,roomKey:birthRoom.key,date,operator:'シミュレーション（予測）',count:birthRoom.count}),origin:'simulation',simulation:{predicted:true},note:'仮想離乳・実績ではありません'});return done();
      }
      if(e.kind==='mating'){
        // Only materialize a predicted mating, never duplicate a recorded pregnancy.
        if(data.logs.some(l=>!l.legacy&&l.id===e.id&&l.type==='種付け'&&l.date===e.planned))return done();
        if(state.rooms.some(r=>r.sowId===e.id&&r.state==='family'))return fail('仮想離乳が未完了のため仮種付けが待機中です');
        append(log('種付け',e.id,date,{boar:'',simulation:{predicted:true,source:'離乳後4日・基本周期からの仮種付け'}}));return done();
      }
      if(e.kind==='entry'){
        if(state.rooms.some(r=>r.sowId===e.id&&['waiting','family'].includes(r.state)))return done();
        const room=state.rooms.find(r=>r.state==='empty');if(!room)return fail('分娩舎10室が使用中のため予測入室が待機中です');
        append(log('分娩舎へ移動',e.id,date,{roomKey:room.key}));return done();
      }
      if(e.kind==='birth'){
        if(data.logs.some(l=>!l.legacy&&l.id===e.id&&l.type==='分娩'&&l.date===e.birth)||birthRoom)return done();
        let room=state.rooms.find(r=>r.sowId===e.id&&r.state==='waiting');
        if(!room){room=state.rooms.find(r=>r.state==='empty');if(!room)return fail('予測分娩・仮想子豚の収容先がありません。部屋を空けて再進行してください');}
        const estimate=birthEstimate(data,e.id);append(log('分娩',e.id,e.birth,{roomKey:room.key,count:estimate.count,stillborn:null,simulation:{predicted:true,countSource:estimate.source},note:'予測分娩・仮想子豚／'+estimate.source}));return done();
      }
      return done();
    }
    let time=start;allocateWaiting(start);shipmentQueue(M.replay(data));
    while(queue.length){queue.sort((a,b)=>a.date.localeCompare(b.date)||priority[a.kind]-priority[b.kind]||a.key.localeCompare(b.key));time=queue[0].date;cursor=time;const batch=[];while(queue.length&&queue[0].date===time)batch.push(queue.shift());pending.push(...batch);allocateWaiting(time);
      // A move may release a room needed by an earlier failed event on the same date.
      let changed=true;while(changed){changed=false;pending.sort((a,b)=>priority[a.kind]-priority[b.kind]);for(let i=0;i<pending.length;){if(execute(pending[i],time)){pending.splice(i,1);changed=true;allocateWaiting(time);shipmentQueue(M.replay(data));}else i++;}}
    }
    if(time<end){for(const e of pending)execute(e,end);allocateWaiting(end);}
  }
  // Build the existing annual forecast repeatedly for long jumps, without changing it.
  let start=from;do{const end=[to,add(start,180)].sort()[0];segment(start,end);if(end===to)break;start=add(end,1);}while(start<=to);
  M.validate(data);return {data,events,blocked:[...blocked.values()],virtualGroups:clone(groups())};
}
function labels(data,state){
  const rooms={},nursery={},finishing={};for(const l of data.logs){
    const predicted=l.origin==='simulation';
    if(l.roomKey){
      if(l.type==='分娩舎へ移動'){if(predicted)rooms[l.roomKey]='予測入室';else delete rooms[l.roomKey];}
      if(l.type==='分娩'){if(predicted)rooms[l.roomKey]='予測分娩・仮想子豚';else delete rooms[l.roomKey];}
      if(l.type==='離乳'&&(predicted||rooms[l.roomKey]))rooms[l.roomKey]='仮想離乳・仮想子豚';
      if(l.type==='子豚移動'){if((predicted||rooms[l.roomKey])&&l.nurseryKey)nursery[l.nurseryKey]='仮想子豚・予測移動';delete rooms[l.roomKey];}
      if(l.type==='分娩舎修正'&&l.room?.state==='empty')delete rooms[l.roomKey];
      if(l.type==='分娩舎内移動'&&rooms[l.roomKey])rooms[l.targetRoomKey]='仮想子豚';
    }
    if(l.type==='肉豚舎へ移動'){
      const virtual=predicted||(l.sourceArea==='nursery'?nursery[l.sourceKey]:finishing[l.sourceKey]);
      // Partial moves retain the source marker until replay confirms that it is empty.
      if(virtual)finishing[l.finishingKey]='仮想子豚・予測移動';
    }
  }
  for(const r of state.rooms)if(r.state==='empty')delete rooms[r.key];for(const n of state.nursery)if(n.state!=='occupied')delete nursery[n.key];for(const r of state.finishing)if(r.state!=='occupied')delete finishing[r.key];return {rooms,nursery,finishing};
}
function placeWaiting(data,key,date){
  if(!valid(date))throw Error('仮想日付を確認してください。');const g=data.simulationProjection?.virtualGroups.find(x=>x.key===key);if(!g)throw Error('受入待ちのグループがありません。');
  const state=M.replay(data),dest=g.area==='nursery'?state.nursery.find(n=>n.state==='empty'):state.finishing.find(r=>r.key!=='yard'&&r.state==='empty');if(!dest)throw Error('移動先の空室がありません。');
  if(g.area==='finishing'&&(g.count===null||g.count<=0))throw Error('先に1頭以上の頭数を入力してください。');
  const l={key:M.uid(),origin:'simulation',id:g.sowId,date,t:date+'T12:00:00.000Z',simulation:{predicted:true},note:'仮想子豚・受入待ちから空室へ移動'};
  if(g.area==='nursery')Object.assign(l,{type:'育成舎修正',nurseryKey:dest.key,nursery:{state:'occupied',sowId:g.sowId,mixed:g.mixed,count:g.count,birthDate:g.birthDate,entered:g.entered,weight:g.weight,kind:g.kind,csf:g.csf}});
  else Object.assign(l,{type:'肉豚舎更新',finishingKey:dest.key,finishingBefore:clone(dest),finishingAfter:{...F.group(g),weight:Math.max(30,g.weight||30),count:g.count}});
  data.logs.push(l);data.simulationProjection.virtualGroups=data.simulationProjection.virtualGroups.filter(x=>x.key!==key);M.validate(data);
}
function protectManualChanges(before,after){
  after.simulationProjection ||= {virtualGroups:[]};
  const overrides=new Set(after.simulationProjection.manualShipmentOverrides||[]),prev=M.replay(before),next=M.replay(after);
  const protect=(key,birth)=>overrides.add(key+'|'+(birth||''));
  for(const r of next.finishing){
    const old=prev.finishing.find(x=>x.key===r.key);
    if(r.key==='yard'){
      const prior=F.yardState(old).individuals;
      for(const pig of F.yardState(r).individuals)if(JSON.stringify(pig)!==JSON.stringify(prior.find(p=>p.key===pig.key)))protect(pig.key,pig.birthDate);
    }else if(r.state==='occupied'&&JSON.stringify(r)!==JSON.stringify(old))protect(r.key,r.birthDate);
  }
  for(const g of after.simulationProjection.virtualGroups||[])if(JSON.stringify(g)!==JSON.stringify(before.simulationProjection?.virtualGroups?.find(x=>x.key===g.key)))protect(g.key,g.birthDate);
  after.simulationProjection.manualShipmentOverrides=[...overrides];
}
root.TanakaSimulationFarm={advance,birthEstimate,labels,placeWaiting,protectManualChanges};
})(typeof globalThis!=='undefined'?globalThis:this);
