import json,re
from pathlib import Path
fixture=Path(__file__).parent/'fixtures/live/greenhouse-country-phone-real.json'
d=json.loads(fixture.read_text())
country=next(f for f in d['fields'] if f.get('selector_hint')=='#country')
phone=next(f for f in d['fields'] if f.get('selector_hint')=='#phone')
# This fixture is the real failure case: the Country label contains nearby Phone text.
assert 'Country' in country['label'] and 'Phone' in country['label']
assert country['selector_hint']=='#country'
assert phone['selector_hint']=='#phone'
# Current content script must explicitly prioritize stable DOM id/name semantics.
js=(Path(__file__).parent.parent/'extension/content.js').read_text()
assert "if(id==='country'||name==='country'" in js
assert "canonical:canonical(label,el)" in js
print('Current Greenhouse semantic regression passed')
