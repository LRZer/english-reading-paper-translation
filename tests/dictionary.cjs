const assert=require('node:assert/strict');
const dictionary=require('../dictionary-service.cjs');

const status=dictionary.status();
assert.match(status.dictionary,/Longman/);
assert.equal(dictionary.resource('../../server.cjs'),null);
if(status.available){
  const nomadic=dictionary.lookup('nomadic');
  assert.equal(nomadic.headword,'nomadic');
  assert.match(nomadic.definition,/Longman Dictionary of Contemporary English 5\+\+/);
  const redirected=dictionary.lookup('scouts');
  assert.equal(redirected.headword,'scout');
  assert.equal(dictionary.lookup('not-a-real-longman-entry-xyz'),null);
  const audio=dictionary.resource('media/english/ameProns/ld41nomadic.mp3');
  assert.equal(audio.type,'audio/mpeg');
  assert.ok(audio.body.length>1000);
  assert.equal(audio.body[0],0xff);
  console.log('PASS: optional local Longman lookup, redirects, missing entries, and MDD audio resources.');
}else{
  assert.throws(()=>dictionary.lookup('nomadic'),/未配置朗文词库/);
  console.log('PASS: missing optional dictionary is reported without blocking the app.');
}
