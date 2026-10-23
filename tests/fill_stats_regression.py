"""Fill quality per site: the extension sends counts only (host, numbers); the server keeps daily
totals per host with no user id, and `admin.py fills` lists the worst-filling sites first."""
from pathlib import Path
from tempfile import TemporaryDirectory
import contextlib, io, json, os, sys

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
with TemporaryDirectory() as td:
    os.environ.update({'JOB_COPILOT_DATA_DIR': td, 'SNAPPLY_SECRET': 'x' * 40, 'SNAPPLY_MODE': 'cloud'})
    import accounts, analytics, admin, server
    from fastapi.testclient import TestClient
    c = TestClient(server.app)
    stats = {'host': 'WWW.Jobs.NHS.uk', 'ats': 'TRAC', 'detected': 10, 'filled': 9, 'required_total': 8,
             'required_missing': 1, 'cv_slots': 1, 'cv_attached': 1}
    assert c.post('/v1/fill-stats', json=stats).status_code == 401          # signed-in users only
    accounts.sign_in({'sub': 's1', 'email': 'a@example.com', 'name': 'A'})
    h = {'Authorization': 'Bearer ' + accounts.issue_session(accounts.user_id_for('s1'))}
    assert c.post('/v1/fill-stats', json=stats, headers=h).json() == {'ok': True}
    assert c.post('/v1/fill-stats', json={**stats, 'host': 'careers.badsite.com', 'filled': 2, 'required_missing': 6,
                                          'cv_attached': 0}, headers=h).status_code == 200
    assert c.post('/v1/fill-stats', json={**stats, 'filled': -1}, headers=h).status_code == 422
    s = analytics.fill_summary(1)
    assert s['jobs.nhs.uk']['fills'] == 1 and s['jobs.nhs.uk']['filled'] == 9 and s['jobs.nhs.uk']['ats'] == 'trac'
    raw = (Path(td) / 'fills').read_text() if (Path(td) / 'fills').is_file() else json.dumps(s)
    assert '@' not in raw and 's1' not in json.dumps(s)                    # no user identity stored
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        assert admin.main(['admin.py', 'fills', '1']) == 0
    lines = out.getvalue().splitlines()
    assert '2 fills on 2 sites' in lines[0] and lines[2].startswith('careers.badsite.com'), lines
print('fill stats ok')
