"""Fill animation: during FILL_FX on/off the toast counts only fields Snapply changed, never the
user's own typing, and ends with the filled total. Skipped (passes) when Chrome is not installed."""
from pathlib import Path
import html, json, re, subprocess, sys, tempfile

ROOT = Path(__file__).parent.parent
EXT = ROOT / 'extension'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if not Path(CHROME).exists():
    print('chrome not installed, skipped'); sys.exit(0)

PROFILE = {'full_name': 'Sam Taylor', 'first_name': 'Sam', 'last_name': 'Taylor', 'email': 'sam@example.com',
           'phone': '07700 900123', 'postcode': 'E5 9PB', 'country': 'United Kingdom', 'city': 'London',
           'experience': [], 'education': []}
manifest = json.loads((EXT / 'manifest.json').read_text())
scripts = [j for cs in manifest['content_scripts'] if cs.get('world') != 'MAIN' for j in cs['js'] if j != 'inpage_panel.js']
assert 'fill_fx.js' in scripts
tags = '\n'.join(f'<script src="{(EXT / j).as_uri()}"></script>' for j in scripts)
page = f'''<!doctype html><html><head><meta charset="utf-8"><script>
window.chrome={{runtime:{{id:'test',onMessage:{{addListener(f){{(window.__l=window.__l||[]).push(f)}}}},sendMessage(){{}},getURL:s=>s}},
storage:{{local:{{get:async()=>({{}}),set:async()=>{{}},remove:async()=>{{}}}}}}}};</script></head><body>
{(ROOT / 'tests' / 'fixtures' / 'live' / 'ucl_talentlink_form.html').read_text()}{tags}<pre id="out"></pre><script>
const call=(type,extra)=>new Promise(res=>{{let d=false;for(const l of window.__l)l({{type,...extra}},{{}},v=>{{if(!d){{d=true;res(v)}}}});setTimeout(()=>{{if(!d)res({{timeout:true}})}},4000)}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const msg=()=>document.getElementById('snapply-fill-toast')?.shadowRoot.querySelector('.msg').textContent||'';
(async()=>{{
  // Typing by the user before the fill is not counted.
  const typed=document.querySelector('input[type=text]');typed.dispatchEvent(new Event('input',{{bubbles:true}}));
  await call('FILL_FX',{{on:true}});const startMsg=msg();
  const fill=await call('FILL_FORM',{{profile:{json.dumps(PROFILE)}}});
  const filled=fill.results.filter(x=>x.filled).length;const during=msg();
  const glowing=document.querySelectorAll('[data-snapply-fx]').length;
  await call('FILL_FX',{{on:false}});await wait(600);
  document.getElementById('out').textContent=JSON.stringify({{startMsg,during,end:msg(),filled,glowing}});
}})();
</script></body></html>'''
with tempfile.TemporaryDirectory() as td:
    path = Path(td) / 'harness.html'
    path.write_text(page)
    dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
                          '--virtual-time-budget=8000', '--dump-dom', path.as_uri()],
                         capture_output=True, text=True, timeout=60).stdout
r = json.loads(html.unescape(re.search(r'<pre id="out">(.*?)</pre>', dom, re.S).group(1)))
print(r)
assert r['startMsg'].startswith('Filling… 0/'), r
assert r['filled'] >= 5 and r['glowing'] >= 1, r
count = int(re.match(r'Filling… (\d+)', r['during']).group(1))
assert count >= r['filled'], r  # selects/radios filled by the same pass also count
assert r['end'] == f'✓ {count} fields filled', r
print('fill fx ok')
