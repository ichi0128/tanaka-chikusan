/* Confirmed baseline + ordered changes. Correcting a record also corrects rooms. */
(function(root){
  'use strict';
  const IDS=['512','912','106','46','53','101','149','132','60','812','21','47','38','98','51','18','88'];
  const CARD_BASELINE=[{"id": "512", "parity": 3, "mother": "60", "birth": "R6.12.6", "boar": "B2・B1", "mating": "6/8", "reheat": "6/29", "due": "9/30", "wean": "6/4", "result": "6→5", "csf": "済", "swimgen": "9/16", "reheatCount": 0, "history": [], "birthDate": "2024-12-06"}, {"id": "912", "parity": 3, "mother": "60", "birth": "R6.12.6", "boar": "B1・B2", "mating": "5/29", "reheat": "6/19", "due": "9/20", "wean": "5/25", "result": "7→6", "csf": "済", "swimgen": "9/6", "reheatCount": 0, "history": [], "birthDate": "2024-12-06"}, {"id": "106", "parity": 3, "mother": "A58", "birth": "R6.10.25", "boar": "B1・B2", "mating": "5/28", "reheat": "6/18", "due": "9/19", "wean": "5/13", "result": "6→5", "csf": "済", "swimgen": "未確認", "reheatCount": 0, "history": [], "birthDate": "2024-10-25"}, {"id": "46", "parity": 7, "mother": "142", "birth": "R5.5.21", "boar": "B2・B1", "mating": "8/10", "reheat": "8/31", "due": "12/2", "wean": "8/6", "result": "10→10", "csf": "済", "swimgen": "未", "reheatCount": 0, "history": [], "birthDate": "2023-05-21"}, {"id": "53", "parity": 8, "mother": "111", "birth": "R3.3.14", "boar": "B2", "mating": "8/6", "reheat": "8/27", "due": "11/28", "wean": "2/25", "result": "11→8", "csf": "未", "swimgen": "未", "reheatCount": 1, "history": [], "birthDate": "2021-03-14"}, {"id": "101", "parity": 4, "mother": "58", "birth": "R6.10.25", "boar": "B2・B1", "mating": "9/7", "reheat": "9/28", "due": "12/30", "wean": "9/3", "result": "10→10", "csf": "済", "swimgen": "未", "reheatCount": 0, "history": [], "birthDate": "2024-10-25"}, {"id": "149", "parity": 4, "mother": "46", "birth": "R6.4.28", "boar": "B2・B1", "mating": "9/4", "reheat": "9/25", "due": "12/27", "wean": "8/20", "result": "12→11", "csf": "済", "swimgen": "未", "reheatCount": 0, "history": [], "birthDate": "2024-04-28"}, {"id": "132", "parity": 8, "mother": "19", "birth": "R4.12.3", "boar": "B2", "mating": "10/11", "reheat": "11/1", "due": "2/2", "wean": "10/7", "result": "11→11", "csf": "済", "swimgen": "未", "reheatCount": 0, "history": [], "birthDate": "2022-12-03"}, {"id": "60", "parity": 9, "mother": "祖（渡辺バークシャー導入）", "birth": "不明", "boar": "B2・B1", "mating": "9/12", "reheat": "10/3", "due": "1/4", "wean": "9/8", "result": "9→7", "csf": "済", "swimgen": "未", "reheatCount": 0, "history": [], "birthDate": ""}, {"id": "812", "parity": 4, "mother": "60", "birth": "R6.12.6", "boar": "B2・B1", "mating": "10/5", "reheat": "10/26", "due": "1/27", "wean": "10/1", "result": "10→7", "csf": "済", "swimgen": "未", "reheatCount": 0, "history": [], "birthDate": "2024-12-06"}, {"id": "21", "parity": 9, "mother": "212", "birth": "R4.1.21", "boar": "B1・B2", "mating": "7/8", "reheat": "7/29", "due": "10/30", "wean": "4/27", "result": "9→7", "csf": "未", "swimgen": "10/16", "reheatCount": 1, "history": [{"date": "6/21", "event": "種付け", "boar": "B2・B1"}, {"date": "7/12以前", "event": "再発情"}, {"date": "7/8", "event": "再種付け", "boar": "B1・B2"}], "birthDate": "2022-01-21"}, {"id": "47", "parity": 6, "mother": "53", "birth": "R5.7.23", "boar": "B2・B1", "mating": "7/8", "reheat": "7/29", "due": "10/30", "wean": "6/20", "result": "7→5", "csf": "未", "swimgen": "10/16", "reheatCount": 0, "history": [], "birthDate": "2023-07-23"}, {"id": "38", "parity": 4, "mother": "19", "birth": "R6.8.7", "boar": "B2・B1", "mating": "7/22", "reheat": "8/12", "due": "11/13", "wean": "6/29", "result": "8→8", "csf": "未", "swimgen": "10/30", "reheatCount": 0, "history": [], "birthDate": "2024-08-07"}, {"id": "98", "parity": 4, "mother": "19", "birth": "R6.8.7", "boar": "B2・B1", "mating": "7/20", "reheat": "8/10", "due": "11/11", "wean": "7/6", "result": "6→6", "csf": "未", "swimgen": "10/28", "reheatCount": 0, "history": [], "birthDate": "2024-08-07"}, {"id": "51", "parity": 7, "mother": "142", "birth": "R5.5.21", "boar": "B2・B1", "mating": "7/18", "reheat": "8/8", "due": "11/9", "wean": "7/14", "result": "11→10", "csf": "未", "swimgen": "10/26", "reheatCount": 0, "history": [], "birthDate": "2023-05-21"}, {"id": "18", "parity": 7, "mother": "142", "birth": "R5.5.21", "boar": "B2・B1", "mating": "7/16", "reheat": "8/6", "due": "11/7", "wean": "7/11", "result": "11→11", "csf": "未", "swimgen": "10/24", "reheatCount": 0, "history": [], "birthDate": "2023-05-21"}, {"id": "88", "parity": 4, "mother": "19", "birth": "R6.8.7", "boar": "B2・B1", "mating": "6/28", "reheat": "7/19", "due": "10/20", "wean": "6/24", "result": "3→3", "csf": "未", "swimgen": "10/6", "reheatCount": 0, "history": [], "birthDate": "2024-08-07"}];
  function restoreProfiles(data){
    if(data.cardRestoration===1)return data;
    for(const sow of data.sows){
      const card=CARD_BASELINE.find(c=>c.id===sow.id);if(!card)continue;
      sow.cardBaseline=clone(card);
      if(!sow.birthDate && !data.logs.some(l=>l.profileAfter?.id===sow.id))sow.birthDate=card.birthDate;
    }
    data.cardRestoration=1;return data;
  }
  const STATES=['family','piglets','empty'];
  const TYPES=['育成舎修正','育成舎から移動','種付け','分娩','離乳','子豚移動','スイムジェン 実施','追記','分娩舎修正','廃豚','現役復帰'];
  const PLANS=[['10月16日',['21','47'],'スイムジェン'],['10月20日',['88'],'分娩予定'],['10月24日',['18'],'スイムジェン'],['10月26日',['51'],'スイムジェン'],['10月28日',['98'],'スイムジェン'],['10月30日',['38'],'スイムジェン']];
  const clone=x=>JSON.parse(JSON.stringify(x));
  function baseline(){return Array.from({length:10},(_,i)=>({key:'r'+(i+1),label:'',state:i<3?'family':i<5?'piglets':'empty',sowId:['512','912','106','812','132'][i]||'',count:null}));}
  function nurseryBaseline(){return Array.from({length:5},(_,i)=>({key:'n'+(i+1),state:'unknown',sowId:'',count:null,entered:'',birthDate:''}));}
  function checkNursery(rs){if(rs.length!==5||new Set(rs.map(r=>r.key)).size!==5)throw Error('育成舎は5枠で管理します。');for(const r of rs){if(!/^n[1-5]$/.test(r.key)||!['unknown','empty','occupied'].includes(r.state)||typeof r.sowId!=='string'||(r.count!==null&&(!Number.isInteger(r.count)||r.count<0))||(r.state!=='occupied'&&(r.sowId||r.count!==null||r.entered))||(r.birthDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.birthDate)||!Number.isFinite(Date.parse(r.birthDate))||new Date(r.birthDate).toISOString().slice(0,10)!==r.birthDate))||(r.entered&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.entered)||!Number.isFinite(Date.parse(r.entered))||new Date(r.entered).toISOString().slice(0,10)!==r.entered)))throw Error('育成舎の状態・頭数・入室日を確認してください。');}}
  function uid(){return root.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);}
  function migrate(raw){
    if(raw?.version===3){validate(raw);const data=restoreProfiles(clone(raw));validate(data);return data;}
    if(raw?.version!=null)throw Error('この更新版では読み込めないデータのバージョンです。');
    if(raw!=null && (typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.logs)))throw Error('保存済みデータの形式を確認できません。上書きせず停止しました。');
    const old=raw||{logs:[]};
    const data={...clone(old),version:3,sows:IDS.map(id=>({id,breed:'',birthDate:'',note:''})),plans:clone(PLANS),baseline:baseline(),logs:(old.logs||[]).map(x=>({...x,key:uid(),legacy:true})).reverse()};
    restoreProfiles(data);validate(data);return data;
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
    const rooms=clone(data.baseline),nursery=clone(data.nurseryBaseline||nurseryBaseline());checkRooms(rooms,sows);checkNursery(nursery);
    for(const l of data.logs){
      if(l.legacy)continue;
      const sow=sows[l.id],room=rooms.find(r=>r.key===l.roomKey);
      if(['育成舎修正','育成舎から移動'].includes(l.type)){
        const n=nursery.find(r=>r.key===l.nurseryKey);if(!n)throw Error('育成舎の枠が見つかりません。');
        if(l.type==='育成舎修正'){if(!l.nursery)throw Error('育成舎の内容がありません。');Object.assign(n,clone(l.nursery),{key:n.key});}
        else{if(n.state!=='occupied')throw Error('移動対象の子豚が育成舎にいません。');Object.assign(n,{state:'empty',sowId:'',count:null,entered:'',birthDate:''});}
      }else if(l.type==='分娩舎修正'){
        if(!room||!l.room)throw Error('修正先の部屋が見つかりません。');Object.assign(room,clone(l.room),{key:room.key});
      }else{
        if(!sow)throw Error('記録対象の母豚が見つかりません。');
        if(['種付け','分娩','離乳','廃豚','スイムジェン 実施'].includes(l.type)&&!sow.active)throw Error('廃豚済みの母豚にはこの作業を記録できません。');
        if(l.type==='分娩'){
          if(!room||room.state!=='empty')throw Error('分娩の入室先が空きではありません。先の記録を確認してください。');
          Object.assign(room,{state:'family',sowId:l.id,count:l.count??null,birthDate:l.date});
        }
        if(l.type==='離乳'){
          if(!room||room.state!=='family'||room.sowId!==l.id)throw Error('離乳対象の母豚と在室状態が一致しません。');room.state='piglets';if(l.count!==null&&l.count!==undefined)room.count=l.count;
        }
        if(l.type==='子豚移動'){
          if(!room||room.state!=='piglets'||room.sowId!==l.id)throw Error('移動対象の子豚が部屋にいません。');
          if(l.nurseryKey){const n=nursery.find(r=>r.key===l.nurseryKey);if(!n||n.state!=='empty')throw Error('移動先の育成舎が空きではありません。');Object.assign(n,{state:'occupied',sowId:room.sowId,count:room.count,entered:l.date,birthDate:room.birthDate||''});}
          Object.assign(room,{state:'empty',sowId:'',count:null,birthDate:''});
        }
        if(l.type==='廃豚'){
          if(rooms.some(r=>r.state==='family'&&r.sowId===l.id))throw Error('母豚が分娩舎にいます。先に離乳または分娩舎の修正を記録してください。');sow.active=false;
        }
        if(l.type==='現役復帰')sow.active=true;
      }
      checkRooms(rooms,sows);checkNursery(nursery);
    }
    return {sows,rooms,nursery};
  }
  function commit(data,fn){const next=clone(data);fn(next);validate(next);return next;}
  root.TanakaModel={IDS,STATES,TYPES,PLANS,clone,uid,migrate,validate,replay,commit,baseline};
  if(typeof module!=='undefined')module.exports=root.TanakaModel;
})(typeof globalThis!=='undefined'?globalThis:this);

