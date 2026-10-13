import json
from pathlib import Path
p=Path(__file__).parent/'fixtures/live/workday-livenation-my-experience.json'
d=json.loads(p.read_text())
assert d['page']['ats']=='WORKDAY'
assert 'My Experience' in d['headings']
assert 'Work Experience' in d['headings']
assert 'Education' in d['headings']
assert len(d.get('add_row_candidates',[]))>=2
print('Workday My Experience fixture regression passed')
