(function(root){
  'use strict';
  const M=root.TanakaModel;
  const TYPES=['肉豚舎へ移動','肉豚舎更新','肉豚出荷'];
  TYPES.forEach(t=>{if(!M.TYPES.includes(t))M.TYPES.push(t);});
  function empty(key){if(key==='yard')return {key,state:'empty',birthDate:'',count:0};return {key,state:'empty',birthDate:'',count:0,sowId:'',mixed:false,csf:false,weight:30,kind:'肉豚',note:''};}
  function roomKind(kind){return kind==='育成母豚'?'育成母豚候補':kind||'肉豚';}
  function legacyGroup(r){return {birthDate:r.birthDate||'',count:r.count??null,sowId:r.sowId||'',mixed:!!r.mixed,csf:!!r.csf,weight:r.weight??30,kind:roomKind(r.kind),note:r.groupNote??r.note??''};}
  function simple(r){return {key:'yard',state:r.count?'occupied':'empty',birthDate:r.count?(r.birthDate||''):'',count:r.count||0};}
  function group(r){return r.key==='yard'?yardState(r):legacyGroup(r);}
  function yardBirthMonth(pig){
    if(pig.birthMonth!==undefined)return pig.birthMonth;
    return /^\d{4}-\d{2}-\d{2}$/.test(pig.birthDate||'')?Number(pig.birthDate.slice(5,7)):null;
  }
  function yardPig(source,key){
    return {...M.clone(source),key,count:1,weight:source.weight??null,birthDate:source.birthDate||'',sowId:source.mixed?'混成':source.sowId||'',mixed:false,csf:typeof source.csf==='boolean'?source.csf:null,kind:['育成母豚','育成母豚候補'].includes(source.kind)?'育成母豚':'肉豚',note:source.note||''};
  }
  function yardState(source){
    const individuals=Array.isArray(source.individuals)?M.clone(source.individuals):Array.from({length:source.count||0},(_,i)=>yardPig({birthDate:source.birthDate||'',weight:source.weight??null,sowId:source.sowId||'',mixed:!!source.mixed,csf:source.csf??null,kind:source.kind||'肉豚',note:source.note||''},'yard:legacy:'+(i+1)));
    const dates=new Set(individuals.map(p=>p.birthDate||''));
    return {key:'yard',state:individuals.length?'occupied':'empty',count:individuals.length,birthDate:dates.size===1?[...dates][0]:'',individuals};
  }
  function validIndividuals(r){
    if(!Array.isArray(r.individuals)||r.count!==r.individuals.length||new Set(r.individuals.map(p=>p.key)).size!==r.individuals.length)throw Error('運動場の個体一覧と頭数を確認してください。');
    for(const p of r.individuals){if(p.birthMonth!==undefined&&p.birthMonth!==null&&(!Number.isInteger(p.birthMonth)||p.birthMonth<1||p.birthMonth>12))throw Error('誕生月は1〜12月から選択してください。');if(typeof p.key!=='string'||!p.key||p.count!==1||typeof p.sowId!=='string'||typeof p.birthDate!=='string'||!(p.weight===null||Number.isSafeInteger(p.weight)&&p.weight>=0&&p.weight%10===0)||!['肉豚','育成母豚'].includes(p.kind)||!(p.csf===null||typeof p.csf==='boolean')||typeof p.note!=='string')throw Error('運動場は1頭につき1行で入力してください。');validYard(p);}
  }
  function putIndividuals(room,next){const normalized=yardState(next);validIndividuals(normalized);Object.keys(room).forEach(k=>delete room[k]);Object.assign(room,normalized);}
  // JSONB may reorder object keys; individual order and values still identify the same state.
  function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
  function sameIndividuals(a,b){return JSON.stringify(canonical(yardState(a)))===JSON.stringify(canonical(yardState(b)));}
  function applyIndividuals(l,rooms,nursery){
    const yard=rooms.find(r=>r.key==='yard'),before=yardState(yard);
    if(l.type==='肉豚舎へ移動'){
      const dest=rooms.find(r=>r.key===l.finishingKey),source=(l.sourceArea==='nursery'?nursery:l.sourceArea==='finishing'?rooms:[]).find(r=>r.key===l.sourceKey);
      if(!source||!dest||source===dest||source.state!=='occupied')throw Error('移動元・移動先を確認してください。');
      if(dest.key==='yard'){
        if(source.key==='yard'||!same(source,l.sourceBefore,true)||!sameIndividuals(yard,l.yardBefore))throw Error('移動元または運動場が変わっています。');
        const group=legacyGroup(source),total=group.count===null?l.sourceTotal:group.count;
        if(!Number.isSafeInteger(total)||total<=0||!Number.isSafeInteger(l.count)||l.count<=0||l.count>total)throw Error('移動頭数を確認してください。');
        const added=Array.from({length:l.count},(_,i)=>yardPig(group,l.key+':pig:'+(i+1)));
        putIndividuals(yard,{individuals:[...before.individuals,...added]});
        if(l.sourceArea==='finishing')put(source,{...group,count:total-l.count},true);
        else if(total>l.count)source.count=total-l.count;
        else Object.assign(source,{state:'empty',count:null,sowId:'',mixed:false,entered:'',birthDate:'',csf:false,weight:30,kind:'肉豚',groupNote:''});
      }else{
        if(source.key!=='yard'||dest.state!=='empty'||!sameIndividuals(yard,l.sourceBefore)||!Array.isArray(l.yardPigKeys)||l.yardPigKeys.length!==1||l.count!==1)throw Error('運動場の移動する個体を確認してください。');
        const pig=before.individuals.find(p=>p.key===l.yardPigKeys[0]);if(!pig)throw Error('移動する個体が見つかりません。');
        const group=legacyGroup({...pig,mixed:pig.sowId==='混成',sowId:pig.sowId==='混成'?'':pig.sowId});
        put(dest,group,true);putIndividuals(yard,{individuals:before.individuals.filter(p=>p.key!==pig.key)});
      }
    }else{
      if(l.finishingKey!=='yard'||!sameIndividuals(yard,l.finishingBefore))throw Error('運動場の個体情報が変わっています。');
      if(l.type==='肉豚出荷'){
        if(!Array.isArray(l.yardPigKeys)||new Set(l.yardPigKeys).size!==l.yardPigKeys.length||l.count!==l.yardPigKeys.length||l.count<=0||l.yardPigKeys.some(key=>!before.individuals.some(p=>p.key===key)))throw Error('出荷する個体を確認してください。');
        putIndividuals(yard,{individuals:before.individuals.filter(p=>!l.yardPigKeys.includes(p.key))});
      }else putIndividuals(yard,l.finishingAfter);
    }
    check(rooms);
  }
  function validYard(g){if(!Number.isInteger(g.count)||g.count<0)throw Error('頭数は0以上の整数で入力してください。');if(g.birthDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(g.birthDate)||!Number.isFinite(Date.parse(g.birthDate))||new Date(g.birthDate).toISOString().slice(0,10)!==g.birthDate))throw Error('誕生月日を確認してください。');}
  function validGroup(g){
    if(!Number.isInteger(g.count)||g.count<0)throw Error('頭数は0以上の整数で入力してください。');
    if(typeof g.sowId!=='string'||typeof g.note!=='string'||typeof g.csf!=='boolean'||typeof g.mixed!=='boolean'||!['肉豚','育成母豚','育成母豚候補'].includes(g.kind))throw Error('肉豚舎の情報を確認してください。');
    if(!Number.isSafeInteger(g.weight)||g.weight<0||g.weight%10!==0)throw Error('重量は0kg以上・10kg単位で入力してください。');
    if(g.birthDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(g.birthDate)||!Number.isFinite(Date.parse(g.birthDate))||new Date(g.birthDate).toISOString().slice(0,10)!==g.birthDate))throw Error('誕生月日を確認してください。');
    if(g.mixed&&g.sowId)throw Error('混成の母豚番号は空欄にしてください。');
  }
  function check(rooms){
    if(rooms.length!==25||new Set(rooms.map(r=>r.key)).size!==25)throw Error('肉豚舎は24部屋と運動場で管理します。');
    for(const r of rooms){if(!(r.key==='yard'||/^f([1-9]|1\d|2[0-4])$/.test(r.key))||!['empty','occupied'].includes(r.state))throw Error('肉豚舎の部屋が不正です。');if(r.key==='yard'){validYard(r);if(r.individuals!==undefined)validIndividuals(r);if((r.state==='empty')!==(r.count===0))throw Error('運動場の頭数と在室状態を確認してください。');continue;}validGroup(group(r));if(r.state==='empty'&&(r.count!==0||r.sowId||r.birthDate||r.note||r.mixed)||r.state==='occupied'&&r.count<=0)throw Error('肉豚舎の在室状態と頭数を確認してください。');}
  }
  function baseline(data){const rooms=M.clone(data.finishingBaseline||Array.from({length:24},(_,i)=>empty('f'+(i+1))));if(!rooms.some(r=>r.key==='yard'))rooms.push(empty('yard'));check(rooms);return rooms;}
  function same(a,b,simpleYard){if(simpleYard&&a.key==='yard')return a.count===b.count&&(a.birthDate||'')===(b.birthDate||'');return JSON.stringify(legacyGroup(a))===JSON.stringify(legacyGroup(b));}
  function put(r,g,simpleYard){if(simpleYard&&r.key==='yard'){validYard(g);const next=simple(g);for(const key of Object.keys(r))delete r[key];Object.assign(r,next);return;}g=legacyGroup(g);validGroup(g);Object.assign(r,g,{state:g.count?'occupied':'empty'});if(!g.count){for(const key of Object.keys(r))if(key!=='key')delete r[key];Object.assign(r,empty(r.key));}}
  function apply(l,rooms,nursery){
    if(l.yardIndividuals===1){applyIndividuals(l,rooms,nursery);return;}
    const dest=rooms.find(r=>r.key===l.finishingKey);if(!dest)throw Error('肉豚舎の部屋が見つかりません。');
    if(l.type==='肉豚舎へ移動'){
      if(dest.state!=='empty')throw Error('移動先の部屋は空室ではありません。');
      const source=l.sourceArea==='nursery'?nursery.find(r=>r.key===l.sourceKey):l.sourceArea==='finishing'?rooms.find(r=>r.key===l.sourceKey):null;
      if(!source||source===dest||source.state!=='occupied'||!same(source,l.sourceBefore,l.simpleYard))throw Error('移動元のグループが変わっています。関連する記録を確認してください。');
      const before=l.simpleYard&&source.key==='yard'?legacyGroup(simple(source)):legacyGroup(source),total=before.count===null?l.sourceTotal:before.count;
      if(!Number.isInteger(total)||total<=0||!Number.isInteger(l.count)||l.count<=0||l.count>total)throw Error('移動頭数は移動元の頭数以下の正の整数で入力してください。');
      put(dest,{...before,count:l.count},l.simpleYard);
      const left=total-l.count;
      if(l.sourceArea==='finishing')put(source,{...before,count:left},l.simpleYard);
      else if(left)source.count=left;
      else Object.assign(source,{state:'empty',count:null,sowId:'',mixed:false,entered:'',birthDate:'',csf:false,weight:30,kind:'肉豚',groupNote:''});
    }else{
      if(!same(dest,l.finishingBefore,l.simpleYard))throw Error('肉豚舎の情報が後の記録と一致しません。関連する記録を確認してください。');
      if(l.type==='肉豚出荷'){
        if(dest.state!=='occupied'||!Number.isInteger(l.count)||l.count<=0||l.count>dest.count)throw Error('出荷頭数は在室頭数以下の正の整数で入力してください。');
        put(dest,{...legacyGroup(dest),count:dest.count-l.count},l.simpleYard);
      }else put(dest,l.finishingAfter,l.simpleYard);
    }
    check(rooms);
  }
  // Candidate is a marker within meat stock until the selected pigs enter yard.
  function meatTotal(state){return state.finishing.reduce((sum,r)=>sum+(r.key==='yard'?yardState(r).individuals.filter(p=>(root.TanakaGilts?.yardKind(p,state)||p.kind)==='肉豚').length:r.state==='occupied'&&['肉豚','育成母豚候補'].includes(roomKind(r.kind))?r.count:0),0);}
  root.TanakaFinishing={meatTotal,TYPES,empty,roomKind,group,yardState,yardPig,yardBirthMonth,validIndividuals,validGroup,validYard,check,baseline,apply,current:rooms=>rooms.map(r=>r.key==='yard'?yardState(r):{...r,kind:roomKind(r.kind)})};
})(typeof globalThis!=='undefined'?globalThis:this);

