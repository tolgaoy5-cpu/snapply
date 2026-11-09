"""Trying Snapply without an account: a guest session can import a CV and fill ONE application; the second
asks to sign in. Signing in with Google keeps the guest's CV, profile and usage; old guests are deleted;
guests never get emails and are not listed as customers; guest sessions are rate limited per address."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import json, os, sys

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
with TemporaryDirectory() as td:
    os.environ.update({'JOB_COPILOT_DATA_DIR': td, 'SNAPPLY_SECRET': 'x' * 40, 'SNAPPLY_MODE': 'cloud'})
    import accounts, server, rate_limit, mailer, admin
    from fastapi.testclient import TestClient
    c = TestClient(server.app)
    rate_limit.reset()

    # 1. Guest session without any sign-in (public route)
    r = c.post('/v1/auth/guest')
    assert r.status_code == 200, r.text
    token = r.json()['session']
    acct = r.json()['account']
    assert acct['guest'] is True and acct['plan'] == 'guest' and acct['applications_limit'] == 1
    h = {'Authorization': 'Bearer ' + token}
    guest_uid = accounts.verify_session(token)

    # 2. One application is allowed (all its pages count once), a second one is not
    assert c.post('/v1/usage/application', json={'url': 'https://acme.wd3.myworkdayjobs.com/en-GB/Ext/job/London/Analyst_R1/apply'}, headers=h).status_code == 200
    assert c.post('/v1/usage/application', json={'url': 'https://acme.wd3.myworkdayjobs.com/en-GB/Ext/job/London/Analyst_R1/apply/applyManually'}, headers=h).status_code == 200
    r = c.post('/v1/usage/application', json={'url': 'https://boards.greenhouse.io/other/jobs/123'}, headers=h)
    assert r.status_code == 402 and 'Sign in with Google' in r.json()['detail'], r.text

    # 3. One AI draft at most
    accounts.consume_ai(guest_uid)
    try:
        accounts.consume_ai(guest_uid); raise AssertionError('second AI draft allowed for a guest')
    except accounts.QuotaError as e:
        assert 'Sign in with Google' in str(e)

    # 4. Guest's CV and profile (stand-ins) move into the Google account on sign-in; usage carries over
    gdir = accounts.user_dir(guest_uid)
    (gdir / 'saved_cv.bin').write_bytes(b'%PDF fake cv')
    (gdir / 'state.json').write_text(json.dumps({'master_profile': {'full_name': 'Sam Taylor'}}))
    session, real = accounts.sign_in({'sub': 'g-1', 'email': 'sam@example.com', 'name': 'Sam'}, guest_session=token)
    uid = accounts.user_id_for('g-1')
    assert (accounts.user_dir(uid) / 'saved_cv.bin').read_bytes() == b'%PDF fake cv'
    assert json.loads((accounts.user_dir(uid) / 'state.json').read_text())['master_profile']['full_name'] == 'Sam Taylor'
    assert real['plan'] == 'free' and real['guest'] is False and real['applications_used'] == 1 and real['applications_limit'] == 5
    assert not gdir.exists(), 'guest data left behind after sign-in'

    # 5. An existing account that already has a CV keeps its own data
    t2 = c.post('/v1/auth/guest').json()['session']
    g2uid = accounts.verify_session(t2)
    (accounts.user_dir(g2uid) / 'saved_cv.bin').write_bytes(b'other cv')
    accounts.sign_in({'sub': 'g-1', 'email': 'sam@example.com', 'name': 'Sam'}, guest_session=t2)
    assert (accounts.user_dir(uid) / 'saved_cv.bin').read_bytes() == b'%PDF fake cv'
    # A real account's session can never be "merged" as if it were a guest
    assert accounts.merge_guest(uid, accounts.user_id_for('nobody')) is False

    # 6. Guests: no reminder emails, not listed as customers, deleted after 30 days
    t3 = c.post('/v1/auth/guest').json()['session']
    g3 = accounts.verify_session(t3)
    a3 = accounts.load_account(g3)
    assert not mailer.due_for_reminder(g3, a3, datetime.now(timezone.utc) + timedelta(days=1))
    assert all(not a.get('guest') for _, a in admin._all_accounts())
    a3['created_at'] = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    accounts.save_account(g3, a3)
    assert accounts.purge_guests() >= 1 and not accounts.user_dir(g3).exists()
    assert accounts.user_dir(uid).exists(), 'purge removed a real account'

    # 7. At most 5 guest sessions per address per day
    rate_limit.reset()
    codes = [c.post('/v1/auth/guest', headers={'fly-client-ip': '203.0.113.9'}).status_code for _ in range(6)]
    assert codes[:5] == [200] * 5 and codes[5] == 429, codes
print('guest trial regression passed')
