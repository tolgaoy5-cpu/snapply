const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=process.argv[2]||path.join(__dirname,'..','extension');
async function harness(){
 const elements={},storage={},sent=[],api=[],copied=[];
 let valid=true,clipboardFails=false;
 const byId=id=>elements[id]||=( {value:'',textContent:'',disabled:false,focus(){}} );
 const clone=x=>JSON.parse(JSON.stringify(x));
 const context={window:{},chrome:{storage:{local:{get:async key=>({[key]:clone(storage[key]||null)}),set:async x=>Object.assign(storage,clone(x)),remove:async key=>delete storage[key]}}},byId,
  navigator:{clipboard:{writeText:async text=>{if(clipboardFails)throw Error('Denied');copied.push(text)}}},
  show:()=>{},send:async(type,payload)=>{sent.push({type,payload});return {ok:true}},
  currentJob:async()=>({requirements:['Support work']}),profile:async()=>({})};
 context.window.JobCopilotAPI={post:async(route,payload)=>{api.push({route,payload});return {insert_allowed:valid,validation:{valid}}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'queue.js'),'utf8'),context);
 const s=fs.readFileSync(path.join(root,'popup.js'),'utf8');
 const start=s.includes('function queueMessage(')?s.indexOf('function queueMessage('):s.indexOf('async function renderQueue()');
 vm.runInContext(s.slice(start,s.indexOf('\nlet unresolvedCursor',start)),context);
 return {context,byId,sent,api,copied,setValid:x=>valid=x,setClipboardFails:x=>clipboardFails=x,q:context.window.JobCopilotQueue,render:()=>context.renderQueue()};
}
(async()=>{
 let h=await harness();
 await h.q.create([{question:'Describe support work',answer:'Evidence-backed answer',insert_allowed:true,allowed_evidence:['Support work'],question_index:0}]);
 await h.render();h.byId('queueAnswer').value='An invented qualification';
 await h.byId('insertQueue').onclick();
 assert.equal(h.sent.length,0,'Edited answer must not reuse old validation');
 // Revalidation binds approval to the edited text; a failed validation blocks insertion.
 h.setValid(false);await h.byId('saveQueueEdit').onclick();await h.byId('insertQueue').onclick();assert.equal(h.sent.length,0);
 h.setValid(true);h.byId('queueAnswer').value='Reviewed evidence';await h.byId('saveQueueEdit').onclick();await h.byId('insertQueue').onclick();
 assert.equal(h.sent.length,1);assert.equal(h.sent[0].payload.answer,'Reviewed evidence');
 // Manual questions append without destroying existing answers, never call the API, and never insert.
 h.byId('manualQuestion').value='What is your notice period?';const apiCount=h.api.length;
 await h.byId('addManualQuestion').onclick();let q=await h.q.load();assert.equal(q.items.length,2);assert.equal(q.cursor,1);assert.equal(q.items[0].user_answer,'Reviewed evidence');
 assert.equal(q.items[1].source,'manual');assert.equal(h.byId('insertQueue').disabled,true);
 h.byId('queueAnswer').value='My own confirmed answer';await h.byId('saveQueueEdit').onclick();
 q=await h.q.load();assert.equal(q.items[1].user_answer,'My own confirmed answer');assert.equal(q.items[1].insert_allowed,false);assert.equal(h.api.length,apiCount);
 await h.byId('insertQueue').onclick();assert.equal(h.sent.length,1);
 // Copy uses exactly the latest edited answer, including changes not saved, without filling.
 h.byId('queueAnswer').value='Latest edited answer';await h.byId('copyQueueAnswer').onclick();assert.deepEqual(h.copied,['Latest edited answer']);assert.equal(h.sent.length,1);
 h.byId('queueAnswer').value=' ';await h.byId('copyQueueAnswer').onclick();assert.equal(h.copied.length,1);
 h.byId('queueAnswer').value='Copy fails';h.setClipboardFails(true);await h.byId('copyQueueAnswer').onclick();assert.match(h.byId('queueActionStatus').textContent,/Could not copy/);
 h.byId('manualQuestion').value=' ';await h.byId('addManualQuestion').onclick();assert.equal((await h.q.load()).items.length,2);
 await h.q.setCursor(0);await h.render();assert.equal(h.byId('queueAnswer').value,'Reviewed evidence');
 console.log('PASS: manual append/save, exact-text copy, clipboard failure, empty input, old-answer preservation and validation bypass protection.');
})().catch(e=>{console.error(e);process.exitCode=1});
