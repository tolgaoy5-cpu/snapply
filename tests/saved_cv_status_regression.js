const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=process.argv[2]||path.join(__dirname,'..','extension');
async function run({offline=false,cache=null,meta=null}={}){
 const ctx={window:{JobCopilotAPI:{get:async()=>{if(offline)throw Error('offline');return {saved:!!meta,cv:meta}}}},chrome:{storage:{local:{get:async()=>({savedCV:cache})}}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'saved_cv.js'),'utf8'),ctx);
 return ctx.window.JobCopilotSavedCV.get();
}
(async()=>{
 await assert.rejects(()=>run({offline:true}),/could not be checked/);
 assert.equal(await run(),null);
 assert.equal((await run({offline:true,cache:{name:'test.pdf',storage:'local-cache'}})).storage,'local-cache');
 assert.equal((await run({meta:{name:'saved.pdf',size:123},cache:{name:'older.pdf'}})).name,'saved.pdf');
 const s=fs.readFileSync(path.join(root,'popup.js'),'utf8');let element={textContent:''};
 const ctx={byId:()=>element,window:{JobCopilotSavedCV:{get:async()=>{throw Error('offline')}}}};
 vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('async function refreshSavedCVState()'),s.indexOf("byId('importCV')")),ctx);
 await ctx.refreshSavedCVState();assert.match(element.textContent,/status unavailable/);assert.doesNotMatch(element.textContent,/No reusable CV/);
 console.log('PASS: offline is not missing; cache preserved; backend preferred; confirmed empty stays empty; panel handles offline without breaking initialization.');
})().catch(e=>{console.error(e);process.exitCode=1});
