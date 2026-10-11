/* Confirmed baseline + ordered changes. Correcting a record also corrects rooms. */
(function(root){
  'use strict';
  const IDS=['512','912','106','46','53','101','149','132','60','812','21','47','38','98','51','18','88'];
  const STATES=['family','piglets','empty'];
  const TYPES=['種付け','分娩','離乳','子豚移動','スイムジェン 実施','追記','分娩舎修正','廃豚','現役復帰'];
  const PLANS=[['10月16日',['21','47'],'スイムジェン'],['10月20日',['88'],'分娩予定'],['10月24日',['18'],'スイムジェン'],['10月26日',['51'],'スイムジェン'],['10月28日',['98'],'スイムジェン'],['10月30日',['38'],'スイムジェン']];
  const clone=x=>JSON.parse(JSON.stringify(x));
  function baseline(){return Array.from({length:10},(_,i)=>({key:'r'+(i+1),label:'',state:i<3?'family':i<5?'piglets':'empty',sowId:['512','912','106','812','132'][i]||'',count:null}));}
  function uid(){return root.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);}
  function migrate(raw){
    if(raw?.version===3){validate(raw);return clone(raw);}
    if(raw?.version!=null)throw Error('この更新版では読み込めないデータのバージョンです。');
    if(raw!=null && (typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.logs)))throw Error('保存済みデータの形式を確認できません。上書きせず停止しました。');
    const old=raw||{logs:[]};
    const data={...clone(old),version:3,sows:IDS.map(id=>({id,breed:'',birthDate:'',note:''})),plans:clone(PLANS),baseline:baseline(),logs:(old.logs||[]).map(x=>({...x,key:uid(),legacy:true})).reverse()};
    validate(data);return data;
  }
  function validate(data){
    if(data.version!==3||!Array.isArray(data.sows)||!Array.isArray(data.logs)||!Array.isArray(data.baseline)||data.baseline.length!==10)throw Error('データの形式が正しくありません。');
    const ids=data.sows.map(s=>s.id);if(ids.some(id=>typeof id!=='string'||!/^\d+$/.test(id))||new Set(ids).size!==ids.length)throw Error('母豚番号は重複のない数字で入力してください。');
    const keys=data.logs.map(l=>l.key);if(keys.some(k=>typeof k!=='string'||!k)||new Set(keys).size!==keys.length)throw Error('記録の識別番号が不正です。');
    data.logs.forEach(l=>{if(!l.legacy && (!TYPES.includes(l.type)||!/^\d{4}-\d{2}-\d{2}$/.test(l.date)||!Number.isFinite(Date.parse(l.date))||new Date(l.date).toISOString().slice(0,10)!==l.date))throw Error('記録の種類または日付が不正です。');});
    replay(data);
  }
  function checkRooms(rooms,sows){
    if(new Set(rooms.map(r=>r.key)).size!==10||rooms.some(r=>typeof r.key!=='string'||!/^r([1-9]|10)$/.test(r.key)))throw Error('分娩舎の管理枠が不正または重複しています。');
    const occupied=[],labels=[];
    rooms.forEach(r=>{
      if(!STATES.includes(r.state))throw Error('在室状態が不正です。');
      if(typeof r.label!=='string')throw Error('部屋番号が不正です。');
      if(r.label){if(labels.includes(r.label))throw Error('部屋番号が重複しています。');labels.push(r.label);}
      if(r.count!==null && (!Number.isInteger(r.count)||r.count<0))throw Error('子豚頭数は0以上の整数で入力してください。');
      if(r.state==='empty'&&(r.sowId||r.count!==null))throw Error('空き部屋に母豚・子豚情報は登録できません。');
      if(r.state!=='empty'&&(!sows[r.sowId]))throw Error('登録されている母豚番号を選んでください。');
      if(r.state==='family'){
        if(!sows[r.sowId].active)throw Error('廃豚済みの母豚は入室できません。');
        if(occupied.includes(r.sowId))throw Error('同じ母豚が複数の部屋に入っています。');occupied.push(r.sowId);
      }
    });
  }
  function replay(data){
    const sows=Object.assign(Object.create(null),Object.fromEntries(data.sows.map(s=>[s.id,{...clone(s),active:true}])));
    const rooms=clone(data.baseline);checkRooms(rooms,sows);
    for(const l of data.logs){
      if(l.legacy)continue;
      const sow=sows[l.id],room=rooms.find(r=>r.key===l.roomKey);
      if(l.type==='分娩舎修正'){
        if(!room||!l.room)throw Error('修正先の部屋が見つかりません。');Object.assign(room,clone(l.room),{key:room.key});
      }else{
        if(!sow)throw Error('記録対象の母豚が見つかりません。');
        if(['種付け','分娩','離乳','廃豚','スイムジェン 実施'].includes(l.type)&&!sow.active)throw Error('廃豚済みの母豚にはこの作業を記録できません。');
        if(l.type==='分娩'){
          if(!room||room.state!=='empty')throw Error('分娩の入室先が空きではありません。先の記録を確認してください。');
          Object.assign(room,{state:'family',sowId:l.id,count:l.count??null});
        }
        if(l.type==='離乳'){
          if(!room||room.state!=='family'||room.sowId!==l.id)throw Error('離乳対象の母豚と在室状態が一致しません。');room.state='piglets';if(l.count!==null&&l.count!==undefined)room.count=l.count;
        }
        if(l.type==='子豚移動'){
          if(!room||room.state!=='piglets'||room.sowId!==l.id)throw Error('移動対象の子豚が部屋にいません。');
          Object.assign(room,{state:'empty',sowId:'',count:null});
        }
        if(l.type==='廃豚'){
          if(rooms.some(r=>r.state==='family'&&r.sowId===l.id))throw Error('母豚が分娩舎にいます。先に離乳または分娩舎の修正を記録してください。');sow.active=false;
        }
        if(l.type==='現役復帰')sow.active=true;
      }
      checkRooms(rooms,sows);
    }
    return {sows,rooms};
  }
  function commit(data,fn){const next=clone(data);fn(next);validate(next);return next;}
  root.TanakaModel={IDS,STATES,TYPES,PLANS,clone,uid,migrate,validate,replay,commit,baseline};
  if(typeof module!=='undefined')module.exports=root.TanakaModel;
})(typeof globalThis!=='undefined'?globalThis:this);
