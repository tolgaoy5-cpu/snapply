// TRAC referees: capture rows generically, fill only empty rows, add rows with TRAC's Add button,
// never overwrite existing content. Field ids as seen live on King's College Hospital TRAC (2026-10-12).
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../extension/trac_adapter.js','utf8');
const REF='EditAppFieldset.ref.grrow_';
const els=new Map();
class El{
  constructor(tag,id,type=''){this.tagName=tag;this.id=id;this.type=type;this.value='';this.checked=false;this.options=[];this.maxLength=-1;els.set(id,this)}
  getAttribute(){return null}
  matches(sel){return sel.split(',').some(s=>s.trim().toLowerCase()===this.tagName.toLowerCase())}
  dispatchEvent(){} focus(){} blur(){} click(){if(this.onclick)this.onclick()}
  get selectedOptions(){return this.options.filter(o=>o.value===this.value)}
}
function select(id,texts){const e=new El('SELECT',id);e.options=[{text:'Please select...',value:''},...texts.map((t,i)=>({text:t,value:'v'+i}))];return e}
function row(i){new El('INPUT',`${REF}${i}.first-name`,'text');new El('INPUT',`${REF}${i}.surname`,'text');new El('INPUT',`${REF}${i}.orgname`,'text');
  select(`${REF}${i}.relationship`,['Employer / Line Manager','Course Tutor']);new El('INPUT',`${REF}${i}.email`,'email');new El('INPUT',`${REF}${i}.AddressLookup.lookup`,'text')}
row(0);
const add=new El('BUTTON','EditAppFieldset.ref.AddButton','button');add.onclick=()=>row(Math.max(...[...els.keys()].filter(k=>k.startsWith(REF)).map(k=>Number(k.slice(REF.length).split('.')[0])))+1);
new El('DIV','EditAppFieldset');
const document={
  getElementById:id=>els.get(id)||null,
  querySelectorAll(sel){
    const m=sel.match(/\[id\^="([^"]+)"\]/);
    if(m)return [...els.values()].filter(e=>e.id.startsWith(m[1]));
    if(/#EditAppFieldset button/.test(sel))return [...els.values()].filter(e=>e.tagName==='BUTTON');
    return [];
  },
  querySelector:()=>null,
};
const sb={window:{},document,CSS:{escape:x=>x},location:{hostname:'apps.trac.jobs',pathname:'/application/1'},setTimeout,Event:class{constructor(t){this.type=t}}};
vm.createContext(sb);vm.runInContext(code,sb);
const T=sb.window.JobCopilotTrac;

(async()=>{
  assert.ok(T.isReferences());
  // Capture skips empty rows and the address lookup helper; selects are stored by option text.
  els.get(`${REF}0.first-name`).value='Jane';els.get(`${REF}0.surname`).value='Doe';els.get(`${REF}0.orgname`).value='Example School';
  els.get(`${REF}0.relationship`).value='v1';
  const c=T.captureReferees();
  assert.strictEqual(c.referees.length,1);
  assert.deepStrictEqual({...c.referees[0].fields},{'first-name':'Jane',surname:'Doe',orgname:'Example School',relationship:'Course Tutor'});
  assert.ok(!('AddressLookup.lookup' in c.referees[0].fields));
  // Fill: row 0 is taken, so two new rows are added and filled; existing content is never overwritten.
  const saved=[{label:'A',fields:{'first-name':'Amy',surname:'Ash',relationship:'Employer / Line Manager',email:'amy@example.test'}},
               {label:'B',fields:{'first-name':'Ben',surname:'Bell',relationship:'Not an option'}}];
  const r=await T.fillReferees(saved);
  assert.ok(r.ok,r.reason);
  assert.strictEqual(r.rows.length,2);
  assert.strictEqual(els.get(`${REF}0.first-name`).value,'Jane','existing referee untouched');
  assert.strictEqual(els.get(`${REF}1.first-name`).value,'Amy');
  assert.strictEqual(els.get(`${REF}1.relationship`).value,'v0');
  assert.strictEqual(els.get(`${REF}2.surname`).value,'Bell');
  assert.deepStrictEqual([...r.rows[1].missing],['relationship'],'unknown option is reported, not invented');
  // The panel form mirrors row fields and the site's own list options (placeholder excluded).
  const form=T.refereeForm();
  assert.ok(form.ok);
  const rel=form.fields.find(f=>f.key==='relationship');
  assert.deepStrictEqual([...rel.options],['Employer / Line Manager','Course Tutor']);
  assert.ok(!form.fields.some(f=>/AddressLookup/.test(f.key)));
  console.log('TRAC referees capture/fill regression passed');
})().catch(e=>{console.error(e);process.exit(1)});
