"""The in-page panel opens on its own only on job applications: a registration or government form with
name, email and phone (e.g. the ICO fee form) shows just the Snapply tab at the edge."""
from pathlib import Path
import html, json, re, subprocess, sys, tempfile

ROOT = Path(__file__).parent.parent
EXT = ROOT / 'extension'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if not Path(CHROME).exists():
    print('chrome not installed, skipped'); sys.exit(0)

manifest = json.loads((EXT / 'manifest.json').read_text())
scripts = [j for cs in manifest['content_scripts'] if cs.get('world') != 'MAIN' for j in cs['js']]
tags = '\n'.join(f'<script src="{(EXT / j).as_uri()}"></script>' for j in scripts)
FORM = '''<form><label for=a>First name</label><input id=a><label for=b>Last name</label><input id=b>
<label for=c>Email</label><input id=c type=email><label for=d>Phone</label><input id=d></form>'''


def run(title, heading):
    page = f'''<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><script>
const orig=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){{return orig.call(this,{{...o,mode:'open'}})}};
window.chrome={{runtime:{{id:'t',onMessage:{{addListener(){{}}}},sendMessage(){{}},getURL:s=>s}},storage:{{local:{{get:async()=>({{}}),set:async()=>{{}},remove:async()=>{{}}}}}}}};
</script></head><body><h1>{heading}</h1>{FORM}{tags}<pre id="out"></pre><script>
setTimeout(()=>{{const h=document.getElementById('job-copilot-inpage');const r=h&&h.shadowRoot;
document.getElementById('out').textContent=JSON.stringify({{host:!!h,panelOpen:!!(r&&r.querySelector('.panel.open')),tab:!!(r&&r.querySelector('.tab.show'))}})}},3000);
</script></body></html>'''
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / 'h.html'; p.write_text(page)
        dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--virtual-time-budget=6000',
                              '--dump-dom', p.as_uri()], capture_output=True, text=True, timeout=60).stdout
    return json.loads(html.unescape(re.search(r'<pre id="out">(.*?)</pre>', dom, re.S).group(1)))


r = run('Pay the data protection fee', 'New registration')
assert r == {'host': True, 'panelOpen': False, 'tab': True}, r
r = run('Finance Analyst - Apply', 'Apply for this job')
assert r['panelOpen'] is True, r
print('panel auto-open ok')
