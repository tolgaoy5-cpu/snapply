"""Service emails from hello@snapply.co.uk through Gmail SMTP (SMTP_PASSWORD is a Google app password, a Fly secret).
Two automatic emails, each sent at most once per account: the setup reminder (signed up, no CV after
REMINDER_DELAY_MINUTES: "upload your CV to start") and the checkout reminder (opened the Stripe payment page, did not
pay, 24 hours later: one "finish your upgrade" email with a link back and an opt-out; PECR soft opt-in). Nothing is sent when SMTP is not configured."""
from __future__ import annotations

import html
import json
import os
import smtplib
import threading
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

import accounts

FROM_NAME, FROM_ADDR = 'Tolga at Snapply', 'hello@snapply.co.uk'
# Accounts created before this were emailed by hand on 4 Nov 2026 (or are the owner's); never remind them again.
REMINDERS_FROM = datetime(2026, 11, 4, 11, 5, tzinfo=timezone.utc)
_last_sweep = 0.0
_sweep_lock = threading.Lock()


def configured() -> bool:
    return bool(os.environ.get('SMTP_USER') and os.environ.get('SMTP_PASSWORD'))


def send(to: str, subject: str, html_body: str, text_body: str) -> bool:
    if not configured():
        return False
    msg = EmailMessage()
    msg['From'] = formataddr((FROM_NAME, FROM_ADDR))
    msg['To'] = to
    msg['Subject'] = subject
    msg['Reply-To'] = FROM_ADDR
    msg['Message-ID'] = make_msgid(domain='snapply.co.uk')
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype='html')
    with smtplib.SMTP(os.environ.get('SMTP_HOST', 'smtp.gmail.com'), int(os.environ.get('SMTP_PORT', '587')), timeout=20) as s:
        s.starttls()
        s.login(os.environ['SMTP_USER'], os.environ['SMTP_PASSWORD'])
        s.send_message(msg)
    return True


def setup_reminder(name: str) -> tuple[str, str, str]:
    first = (name or '').split(' ')[0].strip()
    hi = f'Hi {html.escape(first)},' if first else 'Hi,'
    subject = 'Finish setting up Snapply (1 minute)'
    body = f"""<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#202124;max-width:560px">
<div><a href="https://snapply.co.uk"><img src="https://snapply.co.uk/logo.png" width="48" height="48" alt="Snapply" style="border-radius:12px;vertical-align:middle"></a>&nbsp;&nbsp;<b style="font-size:20px;vertical-align:middle">Snapply</b></div>
<p>{hi}</p>
<p>Thanks for signing up to Snapply. Your account is ready, but <b>there is no CV in it yet</b>, and Snapply needs your CV to fill applications for you.</p>
<p><b>It takes about a minute:</b><br>
<b>1.</b> Click the <b>Snapply icon</b> in Chrome (or open any job application page).<br>
<b>2.</b> Press <b>“Choose your CV”</b> (or open <b>“Import or replace CV”</b> under My Profile) and upload your CV (PDF or Word).<br>
<b>3.</b> On a job application, press <b>“Fill this page”</b>. You check everything and press submit yourself.</p>
<p>If something didn’t work when you tried, <b>just reply to this email</b> and tell me what happened. I read every reply and I’ll fix it.</p>
<p>Thanks,<br>Tolga<br>Snapply · <a href="https://snapply.co.uk">snapply.co.uk</a></p>
<p style="font-size:11px;color:#9aa0a6">You’re receiving this because you have a Snapply account. Prefer not to hear from us? Just reply and let us know.</p>
</div>"""
    text = f"""{f'Hi {first},' if first else 'Hi,'}

Thanks for signing up to Snapply. Your account is ready, but there is no CV in it yet, and Snapply needs your CV to fill applications for you.

It takes about a minute:
1. Click the Snapply icon in Chrome (or open any job application page).
2. Press "Choose your CV" (or open "Import or replace CV" under My Profile) and upload your CV (PDF or Word).
3. On a job application, press "Fill this page". You check everything and press submit yourself.

If something didn't work when you tried, just reply to this email and tell me what happened. I read every reply and I'll fix it.

Thanks,
Tolga
Snapply - https://snapply.co.uk

You're receiving this because you have a Snapply account. Prefer not to hear from us? Just reply and let us know."""
    return subject, body, text


def due_for_reminder(uid: str, account: dict, now: datetime) -> bool:
    if account.get('setup_reminder_sent') or account.get('no_service_email') or not account.get('email'):
        return False
    try:
        created = datetime.fromisoformat(account.get('created_at', ''))
    except ValueError:
        return False
    delay = timedelta(minutes=int(os.environ.get('REMINDER_DELAY_MINUTES', '30')))
    return created >= REMINDERS_FROM and now - created >= delay and not (accounts.user_dir(uid) / 'saved_cv.bin').exists()


