// "Current job title" / "Current employer" single boxes take the CV's current job; other job boxes
// (history rows, "Previous employer") stay untouched.
const assert=require('assert');const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../extension/content.js','utf8');
const fn=src.match(/function currentJobValue\(key,label,profile\)\{[\s\S]*?\n\}/)[0];
const currentJobValue=new Function(fn+';return currentJobValue')();
const p={experience:[{role:'Senior Analyst',employer:'Old Co',dates:'01/2018-02/2021'},{role:'Operations Manager',employer:'Acme Lettings',dates:'03/2021-Present'}]};
assert.strictEqual(currentJobValue('job_title','Current job title',p),'Operations Manager');
assert.strictEqual(currentJobValue('employer','Current employer *',p),'Acme Lettings');
assert.strictEqual(currentJobValue('employer','Most recent employer',{experience:[{role:'A',employer:'First Co',dates:'2019-2022'}]}),'First Co');
assert.strictEqual(currentJobValue('employer','Employer',p),undefined);
assert.strictEqual(currentJobValue('employer','Previous employer',p),undefined);
assert.strictEqual(currentJobValue('email','Current email',p),undefined);
assert.ok(/simple\[key\]\?\?currentJobValue\(key,label,profile\)/.test(src)&&/simple\[f\.canonical\]\?\?currentJobValue/.test(src),'used by both the plan and the fill');
console.log('current job fields regression passed');
