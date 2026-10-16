"""AI field map: only form wording is sent, answers are cached per site, unknown keys are rejected;
page reports store structure only."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json, os, sys

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
with TemporaryDirectory() as td:
    os.environ['JOB_COPILOT_DATA_DIR'] = td
    import field_classifier as F
    calls = []
    def model(fields):
        calls.append(fields)
        return {f['sig']: ('postcode' if 'zip' in f['label'].lower() else 'application_source') for f in fields}
    fields = [{'sig': 'input|zipcode||zip / postal', 'label': 'ZIP / Postal', 'tag': 'input', 'value': 'SECRET'},
              {'sig': 'select|src||how did you find this vacancy', 'label': 'How did you find this vacancy', 'options': ['LinkedIn', 'Indeed']}]
    h = F.classify('Jobs.Example.com', fields, model=model)
    assert h == {'input|zipcode||zip / postal': 'postcode', 'select|src||how did you find this vacancy': 'application_source'}
    assert 'value' not in calls[0][0] and 'SECRET' not in json.dumps(calls)  # values never sent
    # Second time (any user): served from the site cache, no model call.
    assert F.classify('jobs.example.com', fields, model=model) == h and len(calls) == 1
    # A model answer outside the allowed keys can never come back.
    def bad(fields): return {fields[0]['sig']: 'password'}
    out = F.classify('other.example', [{'sig': 'x', 'label': 'Weird'}], model=lambda fs: {})
    assert out == {'x': 'question'}
    name = F.save_report('u1', {'capture': {'page': {'url_origin': 'https://jobs.example.com'}, 'fields': []}, 'note': 'phone empty'})
    saved = json.loads((Path(td) / 'reports' / name).read_text())
    assert saved['note'] == 'phone empty' and 'jobs.example.com' in name
print('field classifier ok')
