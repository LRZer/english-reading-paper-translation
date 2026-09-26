const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),key='shici-notebook-v1';
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const fixture={version:1,preferences:{language:'en',split:59,fontSize:19,notesFontSize:16},articles:[{id:'article',title:'Locale check',source:'',body:'首页 should stay user content.',translationTitle:'',translation:'',createdAt:'2026-09-22',updatedAt:'2026-09-22'}],words:[]};
const dom=new JSDOM(html,{url:'http://localhost/#study/article',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom,document=window.document;window.scrollTo=()=>{};window.localStorage.setItem(key,JSON.stringify(fixture));
window.eval(fs.readFileSync(path.join(root,'i18n.js'),'utf8'));window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
try{
  assert.equal(window.SHICI_I18N.languages.length,14);
  assert.equal(document.documentElement.lang,'en');assert.equal(document.documentElement.dir,'ltr');
  assert.equal(document.querySelector('[data-nav="home"]').textContent,'Home');
  assert.equal(document.querySelector('.study-tools-trigger').textContent,'Tools');
  assert.equal(document.querySelector('[data-toggle-highlights] span').textContent,'Underline');
  assert.equal(document.querySelector('#article-text').textContent,'首页 should stay user content.');
  assert.equal(document.querySelector('#settings-language').value,'en');
  const englishUi=document.body.cloneNode(true);englishUi.querySelector('#article-text')?.remove();englishUi.querySelector('#settings-language')?.remove();englishUi.querySelector('#header-study')?.remove();assert.doesNotMatch(englishUi.textContent,/\p{Script=Han}/u);
  for(const route of ['#home','#articles','#papers','#vocabulary','#data']){window.location.hash=route;window.dispatchEvent(new window.HashChangeEvent('hashchange'));const view=document.body.cloneNode(true);view.querySelector('#settings-language')?.remove();view.querySelectorAll('.article-preview,.article-card h3,.article-source,.definition,.word-term,.saved-article-row strong').forEach(node=>node.remove());assert.doesNotMatch(view.textContent,/\p{Script=Han}/u,route);}
  window.location.hash='#study/article';window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  const select=document.querySelector('#settings-language');select.value='ar';select.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(document.documentElement.lang,'ar');assert.equal(document.documentElement.dir,'rtl');
  assert.equal(document.querySelector('[data-nav="home"]').textContent,'الرئيسية');
  assert.equal(document.querySelector('.study-tools-trigger').textContent,'الأدوات');
  assert.equal(document.querySelector('[data-toggle-highlights] span').textContent,'تسطير');
  assert.equal(document.querySelector('#article-text').textContent,'首页 should stay user content.');
  assert.equal(JSON.parse(window.localStorage.getItem(key)).preferences.language,'ar');
  console.log('PASS: 14 languages, persisted switching, RTL Arabic, and untouched user content.');
}finally{window.close();}
