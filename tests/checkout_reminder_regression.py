"""Someone who opens the Stripe payment page and does not pay gets ONE "finish your upgrade" email 24 hours later
(PECR soft opt-in): never before 24 hours, never after 7 days, never twice, never to Pro users, guests or people who
opted out. Its link opens a fresh payment page for the same plan; the opt-out link stops it."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import os, sys

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
with TemporaryDirectory() as td:
    os.environ.update({'JOB_COPILOT_DATA_DIR': td, 'SNAPPLY_SECRET': 'x' * 40, 'SNAPPLY_MODE': 'cloud',
                       'SMTP_USER': 'hello@snapply.co.uk', 'SMTP_PASSWORD': 'test', 'STRIPE_PRICE_ID_WEEKLY': 'price_week',
                       'STRIPE_SECRET_KEY': 'sk_test_x'})
    import accounts, mailer, billing, server
    from fastapi.testclient import TestClient
    sent = []
    mailer.send = lambda to, subject, html, text: sent.append((to, subject, html, text)) or True
    posts = []
    billing._post = lambda path, fields: posts.append((path, fields)) or {'url': 'https://checkout.stripe.com/c/pay/new', 'id': 'cs_1'}

    _, acct = accounts.sign_in({'sub': 'g-9', 'email': 'sam@example.com', 'name': 'Sam Taylor'})
    uid = accounts.user_id_for('g-9')
    accounts.note_checkout_started(uid, 'week')
    a = accounts.load_account(uid); a['setup_reminder_sent'] = 'earlier'; accounts.save_account(uid, a)   # only the checkout email here
    started = datetime.fromisoformat(a['checkout_started_at'])
    now = lambda h: started + timedelta(hours=h)

    assert mailer.sweep(now(23)) == 0 and not sent, 'not before 24 hours'
    assert mailer.sweep(now(25)) == 1 and len(sent) == 1
    to, subject, html, text = sent[0]
    assert to == 'sam@example.com' and 'Hi Sam,' in text and '1 week, £3.99' in text and 'only reminder' in text
    assert '/v1/billing/resume?u=' + uid in text and '/v1/unsubscribe?u=' + uid in text
    assert mailer.sweep(now(30)) == 0 and len(sent) == 1, 'never twice'

    c = TestClient(server.app)
    # The link opens a fresh Stripe page for the same plan; a bad token does not.
    r = c.get(f'/v1/billing/resume?u={uid}&t={accounts.resume_token(uid)}', follow_redirects=False)
    assert r.status_code == 303 and r.headers['location'] == 'https://checkout.stripe.com/c/pay/new', r.text
    assert posts[-1][1]['line_items[0][price]'] == 'price_week'
    assert c.get(f'/v1/billing/resume?u={uid}&t=wrong', follow_redirects=False).status_code == 400

    # Too late (over 7 days), Pro users, guests and opted-out people get nothing.
    def fresh(sub, **extra):
        accounts.sign_in({'sub': sub, 'email': sub + '@example.com', 'name': 'X'})
        u = accounts.user_id_for(sub); accounts.note_checkout_started(u, 'week')
        acc = accounts.load_account(u); acc.update(extra); accounts.save_account(u, acc); return u
    sent.clear()
    late = fresh('g-late'); assert not mailer.due_for_checkout_reminder(late, accounts.load_account(late), now(24 * 8))
    pro = fresh('g-pro', plan='pro'); assert not mailer.due_for_checkout_reminder(pro, accounts.load_account(pro), now(25))
    out = fresh('g-out'); assert accounts.unsubscribe(out, accounts.unsubscribe_token(out))
    assert not mailer.due_for_checkout_reminder(out, accounts.load_account(out), now(25))
    g_token, _ = accounts.guest_sign_in(); g = accounts.verify_session(g_token); accounts.note_checkout_started(g, 'week')
    assert 'checkout_started_at' not in accounts.load_account(g), 'guests are never tracked'
    # The checkout endpoint records the start.
    c2 = TestClient(server.app); tok, _ = accounts.sign_in({'sub': 'g-api', 'email': 'api@example.com', 'name': 'A'})
    assert c2.post('/v1/billing/checkout', json={'interval': 'week'}, headers={'Authorization': 'Bearer ' + tok}).status_code == 200
    assert accounts.load_account(accounts.user_id_for('g-api')).get('checkout_interval') == 'week'
print('checkout reminder regression passed')
