// Profile field rules must match whole words: "ethnicity" contains "city" (Deliveroo/Greenhouse, live 2026-10-12).
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../extension/content.js','utf8');
const start=src.indexOf('const FIELD_RULES=');const end=src.indexOf('];',start)+2;
const FIELD_RULES=new Function(src.slice(start,end)+';return FIELD_RULES')();
const key=t=>(FIELD_RULES.find(r=>r.re.test(t))||{}).key;
assert.notStrictEqual(key('How would your describe your ethnicity?*'),'city');
assert.notStrictEqual(key('Electricity supplier preference'),'city');
assert.strictEqual(key('City or Town*'),'city');
assert.strictEqual(key('Location (City)*'),'city');
assert.notStrictEqual(key('Do you have a controller licence?'),'job_title');
assert.strictEqual(key('Job Title*'),'job_title');
assert.strictEqual(key('Current role'),'job_title');
console.log('Field rule whole-word regression passed');
