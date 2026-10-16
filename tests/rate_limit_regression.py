"""Hosted API request limits: per address for sign-in/waitlist, per user for AI; others unaffected."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os, sys

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
import rate_limit as R

t = 1000.0
assert all(R.check('/v1/waitlist', None, '1.2.3.4', now=t + i) == 0 for i in range(5))
wait = R.check('/v1/waitlist', None, '1.2.3.4', now=t + 6)
assert wait > 3000, wait                       # sixth signup from one address within the hour
assert R.check('/v1/waitlist', None, '5.6.7.8', now=t + 6) == 0   # another address is fine
assert R.check('/v1/waitlist', None, '1.2.3.4', now=t + 3700) == 0  # window passed
# Per user: AI drafting burst limit, independent between users.
for i in range(10):
    assert R.check('/v1/answers/generate', 'userA', 'x', now=t + i) == 0
assert R.check('/v1/answers/generate', 'userA', 'x', now=t + 11) > 0
assert R.check('/v1/answers/generate', 'userB', 'x', now=t + 11) == 0
# Through the API: the 429 carries Retry-After.
R.reset()
with TemporaryDirectory() as td:
    os.environ.update({'JOB_COPILOT_DATA_DIR': td, 'SNAPPLY_MODE': 'cloud', 'SNAPPLY_SECRET': 'x' * 40})
    from fastapi.testclient import TestClient
    import server
    c = TestClient(server.app)
    codes = [c.post('/v1/waitlist', json={'email': f'p{i}@example.com'}, headers={'Fly-Client-IP': '9.9.9.9'}).status_code for i in range(6)]
    assert codes == [200] * 5 + [429], codes
    r = c.post('/v1/waitlist', json={'email': 'z@example.com'}, headers={'Fly-Client-IP': '9.9.9.9'})
    assert int(r.headers['Retry-After']) > 0 and 'wait' in r.json()['detail']
    assert c.get('/health').status_code == 200
print('rate limit ok')
