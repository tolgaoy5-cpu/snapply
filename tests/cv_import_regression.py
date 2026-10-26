"""CV import on CVs laid out in different common ways (made-up people), and the AI reading layer: only
values written in the CV survive, whatever the model returns."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
from cv_import import parse_cv_text, with_ai_structure  # noqa: E402
from cv_ai import structure, to_month_year  # noqa: E402

# 1. Headings and dates as the original importer expected (role, employer on one line; MM/YYYY).
classic = """Alex Morgan
alex.morgan@example.com · 07700 900456 · London
PROFESSIONAL EXPERIENCE
Finance Manager, Harbour Homes Ltd
03/2021 – Present
UK
Led month-end close and budgeting.
Assistant Accountant, Blue Bridge Ltd
06/2017 – 02/2021
UK
Prepared management accounts.
EDUCATION
MSc Finance, University of Bristol
09/2015 – 09/2016
"""
p = parse_cv_text(classic)
assert p['full_name'] == 'Alex Morgan' and p['phone'] == '07700 900456', p
assert [(e['role'], e['employer'], e['dates']) for e in p['experience']] == [
    ('Finance Manager', 'Harbour Homes Ltd', '03/2021-Present'), ('Assistant Accountant', 'Blue Bridge Ltd', '06/2017-02/2021')], p['experience']
assert p['education'][0]['institution'] == 'University of Bristol', p['education']

# 2. "Work Experience" / "Role at Employer" / month names / dates on the heading line / +44 numbers / postcode city.
modern = """Priya Shah
14 Mill Lane, Manchester M1 2AB
+44 7700 900789 | priya.shah@example.com
Profile
Friendly retail supervisor.
Work Experience
Store Supervisor at Fresh Market | Mar 2021 - Present
• Ran a team of eight
Sales Assistant at City Books | Jan 2019 – Feb 2021
• Served customers
Education:
BTEC Business, Manchester College | 2016 - 2018
Skills
Customer service
"""
p = parse_cv_text(modern)
assert p['phone'] == '+44 7700 900789' and p['postcode'] == 'M1 2AB' and p['city'] == 'Manchester', {k: p[k] for k in ('phone', 'postcode', 'city')}
assert p['address'] == '14 Mill Lane' and p['country'] == 'United Kingdom', (p['address'], p['country'])
assert [(e['role'], e['employer'], e['dates']) for e in p['experience']] == [
    ('Store Supervisor', 'Fresh Market', '03/2021-Present'), ('Sales Assistant', 'City Books', '01/2019-02/2021')], p['experience']
assert 'Ran a team of eight' in p['experience'][0]['evidence'], p['experience'][0]
assert p['full_name'] == 'Priya Shah', p['full_name']

# 3. Phone formats people use.
for written in ['07700 900123', '07700-900-123', '+44 (0)20 7946 0000', '020 7946 0000', '07700900123']:
    assert parse_cv_text(f'Sam Lee\n{written}\nsam@example.com\n')['phone'] == written, written

assert parse_cv_text('Sam Lee\nsam@example.com\n7700900123\nLondon, UK\n')['phone'] == '07700900123'
assert to_month_year('March 2021') == '03/2021' and to_month_year('3/2021') == '03/2021' and to_month_year('Current') == 'Present'

# 4. AI reading: invented values are dropped; values copied from the CV are kept.
text = modern


def fake_model(_):
    return {'experience': [
        {'role': 'Store Supervisor', 'employer': 'Fresh Market', 'location': '', 'start': 'Mar 2021', 'end': 'Present',
         'bullets': ['• Ran a team of eight', 'Increased sales by 40%']},
        {'role': 'Head of Retail', 'employer': 'Imaginary Plc', 'location': '', 'start': '2010', 'end': '2012', 'bullets': []}],
        'education': [{'qualification': 'BTEC Business', 'institution': 'Manchester College', 'start': '2016', 'end': '2018', 'grade': 'Distinction'}],
        'certifications': ['First Aid at Work'], 'languages': [{'language': 'Gujarati', 'level': 'Fluent'}], 'skills': ['Customer service', 'Leadership']}


ai = structure(text, model=fake_model)
assert [(e['role'], e['employer'], e['dates']) for e in ai['experience']] == [('Store Supervisor', 'Fresh Market', '03/2021-Present')], ai['experience']
assert ai['experience'][0]['evidence'] == 'Ran a team of eight', ai['experience'][0]
assert ai['education'][0]['grade'] == '' and ai['certifications'] == [] and ai['languages'] == [] and ai['skills'] == ['Customer service'], ai
assert ai['dropped_values'] >= 7, ai['dropped_values']

# The AI reading replaces the rules only when it finds at least as much; a failing model changes nothing.
base = parse_cv_text(text)
merged = with_ai_structure(dict(base), text, model=fake_model)
assert merged['import_meta']['ai_structure'] == 'kept rules (found less)', merged['import_meta']


def broken(_):
    raise RuntimeError('down')


assert with_ai_structure(dict(base), text, model=broken)['experience'] == base['experience']
print('cv import ok')

# A profile from the current importers is never re-read on every request (AI cost, lost edits).
import os, tempfile  # noqa: E402
with tempfile.TemporaryDirectory() as td:
    os.environ['JOB_COPILOT_DATA_DIR'] = td
    os.environ['SNAPPLY_MODE'] = ''
    import server  # noqa: E402
    from state_store import save_cv, set_master_profile  # noqa: E402
    save_cv(b'%PDF-1.4 test', filename='cv.pdf', content_type='application/pdf')
    calls = []
    server.import_cv = lambda path: calls.append(path) or {'full_name': 'Re-read', 'import_meta': {'parser': 'ai-verified-v1'}}
    for parser in ('ai-verified-v1', 'deterministic-v0.26.6'):
        set_master_profile({'full_name': 'Kept', 'import_meta': {'parser': parser}})
        assert server._refresh_profile_from_saved_cv_if_needed()['master_profile']['full_name'] == 'Kept', parser
    assert calls == []
    set_master_profile({'full_name': 'Old', 'import_meta': {'parser': 'deterministic-v0.20'}})
    assert server._refresh_profile_from_saved_cv_if_needed()['master_profile']['full_name'] == 'Re-read' and len(calls) == 1
    # A profile the user changed in "Edit profile" is kept even when its importer is old.
    set_master_profile({'full_name': 'Edited', 'import_meta': {'parser': 'deterministic-v0.20', 'user_edited': True}})
    assert server._refresh_profile_from_saved_cv_if_needed()['master_profile']['full_name'] == 'Edited' and len(calls) == 1
print('profile refresh ok')
