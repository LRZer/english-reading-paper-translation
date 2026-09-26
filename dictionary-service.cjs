const fs = require('node:fs');
const path = require('node:path');
const { MDX, MDD } = require('js-mdict');

const DICTIONARY_DIR = path.resolve(process.env.SHICI_DICTIONARY_DIR || path.join(__dirname,'dictionary','ldoce5'));
const MDX_PATH = path.join(DICTIONARY_DIR,'LDOCE5++ V 1-35.mdx');
const MDD_PATH = path.join(DICTIONARY_DIR,'LDOCE5++ V 1-35.mdd');
const DICTIONARY_NAME = 'Longman Dictionary of Contemporary English 5++';
let mdx = null;
let mdd = null;

const ensureFiles = () => {
  if(!fs.existsSync(MDX_PATH) || !fs.existsSync(MDD_PATH)) throw new Error('本机未配置朗文词库，词汇笔记仍可正常使用。请参阅 README 的可选词典设置。');
};

const getMdx = () => {
  ensureFiles();
  if(!mdx) mdx = new MDX(MDX_PATH);
  return mdx;
};

const getMdd = () => {
  ensureFiles();
  if(!mdd) mdd = new MDD(MDD_PATH);
  return mdd;
};

const normalizeTerm = value => String(value || '').trim().replace(/[‘’]/g,"'").replace(/\s+/g,' ').slice(0,200);

function lookupCandidates(term){
  const lower=term.toLowerCase(), values=[term,lower];
  if(lower.endsWith("'s")) values.push(lower.slice(0,-2));
  if(lower.endsWith('ies')&&lower.length>4) values.push(`${lower.slice(0,-3)}y`);
  if(lower.endsWith('ied')&&lower.length>4) values.push(`${lower.slice(0,-3)}y`);
  if(lower.endsWith('ing')&&lower.length>5){const stem=lower.slice(0,-3);values.push(stem,`${stem}e`);if(stem.at(-1)===stem.at(-2))values.push(stem.slice(0,-1));}
  if(lower.endsWith('ed')&&lower.length>4){const stem=lower.slice(0,-2);values.push(stem,`${stem}e`);if(stem.at(-1)===stem.at(-2))values.push(stem.slice(0,-1));}
  if(lower.endsWith('es')&&lower.length>4)values.push(lower.slice(0,-2),lower.slice(0,-1));
  if(lower.endsWith('s')&&!lower.endsWith('ss')&&lower.length>3)values.push(lower.slice(0,-1));
  return [...new Set(values.filter(Boolean))];
}

function resolveEntry(term){
  const dictionary=getMdx();
  for(const candidate of lookupCandidates(term)){
    let entry=dictionary.lookup(candidate), redirects=0;
    while(entry?.definition && redirects<6){
      const link=String(entry.definition).replace(/\0/g,'').trim().match(/^@@@LINK=(.+)$/i);
      if(!link)break;
      entry=dictionary.lookup(link[1].trim());redirects++;
    }
    if(entry?.definition)return entry;
  }
  return null;
}

function lookup(term){
  const query=normalizeTerm(term);
  if(!query)return null;
  const entry=resolveEntry(query);
  if(!entry)return null;
  return {query,headword:String(entry.keyText||query).replace(/\0/g,''),definition:String(entry.definition).replace(/\0/g,''),dictionary:DICTIONARY_NAME};
}

const MIME_TYPES={
  '.mp3':'audio/mpeg','.wav':'audio/wav','.spx':'audio/ogg',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml',
  '.css':'text/css; charset=utf-8','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'
};

function resource(resourcePath){
  const requested=String(resourcePath||'').trim().replace(/\0/g,'');
  if(!requested || requested.length>500 || /[\r\n]/.test(requested))return null;
  const extension=path.extname(requested).toLowerCase();
  if(!MIME_TYPES[extension])return null;
  const key=`\\${requested.replace(/^[/\\]+/,'').replace(/\//g,'\\')}`;
  const found=getMdd().locate(key);
  if(typeof found?.definition!=='string' || !found.definition)return null;
  const body=Buffer.from(found.definition,'base64');
  if(!body.length)return null;
  return {body,type:MIME_TYPES[extension]};
}

function status(){
  return {available:fs.existsSync(MDX_PATH)&&fs.existsSync(MDD_PATH),dictionary:DICTIONARY_NAME,mdxPath:MDX_PATH,mddPath:MDD_PATH};
}

module.exports={lookup,resource,status,DICTIONARY_DIR};
