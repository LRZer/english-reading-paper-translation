(() => {
  'use strict';
  const KEY = 'shici-notebook-v1';
  const DEEPSEEK_STORAGE_KEY = 'shici-deepseek-api-key';
  const PAPER_DB_NAME = 'shici-paper-storage-v1';
  const PAPER_DB_STORE = 'papers';
  const LEGACY_PAPER_RECORD_KEY = 'last-opened';
  const I18N = window.SHICI_I18N;
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const FONT_MIN = 12, FONT_MAX = 48;
  const PADDING_MIN = 0, PADDING_MAX = 200;
  const LINE_HEIGHT_MIN = 1.2, LINE_HEIGHT_MAX = 3;
  const READING_BACKGROUNDS = [
    {id:'white',name:'纯白',color:'#ffffff'},
    {id:'paper',name:'暖纸',color:'#fbfaf4'},
    {id:'cream',name:'米黄',color:'#fff7df'},
    {id:'green',name:'浅绿',color:'#eef6e8'},
    {id:'sage',name:'豆沙绿',color:'#f1f3e8'},
    {id:'blue',name:'雾蓝',color:'#eef5f7'},
    {id:'peach',name:'淡杏',color:'#fff1e7'},
    {id:'gray',name:'柔灰',color:'#f2f3f1'}
  ];
  const fontSize = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Math.min(FONT_MAX,Math.max(FONT_MIN,Number(value)))*10)/10 : fallback;
  const paddingSize = (value, fallback) => Number.isFinite(Number(value)) ? Math.round(Math.min(PADDING_MAX,Math.max(PADDING_MIN,Number(value)))) : fallback;
  const lineHeightValue = (value, fallback) => Number.isFinite(Number(value)) ? Math.round(Math.min(LINE_HEIGHT_MAX,Math.max(LINE_HEIGHT_MIN,Number(value)))*20)/20 : fallback;
  const emptyData = () => ({version:1, folders:[], articles:[], words:[], activity:{usageByDate:{}}, preferences:{language:'zh-CN',split:59,fontSize:19,notesFontSize:16,dictionaryFontSize:13.5,readingLineHeight:1.95,readingBackground:'white',showTranslation:false,highlightWords:false,quickAddWords:true,readingPaddingTop:24,readingPaddingRight:40,readingPaddingBottom:48,readingPaddingLeft:40}});
  let deepseekApiKey='';
  try { deepseekApiKey=localStorage.getItem(DEEPSEEK_STORAGE_KEY)||''; } catch {}
  if(!deepseekApiKey){
    try {
      const sessionKey=sessionStorage.getItem(DEEPSEEK_STORAGE_KEY)||'';
      if(sessionKey){deepseekApiKey=sessionKey;localStorage.setItem(DEEPSEEK_STORAGE_KEY,sessionKey);sessionStorage.removeItem(DEEPSEEK_STORAGE_KEY);}
    } catch {}
  }
  let apiConnectionStatus='';
  let data = emptyData(), storageBlocked = false, route, activeWord = null, draft = null, editingArticle = null, selection = null, toastTimer, fontSaveTimer, pendingTranslation = null, paperSession = null, paperLibrary = [], paperLibraryLoaded = false, paperLibraryLoading = false, paperSaveChain = Promise.resolve(), folderDialogType = 'article';
  const paperTranslationTasks = new Map();
  const usageIsForeground=()=>document.visibilityState==='visible'&&document.hasFocus();
  let usageStartedAt = usageIsForeground() ? Date.now() : null;
  const app = $('#app');
  const articleEdits = new Map();
  const dictionaryCache = new Map();
  function validate(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.articles) || !Array.isArray(raw.words)) throw new Error('备份格式不正确');
    const articleIds = new Set(), wordIds = new Set(), folderIds = new Set();
    const string = (value, max) => typeof value === 'string' && value.length <= max;
    const folders=(Array.isArray(raw.folders)?raw.folders:[]).map(folder=>{
      if(!folder||!string(folder.id,200)||!folder.id||folderIds.has(folder.id)||!string(folder.name,60)||!folder.name.trim()||!['article','paper'].includes(folder.type))throw new Error('文件夹数据不完整或重复');
      folderIds.add(folder.id);return {id:folder.id,name:folder.name.trim(),type:folder.type,createdAt:string(folder.createdAt,100)?folder.createdAt:new Date().toISOString()};
    });
    const articles = raw.articles.map(a => {
      if (!a || !string(a.id,200) || !a.id || articleIds.has(a.id) || !string(a.title,200) || !a.title.trim() || !string(a.body,2000000) || !a.body.trim()) throw new Error('文章数据不完整或重复');
      articleIds.add(a.id);
      if(a.source!==undefined&&!string(a.source,500))throw new Error('文章来源过长');
      if(a.translationTitle!==undefined&&!string(a.translationTitle,300))throw new Error('文章中文标题过长');
      if(a.translation!==undefined&&!string(a.translation,2000000))throw new Error('文章译文过长');
      const folderId=folderIds.has(a.folderId)&&folders.find(folder=>folder.id===a.folderId)?.type==='article'?a.folderId:null;
      return {id:a.id,...(folderId?{folderId}:{}),title:a.title,source:a.source||'',body:a.body,translationTitle:a.translationTitle||'',translation:a.translation||'',createdAt:string(a.createdAt,100)?a.createdAt:new Date().toISOString(),updatedAt:string(a.updatedAt,100)?a.updatedAt:new Date().toISOString()};
    });
    const words = raw.words.map(w => {
      if (!w || !string(w.id,200) || !w.id || wordIds.has(w.id) || !string(w.term,200) || !w.term.trim() || !string(w.zh,100000) || !string(w.note,300000) || !string(w.context,100000) || (w.en!==undefined&&!string(w.en,100000)) || !(w.articleId === null || articleIds.has(w.articleId))) throw new Error('词汇数据不完整或引用了不存在的文章');
      wordIds.add(w.id);
      const note=w.en?.trim()?[w.note,`原英文释义\n${w.en}`].filter(Boolean).join('\n\n'):w.note;
      if(note.length>300000)throw new Error('词汇笔记过长');
      return {id:w.id,articleId:w.articleId,term:w.term,zh:w.zh,note,context:w.context,createdAt:string(w.createdAt,100)?w.createdAt:new Date().toISOString(),updatedAt:string(w.updatedAt,100)?w.updatedAt:new Date().toISOString()};
    });
    const usageByDate={};
    for(const [day,value] of Object.entries(raw.activity?.usageByDate||{})){
      if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Number(value))&&Number(value)>=0)usageByDate[day]=Math.min(Number(value),86400000);
    }
    const readingBackground=READING_BACKGROUNDS.some(option=>option.id===raw.preferences?.readingBackground)?raw.preferences.readingBackground:'white';
    return {version:1,folders,articles,words,activity:{usageByDate},preferences:{language:I18N.supported(raw.preferences?.language),split:Math.min(72,Math.max(35,Number(raw.preferences?.split)||59)),fontSize:fontSize(raw.preferences?.fontSize,19),notesFontSize:fontSize(raw.preferences?.notesFontSize,16),dictionaryFontSize:fontSize(raw.preferences?.dictionaryFontSize,13.5),readingLineHeight:lineHeightValue(raw.preferences?.readingLineHeight,1.95),readingBackground,showTranslation:raw.preferences?.showTranslation===true,highlightWords:raw.preferences?.highlightWords===true,quickAddWords:raw.preferences?.quickAddWords!==false,readingPaddingTop:paddingSize(raw.preferences?.readingPaddingTop,24),readingPaddingRight:paddingSize(raw.preferences?.readingPaddingRight,40),readingPaddingBottom:paddingSize(raw.preferences?.readingPaddingBottom,48),readingPaddingLeft:paddingSize(raw.preferences?.readingPaddingLeft,40)}};
  }
  try {
    const saved=localStorage.getItem(KEY);
    if(saved)data=validate(JSON.parse(saved));
  }
  catch { storageBlocked = true; }
  const locale=()=>I18N.supported(data.preferences.language);
  const t=key=>I18N.message(key,locale());
  const originalText=new WeakMap(),originalAttributes=new WeakMap();
  function localizeDOM(root=document){
    const lang=locale();document.documentElement.lang=lang;document.documentElement.dir=I18N.direction(lang);document.body.classList.toggle('rtl-ui',I18N.direction(lang)==='rtl');
    const skip='.article-text,.article-translation,.article-title-translation,.article-content>h2,.article-card h3,.article-preview,.article-source,.article-source-detail,.header-study,.word-term,.definition,.study-word-copy,.context,.saved-article-row strong,.longman-definition,.paper-translation-document';
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){
      if(node.parentElement?.closest(skip))continue;
      if(!originalText.has(node))originalText.set(node,node.nodeValue);
      const source=originalText.get(node),trimmed=source.trim();if(!trimmed)continue;
      node.nodeValue=source.replace(trimmed,I18N.translate(trimmed,lang));
    }
    const elements=root.querySelectorAll?.('[placeholder],[aria-label],[title]')||[];
    for(const element of elements){if(element.closest(skip))continue;let saved=originalAttributes.get(element);if(!saved){saved={};for(const attr of ['placeholder','aria-label','title'])if(element.hasAttribute(attr))saved[attr]=element.getAttribute(attr);originalAttributes.set(element,saved);}for(const [attr,value] of Object.entries(saved))element.setAttribute(attr,I18N.translate(value,lang));}
    document.title=I18N.translate(document.title,lang);
  }
  apiConnectionStatus=deepseekApiKey?t('apiKeyReady'):t('apiKeyEmpty');
  function storageWarning(message) {
    $('#save-status').textContent = '保存异常'; $('#save-status').classList.add('error');
    if (!$('.storage-warning')) { const warning = document.createElement('div'); warning.className='storage-warning'; warning.textContent=message; const b=document.createElement('button');b.textContent='导出当前内容';b.onclick=exportData;warning.append(' ',b);document.querySelector('header').after(warning); }
  }
  if (storageBlocked) storageWarning('无法读取已有数据。为避免覆盖，已暂停写入。请保留当前浏览器数据，导出当前内容后处理。');
  function persist() {
    if (storageBlocked) { toast('当前无法保存，请先导出备份'); return false; }
    try { localStorage.setItem(KEY,JSON.stringify(data)); $('#save-status').textContent='已保存到本机'; $('#save-status').classList.remove('error'); $('.storage-warning')?.remove(); return true; }
    catch { storageWarning('本机保存失败，可能是存储空间不足。请立即导出备份，避免关闭后丢失内容。');return false; }
  }
  function flushUsage() {
    if(usageStartedAt===null||storageBlocked)return;
    const now=Date.now(),elapsed=now-usageStartedAt;
    usageStartedAt=now;
    if(elapsed<1000)return;
    const key=dateKey(new Date(now));
    data.activity.usageByDate[key]=(data.activity.usageByDate[key]||0)+Math.min(elapsed,300000);
    persist();
    if(route?.name==='data'){
      const value=$('.data-summary article:first-child strong');
      if(value)value.textContent=formatDuration(currentUsage());
    }
  }
  function syncUsageTracking(){
    if(usageIsForeground()){if(usageStartedAt===null)usageStartedAt=Date.now();return;}
    if(usageStartedAt!==null){flushUsage();usageStartedAt=null;}
  }
  setInterval(flushUsage,30000);
  document.addEventListener('visibilitychange',syncUsageTracking);
  window.addEventListener('focus',syncUsageTracking);
  window.addEventListener('blur',syncUsageTracking);
  window.addEventListener('pageshow',syncUsageTracking);
  window.addEventListener('pagehide',()=>{if(usageStartedAt!==null){flushUsage();usageStartedAt=null;}});
  function toast(message) { clearTimeout(toastTimer);$('#toast').textContent=I18N.translate(message,locale());$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3500); }
  function openPaperDatabase(){
    if(!window.indexedDB)return Promise.resolve(null);
    return new Promise((resolve,reject)=>{
      const request=window.indexedDB.open(PAPER_DB_NAME,1);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(PAPER_DB_STORE))db.createObjectStore(PAPER_DB_STORE,{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('无法打开论文存储'));
      request.onblocked=()=>reject(new Error('论文存储正在被其他窗口占用'));
    });
  }
  async function paperStoreRequest(mode,operation){
    const db=await openPaperDatabase();if(!db)return null;
    try{return await new Promise((resolve,reject)=>{const transaction=db.transaction(PAPER_DB_STORE,mode),request=operation(transaction.objectStore(PAPER_DB_STORE));let result;request.onsuccess=()=>{result=request.result;};request.onerror=()=>reject(request.error||new Error('论文存储失败'));transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error||new Error('论文存储失败'));transaction.onabort=()=>reject(transaction.error||new Error('论文存储已取消'));});}
    finally{db.close();}
  }
  function savePaperSession(session=paperSession){
    if(!session?.file||!window.indexedDB)return Promise.resolve(false);
    const record={id:session.id||uid(),folderId:paperFolder(session.folderId)?.id||null,file:session.file,fileName:session.file.name||'paper.pdf',fileType:session.file.type||'application/pdf',fileLastModified:Number(session.file.lastModified)||Date.now(),title:session.title||session.file.name||'paper.pdf',paperDate:String(session.paperDate||'').trim().slice(0,40),body:session.body||'',translatedTitle:session.translatedTitle||'',translation:session.translation||'',translationLanguage:session.translationLanguage||'',stats:session.stats||null,createdAt:session.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};session.id=record.id;
    paperSaveChain=paperSaveChain.catch(()=>{}).then(()=>paperStoreRequest('readwrite',store=>store.put(record))).then(()=>{const index=paperLibrary.findIndex(item=>item.id===record.id);if(index>=0)paperLibrary[index]=record;else paperLibrary.push(record);paperLibrary.sort((left,right)=>right.updatedAt.localeCompare(left.updatedAt));paperLibraryLoaded=true;if(paperSession===session)session.savedAt=record.updatedAt;return true;}).catch(error=>{console.error('Paper autosave failed',error);if(paperSession===session)toast('论文自动保存失败，请检查浏览器存储空间');return false;});
    return paperSaveChain;
  }
  const paperIsTranslating=id=>paperTranslationTasks.has(id);
  const paperParagraphCount=text=>String(text||'').trim().split(/\n\s*\n/).filter(Boolean).length;
  const paperElapsed=startedAt=>{const seconds=Math.max(0,Math.floor((Date.now()-startedAt)/1000));return seconds<60?`${seconds} 秒`:`${Math.floor(seconds/60)} 分 ${String(seconds%60).padStart(2,'0')} 秒`;};
  function paperProgressState(task){
    const completed=Math.min(task.totalParagraphs||0,task.completedParagraphs||0),total=task.totalParagraphs||0,idleSeconds=Math.max(0,Math.floor((Date.now()-(task.lastActivity||task.startedAt))/1000));
    if(task.phase==='reasoning')return {label:'AI 正在理解论文',detail:'第 1 / 2 阶段 · 分析全文结构、上下文与专业术语',percent:null,activity:idleSeconds<5?'正在持续接收模型响应':idleSeconds<30?`最近 ${idleSeconds} 秒内收到过响应`:`已等待 ${idleSeconds} 秒的新响应，请保持本机服务开启`};
    if(task.phase==='translating')return {label:'AI 正在生成译文',detail:`第 2 / 2 阶段 · 已完成 ${completed} / ${total||'—'} 个段落`,percent:total?Math.min(96,18+completed/total*78):null,activity:idleSeconds<5?'正在持续接收译文':idleSeconds<30?`最近 ${idleSeconds} 秒内收到过译文`:`已等待 ${idleSeconds} 秒的新内容，请保持本机服务开启`};
    if(task.phase==='finalizing')return {label:'正在校验并保存译文',detail:`已接收 ${total||completed} 个段落，正在检查完整性`,percent:98,activity:'即将完成'};
    return {label:'正在连接 DeepSeek',detail:'正在建立安全连接并提交论文',percent:null,activity:idleSeconds<5?'请求已发出':`已等待 ${idleSeconds} 秒响应`};
  }
  function updatePaperProgressUI(id){
    const task=paperTranslationTasks.get(id);if(!task)return;
    const state=paperProgressState(task),label=$('#paper-progress-label'),detail=$('#paper-progress-detail'),elapsed=$('#paper-progress-elapsed'),activity=$('#paper-progress-activity'),track=$('#paper-progress-track'),bar=$('#paper-progress-bar');
    if(paperSession?.id===id&&label){label.textContent=state.label;detail.textContent=state.detail;elapsed.textContent=`已用时 ${paperElapsed(task.startedAt)}`;activity.textContent=state.activity;bar.classList.toggle('indeterminate',state.percent===null);bar.style.width=state.percent===null?'34%':`${state.percent}%`;if(state.percent===null)track.removeAttribute('aria-valuenow');else track.setAttribute('aria-valuenow',String(Math.round(state.percent)));track.setAttribute('aria-valuetext',`${state.label}；${state.detail}`);}
    document.querySelectorAll('[data-paper-task-status]').forEach(node=>{if(node.dataset.paperTaskStatus===id)node.innerHTML=`<i class="paper-mini-spinner" aria-hidden="true"></i>${task.phase==='translating'&&task.totalParagraphs?`${task.completedParagraphs||0}/${task.totalParagraphs} 段`:'翻译中'}`;});
  }
  function refreshPaperTaskView(id){
    if(paperSession?.id===id){updatePaperTranslationPane();return;}
    if(route?.name==='papers'&&!String(route.id||'').startsWith('open/'))renderPapers();
  }
  const paperFolder=id=>data.folders.find(folder=>folder.type==='paper'&&folder.id===id);
  function paperFromRecord(record){
    if(!record?.file)return null;
    const file=new File([record.file],record.fileName||'paper.pdf',{type:record.fileType||record.file.type||'application/pdf',lastModified:Number(record.fileLastModified)||Date.now()});
    return {id:record.id,folderId:paperFolder(record.folderId)?.id||null,file,url:URL.createObjectURL(file),title:record.title||file.name,paperDate:String(record.paperDate||'').slice(0,40),body:record.body||'',translatedTitle:record.translatedTitle||'',translation:record.translation||'',translationLanguage:record.translationLanguage||'',stats:record.stats||null,status:paperIsTranslating(record.id)?'translating':record.body?'ready':'extracting',error:'',createdAt:record.createdAt||record.updatedAt||new Date().toISOString(),savedAt:record.updatedAt||''};
  }
  async function loadPaperLibrary(){
    if(paperLibraryLoading||paperLibraryLoaded)return;
    if(!window.indexedDB){paperLibraryLoaded=true;return;}
    paperLibraryLoading=true;
    try{
      let records=await paperStoreRequest('readonly',store=>store.getAll())||[];
      const legacy=records.find(record=>record.id===LEGACY_PAPER_RECORD_KEY);
      if(legacy){const migrated={...legacy,id:uid(),folderId:null};await paperStoreRequest('readwrite',store=>store.put(migrated));await paperStoreRequest('readwrite',store=>store.delete(LEGACY_PAPER_RECORD_KEY));records=records.filter(record=>record!==legacy);records.push(migrated);}
      paperLibrary=records.filter(record=>record?.file).map(record=>({...record,folderId:paperFolder(record.folderId)?.id||null})).sort((left,right)=>String(right.updatedAt||'').localeCompare(String(left.updatedAt||'')));paperLibraryLoaded=true;
    }catch(error){console.error('Paper library load failed',error);paperLibraryLoaded=true;}
    finally{paperLibraryLoading=false;if(route?.name==='papers')renderPapers();}
  }
  async function openSavedPaper(id){
    let record=paperLibrary.find(item=>item.id===id);
    if(!record&&window.indexedDB)record=await paperStoreRequest('readonly',store=>store.get(id));
    if(!record?.file){toast('没有找到这篇论文');location.hash='papers';return;}
    await closePaperSession();paperSession=paperFromRecord(record);if(!paperSession){location.hash='papers';return;}
    if(location.hash!==`#papers/open/${id}`)location.hash=`papers/open/${id}`;else{renderPapers();localizeDOM(app);}
    if(!paperSession.body)extractPaperSession(paperSession);
  }
  async function closePaperSession(){
    const current=paperSession;if(!current)return;if(current.url)URL.revokeObjectURL(current.url);if(paperSession===current)paperSession=null;
  }
  async function deleteSavedPaper(id){
    if(paperSession?.id===id)await closePaperSession();await paperStoreRequest('readwrite',store=>store.delete(id));paperLibrary=paperLibrary.filter(record=>record.id!==id);if(route?.name==='papers')renderPapers();toast('论文已删除');
  }
  const countWords = text => (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;
  const date = value => { const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleDateString(locale(),{month:'2-digit',day:'2-digit'}); };
  const dateKey = value => {const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const formatDuration = milliseconds => {const minutes=Math.floor(milliseconds/60000);if(minutes<1)return '< 1 分钟';const hours=Math.floor(minutes/60),rest=minutes%60;return hours?`${hours} 小时${rest?` ${rest} 分钟`:''}`:`${minutes} 分钟`;};
  const IRREGULAR_WORD_FAMILIES = [
    ['be','am','is','are','was','were','been','being'],['have','has','had','having'],['do','does','did','done','doing'],
    ['go','goes','went','gone','going'],['come','comes','came','coming'],['become','becomes','became','becoming'],
    ['get','gets','got','gotten','getting'],['make','makes','made','making'],['take','takes','took','taken','taking'],
    ['see','sees','saw','seen','seeing'],['know','knows','knew','known','knowing'],['think','thinks','thought','thinking'],
    ['find','finds','found','finding'],['give','gives','gave','given','giving'],['write','writes','wrote','written','writing'],
    ['read','reads','reading'],['speak','speaks','spoke','spoken','speaking'],['run','runs','ran','running'],
    ['begin','begins','began','begun','beginning'],['grow','grows','grew','grown','growing'],['leave','leaves','left','leaving'],
    ['keep','keeps','kept','keeping'],['send','sends','sent','sending'],['build','builds','built','building'],
    ['buy','buys','bought','buying'],['bring','brings','brought','bringing'],['teach','teaches','taught','teaching'],
    ['catch','catches','caught','catching'],['choose','chooses','chose','chosen','choosing'],['break','breaks','broke','broken','breaking'],
    ['understand','understands','understood','understanding'],['say','says','said','saying'],['tell','tells','told','telling'],
    ['pay','pays','paid','paying'],['feel','feels','felt','feeling'],['hold','holds','held','holding'],['meet','meets','met','meeting'],
    ['lead','leads','led','leading'],['lose','loses','lost','losing'],['win','wins','won','winning'],['fall','falls','fell','fallen','falling'],
    ['fly','flies','flew','flown','flying'],['forget','forgets','forgot','forgotten','forgetting'],['show','shows','showed','shown','showing'],
    ['drive','drives','drove','driven','driving'],['mean','means','meant','meaning'],['hear','hears','heard','hearing'],
    ['stand','stands','stood','standing'],['sit','sits','sat','sitting'],['eat','eats','ate','eaten','eating'],
    ['drink','drinks','drank','drunk','drinking'],['swim','swims','swam','swum','swimming'],['sleep','sleeps','slept','sleeping'],
    ['wear','wears','wore','worn','wearing'],['rise','rises','rose','risen','rising'],['sing','sings','sang','sung','singing'],
    ['learn','learns','learned','learnt','learning'],['man','men'],['woman','women'],['child','children'],['person','people'],
    ['mouse','mice'],['foot','feet'],['tooth','teeth'],['goose','geese'],['news'],['series'],['species']
  ];
  const irregularWords = new Map(IRREGULAR_WORD_FAMILIES.flatMap(family=>family.map(word=>[word,family])));
  function regularWordForms(base){
    const forms=new Set([base]);if(!/^[a-z]{2,}$/.test(base))return forms;
    if(/[^aeiou]y$/.test(base))forms.add(`${base.slice(0,-1)}ies`);else if(/(?:s|x|z|ch|sh|o)$/.test(base))forms.add(`${base}es`);else forms.add(`${base}s`);
    if(/fe$/.test(base))forms.add(`${base.slice(0,-2)}ves`);else if(/f$/.test(base))forms.add(`${base.slice(0,-1)}ves`);
    if(/[^aeiou]y$/.test(base))forms.add(`${base.slice(0,-1)}ied`);else if(/e$/.test(base))forms.add(`${base}d`);else forms.add(`${base}ed`);
    if(/ie$/.test(base))forms.add(`${base.slice(0,-2)}ying`);else if(/e$/.test(base)&&!/ee$/.test(base))forms.add(`${base.slice(0,-1)}ing`);else forms.add(`${base}ing`);
    if(/[^aeiou][aeiou][^aeiouwxy]$/.test(base)){forms.add(`${base}${base.at(-1)}ed`);forms.add(`${base}${base.at(-1)}ing`);}
    if(/[^aeiou]y$/.test(base))forms.add(`${base.slice(0,-1)}ily`);
    else if(/ic$/.test(base))forms.add(`${base}ally`);
    else if(/[^aeiou]le$/.test(base))forms.add(`${base.slice(0,-1)}y`);
    else if(/ll$/.test(base))forms.add(`${base}y`);
    else forms.add(`${base}ly`);
    if(base==='true')forms.add('truly');
    if(base==='due')forms.add('duly');
    if(base==='whole')forms.add('wholly');
    return forms;
  }
  function possibleWordBases(word){
    const bases=new Set([word]);
    if(word.length>4&&/ies$/.test(word))bases.add(`${word.slice(0,-3)}y`);
    if(word.length>4&&/ied$/.test(word))bases.add(`${word.slice(0,-3)}y`);
    if(word.length>4&&/ves$/.test(word)){bases.add(`${word.slice(0,-3)}f`);bases.add(`${word.slice(0,-3)}fe`);}
    if(word.length>3&&/s$/.test(word)&&!/ss$/.test(word))bases.add(word.slice(0,-1));
    if(word.length>4&&/es$/.test(word)){bases.add(word.slice(0,-2));bases.add(word.slice(0,-1));}
    if(word.length>4&&/ed$/.test(word)){const stem=word.slice(0,-2);bases.add(stem);bases.add(`${stem}e`);if(stem.at(-1)===stem.at(-2))bases.add(stem.slice(0,-1));}
    if(word.length>5&&/ing$/.test(word)){const stem=word.slice(0,-3);bases.add(stem);bases.add(`${stem}e`);if(stem.at(-1)===stem.at(-2))bases.add(stem.slice(0,-1));}
    if(word.length>4&&/ily$/.test(word))bases.add(`${word.slice(0,-3)}y`);
    if(word.length>6&&/ically$/.test(word))bases.add(word.slice(0,-4));
    if(word.length>4&&/ly$/.test(word))bases.add(word.slice(0,-2));
    if(word==='truly')bases.add('true');
    if(word==='duly')bases.add('due');
    if(word==='wholly')bases.add('whole');
    return [...bases].filter(base=>base===word||base.length>=3);
  }
  function singleWordForms(word){
    const normalized=word.toLowerCase(),irregular=irregularWords.get(normalized);if(irregular)return new Set(irregular);
    const forms=new Set();for(const base of possibleWordBases(normalized)){const family=irregularWords.get(base);for(const form of family||regularWordForms(base))forms.add(form);}return forms;
  }
  function englishTermForms(term){
    const normalized=term.trim().toLowerCase();if(!normalized)return new Set();
    const parts=normalized.split(/\s+/);if(parts.some(part=>!/^[a-z]+$/.test(part)))return new Set([normalized]);
    if(parts.length===1)return singleWordForms(parts[0]);
    const forms=new Set([normalized]);for(const first of singleWordForms(parts[0]))forms.add([first,...parts.slice(1)].join(' '));for(const last of singleWordForms(parts.at(-1)))forms.add([...parts.slice(0,-1),last].join(' '));return forms;
  }
  function sameEnglishFamily(left,right){
    const rightForms=englishTermForms(right);for(const form of englishTermForms(left))if(rightForms.has(form))return true;return false;
  }
  const articleWords = id => data.words.filter(w=>w.articleId===id);
  function firstTermPosition(text,term){
    const forms=[...englishTermForms(term)].sort((left,right)=>right.length-left.length);if(!forms.length)return Number.MAX_SAFE_INTEGER;
    const pattern=forms.map(form=>form.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),regex=new RegExp(pattern,'gi');
    for(const match of text.matchAll(regex)){const value=match[0],index=match.index;if((/[A-Za-z0-9]/.test(value[0])&&/[A-Za-z0-9]/.test(text[index-1]||''))||(/[A-Za-z0-9]/.test(value.at(-1))&&/[A-Za-z0-9]/.test(text[index+value.length]||'')))continue;return index;}
    return Number.MAX_SAFE_INTEGER;
  }
  function articleWordsInReadingOrder(id){
    const article=data.articles.find(item=>item.id===id),body=article?.body||'';
    return articleWords(id).sort((left,right)=>firstTermPosition(body,left.term)-firstTermPosition(body,right.term)||left.createdAt.localeCompare(right.createdAt));
  }
  const currentArticle = () => data.articles.find(a=>a.id===route?.id);
  const sortedArticles = () => [...data.articles].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const foldersFor=type=>data.folders.filter(folder=>folder.type===type).sort((left,right)=>left.createdAt.localeCompare(right.createdAt));
  const folderFor=(type,id)=>foldersFor(type).find(folder=>folder.id===id);
  function folderOptions(type,selected){return `<option value="">未分类</option>${foldersFor(type).map(folder=>`<option value="${escapeHTML(folder.id)}"${folder.id===selected?' selected':''}>${escapeHTML(folder.name)}</option>`).join('')}`;}
  function folderSidebar(type,activeId,total,counts){
    const base=type==='article'?'articles':'papers',label=type==='article'?'文章文件夹':'论文文件夹';
    return `<aside class="folder-sidebar"><div class="folder-sidebar-heading"><strong>${label}</strong><button class="folder-add" type="button" data-new-folder="${type}" aria-label="新建文件夹">＋</button></div><a href="#${base}" class="folder-link${activeId?'':' active'}"><span>全部</span><small>${total}</small></a>${foldersFor(type).map(folder=>`<div class="folder-row"><a href="#${base}/${escapeHTML(folder.id)}" class="folder-link${activeId===folder.id?' active':''}"><span>${escapeHTML(folder.name)}</span><small>${counts.get(folder.id)||0}</small></a><button class="folder-delete" type="button" data-delete-folder="${escapeHTML(folder.id)}" aria-label="删除文件夹 ${escapeHTML(folder.name)}">×</button></div>`).join('')}</aside>`;
  }
  const empty = (title,description,action='') => `<div class="empty"><span class="empty-symbol">Aa</span><h3>${title}</h3><p>${description}</p>${action}</div>`;
  function articleCards(articles) {
    return `<div class="articles-grid">${articles.map(a=>`<article class="article-card"><button class="card-open" data-open-article="${escapeHTML(a.id)}"><div class="article-meta"><span>READING</span><span>${countWords(a.body)} 词</span></div><h3>${escapeHTML(a.title)}</h3>${a.source.trim()?`<div class="article-source">${escapeHTML(a.source)}</div>`:''}<div class="article-preview">${escapeHTML(a.body)}</div></button><div class="card-folder"><select data-move-article="${escapeHTML(a.id)}" aria-label="移动文章到文件夹">${folderOptions('article',a.folderId)}</select></div><div class="card-footer"><span>${articleWords(a.id).length} 个词汇 · ${date(a.updatedAt)}</span><div class="card-actions"><button class="small-action" data-edit-article="${escapeHTML(a.id)}">编辑</button><button class="small-action" data-delete-article="${escapeHTML(a.id)}" aria-label="删除文章 ${escapeHTML(a.title)}">删除</button></div></div></article>`).join('')}</div>`;
  }
  function render() {
    removeSelection(); activeWord=null; draft=null;
    const parts=location.hash.slice(1).split('/'); route={name:parts[0]||'home',id:parts.slice(1).join('/')};
    if (!['home','articles','papers','vocabulary','data','study'].includes(route.name)) route.name='home';
    document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(route.name==='study'?'articles':route.name)));
    document.documentElement.style.setProperty('--left-width',`${data.preferences.split}%`);
    document.documentElement.style.setProperty('--reading-size',`${data.preferences.fontSize}px`);
    document.documentElement.style.setProperty('--notes-size',`${data.preferences.notesFontSize}px`);
    document.documentElement.style.setProperty('--dictionary-size',`${data.preferences.dictionaryFontSize}px`);
    document.documentElement.style.setProperty('--reading-line-height',String(data.preferences.readingLineHeight));
    document.documentElement.style.setProperty('--reading-background',READING_BACKGROUNDS.find(option=>option.id===data.preferences.readingBackground).color);
    for(const side of ['Top','Right','Bottom','Left'])document.documentElement.style.setProperty(`--article-padding-${side.toLowerCase()}`,`${data.preferences[`readingPadding${side}`]}px`);
    renderHeader();
    if(route.name==='study' && currentArticle()) renderStudy();
    else if(route.name==='articles') renderArticles();
    else if(route.name==='papers') renderPapers();
    else if(route.name==='vocabulary') renderVocabulary();
    else if(route.name==='data') renderData();
    else renderHome();
    localizeDOM();
    window.scrollTo(0,0);
  }
  function renderHome() {
    document.title='英文阅读与论文翻译';
    app.innerHTML=`<div class="page"><div class="entry-grid"><a class="entry main-entry" href="#articles"><h2>开始阅读</h2><p>添加英文原文，在上下文里记录新词。</p><span class="entry-link">进入文章库 <span>↗</span></span></a><a class="entry" href="#vocabulary"><h2>我的词汇库</h2><p>${data.words.length ? `已积累 ${data.words.length} 个词汇。`:'查看记录的释义和笔记。'}</p><span class="entry-link">查看全部词汇 <span>↗</span></span></a></div><div class="section-heading"><h2>最近的文章 <span class="count-badge">${data.articles.length}</span></h2><button class="text-button" data-new-article>＋ 添加文章</button></div>${data.articles.length?articleCards(sortedArticles().slice(0,3)):empty('还没有文章','粘贴一篇英文文章，就可以边读边记词汇。','<button class="button primary" data-new-article>＋ 添加文章</button>')}</div>`;
  }
  function renderArticles() {
    document.title='文章库 · 英文阅读与论文翻译';
    const active=folderFor('article',route.id)?.id||'',counts=new Map();data.articles.forEach(article=>{if(article.folderId)counts.set(article.folderId,(counts.get(article.folderId)||0)+1);});
    const scoped=sortedArticles().filter(article=>!active||article.folderId===active);
    app.innerHTML=`<div class="page library-page"><div class="library-heading"><div><span class="eyebrow">READING LIBRARY</span><h1>文章库</h1></div><button class="button primary" data-new-article>＋ 添加文章</button></div><div class="library-layout">${folderSidebar('article',active,data.articles.length,counts)}<section class="library-content"><div class="library-toolbar">${data.articles.length?'<input class="search" id="article-search" type="search" placeholder="搜索标题、来源或内容" aria-label="搜索文章">':''}<span class="library-scope"><b>${escapeHTML(active?folderFor('article',active).name:'全部文章')}</b> · ${scoped.length}</span></div><div id="article-list">${scoped.length?articleCards(scoped):empty(active?'这个文件夹还没有文章':'还没有添加文章',active?'可以把文章移动到这里。':'点击“添加文章”，粘贴你想阅读的英文原文。')}</div></section></div></div>`;
    $('#article-search')?.addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();const list=scoped.filter(a=>(a.title+' '+a.source+' '+a.body).toLowerCase().includes(q));$('#article-list').innerHTML=list.length?articleCards(list):empty('没有找到相关的文章','试试其他关键词。');localizeDOM($('#article-list'));});
  }
  function renderPapers(){
    document.title='论文库 · 英文阅读与论文翻译';
    const openId=route.id.startsWith('open/')?route.id.slice(5):'';
    if(openId){
      if(paperSession?.id!==openId){app.innerHTML='<div class="paper-library-loading"><i class="paper-spinner" aria-hidden="true"></i><span>正在打开论文…</span></div>';if(paperLibraryLoaded)openSavedPaper(openId);else loadPaperLibrary();return;}
      renderHeader();
      app.innerHTML=`<div class="paper-workspace"><section class="paper-pdf-pane"><iframe class="paper-native-viewer" id="paper-pdf-viewer" src="${escapeHTML(paperSession.url)}" title="原版 PDF"></iframe></section><aside class="paper-translation-pane" id="paper-translation-pane"></aside></div>`;
      updatePaperTranslationPane();
      return;
    }
    if(!paperLibraryLoaded)loadPaperLibrary();
    const active=folderFor('paper',route.id)?.id||'',counts=new Map();paperLibrary.forEach(paper=>{if(paper.folderId)counts.set(paper.folderId,(counts.get(paper.folderId)||0)+1);});
    const scoped=paperLibrary.filter(paper=>!active||paper.folderId===active);
    const paperCard=paper=>{const task=paperTranslationTasks.get(paper.id);return `<article class="paper-card"><button class="paper-card-open" type="button" data-open-paper="${escapeHTML(paper.id)}"><div class="paper-card-meta"><span>PDF</span><span class="paper-card-status${task?' translating':''}"${task?` data-paper-task-status="${escapeHTML(paper.id)}"`:''}>${task?`<i class="paper-mini-spinner" aria-hidden="true"></i>${task.phase==='translating'&&task.totalParagraphs?`${task.completedParagraphs||0}/${task.totalParagraphs} 段`:'翻译中'}`:paper.translation?'已翻译':'待翻译'}</span></div><h3>${escapeHTML(paper.translatedTitle||paper.title||paper.fileName)}</h3>${paper.paperDate?`<span class="paper-date-tag">${escapeHTML(paper.paperDate)}</span>`:''}${paper.translatedTitle?`<p>${escapeHTML(paper.title||paper.fileName)}</p>`:''}<div class="paper-card-stats"><span>${Number(paper.stats?.pages)||'—'} 页</span><span>${Number(paper.stats?.words)||0} 词</span></div></button><div class="card-folder"><select data-move-paper="${escapeHTML(paper.id)}" aria-label="移动论文到文件夹">${folderOptions('paper',paper.folderId)}</select></div><div class="card-footer"><span>${date(paper.updatedAt)}</span><button class="small-action" data-delete-paper="${escapeHTML(paper.id)}">删除</button></div></article>`;};
    const cards=scoped.length?`<div class="papers-grid">${scoped.map(paperCard).join('')}</div>`:empty(active?'这个文件夹还没有论文':'论文库为空',active?'可以把论文移动到这里。':'拖入第一篇 PDF，原文和译文会自动保存。');
    app.innerHTML=`<div class="page library-page paper-library-page"><div class="library-heading"><div><span class="eyebrow">PAPER LIBRARY</span><h1>论文库</h1></div><button class="button primary" type="button" id="paper-file-button">＋ 添加论文</button><input id="paper-file" type="file" accept=".pdf,application/pdf" hidden></div><div class="library-layout">${folderSidebar('paper',active,paperLibrary.length,counts)}<section class="library-content"><section class="paper-import compact" id="paper-drop-zone"><div class="paper-import-copy"><strong>拖入 PDF</strong><span>导入后自动保存，并生成可翻译的论文条目</span></div><small>最大 50 MB</small></section><div class="library-toolbar">${paperLibrary.length?'<input class="search" id="paper-search" type="search" placeholder="搜索论文标题" aria-label="搜索论文">':''}<span class="library-scope"><b>${escapeHTML(active?folderFor('paper',active).name:'全部论文')}</b> · ${scoped.length}</span></div><div id="paper-list">${paperLibraryLoaded?cards:'<div class="paper-library-loading"><i class="paper-spinner" aria-hidden="true"></i><span>正在载入论文库…</span></div>'}</div></section></div></div>`;
    const drop=$('#paper-drop-zone');bindPaperInput($('#paper-file-button'));
    for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragging');});
    for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragging');});
    drop.addEventListener('drop',e=>openPaper([...e.dataTransfer.files].find(file=>/\.pdf$/i.test(file.name)||file.type==='application/pdf')));
    $('#paper-search')?.addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase(),list=scoped.filter(paper=>(paper.title+' '+paper.translatedTitle+' '+paper.fileName+' '+(paper.paperDate||'')).toLowerCase().includes(q));$('#paper-list').innerHTML=list.length?`<div class="papers-grid">${list.map(paperCard).join('')}</div>`:empty('没有找到相关论文','试试其他标题或时间。');localizeDOM($('#paper-list'));});
  }
  function bindPaperInput(button){
    const input=$('#paper-file');button.addEventListener('click',()=>input.click());input.addEventListener('change',()=>{openPaper(input.files[0]);input.value='';});
  }
  async function openPaper(file){
    if(!file)return;
    if(file.size>50*1024*1024){toast('PDF 超过 50 MB，请压缩或拆分后重试');return;}
    if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){toast('请选择 PDF 文件');return;}
    await closePaperSession();const selectedFolder=folderFor('paper',route.id)?.id||null;
    paperSession={id:uid(),folderId:selectedFolder,file,url:URL.createObjectURL(file),title:file.name,paperDate:'',body:'',translatedTitle:'',translation:'',translationLanguage:'',status:'extracting',error:'',createdAt:new Date().toISOString()};
    location.hash=`papers/open/${paperSession.id}`;renderPapers();localizeDOM(app);
    savePaperSession(paperSession);
    extractPaperSession(paperSession);
  }
  async function extractPaperSession(target){
    const file=target.file;
    try{
      const response=await fetch('/api/paper/extract',{method:'POST',headers:{'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(file.name)},body:file});
      let result;try{result=await response.json();}catch{result=null;}
      if(!response.ok)throw new Error(result?.error||'论文解析失败，请稍后再试。');
      Object.assign(target,{title:result.title,body:result.body,stats:result.stats,status:'ready'});
      if(paperSession?.id===target.id&&paperSession!==target)Object.assign(paperSession,{title:result.title,body:result.body,stats:result.stats,status:'ready'});
      if(paperSession?.id===target.id){const heading=$('.paper-header-title');if(heading){heading.textContent=result.title;heading.title=file.name;}}
      await savePaperSession(target);
      refreshPaperTaskView(target.id);
      if(deepseekApiKey)translatePaper(target);
    }catch(error){target.status='error';target.error=error.message;if(paperSession?.id===target.id&&paperSession!==target)Object.assign(paperSession,{status:'error',error:error.message});savePaperSession(target);refreshPaperTaskView(target.id);}
  }
  function paperTranslationBody(){
    if(!paperSession)return '';
    if(paperSession.status==='extracting')return `<div class="paper-side-state"><i class="paper-spinner" aria-hidden="true"></i><strong>正在准备译文</strong><p>正在读取 PDF 文字层，原版页面可正常浏览。</p></div>`;
    if(paperIsTranslating(paperSession.id)){const task=paperTranslationTasks.get(paperSession.id),state=paperProgressState(task);return `<div class="paper-side-state paper-progress-state"><div class="paper-progress-heading"><strong id="paper-progress-label">${escapeHTML(state.label)}</strong><span id="paper-progress-elapsed">已用时 ${paperElapsed(task.startedAt)}</span></div><div class="paper-progress-track" id="paper-progress-track" role="progressbar" aria-label="论文翻译进度" aria-valuemin="0" aria-valuemax="100"${state.percent===null?'':` aria-valuenow="${Math.round(state.percent)}"`} aria-valuetext="${escapeHTML(`${state.label}；${state.detail}`)}"><i id="paper-progress-bar" class="${state.percent===null?'indeterminate':''}" style="width:${state.percent===null?34:state.percent}%"></i></div><p id="paper-progress-detail">${escapeHTML(state.detail)}</p><small id="paper-progress-activity">${escapeHTML(state.activity)}</small><p class="paper-progress-note">可以返回论文库或打开其他论文，本篇完成后仍会自动保存。</p></div>`;}
    if(paperSession.status==='error')return `<div class="paper-side-state"><strong>暂时无法生成译文</strong><p>${escapeHTML(paperSession.error)}</p>${paperSession.body?'<button class="button" id="paper-translate-button" type="button">重试</button>':''}</div>`;
    if(paperSession.translation){
      const paragraphs=paperSession.translation.split(/\n\s*\n/).filter(Boolean).map(paragraph=>`<p>${escapeHTML(paragraph)}</p>`).join('');
      return `<div class="paper-translation-document"><h2>${escapeHTML(paperSession.translatedTitle||'译文')}</h2>${paragraphs}</div>`;
    }
    return `<div class="paper-side-state"><strong>${deepseekApiKey?'正文已准备好':'需要设置 DeepSeek API Key'}</strong><p>${deepseekApiKey?'点击开始翻译，在右侧查看完整译文。':'API Key 长期保存在当前浏览器中。'}</p><button class="button primary" id="paper-translate-button" type="button">${deepseekApiKey?'开始翻译':'前往设置'}</button></div>`;
  }
  function updatePaperTranslationPane(){
    const pane=$('#paper-translation-pane');if(!pane||!paperSession)return;
    const canRetranslate=paperSession.translation&&!paperIsTranslating(paperSession.id);
    pane.innerHTML=`<div class="paper-translation-bar"><div><span class="eyebrow">TRANSLATION</span><strong>完整译文</strong></div>${canRetranslate?'<button class="text-button" id="paper-translate-button" type="button">重新翻译</button>':''}</div><div class="paper-translation-scroll">${paperTranslationBody()}</div>`;
    $('#paper-translate-button',pane)?.addEventListener('click',()=>translatePaper());localizeDOM(pane);
  }
  function translatePaper(target=paperSession){
    if(!target?.body)return Promise.resolve();
    const running=paperTranslationTasks.get(target.id);if(running)return running.promise;
    if(!deepseekApiKey){apiConnectionStatus=t('apiKeyRequired');const settings=$('#settings-dialog');if(!settings.open)settings.showModal();$('#deepseek-status').textContent=apiConnectionStatus;$('#deepseek-status').className='api-status error';$('#deepseek-api-key').focus();toast(t('apiKeyRequired'));return;}
    const language=locale(),task={id:target.id,title:target.title||target.file?.name||'论文',startedAt:Date.now(),lastActivity:Date.now(),phase:'connecting',completedParagraphs:0,totalParagraphs:paperParagraphCount(target.body),receivedChars:0,promise:null,timer:null};
    target.status='translating';target.error='';paperTranslationTasks.set(target.id,task);refreshPaperTaskView(target.id);
    task.timer=setInterval(()=>updatePaperProgressUI(target.id),1000);
    task.promise=(async()=>{
      try{
        const result=await apiPostStream('/api/deepseek/translate-stream',{apiKey:deepseekApiKey,title:target.title,text:target.body,language,mode:'paper'},event=>{task.phase=event.phase||task.phase;task.lastActivity=Date.now();if(Number(event.totalParagraphs)>0)task.totalParagraphs=Number(event.totalParagraphs);if(Number.isFinite(Number(event.completedParagraphs)))task.completedParagraphs=Number(event.completedParagraphs);if(Number.isFinite(Number(event.receivedChars)))task.receivedChars=Number(event.receivedChars);updatePaperProgressUI(target.id);});
        const completed={translatedTitle:result.titleTranslation,translation:result.translation,status:'ready',error:'',translationLanguage:language};
        Object.assign(target,completed);if(paperSession?.id===target.id&&paperSession!==target)Object.assign(paperSession,completed);
        await savePaperSession(target);toast(`《${target.title||target.file?.name||'论文'}》翻译完成并已自动保存`);
      }catch(error){
        target.status='error';target.error=error.message;if(paperSession?.id===target.id&&paperSession!==target)Object.assign(paperSession,{status:'error',error:error.message});toast(`《${target.title||target.file?.name||'论文'}》翻译失败：${error.message}`);
      }finally{clearInterval(task.timer);if(paperTranslationTasks.get(target.id)===task)paperTranslationTasks.delete(target.id);refreshPaperTaskView(target.id);}
    })();
    return task.promise;
  }
  function wordRows(words) {
    return `<div class="word-table"><div class="word-row table-heading"><span>单词 / 短语</span><span>中文释义</span><span class="source-column">来源文章</span><span></span></div>${words.map(w=>`<button class="word-row" data-open-word="${escapeHTML(w.id)}"><span class="word-term">${escapeHTML(w.term)}<small>${date(w.updatedAt)} 记录</small></span><span class="definition">${escapeHTML(w.zh)||'尚未填写'}</span><span class="definition source-column">${escapeHTML(data.articles.find(a=>a.id===w.articleId)?.title||'独立词汇')}</span><span class="muted">↗</span></button>`).join('')}</div>`;
  }
  function renderVocabulary() {
    document.title='词汇库 · 英文阅读与论文翻译';
    app.innerHTML=`<div class="page"><div class="library-toolbar">${data.words.length?'<input class="search" id="word-search" type="search" placeholder="搜索单词、释义或笔记" aria-label="搜索词汇">':''}<button class="button primary" data-new-word>＋ 添加词汇</button></div><div id="vocabulary-list">${data.words.length?wordRows([...data.words].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))):empty('词汇库为空','阅读时选中单词或短语，或直接添加词汇。','<a href="#articles" class="button">去阅读文章 ↗</a>')}</div></div>`;
    $('#word-search')?.addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();const list=data.words.filter(w=>[w.term,w.zh,w.note].join(' ').toLowerCase().includes(q));$('#vocabulary-list').innerHTML=list.length?wordRows(list):empty('没有找到相关的词汇','试试单词、释义或笔记中的其他关键词。');localizeDOM($('#vocabulary-list'));});
  }
  function currentUsage() {
    const stored=Object.values(data.activity.usageByDate).reduce((sum,value)=>sum+value,0);
    return stored+(usageStartedAt!==null?Math.max(0,Date.now()-usageStartedAt):0);
  }
  function renderData() {
    document.title='数据 · 英文阅读与论文翻译';
    const days=Array.from({length:7},(_,index)=>{const day=new Date();day.setHours(12,0,0,0);day.setDate(day.getDate()-(6-index));const key=dateKey(day);return {key,label:index===6?'今天':`${day.getMonth()+1}/${day.getDate()}`,usage:(data.activity.usageByDate[key]||0)+(index===6&&usageStartedAt!==null?Date.now()-usageStartedAt:0),articles:data.articles.filter(a=>dateKey(a.createdAt)===key).length,words:data.words.filter(w=>dateKey(w.createdAt)===key).length};});
    const maxUsage=Math.max(1,...days.map(day=>day.usage));
    const maxAdded=Math.max(1,...days.flatMap(day=>[day.articles,day.words]));
    const usageBars=days.map(day=>`<div class="chart-column"><div class="chart-value">${Math.round(day.usage/60000)||''}</div><div class="chart-bar usage-bar" style="height:${day.usage?Math.max(5,day.usage/maxUsage*100):0}%"></div><span>${day.label}</span></div>`).join('');
    const additionBars=days.map(day=>`<div class="chart-column"><div class="grouped-bars"><i class="chart-bar article-bar" style="height:${day.articles?Math.max(7,day.articles/maxAdded*100):0}%" title="${day.articles} 篇文章"></i><i class="chart-bar word-bar" style="height:${day.words?Math.max(7,day.words/maxAdded*100):0}%" title="${day.words} 条词汇"></i></div><span>${day.label}</span></div>`).join('');
    const savedArticles=sortedArticles().map(a=>`<button class="saved-article-row" data-open-article="${escapeHTML(a.id)}"><span><strong>${escapeHTML(a.title)}</strong><small>${date(a.updatedAt)} 更新</small></span><span>${countWords(a.body)} 词</span><span>${articleWords(a.id).length} 条词汇</span><span>↗</span></button>`).join('');
    app.innerHTML=`<div class="page data-page"><section class="data-summary" aria-label="累计数据"><article><span>使用时间</span><strong>${formatDuration(currentUsage())}</strong></article><article><span>文章</span><strong>${data.articles.length}</strong></article><article><span>词汇</span><strong>${data.words.length}</strong></article></section><div class="data-charts"><section class="data-panel"><div class="data-panel-heading"><h2>近 7 天使用</h2><span>分钟</span></div><div class="bar-chart" aria-label="近七天使用时间">${usageBars}</div></section><section class="data-panel"><div class="data-panel-heading"><h2>近 7 天新增</h2><span class="chart-legend"><i class="article-dot"></i>文章 <i class="word-dot"></i>词汇</span></div><div class="bar-chart" aria-label="近七天新增文章和词汇">${additionBars}</div></section></div><section class="data-panel saved-articles"><div class="data-panel-heading"><h2>已存文章</h2><span>${data.articles.length} 篇</span></div>${savedArticles||'<p class="data-empty">暂无文章</p>'}</section></div>`;
  }
  function fontControls(target, scope='study') {
    const name=target==='reading'?t('readingFont'):target==='notes'?t('notesFont'):t('dictionaryFont');
    const value=target==='reading'?data.preferences.fontSize:target==='notes'?data.preferences.notesFontSize:data.preferences.dictionaryFontSize;
    const id=`${scope}-${target}-font`;
    return `<div class="font-controls" role="group" aria-label="${name}调节"><label for="${id}">${name}</label><input id="${id}" class="font-slider" type="range" min="${FONT_MIN}" max="${FONT_MAX}" step="0.1" value="${value}" data-font-target="${target}" aria-valuetext="${value} 像素"><span class="font-value"><input type="number" min="${FONT_MIN}" max="${FONT_MAX}" step="0.1" value="${value}" data-font-target="${target}" aria-label="${name}数值"><span>px</span></span></div>`;
  }
  function languageControls(){
    const options=I18N.languages.map(item=>`<option value="${item.code}" ${item.code===locale()?'selected':''}>${escapeHTML(item.name)}</option>`).join('');
    return `<section class="language-settings"><label for="settings-language"><strong>${t('interfaceLanguage')}</strong><small>${t('languageDescription')}</small></label><select id="settings-language">${options}</select></section>`;
  }
  function lineHeightControls(){
    const value=data.preferences.readingLineHeight;
    return `<div class="font-controls" role="group" aria-label="原文行距调节"><label for="settings-line-height">原文行距</label><input id="settings-line-height" class="font-slider" type="range" min="${LINE_HEIGHT_MIN}" max="${LINE_HEIGHT_MAX}" step="0.05" value="${value}" data-line-height aria-valuetext="${value} 倍"><span class="font-value"><input type="number" min="${LINE_HEIGHT_MIN}" max="${LINE_HEIGHT_MAX}" step="0.05" value="${value}" data-line-height aria-label="原文行距数值"><span>倍</span></span></div>`;
  }
  function backgroundControls(){
    const choices=READING_BACKGROUNDS.map(option=>`<button type="button" class="background-choice" data-reading-background="${option.id}" role="radio" aria-checked="${data.preferences.readingBackground===option.id}" style="--swatch:${option.color}"><i aria-hidden="true"></i><span>${option.name}</span></button>`).join('');
    return `<section class="background-settings"><h3>阅读背景</h3><div class="background-choices" role="radiogroup" aria-label="阅读背景">${choices}</div></section>`;
  }
  function behaviorControls(){
    return `<section class="behavior-settings"><h3>选词行为</h3><button type="button" class="setting-switch" data-toggle-quick-add role="switch" aria-checked="${data.preferences.quickAddWords}"><span><strong>选词后直接加入词汇栏</strong><small>关闭后，添加词汇时自动进入笔记页</small></span><i aria-hidden="true"></i></button></section>`;
  }
  function deepSeekControls(){
    return `<section class="deepseek-settings"><div class="deepseek-setting-heading"><div><h3>DeepSeek 翻译</h3><small>V4 Pro · 最高强度思考</small></div><span class="deepseek-model">AI</span></div><label for="deepseek-api-key">API Key</label><div class="api-key-row"><input id="deepseek-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" aria-describedby="deepseek-status"><button class="button" type="button" id="test-deepseek">测试连接</button></div><p class="api-status" id="deepseek-status" role="status">${escapeHTML(apiConnectionStatus)}</p><p class="api-privacy">密钥长期保存在当前浏览器本机存储中，关闭或重启浏览器后仍保留，但不会进入数据备份。</p></section>`;
  }
  function paddingControls() {
    const labels={top:'上',right:'右',bottom:'下',left:'左'};
    const controls=Object.entries(labels).map(([side,label])=>{const key=`readingPadding${side[0].toUpperCase()+side.slice(1)}`,value=data.preferences[key],id=`settings-padding-${side}`;return `<div class="padding-control" role="group" aria-label="${label}页边距调节"><label for="${id}">${label}</label><input id="${id}" class="font-slider" type="range" min="${PADDING_MIN}" max="${PADDING_MAX}" step="1" value="${value}" data-padding-target="${side}" aria-valuetext="${value} 像素"><span class="font-value"><input type="number" min="${PADDING_MIN}" max="${PADDING_MAX}" step="1" value="${value}" data-padding-target="${side}" aria-label="${label}页边距数值"><span>px</span></span></div>`;}).join('');
    return `<section class="padding-settings"><h3>文章页边距</h3><div class="padding-controls">${controls}</div></section>`;
  }
  function updateFont(input, commit=false) {
    const target=input.dataset.fontTarget;
    if(!['reading','notes','dictionary'].includes(target))return;
    const key=target==='reading'?'fontSize':target==='notes'?'notesFontSize':'dictionaryFontSize';
    // Keep partially typed numeric values editable until blur/change.
    if(!commit&&(input.value===''||!Number.isFinite(input.valueAsNumber)||input.valueAsNumber<FONT_MIN||input.valueAsNumber>FONT_MAX))return;
    const value=fontSize(input.value,data.preferences[key]);
    data.preferences[key]=value;
    document.documentElement.style.setProperty(target==='reading'?'--reading-size':target==='notes'?'--notes-size':'--dictionary-size',`${value}px`);
    document.querySelectorAll(`[data-font-target="${target}"]`).forEach(control=>{
      if(control!==input||commit)control.value=value;
      if(control.type==='range')control.setAttribute('aria-valuetext',`${value} 像素`);
    });
    removeSelection();
    clearTimeout(fontSaveTimer);
    if(commit){fontSaveTimer=null;persist();}
    else fontSaveTimer=setTimeout(()=>{fontSaveTimer=null;persist();},200);
  }
  function updatePadding(input,commit=false){
    const side=input.dataset.paddingTarget;if(!['top','right','bottom','left'].includes(side))return;
    const key=`readingPadding${side[0].toUpperCase()+side.slice(1)}`;
    if(!commit&&(input.value===''||!Number.isFinite(input.valueAsNumber)||input.valueAsNumber<PADDING_MIN||input.valueAsNumber>PADDING_MAX))return;
    const value=paddingSize(input.value,data.preferences[key]);data.preferences[key]=value;
    document.documentElement.style.setProperty(`--article-padding-${side}`,`${value}px`);
    document.querySelectorAll(`[data-padding-target="${side}"]`).forEach(control=>{if(control!==input||commit)control.value=value;if(control.type==='range')control.setAttribute('aria-valuetext',`${value} 像素`);});
    clearTimeout(fontSaveTimer);if(commit){fontSaveTimer=null;persist();}else fontSaveTimer=setTimeout(()=>{fontSaveTimer=null;persist();},200);
  }
  function updateLineHeight(input,commit=false){
    if(!commit&&(input.value===''||!Number.isFinite(input.valueAsNumber)||input.valueAsNumber<LINE_HEIGHT_MIN||input.valueAsNumber>LINE_HEIGHT_MAX))return;
    const value=lineHeightValue(input.value,data.preferences.readingLineHeight);data.preferences.readingLineHeight=value;
    document.documentElement.style.setProperty('--reading-line-height',String(value));
    document.querySelectorAll('[data-line-height]').forEach(control=>{if(control!==input||commit)control.value=value;if(control.type==='range')control.setAttribute('aria-valuetext',`${value} 倍`);});
    clearTimeout(fontSaveTimer);if(commit){fontSaveTimer=null;persist();}else fontSaveTimer=setTimeout(()=>{fontSaveTimer=null;persist();},200);
  }
  function updateStudySummary() {
    const a=currentArticle();
    const summary=$('.article-reading-stats');
    if(a&&summary){summary.innerHTML=`${countWords(a.body)} <span>${t('unitWords')}</span> · <span id="notes-count">${articleWords(a.id).length}</span> <span>${t('unitNotes')}</span>`;localizeDOM(summary);}
  }
  function renderHeader() {
    const a=route.name==='study'?currentArticle():null;
    const p=route.name==='papers'&&route.id.startsWith('open/')&&paperSession?.id===route.id.slice(5)?paperSession:null;
    document.body.classList.toggle('is-studying',Boolean(a));
    document.body.classList.toggle('is-paper-reading',Boolean(p));
    for(const id of ['header-study','header-study-actions'])$('#'+id).hidden=!(a||p);
    $('#header-study').classList.toggle('paper-header',Boolean(p));
    $('#header-study').innerHTML=p?`<a class="paper-library-back" href="#papers"><span aria-hidden="true">←</span> 论文库</a><strong class="paper-header-title" title="${escapeHTML(p.file.name)}">${escapeHTML(p.title||p.file.name)}</strong>`:a?`<h1 title="${escapeHTML(a.title)}">${escapeHTML(a.title)}</h1>`:'';
    $('#header-study-actions').classList.toggle('paper-header-actions',Boolean(p));
    $('#header-study-actions').innerHTML=p?`<label class="paper-date-control"><span>论文时间</span><input id="paper-date-input" type="text" maxlength="40" value="${escapeHTML(p.paperDate)}" placeholder="如 2023 或 2023-08" aria-label="论文时间"></label><select data-move-paper="${escapeHTML(p.id)}" aria-label="移动论文到文件夹">${folderOptions('paper',p.folderId)}</select><a class="paper-open-original" href="${escapeHTML(p.url)}" target="_blank" rel="noopener"><span class="paper-open-label">在新标签页打开</span><span class="paper-open-short">打开 PDF</span></a>`:a?(articleEdits.has(a.id)?'<button class="button primary" type="submit" form="inline-article-form">保存原文</button><button class="button" data-cancel-article-edit>取消</button>':`<details class="study-tools"><summary class="button study-tools-trigger">工具</summary><div class="study-tools-menu" aria-label="文章工具"><button class="translation-switch" type="button" data-toggle-highlights role="switch" aria-checked="${data.preferences.highlightWords}"><span>${t('underline')}</span><i aria-hidden="true"></i></button>${a.translation.trim()||a.translationTitle.trim()?`<button class="translation-switch" type="button" data-toggle-translation role="switch" aria-checked="${data.preferences.showTranslation}"><span>译文</span><i aria-hidden="true"></i></button>`:''}<div class="study-tools-divider"></div><button class="study-tools-action" type="button" data-translate-article>AI 翻译</button><button class="study-tools-action" type="button" data-edit-article="${escapeHTML(a.id)}">编辑原文</button><button class="study-tools-action" type="button" data-new-word>＋ 添加词汇</button></div></details>`):'';
    if(p){const paperDateInput=$('#paper-date-input');paperDateInput.addEventListener('change',async()=>{const session=paperSession;if(!session||session.id!==p.id)return;session.paperDate=paperDateInput.value.trim().slice(0,40);paperDateInput.value=session.paperDate;await savePaperSession(session);if(route?.name==='papers'&&!route.id.startsWith('open/'))renderPapers();toast(session.paperDate?'论文时间已保存':'论文时间已清除');});paperDateInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();paperDateInput.blur();}});}
    $('#settings-controls').innerHTML=languageControls()+fontControls('reading','settings')+fontControls('notes','settings')+fontControls('dictionary','settings')+lineHeightControls()+behaviorControls()+backgroundControls()+paddingControls()+deepSeekControls();
    $('#deepseek-api-key').value=deepseekApiKey;
    $('.mobile-navigation').open=false;
    localizeDOM();
  }
  document.addEventListener('input',e=>{if(e.target.matches('[data-font-target]'))updateFont(e.target);if(e.target.matches('[data-padding-target]'))updatePadding(e.target);if(e.target.matches('[data-line-height]'))updateLineHeight(e.target);if(e.target.id==='deepseek-api-key'){deepseekApiKey=e.target.value.trim();apiConnectionStatus=deepseekApiKey?t('apiKeyReady'):t('apiKeyEmpty');try{if(deepseekApiKey)localStorage.setItem(DEEPSEEK_STORAGE_KEY,deepseekApiKey);else localStorage.removeItem(DEEPSEEK_STORAGE_KEY);sessionStorage.removeItem(DEEPSEEK_STORAGE_KEY);}catch{}const status=$('#deepseek-status');if(status){status.textContent=apiConnectionStatus;status.className='api-status';}}});
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-font-target]'))updateFont(e.target,true);if(e.target.matches('[data-padding-target]'))updatePadding(e.target,true);if(e.target.matches('[data-line-height]'))updateLineHeight(e.target,true);
    if(e.target.id==='settings-language'){data.preferences.language=I18N.supported(e.target.value);apiConnectionStatus=deepseekApiKey?t('apiKeyReady'):t('apiKeyEmpty');persist();render();}
    if(e.target.matches('[data-move-article]')){const article=data.articles.find(item=>item.id===e.target.dataset.moveArticle);if(article){article.folderId=folderFor('article',e.target.value)?.id||null;article.updatedAt=new Date().toISOString();persist();render();toast('文章已移动');}}
    if(e.target.matches('[data-move-paper]')){movePaperToFolder(e.target.dataset.movePaper,e.target.value).then(()=>{if(route.name==='papers'&&!route.id.startsWith('open/'))render();toast('论文已移动');}).catch(()=>toast('论文移动失败'));}
  });
  window.addEventListener('beforeunload',e=>{
    flushUsage();
    if(fontSaveTimer){clearTimeout(fontSaveTimer);persist();}
    const unsaved=[...articleEdits].some(([id,edit])=>{const a=data.articles.find(a=>a.id===id);return a&&(a.title!==edit.title||a.source!==edit.source||a.body!==edit.body||a.translationTitle!==edit.translationTitle||a.translation!==edit.translation);});
    if(unsaved){e.preventDefault();e.returnValue='';}
  });
  function renderStudy() {
    const a=currentArticle();document.title=`${a.title} · 英文阅读与论文翻译`;
    app.innerHTML=`<div class="study-layout"><section class="reading-pane" aria-label="文章阅读区"></section><div class="splitter" role="separator" aria-label="调整文章和词汇面板宽度" aria-orientation="vertical" aria-valuemin="35" aria-valuemax="72" aria-valuenow="${data.preferences.split}" tabindex="0"></div><aside class="notes-pane" aria-label="词汇笔记"><div class="notes-body" id="notes-body"></div></aside></div>`;
    renderReadingPane();renderNotes();setupSplitter();
  }
  function renderReadingPane() {
    const a=currentArticle(),pane=$('.reading-pane');if(!a||!pane)return;
    const edit=articleEdits.get(a.id);
    pane.classList.toggle('is-editing',Boolean(edit));
    if(edit){
      pane.innerHTML=`<form class="article-content inline-article-editor" id="inline-article-form"><label class="eyebrow" for="inline-article-title">文章标题</label><input id="inline-article-title" aria-label="文章标题" maxlength="200" required value="${escapeHTML(edit.title)}"><label class="inline-editor-label" for="inline-article-source">文章来源 <span>可选</span></label><input id="inline-article-source" aria-label="文章来源" maxlength="500" value="${escapeHTML(edit.source)}"><label class="inline-editor-label" for="inline-article-body">英文原文 <span>编辑完成后点击顶栏“保存原文” · Ctrl+Enter 保存</span></label><textarea id="inline-article-body" aria-label="编辑英文原文" maxlength="2000000" required spellcheck="false">${escapeHTML(edit.body)}</textarea><label class="inline-editor-label" for="inline-article-translation-title">中文标题 <span>可选，阅读时随译文一起显示或隐藏</span></label><input id="inline-article-translation-title" aria-label="编辑中文标题" maxlength="300" value="${escapeHTML(edit.translationTitle)}"><label class="inline-editor-label" for="inline-article-translation">中文译文 <span>可选，阅读时可随时显示或隐藏</span></label><textarea id="inline-article-translation" aria-label="编辑中文译文" maxlength="2000000">${escapeHTML(edit.translation)}</textarea></form>`;
      const form=$('#inline-article-form'),title=$('#inline-article-title'),source=$('#inline-article-source'),body=$('#inline-article-body'),translationTitle=$('#inline-article-translation-title'),translation=$('#inline-article-translation');
      form.addEventListener('input',()=>{edit.title=title.value;edit.source=source.value;edit.body=body.value;edit.translationTitle=translationTitle.value;edit.translation=translation.value;title.setCustomValidity('');body.setCustomValidity('');});
      form.addEventListener('submit',e=>{e.preventDefault();saveArticleEdit();});
      body.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
      return;
    }
    const translatedTitle=data.preferences.showTranslation&&a.translationTitle.trim()?`<p class="article-title-translation" lang="zh-CN">${escapeHTML(a.translationTitle.trim())}</p>`:'';
    const articleSource=a.source.trim()?`<p class="article-source-detail"><span>${t('sourcePrefix')}:</span> ${escapeHTML(a.source.trim())}</p>`:'';
    pane.innerHTML=`<div class="article-content"><h2>${escapeHTML(a.title)}</h2>${translatedTitle}${articleSource}<div class="article-text" id="article-text" tabindex="0" aria-label="英文原文"></div><footer class="article-reading-stats" aria-label="文章统计">${countWords(a.body)} <span>${t('unitWords')}</span> · <span id="notes-count">${articleWords(a.id).length}</span> <span>${t('unitNotes')}</span></footer></div>`;
    renderHighlights();
    $('#article-text').addEventListener('mouseup',captureSelection);
    $('#article-text').addEventListener('keyup',captureSelection);
    $('#article-text').addEventListener('touchend',()=>setTimeout(captureSelection,100));
  }
  function editArticle(id) {
    const a=data.articles.find(a=>a.id===id);if(!a)return;
    if(!articleEdits.has(id))articleEdits.set(id,{title:a.title,source:a.source,body:a.body,translationTitle:a.translationTitle,translation:a.translation,scrollTop:route.name==='study'&&route.id===id?$('.reading-pane')?.scrollTop||0:0});
    removeSelection();
    if(route.name!=='study'||route.id!==id){location.hash=`study/${id}`;return;}
    renderHeader();renderReadingPane();
    $('#inline-article-body').focus({preventScroll:true});
  }
  function finishArticleEdit() {
    const scrollTop=articleEdits.get(route.id)?.scrollTop||0;
    articleEdits.delete(route.id);
    renderHeader();renderReadingPane();
    document.title=`${currentArticle().title} · 英文阅读与论文翻译`;
    $('.reading-pane').scrollTop=scrollTop;
    $('#header-study-actions [data-edit-article]')?.focus({preventScroll:true});
  }
  function saveArticleEdit() {
    const a=currentArticle(),form=$('#inline-article-form');if(!a||!form)return;
    const title=$('#inline-article-title'),source=$('#inline-article-source'),body=$('#inline-article-body'),translationTitle=$('#inline-article-translation-title'),translation=$('#inline-article-translation');
    title.setCustomValidity(title.value.trim()?'':'请填写文章标题');
    body.setCustomValidity(body.value.trim()?'':'请填写英文原文');
    if(!form.reportValidity())return;
    const original={...a};
    Object.assign(a,{title:title.value.trim(),source:source.value.trim(),body:body.value,translationTitle:translationTitle.value.trim(),translation:translation.value,updatedAt:new Date().toISOString()});
    if(!persist()){Object.assign(a,original);toast('保存失败，编辑内容仍保留在左栏，请勿关闭页面');return;}
    finishArticleEdit();toast('原文已保存');
  }
  function renderHighlights() {
    const root=$('#article-text');const a=currentArticle();if(!root||!a)return;
    const words=data.preferences.highlightWords?articleWords(a.id).sort((a,b)=>b.term.length-a.term.length):[];
    const highlighted=text=>{
      if(!words.length)return escapeHTML(text);
      const lookup=new Map(words.map(w=>[w.term.toLowerCase(),w]));
      for(const word of words)for(const form of englishTermForms(word.term))if(!lookup.has(form))lookup.set(form,word);
      const pattern=[...lookup.keys()].sort((left,right)=>right.length-left.length).map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
      const regex=new RegExp(pattern,'gi');let result='',start=0;
      for(const match of text.matchAll(regex)) {
      const term=match[0],index=match.index;
        if ((/[A-Za-z0-9]/.test(term[0]) && /[A-Za-z0-9]/.test(text[index-1]||'')) || (/[A-Za-z0-9]/.test(term.at(-1)) && /[A-Za-z0-9]/.test(text[index+term.length]||''))) continue;
        const w=lookup.get(term.toLowerCase());result+=escapeHTML(text.slice(start,index))+`<mark tabindex="0" role="button" aria-label="查看 ${escapeHTML(term)} 的笔记" data-highlight-word="${escapeHTML(w.id)}" class="${activeWord===w.id?'active':''}">${escapeHTML(term)}</mark>`;start=index+term.length;
      }
      return result+escapeHTML(text.slice(start));
    };
    if(a.translation.trim()&&data.preferences.showTranslation){
      const english=a.body.split(/\n\s*\n/),chinese=a.translation.split(/\n\s*\n/);let cursor=0;
      root.classList.add('bilingual');
      root.innerHTML=Array.from({length:Math.max(english.length,chinese.length)},(_,index)=>{
        const paragraph=english[index]||'',start=paragraph?a.body.indexOf(paragraph,cursor):cursor;if(paragraph)cursor=start+paragraph.length;
        return `${paragraph?`<div class="english-paragraph" data-start="${start}">${highlighted(paragraph)}</div>`:''}${chinese[index]?.trim()?`<div class="article-translation" lang="zh-CN">${escapeHTML(chinese[index].trim())}</div>`:''}`;
      }).join('');
    }else{
      root.classList.remove('bilingual');root.innerHTML=highlighted(a.body);
    }
  }
  function underlinedContext(text,term){
    const forms=[...englishTermForms(term)].sort((left,right)=>right.length-left.length);
    if(!text||!forms.length)return escapeHTML(text);
    const pattern=forms.map(form=>form.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),regex=new RegExp(pattern,'gi');let result='',start=0;
    for(const match of text.matchAll(regex)){
      const value=match[0],index=match.index;
      if((/[A-Za-z0-9]/.test(value[0])&&/[A-Za-z0-9]/.test(text[index-1]||''))||(/[A-Za-z0-9]/.test(value.at(-1))&&/[A-Za-z0-9]/.test(text[index+value.length]||'')))continue;
      result+=escapeHTML(text.slice(start,index))+`<span class="context-term">${escapeHTML(value)}</span>`;start=index+value.length;
    }
    return result+escapeHTML(text.slice(start));
  }
  function decodeDictionaryTarget(value){try{return decodeURIComponent(value);}catch{return value;}}
  function cleanDictionaryNode(node){
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.nodeValue||'');
    if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
    const tag=node.tagName.toUpperCase();
    if(['SCRIPT','STYLE','LINK','META','IFRAME','OBJECT','EMBED','FORM','INPUT','TEXTAREA','SELECT','OPTION'].includes(tag))return document.createDocumentFragment();
    const allowed=new Set(['DIV','SPAN','H1','H2','H3','H4','P','B','STRONG','I','EM','U','SUP','SUB','BR','HR','UL','OL','LI','DL','DT','DD','TABLE','THEAD','TBODY','TR','TH','TD','A','IMG','DETAILS','SUMMARY']);
    let output;
    if(tag==='A'){
      const href=String(node.getAttribute('href')||'');
      if(/^sound:\/\//i.test(href)){
        output=document.createElement('button');output.type='button';output.className='dictionary-audio';output.dataset.dictionaryAudio=decodeDictionaryTarget(href.replace(/^sound:\/\//i,''));output.setAttribute('aria-label',t('playPronunciation'));
      }else if(/^entry:\/\//i.test(href)){
        output=document.createElement('button');output.type='button';output.className='dictionary-entry-link';output.dataset.dictionaryEntry=decodeDictionaryTarget(href.replace(/^entry:\/\//i,''));
      }else output=document.createElement('span');
    }else if(tag==='IMG'){
      const src=String(node.getAttribute('src')||'');
      if(!src||/^(?:data|javascript|https?):/i.test(src))return document.createDocumentFragment();
      output=document.createElement('img');output.loading='lazy';output.alt=node.getAttribute('alt')||'';output.src=`/api/dictionary/resource?path=${encodeURIComponent(src)}`;
    }else if(allowed.has(tag))output=document.createElement(tag.toLowerCase());
    else output=document.createDocumentFragment();
    if(output.nodeType===Node.ELEMENT_NODE){
      const classes=String(node.getAttribute('class')||'').split(/\s+/).filter(name=>/^[A-Za-z0-9_-]{1,60}$/.test(name));
      if(classes.length)output.classList.add(...classes);
      if(node.hasAttribute('title'))output.title=String(node.getAttribute('title')).slice(0,200);
      if(node.hasAttribute('lang'))output.lang=String(node.getAttribute('lang')).slice(0,20);
      for(const attr of ['colspan','rowspan'])if(node.hasAttribute(attr)&&/^\d{1,2}$/.test(node.getAttribute(attr)))output.setAttribute(attr,node.getAttribute(attr));
    }
    for(const child of node.childNodes)output.append(cleanDictionaryNode(child));
    return output;
  }
  function prepareDictionaryDocument(doc){
    doc.querySelectorAll('.lm5pp_popup,.lm5pp_egg,.dictionary_intro,.pagetitle,.tooltip,.FIELD,.ACTIV,.wordfams').forEach(node=>node.remove());
    for(const definition of doc.querySelectorAll('.DEF')){
      if(!definition.querySelector('.cn_txt'))continue;
      const english=definition.cloneNode(true);
      english.querySelectorAll('.cn_txt').forEach(node=>node.remove());
      if(!english.textContent.trim())definition.classList.add('dictionary-chinese-only');
    }
    for(const tail of [...doc.querySelectorAll('.Tail')]){
      const boxes=[...tail.querySelectorAll(':scope > .ColloBox')];
      if(!boxes.length)continue;
      const details=doc.createElement('details');details.className='dictionary-supplement dictionary-collocations';
      const summary=doc.createElement('summary'),title=doc.createElement('strong');title.textContent=t('dictionaryCollocations');summary.append(title);
      const content=doc.createElement('div');content.className='dictionary-supplement-content';
      for(const box of boxes){box.querySelectorAll('.LDOCEVERSIONLOGO_new,.heading.lm5ppBoxHead').forEach(node=>node.remove());content.append(box);}
      details.append(summary,content);tail.replaceWith(details);
    }
    for(const heading of [...doc.querySelectorAll('.asset.div.corpus')]){
      const label=heading.textContent.replace(/\s+/g,' ').trim();
      if(!/Examples from the Corpus/i.test(label)){heading.remove();continue;}
      const examples=heading.nextElementSibling?.matches('.assetlink.corpus')?heading.nextElementSibling:null;
      if(!examples){heading.remove();continue;}
      const count=examples.querySelectorAll('.NodeW').length;
      const details=doc.createElement('details');details.className='dictionary-supplement dictionary-corpus';
      const summary=doc.createElement('summary'),title=doc.createElement('strong'),meta=doc.createElement('span');
      title.textContent=t('dictionaryCorpus');meta.textContent=count?`${count} ${t('dictionaryExamples')}`:'';
      summary.append(title,meta);details.append(summary,examples);heading.replaceWith(details);
    }
    doc.querySelectorAll('.assetlink.corpus').forEach(node=>{if(!node.closest('.dictionary-supplement'))node.remove();});
    for(const etymology of [...doc.querySelectorAll('.etym')]){
      etymology.querySelector('.asset_intro')?.remove();
      const details=doc.createElement('details');details.className='dictionary-supplement dictionary-origin';
      const summary=doc.createElement('summary'),title=doc.createElement('strong');title.textContent=t('dictionaryOrigin');summary.append(title);
      const content=doc.createElement('div');content.className='dictionary-supplement-content';while(etymology.firstChild)content.append(etymology.firstChild);
      details.append(summary,content);etymology.replaceWith(details);
    }
  }
  function renderDictionaryDefinition(container,result,showChinese=false){
    const parsed=new DOMParser().parseFromString(result.definition,'text/html');
    prepareDictionaryDocument(parsed);
    const definition=document.createElement('div');definition.className='longman-definition';
    definition.classList.toggle('show-chinese',showChinese);
    const toolbar=document.createElement('div');toolbar.className='dictionary-toolbar';
    const toggle=document.createElement('button');toggle.type='button';toggle.className='dictionary-chinese-toggle';toggle.dataset.dictionaryChineseToggle='';toggle.textContent='朗文 5++';toggle.setAttribute('aria-pressed',String(showChinese));toggle.setAttribute('aria-label',t(showChinese?'dictionaryHideChinese':'dictionaryShowChinese'));
    toolbar.append(toggle);definition.append(toolbar);
    for(const child of parsed.body.childNodes)definition.append(cleanDictionaryNode(child));
    container.replaceChildren(definition);
  }
  async function dictionaryResult(term){
    const key=term.trim().toLowerCase();
    if(dictionaryCache.has(key))return dictionaryCache.get(key);
    const pending=(async()=>{
      const response=await fetch(`/api/dictionary/lookup?word=${encodeURIComponent(term.trim())}`,{headers:{Accept:'application/json'}});
      const payload=await response.json().catch(()=>({}));
      if(response.status===404)return null;
      if(!response.ok)throw new Error(payload.error||t('dictionaryUnavailable'));
      return payload;
    })();
    dictionaryCache.set(key,pending);
    try{return await pending;}catch(error){dictionaryCache.delete(key);throw error;}
  }
  async function loadDictionary(panel,term){
    if(!panel)return;
    const content=$('[data-dictionary-content]',panel),status=$('[data-dictionary-status]',panel),query=String(term||'').trim();
    const token=uid();panel.dataset.dictionaryRequest=token;
    if(!query){status.textContent='';content.innerHTML=`<p class="dictionary-message">${escapeHTML(t('dictionaryEnterWord'))}</p>`;return;}
    status.textContent=t('dictionaryLoading');content.innerHTML=`<p class="dictionary-message">${escapeHTML(t('dictionaryLoading'))}</p>`;
    if(typeof fetch!=='function'){status.textContent=t('dictionaryUnavailable');content.innerHTML=`<p class="dictionary-message">${escapeHTML(t('dictionaryUnavailable'))}</p>`;return;}
    try{
      const result=await dictionaryResult(query);if(panel.dataset.dictionaryRequest!==token||!panel.isConnected)return;
      if(!result){status.textContent='';content.innerHTML=`<p class="dictionary-message">${escapeHTML(t('dictionaryNotFound'))}</p>`;return;}
      status.textContent=result.headword.toLowerCase()===query.toLowerCase()?'':`→ ${result.headword}`;
      renderDictionaryDefinition(content,result,panel.dataset.dictionaryChinese==='true');
    }catch(error){if(panel.dataset.dictionaryRequest!==token||!panel.isConnected)return;status.textContent='';content.innerHTML=`<p class="dictionary-message">${escapeHTML(error.message||t('dictionaryUnavailable'))}</p>`;}
  }
  function bindDictionary(panel,termInput){
    if(!panel||!termInput)return;
    let timer=null;
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>loadDictionary(panel,termInput.value),320);};
    termInput.addEventListener('input',schedule);loadDictionary(panel,termInput.value);
    panel.addEventListener('click',async event=>{
      const toggle=event.target.closest('[data-dictionary-chinese-toggle]');
      if(toggle){event.preventDefault();const definition=toggle.closest('.longman-definition'),showChinese=!definition.classList.contains('show-chinese');definition.classList.toggle('show-chinese',showChinese);panel.dataset.dictionaryChinese=String(showChinese);toggle.setAttribute('aria-pressed',String(showChinese));toggle.setAttribute('aria-label',t(showChinese?'dictionaryHideChinese':'dictionaryShowChinese'));return;}
      const entry=event.target.closest('[data-dictionary-entry]');
      if(entry){event.preventDefault();loadDictionary(panel,entry.dataset.dictionaryEntry);return;}
      const audio=event.target.closest('[data-dictionary-audio]');
      if(audio){event.preventDefault();try{await new Audio(`/api/dictionary/resource?path=${encodeURIComponent(audio.dataset.dictionaryAudio)}`).play();}catch{toast(t('audioUnavailable'));}}
    });
  }
  function wordForm(w) {
    return `<form class="word-form" id="word-form"><label for="word-term">单词 / 短语</label><input id="word-term" name="term" value="${escapeHTML(w.term)}" maxlength="200" required>${w.context?`<div class="context">${underlinedContext(w.context,w.term)}</div>`:''}<details class="longman-panel" data-longman-dictionary><summary><strong>${escapeHTML(t('longmanDictionary'))}</strong><span data-dictionary-status></span></summary><div class="longman-content" data-dictionary-content aria-live="polite"><p class="dictionary-message">${escapeHTML(t('dictionaryLoading'))}</p></div></details><label for="word-zh"><span class="label-index">01</span>中文释义</label><textarea id="word-zh" name="zh" rows="3" maxlength="100000">${escapeHTML(w.zh)}</textarea><label for="word-note"><span class="label-index">02</span>${escapeHTML(t('myNotes'))}</label><textarea id="word-note" name="note" rows="4" maxlength="300000">${escapeHTML(w.note)}</textarea><div class="form-actions"><button type="button" class="text-button" id="delete-word" ${w.id?'':'hidden'}>删除词汇</button><button class="button" type="button" id="word-back">${route.name==='study'?'返回词汇栏':'关闭'}</button></div><p class="form-hint" id="word-save-hint"></p></form>`;
  }
  function studyWordList(words){
    return `<div class="study-word-list">${words.map((w,index)=>`<button class="study-word-item" data-open-word="${escapeHTML(w.id)}"><span class="study-word-index">${String(index+1).padStart(2,'0')}</span><span class="study-word-copy"><strong>${escapeHTML(w.term)}</strong><small>${escapeHTML(w.zh)||'—'}</small></span><span class="study-word-arrow">›</span></button>`).join('')}</div>`;
  }
  function renderNotes() {
    const root=$('#notes-body');if(!root)return;
    const w=data.words.find(w=>w.id===activeWord)||draft;
    if(w){root.innerHTML=wordForm(w);bindWordForm(root);localizeDOM(root);return;}
    const words=articleWordsInReadingOrder(route.id);
    root.innerHTML=studyWordList(words);localizeDOM(root);
  }
  function openWord(id) {
    activeWord=id;draft=null;removeSelection();
    const w=data.words.find(w=>w.id===id);if(!w)return;
    if(route.name==='study'){renderNotes();renderHighlights();if(innerWidth<=720)$('.notes-pane').scrollIntoView({behavior:'smooth'});}
    else {$('#word-dialog-content').innerHTML=wordForm(w)+ (w.articleId?`<div class="article-words"><a class="text-button" id="word-source" href="#study/${escapeHTML(w.articleId)}">回到来源文章 ↗</a></div>`:'');bindWordForm($('#word-dialog-content'));$('#word-source')?.addEventListener('click',()=>$('#word-dialog').close());localizeDOM($('#word-dialog'));$('#word-dialog').showModal();}
  }
  function newWord(term='',context='') {
    const articleId=route.name==='study'?route.id:null;
    const existing=term?data.words.find(w=>w.articleId===articleId&&sameEnglishFamily(w.term,term)):null;
    if(existing&&term){activeWord=data.preferences.quickAddWords?null:existing.id;draft=null;removeSelection();if(route.name==='study'){renderNotes();renderHighlights();if(innerWidth<=720)$('.notes-pane').scrollIntoView({behavior:'smooth'});}toast(data.preferences.quickAddWords?'词汇栏中已有这个词':'已打开这个词的笔记');return;}
    if(term&&route.name==='study'){
      const now=new Date().toISOString(),word={id:uid(),term,zh:'',note:'',context,articleId,createdAt:now,updatedAt:now};data.words.push(word);persist();activeWord=data.preferences.quickAddWords?null:word.id;draft=null;removeSelection();renderNotes();renderHighlights();updateStudySummary();if(innerWidth<=720)$('.notes-pane').scrollIntoView({behavior:'smooth'});toast('已加入当前文章词汇栏');if(activeWord)$('#word-zh')?.focus({preventScroll:true});return;
    }
    activeWord=null;draft={term,zh:'',note:'',context,articleId};removeSelection();
    if(route.name==='study'){renderNotes();renderHighlights();if(innerWidth<=720)$('.notes-pane').scrollIntoView({behavior:'smooth'});}
    else {$('#word-dialog-content').innerHTML=wordForm(draft);bindWordForm($('#word-dialog-content'));$('#word-dialog').showModal();}
    $(term?'#word-zh':'#word-term')?.focus({preventScroll:true});
  }
  function bindWordForm(root) {
    const form=$('#word-form',root);
    bindDictionary($('[data-longman-dictionary]',form),$('#word-term',form));
    const textareas=[...form.querySelectorAll('textarea')];
    const autoSize=textarea=>{textarea.style.height='auto';if(textarea.scrollHeight)textarea.style.height=`${textarea.scrollHeight}px`;};
    textareas.forEach(textarea=>textarea.addEventListener('input',()=>autoSize(textarea)));
    requestAnimationFrame(()=>textareas.forEach(autoSize));
    function save(allowCreate=false) {
      const values=Object.fromEntries(new FormData(form));values.term=values.term.trim();
      const current=data.words.find(w=>w.id===activeWord);
      if(!values.term){if(allowCreate)form.reportValidity();$('#word-save-hint',root).textContent='单词不能为空，当前修改尚未保存。';if(draft)Object.assign(draft,values);return false;}
      const duplicate=data.words.find(w=>w.id!==activeWord&&w.articleId===(current?.articleId??draft?.articleId??null)&&sameEnglishFamily(w.term,values.term));
      if(duplicate){$('#word-save-hint',root).textContent='这篇文章已有同名词汇，请换一个名称或打开已有笔记。';return false;}
      if(!current&&!allowCreate){Object.assign(draft,values);return true;}
      const now=new Date().toISOString();
      if(current)Object.assign(current,values,{updatedAt:now});
      else {const w={...draft,...values,id:uid(),createdAt:now,updatedAt:now};data.words.push(w);activeWord=w.id;draft=null;$('#delete-word',root).hidden=false;}
      const saved=persist();$('#word-save-hint',root).textContent=saved?'':'保存失败，请导出备份后再关闭。';
      if(route.name==='study'){renderHighlights();updateStudySummary();}
      return true;
    }
    form.addEventListener('input',e=>save(Boolean(activeWord)||e.target.id!=='word-term'));
    $('#word-term',root).addEventListener('change',()=>save(true));
    form.addEventListener('submit',e=>{e.preventDefault();save(true);});
    $('#word-back',root).addEventListener('click',()=>{activeWord=null;draft=null;removeSelection();if(route.name==='study')renderNotes();else $('#word-dialog').close();});
    $('#delete-word',root).addEventListener('click',()=>{data.words=data.words.filter(w=>w.id!==activeWord);activeWord=null;draft=null;persist();if(route.name==='study'){renderNotes();renderHighlights();updateStudySummary();}else{$('#word-dialog').close();renderVocabulary();}toast('词汇已删除');});
  }
  function removeSelection(){selection=null;}
  function captureSelection() {
    const s=window.getSelection(),root=$('#article-text');
    if(!s||s.isCollapsed||!root||!root.contains(s.anchorNode)||!root.contains(s.focusNode)){removeSelection();return;}
    const element=node=>node.nodeType===Node.ELEMENT_NODE?node:node.parentElement;
    const anchorBlock=element(s.anchorNode)?.closest('.english-paragraph'),focusBlock=element(s.focusNode)?.closest('.english-paragraph');
    if(root.classList.contains('bilingual')&&(!anchorBlock||anchorBlock!==focusBlock)){removeSelection();return;}
    const term=s.toString().trim();if(!term||term.length>200){removeSelection();return;}
    const range=s.getRangeAt(0);
    const selectionRoot=anchorBlock||root;
    const prefix=range.cloneRange();prefix.selectNodeContents(selectionRoot);prefix.setEnd(range.startContainer,range.startOffset);
    const body=currentArticle().body,offset=(Number(selectionRoot.dataset.start)||0)+prefix.toString().length;
    const before=Math.max(body.lastIndexOf('\n',offset-1),body.lastIndexOf('. ',offset-1),body.lastIndexOf('! ',offset-1),body.lastIndexOf('? ',offset-1));
    const after=body.slice(offset+term.length).search(/[.!?](?:\s|$)|\n/);
    const context=body.slice(before<0?0:before+1,after<0?body.length:offset+term.length+after+1).trim().slice(0,1200);
    selection={term,context};
  }
  function setupSplitter(){
    const splitter=$('.splitter'),layout=$('.study-layout');
    const set = value => {data.preferences.split=Math.min(72,Math.max(35,value));document.documentElement.style.setProperty('--left-width',`${data.preferences.split}%`);splitter.setAttribute('aria-valuenow',String(Math.round(data.preferences.split)));};
    splitter.addEventListener('pointerdown',e=>{splitter.setPointerCapture(e.pointerId);document.body.classList.add('resizing');removeSelection();});
    splitter.addEventListener('pointermove',e=>{if(!splitter.hasPointerCapture(e.pointerId))return;const r=layout.getBoundingClientRect();set((e.clientX-r.left)/r.width*100);});
    const end=()=>{document.body.classList.remove('resizing');persist();};splitter.addEventListener('pointerup',end);splitter.addEventListener('pointercancel',end);
    splitter.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();set(e.key==='Home'?35:e.key==='End'?72:data.preferences.split+(e.key==='ArrowRight'?2:-2));persist();}});
  }
  function articleDialog(id=null){editingArticle=id;const a=data.articles.find(a=>a.id===id);$('#article-dialog-title').textContent=a?t('editArticle'):t('addArticle');$('#article-title').value=a?.title||'';$('#article-source').value=a?.source||'';$('#article-folder').innerHTML=folderOptions('article',a?.folderId||folderFor('article',route.id)?.id||null);$('#article-body').value=a?.body||'';$('#article-translation-title').value=a?.translationTitle||'';$('#article-translation').value=a?.translation||'';localizeDOM($('#article-dialog'));$('#article-dialog').showModal();}
  function openFolderDialog(type){folderDialogType=type==='paper'?'paper':'article';$('#folder-name').value='';$('#folder-dialog').showModal();$('#folder-name').focus();}
  async function movePaperToFolder(id,folderId){const record=paperLibrary.find(item=>item.id===id)||await paperStoreRequest('readonly',store=>store.get(id));if(!record)return;record.folderId=paperFolder(folderId)?.id||null;record.updatedAt=new Date().toISOString();await paperStoreRequest('readwrite',store=>store.put(record));const index=paperLibrary.findIndex(item=>item.id===id);if(index>=0)paperLibrary[index]=record;if(paperSession?.id===id)paperSession.folderId=record.folderId;}
  async function deleteFolder(id){const folder=data.folders.find(item=>item.id===id);if(!folder)return;data.folders=data.folders.filter(item=>item.id!==id);if(folder.type==='article')data.articles.forEach(article=>{if(article.folderId===id)article.folderId=null;});persist();if(folder.type==='paper'){const affected=paperLibrary.filter(paper=>paper.folderId===id);for(const paper of affected)await movePaperToFolder(paper.id,null);}if(route?.id===id)location.hash=folder.type==='article'?'articles':'papers';else render();toast('文件夹已删除，内容已移到未分类');}
  $('#folder-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#folder-name').value.trim();if(!name)return;const duplicate=foldersFor(folderDialogType).some(folder=>folder.name.toLowerCase()===name.toLowerCase());if(duplicate){toast('已经有同名文件夹');return;}const folder={id:uid(),name,type:folderDialogType,createdAt:new Date().toISOString()};data.folders.push(folder);persist();$('#folder-dialog').close();location.hash=`${folder.type==='article'?'articles':'papers'}/${folder.id}`;});
  $('#article-form').addEventListener('submit',e=>{e.preventDefault();const title=$('#article-title').value.trim(),source=$('#article-source').value.trim(),folderId=folderFor('article',$('#article-folder').value)?.id||null,body=$('#article-body').value.trim(),translationTitle=$('#article-translation-title').value.trim(),translation=$('#article-translation').value.trim();if(!title||!body){toast('请填写标题和英文原文');return;}if(body.length>2000000||translation.length>2000000){toast('文章过长，请分成多篇添加');return;}const now=new Date().toISOString();let a=data.articles.find(a=>a.id===editingArticle);if(a)Object.assign(a,{title,source,folderId,body,translationTitle,translation,updatedAt:now});else{a={id:uid(),folderId,title,source,body,translationTitle,translation,createdAt:now,updatedAt:now};data.articles.push(a);}persist();$('#article-dialog').close();if(location.hash===`#study/${a.id}`)render();else location.hash=`study/${a.id}`;});
  async function apiPostStream(path,payload,onProgress){
    let response;
    try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}catch{throw new Error('无法连接本机翻译服务，请重新运行“启动阅读与翻译.cmd”后再试。');}
    if(!response.ok){let result;try{result=await response.json();}catch{result=null;}throw new Error(result?.error||'DeepSeek 请求失败，请稍后再试。');}
    if(!response.body?.getReader){let result;try{result=await response.json();}catch{result=null;}if(!result)throw new Error('翻译服务没有返回结果，请重试。');return result;}
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',completed=null;
    const consume=line=>{if(!line.trim())return;let event;try{event=JSON.parse(line);}catch{return;}if(event.type==='progress')onProgress?.(event);else if(event.type==='complete')completed=event.result;else if(event.type==='error')throw new Error(event.error||'DeepSeek 请求失败，请稍后再试。');};
    try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines)consume(line);}buffer+=decoder.decode();if(buffer.trim())consume(buffer);}
    finally{reader.releaseLock?.();}
    if(!completed)throw new Error('翻译连接已结束，但没有收到完整译文，请重试。');return completed;
  }
  async function apiPost(path,payload){
    let response;
    try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}catch{throw new Error('无法连接本机翻译服务，请重新运行“启动阅读与翻译.cmd”后再试。');}
    let result;try{result=await response.json();}catch{result=null;}
    if(!response.ok)throw new Error(result?.error||'DeepSeek 请求失败，请稍后再试。');
    return result;
  }
  async function testDeepSeekKey(button){
    const status=$('#deepseek-status');
    if(!deepseekApiKey){apiConnectionStatus=t('apiKeyRequired');status.textContent=apiConnectionStatus;status.className='api-status error';$('#deepseek-api-key').focus();return;}
    const original=button.textContent;button.disabled=true;button.textContent=t('testing');status.textContent=t('connecting');status.className='api-status';
    try{const result=await apiPost('/api/deepseek/test',{apiKey:deepseekApiKey});apiConnectionStatus=`${t('connectionReady')} · ${result.model}`;status.textContent=apiConnectionStatus;status.className='api-status success';}
    catch(error){apiConnectionStatus=error.message;status.textContent=apiConnectionStatus;status.className='api-status error';}
    finally{button.disabled=false;button.textContent=original;}
  }
  async function translateCurrentArticle(button){
    const article=currentArticle();if(!article)return;
    if(!deepseekApiKey){apiConnectionStatus=t('apiKeyRequired');renderHeader();const settings=$('#settings-dialog');if(!settings.open)settings.showModal();const status=$('#deepseek-status');status.textContent=apiConnectionStatus;status.className='api-status error';$('#deepseek-api-key').focus();toast(t('apiKeyRequired'));return;}
    const original=button.textContent;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=t('translating');
    try{
      const result=await apiPost('/api/deepseek/translate',{apiKey:deepseekApiKey,title:article.title,text:article.body,language:locale(),mode:'article'});
      pendingTranslation={articleId:article.id,titleTranslation:result.titleTranslation,translation:result.translation};
      $('#translation-title-preview').value=result.titleTranslation;
      $('#translation-preview').value=result.translation;
      $('#translation-result-meta').textContent=`${t('translationGenerated')}: ${result.translationParagraphs} ${t('unitParagraphs')} · ${t('maximumReasoningShort')}`;
      localizeDOM($('#translation-dialog'));
      $('#translation-dialog').showModal();
    }catch(error){toast(error.message);}
    finally{if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.textContent=original;}}
  }
  let confirmCallback=null;
  function confirmAction(title,description,callback){$('#confirm-title').textContent=I18N.translate(title,locale());$('#confirm-description').textContent=I18N.translate(description,locale());confirmCallback=callback;localizeDOM($('#confirm-dialog'));$('#confirm-dialog').showModal();$('#confirm-cancel').focus();}
  $('#confirm-cancel').onclick=()=>$('#confirm-dialog').close();$('#confirm-ok').onclick=()=>{const action=confirmCallback;$('#confirm-dialog').close();action?.();};
  $('#confirm-dialog').addEventListener('close',()=>confirmCallback=null);
  document.addEventListener('click',e=>{
    const button=e.target.closest('button,[data-highlight-word]');if(!button)return;
    const toolMenu=button.closest('.study-tools');if(toolMenu)toolMenu.open=false;
    if(button.hasAttribute('data-new-article'))articleDialog();
    if(button.dataset.newFolder)openFolderDialog(button.dataset.newFolder);
    if(button.dataset.deleteFolder)deleteFolder(button.dataset.deleteFolder);
    if(button.dataset.openPaper)openSavedPaper(button.dataset.openPaper);
    if(button.dataset.deletePaper){const id=button.dataset.deletePaper;confirmAction('删除这篇论文？','PDF 原文件和已经生成的译文都会从论文库中删除。',()=>deleteSavedPaper(id));}
    if(button.hasAttribute('data-reading-background')){const option=READING_BACKGROUNDS.find(item=>item.id===button.dataset.readingBackground);if(option){data.preferences.readingBackground=option.id;document.documentElement.style.setProperty('--reading-background',option.color);document.querySelectorAll('[data-reading-background]').forEach(item=>item.setAttribute('aria-checked',String(item===button)));persist();}}
    if(button.hasAttribute('data-toggle-quick-add')){data.preferences.quickAddWords=!data.preferences.quickAddWords;button.setAttribute('aria-checked',String(data.preferences.quickAddWords));persist();}
    if(button.hasAttribute('data-toggle-highlights')){data.preferences.highlightWords=!data.preferences.highlightWords;persist();renderHeader();renderHighlights();}
    if(button.hasAttribute('data-toggle-translation')){const top=$('.reading-pane')?.scrollTop||0;data.preferences.showTranslation=!data.preferences.showTranslation;persist();renderHeader();renderReadingPane();$('.reading-pane').scrollTop=top;}
    if(button.id==='test-deepseek')testDeepSeekKey(button);
    if(button.hasAttribute('data-translate-article'))translateCurrentArticle(button);
    if(button.dataset.openArticle)location.hash=`study/${button.dataset.openArticle}`;
    if(button.dataset.editArticle)editArticle(button.dataset.editArticle);
    if(button.hasAttribute('data-cancel-article-edit'))finishArticleEdit();
    if(button.dataset.deleteArticle){const id=button.dataset.deleteArticle;confirmAction('删除这篇文章？','文章将被删除，已记录的词汇与笔记会保留在词汇库中。',()=>{data.articles=data.articles.filter(a=>a.id!==id);data.words.forEach(w=>{if(w.articleId===id)w.articleId=null;});persist();render();toast('文章已删除，词汇已保留');});}
    if(button.hasAttribute('data-new-word'))newWord();
    if(button.dataset.openWord)openWord(button.dataset.openWord);
    if(button.dataset.highlightWord){if(window.getSelection()?.toString())return;openWord(button.dataset.highlightWord);}
    if(button.hasAttribute('data-close'))button.closest('dialog').close();
  });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&(e.code==='KeyA'||e.key.toLowerCase()==='a')&&!e.isComposing&&selection&&!e.target.closest?.('input,textarea,[contenteditable="true"]')){
      const saved=selection;e.preventDefault();window.getSelection()?.removeAllRanges();selection=null;newWord(saved.term,saved.context);return;
    }
    if(e.target.matches?.('[data-highlight-word]')&&['Enter',' '].includes(e.key)){e.preventDefault();window.getSelection()?.removeAllRanges();openWord(e.target.dataset.highlightWord);}
    if(e.key==='Escape')removeSelection();
  });
  document.addEventListener('pointerdown',e=>{document.querySelectorAll('.study-tools[open]').forEach(menu=>{if(!menu.contains(e.target))menu.open=false;});if(!e.target.closest('#article-text'))removeSelection();});
  document.addEventListener('scroll',e=>{if(e.target!==$('#word-zh')&&e.target!==$('#word-note'))removeSelection();},true);
  window.addEventListener('resize',removeSelection);
  $('#word-dialog').addEventListener('close',()=>{activeWord=null;draft=null;if(route.name==='vocabulary')renderVocabulary();});
  $('#save-translation').onclick=()=>{const article=pendingTranslation&&data.articles.find(item=>item.id===pendingTranslation.articleId),translationTitle=$('#translation-title-preview').value.trim(),translation=$('#translation-preview').value.trim();if(!article||!translationTitle||!translation){toast('中文标题和译文不能为空');return;}article.translationTitle=translationTitle;article.translation=translation;article.updatedAt=new Date().toISOString();data.preferences.showTranslation=true;if(!persist()){toast('译文保存失败，请保留当前页面并先导出备份');return;}pendingTranslation=null;$('#translation-dialog').close();if(route.name==='study'&&route.id===article.id){renderHeader();renderReadingPane();}toast('译文已保存并显示');};
  $('#translation-dialog').addEventListener('close',()=>{pendingTranslation=null;$('#translation-title-preview').value='';$('#translation-preview').value='';$('#translation-result-meta').textContent='';});
  $('#backup-button').onclick=()=>$('#backup-dialog').showModal();
  $('#settings-button').onclick=()=>$('#settings-dialog').showModal();
  $('#settings-backup-button').onclick=()=>{$('#settings-dialog').close();$('#backup-dialog').showModal();};
  function exportData(){
    const blob=new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`阅读与翻译备份-${new Date().toISOString().slice(0,10)}.json`;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('已发起备份下载，请在浏览器下载列表中确认');}
  $('#export-button').onclick=exportData;
  $('#import-button').onclick=()=>$('#import-file').click();
  $('#backup-text-button').onclick=()=>{$('#backup-text').value=JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2);$('#backup-text-panel').hidden=false;};
  $('#copy-backup-button').onclick=async()=>{try{await navigator.clipboard.writeText($('#backup-text').value);toast('备份文本已复制，请保存为 .json 文件');}catch{$('#backup-text').focus();$('#backup-text').select();toast('请按 Ctrl+C 复制已选中的备份文本');}};
  $('#backup-dialog').addEventListener('close',()=>{$('#backup-text-panel').hidden=true;$('#backup-text').value='';});
  function mergeBackup(incoming){
    const folderRemap=new Map(),articleRemap=new Map();let addedArticles=0,addedWords=0;
    for(const folder of incoming.folders){const same=data.folders.find(item=>item.type===folder.type&&item.name.toLowerCase()===folder.name.toLowerCase());if(same){folderRemap.set(folder.id,same.id);continue;}const copy={...folder,id:data.folders.some(item=>item.id===folder.id)?uid():folder.id};data.folders.push(copy);folderRemap.set(folder.id,copy.id);}
    for(const a of incoming.articles){const prepared={...a,folderId:a.folderId?folderRemap.get(a.folderId)||null:null},existing=data.articles.find(x=>x.id===a.id);if(!existing){data.articles.push(prepared);articleRemap.set(a.id,a.id);addedArticles++;}else if(existing.title===a.title&&existing.source===a.source&&existing.body===a.body&&existing.translationTitle===a.translationTitle&&existing.translation===a.translation){articleRemap.set(a.id,a.id);}else{const copy={...prepared,id:uid(),title:`${a.title.slice(0,190)}（导入）`};data.articles.push(copy);articleRemap.set(a.id,copy.id);addedArticles++;}}
    for(const w of incoming.words){const articleId=w.articleId?articleRemap.get(w.articleId):null;const same=data.words.find(x=>x.articleId===articleId&&['term','zh','en','note','context'].every(k=>x[k]===w[k]));if(same)continue;const newWord={...w,articleId,id:data.words.some(x=>x.id===w.id)?uid():w.id};data.words.push(newWord);addedWords++;}
    for(const [day,value] of Object.entries(incoming.activity.usageByDate))data.activity.usageByDate[day]=Math.max(data.activity.usageByDate[day]||0,value);
    return {addedArticles,addedWords};
  }
  function importBackupText(text){
    if(storageBlocked)throw new Error('当前存储不可用，请先处理保存异常');
    const incoming=validate(JSON.parse(text.replace(/^\uFEFF/,'')));
    const isEmpty=!data.articles.length&&!data.words.length;
    const counts=mergeBackup(incoming);
    if(isEmpty)data.preferences={...incoming.preferences};
    const saved=persist();$('#backup-dialog').close();render();
    toast(saved?`已导入 ${counts.addedArticles} 篇文章、${counts.addedWords} 条词汇`:'已导入但保存失败，请立即导出备份');
  }
  $('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>30*1024*1024)throw new Error('备份文件超过 30 MB');importBackupText(await file.text());}catch(error){toast(`无法导入：${error.message}`);}finally{e.target.value='';}});

  window.addEventListener('storage',e=>{if(e.key===KEY){storageBlocked=true;storageWarning('另一个窗口修改了数据。当前窗口已暂停保存，请先导出备份，再刷新以载入最新内容。');}});
  window.addEventListener('hashchange',render);render();
})();
