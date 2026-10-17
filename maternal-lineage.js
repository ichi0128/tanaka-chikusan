/* Maternal relationships are saved data, independent of barn events and parity history. */
(function(root){
'use strict';
const M=root.TanakaModel,clone=M.clone,sort=(a,b)=>a.localeCompare(b,'ja',{numeric:true});
const clean=value=>['不明','未確認','未入力'].includes(String(value||'').trim())?'':String(value||'').trim();
function validateRows(rows){
  if(!Array.isArray(rows))throw Error('母系系譜の保存形式を確認してください。');
  const map=new Map();
  for(const r of rows){if(!r||typeof r.sowId!=='string'||!r.sowId.trim()||r.sowId.length>80||typeof r.motherId!=='string'||r.motherId.length>80||map.has(r.sowId))throw Error('系譜の母豚番号・母番号を確認してください。');map.set(r.sowId,r.motherId);}
  for(const id of map.keys()){const seen=new Set();let current=id;while(current&&map.has(current)){if(seen.has(current))throw Error('自分自身や子孫を母に指定できません。親子関係を確認してください。');seen.add(current);current=map.get(current);}}
}
function validate(data){
  const g=data.maternalLineage;if(g===undefined)return;
  if(!g||g.version!==1||!Array.isArray(g.revisions))throw Error('母系系譜の保存形式を確認してください。');validateRows(g.relationships);
  for(const revision of g.revisions){if(!revision||typeof revision.at!=='string'||!Number.isFinite(Date.parse(revision.at)))throw Error('系譜の修正履歴を確認してください。');validateRows(revision.before);}
}
function parents(rows){const map=new Map(rows.map(r=>[r.sowId,{sowId:r.sowId,motherId:r.motherId}]));for(const r of [...map.values()])if(r.motherId&&!map.has(r.motherId))map.set(r.motherId,{sowId:r.motherId,motherId:''});return [...map.values()];}
function rows(data){
  const map=new Map((data.maternalLineage?.relationships||[]).map(r=>[r.sowId,clone(r)]));
  for(const s of data.sows)if(!map.has(s.id))map.set(s.id,{sowId:s.id,motherId:clean(s.cardBaseline?.mother)});
  return parents([...map.values()]);
}
function initialize(data,seed){
  if(data.maternalLineage!==undefined)return;
  if(seed?.version!==1)throw Error('系譜の初期データを読み込めません。');validateRows(seed.relationships);
  const map=new Map(data.sows.map(s=>[s.id,{sowId:s.id,motherId:clean(s.cardBaseline?.mother)}]));
  seed.relationships.forEach(r=>map.set(r.sowId,clone(r)));
  data.maternalLineage={version:1,relationships:parents([...map.values()]),revisions:[]};validate(data);
}
function record(g,before){const signature=rows=>JSON.stringify(rows.map(r=>[r.sowId,r.motherId]));if(signature(g.relationships)!==signature(before))g.revisions.push({at:new Date().toISOString(),before});}
function set(data,sowId,motherId,expected){
  const g=data.maternalLineage;if(!g)throw Error('系譜の初期データを読み込み中です。');
  const old=g.relationships.find(r=>r.sowId===sowId)||null;
  if(expected!==undefined&&JSON.stringify(old)!==expected)throw Error('系譜が更新されました。開き直してください。');
  const before=clone(g.relationships),i=g.relationships.findIndex(r=>r.sowId===sowId),next={sowId,motherId};
  if(i<0)g.relationships.push(next);else g.relationships[i]=next;
  g.relationships=parents(g.relationships);validateRows(g.relationships);record(g,before);
}
function rename(g,oldId,newId){
  if(oldId===newId)return;
  if(g.relationships.some(r=>r.sowId===newId))throw Error('系譜に同じ番号があります。系譜設定を確認してください。');
  g.relationships.forEach(r=>{if(r.sowId===oldId)r.sowId=newId;if(r.motherId===oldId)r.motherId=newId;});
}
function forest(data,id){
  const sows=M.replay(data).sows,map=new Map(rows(data).map(r=>[r.sowId,{id:r.sowId,mother:r.motherId,sow:sows[r.sowId]||null,children:[]}]));
  for(const n of map.values())if(n.mother&&map.has(n.mother))map.get(n.mother).children.push(n);
  const visited=new Set();
  const branch=(n,path=new Set())=>{visited.add(n.id);if(path.has(n.id))return {...n,cycle:true,children:[]};const next=new Set(path);next.add(n.id);return {...n,children:n.children.slice().sort((a,b)=>sort(a.id,b.id)).map(child=>branch(child,next))};};
  if(id){let n=map.get(id);if(!n)return [];const seen=new Set();while(n.mother&&map.has(n.mother)&&!seen.has(n.id)){seen.add(n.id);n=map.get(n.mother);}return [branch(n)];}
  const result=[...map.values()].filter(n=>!n.mother||!map.has(n.mother)).sort((a,b)=>sort(a.id,b.id)).map(n=>branch(n));
  for(const n of map.values())if(!visited.has(n.id))result.push(branch(n));return result;
}
const previousValidate=M.validate;M.validate=function(data){previousValidate(data);validate(data);};
const commit=M.commit;M.commit=function(data,fn){
  const next=commit(data,fn),g=next.maternalLineage;
  if(g){
    const before=clone(g.relationships),oldSows=new Map(data.sows.map(s=>[s.id,s])),oldKeys=new Set(data.logs.map(l=>l.key));
    for(const l of next.logs)if(!oldKeys.has(l.key)&&l.profileBefore?.id&&l.profileAfter?.id&&l.profileBefore.id!==l.profileAfter.id){rename(g,l.profileBefore.id,l.profileAfter.id);oldSows.set(l.profileAfter.id,oldSows.get(l.profileBefore.id));}
    for(const s of next.sows){
      const old=oldSows.get(s.id),oldMother=clean(old?.parityCards?.current.card.mother??old?.cardBaseline?.mother),newMother=clean(s.parityCards?.current.card.mother??s.cardBaseline?.mother);
      if((!old&&(!g.relationships.some(r=>r.sowId===s.id)||newMother))||(old&&oldMother!==newMother)){
        const i=g.relationships.findIndex(r=>r.sowId===s.id),r={sowId:s.id,motherId:newMother};if(i<0)g.relationships.push(r);else g.relationships[i]=r;
      }
    }
    g.relationships=parents(g.relationships);validateRows(g.relationships);record(g,before);
  }
  M.validate(next);return next;
};
M.maternalForest=forest;
root.TanakaMaternal={initialize,rows,forest,set,validate};
})(typeof globalThis!=='undefined'?globalThis:this);
