const path = require('node:path');
const {pathToFileURL} = require('node:url');

class PaperExtractionError extends Error {
  constructor(message,status=400,code='paper_extraction_failed'){
    super(message);this.name='PaperExtractionError';this.status=status;this.code=code;
  }
}

let pdfjsPromise;
function loadPdfJs(){
  if(!globalThis.DOMMatrix){
    globalThis.DOMMatrix=class DOMMatrix{
      constructor(value=[1,0,0,1,0,0]){
        const source=(Array.isArray(value)||ArrayBuffer.isView(value))?value:[value.a,value.b,value.c,value.d,value.e,value.f];
        [this.a,this.b,this.c,this.d,this.e,this.f]=source.map((item,index)=>Number(item??[1,0,0,1,0,0][index]));
      }
    };
  }
  if(!globalThis.ImageData)globalThis.ImageData=class ImageData{};
  if(!globalThis.Path2D)globalThis.Path2D=class Path2D{};
  pdfjsPromise ||= import(pathToFileURL(path.join(__dirname,'vendor','pdfjs-dist','legacy','build','pdf.mjs')).href);
  return pdfjsPromise;
}

const median=values=>{
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return 0;
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};
const normalizedRepeat=text=>text.toLowerCase().replace(/\d+/g,'#').replace(/[^a-z#]+/g,' ').trim();
const terminal=text=>/[.!?][”’"')\]]?$/.test(text.trim());
const headingText=text=>text.replace(/\s+/g,' ').replace(/^([A-Z][a-z]+)\.?\s+(?=[A-Z])/,'$1\n').trim();

function joinItems(items){
  const sorted=[...items].sort((a,b)=>a.x-b.x);
  let output='',right=null;
  for(const item of sorted){
    const value=String(item.text||'');if(!value)continue;
    if(!output){output=value;right=item.x+item.width;continue;}
    const gap=item.x-(right??item.x),left=output.at(-1),first=value[0];
    const spaced=/\s/.test(left)||/^\s/.test(value)||/^[,.;:!?%)\]}]/.test(first)||/[({[/—–-]$/.test(output);
    if(!spaced&&gap>Math.max(.45,item.size*.075))output+=' ';
    output+=value;right=Math.max(right??0,item.x+item.width);
  }
  return output.replace(/\s+/g,' ').replace(/\s+([,.;:!?%])/g,'$1').replace(/([([{])\s+/g,'$1').trim();
}

function pageLines(items,pageNumber,width,height){
  const glyphs=items.filter(item=>typeof item.str==='string'&&item.str.trim()&&!/^arXiv:/i.test(item.str.trim())).map(item=>({
    text:item.str,x:Number(item.transform?.[4]||0),y:Number(item.transform?.[5]||0),
    width:Number(item.width||0),size:Math.max(1,Math.abs(Number(item.transform?.[3]||item.height||10))),
    height:Math.max(1,Math.abs(Number(item.height||item.transform?.[3]||10)))
  }));
  const groups=[];
  for(const item of glyphs){
    let group=groups.find(line=>Math.abs(line.y-item.y)<=Math.max(2.2,Math.min(line.size,item.size)*.42));
    if(!group){group={y:item.y,size:item.size,items:[]};groups.push(group);}
    group.items.push(item);group.y=median(group.items.map(value=>value.y));group.size=median(group.items.map(value=>value.size));
  }
  return groups.flatMap(group=>{
    const items=[...group.items].sort((a,b)=>a.x-b.x),segments=[];let segment=[];
    for(const item of items){
      const previous=segment.at(-1),gap=previous?item.x-(previous.x+previous.width):0;
      if(previous&&gap>Math.max(14,group.size*1.45)&&previous.x+previous.width<width*.56&&item.x>width*.44){segments.push(segment);segment=[];}
      segment.push(item);
    }
    if(segment.length)segments.push(segment);
    return segments.map(part=>{
      const x0=Math.min(...part.map(item=>item.x)),x1=Math.max(...part.map(item=>item.x+item.width));
      return {text:joinItems(part),page:pageNumber,pageWidth:width,pageHeight:height,x0,x1,y:median(part.map(item=>item.y)),size:median(part.map(item=>item.size)),width:x1-x0};
    });
  }).filter(line=>line.text);
}

function isLikelyFormula(line){
  const text=line.text.trim();if(text.length<3)return true;
  if(/^\d+$/.test(text))return true;
  if(!/[A-Za-z]/.test(text)&&text.length<30)return true;
  const letters=(text.match(/[A-Za-z]/g)||[]).length,symbols=(text.match(/[=<>±×÷∑∏√∞≈≠≤≥∂∇^_{}|]/g)||[]).length;
  return symbols>=2&&letters/Math.max(text.length,1)<.42;
}

function stripCaptions(lines){
  const output=[];
  for(let index=0;index<lines.length;index++){
    const line=lines[index];
    if(line.text.length<20||!/^(?:fig(?:ure)?\.?|table)\s*\d+\s*[:.]/i.test(line.text)){output.push(line);continue;}
    const size=line.size;let previous=line;
    while(index+1<lines.length&&index+1<lines.length){
      const next=lines[index+1],gap=previous.page===next.page?Math.abs(previous.y-next.y):Infinity;
      if(next.page!==line.page||Math.abs(next.size-size)>1.4||gap>Math.max(18,size*1.75)||/^(?:abstract|keywords?|\d+(?:\.\d+)*\s+[A-Z]|[IVX]+\.\s+[A-Z])/i.test(next.text))break;
      previous=next;index++;
    }
  }
  return output;
}

function arrangePage(lines,width,height){
  const usable=lines.filter(line=>line.y>height*.055&&line.y<height*.955&&!isLikelyFormula(line));
  const mid=width/2;
  const left=usable.filter(line=>line.x0<mid-12&&line.x1<mid+width*.08&&line.width<width*.62);
  const right=usable.filter(line=>line.x0>mid-width*.08&&line.width<width*.62);
  const wide=usable.filter(line=>line.width>width*.68);
  const twoColumn=left.length>=7&&right.length>=7&&!(wide.length>=6&&wide.length>=Math.min(left.length,right.length)*.7);
  if(!twoColumn)return {twoColumn:false,lines:stripCaptions([...usable].sort((a,b)=>b.y-a.y||a.x0-b.x0).map(line=>({...line,column:0})))};
  const full=[],leftColumn=[],rightColumn=[];
  for(const line of usable){
    if(line.width>width*.62||(line.x0<mid-width*.12&&line.x1>mid+width*.12))full.push({...line,column:-1});
    else if((line.x0+line.x1)/2<mid)leftColumn.push({...line,column:0});
    else rightColumn.push({...line,column:1});
  }
  const highFull=full.filter(line=>line.y>height*.67).sort((a,b)=>b.y-a.y||a.x0-b.x0);
  const remainingFull=full.filter(line=>line.y<=height*.67).sort((a,b)=>b.y-a.y||a.x0-b.x0);
  const sortColumn=column=>column.sort((a,b)=>b.y-a.y||a.x0-b.x0);
  return {twoColumn:true,lines:stripCaptions([...highFull,...sortColumn(leftColumn),...sortColumn(rightColumn),...remainingFull])};
}

function repeatedMarginKeys(pages){
  const counts=new Map();
  for(const page of pages){
    const seen=new Set();
    for(const line of page.rawLines){
      if(!(line.y<=page.height*.08||line.y>=page.height*.92))continue;
      const key=normalizedRepeat(line.text);if(key.length<4)continue;
      seen.add(key);
    }
    for(const key of seen)counts.set(key,(counts.get(key)||0)+1);
  }
  return new Set([...counts].filter(([,count])=>count>=Math.min(3,Math.ceil(pages.length*.35))).map(([key])=>key));
}

function looksLikeHeading(line,bodySize){
  const text=line.text.trim();if(text.length>145)return false;
  if(/^(?:abstract|keywords?|index terms?|introduction|conclusion(?:s)?|discussion|methods?|methodology|results?|references|bibliography|acknowledg(?:e)?ments?)\.?$/i.test(text))return true;
  if(/^\d+(?:\.\d+)*\.?\s+[A-Z][^!?]{1,110}$/.test(text)||/^[IVX]+\.?\s+[A-Z][^!?]{1,110}$/.test(text))return true;
  return line.size>=bodySize*1.22&&text.split(/\s+/).length<=14&&!terminal(text);
}

function looksLikeFrontMatterNoise(line){
  const text=line.text.trim();
  if(line.page!==1||terminal(text)||text.length>180)return false;
  if(/\b[\w.+-]+@[\w.-]+\.\w{2,}\b/.test(text))return true;
  const words=text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[];
  if(words.length>=2&&words.length<=10&&words.every(word=>/^[A-Z][a-z]+(?:['’-][A-Z]?[a-z]+)*$/.test(word)||/^[A-Z]$/.test(word)))return true;
  return /\b(?:University|Institute|Laborator(?:y|ies)|Labs?|Department|School|College|Academy|Research\s+Center|Corporation)\b/i.test(text)
    && !/\b(?:we|our|this|the|a|an|is|are|was|were|has|have|propose|present|show)\b/i.test(text);
}

function looksLikeFigureFragment(text){
  const markers=text.match(/\([a-z]\)/gi)||[];
  return /^\([a-z]\)\s+/i.test(text)
    && (markers.length>=2||/\b(?:camera|image|input|output|result|ground truth|baseline|ours)\b/i.test(text));
}

function looksLikeTableFragment(text){
  if(/\bFilter array\b.+\bExposure time\b.+(?:#|number of)\s*images\b/i.test(text))return true;
  const numbers=text.match(/(?:^|\s)[±+−-]?(?:\d+(?:\.\d+)?|\.\d+)(?=\s|$)/g)||[];
  return numbers.length>=5&&text.length<220&&!/[.!?][”’"')\]]?$/.test(text)&&/\b(?:PSNR|SSIM|AP|mAP|dataset|method|model|time|images?)\b/i.test(text);
}

function joinLine(previous,next){
  const left=previous.trim(),right=next.trim();
  if(/[A-Za-z]-$/.test(left)&&/^[a-z]/.test(right)){
    const last=(left.match(/([A-Za-z]+)-$/)||[])[1]?.toLowerCase()||'',first=(right.match(/^([a-z]+)/)||[])[1]||'';
    const compounds=new Set(['low','high','multi','cross','task','real','state','end','plug','one','two','zero','feature','scale','vision','weather','image']);
    const compoundNext=/^(?:based|driven|level|scale|quality|light|related|specific|friendly|frequency|stage|reference|end|play|time|world|class|resolution|headed|modal|supervised|degrading)$/;
    return compounds.has(last)||compoundNext.test(first)?left+right:left.slice(0,-1)+right;
  }
  return `${left} ${right}`.replace(/\s+([,.;:!?%])/g,'$1').replace(/\(\s+/g,'(').replace(/\s+\)/g,')').replace(/\b([A-Z]{2,})-\s+([A-Z]{2,})\b/g,'$1-$2');
}

function buildArticle(pages,metadata={}){
  const repeatKeys=repeatedMarginKeys(pages);
  const ordered=[];
  let twoColumnPages=0;
  for(const page of pages){
    const arranged=arrangePage(page.rawLines,page.width,page.height);if(arranged.twoColumn)twoColumnPages++;
    for(const line of arranged.lines){
      if(repeatKeys.has(normalizedRepeat(line.text)))continue;
      if(/^(?:©|copyright\b|https?:\/\/doi\.org\b)/i.test(line.text))continue;
      if(/\bEds?\.\)?.+\b(?:LNCS|CCIS|LNAI)\b.+\bpp?\./i.test(line.text))continue;
      ordered.push(line);
    }
  }
  if(!ordered.length)throw new PaperExtractionError('没有在 PDF 中找到可读取的英文正文。它可能是扫描版 PDF。',422,'no_text_layer');
  const sizes=ordered.filter(line=>line.text.length>40).map(line=>line.size),bodySize=median(sizes)||10;
  const firstPage=pages[0];
  const titleCandidates=firstPage.rawLines.filter(line=>line.y>firstPage.height*.62&&line.size>=bodySize*1.22&&!/@/.test(line.text)).sort((a,b)=>b.y-a.y);
  let title=String(metadata.info?.Title||metadata.metadata?.get?.('dc:title')||'').trim();
  if(!title||/^untitled$/i.test(title))title=titleCandidates.slice(0,4).map(line=>line.text).join(' ');
  title=title.replace(/\s+/g,' ').replace(/\s+([,:])/g,'$1').trim()||'未命名论文';
  let start=ordered.findIndex(line=>/^abstract\b/i.test(line.text));
  if(start<0)start=ordered.findIndex(line=>/^(?:1|I)\.?\s+Introduction\b/i.test(line.text));
  const content=ordered.slice(Math.max(0,start));
  const stop=content.findIndex(line=>/^(?:\d+(?:\.\d+)*\s+)?(?:references|bibliography)\.?$/i.test(line.text.trim()));
  const kept=(stop>=0?content.slice(0,stop):content).filter(line=>{
    const text=line.text.trim();
    if(!text||/^\d{1,4}$/.test(text))return false;
    if(text.length>20&&/^(?:fig(?:ure)?\.?|table)\s*\d+\s*[:.]/i.test(text))return false;
    if(looksLikeFrontMatterNoise(line)||looksLikeFigureFragment(text)||looksLikeTableFragment(text))return false;
    if(/^(?:arxiv:|preprint\b)/i.test(text)&&text.length<90)return false;
    return true;
  });
  const paragraphs=[];let current='',previous=null;
  const flush=()=>{if(current.trim())paragraphs.push(current.replace(/\s+/g,' ').trim());current='';};
  for(const line of kept){
    const text=line.text.trim();
    if(looksLikeHeading(line,bodySize)){flush();paragraphs.push(headingText(text));previous=null;continue;}
    let breaks=!current;
    if(previous&&current){
      const sameFlow=previous.page===line.page&&previous.column===line.column;
      const gap=sameFlow?Math.abs(previous.y-line.y):Infinity;
      const columnLeft=line.column===1?line.pageWidth/2:0;
      const indented=line.x0-columnLeft>line.pageWidth*(line.column===-1?.13:.11);
      breaks=(sameFlow&&(gap>Math.max(bodySize*1.85,previous.size*1.9)||(terminal(previous.text)&&gap>Math.max(bodySize*1.32,previous.size*1.42))))
        ||(sameFlow&&terminal(previous.text)&&indented)
        ||(!sameFlow&&(terminal(previous.text)||!/^[a-z(]/.test(text)));
    }
    if(breaks)flush();
    current=current?joinLine(current,text):text;previous=line;
  }
  flush();
  const clean=paragraphs.map(value=>value.replace(/\u00ad/g,'').replace(/\bfullyconvolutional\b/gi,'fully convolutional').replace(/\bwellknown\b/gi,'well-known').replace(/\s+([,.;:!?%])/g,'$1').trim()).filter(value=>value.length>1);
  const body=clean.join('\n\n').trim();
  if(body.split(/\s+/).length<80)throw new PaperExtractionError('提取到的正文过少，可能是扫描版或文字层异常。',422,'insufficient_text');
  return {title,body,stats:{pages:pages.length,paragraphs:clean.length,words:(body.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length,twoColumnPages}};
}

async function extractPaper(buffer,{filename='paper.pdf'}={}){
  if(!Buffer.isBuffer(buffer)&&!(buffer instanceof Uint8Array))throw new PaperExtractionError('没有收到 PDF 文件。');
  if(buffer.length<5||Buffer.from(buffer.subarray(0,5)).toString()!=='%PDF-')throw new PaperExtractionError('请选择有效的 PDF 文件。',415,'invalid_pdf');
  let document;
  try{
    const pdfjs=await loadPdfJs();
    document=await pdfjs.getDocument({data:new Uint8Array(buffer),disableWorker:true,useSystemFonts:true}).promise;
    if(document.numPages>180)throw new PaperExtractionError('论文页数过多，请先拆分为 180 页以内的 PDF。',413,'too_many_pages');
    const metadata=await document.getMetadata().catch(()=>({})),pages=[];
    for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
      const page=await document.getPage(pageNumber),viewport=page.getViewport({scale:1}),content=await page.getTextContent();
      pages.push({number:pageNumber,width:viewport.width,height:viewport.height,rawLines:pageLines(content.items,pageNumber,viewport.width,viewport.height)});
      page.cleanup();
    }
    const result=buildArticle(pages,metadata);
    return {...result,source:filename};
  }catch(error){
    if(error instanceof PaperExtractionError)throw error;
    if(/password/i.test(String(error?.message)))throw new PaperExtractionError('这个 PDF 受密码保护，暂时无法读取。',422,'password_protected');
    const failure=new PaperExtractionError('PDF 解析失败，请确认文件可以正常打开。',422,'invalid_pdf');failure.cause=error;throw failure;
  }finally{await document?.destroy?.().catch(()=>{});}
}

module.exports={PaperExtractionError,extractPaper,buildArticle,pageLines};
