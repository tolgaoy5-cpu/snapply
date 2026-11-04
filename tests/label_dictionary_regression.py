"""Label dictionary: the wordings UK application forms use for the same fields, in the markup styles seen live
(label for=, wrapping label, aria-label, placeholder only, caption above, table row). Each must get the right
CV value — and fields about other people, history rows and sensitive data must stay empty.
Runs the real content scripts in headless Chrome.   python3 tests/label_dictionary_regression.py [-v]"""
from pathlib import Path
import html, json, re, subprocess, sys, tempfile

ROOT = Path(__file__).parent.parent
EXT = ROOT / 'extension'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if not Path(CHROME).exists():
    print('chrome not installed, skipped'); sys.exit(0)

P = {'first_name': 'Sam', 'last_name': 'Taylor', 'email': 'sam@example.com', 'phone': '07700 900123',
     'address': '12 Example Road', 'address_line2': 'Flat 3', 'city': 'London', 'region': 'Greater London',
     'postcode': 'E5 9PB', 'country': 'United Kingdom', 'linkedin': 'https://www.linkedin.com/in/samtaylor',
     'website': 'https://samtaylor.dev', 'github': 'https://github.com/samtaylor',
     'experience': [{'role': 'Operations Manager', 'employer': 'Acme Lettings', 'dates': '03/2021-Present'},
                    {'role': 'Lettings Negotiator', 'employer': 'Old Estates', 'dates': '01/2018-02/2021'}],
     'education': [{'degree': 'BSc Business Management', 'institution': 'University of Leeds', 'dates': '2014-2017'}]}
FULL_ADDR = '12 Example Road, Flat 3, London, E5 9PB'

# (label, expected value; '' = must stay empty)
CASES = [
    ('First name', 'Sam'), ('First Name *', 'Sam'), ('Forename(s)', 'Sam'), ('Forename', 'Sam'), ('Given name', 'Sam'),
    ('Legal first name', 'Sam'), ('Preferred name', 'Sam'), ('First name (required)', 'Sam'),
    ('Last name', 'Taylor'), ('Surname', 'Taylor'), ('Family name', 'Taylor'), ('Last Name *', 'Taylor'), ('Legal last name', 'Taylor'),
    ('Full name', 'Sam Taylor'), ('Your name', 'Sam Taylor'), ('Name', 'Sam Taylor'), ('Full legal name', 'Sam Taylor'),
    ('Email', 'sam@example.com'), ('Email address', 'sam@example.com'), ('E-mail', 'sam@example.com'),
    ('Your email', 'sam@example.com'), ('Email Address *', 'sam@example.com'), ('Confirm email address', 'sam@example.com'),
    ('Phone', '07700 900123'), ('Phone number', '07700 900123'), ('Mobile', '07700 900123'), ('Mobile number', '07700 900123'),
    ('Mobile phone number', '07700 900123'), ('Telephone', '07700 900123'), ('Telephone number', '07700 900123'),
    ('Contact number', '07700 900123'), ('Daytime telephone number', '07700 900123'), ('Mobile telephone', '07700 900123'),
    ('Address line 1', '12 Example Road'), ('Street address', '12 Example Road'), ('Address line 2', 'Flat 3'),
    ('Address', FULL_ADDR), ('Home address', FULL_ADDR),
    ('Town', 'London'), ('City', 'London'), ('Town / city', 'London'), ('Town/City', 'London'), ('County', 'Greater London'),
    ('Postcode', 'E5 9PB'), ('Post code', 'E5 9PB'), ('Postal code', 'E5 9PB'), ('Post Code *', 'E5 9PB'),
    ('LinkedIn profile', 'https://www.linkedin.com/in/samtaylor'), ('LinkedIn URL', 'https://www.linkedin.com/in/samtaylor'),
    ('Portfolio', 'https://samtaylor.dev'), ('Personal website', 'https://samtaylor.dev'), ('GitHub', 'https://github.com/samtaylor'),
    ('Current job title', 'Operations Manager'), ('Current employer', 'Acme Lettings'), ('Current company', 'Acme Lettings'),
    ('Most recent employer', 'Acme Lettings'), ('Present employer', 'Acme Lettings'), ('Current role', 'Operations Manager'),
    ('Current position', 'Operations Manager'), ('Name of current employer', 'Acme Lettings'), ('Current or most recent job title', 'Operations Manager'),
    ('Surname (family name)', 'Taylor'), ('First and last name', 'Sam Taylor'), ('Applicant name', 'Sam Taylor'),
    ('Email (we will contact you here)', 'sam@example.com'), ('Personal email', 'sam@example.com'),
    ('Mobile / cell phone', '07700 900123'), ('Mobile no.', '07700 900123'), ('Tel', '07700 900123'), ('Phone (mobile)', '07700 900123'),
    ('Address 1', '12 Example Road'), ('Address 2', 'Flat 3'), ('City / Town', 'London'), ('Post code / ZIP', 'E5 9PB'),
    ('Current location', 'London, United Kingdom'), ('Where are you based?', 'London, United Kingdom'),
    ('LinkedIn profile URL (optional)', 'https://www.linkedin.com/in/samtaylor'),
    ('What is your current job title?', 'Operations Manager'), ('Who is your current employer?', 'Acme Lettings'),
    ('Current employer name', 'Acme Lettings'), ('Job title (current)', 'Operations Manager'),
    # About other people, other jobs, or sensitive: never filled.
    ("Referee's job title", ''), ('Referee organisation', ''), ('Employer postcode', ''), ('Previous employer address', ''),
    ('Employer address', ''), ("Employer's telephone number", ''), ('Employer email', ''), ('Referee name', ''),
    ('Referee email address', ''), ('Referee telephone', ''), ('Emergency contact name', ''), ('Emergency contact phone number', ''),
    ('Next of kin', ''), ('Previous employer', ''), ('Previous job title', ''), ("Manager's name", ''), ('Date of birth', ''),
    ('National Insurance number', ''), ('Password', ''), ('Confirm password', ''), ('Home phone', ''),
]
STYLES = ['for', 'wrap', 'aria', 'placeholder', 'above', 'table']


