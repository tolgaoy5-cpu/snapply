"""New sign-ups without a CV get one setup reminder after the delay; people with a CV, people emailed by hand
before 4 Nov 2026 and people who asked not to be emailed get nothing, and nobody gets it twice."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import json, os, sys

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
with TemporaryDirectory() as td:
    os.environ.update({'JOB_COPILOT_DATA_DIR': td, 'SNAPPLY_SECRET': 'x' * 40, 'SNAPPLY_MODE': 'cloud',
                       'SMTP_USER': 'u@example.com', 'SMTP_PASSWORD': 'p', 'REMINDER_DELAY_MINUTES': '30'})
    import accounts, mailer
    sent = []
    mailer.send = lambda to, subject, body, text: sent.append((to, subject, body, text)) or True
    now = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)
    def make(sub, email, created, cv=False, **extra):
        uid = accounts.user_id_for(sub)
        accounts.save_account(uid, {'email': email, 'name': 'Sam Taylor', 'created_at': created.isoformat(), **extra})
        if cv:
            (accounts.user_dir(uid) / 'saved_cv.bin').write_bytes(b'cv')
        return uid
    due = make('a', 'due@example.com', now - timedelta(hours=2))
    make('b', 'fresh@example.com', now - timedelta(minutes=5))                 # still within the delay
    make('c', 'hascv@example.com', now - timedelta(hours=2), cv=True)
    make('d', 'old@example.com', datetime(2026, 10, 29, tzinfo=timezone.utc))  # emailed by hand already
    make('e', 'optout@example.com', now - timedelta(hours=2), no_service_email=True)
    assert mailer.sweep(now) == 1 and [s[0] for s in sent] == ['due@example.com']
    assert 'Hi Sam,' in sent[0][3] and 'logo.png' in sent[0][2] and 'Prefer not to hear from us' in sent[0][2]
    assert accounts.load_account(due)['setup_reminder_sent']
    assert mailer.sweep(now + timedelta(days=1)) == 1 and sent[-1][0] == 'fresh@example.com'   # now due; 'due' not again
    assert mailer.sweep(now + timedelta(days=2)) == 0
print('setup reminder regression passed')
