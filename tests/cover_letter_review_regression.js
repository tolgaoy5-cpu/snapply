const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname,'..','extension/popup.js'),'utf8');
const section = source.slice(source.indexOf('function samePage'), source.indexOf('\n(async()=>{', source.indexOf('async function attachReviewedCoverLetter')));
async function setup(draftOverrides={}) {
  const elements = {}, calls = [], storage = {};
  const job = {url:'https://example.org/job/1',requirement_count:1};
  let url = job.url, renderOK = true;
  const byId = id => elements[id] ||= {value:'',textContent:''};
  const context = {byId, show:()=>{}, active:async()=>({url}), currentJob:async()=>null,
    savedPostingForApplication:()=>false,
    chrome:{storage:{local:{set:async x=>Object.assign(storage,x),get:async()=>storage}}},
    send:async(type,payload)=>{calls.push({type,payload}); if(type==='EXTRACT_JOB'||type==='EXTRACT_POSTING')return job;
      if(type==='COVER_LETTER_UPLOAD_FORMATS')return {ok:true,formats:['pdf']};
      if(type==='ATTACH_COVER_LETTER')return {ok:true,name:'letter.pdf'};
      throw Error(type);},
    window:{JobCopilotAPI:{post:async(route,payload)=>{calls.push({route,payload});
      if(route==='/v1/job/analyze')return job;
      if(route==='/v1/cover-letter/generate')return {status:'REVIEW',attachment_ready:true,job,body:'Verified draft',...draftOverrides};
      if(route==='/v1/cover-letter/render')return {ok:renderOK,reason:'Unsupported claim',name:'letter.pdf',mime_type:'application/pdf',base64:'fake'};
      throw Error(route);}}}};
  vm.runInNewContext(section,context);
  return {elements,calls,storage,byId,setURL:x=>url=x,setRender:x=>renderOK=x};
}
(async()=>{
  let h=await setup();
  await h.byId('generateCoverLetter').onclick();
  assert.equal(h.byId('coverLetterBody').value,'Verified draft');
  assert.equal(h.calls.filter(x=>x.type==='ATTACH_COVER_LETTER'||x.route==='/v1/cover-letter/render'||x.type==='COVER_LETTER_UPLOAD_FORMATS').length,0,'Generating must not start attachment');
  h.byId('coverLetterBody').value='User reviewed edit';
  await h.byId('attachCoverLetter').onclick();
  assert.equal(h.calls.find(x=>x.route==='/v1/cover-letter/render').payload.body,'User reviewed edit');
  assert.equal(h.calls.filter(x=>x.type==='ATTACH_COVER_LETTER').length,1);
  h=await setup({status:'ASK_USER',reason:'Missing evidence'});
  await h.byId('generateCoverLetter').onclick();
  assert.equal(h.byId('coverLetterBody').value,'');
  assert.equal(h.calls.filter(x=>x.type==='ATTACH_COVER_LETTER').length,0);
  // The same page with tracking added to its address (Greenhouse ?gh_src=…, #app) still attaches.
  h=await setup(); await h.byId('generateCoverLetter').onclick();h.setURL('https://example.org/job/1?gh_src=abc#app');
  h.byId('coverLetterBody').value='Reviewed';await h.byId('attachCoverLetter').onclick();
  assert.equal(h.calls.filter(x=>x.type==='ATTACH_COVER_LETTER').length,1,'Tracking parameters are the same page');
  h=await setup(); await h.byId('generateCoverLetter').onclick();h.setURL('https://example.org/job/2');
  await h.byId('attachCoverLetter').onclick();
  assert.match(h.byId('coverLetterState').textContent,/active job page changed/);
  assert.equal(h.calls.filter(x=>x.type==='ATTACH_COVER_LETTER').length,0);
  h=await setup(); await h.byId('generateCoverLetter').onclick();h.setRender(false);
  await h.byId('attachCoverLetter').onclick();
  assert.equal(h.calls.filter(x=>x.type==='ATTACH_COVER_LETTER').length,0);
  // The user's own letter (no generated draft for this page) is rendered as 'own' and attached.
  h=await setup(); h.byId('coverLetterBody').value='My own letter for this job';
  await h.byId('attachCoverLetter').onclick();
  const own=h.calls.find(x=>x.route==='/v1/cover-letter/render');
  assert.equal(own.payload.own,true); assert.equal(own.payload.body,'My own letter for this job');
  assert.equal(h.calls.filter(x=>x.type==='ATTACH_COVER_LETTER').length,1);
  // An empty box with no draft does nothing.
  h=await setup(); await h.byId('attachCoverLetter').onclick();
  assert.equal(h.calls.filter(x=>x.type==='ATTACH_COVER_LETTER').length,0);
  console.log('PASS: generation stays in review; explicit attach uses edited text; ASK_USER, changed URL and invalid render do not upload; own letters attach.');
})().catch(e=>{console.error(e);process.exitCode=1});
