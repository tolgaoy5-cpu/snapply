"""Cover letters in the fill flow: the page reports its cover letter upload area (the panel then offers
"Write it for me"), and an application page without the advert is matched to an advert read earlier
in this browser by its title. Real content scripts in headless Chrome."""
from pathlib import Path
import html, json, re, subprocess, sys, tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).parent.parent
EXT = ROOT / 'extension'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if not Path(CHROME).exists():
    print('chrome not installed, skipped'); sys.exit(0)

AD = ('Care Assistant - Bradford\nAbout the role\nYou will support residents with daily living. Responsibilities include personal care, '
      'medication support and keeping accurate records.\nAbout you\nEssential: experience in care settings, good communication skills, '
      'a caring attitude. Desirable: NVQ Level 2 in Health and Social Care.\n') * 3
recent = [{'url': 'https://www.linkedin.com/jobs/view/1', 'title': 'Care Assistant - Bradford | Mash Care', 'company': 'Mash Care',
           'text': AD, 'captured_at': datetime.now(timezone.utc).isoformat()},
          {'url': 'https://example.com/jobs/2', 'title': 'Senior Accountant', 'company': '', 'text': AD,
           'captured_at': datetime.now(timezone.utc).isoformat()}]
manifest = json.loads((EXT / 'manifest.json').read_text())
scripts = [j for cs in manifest['content_scripts'] if cs.get('world') != 'MAIN' for j in cs['js'] if j != 'inpage_panel.js']
tags = '\n'.join(f'<script src="{(EXT / j).as_uri()}"></script>' for j in scripts)
page = f'''<!doctype html><html><head><meta charset="utf-8"><title>Apply</title><script>
const RECENT={json.dumps(recent)};
window.chrome={{runtime:{{id:'test',onMessage:{{addListener(f){{(window.__l=window.__l||[]).push(f)}}}},sendMessage(){{}},getURL:s=>s}},
storage:{{local:{{get:async k=>k==='recentJobs'?{{recentJobs:RECENT}}:({{}}),set:async()=>{{}},remove:async()=>{{}}}}}}}};</script></head><body>
{(ROOT / 'tests' / 'fixtures' / 'live' / 'cover_letter_slot.html').read_text()}{tags}<pre id="out"></pre><script>
const call=(type,extra)=>new Promise(res=>{{let d=false;for(const l of window.__l)l({{type,...extra}},{{}},v=>{{if(!d){{d=true;res(v)}}}});setTimeout(()=>{{if(!d)res({{timeout:true}})}},4000)}});
(async()=>{{
  const slots=await call('DOCUMENT_SLOTS',{{}});
  const posting=await call('EXTRACT_POSTING',{{}});
  const fmt=await call('COVER_LETTER_UPLOAD_FORMATS',{{expected_url:location.href}});
  document.getElementById('out').textContent=JSON.stringify({{slots:slots.slots,posting:{{posting_url:posting.posting_url,error:posting.error,hasAd:/Responsibilities/.test(posting.text||'')}},fmt}});
}})();
</script></body></html>'''
with tempfile.TemporaryDirectory() as td:
    path = Path(td) / 'harness.html'
    path.write_text(page)
    dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
                          '--virtual-time-budget=8000', '--dump-dom', path.as_uri()], capture_output=True, text=True, timeout=60).stdout
r = json.loads(html.unescape(re.search(r'<pre id="out">(.*?)</pre>', dom, re.S).group(1)))
assert r['slots'] == ['cv', 'cover_letter'], r
assert r['posting'] == {'posting_url': 'https://www.linkedin.com/jobs/view/1', 'error': None, 'hasAd': True} or \
    (r['posting']['posting_url'] == 'https://www.linkedin.com/jobs/view/1' and r['posting']['hasAd']), r
assert r['fmt'].get('ok'), r['fmt']
print('cover letter flow ok')
