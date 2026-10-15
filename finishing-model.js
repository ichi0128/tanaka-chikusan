(function(root){
  'use strict';
  const M=root.TanakaModel;
  const TYPES=['肉豚舎へ移動','肉豚舎更新','肉豚出荷'];
  TYPES.forEach(t=>{if(!M.TYPES.includes(t))M.TYPES.push(t);});
  function empty(key){if(key==='yard')return {key,state:'empty',birthDate:'',count:0};return {key,state:'empty',birthDate:'',count:0,sowId:'',mixed:false,csf:false,weight:30,kind:'肉豚',note:''};}
  function legacyGroup(r){return {birthDate:r.birthDate||'',count:r.count??null,sowId:r.sowId||'',mixed:!!r.mixed,csf:!!r.csf,weight:r.weight??30,kind:r.kind||'肉豚',note:r.groupNote??r.note??''};}
  function simple(r){return {key:'yard',state:r.count?'occupied':'empty',birthDate:r.count?(r.birthDate||''):'',count:r.count||0};}
  function group(r){return r.key==='yard'?{birthDate:r.birthDate||'',count:r.count??0}:legacyGroup(r);}
  function validYard(g){if(!Number.isInteger(g.count)||g.count<0)throw Error('頭数は0以上の整数で入力してください。');if(g.birthDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(g.birthDate)||!Number.isFinite(Date.parse(g.birthDate))||new Date(g.birthDate).toISOString().slice(0,10)!==g.birthDate))throw Error('誕生月日を確認してください。');}
  function validGroup(g){
    if(!Number.isInteger(g.count)||g.count<0)throw Error('頭数は0以上の整数で入力してください。');
    if(typeof g.sowId!=='string'||typeof g.note!=='string'||typeof g.csf!=='boolean'||typeof g.mixed!=='boolean'||!['肉豚','育成母豚'].includes(g.kind))throw Error('肉豚舎の情報を確認してください。');
    if(!Number.isInteger(g.weight)||g.weight<30||g.weight%10!==0)throw Error('重量は30kg以上・10kg単位で入力してください。');
    if(g.birthDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(g.birthDate)||!Number.isFinite(Date.parse(g.birthDate))||new Date(g.birthDate).toISOString().slice(0,10)!==g.birthDate))throw Error('誕生月日を確認してください。');
    if(g.mixed&&g.sowId)throw Error('混成の母豚番号は空欄にしてください。');
  }
  function check(rooms){
    if(rooms.length!==25||new Set(rooms.map(r=>r.key)).size!==25)throw Error('肉豚舎は24部屋と運動場で管理します。');
    for(const r of rooms){if(!(r.key==='yard'||/^f([1-9]|1\d|2[0-4])$/.test(r.key))||!['empty','occupied'].includes(r.state))throw Error('肉豚舎の部屋が不正です。');if(r.key==='yard'){validYard(r);if((r.state==='empty')!==(r.count===0))throw Error('運動場の頭数と在室状態を確認してください。');continue;}validGroup(group(r));if(r.state==='empty'&&(r.count!==0||r.sowId||r.birthDate||r.note||r.mixed)||r.state==='occupied'&&r.count<=0)throw Error('肉豚舎の在室状態と頭数を確認してください。');}
  }
  function baseline(data){const rooms=M.clone(data.finishingBaseline||Array.from({length:24},(_,i)=>empty('f'+(i+1))));if(!rooms.some(r=>r.key==='yard'))rooms.push(empty('yard'));check(rooms);return rooms;}
  function same(a,b,simpleYard){if(simpleYard&&a.key==='yard')return a.count===b.count&&(a.birthDate||'')===(b.birthDate||'');return JSON.stringify(legacyGroup(a))===JSON.stringify(legacyGroup(b));}
  function put(r,g,simpleYard){if(simpleYard&&r.key==='yard'){validYard(g);const next=simple(g);for(const key of Object.keys(r))delete r[key];Object.assign(r,next);return;}g=legacyGroup(g);validGroup(g);Object.assign(r,g,{state:g.count?'occupied':'empty'});if(!g.count){for(const key of Object.keys(r))if(key!=='key')delete r[key];Object.assign(r,empty(r.key));}}
  function apply(l,rooms,nursery){
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
  root.TanakaFinishing={TYPES,empty,group,validGroup,validYard,check,baseline,apply,current:rooms=>rooms.map(r=>r.key==='yard'?simple(r):r)};
})(typeof globalThis!=='undefined'?globalThis:this);

// Read-only shipment projection, shared by Home and shipment history.
TanakaFinishing.shipmentSummary=function(data,month){
  const records=(data.logs||[]).filter(l=>l.type==='肉豚出荷'&&Number.isInteger(l.count)&&l.count>0&&typeof l.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(l.date)&&Number.isFinite(Date.parse(l.date))&&new Date(l.date).toISOString().slice(0,10)===l.date).map(l=>({key:l.key,date:l.date,count:l.count,finishingKey:l.finishingKey||'',note:l.note||''})).sort((a,b)=>b.date.localeCompare(a.date));
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
