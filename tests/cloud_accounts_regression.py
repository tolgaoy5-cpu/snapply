"""Cloud mode: sign-in, per-user isolation, browser-only sensitive data, AI quota, Stripe webhooks.

Google and Stripe are never contacted: token verification is mocked and webhooks are signed locally.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib, hmac, json, os, sys, time

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / 'backend'))

with TemporaryDirectory() as td:
    os.environ.update({'JOB_COPILOT_DATA_DIR': td, 'SNAPPLY_MODE': 'cloud', 'SNAPPLY_SECRET': 'x' * 40,
                       'GOOGLE_CLIENT_ID': 'client-1.apps.googleusercontent.com', 'STRIPE_WEBHOOK_SECRET': 'whsec_test',
                       'SNAPPLY_FREE_AI_PER_MONTH': '2'})
    import accounts, billing
    accounts.PLANS['free'] = 2
    from fastapi.testclient import TestClient
    import server

    def fake_tokeninfo(token):
        users = {'tok-alice': ('sub-a', 'alice@example.com'), 'tok-bob': ('sub-b', 'bob@example.com')}
        if token == 'tok-other-app':
            return {'aud': 'someone-else', 'iss': 'accounts.google.com', 'sub': 's', 'email': 'e@x.com', 'email_verified': 'true'}
        sub, email = users[token]
        return {'aud': 'client-1.apps.googleusercontent.com', 'iss': 'https://accounts.google.com', 'sub': sub,
                'email': email, 'email_verified': 'true', 'name': email.split('@')[0]}
    # Test tokens are padded to the request schema's minimum length; the mock strips the padding.
    accounts.verify_google_id_token.__defaults__ = (lambda t: fake_tokeninfo(t.rstrip('_')),)

    c = TestClient(server.app)
    assert c.get('/health').json()['auth'] == 'google'
    # Every data route needs a session.
    assert c.get('/v1/state').status_code == 401
    assert c.get('/v1/state', headers={'Authorization': 'Bearer forged.token'}).status_code == 401

    def login(tok):
        return c.post('/v1/auth/google', json={'id_token': tok.ljust(20, '_')})
    ra = login('tok-alice'); assert ra.status_code == 200, ra.text
    rb = login('tok-bob'); assert rb.status_code == 200
    assert login('tok-other-app').status_code == 401
    A = {'Authorization': 'Bearer ' + ra.json()['session']}
    B = {'Authorization': 'Bearer ' + rb.json()['session']}
    assert ra.json()['account']['plan'] == 'free' and ra.json()['account']['email'] == 'alice@example.com'

    # Per-user isolation.
    ok = {'signature': 'notice period', 'question': 'Notice period?', 'value': '1 month', 'kind': 'text', 'sensitivity': 'normal'}
    assert c.post('/v1/state/answers', json=ok, headers=A).status_code == 200
    assert 'notice period' in c.get('/v1/state', headers=A).json()['saved_answers']
    assert c.get('/v1/state', headers=B).json()['saved_answers'] == {}
    # Sensitive/legal answers and referees stay in the browser.
    for sens in ('legal', 'sensitive'):
        r = c.post('/v1/state/answers', json={**ok, 'signature': 's-' + sens, 'sensitivity': sens}, headers=A)
        assert r.status_code == 422, r.text
    assert c.post('/v1/state/referees', json={'referees': [{'label': 'x', 'fields': {'a': 'b'}}]}, headers=A).status_code == 422

    # AI quota: 2 free drafts, then 402.
    accounts.consume_ai(accounts.verify_session(ra.json()['session']))
    accounts.consume_ai(accounts.verify_session(ra.json()['session']))
    try:
        accounts.consume_ai(accounts.verify_session(ra.json()['session'])); raise SystemExit('quota not enforced')
    except accounts.QuotaError:
        pass
    assert c.get('/v1/me', headers=A).json()['account']['ai_used'] == 2
    assert c.get('/v1/me', headers=B).json()['account']['ai_used'] == 0

    # Expired and tampered sessions are rejected.
    uid_a = accounts.verify_session(ra.json()['session'])
    old = accounts.issue_session(uid_a, now=time.time() - 40 * 86400)
    assert c.get('/v1/me', headers={'Authorization': 'Bearer ' + old}).status_code == 401
    payload, sig = ra.json()['session'].split('.')
    assert c.get('/v1/me', headers={'Authorization': 'Bearer ' + payload + '.' + sig[:-2] + 'AA'}).status_code == 401

    # Stripe webhook: signed checkout completion upgrades; unsigned is refused; cancellation downgrades.
    def signed(event, secret='whsec_test'):
        body = json.dumps(event).encode(); t = int(time.time())
        sig = hmac.new(secret.encode(), f'{t}.'.encode() + body, hashlib.sha256).hexdigest()
        return body, {'stripe-signature': f't={t},v1={sig}', 'content-type': 'application/json'}
    done = {'type': 'checkout.session.completed', 'data': {'object': {'client_reference_id': uid_a, 'customer': 'cus_123'}}}
    body, h = signed(done, secret='wrong')
    assert c.post('/v1/billing/webhook', content=body, headers=h).status_code == 400
    body, h = signed(done)
    assert c.post('/v1/billing/webhook', content=body, headers=h).json()['result'] == 'upgraded'
    me = c.get('/v1/me', headers=A).json()['account']
    assert me['plan'] == 'pro' and me['ai_limit'] == accounts.PLANS['pro']
    accounts.consume_ai(uid_a)  # Pro allowance now applies.
    cancel = {'type': 'customer.subscription.deleted', 'data': {'object': {'customer': 'cus_123', 'status': 'canceled', 'metadata': {}}}}
    body, h = signed(cancel)
    assert c.post('/v1/billing/webhook', content=body, headers=h).json()['result'] == 'free'
    assert c.get('/v1/me', headers=A).json()['account']['plan'] == 'free'

    # Account deletion removes the user's data; the other user is untouched.
    assert c.delete('/v1/me', headers=A).json()['deleted']
    assert c.get('/v1/me', headers=A).status_code == 401
    assert c.get('/v1/me', headers=B).status_code == 200
    assert not (Path(td) / 'users' / uid_a).exists()
    assert not (Path(td) / 'stripe_customers' / 'cus_123.json').exists()

    # Local mode is unchanged: no sign-in, no quota.
    os.environ['SNAPPLY_MODE'] = ''
    assert c.get('/v1/me').json()['local'] is True
    assert c.post('/v1/state/answers', json={**ok, 'sensitivity': 'legal'}).status_code == 200
print('cloud accounts ok')

# Checkout picks the weekly, monthly, 3-monthly (or legacy yearly) price (Stripe call captured, not sent).
with TemporaryDirectory() as td2:
    os.environ['JOB_COPILOT_DATA_DIR'] = td2
    os.environ.update({'STRIPE_SECRET_KEY': 'sk_test_x', 'STRIPE_PRICE_ID': 'price_month', 'STRIPE_PRICE_ID_YEARLY': 'price_year',
                       'STRIPE_PRICE_ID_WEEKLY': 'price_week', 'STRIPE_PRICE_ID_QUARTERLY': 'price_quarter'})
    calls = []
    def fake_post(path, fields=None, method='POST'):
        calls.append((path, fields, method))
        if path.startswith('/coupons/'):
            raise billing.BillingError('No such coupon')
        return {'url': 'https://checkout.stripe.com/x'}
    billing._post = fake_post
    uid = accounts.user_id_for('sub-c'); accounts.save_account(uid, {'email': 'c@example.com', 'plan': 'free'})
    billing.checkout_url(uid); billing.checkout_url(uid, 'year'); billing.checkout_url(uid, 'week'); billing.checkout_url(uid, 'quarter')
    sessions = [f for p, f, _ in calls if p == '/checkout/sessions']
    assert [f['line_items[0][price]'] for f in sessions] == ['price_month', 'price_year', 'price_week', 'price_quarter']
    try:
        billing.checkout_url(uid, 'fortnight'); raise AssertionError('unknown plan accepted')
    except billing.BillingError:
        pass
    # Plans on sale with their price per day; the launch price only shows while the offer is on.
    plans = {p['interval']: p for p in billing.plans()}
    assert list(plans) == ['week', 'month', 'quarter'] and plans['quarter']['popular'] is True
    assert (plans['week']['per_day'], plans['month']['per_day'], plans['quarter']['per_day']) == (0.57, 0.33, 0.27)
    assert 'launch_price' not in plans['month'] and 'env' not in plans['week']
    assert sessions[0]['client_reference_id'] == uid and sessions[0]['customer_email'] == 'c@example.com'
    assert 'discounts[0][coupon]' not in sessions[0] and sessions[0]['allow_promotion_codes'] == 'true'
    # Launch offer: the first month of a first monthly subscription only (coupon created once).
    os.environ['SNAPPLY_LAUNCH_OFFER'] = 'on'; calls.clear()
    billing.checkout_url(uid); billing.checkout_url(uid); billing.checkout_url(uid, 'week'); billing.checkout_url(uid, 'quarter')
    sessions = [f for p, f, _ in calls if p == '/checkout/sessions']
    assert sessions[0]['discounts[0][coupon]'] == billing.LAUNCH_COUPON and 'allow_promotion_codes' not in sessions[0]
    assert 'discounts[0][coupon]' not in sessions[2] and 'discounts[0][coupon]' not in sessions[3]
    created = [f for p, f, m in calls if p == '/coupons']
    assert len(created) == 1 and created[0]['percent_off'] == '50' and created[0]['duration'] == 'once'
    assert {p['interval']: p for p in billing.plans()}['month']['launch_price'] == 4.99
    # A returning customer (already has a Stripe customer) pays full price.
    accounts.set_plan(uid, 'free', customer='cus_old'); calls.clear(); billing.checkout_url(uid)
    assert 'discounts[0][coupon]' not in [f for p, f, _ in calls if p == '/checkout/sessions'][0]
    print('checkout prices ok')
