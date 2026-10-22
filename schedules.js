(function(){'use strict';const M=TanakaModel,replay=M.replay;
  function addDays(date,days){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  // One source for the optional, per-parity nursing interval.
  M.plannedWeanDays=card=>Number.isInteger(card?.plannedWeanDays)&&card.plannedWeanDays>=1&&card.plannedWeanDays<=365?card.plannedWeanDays:30;
  // Keep saved history intact; collapse identical work records only in projections.
  function uniqueMatingLogs(logs){
    const seen=new Set(),duplicates=new Set(),cycles=new Map();
    const sorted=logs.map((l,i)=>({l,i})).sort((a,b)=>String(a.l.date||'').localeCompare(String(b.l.date||''))||a.i-b.i);
    for(const {l,i} of sorted){
      if(l.legacy)continue;
      const id=String(l.id||''),cycle=cycles.get(id)||{epoch:0,start:'',last:''};
      if(['再発情確認','分娩','離乳'].includes(l.type)){cycle.epoch++;cycle.start='';cycle.last='';}
      if(l.type==='種付け'){
        if(!cycle.last||l.date>addDays(cycle.last,1))cycle.start=l.date;
        cycle.last=l.date;
        const key=JSON.stringify([id,cycle.epoch,cycle.start,l.parity??'',l.date,String(l.boar||'').trim()]);
        if(seen.has(key))duplicates.add(i);else seen.add(key);
      }
      cycles.set(id,cycle);
    }
    return logs.filter((_,i)=>!duplicates.has(i));
  }
  M.uniqueMatingLogs=uniqueMatingLogs;
  M.assertUniqueMating=function(data,log,excludeKey){
    if(log.legacy||log.type!=='種付け')return;
    const logs=[...data.logs.filter(l=>!excludeKey||l.key!==excludeKey),log];
    if(!uniqueMatingLogs(logs).includes(log))throw Error('同じ日・同じ種雄の種付けは、この周期ですでに登録されています。履歴を確認してください。');
  };
  // A consecutive mating set is derived from existing logs; the first date anchors it.
  function matingSet(logs){
    let set=[];
    for(const l of uniqueMatingLogs(logs).filter(l=>!l.legacy).slice().sort((a,b)=>a.date.localeCompare(b.date)||logs.indexOf(a)-logs.indexOf(b))){
      if(['再発情確認','分娩','離乳'].includes(l.type)){set=[];continue;}
      if(l.type!=='種付け')continue;
      const last=set.at(-1);
      if(!last||l.date>addDays(last.date,1))set=[];
      set.push(l);
    }
    return set;
  }
  function setMatingDates(card,set){
    card.matingSet=[...new Map(set.map(l=>[JSON.stringify([l.date,String(l.boar||'').trim()]),{key:l.key,date:l.date,boar:l.boar||''}])).values()];
    card.mating=set[0].date;card.boar=set.at(-1).boar||'';
    card.reheat=addDays(card.mating,21);card.due=addDays(card.mating,114);card.swimgen=addDays(card.mating,100);
  }
  function reconcileMating(card,logs){
    if(card.reheatPending||card.cycleCompleted)return card;
    const set=matingSet(logs),matches=l=>card.mating===l.date||card.mating===Number(l.date.slice(5,7))+'/'+Number(l.date.slice(8,10));
    // Repair older captured projections without changing any saved log or manual date.
    if(set.length>1&&set.some(matches)){
      const swim=card.swimgen;setMatingDates(card,set);
      if(String(swim||'').includes('済'))card.swimgen=swim;
    }
    return card;
  }
  function resetSwimgenAfterBirth(card,logs){
    const ordered=logs.filter(l=>!l.legacy).slice().sort((a,b)=>a.date.localeCompare(b.date)||logs.indexOf(a)-logs.indexOf(b));
    const birth=ordered.filter(l=>l.type==='分娩').at(-1),mating=ordered.filter(l=>l.type==='種付け').at(-1),swim=ordered.filter(l=>l.type==='スイムジェン 実施').at(-1);
    if(birth&&(!mating||ordered.indexOf(birth)>ordered.indexOf(mating))&&(!swim||ordered.indexOf(swim)<ordered.indexOf(birth))&&(card.birthDateActual===birth.date||card.reproductionStatus==='分娩済み'))card.swimgen='';
    return card;
  }
  M.resetSwimgenAfterBirth=resetSwimgenAfterBirth;
  M.matingSet=matingSet;M.reconcileMating=reconcileMating;
  // Shared card projection: confirmation and subsequent mating are separate facts.
  function applyReproductionEvent(card,log){
    if(log.type==='再発情確認'){
      card.reheatCount=(Number(card.reheatCount)||0)+1;
      card.reheatPending=true;card.lastReheatDate=log.date;card.lastReheatKey=log.key;card.matingSet=[];
      card.failedMating=log.failedMating||{date:card.mating||'',boar:card.boar||'',due:card.due||''};
      card.reproductionStatus='再種付け待ち';
      card.reheat='';card.due='';card.swimgen='';
    }else if(log.type==='種付け'){
      // Older remating-only records still count; a confirmed return counts once.
      const prior=card.matingSet||[],last=prior.at(-1),consecutive=!card.reheatPending&&last&&log.date>=last.date&&log.date<=addDays(last.date,1);
      if(log.remating&&!card.reheatPending&&!log.reheatConfirmationKey&&!consecutive)card.reheatCount=(Number(card.reheatCount)||0)+1;
      card.reheatPending=false;card.reproductionStatus='種付け済み';
      setMatingDates(card,consecutive?[...prior,log]:[log]);
    }else if(log.type==='分娩'){
      card.reheatPending=false;card.reproductionStatus='分娩済み';card.swimgen='';
    }
    return card;
  }
  M.applyReproductionEvent=applyReproductionEvent;
  function schedules(data,day){
    if(!day){const d=new Date();day=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
    const state=replay(data),out=[];
    for(const sow of Object.values(state.sows)){
      if(!sow.active||sow.numberPending)continue;
      const logs=data.logs.filter(l=>!l.legacy&&l.id===sow.id);
      const last=type=>logs.filter(l=>l.type===type).sort((a,b)=>a.date.localeCompare(b.date)||data.logs.indexOf(a)-data.logs.indexOf(b)).at(-1);
      const latestMating=last('種付け'),birth=last('分娩'),set=matingSet(logs.filter(l=>latestMating&&(l.date<latestMating.date||l.date===latestMating.date&&data.logs.indexOf(l)<=data.logs.indexOf(latestMating)))),mating=set[0]||latestMating;
      if(M.isReheatPending(data,sow.id)||globalThis.TanakaSowParity?.pages(data,sow.id)[0]?.awaitingMating)continue;
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
  const swim=last('スイムジェン 実施');
  c.reheatCount=birth?0:Number(c.reheatCount)||0;
  for(const log of logs.filter(l=>!birth||l.date>birth.date))applyReproductionEvent(c,log);
  for(const name of ['mating','reheat','due','swimgen'])if(/^\d{4}-\d{2}-\d{2}$/.test(c[name]||''))c[name]=md(c[name]);
  if(swim&&(!mating||swim.date>=mating.date)&&!c.reheatPending)c.swimgen=md(swim.date)+' 済';
  const page=globalThis.TanakaSowParity?.pages(data,id)[0],current=page?.card;
  if(page?.awaitingMating)Object.assign(c,M.clone(current));
  if(current){for(const name of ['reheatCount','reheatPending','lastReheatDate','lastReheatKey','failedMating','reproductionStatus'])if(name in current)c[name]=M.clone(current[name]);if(current.reheatPending){c.due='';c.reheat='';c.swimgen='';}}
  if(current)for(const name of ['mating','boar','reheat','due','swimgen','matingSet','plannedWeanDays'])if(name in current)c[name]=M.clone(current[name]);
  reconcileMating(c,logs);
  resetSwimgenAfterBirth(c,logs);
  for(const name of ['mating','reheat','due','swimgen'])c[name]=String(c[name]??'').replace(/^(\d{4}-\d{2}-\d{2})(.*)$/,(_,date,suffix)=>md(date)+suffix);
  return c;
}
// Annual farm-wide notices use the saved settings, independently of sow care.
M.farmReminders=function(day,data){return TanakaReminders.entries(data,day);};
M.sowCard=sowCard;
M.isReheatPending=(data,id)=>!!(globalThis.TanakaSowParity?.pages(data,id)[0]?.card||sowCard(data,id)).reheatPending;
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

/* Optional check state: existing records and schema remain intact. */
(function(){
  'use strict';
  const M=TanakaModel;
  M.PIGLET_CARE=[{id:'baycox',days:4,label:'バイコックス',type:'バイコックス 実施'},{id:'respisure',days:10,label:'レシュピシュア',type:'レシュピシュア 実施'},{id:'fostera',days:21,label:'フォステラ',type:'フォステラ 実施'}];
  M.roomBirthDate=function(data,room){
    if(room.birthDate)return room.birthDate;
    if(room.mixed||!room.sowId)return '';
    const births=data.logs.map((l,index)=>({l,index})).filter(x=>!x.l.legacy&&x.l.type==='分娩'&&x.l.id===room.sowId);
    const last=births.at(-1);if(!last||last.l.roomKey!==room.key)return '';
    const after=data.logs.slice(last.index+1);
    if(after.some(l=>!l.legacy&&(l.roomKey===room.key&&(l.type==='子豚移動'||l.type==='分娩舎修正'&&(l.room.state==='empty'||l.room.sowId!==room.sowId)||l.type==='分娩舎内移動')||l.targetRoomKey===room.key)))return '';
    return last.l.date||'';
  };
  M.pigletCare=function(data,room){
    if(!['family','piglets'].includes(room.state))return [];
    let token='baseline',birthKey='',start=-1;
    let identity=M.clone(data.baseline.find(r=>r.key===room.key));
    for(let i=0;i<data.logs.length;i++){
      const l=data.logs[i];if(l.legacy)continue;
      if(l.roomKey===room.key&&l.type==='分娩'){
        token=l.key;birthKey=l.key;start=i;identity={state:'family',sowId:l.id,mixed:false,birthDate:l.date};
      }else if(l.roomKey===room.key&&l.type==='離乳')identity.state='piglets';
      else if(l.type==='分娩舎内移動'&&(l.roomKey===room.key||l.targetRoomKey===room.key)){
        token=l.key;birthKey='';start=i;identity=null;
      }else if(l.roomKey===room.key&&['子豚移動','分娩舎へ移動','移動取り消し'].includes(l.type)){
        token=l.key;birthKey='';start=i;identity={state:l.type==='分娩舎へ移動'?'waiting':'empty',sowId:l.type==='分娩舎へ移動'?l.id:'',mixed:false,birthDate:''};
      }else if(l.roomKey===room.key&&l.type==='分娩舎修正'){
        const r=l.room;
        if(!identity||identity.sowId!==r.sowId||!!identity.mixed!==!!r.mixed||(identity.birthDate||'')!==(r.birthDate||'')||['empty','waiting'].includes(identity.state)!==['empty','waiting'].includes(r.state)){
          token=l.key;birthKey='';start=i;
        }
        identity=M.clone(r);
      }
    }
    const groupKey=JSON.stringify([room.key,token]),saved=data.pigletChecks?.[groupKey],birth=M.roomBirthDate(data,room);
    return M.PIGLET_CARE.map(item=>{
      const oldDone=!!birthKey&&data.logs.slice(start+1).some(l=>!l.legacy&&l.id===room.sowId&&l.type===item.type&&l.date>=birth);
      return {...item,roomKey:room.key,groupKey,date:birth?M.addDays(birth,item.days):'',done:typeof saved?.[item.id]==='boolean'?saved[item.id]:oldDone};
    });
  };
  M.setPigletCheck=function(data,roomKey,itemId){
    const room=M.replay(data).rooms.find(r=>r.key===roomKey),item=room&&M.pigletCare(data,room).find(x=>x.id===itemId);
    if(!item)throw Error('対象の子豚が変わりました。画面を開き直してください。');
    data.pigletChecks=data.pigletChecks||{};
    const values=data.pigletChecks[item.groupKey]||{};
    data.pigletChecks[item.groupKey]={...values,[item.id]:!item.done};
  };
  M.maternalForest=function(data){
    const sows=Object.values(M.replay(data).sows),nodes=new Map(),children=new Map();
    for(const sow of sows)nodes.set(sow.id,{id:sow.id,sow,mother:String(sow.cardBaseline?.mother||'').trim()});
    for(const node of [...nodes.values()]){
      if(!node.mother||['不明','未確認','未入力'].includes(node.mother))continue;
      if(!nodes.has(node.mother))nodes.set(node.mother,{id:node.mother,sow:null,mother:''});
      if(!children.has(node.mother))children.set(node.mother,[]);
      children.get(node.mother).push(node.id);
    }
    const seen=new Set();
    function branch(id,path=new Set()){
      const node=nodes.get(id);
      if(path.has(id))return {...node,cycle:true,children:[]};
      seen.add(id);const next=new Set(path);next.add(id);
      return {...node,children:(children.get(id)||[]).map(child=>branch(child,next))};
    }
    const roots=[...nodes.values()].filter(n=>!n.mother||!nodes.has(n.mother)).map(n=>branch(n.id));
    for(const id of nodes.keys())if(!seen.has(id))roots.push(branch(id));
    return roots;
  };
})();

