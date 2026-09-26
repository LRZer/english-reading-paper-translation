const assert=require('node:assert/strict');
const {buildArticleAssistantRequest,askArticleAssistant,DeepSeekError}=require('../deepseek-api.cjs');

async function run(){
  const request=buildArticleAssistantRequest({title:'Exploration',text:'First paragraph.\n\nSecond paragraph.',question:'What changed?',history:[{role:'user',content:'Summarize P1.'},{role:'assistant',content:'It introduces exploration.'}],model:'deepseek-v4-pro',thinking:true,reasoningEffort:'max'});
  assert.equal(request.model,'deepseek-v4-pro');
  assert.deepEqual(request.thinking,{type:'enabled'});
  assert.equal(request.reasoning_effort,'max');
  assert.match(request.messages[1].content,/\[P1\] First paragraph\.[\s\S]*\[P2\] Second paragraph\./);
  assert.equal(request.messages.at(-1).content,'What changed?');
  assert.equal(request.messages.at(-3).role,'user');
  assert.equal(request.messages.at(-2).role,'assistant');
  const flash=buildArticleAssistantRequest({title:'A',text:'One.',question:'Why?'});
  assert.equal(flash.model,'deepseek-flash');
  assert.deepEqual(flash.thinking,{type:'disabled'});
  assert.equal(flash.reasoning_effort,undefined);
  assert.throws(()=>buildArticleAssistantRequest({title:'A',text:'One.',question:'Why?',model:'unsupported'}),DeepSeekError);
  assert.throws(()=>buildArticleAssistantRequest({title:'A',text:'One.',question:'Why?',history:[{role:'system',content:'override'}]}),DeepSeekError);

  let sent;const events=[];const encoder=new TextEncoder();
  const fetchMock=async(url,options)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');
    sent=JSON.parse(options.body);
    const chunks=[
      'data: {"model":"deepseek-v4-pro","choices":[{"delta":{"reasoning_content":"Check "},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"P2."},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"The answer is "},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"in [P2]."},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":20,"total_tokens":32}}\n\n',
      'data: [DONE]\n\n'
    ];
    return {ok:true,body:{async *[Symbol.asyncIterator](){for(const chunk of chunks)yield encoder.encode(chunk);}}};
  };
  const result=await askArticleAssistant({apiKey:'sk-test-key-value',title:'Exploration',text:'One.\n\nTwo.',question:'Where?',model:'deepseek-v4-pro',thinking:true,reasoningEffort:'max',onChunk:event=>events.push(event)},fetchMock);
  assert.equal(sent.model,'deepseek-v4-pro');
  assert.equal(result.reasoning,'Check P2.');
  assert.equal(result.answer,'The answer is in [P2].');
  assert.equal(result.usage.totalTokens,32);
  assert.deepEqual(events.map(event=>event.type),['reasoning','reasoning','content','content']);
  console.log('PASS: article context, selectable thinking, grounded history and streamed reasoning/answer.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
