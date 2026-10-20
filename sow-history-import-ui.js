'use strict';
let lastSowNotebookImport=null;
function sowNotebookImportSummary(r){return `追加 ${r.add}件 ／ 重複 ${r.duplicate}件 ／ 要照合 ${r.conflict+r.protected}件 ／ 台帳未登録 ${r.unmatched}件`;}
function sowNotebookImportControls(){return `<details class="card"><summary>過去の分娩ノートを補完</summary><p class="muted">取込用JSONを照合し、既存の母豚の過去産次だけを追加します。最新カード・今後の予定・各豚舎の頭数・系譜は変更しません。</p><button type="button" class="btn secondary" data-notebook="open">分娩ノート取込用JSONを選ぶ</button>${lastSowNotebookImport?`<p role="status">${esc(sowNotebookImportSummary(lastSowNotebookImport))}</p><p class="muted">取込前バックアップを端末に保存・JSON出力しました。追加した履歴は母豚の分娩履歴表から確認できます。</p>`:''}</details>`;}
function openSowNotebookImport(){
  if(simulation){toast('シミュレーション中は分娩ノートの取込を停止しています');return;}
  let payload=null,preview=null,expected='';
  form('過去の分娩ノートを補完','<label for="notebook-file">分娩ノート取込用JSON</label><input id="notebook-file" type="file" accept=".json,application/json" required><div id="notebook-preview" aria-live="polite"></div>','バックアップして過去履歴を追加',()=>{
    if(!payload||!preview)throw Error('先に取込用JSONを選んでください。');if(!preview.add)throw Error('追加対象がありません。重複・要照合の内容を確認してください。');
    if(JSON.stringify(db)!==expected)throw Error('プレビュー後にデータが変わりました。JSONを選び直してください。');
    if(typeof cloudStore!=='undefined'&&cloudStore?.user&&(cloudStore.status!=='ready'||cloudStore.busy||cloudStore.saving))throw Error('クラウドの同期完了後に取り込んでください。');
    const name='tanaka-before-notebook-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',backupKey='tanaka-db-before-notebook-'+new Date().toISOString();
    localStorage.setItem(backupKey,expected);if(localStorage.getItem(backupKey)!==expected)throw Error('取込前バックアップを保存できません。');download(expected,name);
    let result;save(d=>{result=TanakaSowNotebook.apply(d,payload,today(),expected);});lastSowNotebookImport=result;render();
  });
  document.getElementById('notebook-file').onchange=async e=>{payload=null;preview=null;try{const file=e.target.files[0];if(!file)return;const candidate=JSON.parse(await file.text()),result=TanakaSowNotebook.plan(db,candidate,today());expected=JSON.stringify(db);payload=candidate;preview=result;document.getElementById('notebook-preview').innerHTML=`<p><b>${esc(sowNotebookImportSummary(result))}</b></p><p class="muted">追加 ${result.add}件のうち要確認 ${result.review}件。原文・判読メモを各産次の詳細に残します。重複・要照合・未登録は追加しません。</p><details><summary>照合結果を確認（${result.total}件）</summary>${result.items.map(x=>`<p>母豚 ${esc(x.sowId)} · ${x.parity}産 · ${esc(x.birth)}<br>${esc(x.reason)}${x.review?' · 原文に要確認あり':''}</p>`).join('')}</details>`;document.getElementById('form-error').textContent='';}catch(err){document.getElementById('notebook-preview').textContent='';document.getElementById('form-error').textContent=err.message;}};
}
document.addEventListener('click',e=>{if(e.target.closest('[data-notebook="open"]'))openSowNotebookImport();});
