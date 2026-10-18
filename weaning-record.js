/* Additive actual-weaning metadata; existing ledger replay and storage stay unchanged. */
(function(root){
'use strict';
const M=root.TanakaModel;
function createLog(data,{id,roomKey,date,operator,count=null,note='',key,t}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('実離乳日を確認してください。');
  operator=String(operator||'').trim();if(!operator)throw Error('操作者を入力してください。');
  const state=M.replay(data),room=state.rooms.find(r=>r.key===roomKey);
  if(!room||room.state!=='family'||room.sowId!==id)throw Error('対象の母豚と授乳中の部屋を確認してください。');
  const birth=M.roomBirthDate(data,room),known=/^\d{4}-\d{2}-\d{2}$/.test(birth||'')&&Number.isFinite(Date.parse(birth)),days=known?Math.round((Date.parse(date)-Date.parse(birth))/86400000):null;
  if(days!==null&&days<0)throw Error('出産日より前には離乳できません。');
  return {key:key||M.uid(),type:'離乳',origin:'operator',id,roomKey,date,t:t||new Date().toISOString(),operator,sourceRoom:M.clone(room),birthDate:known?birth:'',nursingDays:days,count,note};
}
root.TanakaWeaning={createLog};
})(typeof globalThis!=='undefined'?globalThis:this);
