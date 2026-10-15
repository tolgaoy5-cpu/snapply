"""Free plan: 5 applications a month; every page of one application counts once; Pro is unlimited."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os, sys

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
with TemporaryDirectory() as td:
    os.environ['JOB_COPILOT_DATA_DIR'] = td
    import accounts
    k = accounts.application_key
    wd = 'https://acme.wd3.myworkdayjobs.com/en-US/Careers/job/London/Finance-Manager_JR123'
    assert k(wd + '/apply/applyManually') == k(wd + '/apply') == k(wd + '/apply/autofillWithResume?step=3')
    assert k(wd + '/apply') != k('https://acme.wd3.myworkdayjobs.com/en-US/Careers/job/London/Analyst_JR999/apply')
    assert k('https://job-boards.greenhouse.io/deliveroo/jobs/7012345') == k('https://job-boards.greenhouse.io/deliveroo/jobs/7012345#app')
    assert k('https://boards.greenhouse.io/embed/job_app?gh_jid=1') != k('https://boards.greenhouse.io/embed/job_app?gh_jid=2')
    assert k('https://jobs.lever.co/acme/abc-123/apply') == k('https://jobs.lever.co/acme/abc-123')

    free = accounts.user_id_for('free-user'); accounts.save_account(free, {'email': 'f@example.com', 'plan': 'free'})
    for i in range(5):
        u = accounts.record_application(free, f'https://jobs.lever.co/acme/job-{i}/apply')
        assert u['counted'] and u['applications_used'] == i + 1
    # Revisiting a counted application (another page/step) is free.
    assert not accounts.record_application(free, 'https://jobs.lever.co/acme/job-2')['counted']
    try:
        accounts.record_application(free, 'https://jobs.lever.co/acme/job-6/apply'); raise SystemExit('limit not enforced')
    except accounts.QuotaError as e:
        assert '5 free applications' in str(e)
    assert accounts.public_account(free)['applications_used'] == 5 and accounts.public_account(free)['applications_limit'] == 5

    pro = accounts.user_id_for('pro-user'); accounts.save_account(pro, {'email': 'p@example.com', 'plan': 'pro'})
    for i in range(12):
        accounts.record_application(pro, f'https://jobs.lever.co/acme/job-{i}')
    assert accounts.public_account(pro)['applications_limit'] is None
    # Local mode: nothing is counted.
    assert accounts.record_application(None, 'https://x.example/job')['counted'] is False
print('application quota ok')

# The website may call the API; look-alike origins may not.
from origin_policy import origin_allowed
assert origin_allowed('https://snapply.co.uk') and origin_allowed('https://www.snapply.co.uk')
assert origin_allowed('chrome-extension://' + 'a' * 32) and origin_allowed(None)
for bad in ('https://snapply.co.uk.evil.com', 'http://snapply.co.uk', 'https://evil.com', 'https://xsnapply.co.uk'):
    assert not origin_allowed(bad), bad
print('origin policy ok')

# Cover letters are Pro-only on the hosted service.
td2 = TemporaryDirectory(); os.environ['JOB_COPILOT_DATA_DIR'] = td2.name
free = accounts.user_id_for('free-user'); accounts.save_account(free, {'email': 'f@example.com', 'plan': 'free'})
pro = accounts.user_id_for('pro-user'); accounts.save_account(pro, {'email': 'p@example.com', 'plan': 'pro'})
for i in range(5):
    accounts.record_application(free, f'https://jobs.lever.co/acme/job-{i}/apply')
os.environ.update({'SNAPPLY_MODE': 'cloud', 'SNAPPLY_SECRET': 'x' * 40})
from fastapi.testclient import TestClient
import server
c = TestClient(server.app)
H = lambda uid: {'Authorization': 'Bearer ' + accounts.issue_session(uid)}
r = c.post('/v1/cover-letter/generate', json={'job': {'title': 'Analyst'}}, headers=H(free))
assert r.status_code == 402 and 'Pro' in r.json()['detail'], r.text
r = c.post('/v1/usage/application', json={'url': 'https://jobs.lever.co/acme/job-9/apply'}, headers=H(free))
assert r.status_code == 402
r = c.post('/v1/usage/application', json={'url': 'https://jobs.lever.co/acme/job-99/apply'}, headers=H(pro))
assert r.status_code == 200 and r.json()['applications_limit'] is None
td2.cleanup()
print('pro gates ok')
