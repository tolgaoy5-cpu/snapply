"""Owner commands for the hosted service, run on the server:

    fly ssh console --app snapply-api -C "python admin.py list"
    fly ssh console --app snapply-api -C "python admin.py grant-pro someone@gmail.com"
    fly ssh console --app snapply-api -C "python admin.py revoke-pro someone@gmail.com"
    fly ssh console --app snapply-api -C "python admin.py waitlist"
    fly ssh console --app snapply-api -C "python admin.py reports"          (then: report <file name>)

grant-pro gives a complimentary Pro plan (no Stripe subscription). The person must have signed in
to Snapply once so that their account exists.
"""
from __future__ import annotations

import json
import sys

import accounts


def _all_accounts() -> list[tuple[str, dict]]:
    root = accounts.data_root() / "users"
    found = []
    for path in sorted(root.glob("*/account.json")) if root.exists() else []:
        try:
            found.append((path.parent.name, json.loads(path.read_text())))
        except (OSError, json.JSONDecodeError):
            continue
    return found


def _find(email: str) -> str:
    matches = [uid for uid, a in _all_accounts() if a.get("email", "").lower() == email.strip().lower()]
    if not matches:
        sys.exit(f"No account for {email}. They need to sign in to Snapply once first.")
    return matches[0]


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[1] == "reports":
        folder = accounts.data_root() / "reports"
        files = sorted(folder.glob("*.json")) if folder.exists() else []
        for f in files[-50:]:
            data = json.loads(f.read_text())
            page = data.get("capture", {}).get("page", {})
            print(f.name, page.get("url_origin", ""), page.get("url_path", "")[:60], "|", data.get("note", "")[:80])
        print(f"{len(files)} report(s)")
        return 0
    if len(argv) >= 2 and argv[1] == "report" and len(argv) == 3:
        print((accounts.data_root() / "reports" / argv[2].replace("/", "")).read_text())
        return 0
    if len(argv) >= 2 and argv[1] == "waitlist":
        try:
            entries = json.loads((accounts.data_root() / "waitlist.json").read_text())
        except (OSError, json.JSONDecodeError):
            entries = []
        for e in entries:
            print(e["email"], e.get("added_at", "")[:10])
        print(f"{len(entries)} on the waitlist")
        return 0
    if len(argv) < 2 or argv[1] not in ("list", "grant-pro", "revoke-pro"):
        print(__doc__)
        return 2
    command = argv[1]
    if command == "list":
        for uid, a in _all_accounts():
            print(f"{a.get('email', '?'):40} {accounts.plan_of(a):5} {a.get('subscription_status', ''):10} created {a.get('created_at', '')[:10]}")
        return 0
    if len(argv) != 3:
        sys.exit(f"Usage: python admin.py {command} <email>")
    uid = _find(argv[2])
    if command == "grant-pro":
        accounts.set_plan(uid, "pro", status="complimentary")
    else:
        if accounts.load_account(uid).get("subscription_status") != "complimentary":
            sys.exit("This account pays through Stripe; cancel it in the Stripe dashboard instead.")
        accounts.set_plan(uid, "free", status="")
    print(accounts.public_account(uid))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
