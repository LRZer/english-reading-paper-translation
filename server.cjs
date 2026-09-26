const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DeepSeekError, testConnection, translateArticle, translateArticleStream } = require('./deepseek-api.cjs');
const dictionary = require('./dictionary-service.cjs');
const { PaperExtractionError, extractPaper } = require('./paper-extractor.cjs');
const PORT = Number(process.env.SHICI_PORT) || 4173;
const openBrowser = () => {
  if (process.argv.includes('--open') && process.platform === 'win32') {
    const child = spawn('cmd.exe',['/c','start','','http://127.0.0.1:4173'],{windowsHide:true,stdio:'ignore'});
    child.on('error',()=>console.error('Please open http://127.0.0.1:4173 in your browser.'));
    child.unref();
  }
};
const files = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/i18n.js':'i18n.js','/styles.css':'styles.css','/favicon.svg':'favicon.svg','/vendor/pdfjs/pdf.mjs':'vendor/pdfjs-dist/build/pdf.mjs','/vendor/pdfjs/pdf.worker.mjs':'vendor/pdfjs-dist/build/pdf.worker.mjs'};
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const json = (res,status,payload) => {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(payload));
};
const readJson = req => new Promise((resolve,reject) => {
  let body='',size=0;
  req.setEncoding('utf8');
  req.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>3*1024*1024){reject(new DeepSeekError('请求内容过大。',413,'request_too_large'));req.destroy();return;}body+=chunk;});
  req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch{reject(new DeepSeekError('请求格式不正确。',400,'invalid_json'));}});
  req.on('error',reject);
});
const readBuffer = (req,limit=50*1024*1024) => new Promise((resolve,reject) => {
  const chunks=[];let size=0,finished=false;
  req.on('data',chunk=>{if(finished)return;size+=chunk.length;if(size>limit){finished=true;reject(new PaperExtractionError('PDF 超过 50 MB，请压缩或拆分后重试。',413,'paper_too_large'));req.destroy();return;}chunks.push(chunk);});
  req.on('end',()=>{if(!finished)resolve(Buffer.concat(chunks));});
  req.on('error',error=>{if(!finished)reject(error);});
});
const allowedOrigin = req => !req.headers.origin || req.headers.origin === `http://127.0.0.1:${PORT}` || req.headers.origin === `http://localhost:${PORT}`;
async function handleApi(req,res,url){
  if(req.method!=='POST'){json(res,405,{error:'仅支持 POST 请求。'});return;}
  if(!allowedOrigin(req)){json(res,403,{error:'不允许从其他网站调用本机翻译接口。'});return;}
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json')){json(res,415,{error:'请求必须使用 JSON 格式。'});return;}
  try{
    const body=await readJson(req);
    const result=url.pathname==='/api/deepseek/test'
      ? await testConnection(body.apiKey)
      : await translateArticle({apiKey:body.apiKey,title:body.title,text:body.text,language:body.language,mode:body.mode});
    json(res,200,result);
  }catch(error){
    const status=error instanceof DeepSeekError?error.status:500;
    json(res,status,{error:error instanceof DeepSeekError?error.message:'翻译服务发生意外错误。',code:error instanceof DeepSeekError?error.code:'internal_error'});
  }
}
async function handleTranslationStream(req,res){
  if(req.method!=='POST'){json(res,405,{error:'仅支持 POST 请求。'});return;}
  if(!allowedOrigin(req)){json(res,403,{error:'不允许从其他网站调用本机翻译接口。'});return;}
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json')){json(res,415,{error:'请求必须使用 JSON 格式。'});return;}
  let body;
  try{body=await readJson(req);}
  catch(error){json(res,error instanceof DeepSeekError?error.status:400,{error:error.message||'请求格式不正确。',code:error.code||'invalid_json'});return;}
  res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Accel-Buffering':'no'});
  const send=payload=>{if(!res.destroyed&&!res.writableEnded)res.write(`${JSON.stringify(payload)}\n`);};
  send({type:'progress',phase:'connecting',completedParagraphs:0,totalParagraphs:0,receivedChars:0});
  try{
    const result=await translateArticleStream({apiKey:body.apiKey,title:body.title,text:body.text,language:body.language,mode:body.mode,onProgress:progress=>send({type:'progress',...progress})});
    send({type:'complete',result});
  }catch(error){send({type:'error',error:error instanceof DeepSeekError?error.message:'翻译服务发生意外错误。',code:error instanceof DeepSeekError?error.code:'internal_error'});}
  if(!res.writableEnded)res.end();
}
async function handlePaperApi(req,res){
  if(req.method!=='POST'){json(res,405,{error:'仅支持 POST 请求。'});return;}
  if(!allowedOrigin(req)){json(res,403,{error:'不允许从其他网站调用本机论文解析接口。'});return;}
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/pdf')){json(res,415,{error:'请选择 PDF 文件。'});return;}
  try{
    const buffer=await readBuffer(req);
    let filename='paper.pdf';try{filename=decodeURIComponent(String(req.headers['x-file-name']||filename)).slice(0,500);}catch{}
    json(res,200,await extractPaper(buffer,{filename}));
  }catch(error){
    const status=error instanceof PaperExtractionError?error.status:500;
    json(res,status,{error:error instanceof PaperExtractionError?error.message:'论文解析发生意外错误。',code:error instanceof PaperExtractionError?error.code:'internal_error'});
  }
}
function handleDictionary(req,res,url){
  if(req.method!=='GET'){json(res,405,{error:'仅支持 GET 请求。'});return;}
  if(!allowedOrigin(req)){json(res,403,{error:'不允许从其他网站调用本机词典接口。'});return;}
  try{
    if(url.pathname==='/api/dictionary/status'){json(res,200,dictionary.status());return;}
    if(url.pathname==='/api/dictionary/lookup'){
      const word=String(url.searchParams.get('word')||'');
      if(!word.trim()||word.length>200){json(res,400,{error:'查询词汇不正确。'});return;}
      const result=dictionary.lookup(word);
      if(!result){json(res,404,{error:'朗文词典中未找到这个词条。'});return;}
      json(res,200,result);return;
    }
    const found=dictionary.resource(url.searchParams.get('path'));
    if(!found){json(res,404,{error:'未找到词典资源。'});return;}
    res.writeHead(200,{'Content-Type':found.type,'Content-Length':found.body.length,'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'});
    res.end(found.body);
  }catch(error){json(res,500,{error:error?.message||'本机词典读取失败。'});}
}
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/deepseek/test'||url.pathname==='/api/deepseek/translate'){handleApi(req,res,url);return;}
  if(url.pathname==='/api/deepseek/translate-stream'){handleTranslationStream(req,res);return;}
  if(url.pathname==='/api/paper/extract'){handlePaperApi(req,res);return;}
  if(url.pathname==='/api/dictionary/status'||url.pathname==='/api/dictionary/lookup'||url.pathname==='/api/dictionary/resource'){handleDictionary(req,res,url);return;}
  if(url.pathname === '/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"app":"shici-notebook","version":1}');return;}
  const file=files[url.pathname];
  if(!file){res.writeHead(404);res.end('Not found');return;}
  fs.readFile(path.join(__dirname,file),(error,body)=>{if(error){res.writeHead(500);res.end('Unable to read file');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(body);});
});
server.on('error',error=>{
  if(error.code!=='EADDRINUSE'){console.error(error.message);process.exitCode=1;return;}
  const request=http.get('http://127.0.0.1:4173/health',{timeout:2000},res=>{
    let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>{
      try {if(JSON.parse(body).app==='shici-notebook'){console.log('Reading and translation app is already running: http://127.0.0.1:4173');openBrowser();return;}} catch {}
      console.error('Port 4173 is used by another application. Close that application and try again.');process.exitCode=1;
    });
  });
  request.on('timeout',()=>request.destroy());request.on('error',()=>{console.error('Unable to connect to port 4173. Please close the other application and try again.');process.exitCode=1;});
});
server.listen(PORT,'127.0.0.1',()=>{console.log(`English Reading and Paper Translation: http://127.0.0.1:${PORT}\nKeep this window open while using the app. Press Ctrl+C to stop.`);openBrowser();});
