(function(){'use strict';const M=TanakaModel,replay=M.replay;
  function addDays(date,days){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  function schedules(data){
    const state=replay(data),out=[];
    for(const sow of Object.values(state.sows)){
      if(!sow.active)continue;
      const logs=data.logs.filter(l=>!l.legacy&&l.id===sow.id);
      const last=type=>logs.filter(l=>l.type===type).sort((a,b)=>a.date.localeCompare(b.date)||data.logs.indexOf(a)-data.logs.indexOf(b)).at(-1);
      const mating=last('種付け'),birth=last('分娩');
      function add(base,days,label,type){
        const date=addDays(base.date,days);
        const complete=logs.some(l=>l.type===type&&l.date>=base.date&&data.logs.indexOf(l)>data.logs.indexOf(base));
        if(!complete)out.push({id:sow.id,date,label,type,baseKey:base.key});
      }
      if(mating&&(!birth||birth.date<mating.date)){
        add(mating,21,'再発情確認','再発情確認');add(mating,100,'スイムジェン','スイムジェン 実施');add(mating,114,'分娩予定','分娩');
      }
      if(!mating&&!birth&&sow.cardBaseline){
        const card=sow.cardBaseline;
        const parse=raw=>{const match=/^(\d{1,2})\/(\d{1,2})$/.exec(raw||'');return match?match.slice(1).map(Number):null;};
        const md=parse(card.mating),due=parse(card.due);
        const confirmedFrom='2026-10-12';
        if(due){
          const year=2026+(md&&(due[0]<md[0]||(due[0]===md[0]&&due[1]<md[1]))?1:0);
          const dueDate=year+'-'+String(due[0]).padStart(2,'0')+'-'+String(due[1]).padStart(2,'0');
          const seeds=[[dueDate,'分娩予定','分娩'],[addDays(dueDate,-14),'スイムジェン','スイムジェン 実施']];
          for(const [date,label,type] of seeds){
            if(date>=confirmedFrom&&!logs.some(l=>l.type===type&&l.date>=confirmedFrom))out.push({id:sow.id,date,label,type,baseKey:'card'});
          }
        }
        const rh=parse(card.reheat);
        if(rh&&md){
          const year=2026+(rh[0]<md[0]?1:0),date=year+'-'+String(rh[0]).padStart(2,'0')+'-'+String(rh[1]).padStart(2,'0');
          if(date>=confirmedFrom&&!logs.some(l=>l.type==='再発情確認'&&l.date>=confirmedFrom))out.push({id:sow.id,date,label:'再発情確認',type:'再発情確認',baseKey:'card'});
        }
      }
      if(birth){
        add(birth,4,'子豚 バイコックス','バイコックス 実施');add(birth,10,'子豚 レシュピシュア','レシュピシュア 実施');add(birth,21,'子豚 フォステラ','フォステラ 実施');
      }
    }
    return out.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  }

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
