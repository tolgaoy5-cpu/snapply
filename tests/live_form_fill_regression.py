"""Runs the extension's real content scripts in headless Chrome against captured live forms.

Skipped (passes) when Google Chrome is not installed. Fixtures contain structure only, no personal data.
"""
from pathlib import Path
import html, json, re, shutil, subprocess, sys, tempfile

ROOT = Path(__file__).parent.parent
EXT = ROOT / 'extension'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if not Path(CHROME).exists():
    print('chrome not installed, skipped'); sys.exit(0)

PROFILE = {'full_name': 'Sam Taylor', 'first_name': 'Sam', 'last_name': 'Taylor', 'email': 'sam@example.com',
           'phone': '07700 900123', 'postcode': 'E5 9PB', 'country': 'United Kingdom', 'city': 'London',
           'experience': [], 'education': []}


def run(fixture: str, extra: str = 'null') -> dict:
    manifest = json.loads((EXT / 'manifest.json').read_text())
    scripts = [j for cs in manifest['content_scripts'] if cs.get('world') != 'MAIN' for j in cs['js'] if j != 'inpage_panel.js']
    tags = '\n'.join(f'<script src="{(EXT / j).as_uri()}"></script>' for j in scripts)
    page = f'''<!doctype html><html><head><meta charset="utf-8"><script>
window.chrome={{runtime:{{id:'test',onMessage:{{addListener(f){{(window.__l=window.__l||[]).push(f)}}}},sendMessage(){{}},getURL:s=>s}},
storage:{{local:{{get:async()=>({{}}),set:async()=>{{}},remove:async()=>{{}}}}}}}};</script></head><body>
{(ROOT / 'tests' / 'fixtures' / 'live' / fixture).read_text()}{tags}<pre id="out"></pre><script>
const call=(type,extra)=>new Promise(res=>{{let d=false;for(const l of window.__l)l({{type,...extra}},{{}},v=>{{if(!d){{d=true;res(v)}}}});setTimeout(()=>{{if(!d)res({{timeout:true}})}},4000)}});
(async()=>{{const fill=await call('FILL_FORM',{{profile:{json.dumps(PROFILE)}}});
const cv=await call('ATTACH_SAVED_CV',{{savedCV:{{name:'cv.pdf',type:'application/pdf',base64:btoa('%PDF-1.4 test')}}}});
const slotInfo=await call('DOCUMENT_SLOTS',{{}});const slots=slotInfo.slots;
const doc=(category,name)=>({{category,name,type:'application/pdf',base64:btoa('%PDF '+name)}});
const extra=await (async()=>{{return {extra}}})();
const docs=await call('ATTACH_DOCUMENTS',{{documents:[doc('qualifications','msc.pdf'),doc('qualifications','bsc.pdf'),doc('membership','bps.pdf'),doc('research','paper.pdf')]}});
document.getElementById('out').textContent=JSON.stringify({{fill,cv,slots,slotInfo,docs,extra,files:Object.fromEntries([...document.querySelectorAll('input[type=file]')].map(e=>[e.id,[...e.files].map(f=>f.name)])),cvFiles:[...document.querySelectorAll('input[type=file]')].map(e=>e.id+':'+e.files.length),ats:window.JobCopilotAdapterRegistry.detect(document,{{hostname:'www.ucl.ac.uk'}}),values:Object.fromEntries([...document.querySelectorAll('input,select,textarea')].map(e=>[e.id,e.value]))}})}})();
</script></body></html>'''
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / 'harness.html'
        path.write_text(page)
        dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
                              '--virtual-time-budget=8000', '--dump-dom', path.as_uri()],
                             capture_output=True, text=True, timeout=60).stdout
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
    return json.loads(html.unescape(m.group(1)))


r = run('ucl_talentlink_form.html')
v = r['values']
expected = {'first_name_1': 'Sam', 'last_name_2': 'Taylor', 'custom_question_402_3': 'Sam', 'e-mail_address_4': 'sam@example.com',
            'phone-number_phone__mobile__5': '07700 900123', 'country-code_phone__mobile__5': 'GB', 'zip_7': 'E5 9PB',
            'country_8': 'country_united_kingdom', 'suboption_country': 'country_united_kingdom_london'}
for k, want in expected.items():
    assert v.get(k) == want, (k, v.get(k), want)
