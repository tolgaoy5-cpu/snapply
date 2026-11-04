"""Tips/news emails only go to people who ticked the box (UK PECR opt-in), with the time and source kept,
and every email's unsubscribe link works without signing in."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os, sys

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
with TemporaryDirectory() as td:
    os.environ.update({'JOB_COPILOT_DATA_DIR': td, 'SNAPPLY_SECRET': 'x' * 40, 'SNAPPLY_MODE': 'cloud'})
    import accounts, server
    from fastapi.testclient import TestClient
    c = TestClient(server.app)
    accounts.sign_in({'sub': 'm1', 'email': 'a@example.com', 'name': 'A'})
    uid = accounts.user_id_for('m1')
    h = {'Authorization': 'Bearer ' + accounts.issue_session(uid)}
    assert c.get('/v1/me', headers=h).json()['account']['marketing_opt_in'] is False      # off by default
    assert c.post('/v1/me/marketing', json={'opt_in': True}, headers=h).json()['ok']
    m = accounts.load_account(uid)['marketing']
    assert m['opt_in'] is True and m['source'] == 'extension' and m['at']
    assert c.post('/v1/me/marketing', json={'opt_in': True}).status_code == 401         # signed-in users only
    r = c.get(f'/v1/unsubscribe?u={uid}&t=wrong')
    assert 'not valid' in r.text and accounts.load_account(uid)['marketing']['opt_in'] is True
    r = c.get(f'/v1/unsubscribe?u={uid}&t={accounts.unsubscribe_token(uid)}')
    assert 'not get any more' in r.text and accounts.load_account(uid)['marketing']['opt_in'] is False
print('marketing consent regression passed')
