// The Web Store review request: shown after the 5th fill that filled at least 3 fields, never again after
// "Leave a review", and "Not now" postpones it by 15 more good fills.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'..','extension/popup.js'),'utf8');
const section = source.slice(source.indexOf("const REVIEW_URL"), source.indexOf("byId('reviewYes')"));
(async()=>{
  const store={};const box={hidden:true};const opened=[];
  const ctx={byId:id=>id==='reviewAsk'?box:null,
    chrome:{storage:{local:{get:async k=>({[k]:store[k]}),set:async o=>Object.assign(store,o)}},tabs:{create:o=>opened.push(o.url)}}};
  vm.runInNewContext(section+';this.ask=maybeAskForReview;this.answer=answerReview;',ctx);
  await ctx.ask(1);assert.equal(store.reviewAsk,undefined);           // a poor fill does not count
  for(let i=0;i<4;i++)await ctx.ask(5);assert.equal(box.hidden,true);
  await ctx.ask(5);assert.equal(box.hidden,false);                     // 5th good fill
  await ctx.answer(false);assert.equal(box.hidden,true);assert.equal(store.reviewAsk.next,20);
  for(let i=0;i<14;i++)await ctx.ask(4);assert.equal(box.hidden,true);
  await ctx.ask(4);assert.equal(box.hidden,false);                     // 20th good fill
  await ctx.answer(true);assert.match(opened[0],/chromewebstore\.google\.com\/detail\/snapply\/.*\/reviews$/);
  await ctx.ask(9);assert.equal(box.hidden,true);                      // never again
  console.log('review prompt ok');
})().catch(e=>{console.error(e);process.exit(1)});
