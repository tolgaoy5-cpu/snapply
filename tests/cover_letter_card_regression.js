// The "Cover letter · Write it for me" card in Fill this page: shown only when the page has an empty
// cover letter upload, and for a job outside the CV's field it writes from transferable experience
// instead of stopping with an error.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'..','extension/popup.js'),'utf8');
const section = source.slice(source.indexOf('async function renderCoverLetterAsk'), source.indexOf('async function attachReviewedCoverLetter'));
function node(tag,props={},kids=[]){const n={tag,...props,children:[...kids],append(...k){this.children.push(...k)},querySelector(){return null}};return n}
async function setup(slots,generate){
  const cards={children:[],prepend(c){this.children.unshift(c)}};const calls=[];
  const ctx={el:node,byId:id=>id==='cards'?cards:{value:'',textContent:''},
    send:async t=>t==='DOCUMENT_SLOTS'?{details:slots}:{},
    resolveCurrentJob:async()=>({capture:{},job:{requirement_count:5,title:'Care Assistant',url:'https://x/apply'}}),
    chrome:{storage:{local:{set:async()=>{},get:async()=>({})}}},
    window:{JobCopilotAPI:{post:async(route,payload)=>{calls.push(payload);return generate(payload)}}}};
  vm.runInNewContext(section+';this.run=renderCoverLetterAsk;',ctx);
  await ctx.run();
  return {cards,calls};
}
(async()=>{
  // No cover letter area, or one already filled: no card.
  assert.equal((await setup([{category:'cv',filled:false}],()=>({}))).cards.children.length,0);
  assert.equal((await setup([{category:'cover_letter',filled:true}],()=>({}))).cards.children.length,0);
  // Outside the CV's field: one matched attempt, then a transferable letter, shown for review.
  const h=await setup([{category:'cover_letter',filled:false}],p=>p.transferable
    ?{status:'REVIEW',mode:'transferable',body:'Transferable letter',job:{url:'https://x/apply'}}
    :{status:'ASK_USER',reason:'No sufficiently relevant verified CV evidence for this job.',can_draft_transferable:true});
  const card=h.cards.children[0];
  const find=pred=>{const walk=n=>[n,...(n.children||[]).flatMap(walk)];return walk(card).find(pred)};
  await find(n=>n.tag==='button'&&/Write it for me/.test(n.textContent)).onclick();
  assert.deepEqual(h.calls.map(c=>c.transferable),[false,true]);
  const body=find(n=>n.tag==='textarea');
  assert.equal(body.value,'Transferable letter');assert.equal(body.hidden,false);
  assert.match(find(n=>n.tag==='div'&&/transferable/.test(n.textContent||'')).textContent,/outside your CV/);
  console.log('cover letter card ok');
})().catch(e=>{console.error(e);process.exit(1)});
