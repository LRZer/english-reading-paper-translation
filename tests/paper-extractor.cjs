const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {extractPaper}=require('../paper-extractor.cjs');

const fixtures=[
  {file:'C:/Users/Lenovo/Desktop/图像增强/2308.03594v1.pdf',title:/FeatEnHancer/i,columns:true,minimumWords:4000,required:['Abstract','1. Introduction','2. Related Work'],forbidden:['Learned hierarchical representation and enhanced image from our FeatEnHancer','arXiv:2308.03594v1']},
  {file:'C:/Users/Lenovo/Desktop/图像增强/978-3-031-26313-2_30.pdf',title:/DENet: Detection-driven Enhancement/i,columns:false,minimumWords:4000,required:['Abstract. Recently','1 Introduction','To address this problem'],forbidden:['L. Wang et al. (Eds.)','© The Author(s)']},
  {file:'C:/Users/Lenovo/Desktop/图像增强/2018 Learning to See in the Dark.pdf',title:/Learning to See in the Dark/i,columns:true,minimumWords:2500,required:['Abstract','1. Introduction','physical means to increase SNR'],forbidden:['Jia Xu Vladlen Koltun Intel Labs Intel Labs','(a) Camera output with ISO 8,000','Filter array Exposure time (s) # images']}
];

(async()=>{
  let tested=0;
  for(const fixture of fixtures){
    if(!fs.existsSync(fixture.file))continue;
    const result=await extractPaper(fs.readFileSync(fixture.file),{filename:path.basename(fixture.file)});tested++;
    assert.match(result.title,fixture.title);
    assert.ok(result.stats.words>=fixture.minimumWords,`${result.title}: too few words`);
    assert.ok(result.stats.paragraphs>=50,`${result.title}: too few paragraphs`);
    assert.equal(result.source,path.basename(fixture.file));
    for(const text of fixture.required)assert.ok(result.body.includes(text),`${result.title}: missing ${text}`);
    for(const text of fixture.forbidden)assert.ok(!result.body.includes(text),`${result.title}: kept ${text}`);
    const indices=fixture.required.map(text=>result.body.indexOf(text));assert.deepEqual(indices,[...indices].sort((a,b)=>a-b));
    if(fixture.columns)assert.ok(result.stats.twoColumnPages>=10,'double-column layout was not detected');
    else assert.equal(result.stats.twoColumnPages,0,'single-column paper was misclassified');
    assert.doesNotMatch(result.body,/\nReferences\n/i);
  }
  console.log(tested?`PASS: extracted ${tested} real paper PDFs with adaptive reading order and cleanup.`:'SKIP: paper PDF fixtures are not available on this computer.');
})().catch(error=>{console.error(error);process.exitCode=1;});
