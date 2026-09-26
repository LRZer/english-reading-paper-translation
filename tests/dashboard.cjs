const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=fs.readFileSync(path.join(root,'app.js'),'utf8');
const i18n=fs.readFileSync(path.join(root,'i18n.js'),'utf8');
const key='shici-notebook-v1';
const now=new Date().toISOString();
const currentDate=new Date();
const day=`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`;
const fixture={
  version:1,
  preferences:{split:59,fontSize:19,notesFontSize:16},
  activity:{usageByDate:{[day]:3600000}},
  articles:[{id:'article-1',title:'Saved article',body:'A short saved article.',createdAt:now,updatedAt:now}],
  words:[{id:'word-1',articleId:'article-1',term:'saved',zh:'已保存',en:'kept',note:'',context:'A short saved article.',createdAt:now,updatedAt:now}]
};
const dom=new JSDOM(html,{url:'http://localhost/#data',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom;
window.scrollTo=()=>{};
window.localStorage.setItem(key,JSON.stringify(fixture));
window.eval(i18n);window.eval(script);
const document=window.document;
assert.equal(document.querySelector('[data-nav="data"].active').textContent,'数据');
assert.equal(document.querySelectorAll('.data-summary article').length,3);
assert.match(document.querySelector('.data-summary').textContent,/1 小时/);
assert.equal(document.querySelectorAll('.bar-chart').length,2);
assert.equal(document.querySelectorAll('.bar-chart .chart-column').length,14);
assert.equal(document.querySelector('.saved-article-row strong').textContent,'Saved article');
assert.match(document.querySelector('.saved-article-row').textContent,/1 条词汇/);
document.querySelector('.saved-article-row').click();
assert.equal(window.location.hash,'#study/article-1');
window.close();
console.log('PASS: data summary, seven-day charts, saved articles and navigation.');
