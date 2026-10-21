"""Small employer / agency forms (seen live): captions as plain text above inputs, identifier-style
names, a whole-form title that must not become a field's label, select2 helpers, disabled info boxes,
a lone CV upload and secondary phones. Runs the real content scripts in headless Chrome."""
from pathlib import Path
import html, json, re, subprocess, sys, tempfile

ROOT = Path(__file__).parent.parent
EXT = ROOT / 'extension'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if not Path(CHROME).exists():
    print('chrome not installed, skipped'); sys.exit(0)

PROFILE = {'first_name': 'Sam', 'last_name': 'Taylor', 'email': 'sam@example.com', 'phone': '07700 900123',
           'postcode': 'E5 9PB', 'experience': [], 'education': []}
manifest = json.loads((EXT / 'manifest.json').read_text())
scripts = [j for cs in manifest['content_scripts'] if cs.get('world') != 'MAIN' for j in cs['js'] if j != 'inpage_panel.js']
tags = '\n'.join(f'<script src="{(EXT / j).as_uri()}"></script>' for j in scripts)
page = f'''<!doctype html><html><head><meta charset="utf-8"><script>
window.chrome={{runtime:{{id:'test',onMessage:{{addListener(f){{(window.__l=window.__l||[]).push(f)}}}},sendMessage(){{}},getURL:s=>s}},
storage:{{local:{{get:async()=>({{}}),set:async()=>{{}},remove:async()=>{{}}}}}}}};</script></head><body>
{(ROOT / 'tests' / 'fixtures' / 'live' / 'basic_forms.html').read_text()}{tags}<pre id="out"></pre><script>
const call=(type,extra)=>new Promise(res=>{{let d=false;for(const l of window.__l)l({{type,...extra}},{{}},v=>{{if(!d){{d=true;res(v)}}}});setTimeout(()=>{{if(!d)res({{timeout:true}})}},4000)}});
(async()=>{{
  await call('FILL_FORM',{{profile:{json.dumps(PROFILE)}}});
  const cv=await call('ATTACH_SAVED_CV',{{savedCV:{{name:'cv.pdf',type:'application/pdf',base64:btoa('%PDF-1.4 test')}}}});
  const q=await call('PAGE_QUESTIONS',{{}});
  const v=id=>document.getElementById(id).value;
  document.getElementById('out').textContent=JSON.stringify({{cv:cv.ok,cvFiles:document.getElementById('bubble-cv').files.length,
    questions:q.questions.map(x=>x.label),score:window.snapplyFormScore(),
    values:Object.fromEntries(['first-name','last-name','bubble-phone','Email','CandidatePhone_FormattedNumber','HomePhone','Postcode','s2id_autogen2'].map(id=>[id,v(id)]))}});
}})();
</script></body></html>'''
with tempfile.TemporaryDirectory() as td:
    path = Path(td) / 'harness.html'
    path.write_text(page)
    dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
                          '--virtual-time-budget=8000', '--window-size=1200,1600', '--dump-dom', path.as_uri()],
                         capture_output=True, text=True, timeout=60).stdout
r = json.loads(html.unescape(re.search(r'<pre id="out">(.*?)</pre>', dom, re.S).group(1)))
v = r['values']
expected = {'first-name': 'Sam', 'last-name': 'Taylor', 'bubble-phone': '07700 900123', 'Email': 'sam@example.com',
            'CandidatePhone_FormattedNumber': '07700 900123', 'Postcode': 'E5 9PB', 'HomePhone': '', 's2id_autogen2': ''}
for k, want in expected.items():
    assert v[k] == want, (k, v[k], want, r)
assert r['cv'] is True and r['cvFiles'] == 1, r
qs = r['questions']
assert 'Do you have the right to work in the UK?' in qs, qs
assert not any(re.search(r'home phone|s2id|internal candidate|please complete', q, re.I) for q in qs), qs
assert r['score']['known'] >= 6, r['score']
print('basic forms ok')
