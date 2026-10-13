import json
from pathlib import Path
p=Path(__file__).parent/'fixtures/live/greenhouse-pulse-rehab-assistant.json'
d=json.loads(p.read_text())
assert d['page']['ats']=='GREENHOUSE'
assert d['counts']['fields']==17
labels=[x['label'] for x in d['fields']]
assert any(x.startswith('Country') for x in labels)
assert any(x.startswith('Phone*') for x in labels)
assert any('Date of Birth' in x for x in labels)
assert any('recent NHS experience' in x for x in labels)
# Live fixture proves two React helper-style inputs exist: one empty-label and one duplicate phone context.
helpers=[x for x in d['fields'] if 'requiredInput' in x.get('selector_hint','')]
assert len(helpers)>=2
print('V0.16 live Greenhouse fixture regression passed:', len(d['fields']), 'raw fields,', len(helpers), 'React helper inputs identified')