def checkout_reminder(uid: str, account: dict) -> tuple[str, str, str]:
    import billing
    first = (account.get('name') or '').split(' ')[0].strip()
    plan = next((p for p in billing.PLANS if p['interval'] == account.get('checkout_interval')), None)
    what = f"Snapply Pro ({plan['label']}, £{plan['price']:.2f})" if plan else 'Snapply Pro'
    api = os.environ.get('SNAPPLY_API_URL', 'https://snapply-api.fly.dev').rstrip('/')
    resume = f"{api}/v1/billing/resume?u={uid}&t={accounts.resume_token(uid)}"
    stop = f"{api}/v1/unsubscribe?u={uid}&t={accounts.unsubscribe_token(uid)}"
    subject = 'Your Snapply Pro upgrade is waiting'
    hi = f'Hi {html.escape(first)},' if first else 'Hi,'
    body = f"""<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#202124;max-width:560px">
<div><a href="https://snapply.co.uk"><img src="https://snapply.co.uk/logo.png" width="48" height="48" alt="Snapply" style="border-radius:12px;vertical-align:middle"></a>&nbsp;&nbsp;<b style="font-size:20px;vertical-align:middle">Snapply</b></div>
<p>{hi}</p>
<p>You started upgrading to <b>{html.escape(what)}</b> but didn’t finish. If you still want unlimited applications and cover letters, you can pick up where you left off:</p>
<p><a href="{resume}" style="display:inline-block;background:#202124;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Finish upgrading</a></p>
<p>If something went wrong on the payment page, or you have a question, <b>just reply to this email</b>. I read every reply.</p>
<p>Thanks,<br>Tolga<br>Snapply · <a href="https://snapply.co.uk">snapply.co.uk</a></p>
<p style="font-size:11px;color:#9aa0a6">This is the only reminder we’ll send about it. <a href="{stop}" style="color:#9aa0a6">Don’t email me about offers</a>.</p>
</div>"""
    text = f"""{f'Hi {first},' if first else 'Hi,'}

You started upgrading to {what} but didn't finish. If you still want unlimited applications and cover letters, you can pick up where you left off:

{resume}

If something went wrong on the payment page, or you have a question, just reply to this email. I read every reply.

Thanks,
Tolga
Snapply - https://snapply.co.uk

This is the only reminder we'll send about it. Don't email me about offers: {stop}"""
    return subject, body, text


def due_for_checkout_reminder(uid: str, account: dict, now: datetime) -> bool:
    """One reminder, 24 hours to 7 days after someone opened the payment page and did not become Pro."""
    if (account.get('checkout_reminder_sent') or account.get('no_sales_email') or account.get('no_service_email')
            or account.get('guest') or not account.get('email') or accounts.plan_of(account) == 'pro'):
        return False
    if (account.get('marketing') or {}).get('opt_in') is False and (account.get('marketing') or {}).get('source') == 'unsubscribe link':
        return False
    try:
        started = datetime.fromisoformat(account.get('checkout_started_at', ''))
    except ValueError:
        return False
    return timedelta(hours=24) <= now - started <= timedelta(days=7)


def sweep(now: datetime | None = None) -> int:
    """Send any setup reminders that are due; returns how many were sent."""
    try:
        accounts.purge_guests()
    except Exception:
        pass
    if not configured():
        return 0
    now = now or datetime.now(timezone.utc)
    sent = 0
    root = accounts.data_root() / 'users'
    for path in sorted(root.glob('*/account.json')) if root.exists() else []:
        uid = path.parent.name
        try:
            account = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if due_for_checkout_reminder(uid, account, now):
            subject, body, text = checkout_reminder(uid, account)
            try:
                ok = send(account['email'], subject, body, text)
            except Exception as e:
                print(f'checkout reminder failed: {type(e).__name__}')
                ok = False
            if ok:
                current = accounts.load_account(uid)
                current['checkout_reminder_sent'] = now.isoformat()
                accounts.save_account(uid, current)
                try:
                    import analytics
                    analytics.record('checkout_reminder_sent')
                except Exception:
                    pass
                sent += 1
            continue
        if not due_for_reminder(uid, account, now):
            continue
        subject, body, text = setup_reminder(account.get('name', ''))
        try:
            ok = send(account['email'], subject, body, text)
        except Exception as e:  # a failed send is retried on the next sweep
            print(f'setup reminder failed: {type(e).__name__}')
            continue
        if ok:
            current = accounts.load_account(uid)
            current['setup_reminder_sent'] = now.isoformat()
            accounts.save_account(uid, current)
            sent += 1
    return sent


def maybe_sweep(every_seconds: int = 900) -> None:
    """Called on API traffic (the machine sleeps when idle): at most one background sweep per interval."""
    global _last_sweep
    if not accounts.cloud_mode() or not configured() or time.time() - _last_sweep < every_seconds:
        return
    with _sweep_lock:
        if time.time() - _last_sweep < every_seconds:
            return
        _last_sweep = time.time()
    threading.Thread(target=lambda: sweep(), daemon=True).start()
