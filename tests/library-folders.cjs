const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),key='shici-notebook-v1';
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),script=fs.readFileSync(path.join(root,'app.js'),'utf8'),i18n=fs.readFileSync(path.join(root,'i18n.js'),'utf8');

function memoryIndexedDb(records){let initialized=false;return {open(){const request={};setTimeout(()=>{const db={objectStoreNames:{contains:()=>initialized},createObjectStore:()=>{},close:()=>{},transaction:()=>{const transaction={};const finish=(operation,result)=>setTimeout(()=>{operation.result=result;operation.onsuccess?.();setTimeout(()=>transaction.oncomplete?.(),0);},0);transaction.objectStore=()=>({put:value=>{const operation={};records.set(value.id,value);finish(operation,value.id);return operation;},get:id=>{const operation={};finish(operation,records.get(id));return operation;},getAll:()=>{const operation={};finish(operation,[...records.values()]);return operation;},delete:id=>{const operation={};records.delete(id);finish(operation);return operation;}});return transaction;}};request.result=db;if(!initialized){request.onupgradeneeded?.();initialized=true;}request.onsuccess?.();},0);return request;}};}
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const waitFor=async(check)=>{for(let attempt=0;attempt<100;attempt++){const value=check();if(value)return value;await pause(10);}throw new Error('论文库未完成载入');};

(async()=>{
  const now='2026-09-22T08:00:00.000Z',fixture={version:1,folders:[{id:'reading-folder',name:'雅思阅读',type:'article',createdAt:now},{id:'paper-folder',name:'图像增强',type:'paper',createdAt:now}],preferences:{language:'zh-CN',split:59,fontSize:19,notesFontSize:16},articles:[{id:'article-1',folderId:null,title:'Reading sample',source:'IELTS',body:'An English reading passage.',translationTitle:'',translation:'',createdAt:now,updatedAt:now}],words:[],activity:{usageByDate:{}}};
  const records=new Map(),dom=new JSDOM(html,{url:'http://localhost/#articles',runScripts:'outside-only',pretendToBeVisual:true}),{window}=dom,document=window.document;
  records.set('paper-1',{id:'paper-1',folderId:'paper-folder',file:new window.File(['%PDF-1.7'],'paper.pdf',{type:'application/pdf'}),fileName:'paper.pdf',fileType:'application/pdf',title:'Saved paper',body:'Abstract. Saved body.',translatedTitle:'已保存论文',translation:'已保存译文。',stats:{pages:8,words:3200},createdAt:now,updatedAt:now});
  window.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};window.indexedDB=memoryIndexedDb(records);window.URL.createObjectURL=()=> 'blob:paper';window.URL.revokeObjectURL=()=>{};window.localStorage.setItem(key,JSON.stringify(fixture));window.fetch=async()=>{throw new Error('No network request expected');};window.eval(i18n);window.eval(script);

  assert.equal(document.querySelector('[data-nav="articles"]').textContent,'文章库');assert.equal(document.querySelector('[data-nav="papers"]').textContent,'论文库');assert.match(document.querySelector('.folder-sidebar').textContent,/雅思阅读/);
  const articleMove=document.querySelector('[data-move-article="article-1"]');articleMove.value='reading-folder';articleMove.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(JSON.parse(window.localStorage.getItem(key)).articles[0].folderId,'reading-folder');
  document.querySelector('[data-new-folder="article"]').click();document.querySelector('#folder-name').value='新闻';document.querySelector('#folder-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.ok(JSON.parse(window.localStorage.getItem(key)).folders.some(folder=>folder.name==='新闻'&&folder.type==='article'));

  window.location.hash='#papers';window.dispatchEvent(new window.HashChangeEvent('hashchange'));await waitFor(()=>document.querySelector('.paper-card h3'));
  assert.match(document.querySelector('.folder-sidebar').textContent,/图像增强/);assert.equal(document.querySelector('.paper-card h3').textContent,'已保存论文');
  const paperMove=document.querySelector('[data-move-paper="paper-1"]');paperMove.value='';paperMove.dispatchEvent(new window.Event('change',{bubbles:true}));await pause(60);assert.equal(records.get('paper-1').folderId,null);
  document.querySelector('[data-new-folder="paper"]').click();document.querySelector('#folder-name').value='低光成像';document.querySelector('#folder-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.ok(JSON.parse(window.localStorage.getItem(key)).folders.some(folder=>folder.name==='低光成像'&&folder.type==='paper'));
  window.close();console.log('PASS: article and paper libraries stay separate, folders persist, and items move between folders.');
})().catch(error=>{console.error(error);process.exitCode=1;});
