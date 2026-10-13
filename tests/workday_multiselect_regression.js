// Workday multiselect prompts keep the search <input> empty after a choice; the chosen value is a
// selectedItem pill inside multiSelectContainer. Structure observed live on Witherslack Workday, 2026-10-09.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../extension/workday_adapter.js','utf8');

function node(aid,text='',children=[]){
  const n={aid,innerText:text,children,parentElement:null,value:''};
  children.forEach(c=>c.parentElement=n);
  n.getAttribute=k=>k==='data-automation-id'?n.aid:null;
  n.closest=sel=>{const m=/data-automation-id="([^"]+)"/.exec(sel);for(let p=n;p;p=p.parentElement)if(m&&p.aid===m[1])return p;return null};
  n.querySelectorAll=sel=>{const m=/data-automation-id="([^"]+)"/.exec(sel),out=[];(function walk(x){x.children.forEach(c=>{if(m&&c.aid===m[1])out.push(c);walk(c)})})(n);return out};
  return n;
}
function multiselect(selected){
  const input=node(null);
  const pills=selected.map(t=>node('selectedItem',t));
  node('multiSelectContainer','',[node('multiselectInputContainer','',[input]),node('selectedItemList',selected.join(' '),pills)]);
  return input;
}

const sandbox={window:{},location:{hostname:'witherslackgroup.wd3.myworkdayjobs.com'},document:{querySelectorAll:()=>[]},CSS:{escape:s=>s},getComputedStyle:()=>({})};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const wd=sandbox.window.JobCopilotWorkday;

assert.deepStrictEqual([...wd.multiselectSelection(multiselect(['Instagram']))],['Instagram']);
assert.deepStrictEqual([...wd.multiselectSelection(multiselect(['United Kingdom (+44)']))],['United Kingdom (+44)']);
assert.strictEqual(wd.multiselectSelection(multiselect([])).length,0,'empty prompt must stay incomplete');
assert.strictEqual(wd.multiselectSelection(multiselect(['  '])).length,0,'blank pill must not count');
assert.strictEqual(wd.multiselectSelection(node(null)).length,0,'plain input outside a multiselect is unaffected');
assert.strictEqual(wd.multiselectSelection(null).length,0);
console.log('Workday multiselect completion regression passed');

// Active step comes from the progress bar; every step label is always visible, so body text cannot decide it.
function stepFor(barText){
  const s={window:{},location:{hostname:'x.wd3.myworkdayjobs.com'},CSS:{escape:x=>x},getComputedStyle:()=>({}),
    document:{querySelectorAll:()=>[],querySelector:sel=>barText!=null&&/progressBarActiveStep/.test(sel)?{innerText:barText}:null}};
  vm.createContext(s);vm.runInContext(code,s);return s.window.JobCopilotWorkday.currentStep();
}
assert.strictEqual(stepFor('current step 2 of 6\nMy Experience'),'my experience');
assert.strictEqual(stepFor('current step 1 of 6\nMy Information'),'my information');
assert.strictEqual(stepFor(null),'','no progress bar -> unknown step');
console.log('Workday active-step detection regression passed');
