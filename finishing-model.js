(function(root){
  'use strict';
  const M=root.TanakaModel;
  const TYPES=['肉豚舎へ移動','肉豚舎更新','肉豚出荷'];
  TYPES.forEach(t=>{if(!M.TYPES.includes(t))M.TYPES.push(t);});
  function empty(key){return {key,state:'empty',birthDate:'',count:0,sowId:'',mixed:false,csf:false,weight:30,kind:'肉豚',note:''};}
  function group(r){return {birthDate:r.birthDate||'',count:r.count??null,sowId:r.sowId||'',mixed:!!r.mixed,csf:!!r.csf,weight:r.weight??30,kind:r.kind||'肉豚',note:r.groupNote??r.note??''};}
  function validGroup(g){
    if(!Number.isInteger(g.count)||g.count<0)throw Error('頭数は0以上の整数で入力してください。');
    if(typeof g.sowId!=='string'||typeof g.note!=='string'||typeof g.csf!=='boolean'||typeof g.mixed!=='boolean'||!['肉豚','育成母豚'].includes(g.kind))throw Error('肉豚舎の情報を確認してください。');
    if(!Number.isInteger(g.weight)||g.weight<30||g.weight%10!==0)throw Error('重量は30kg以上・10kg単位で入力してください。');
    if(g.birthDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(g.birthDate)||!Number.isFinite(Date.parse(g.birthDate))||new Date(g.birthDate).toISOString().slice(0,10)!==g.birthDate))throw Error('誕生月日を確認してください。');
    if(g.mixed&&g.sowId)throw Error('混成の母豚番号は空欄にしてください。');
  }
  function check(rooms){
    if(rooms.length!==24||new Set(rooms.map(r=>r.key)).size!==24)throw Error('肉豚舎は24部屋で管理します。');
    for(const r of rooms){if(!/^f([1-9]|1\d|2[0-4])$/.test(r.key)||!['empty','occupied'].includes(r.state))throw Error('肉豚舎の部屋が不正です。');validGroup(group(r));if(r.state==='empty'&&(r.count!==0||r.sowId||r.birthDate||r.note||r.mixed)||r.state==='occupied'&&r.count<=0)throw Error('肉豚舎の在室状態と頭数を確認してください。');}
  }
  function baseline(data){const rooms=M.clone(data.finishingBaseline||Array.from({length:24},(_,i)=>empty('f'+(i+1))));check(rooms);return rooms;}
  function same(a,b){return JSON.stringify(group(a))===JSON.stringify(group(b));}
  function put(r,g){validGroup(g);Object.assign(r,g,{state:g.count?'occupied':'empty'});if(!g.count)Object.assign(r,empty(r.key));}
  function apply(l,rooms,nursery){
    const dest=rooms.find(r=>r.key===l.finishingKey);if(!dest)throw Error('肉豚舎の部屋が見つかりません。');
    if(l.type==='肉豚舎へ移動'){
      if(dest.state!=='empty')throw Error('移動先の部屋は空室ではありません。');
      const source=l.sourceArea==='nursery'?nursery.find(r=>r.key===l.sourceKey):l.sourceArea==='finishing'?rooms.find(r=>r.key===l.sourceKey):null;
      if(!source||source===dest||source.state!=='occupied'||!same(source,l.sourceBefore))throw Error('移動元のグループが変わっています。関連する記録を確認してください。');
      const before=group(source),total=before.count===null?l.sourceTotal:before.count;
      if(!Number.isInteger(total)||total<=0||!Number.isInteger(l.count)||l.count<=0||l.count>total)throw Error('移動頭数は移動元の頭数以下の正の整数で入力してください。');
      put(dest,{...before,count:l.count});
      const left=total-l.count;
      if(l.sourceArea==='finishing')put(source,{...before,count:left});
      else if(left)source.count=left;
      else Object.assign(source,{state:'empty',count:null,sowId:'',mixed:false,entered:'',birthDate:'',csf:false,weight:30,kind:'肉豚',groupNote:''});
    }else{
      if(!same(dest,l.finishingBefore))throw Error('肉豚舎の情報が後の記録と一致しません。関連する記録を確認してください。');
      if(l.type==='肉豚出荷'){
        if(dest.state!=='occupied'||!Number.isInteger(l.count)||l.count<=0||l.count>dest.count)throw Error('出荷頭数は在室頭数以下の正の整数で入力してください。');
        put(dest,{...group(dest),count:dest.count-l.count});
      }else put(dest,l.finishingAfter);
    }
    check(rooms);
  }
  root.TanakaFinishing={TYPES,empty,group,validGroup,check,baseline,apply};
})(typeof globalThis!=='undefined'?globalThis:this);
