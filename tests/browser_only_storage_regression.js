// On the hosted service, legal/personal answers, referees and right-to-work memory stay in
// chrome.storage.local and are never sent to the server; locally everything uses the backend.
const fs=require('fs'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../extension/memory.js'),'utf8');
async function run(cloudMode){
  const store={},sent=[];
  const server={saved_answers:{'notice':{signature:'notice',value:'1 month',sensitivity:'normal'}},referees:[],application_memory:{}};
  global.chrome={storage:{local:{get:async k=>({[k]:store[k]}),set:async o=>Object.assign(store,o),remove:async k=>{delete store[k]}}}};
  global.window={JobCopilotAPI:{isCloud:async()=>cloudMode,accountKey:async n=>cloudMode?n+":acct":n,raw:async(p,o={})=>{sent.push([p,o.method||'GET',o.body||'']);
    const body=p==='/v1/state'?server:p==='/v1/state/answers'?{item:JSON.parse(o.body)}:p==='/v1/state/referees'?{referees:JSON.parse(o.body).referees}:p.startsWith('/v1/state/memory')?{item:{value:'x'},application_memory:{}}:{ok:true};
    return {ok:true,json:async()=>body,text:async()=>''}}}};
  new Function(src)();
  const M=window.JobCopilotMemory;
  await M.saveAnswer({signature:'convictions',question:'Any convictions?',value:'No',kind:'choice',sensitivity:'legal'});
  await M.saveAnswer({signature:'ethnicity',question:'Ethnicity',value:'Prefer not to say',kind:'choice',sensitivity:'sensitive'});
  await M.saveAnswer({signature:'salary',question:'Salary?',value:'40k',kind:'text',sensitivity:'normal'});
  await M.saveReferees([{label:'Jane',fields:{surname:'Doe'}}]);
  await M.set('right_to_work','Yes');
  const answers=await M.getAnswers();
  return {store,sent,answers,refs:await M.getReferees()};
}
(async()=>{
  const c=await run(true);
  const posted=c.sent.filter(s=>s[1]==='POST').map(s=>s[0]+' '+s[2]).join('\n');
  assert(!/convictions|ethnicity|Jane|Doe|right_to_work/.test(posted),'sensitive data reached the server:\n'+posted);
  assert(/salary/.test(posted),'normal answer should be saved to the server');
  assert.deepStrictEqual(Object.keys(c.store['browserAnswers:acct']).sort(),['convictions','ethnicity']);
  assert.strictEqual(c.refs[0].fields.surname,'Doe');
  assert.strictEqual(c.store.applicationMemory.right_to_work.value,'Yes');
  const sigs=c.answers.map(a=>a.signature).sort();
  assert.deepStrictEqual(sigs,['convictions','ethnicity','notice']);
  // Deleting a browser-only answer never calls the server.
  const before=c.sent.length;await window.JobCopilotMemory.deleteAnswer('convictions');
  assert.strictEqual(c.sent.length,before);assert(!c.store['browserAnswers:acct'].convictions);
  const l=await run(false);
  const lposted=l.sent.filter(s=>s[1]==='POST').map(s=>s[0]+' '+s[2]).join('\n');
  assert(/convictions/.test(lposted)&&/Doe/.test(lposted)&&/right_to_work/.test(lposted),'local mode keeps using the backend');
  assert(!l.store.browserAnswers&&!l.store.browserReferees);
  console.log('browser-only storage ok');
})().catch(e=>{console.error(e);process.exit(1)});
