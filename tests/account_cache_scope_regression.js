// Switching server or account clears cached server data; browser-only answers stay per account.
const fs=require('fs'),path=require('path'),assert=require('assert');
const store={};
global.chrome={storage:{local:{get:async k=>{const ks=Array.isArray(k)?k:[k];return Object.fromEntries(ks.filter(x=>x in store).map(x=>[x,store[x]]))},
  set:async o=>Object.assign(store,o),remove:async k=>{(Array.isArray(k)?k:[k]).forEach(x=>delete store[x])}}}};
global.window={dispatchEvent(){}};global.atob=s=>Buffer.from(s,'base64').toString('binary');
global.fetch=async()=>({ok:true,status:200,json:async()=>({auth:'google'}),text:async()=>''});
new Function(fs.readFileSync(path.join(__dirname,'../extension/api_client.js'),'utf8'))();
new Function(fs.readFileSync(path.join(__dirname,'../extension/memory.js'),'utf8'))();
const API=window.JobCopilotAPI,M=window.JobCopilotMemory;
const tok=uid=>Buffer.from(JSON.stringify({uid,exp:9e9})).toString('base64url')+'.sig';
(async()=>{
  // Local mode (chosen in Advanced) cached someone's profile.
  await API.setBase(API.LOCAL);
  Object.assign(store,{masterProfile:{full_name:'Local Person'},answerQueueV012:{items:[1]},savedCV:{name:'cv.pdf'}});
  // Switch to the cloud: caches go.
  await API.setBase(API.CLOUD);
  assert(!store.masterProfile&&!store.answerQueueV012&&!store.savedCV,'server switch must clear caches');
  // Account A signs in and saves a legal answer (browser-only).
  store.snapplySession=tok('a'.repeat(32));await API.ensureScope();
  store.masterProfile={full_name:'Alice'};
  await M.saveAnswer({signature:'convictions',question:'Convictions?',value:'No',kind:'choice',sensitivity:'legal'});
  assert.strictEqual((await M.getReferees()).length,0);
  // Account B on the same browser sees neither A's profile nor A's browser-only answer.
  store.snapplySession=tok('b'.repeat(32));
  const answersB=await M.getAnswers().catch(()=>[]);
  assert(!store.masterProfile,'account switch must clear cached profile');
  assert(!answersB.some(a=>a.signature==='convictions'),'browser-only answers must be per account');
  // A comes back: their browser-only answer is still there.
  store.snapplySession=tok('a'.repeat(32));
  assert((await M.getAnswers().catch(()=>[])).some(a=>a.signature==='convictions'));
  console.log('account cache scope ok');
})().catch(e=>{console.error(e);process.exit(1)});
