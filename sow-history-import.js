/* One-time notebook payloads merge only into the existing per-parity history. */
(function(root){
'use strict';
const M=root.TanakaModel,P=root.TanakaSowParity,clone=M.clone;
const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function validate(payload){
  if(payload?.type!=='tanaka-parity-history'||payload.version!==1||typeof payload.sourceName!=='string'||!/^[a-f0-9]{64}$/.test(payload.sourceSha256)||!Array.isArray(payload.rows)||payload.rows.length>2000)throw Error('分娩ノート取込用JSONを選んでください。通常のバックアップJSONとは別です。');
  const keys=new Set();for(const r of payload.rows){if(!r||typeof r.sowId!=='string'||!r.sowId||!Number.isSafeInteger(r.parity)||r.parity<1||typeof r.sourceRecord!=='string'||keys.has(r.sourceRecord)||!r.card||r.card.parity!==r.parity||!iso(r.card.birthDateActual)||!r.card.notebookSource)throw Error('母豚番号・産次・分娩日・取込元を確認してください。');keys.add(r.sourceRecord);
    for(const k of ['mating','due','weanDateActual'])if(r.card[k]&&!iso(r.card[k]))throw Error('Excelの年付き日付を確認してください。');
    for(const k of ['birthCount','weanCount','nursingDays','blackPiglets','crushed','weakDeaths','fosterOut','fosterIn'])if(r.card[k]!==undefined&&r.card[k]!==null&&(!Number.isSafeInteger(r.card[k])||r.card[k]<0))throw Error('頭数・授乳期間を確認してください。');
  }return payload;
}
function plan(data,payload,day){
  validate(payload);if(!iso(day))throw Error('確認日を確認してください。');
  const bySow=new Map(),items=[];
  for(const r of payload.rows){
    const sow=data.sows.find(s=>s.id===r.sowId&&!s.numberPending),source=r.card.notebookSource,item={sowId:r.sowId,parity:r.parity,birth:r.card.birthDateActual,sourceRecord:r.sourceRecord,page:source.page,line:source.line,review:!!source.needsReview,status:'add',reason:'過去履歴を追加'};
    if(!sow){item.status='unmatched';item.reason='既存の母豚台帳に番号なし（自動登録しません）';}
    else{
      if(!bySow.has(sow.id))bySow.set(sow.id,P.pages(data,sow.id));const pages=bySow.get(sow.id),current=pages[0];
      const same=pages.find(p=>p.card.notebookSource?.sourceSha256===payload.sourceSha256&&p.card.notebookSource?.sourceRecord===r.sourceRecord||p.card.birthDateActual===r.card.birthDateActual||p.parity===r.parity&&/^\d{1,2}\/\d{1,2}$/.test(p.card.birthDateActual||'')&&p.card.birthDateActual===Number(r.card.birthDateActual.slice(5,7))+'/'+Number(r.card.birthDateActual.slice(8)));
      if(same){item.status='duplicate';item.reason='同じ取込元または分娩日が既存履歴にあります';}
      else if(pages.some(p=>p.parity===r.parity)){item.status='conflict';item.reason='同じ産次が登録済み・日付等の照合が必要（上書きしません）';}
      else if(r.card.birthDateActual>day||current?.parity!==null&&r.parity>current.parity){item.status='protected';item.reason='最新産次より先、または未来の日付（現在値・予定を保護）';}
      else pages.push({key:'preview:'+r.sourceRecord,parity:r.parity,card:r.card});
    }items.push(item);
  }
  const count=status=>items.filter(x=>x.status===status).length;
  return {total:items.length,add:count('add'),duplicate:count('duplicate'),conflict:count('conflict'),unmatched:count('unmatched'),protected:count('protected'),review:items.filter(x=>x.status==='add'&&x.review).length,items};
}
function apply(data,payload,day,expected){
  if(JSON.stringify(data)!==expected)throw Error('プレビュー後に記録が更新されました。開き直して照合してください。');
  const result=plan(data,payload,day),PAGES=new Map(),stamp=new Date().toISOString();
  for(const item of result.items.filter(x=>x.status==='add')){
    const r=payload.rows.find(r=>r.sourceRecord===item.sourceRecord),s=data.sows.find(s=>s.id===item.sowId);
    if(!PAGES.has(s.id))PAGES.set(s.id,P.pages(data,s.id));
    // Materialize the same existing projection without starting a new cycle.
    if(!s.parityCards){const all=PAGES.get(s.id).slice().reverse(),current=all.pop();s.parityCards={version:1,history:all,current:{...clone(current),capturedKeys:data.logs.filter(l=>!l.legacy&&l.id===s.id).map(l=>l.key)}};}
    const key='notebook:'+payload.sourceSha256+':'+r.sourceRecord,card=clone(r.card);
    card.notebookSource={...card.notebookSource,sourceSha256:payload.sourceSha256,sourceRecord:r.sourceRecord,importedAt:stamp};
    s.parityCards.history.push({key,parity:r.parity,card,source:'過去の分娩ノート',savedAt:stamp,revisions:[]});item.key=key;
  }
  // The latest card must remain byte-equivalent in value, including future plans.
  for(const [id,before] of PAGES)if(JSON.stringify(P.pages(data,id)[0].card)!==JSON.stringify(before[0].card))throw Error('最新カードの保持を確認できないため取り込みを中止しました。');
  M.validate(data);return result;
}
root.TanakaSowNotebook={validate,plan,apply};
})(typeof globalThis!=='undefined'?globalThis:this);
