// TRAC's grouped education layout (seen at CNWL, 2026-10): a place of study per row (grrow_N.place) with its
// own subject rows added by "Add subject" (grrow_N.details.gmrow_M.subject/grade/date). Two degrees from the
// same university go under one place; another university gets a new place row via "Add another place of study".
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync(__dirname+'/../extension/trac_adapter.js','utf8');
const els=new Map();
const input=id=>{const e={id,value:'',maxLength:150,focus(){},blur(){},dispatchEvent(){}};els.set(id,e);return e};
const P=i=>`EditAppFieldset.education.grrow_${i}`;
function addPlace(i){input(`${P(i)}.place`);els.set(`${P(i)}.details.AddButton`,{click(){const m=[...els.keys()].filter(k=>k.startsWith(`${P(i)}.details.gmrow_`)&&k.endsWith('.subject')).length;for(const k of ['subject','grade','date'])input(`${P(i)}.details.gmrow_${m}.${k}`)}});
  els.set(`${P(i)}.GRAddAfter`,{click(){addPlace(i+1)}})}
addPlace(0);els.set('EditAppFieldset',{});
const document={getElementById:id=>els.get(id)||null,querySelectorAll(sel){
  const [,pre,suf]=sel.match(/\[id\^="([^"]+)"\]\[id\$="([^"]+)"\]/);return [...els.values()].filter(e=>e.id?.startsWith(pre)&&e.id.endsWith(suf))}};
const sandbox={window:{},document,location:{hostname:'apps.trac.jobs',pathname:'/application/1'},setTimeout,console,Event:class{constructor(t){this.type=t}}};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const T=sandbox.window.JobCopilotTrac;
(async()=>{
  assert.equal(T.isEducation(),true);
  const r=await T.fillEducation({education:[
    {degree:'BA (Hons) Business Management',institution:'University of Leeds',dates:'2015 - 2018',grade:'2:1'},
    {degree:'MSc Finance',institution:'University of Leeds',dates:'2018 - 2019'},
    {degree:'A levels',institution:'Hackney Sixth Form',dates:'2013 - 2015'}]});
  assert.equal(r.ok,true,JSON.stringify(r));
  const v=id=>els.get(id)?.value;
  assert.equal(v(`${P(0)}.place`),'University of Leeds');
  assert.equal(v(`${P(0)}.details.gmrow_0.subject`),'BA (Hons) Business Management');
  assert.equal(v(`${P(0)}.details.gmrow_0.grade`),'2:1');
  assert.equal(v(`${P(0)}.details.gmrow_0.date`),'2018');
  assert.equal(v(`${P(0)}.details.gmrow_1.subject`),'MSc Finance');
  assert.equal(v(`${P(1)}.place`),'Hackney Sixth Form');
  assert.equal(v(`${P(1)}.details.gmrow_0.subject`),'A levels');
  console.log('TRAC grouped education ok');
})().catch(e=>{console.error(e);process.exit(1)});
