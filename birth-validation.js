(function(){
  'use strict';
  const M=TanakaModel,validate=M.validate,migrate=M.migrate,commit=M.commit;
  function check(data){
    for(const l of data.logs){
      if(l.legacy||l.type!=='分娩')continue;
      if(l.stillborn!=null&&(!Number.isInteger(l.stillborn)||l.stillborn<0))throw Error('死産頭数は0以上の整数で入力してください。');
      if(l.birthTotal!==undefined){if(!Number.isSafeInteger(l.birthTotal)||!Number.isSafeInteger(l.count))throw Error('出産総数と生存頭数は0以上の整数で保存してください。');const counts=M.birthCounts(l.birthTotal,l.count);if(l.stillborn!==counts.stillborn)throw Error('出産総数・生存頭数・死産頭数が一致しません。');}
      if(l.birthTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(l.birthTime))throw Error('出産時刻が不正です。');
    }
  }
  M.validate=function(data){validate(data);check(data);};
  M.migrate=function(raw){const data=migrate(raw);check(data);return data;};
  M.commit=function(data,fn){const next=commit(data,fn);check(next);return next;};
})();
