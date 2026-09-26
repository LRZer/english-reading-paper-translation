const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),key='shici-notebook-v1';
const fixture={version:1,preferences:{},articles:[
  {id:'first',title:'First article',source:'Magazine',body:'Explorers travel.\n\nThey learn.',createdAt:'2026-09-20',updatedAt:'2026-09-20'},
  {id:'second',title:'Second article',body:'A different subject.',createdAt:'2026-09-20',updatedAt:'2026-09-20'}
],words:[]};
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://127.0.0.1:4173/#study/first',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom,document=window.document;
window.scrollTo=()=>{};window.TextDecoder=TextDecoder;
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;};
window.localStorage.setItem(key,JSON.stringify(fixture));window.localStorage.setItem('shici-deepseek-api-key','sk-test-assistant');
const calls=[];let firstController;
const line=event=>new TextEncoder().encode(JSON.stringify(event)+'\n');
window.fetch=async(url,options)=>{
  assert.equal(url,'/api/deepseek/ask-article-stream');
  const body=JSON.parse(options.body);calls.push(body);
  if(calls.length===1)return {ok:true,body:new ReadableStream({start(controller){firstController=controller;}})};
  const answer=body.title==='Second article'?'Second reply.':'Follow-up reply.';
  return {ok:true,body:new ReadableStream({start(controller){controller.enqueue(line({type:'content',text:answer}));controller.enqueue(line({type:'complete',result:{answer,reasoning:'',model:body.model}}));controller.close();}})};
};
window.eval(fs.readFileSync(path.join(root,'i18n.js'),'utf8'));
window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Timed out waiting for assistant UI');};
const change=(element,value)=>{element.value=value;element.dispatchEvent(new window.Event('change',{bubbles:true}));};
const ask=question=>{const field=document.querySelector('#assistant-question');field.value=question;field.dispatchEvent(new window.Event('input',{bubbles:true}));document.querySelector('#assistant-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));};
(async()=>{try{
  document.querySelector('[data-side-tab="assistant"]').click();
  assert.equal(document.querySelector('[data-side-tab="assistant"]').getAttribute('aria-selected'),'true');
  change(document.querySelector('#assistant-model'),'deepseek-v4-pro');
  document.querySelector('#assistant-thinking').click();
  change(document.querySelector('#assistant-effort'),'max');
  ask('What do they learn?');await waitFor(()=>calls.length===1);
  assert.equal(calls[0].title,'First article');assert.equal(calls[0].source,'Magazine');assert.match(calls[0].text,/Explorers travel/);
  assert.equal(calls[0].model,'deepseek-v4-pro');assert.equal(calls[0].thinking,true);assert.equal(calls[0].reasoningEffort,'max');
  window.location.hash='#study/second';await waitFor(()=>document.querySelector('.header-study h1')?.textContent==='Second article');
  firstController.enqueue(line({type:'reasoning',text:'Check paragraph two.'}));
  firstController.enqueue(line({type:'content',text:'They learn in [P2].'}));
  firstController.enqueue(line({type:'complete',result:{answer:'They learn in [P2].',reasoning:'Check paragraph two.',model:'deepseek-v4-pro'}}));firstController.close();
  document.querySelector('[data-side-tab="assistant"]').click();
  assert.equal(document.querySelectorAll('.assistant-turn').length,0);
  change(document.querySelector('#assistant-model'),'deepseek-flash');document.querySelector('#assistant-thinking').click();
  ask('What is this about?');await waitFor(()=>document.querySelector('.assistant-answer')?.textContent==='Second reply.');
  assert.equal(calls[1].thinking,false);assert.equal(calls[1].model,'deepseek-flash');
  window.location.hash='#study/first';await waitFor(()=>document.querySelector('.header-study h1')?.textContent==='First article');
  assert.match(document.querySelector('.assistant-answer').textContent,/They learn in \[P2\]/);
  assert.match(document.querySelector('.assistant-reasoning-text').textContent,/Check paragraph two/);
  ask('And why?');await waitFor(()=>document.querySelectorAll('.assistant-turn').length===2&&document.querySelectorAll('.assistant-answer')[1].textContent==='Follow-up reply.');
  assert.deepEqual(calls[2].history,[{role:'user',content:'What do they learn?'},{role:'assistant',content:'They learn in [P2].'}]);
  assert.equal(JSON.parse(window.localStorage.getItem(key)).preferences.assistantModel,'deepseek-flash');
  assert.equal(window.localStorage.getItem(key).includes('sk-test-assistant'),false);
  console.log('PASS: article assistant controls, streamed reasoning, per-article sessions, follow-up history and local key isolation.');
}finally{window.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