# Legal and job-specific questions are left for the user; the source question is not mistaken for a job title.
assert v['custom_question_406_9'] == '' and v['custom_question_566_24'] == ''
# The optional second phone stays empty (a number without its country code fails the site's validation).
assert v['phone-number_phone__home__6'] == '' and v['country-code_phone__home__6'] == ''
source = [x['key'] for x in r['fill']['results'] if x['label'].startswith('Please tell us where you heard')]
assert source == ['application_source'], source
assert r['ats'] == 'TALENTLINK', r['ats']
# The saved CV goes into the CV slot only, not the other upload areas.
assert r['cv'].get('ok'), r['cv']
# Document library: each saved document goes to the upload area made for it; CV untouched.
assert r['slots'] == ['cv', 'research', 'research', 'qualifications', 'membership', 'other'], r['slots']
f = r['files']
assert f['upload_attached_resume_13'] == ['cv.pdf']
assert [d['label'] for d in r['slotInfo']['details']][2:5] == ['Research Paper 2', 'Qualification Certificates', 'Professional Membership'], r['slotInfo']
assert f['upload_research_paper_1_14'] == ['paper.pdf'] and f['upload_research_paper_2_15'] == []
assert f['upload_qualification_certificates_16'] == ['msc.pdf'] and f['upload_professional_membership_17'] == ['bps.pdf']
assert f['upload_otherattachment_18'] == []
assert any(x.get('names') == ['bsc.pdf'] and not x['ok'] for x in r['docs']['results']), r['docs']
print('live form fill ok (TalentLink)')

# Unfamiliar wording: the rules leave the field alone; with the site's AI field map it is filled.
steps = """await (async()=>{
  const before=Object.fromEntries([...document.querySelectorAll('input')].map(e=>[e.id,e.value]));
  for(const e of document.querySelectorAll('input'))e.value='';
  const unknown=(await call('UNKNOWN_FIELDS',{})).fields;
  const hints={};for(const f of unknown)hints[f.sig]=/zip/i.test(f.label)?'postcode':/shoe/i.test(f.label)?'password':'question';
  await call('FIELD_HINTS',{hints});
  await call('FILL_FORM',{profile:%s});
  return {before,unknown:unknown.map(f=>f.label),after:Object.fromEntries([...document.querySelectorAll('input')].map(e=>[e.id,e.value]))};
})()""" % json.dumps(PROFILE)
u = run('unfamiliar_form.html', steps)['extra']
assert u['before']['f7'] == '' and u['before']['f1'] == 'Sam', u
assert u['unknown'] == ['ZIP / Postal', 'Shoe size'], u['unknown']
assert u['after']['f7'] == 'E5 9PB' and u['after']['f9'] == '', u  # a hint outside the allowed keys is ignored
print('AI field map fill ok')

# ARIA radio/checkbox groups (hidden inputs, role="radio" options): listed with options, marked
# sensitive, and filled by clicking the option.
steps = """await (async()=>{
  const q=(await call('PAGE_QUESTIONS',{})).questions.filter(x=>/^aria:/.test(x.qid));
  const eth=q.find(x=>/ethnic/i.test(x.label)),care=q.find(x=>/caring/i.test(x.label));
  const r1=await call('FILL_QUESTION',{qid:eth.qid,value:'Asian or Asian British'});
  const r2=await call('FILL_QUESTION',{qid:care.qid,value:'Primary carer of a child, Primary carer of an adult'});
  const r3=await call('FILL_QUESTION',{qid:care.qid,value:'No known disability, impairment or learning difference'});
  const after=(await call('PAGE_QUESTIONS',{})).questions.filter(x=>/^aria:/.test(x.qid)).map(x=>[x.label,x.value]);
  return {r3,q:q.map(x=>({label:x.label,options:x.options,sensitivity:x.sensitivity,required:x.required,kind:x.kind})),r1,r2,after};
})()"""
a = run('ucl_talentlink_form.html', steps)['extra']
eth = [x for x in a['q'] if 'ethnic' in x['label']][0]
assert eth['options'] == ['Arab', 'Asian or Asian British', 'I prefer not to say'] and eth['sensitivity'] == 'sensitive' and eth['required'], eth
assert a['r1'].get('ok') and a['r2'].get('ok'), (a['r1'], a['r2'])
assert dict(a['after'])[eth['label']] == 'Asian or Asian British'
# An option whose own text contains commas is one option, not several.
assert a['r3'].get('ok'), a['r3']
assert [v for l, v in a['after'] if 'caring' in l][0] == 'No known disability, impairment or learning difference'
print('ARIA groups ok')

# Workable: a radio group that is both native and ARIA is listed once, under its own question.
steps = """await (async()=>{
  const q=(await call('PAGE_QUESTIONS',{})).questions;
  return {q:q.map(x=>[x.control,x.label,x.options]),slots:(await call('DOCUMENT_SLOTS',{})).details};
})()"""
w = run('workable_form.html', steps)
rtw = [x for x in w['extra']['q'] if 'right to work' in x[1]]
assert len(rtw) == 1 and rtw[0][0] == 'radio' and rtw[0][1].startswith('Do you have the right to work') and rtw[0][2] == ['YES', 'NO'], w['extra']['q']
assert w['extra']['slots'][0]['category'] == 'cv' and 'SVG' not in w['extra']['slots'][0]['label'], w['extra']['slots']
assert w['values']['firstname'] == 'Sam' and w['values']['email'] == 'sam@example.com' and w['values']['phone'] == '07700 900123'
print('Workable form ok')

