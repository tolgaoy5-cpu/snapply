// Matching rules for "ask once, remember, fill next time".
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const sb={};vm.createContext(sb);vm.runInContext(fs.readFileSync(__dirname+'/../extension/question_memory.js','utf8'),sb);
const Q=sb.JobCopilotQuestions;

assert.strictEqual(Q.signature('How long is your current notice period?* Required'),'how long is your current notice period');
assert.strictEqual(Q.signature('  Do you have a National Insurance Number ?*'),'do you have a national insurance number');
// Very long legal questions (TRAC Rehabilitation of Offenders, ~750 chars) get a bounded, stable key.
const longQ='Do you have any criminal convictions and/or cautions that are not protected '+'i.e. eligible for filtering under the Rehabilitation of Offenders Act 1974 '.repeat(20);
assert.ok(Q.signature(longQ).length<=1000);
assert.strictEqual(Q.signature(longQ),Q.signature(longQ+' extra wording at the end'+' x'.repeat(400)));

// Legal and sensitive questions are recognised (they are only reused after confirmation).
assert.strictEqual(Q.sensitivity('It is an offence to apply ... Are you barred from working with children?*'),'legal');
assert.strictEqual(Q.sensitivity('Do you have the right to work in the UK?*'),'legal');
assert.strictEqual(Q.sensitivity('Will you require visa sponsorship?'),'legal');
assert.strictEqual(Q.sensitivity('Please provide your National Insurance Number*'),'sensitive');
assert.strictEqual(Q.sensitivity('What is your ethnicity?'),'sensitive');
assert.strictEqual(Q.sensitivity('Enter the verification code'),'never');
assert.strictEqual(Q.sensitivity('How long is your current notice period?*'),'normal');
// Consents and referees (Witherslack Application Questions 2 of 2, live 2026-10-12).
assert.strictEqual(Q.sensitivity('For Education roles only: as part of keeping children safe in education we apply for your references prior to interview. Please confirm you are happy for us to do so?'),'legal');
assert.strictEqual(Q.sensitivity('I recognise that this request and potentially return, will include my personal data and am happy for it to be transmitted through:'),'legal');
assert.strictEqual(Q.sensitivity('Name of referee 1'),'sensitive');
assert.strictEqual(Q.sensitivity('Name of referee 2 › Email:'),'sensitive');
assert.ok(Q.isContact('Telephone no. (Landline Only)')&&Q.isContact('Address & Postcode')&&Q.isContact('Email:'));
assert.ok(!Q.isContact('How long is your current notice period?'));
// Greenhouse demographic survey (Deliveroo, live 2026-10-12).
for(const l of ['Would you describe yourself as neurodivergent?','What was the occupation of your main household earner when you were aged 14?','Do you identify as transgender?','What is your sexual orientation?','Gender'])assert.strictEqual(Q.sensitivity(l),'sensitive',l);
assert.strictEqual(Q.sensitivity('Have you heard of Deliveroo before starting your job search?'),'normal');
// Workday Voluntary Disclosures (live 2026-10-12).
for(const l of ['What is your date of birth ?','What is your Race/Ethnicity ?','What is your religion','What is your primary nationality ?','What gender do you identify as?','If you consider yourself as having a disability or health condition, please specify below :'])assert.strictEqual(Q.sensitivity(l),'sensitive',l);

const saved=[
  {signature:'how long is your current notice period',question:'How long is your current notice period?*',value:'1 month',kind:'text'},
  {signature:'are you a qualified teacher',question:'Are you a qualified teacher?*',value:'No',kind:'choice'},
  {signature:'what was your most recent salary',question:'What was your most recent salary ?',value:'£24,000',kind:'text'},
];
// Exact wording on another company's form.
assert.strictEqual(Q.findMatch(saved,{label:'How long is your current notice period?',kind:'text'}).item.value,'1 month');
// Close rewording still matches.
assert.strictEqual(Q.findMatch(saved,{label:'What is your current notice period?',kind:'text'})?.item.value,'1 month');
// A different question that shares words must not match.
assert.strictEqual(Q.findMatch(saved,{label:'What salary are you expecting?',kind:'text'}),null);
assert.strictEqual(Q.findMatch(saved,{label:'Are you a qualified nurse?',kind:'choice',options:['Yes','No']}),null);
// Choice answers only reuse when this page offers the same option; kinds must agree.
assert.strictEqual(Q.findMatch(saved,{label:'Are you a qualified teacher?',kind:'choice',options:['Yes','No']}).item.value,'No');
assert.strictEqual(Q.findMatch(saved,{label:'Are you a qualified teacher?',kind:'choice',options:['QTS','Not yet']}),null);
// Seen on TRAC: a yes/no answer saved for one question must not answer a similar-looking one.
{const emp=[{signature:Q.signature('Are you currently an employee of Central and North West London NHS Foundation Trust?'),
  question:'Are you currently an employee of Central and North West London NHS Foundation Trust?',value:'Yes',kind:'choice'}];
 assert.strictEqual(Q.findMatch(emp,{label:"a) Are you related to a member or employee of Central and North West London NHS Foundation Trust?",kind:'choice',options:['Yes','No']}),null);
 assert.strictEqual(Q.findMatch(emp,{label:'Are you currently an employee of Central and North West London NHS Foundation Trust?*',kind:'choice',options:['Yes','No']}).item.value,'Yes');}
assert.strictEqual(Q.findMatch(saved,{label:'Are you a qualified teacher?',kind:'text'}),null);
// Job-specific statements are proposed, never auto-filled (TRAC 'Supporting information', live 2026-10-13).
for(const l of ['Supporting information','Please outline your reasons for applying and include personal qualities','If you have any gaps within your employment history, please state the reasons','Please outline the reason for any gaps in your employment over 1 day','Cover letter'])assert.strictEqual(Q.sensitivity(l),'review',l);
for(const l of ['How long is your current notice period?','If you have any former name(s), please include below.','Please state where you first saw this post advertised'])assert.strictEqual(Q.sensitivity(l),'normal',l);
// TRAC equality monitoring wording (King's College Hospital, live 2026-10-12).
for(const l of ['Which of the following options best describes how you think of yourself?','Please indicate the option which best describes your marital status:','Please indicate your gender','Please indicate your ethnic origin','Please indicate your religion or belief'])assert.strictEqual(Q.sensitivity(l),'sensitive',l);
assert.strictEqual(Q.sensitivity('I agree to the above declaration'),'legal');
assert.strictEqual(Q.sensitivity('Do you have any criminal convictions and/or cautions that are not protected?'),'legal');
// Placeholder options are not answers ("Please select..." with dots or an ellipsis).
const pq=fs.readFileSync(__dirname+'/../extension/page_questions.js','utf8');
const EMPTY=new Function('return '+pq.match(/const EMPTY=(\/.*\/i);/)[1])();
for(const t of ['Please select...','Please select…','Select One','select','Choose...','--'])assert.ok(EMPTY.test(t),t);
for(const t of ['Yes','No','Please select this if you agree'])assert.ok(!EMPTY.test(t),t);
// The deterministic profile filler skips referee/history rows (third-party data).
const content=fs.readFileSync(__dirname+'/../extension/content.js','utf8');
assert.ok(/gmrow\|grrow/.test(content)&&/referee\|reference\|next of kin/.test(content),'fill() must skip referee and history rows');
console.log('Question memory matching regression passed');
// Age is personal data (Lever EEO survey, 2026-10-16).
assert.strictEqual(Q.sensitivity('What age are you?'), 'sensitive');
