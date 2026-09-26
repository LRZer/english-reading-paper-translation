const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),key='shici-notebook-v1';
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=fs.readFileSync(path.join(root,'app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const fixture={version:1,preferences:{language:'zh-CN',split:59,fontSize:19,notesFontSize:16},articles:[],words:[]};
const waitFor=async(check,message)=>{for(let attempt=0;attempt<100;attempt++){const value=check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error(message||'Timed out');};
function memoryIndexedDb(){
  const records=new Map();let initialized=false;
  return {records,open(){const request={};setTimeout(()=>{const db={objectStoreNames:{contains:()=>initialized},createObjectStore:()=>{},close:()=>{},transaction:()=>{const transaction={};const finish=(operation,result)=>setTimeout(()=>{operation.result=result;operation.onsuccess?.();setTimeout(()=>transaction.oncomplete?.(),0);},0);transaction.objectStore=()=>({put:value=>{const operation={};records.set(value.id,value);finish(operation,value.id);return operation;},get:id=>{const operation={};finish(operation,records.get(id));return operation;},getAll:()=>{const operation={};finish(operation,[...records.values()]);return operation;},delete:id=>{const operation={};records.delete(id);finish(operation,undefined);return operation;}});return transaction;}};request.result=db;if(!initialized){request.onupgradeneeded?.();initialized=true;}request.onsuccess?.();},0);return request;}};
}

(async()=>{
  const paperDb=memoryIndexedDb();
  const dom=new JSDOM(html,{url:'http://localhost/#papers',runScripts:'outside-only',pretendToBeVisual:true});
  const {window}=dom,document=window.document;window.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
  window.indexedDB=paperDb;
  window.localStorage.setItem(key,JSON.stringify(fixture));
  window.localStorage.setItem('shici-deepseek-api-key','sk-test-paper-key');window.URL.createObjectURL=()=> 'blob:paper-preview';window.URL.revokeObjectURL=()=>{};
  const requests=[];
  window.fetch=async(url,options)=>{requests.push({url,options});return url==='/api/paper/extract'
    ? {ok:true,json:async()=>({title:'Extracted paper',source:'sample.pdf',body:'Abstract. Example body.\n\n1 Introduction\n\nA readable paragraph.',stats:{pages:8,paragraphs:3,words:9,twoColumnPages:6}})}
    : {ok:true,json:async()=>({titleTranslation:'论文译名',translation:'摘要译文。\n\n引言\n\n完整段落译文。',translationParagraphs:3})};};
  window.eval(fs.readFileSync(path.join(root,'i18n.js'),'utf8'));window.eval(script);
  assert.ok(document.querySelector('[data-nav="papers"].active'));assert.match(document.querySelector('#paper-file').accept,/pdf/);
  const event=new window.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{files:[new window.File(['%PDF-1.7'], 'sample.pdf',{type:'application/pdf'})]}});document.querySelector('#paper-drop-zone').dispatchEvent(event);
  await waitFor(()=>document.querySelector('.paper-translation-document h2'),'Paper translation did not finish');
  assert.deepEqual(requests.map(item=>item.url),['/api/paper/extract','/api/deepseek/translate-stream']);assert.equal(requests[0].options.headers['Content-Type'],'application/pdf');
  assert.equal(JSON.parse(requests[1].options.body).mode,'paper');
  assert.match(css,/\.paper-native-viewer\{[^}]*width:100%;height:100%/);
  assert.equal(document.querySelector('#paper-pdf-viewer.paper-native-viewer')?.tagName,'IFRAME');assert.equal(document.querySelector('#paper-pdf-viewer').getAttribute('src'),'blob:paper-preview');assert.equal(document.querySelector('.app-header .paper-open-original').getAttribute('href'),'blob:paper-preview');assert.equal(document.querySelector('.app-header .paper-library-back').getAttribute('href'),'#papers');assert.ok(document.querySelector('.app-header [data-move-paper]'));assert.equal(document.querySelector('[data-paper-zoom]'),null);assert.equal(document.querySelector('.paper-pane-bar'),null);assert.equal(document.querySelector('.app-header .paper-header-title').textContent,'Extracted paper');
  assert.equal(document.querySelector('.paper-translation-document h2').textContent,'论文译名');assert.match(document.querySelector('.paper-translation-document').textContent,/完整段落译文/);assert.equal(document.querySelector('#paper-body'),null);
  const paperDate=document.querySelector('#paper-date-input');paperDate.value='2023-08';paperDate.dispatchEvent(new window.Event('change',{bubbles:true}));await waitFor(()=>[...paperDb.records.values()][0]?.paperDate==='2023-08','Paper date did not autosave');
  assert.equal(JSON.parse(window.localStorage.getItem(key)).articles.length,0);
  const saved=[...paperDb.records.values()][0];assert.equal(saved.fileName,'sample.pdf');assert.equal(saved.title,'Extracted paper');assert.equal(saved.paperDate,'2023-08');assert.equal(saved.translatedTitle,'论文译名');assert.match(saved.translation,/完整段落译文/);
  window.location.hash='papers';await waitFor(()=>document.querySelector('.paper-date-tag'),'Paper date tag did not appear in library');assert.equal(document.querySelector('.paper-date-tag').textContent,'2023-08');

  const restoredDom=new JSDOM(html,{url:`http://localhost/#papers/open/${saved.id}`,runScripts:'outside-only',pretendToBeVisual:true}),restoredWindow=restoredDom.window,restoredDocument=restoredWindow.document;
  restoredWindow.scrollTo=()=>{};restoredWindow.HTMLElement.prototype.scrollIntoView=()=>{};restoredWindow.indexedDB=paperDb;restoredWindow.URL.createObjectURL=()=> 'blob:restored-paper';restoredWindow.URL.revokeObjectURL=()=>{};restoredWindow.fetch=async()=>{throw new Error('saved paper should restore without another API request');};restoredWindow.localStorage.setItem(key,JSON.stringify(fixture));
  restoredWindow.eval(fs.readFileSync(path.join(root,'i18n.js'),'utf8'));restoredWindow.eval(script);await waitFor(()=>restoredDocument.querySelector('.paper-translation-document h2'),'Saved paper did not restore');
  assert.equal(restoredDocument.querySelector('.app-header .paper-header-title').textContent,'Extracted paper');assert.equal(restoredDocument.querySelector('#paper-pdf-viewer').getAttribute('src'),'blob:restored-paper');assert.equal(restoredDocument.querySelector('.app-header #paper-date-input').value,'2023-08');assert.equal(restoredDocument.querySelector('.paper-translation-document h2').textContent,'论文译名');assert.match(restoredDocument.querySelector('.paper-translation-document').textContent,/完整段落译文/);
  restoredDom.window.close();window.close();console.log('PASS: original PDF, custom paper date and complete translation autosave to IndexedDB and restore after reload.');
})().catch(error=>{console.error(error);process.exitCode=1;});