// Shipment history adjustments never change the replayed room ledger.
TanakaFinishing.validShipment=function(record){
  if(typeof record.key!=='string'||!record.key||typeof record.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(record.date)||!Number.isFinite(Date.parse(record.date))||new Date(record.date).toISOString().slice(0,10)!==record.date)throw Error('出荷日を確認してください。');
  if(!Number.isSafeInteger(record.count)||record.count<=0)throw Error('出荷頭数は1以上の整数で入力してください。');
};
TanakaFinishing.validateShipmentHistory=function(data){
  const h=data.shipmentHistory;if(h===undefined)return;
  if(!h||!Array.isArray(h.added)||!Array.isArray(h.deletedLogKeys))throw Error('出荷履歴の保存形式を確認してください。');
  h.added.forEach(TanakaFinishing.validShipment);
  if(new Set(h.added.map(r=>r.key)).size!==h.added.length||h.deletedLogKeys.some(k=>typeof k!=='string'||!k)||new Set(h.deletedLogKeys).size!==h.deletedLogKeys.length)throw Error('出荷履歴の識別番号を確認してください。');
};
TanakaFinishing.addShipment=function(data,record){
  TanakaFinishing.validateShipmentHistory(data);TanakaFinishing.validShipment(record);
  const h=data.shipmentHistory||(data.shipmentHistory={added:[],deletedLogKeys:[]});
  if(h.added.some(r=>r.key===record.key))throw Error('同じ出荷実績が既に登録されています。');
  h.added.push({key:record.key,date:record.date,count:record.count});
};
TanakaFinishing.deleteShipment=function(data,source,key){
  TanakaFinishing.validateShipmentHistory(data);
  const record=TanakaFinishing.shipmentSummary(data,'').records.find(r=>r.source===source&&r.key===key);
  if(!record)throw Error('出荷履歴が変更されています。画面を開き直してください。');
  const h=data.shipmentHistory||(data.shipmentHistory={added:[],deletedLogKeys:[]});
  if(source==='manual')h.added=h.added.filter(r=>r.key!==key);
  else h.deletedLogKeys.push(key);
};
// Shared by Home and shipment history; manual additions and exclusions are display totals only.
TanakaFinishing.shipmentSummary=function(data,month){
  const h=data.shipmentHistory||{added:[],deletedLogKeys:[]},excluded=new Set(h.deletedLogKeys);
  const records=[...(data.logs||[]).filter(l=>l.type==='肉豚出荷'&&!excluded.has(l.key)&&Number.isInteger(l.count)&&l.count>0&&typeof l.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(l.date)&&Number.isFinite(Date.parse(l.date))&&new Date(l.date).toISOString().slice(0,10)===l.date).map(l=>({key:l.key,source:'log',date:l.date,count:l.count,finishingKey:l.finishingKey||'',note:l.note||''})),...h.added.map(r=>({...r,source:'manual',finishingKey:'',note:''}))].sort((a,b)=>b.date.localeCompare(a.date));
  const months=new Map();
  for(const record of records){
    const key=record.date.slice(0,7);
    if(!months.has(key))months.set(key,{month:key,total:0,days:new Map()});
    const entry=months.get(key);entry.total+=record.count;
    if(!entry.days.has(record.date))entry.days.set(record.date,{date:record.date,total:0,records:[]});
    const day=entry.days.get(record.date);day.total+=record.count;day.records.push(record);
  }
  return {records,currentTotal:months.get(month)?.total||0,months:[...months.values()].map(m=>({month:m.month,total:m.total,days:[...m.days.values()]}))};
};
