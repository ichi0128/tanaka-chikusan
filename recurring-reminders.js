/* Annual farm notices are part of the normal v3 JSON document. */
(function(root){
'use strict';
const M=root.TanakaModel;
const DEFAULTS=[{id:'je-order-feb',month:2,day:15,message:'そろそろ日本脳炎ワクチンを注文'},{id:'je-order-sep',month:9,day:15,message:'そろそろ日本脳炎ワクチンを注文'}];
const days=month=>[31,29,31,30,31,30,31,31,30,31,30,31][month-1];
function list(data){return data?.recurringReminders===undefined?M.clone(DEFAULTS):data.recurringReminders;}
function initialize(data){if(data.recurringReminders===undefined)data.recurringReminders=M.clone(DEFAULTS);}
function validate(data){
  if(data.recurringReminders===undefined)return;
  if(!Array.isArray(data.recurringReminders))throw Error('定期お知らせの保存形式を確認してください。');
  const keys=new Set();
  for(const x of data.recurringReminders){if(!x||typeof x.id!=='string'||!x.id||keys.has(x.id)||!Number.isInteger(x.month)||x.month<1||x.month>12||!Number.isInteger(x.day)||x.day<1||x.day>days(x.month)||typeof x.message!=='string'||!x.message.trim()||x.message.length>500)throw Error('定期お知らせの月日・通知文を確認してください。');keys.add(x.id);}
}
function entries(data,date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return [];
  const month=Number(date.slice(5,7)),day=Number(date.slice(8,10));
  return list(data).filter(x=>x.month===month&&x.day<=day).map(x=>({id:'',reminderId:x.id,date:date.slice(0,4)+'-'+String(x.month).padStart(2,'0')+'-'+String(x.day).padStart(2,'0'),label:x.message,note:'毎年'+x.month+'月'+x.day+'日のお知らせ',type:'farm-reminder',farm:true}));
}
function update(data,item,expected){
  initialize(data);const index=data.recurringReminders.findIndex(x=>x.id===item.id);
  if(JSON.stringify(index<0?null:data.recurringReminders[index])!==expected)throw Error('定期お知らせが更新されました。開き直してください。');
  if(index<0)data.recurringReminders.push(M.clone(item));else data.recurringReminders[index]=M.clone(item);validate(data);
}
function remove(data,id,expected){initialize(data);const i=data.recurringReminders.findIndex(x=>x.id===id);if(i<0||JSON.stringify(data.recurringReminders[i])!==expected)throw Error('定期お知らせが更新されました。開き直してください。');data.recurringReminders.splice(i,1);}
const previousValidate=M.validate;M.validate=function(data){previousValidate(data);validate(data);};
root.TanakaReminders={list,initialize,entries,update,remove,days,validate};
})(typeof globalThis!=='undefined'?globalThis:this);
