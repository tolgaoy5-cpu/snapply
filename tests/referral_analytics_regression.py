"""Referrals give both people 15 days of Pro on the invited person's first application (once);
the referrer's rewards are capped; funnel counters hold counts only."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json, os, sys

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
with TemporaryDirectory() as td:
    os.environ.update({'JOB_COPILOT_DATA_DIR': td, 'SNAPPLY_SECRET': 'x' * 40})
    import accounts as A, analytics
    g = lambda sub: {'sub': sub, 'email': f'{sub}@example.com', 'name': sub}
    A.sign_in(g('alice'))
    alice = A.user_id_for('alice'); code = A.referral_code(alice)
    assert len(code) == 7 and A.uid_for_referral(code.lower()) == alice
    A.sign_in(g('bob'), ref=code); bob = A.user_id_for('bob')
    assert A.load_account(bob)['referred_by'] == alice
    assert A.plan_of(A.load_account(bob)) == 'free' and A.plan_of(A.load_account(alice)) == 'free'  # nothing at sign-up
    A.record_application(bob, 'https://jobs.lever.co/acme/1/apply')
    assert A.plan_of(A.load_account(bob)) == 'pro' and A.plan_of(A.load_account(alice)) == 'pro'
    until = A.load_account(alice)['pro_until']
    from datetime import datetime, timezone
    days = (datetime.fromisoformat(until) - datetime.now(timezone.utc)).total_seconds() / 86400
    assert 14.9 < days <= 15, days  # 15 days each, not a month
    A.record_application(bob, 'https://jobs.lever.co/acme/2/apply')     # only the first application counts
    assert A.load_account(alice)['pro_until'] == until and A.load_account(alice)['referral_rewards'] == 1
    # Existing accounts and self-referral are not linked; unknown codes are ignored.
    A.sign_in(g('bob'), ref=code); A.sign_in(g('carol'), ref='NOPE123')
    assert 'referred_by' not in A.load_account(A.user_id_for('carol'))
    # Cap: the referrer stops earning after the maximum.
    A.save_account(alice, {**A.load_account(alice), 'referral_rewards': A.REFERRAL_MAX_REWARDS})
    A.sign_in(g('dave'), ref=code); A.record_application(A.user_id_for('dave'), 'https://x.example/job/1')
    assert A.load_account(alice)['referral_rewards'] == A.REFERRAL_MAX_REWARDS
    assert A.plan_of(A.load_account(A.user_id_for('dave'))) == 'pro'
    pub = A.public_account(alice)
    assert pub['referral_code'] == code and pub['plan'] == 'pro' and pub['pro_until']
    # Funnel counters: counts only, unknown names rejected, sources cleaned.
    assert analytics.record('site_visit', 'Reddit!!') and not analytics.record('evil', 'x')
    s = analytics.summary(1)
    assert s['site_visit'] == {'reddit': 1} and s['signup']['referral'] >= 2 and s['referral_rewarded']['direct'] == 2
    raw = json.dumps(s)
    assert '@' not in raw
print('referrals and analytics ok')
