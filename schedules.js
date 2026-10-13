(function(){'use strict';const M=TanakaModel,replay=M.replay;
  function addDays(date,days){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  function schedules(data,day){
    if(!day){const d=new Date();day=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
    const state=replay(data),out=[];
    for(const sow of Object.values(state.sows)){
      if(!sow.active)continue;
      const logs=data.logs.filter(l=>!l.legacy&&l.id===sow.id);
      const last=type=>logs.filter(l=>l.type===type).sort((a,b)=>a.date.localeCompare(b.date)||data.logs.indexOf(a)-data.logs.indexOf(b)).at(-1);
      const mating=last('種付け'),birth=last('分娩');
      function add(base,days,label,type){
        const date=addDays(base.date,days);
        const complete=logs.filter(l=>l.type===type&&l.date>=base.date&&data.logs.indexOf(l)>data.logs.indexOf(base)).at(-1);
        if(!complete||date>=day)out.push({id:sow.id,date,label,type,baseKey:base.key,completedKey:complete?.key||''});
      }
      if(mating&&(!birth||birth.date<mating.date)){
        add(mating,21,'再発情確認','再発情確認');add(mating,100,'スイムジェン','スイムジェン 実施');add(mating,114,'分娩予定','分娩');
      }
      if(mating&&birth&&birth.date>=mating.date)add(mating,114,'分娩予定','分娩');
      if(!mating&&sow.cardBaseline){
        const card=sow.cardBaseline;
        const parse=raw=>{const match=/^(\d{1,2})\/(\d{1,2})$/.exec(raw||'');return match?match.slice(1).map(Number):null;};
        const md=parse(card.mating),due=parse(card.due);
        const confirmedFrom='2026-10-12';
        if(due){
          const year=2026+(md&&(due[0]<md[0]||(due[0]===md[0]&&due[1]<md[1]))?1:0);
          const dueDate=year+'-'+String(due[0]).padStart(2,'0')+'-'+String(due[1]).padStart(2,'0');
          const seeds=[[dueDate,'分娩予定','分娩'],[addDays(dueDate,-14),'スイムジェン','スイムジェン 実施']];
          for(const [date,label,type] of seeds){
            if(birth&&type!=='分娩')continue;
            const complete=logs.filter(l=>l.type===type&&l.date>=confirmedFrom).at(-1);
            if(date>=confirmedFrom&&(!complete||date>=day))out.push({id:sow.id,date,label,type,baseKey:'card',completedKey:complete?.key||''});
          }
        }
        const rh=parse(card.reheat);
        if(rh&&md&&!birth){
          const year=2026+(rh[0]<md[0]?1:0),date=year+'-'+String(rh[0]).padStart(2,'0')+'-'+String(rh[1]).padStart(2,'0');
          const complete=logs.filter(l=>l.type==='再発情確認'&&l.date>=confirmedFrom).at(-1);
          if(date>=confirmedFrom&&(!complete||date>=day))out.push({id:sow.id,date,label:'再発情確認',type:'再発情確認',baseKey:'card',completedKey:complete?.key||''});
        }
      }
      if(birth){
        add(birth,4,'子豚 バイコックス','バイコックス 実施');add(birth,10,'子豚 レシュピシュア','レシュピシュア 実施');add(birth,21,'子豚 フォステラ','フォステラ 実施');
      }
    }
    for(const plan of out.filter(x=>x.type==='分娩')){
      const occupied=state.rooms.find(r=>['waiting','family'].includes(r.state)&&r.sowId===plan.id),entry=occupied?data.logs.filter(l=>l.id===plan.id&&l.type==='分娩舎へ移動'&&l.key===occupied.entryKey).at(-1):null;
      const sow=state.sows[plan.id],base=sow.cardBaseline?.parity,parity=base===undefined||base===''?null:Number(base)+data.logs.filter(l=>!l.legacy&&l.id===plan.id&&l.type==='分娩'&&l.key!==plan.completedKey).length;
      if(parity===null)continue;
      const moveDate=addDays(plan.date,parity===0?-7:-4);
      if(!occupied||entry&&moveDate>=day)out.push({id:plan.id,date:moveDate,label:'分娩舎へ移動',type:'分娩舎へ移動',baseKey:plan.baseKey,completedKey:entry?.key||''});
    }
    return out.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  }

function sowCard(data,id){
  const sow=data.sows.find(s=>s.id===id),c=M.clone(sow?.cardBaseline||{});
  const logs=data.logs.filter(l=>!l.legacy&&l.id===id).slice().sort((a,b)=>a.date.localeCompare(b.date)||data.logs.indexOf(a)-data.logs.indexOf(b));
  const last=t=>logs.filter(l=>l.type===t).at(-1),mating=last('種付け'),birth=last('分娩'),wean=last('離乳');
  const md=date=>date?Number(date.slice(5,7))+'/'+Number(date.slice(8,10)):'';
  if(mating){c.boar=mating.boar||'未入力';c.mating=md(mating.date);c.reheat=md(addDays(mating.date,21));c.due=md(addDays(mating.date,114));c.swimgen=md(addDays(mating.date,100));}
  if(wean){c.wean=md(wean.date);const previous=logs.filter(l=>l.type==='分娩'&&l.date<=wean.date).at(-1);c.result=(previous?.count??'―')+'－'+(wean.count??'―');}
  const swim=last('スイムジェン 実施');if(swim&&(!mating||swim.date>=mating.date))c.swimgen=md(swim.date)+' 済';
  c.reheatCount=(birth?0:Number(c.reheatCount)||0)+logs.filter(l=>l.type==='種付け'&&l.remating&&(!birth||l.date>birth.date)).length;
  return c;
}
M.sowCard=sowCard;
for(const t of ['再発情確認','バイコックス 実施','レシュピシュア 実施','フォステラ 実施'])if(!M.TYPES.includes(t))M.TYPES.push(t);M.addDays=addDays;M.schedules=schedules;
const migrate=M.migrate;
M.migrate=function(raw){
  const data=migrate(raw);
  if(data.roomCountRestoration===1)return data;
  const counts=[['r1','512','family',9],['r2','912','family',9],['r3','106','family',9],['r4','812','piglets',6],['r5','132','piglets',11]];
  for(const [key,id,state,count] of counts){
    const room=data.baseline.find(r=>r.key===key);
    if(room&&room.sowId===id&&room.state===state&&room.count===null&&!data.logs.some(l=>!l.legacy&&l.roomKey===key))room.count=count;
  }
  data.roomCountRestoration=1;M.validate(data);return data;
};
})();