def field(i, label, style):
    fid = f'f{i}'
    typ = 'password' if 'password' in label.lower() else 'text'
    inp = lambda extra='': f'<input type="{typ}" id="{fid}" name="q{i}" {extra} autocomplete="off">'
    esc = html.escape(label)
    if style == 'for':
        return f'<div class="row"><label for="{fid}">{esc}</label>{inp()}</div>'
    if style == 'wrap':
        return f'<div class="row"><label>{esc} {inp()}</label></div>'
    if style == 'aria':
        return f'<div class="row">{inp(f"aria-label=\"{esc}\"")}</div>'
    if style == 'placeholder':
        return f'<div class="row">{inp(f"placeholder=\"{esc}\"")}</div>'
    if style == 'above':
        return f'<div class="row"><div class="caption">{esc}</div>{inp()}</div>'
    return f'<table><tr><td class="lbl">{esc}</td><td>{inp()}</td></tr></table>'


def build(style):
    body = '<form>' + ''.join(field(i, lab, style) for i, (lab, _) in enumerate(CASES)) + '</form>'
    manifest = json.loads((EXT / 'manifest.json').read_text())
    scripts = [j for cs in manifest['content_scripts'] if cs.get('world') != 'MAIN' for j in cs['js'] if j != 'inpage_panel.js']
    tags = '\n'.join(f'<script src="{(EXT / j).as_uri()}"></script>' for j in scripts)
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>Apply</title><script>
window.chrome={{runtime:{{id:'test',onMessage:{{addListener(f){{(window.__l=window.__l||[]).push(f)}}}},sendMessage(){{}},getURL:s=>s}},
storage:{{local:{{get:async()=>({{}}),set:async()=>{{}},remove:async()=>{{}}}}}}}};</script>
<style>.row{{margin:6px}} input{{width:300px}}</style></head><body><h1>Job application</h1>{body}{tags}<pre id="out"></pre><script>
const call=(type,extra)=>new Promise(res=>{{let d=false;for(const l of window.__l)l({{type,...extra}},{{}},v=>{{if(!d){{d=true;res(v)}}}});setTimeout(()=>{{if(!d)res({{timeout:true}})}},6000)}});
(async()=>{{await call('FILL_FORM',{{profile:{json.dumps(P)}}});
document.getElementById('out').textContent=JSON.stringify([...document.querySelectorAll('input')].map(i=>i.value))}})();
</script></body></html>'''


def run(page):
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / 'harness.html'
        path.write_text(page)
        dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
                              '--virtual-time-budget=10000', '--window-size=1200,4000', '--dump-dom', path.as_uri()],
                             capture_output=True, text=True, timeout=90).stdout
    return json.loads(html.unescape(re.search(r'<pre id="out">(.*?)</pre>', dom, re.S).group(1)))


failures = []
for style in STYLES:
    got = run(build(style))
    for (label, want), value in zip(CASES, got):
        if value != want:
            failures.append(f'{style:11} {label!r}: got {value!r}, want {want!r}')
total = len(CASES) * len(STYLES)
if '-v' in sys.argv or failures:
    print('\n'.join(failures))
print(f'label dictionary: {total - len(failures)}/{total} correct')
assert not failures
