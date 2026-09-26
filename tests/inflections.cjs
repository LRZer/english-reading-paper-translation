const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const key='shici-notebook-v1';
const now='2026-09-21T10:00:00.000Z';
const fixture={
  version:1,
  preferences:{split:59,fontSize:19,notesFontSize:16,highlightWords:true,quickAddWords:true},
  articles:[{id:'article',title:'Inflections',body:'A scout scouts, scouted and is scouting. They study, studied and studies. He went and goes. The traveller moved laboriously, without laboriousness. A scoutmaster stayed.',translation:'',createdAt:now,updatedAt:now}],
  words:[
    {id:'scout',articleId:'article',term:'scout',zh:'侦察员',en:'',note:'',context:'',createdAt:now,updatedAt:now},
    {id:'study',articleId:'article',term:'study',zh:'学习',en:'',note:'',context:'',createdAt:now,updatedAt:now},
    {id:'go',articleId:'article',term:'go',zh:'去',en:'',note:'',context:'',createdAt:now,updatedAt:now},
    {id:'laborious',articleId:'article',term:'laborious',zh:'费力的',en:'',note:'',context:'',createdAt:now,updatedAt:now}
  ]
};
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/#study/article',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom,document=window.document;
window.scrollTo=()=>{};window.localStorage.setItem(key,JSON.stringify(fixture));window.eval(fs.readFileSync(path.join(root,'i18n.js'),'utf8'));window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
try{
  const marks=[...document.querySelectorAll('#article-text mark')];
  assert.deepEqual(marks.map(mark=>mark.textContent),['scout','scouts','scouted','scouting','study','studied','studies','went','goes','laboriously']);
  assert.equal(marks.find(mark=>mark.textContent==='scouts').dataset.highlightWord,'scout');
  assert.equal(marks.some(mark=>mark.textContent==='scoutmaster'),false);
  assert.equal(marks.some(mark=>mark.textContent==='laboriousness'),false);
  assert.match(css,/\.article-text mark\{[^}]*background:transparent[^}]*text-decoration-line:underline[^}]*text-decoration-color:#000/);
  assert.doesNotMatch(css,/\.article-text mark\{[^}]*background:rgba/);
  const node=marks.find(mark=>mark.textContent==='scouts').firstChild,range=document.createRange();
  range.selectNodeContents(node);range.getBoundingClientRect=()=>({left:20,bottom:20});window.getSelection().removeAllRanges();window.getSelection().addRange(range);
  document.querySelector('#article-text').dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true}));
  assert.equal(document.querySelector('.selection-action'),null);
  document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'a',code:'KeyA',ctrlKey:true,bubbles:true,cancelable:true}));
  assert.equal(JSON.parse(window.localStorage.getItem(key)).words.length,4);
  assert.equal(document.querySelectorAll('.study-word-item').length,4);
  console.log('PASS: verb, noun, irregular and adjective-to-adverb forms are underlined without partial-word or duplicate matches.');
}finally{window.close();}
