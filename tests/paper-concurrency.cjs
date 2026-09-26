const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),key='shici-notebook-v1';
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=fs.readFileSync(path.join(root,'app.js'),'utf8');
const fixture={version:1,preferences:{language:'zh-CN',split:59,fontSize:19,notesFontSize:16},articles:[],words:[]};

function memoryIndexedDb(seed){
  const records=new Map(seed.map(record=>[record.id,record]));let initialized=false;
  return {records,open(){const request={};setTimeout(()=>{const db={objectStoreNames:{contains:()=>initialized},createObjectStore:()=>{},close:()=>{},transaction:()=>{const transaction={};const finish=(operation,result)=>setTimeout(()=>{operation.result=result;operation.onsuccess?.();setTimeout(()=>transaction.oncomplete?.(),0);},0);transaction.objectStore=()=>({put:value=>{const operation={};records.set(value.id,value);finish(operation,value.id);return operation;},get:id=>{const operation={};finish(operation,records.get(id));return operation;},getAll:()=>{const operation={};finish(operation,[...records.values()]);return operation;},delete:id=>{const operation={};records.delete(id);finish(operation,undefined);return operation;}});return transaction;}};request.result=db;if(!initialized){request.onupgradeneeded?.();initialized=true;}request.onsuccess?.();},0);return request;}};
}
const waitFor=async(check,message)=>{for(let attempt=0;attempt<100;attempt++){const value=check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error(message||'Timed out');};
const response=result=>({ok:true,json:async()=>result});

(async()=>{
  const now='2026-09-23T08:00:00.000Z';
  const makePaper=(id,title)=>({id,file:new Blob(['%PDF-1.7'],{type:'application/pdf'}),fileName:`${id}.pdf`,fileType:'application/pdf',title,body:`Abstract for ${title}.\n\nIntroduction for ${title}.`,translatedTitle:'',translation:'',stats:{pages:2,words:8},createdAt:now,updatedAt:now});
  const paperDb=memoryIndexedDb([makePaper('paper-a','Paper Alpha'),makePaper('paper-b','Paper Beta')]);
  const dom=new JSDOM(html,{url:'http://localhost/#papers',runScripts:'outside-only',pretendToBeVisual:true});
  const {window}=dom,document=window.document;window.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};window.indexedDB=paperDb;window.URL.createObjectURL=id=>`blob:${id}`;window.URL.revokeObjectURL=()=>{};
  window.localStorage.setItem(key,JSON.stringify(fixture));window.localStorage.setItem('shici-deepseek-api-key','sk-test-concurrency');
  const pending=new Map(),requests=[];
  window.fetch=(url,options)=>{const payload=JSON.parse(options.body);requests.push(payload.title);return new Promise(resolve=>pending.set(payload.title,()=>resolve(response({titleTranslation:`${payload.title} 译名`,translation:`${payload.title} 摘要译文。\n\n${payload.title} 引言译文。`,translationParagraphs:2}))));};
  window.eval(fs.readFileSync(path.join(root,'i18n.js'),'utf8'));window.eval(script);
  await waitFor(()=>document.querySelector('[data-open-paper="paper-a"]'),'Paper library did not load');

  document.querySelector('[data-open-paper="paper-a"]').click();
  await waitFor(()=>document.querySelector('#paper-translate-button'),'First paper did not open');
  document.querySelector('#paper-translate-button').click();
  await waitFor(()=>pending.has('Paper Alpha'),'First translation did not start');
  window.location.hash='papers';
  await waitFor(()=>document.querySelector('[data-open-paper="paper-b"]'),'Could not return to paper library');
  assert.match(document.querySelector('[data-open-paper="paper-a"] .paper-card-status').textContent,/翻译中/);

  document.querySelector('[data-open-paper="paper-b"]').click();
  await waitFor(()=>document.querySelector('#paper-translate-button'),'Second paper did not open');
  document.querySelector('#paper-translate-button').click();
  await waitFor(()=>pending.has('Paper Beta'),'Second translation did not start');
  assert.deepEqual(requests.sort(),['Paper Alpha','Paper Beta']);

  window.location.hash='papers';
  await waitFor(()=>document.querySelectorAll('.paper-card-status.translating').length===2,'Both background tasks were not shown');
  pending.get('Paper Beta')();
  await waitFor(()=>paperDb.records.get('paper-b')?.translation,'Second result was not saved');
  assert.equal(paperDb.records.get('paper-a').translation,'');
  pending.get('Paper Alpha')();
  await waitFor(()=>paperDb.records.get('paper-a')?.translation,'First result was not saved after switching papers');
  await waitFor(()=>document.querySelectorAll('.paper-card-status.translating').length===0,'Completed task badges did not clear');
  assert.match(paperDb.records.get('paper-a').translation,/Paper Alpha 摘要译文/);
  assert.match(paperDb.records.get('paper-b').translation,/Paper Beta 摘要译文/);
  assert.equal(document.querySelectorAll('.paper-card-status').length,2);
  assert.ok([...document.querySelectorAll('.paper-card-status')].every(node=>/已翻译/.test(node.textContent)));
  dom.window.close();console.log('PASS: multiple paper translations run concurrently and save after switching papers.');
})().catch(error=>{console.error(error);process.exitCode=1;});
