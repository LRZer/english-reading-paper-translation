const assert=require('node:assert/strict');
const {MODEL,ARTICLE_TRANSLATION_SYSTEM_PROMPT,PAPER_TRANSLATION_SYSTEM_PROMPT,buildTranslationRequest,parseTranslationContent,completedParagraphCount,testConnection,translateArticle,translateArticleStream}=require('../deepseek-api.cjs');

async function run(){
  const {paragraphs,body}=buildTranslationRequest('Test','First paragraph.\n\nSecond paragraph.');
  assert.deepEqual(paragraphs,['First paragraph.','Second paragraph.']);
  assert.equal(body.model,'deepseek-v4-pro');
  assert.deepEqual(body.thinking,{type:'enabled'});
  assert.equal(body.reasoning_effort,'max');
  assert.equal(body.stream,false);
  assert.equal(body.messages[0].content,ARTICLE_TRANSLATION_SYSTEM_PROMPT);
  assert.match(body.messages[0].content,/保留文体/);
  assert.match(body.messages[0].content,/幽默、反讽和情感色彩/);
  assert.match(body.messages[1].content,/Translation task type: reading article/);
  const paper=buildTranslationRequest('Research','Abstract.\n\n1 Introduction','zh-CN','paper');
  assert.equal(paper.body.messages[0].content,PAPER_TRANSLATION_SYSTEM_PROMPT);
  assert.match(paper.body.messages[0].content,/而不是逐句对照的生硬译文/);
  assert.match(paper.body.messages[0].content,/允许在同一段内拆分或合并句子/);
  assert.match(paper.body.messages[0].content,/拟人、隐喻、动名词或省略结构可以意译/);
  assert.match(paper.body.messages[0].content,/中文母语科技作者/);
  assert.doesNotMatch(paper.body.messages[0].content,/视觉友好/);
  assert.match(paper.body.messages[1].content,/Translation task type: academic paper/);
  assert.match(paper.body.messages[1].content,/<source_document type="paper">/);
  assert.notEqual(paper.body.messages[0].content,body.messages[0].content);
  const spanish=buildTranslationRequest('Test','One paragraph.','es');
  assert.match(spanish.body.messages[0].content,/English-to-Spanish/);
  assert.match(spanish.body.messages[1].content,/Target language: Spanish/);
  assert.deepEqual(JSON.parse('{"title_translation":"测试","paragraphs":["第一段。","第二段。"]}').paragraphs,['第一段。','第二段。']);
  assert.deepEqual(parseTranslationContent('{"title_translation":"测试","paragraphs":["第一段。","第二段。"]}',paragraphs),{titleTranslation:'测试',translation:'第一段。\n\n第二段。'});
  assert.throws(()=>parseTranslationContent('{"title_translation":"测试","paragraphs":["只有一段。"]}',paragraphs),/段落数不匹配/);
  assert.equal(completedParagraphCount('{"title_translation":"测试","paragraphs":["第一段。","尚未结束'),1);
  assert.equal(completedParagraphCount('{"title_translation":"测试","paragraphs":["含有\\\"引号\\\"。","第二段。"]}'),2);

  let observed;
  const fakeFetch=async(url,options)=>{observed={url,options};return {ok:true,status:200,json:async()=>({object:'list',data:[{id:MODEL}]})};};
  assert.deepEqual(await testConnection('sk-test-key-value',fakeFetch),{ok:true,model:MODEL});
  assert.equal(observed.url,'https://api.deepseek.com/models');
  assert.equal(observed.options.headers.Authorization,'Bearer sk-test-key-value');

  const translateFetch=async(url,options)=>{
    const request=JSON.parse(options.body);
    assert.equal(url,'https://api.deepseek.com/chat/completions');
    assert.equal(request.response_format.type,'json_object');
    return {ok:true,status:200,json:async()=>({model:MODEL,choices:[{finish_reason:'stop',message:{content:'{"title_translation":"测试","paragraphs":["第一段。","第二段。"]}'}}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}})};
  };
  const result=await translateArticle({apiKey:'sk-test-key-value',title:'Test',text:'First.\n\nSecond.',mode:'paper'},translateFetch);
  assert.equal(result.translation,'第一段。\n\n第二段。');
  assert.equal(result.titleTranslation,'测试');
  assert.equal(result.sourceParagraphs,2);
  assert.equal(result.language,'zh-CN');
  assert.equal(result.mode,'paper');
  assert.equal(result.usage.totalTokens,30);
  const encoder=new TextEncoder(),progress=[];
  const streamFetch=async(url,options)=>{
    const request=JSON.parse(options.body);assert.equal(request.stream,true);assert.equal(request.stream_options.include_usage,true);
    const events=[
      'data: {"model":"deepseek-v4-pro","choices":[{"delta":{"reasoning_content":"checking terms"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"{\\\"title_translation\\\":\\\"测试\\\",\\\"paragraphs\\\":[\\\"第一段。\\\","},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"\\\"第二段。\\\"]}"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n\n',
      'data: [DONE]\n\n'
    ];
    return {ok:true,status:200,body:{async *[Symbol.asyncIterator](){for(const event of events)yield encoder.encode(event);}}};
  };
  const streamed=await translateArticleStream({apiKey:'sk-test-key-value',title:'Test',text:'First.\n\nSecond.',mode:'paper',onProgress:event=>progress.push(event)},streamFetch);
  assert.equal(streamed.translation,'第一段。\n\n第二段。');assert.equal(streamed.usage.totalTokens,30);
  assert.ok(progress.some(event=>event.phase==='reasoning'));
  assert.ok(progress.some(event=>event.phase==='translating'&&event.completedParagraphs===1));
  assert.equal(progress.at(-1).phase,'finalizing');
  console.log('PASS: separate prompts, thinking mode, streamed paper progress, key test and paragraph-safe translation.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
