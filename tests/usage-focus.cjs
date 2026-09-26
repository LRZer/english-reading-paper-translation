const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),key='shici-notebook-v1';
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),script=fs.readFileSync(path.join(root,'app.js'),'utf8'),i18n=fs.readFileSync(path.join(root,'i18n.js'),'utf8');
const fixture={version:1,preferences:{language:'zh-CN',split:59,fontSize:19,notesFontSize:16},activity:{usageByDate:{}},articles:[],words:[]};
const dom=new JSDOM(html,{url:'http://localhost/#data',runScripts:'outside-only',pretendToBeVisual:true}),{window}=dom,document=window.document;
let now=2_000_000_000_000,visible='visible',focused=true;
window.Date.now=()=>now;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visible});document.hasFocus=()=>focused;window.scrollTo=()=>{};window.localStorage.setItem(key,JSON.stringify(fixture));window.eval(i18n);window.eval(script);
const recorded=()=>Object.values(JSON.parse(window.localStorage.getItem(key)).activity.usageByDate).reduce((sum,value)=>sum+value,0);

now+=5000;focused=false;window.dispatchEvent(new window.Event('blur'));assert.equal(recorded(),5000,'Focused time should be recorded when the window loses focus');
now+=60000;window.dispatchEvent(new window.Event('blur'));assert.equal(recorded(),5000,'Time in another window must not be recorded');
focused=true;window.dispatchEvent(new window.Event('focus'));now+=3000;visible='hidden';document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(recorded(),8000,'Visible focused time should stop when switching tabs');
now+=120000;focused=false;visible='visible';document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(recorded(),8000,'A visible but unfocused browser window must not restart the timer');
focused=true;window.dispatchEvent(new window.Event('focus'));now+=2000;focused=false;window.dispatchEvent(new window.Event('blur'));assert.equal(recorded(),10000,'Returning to the foreground should resume from the new focus time only');
dom.window.close();console.log('PASS: usage time records only while the tab is visible and the browser window is focused.');
