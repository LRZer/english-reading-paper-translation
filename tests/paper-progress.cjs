const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),key='shici-notebook-v1';
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),script=fs.readFileSync(path.join(root,'app.js'),'utf8');
const fixture={version:1,preferences:{language:'zh-CN',split:59,fontSize:19,notesFontSize:16},articles:[],words:[]};
function memoryIndexedDb(record){
  const records=new Map([[record.id,record]]);let initialized=false;
  return {records,open(){const request={};setTimeout(()=>{const db={objectStoreNames:{contains:()=>initialized},createObjectStore:()=>{},close:()=>{},transaction:()=>{const transaction={};const finish=(operation,result)=>setTimeout(()=>{operation.result=result;operation.onsuccess?.();setTimeout(()=>transaction.oncomplete?.(),0);},0);transaction.objectStore=()=>({put:value=>{const operation={};records.set(value.id,value);finish(operation,value.id);return operation;},get:id=>{const operation={};finish(operation,records.get(id));return operation;},getAll:()=>{const operation={};finish(operation,[...records.values()]);return operation;},delete:id=>{const operation={};records.delete(id);finish(operation);return operation;}});return transaction;}};request.result=db;if(!initialized){request.onupgradeneeded?.();initialized=true;}request.onsuccess?.();},0);return request;}};
}
const waitFor=async(check,message)=>{for(let attempt=0;attempt<100;attempt++){const value=check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error(message||'Timed out');};
(async()=>{
  const now='2026-09-23T08:00:00.000Z',record={id:'progress-paper',file:new Blob(['%PDF-1.7'],{type:'application/pdf'}),fileName:'progress.pdf',fileType:'application/pdf',title:'Progress Paper',body:'First paragraph.\n\nSecond paragraph.',translatedTitle:'',translation:'',stats:{pages:1,words:4},createdAt:now,updatedAt:now},paperDb=memoryIndexedDb(record);
  const dom=new JSDOM(html,{url:'http://localhost/#papers/open/progress-paper',runScripts:'outside-only',pretendToBeVisual:true}),{window}=dom,document=window.document;
  window.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};window.indexedDB=paperDb;window.URL.createObjectURL=()=> 'blob:paper';window.URL.revokeObjectURL=()=>{};window.TextDecoder=TextDecoder;window.localStorage.setItem(key,JSON.stringify(fixture));window.localStorage.setItem('shici-deepseek-api-key','sk-test-progress');
  let controller;window.fetch=async()=>({ok:true,body:new ReadableStream({start(value){controller=value;}})});
  window.eval(fs.readFileSync(path.join(root,'i18n.js'),'utf8'));window.eval(script);
  await waitFor(()=>document.querySelector('#paper-translate-button'),'Paper did not open');document.querySelector('#paper-translate-button').click();
  await waitFor(()=>document.querySelector('#paper-progress-label'),'Progress view did not appear');assert.match(document.querySelector('#paper-progress-label').textContent,/连接/);
  const send=value=>controller.enqueue(new TextEncoder().encode(`${JSON.stringify(value)}\n`));
  send({type:'progress',phase:'reasoning',completedParagraphs:0,totalParagraphs:2,receivedChars:0});
  await waitFor(()=>/理解论文/.test(document.querySelector('#paper-progress-label')?.textContent),'Reasoning stage was not shown');assert.match(document.querySelector('#paper-progress-detail').textContent,/第 1 \/ 2 阶段/);
  send({type:'progress',phase:'translating',completedParagraphs:1,totalParagraphs:2,receivedChars:40});
  await waitFor(()=>/1 \/ 2 个段落/.test(document.querySelector('#paper-progress-detail')?.textContent),'Paragraph progress was not shown');assert.equal(document.querySelector('#paper-progress-track').getAttribute('aria-valuenow'),'57');
  send({type:'progress',phase:'finalizing',completedParagraphs:2,totalParagraphs:2,receivedChars:80});
  send({type:'complete',result:{titleTranslation:'进度论文',translation:'第一段译文。\n\n第二段译文。',translationParagraphs:2}});controller.close();
  await waitFor(()=>document.querySelector('.paper-translation-document h2'),'Completed translation was not shown');assert.equal(document.querySelector('.paper-translation-document h2').textContent,'进度论文');assert.match(paperDb.records.get('progress-paper').translation,/第二段译文/);
  dom.window.close();console.log('PASS: paper translation shows live stages, elapsed activity and paragraph progress.');
})().catch(error=>{console.error(error);process.exitCode=1;});
