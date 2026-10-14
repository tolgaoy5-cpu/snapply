"""Owner commands: list accounts, grant and revoke a complimentary Pro plan by email."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os, subprocess, sys

ROOT = Path(__file__).parent.parent
with TemporaryDirectory() as td:
    env = {**os.environ, 'JOB_COPILOT_DATA_DIR': td, 'PYTHONPATH': str(ROOT / 'backend')}
    run = lambda *a: subprocess.run([sys.executable, str(ROOT / 'backend' / 'admin.py'), *a], env=env, capture_output=True, text=True)
    sys.path.insert(0, str(ROOT / 'backend')); os.environ['JOB_COPILOT_DATA_DIR'] = td
    import accounts
    accounts.save_account(accounts.user_id_for('g1'), {'email': 'Friend@Example.com', 'plan': 'free'})
    accounts.save_account(accounts.user_id_for('g2'), {'email': 'payer@example.com', 'plan': 'pro', 'subscription_status': 'active'})
    assert 'friend@example.com' in run('list').stdout.lower()
    r = run('grant-pro', 'friend@example.com'); assert r.returncode == 0 and "'plan': 'pro'" in r.stdout, r.stderr
    assert accounts.load_account(accounts.user_id_for('g1'))['subscription_status'] == 'complimentary'
    assert run('grant-pro', 'nobody@example.com').returncode != 0
    assert run('revoke-pro', 'payer@example.com').returncode != 0  # paying customers are managed in Stripe
    r = run('revoke-pro', 'friend@example.com'); assert "'plan': 'free'" in r.stdout
print('admin ok')
