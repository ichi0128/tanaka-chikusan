/* Unnumbered replacement gilts keep a private identity until number assignment. */
(function(root){
'use strict';
const M=root.TanakaModel,clone=M.clone;
const pending=s=>s?.numberPending===true;
function linkedSow(pig,state){return Object.values(state.sows).find(s=>s.giltRegistration?.yardPigKey===(pig.pigKey||pig.key))||null;}
function yardKind(pig,state){const s=linkedSow(pig,state);return s?(pending(s)?'育成母豚':'母豚'):['育成母豚','育成母豚候補'].includes(pig.kind)?'育成母豚':'肉豚';}
function validate(data){
  const keys=new Set(),yard=new Set();
  for(const s of data.sows){
    if(s.numberPending!==undefined&&typeof s.numberPending!=='boolean')throw Error('母豚番号の登録状態を確認してください。');
    const g=s.giltRegistration;if(!g){if(pending(s))throw Error('育成母豚の個体情報がありません。');continue;}
    if(typeof g.key!=='string'||!g.key||keys.has(g.key)||typeof g.label!=='string'||!g.label||typeof g.yardPigKey!=='string'||g.birthMonth!==null&&(!Number.isInteger(g.birthMonth)||g.birthMonth<1||g.birthMonth>12))throw Error('育成母豚の個体情報を確認してください。');
    keys.add(g.key);if(g.yardPigKey){if(yard.has(g.yardPigKey))throw Error('この運動場の個体には既に母豚カードがあります。');yard.add(g.yardPigKey);}
    if(pending(s)&&(!/^gilt-[a-zA-Z0-9-]+$/.test(s.id)||g.assignedAt))throw Error('番号未設定の個体情報を確認してください。');
  }
}
function note(data,id,text,date,extra={}){data.logs.push({key:M.uid(),origin:'operator',type:'追記',id,date,t:new Date().toISOString(),note:text,...extra});}
function create(data,values,date,yardPigKey=''){
  const source=yardPigKey?root.TanakaFinishing.yardState(M.replay(data).finishing.find(r=>r.key==='yard')).individuals.find(p=>p.key===yardPigKey):null;
  if(yardPigKey&&!source)throw Error('運動場の個体が変わりました。開き直してください。');
  if(yardPigKey&&data.sows.some(s=>s.giltRegistration?.yardPigKey===yardPigKey))throw Error('この個体の母豚カードは作成済みです。');
  const id='gilt-'+M.uid(),key=M.uid(),label=values.label||'育成'+(data.sows.filter(s=>s.giltRegistration).length+1);
  const s={id,numberPending:true,giltRegistration:{key,label,yardPigKey,birthMonth:source?root.TanakaFinishing.yardBirthMonth(source):null,weight:source?.weight??null,createdAt:new Date().toISOString(),assignedAt:''},breed:'バークシャー',birthDate:values.birthDate||source?.birthDate||'',note:values.note||source?.note||'',cardBaseline:{parity:0,result:'初',mother:values.mother??((source?.sowId==='混成'?'':source?.sowId)||''),birth:values.birthDate||source?.birthDate||'',csf:source?.csf===true?'済':''}};
  data.sows.push(s);
  if(source&&source.kind!=='育成母豚'){
    const F=root.TanakaFinishing,before=F.group(M.replay(data).finishing.find(r=>r.key==='yard')),after=F.yardState({individuals:before.individuals.map(p=>p.key===yardPigKey?{...p,kind:'育成母豚'}:p)});
    data.logs.push({key:M.uid(),origin:'operator',type:'肉豚舎更新',id:'',date,t:new Date().toISOString(),note:'育成母豚カードを作成',finishingKey:'yard',finishingBefore:before,finishingAfter:after,yardIndividuals:1});
  }
  note(data,id,'番号未設定の育成母豚カードを作成',date);return id;
}
function update(data,id,values,date){
  const s=data.sows.find(s=>s.id===id);if(!pending(s))throw Error('番号未設定の育成母豚を選んでください。');const before=clone(s);
  s.birthDate=values.birthDate||'';s.note=values.note||'';s.giltRegistration.label=values.label||s.giltRegistration.label;s.cardBaseline.mother=values.mother||'';
  if(s.parityCards)s.parityCards.current.card.mother=values.mother||'';
  note(data,id,'育成母豚の個体情報を編集',date,{profileBefore:before,profileAfter:clone(s)});
}
function assign(data,id,number,date){
  const s=data.sows.find(s=>s.id===id);if(!pending(s))throw Error('このカードには母豚番号が登録済みです。');
  if(typeof number!=='string'||!/^\d+$/.test(number))throw Error('正式な母豚番号を数字で入力してください。');
  if(data.sows.some(x=>x.id===number)||data.maternalLineage?.relationships.some(r=>r.sowId===number))throw Error('その番号は母豚台帳または系譜に登録済みです。別の番号を確認してください。');
  const before=clone(s);s.id=number;s.numberPending=false;s.giltRegistration.assignedAt=new Date().toISOString();
  // Only this individual's operation references change; monthly snapshots stay frozen.
  data.logs.forEach(l=>{if(l.id===id)l.id=number;});
  note(data,number,'育成母豚に母豚番号 '+number+' を登録',date,{profileBefore:before,profileAfter:clone(s)});
  return number;
}
const previous=M.validate;M.validate=function(data){previous(data);validate(data);};
root.TanakaGilts={pending,linkedSow,yardKind,create,update,assign,validate};
})(typeof globalThis!=='undefined'?globalThis:this);
