"""AI fallback that tells the extension what an unfamiliar form field asks for.

Only the form's own wording is sent (label, field type, names, autocomplete hint, option texts);
never anything the user typed or anything from their profile. Answers are cached per site, so a
form seen once by any user is mapped without another model call.
"""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path
from threading import RLock
from typing import Any

from accounts import data_root
from llm_provider import ProviderError, _openai_settings

KEYS = {
    "full_name": "the applicant's full name in one field",
    "location": "current location as free text (city, country)",
    "linkedin": "LinkedIn profile URL",
    "github": "GitHub profile URL",
    "website": "personal website or portfolio URL",
    "first_name": "given / first name, preferred or known-as name",
    "last_name": "family name / surname",
    "email": "email address",
    "phone": "main phone or mobile number",
    "phone_country_code": "dialling code for the main phone",
    "phone_secondary": "an alternative, home or second phone number",
    "title": "honorific such as Mr, Ms, Dr",
    "address": "first line of the postal address",
    "address_line2": "second line of the postal address",
    "address_line3": "third line of the postal address",
    "city": "town or city",
    "region": "county, region or state",
    "postcode": "postcode / ZIP",
    "country": "country of residence",
    "application_source": "where or how the applicant heard about or found the job",
    "notice_period": "notice period / availability to start",
    "salary_expectation": "expected or current salary",
    "right_to_work": "right to work / work permit / eligibility to work",
    "sponsorship": "whether visa sponsorship is needed",
    "supporting_statement": "free-text statement, cover letter or why-you-want-the-role answer",
    "question": "any other question the applicant must answer themselves (yes/no, choices, declarations, equality monitoring)",
    "ignore": "not something to fill (search box, captcha, newsletter opt-in, file upload, internal field)",
}
INSTRUCTIONS = (
    "You classify job application form fields. For each field decide what it asks for and return one key "
    "from KEYS. Use the label first, then field names and the autocomplete hint. Choose 'question' when "
    "the field is a question only the applicant can answer, and 'ignore' when it should not be filled. "
    "Never guess a profile key for a field whose meaning is unclear; use 'question'. "
    'Return JSON {"fields":[{"sig":"...","key":"..."}]} with every input sig exactly once.'
)
MAX_FIELDS = 60
_LOCK = RLock()


def _cache_path(host: str) -> Path:
    safe = re.sub(r"[^a-z0-9.-]", "_", host.lower())[:120] or "unknown"
    return data_root() / "field_hints" / f"{safe}.json"


def _load(host: str) -> dict[str, str]:
    try:
        data = json.loads(_cache_path(host).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save(host: str, hints: dict[str, str]) -> None:
    path = _cache_path(host)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(hints, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def _clean(field: dict) -> dict:
    cut = lambda v, n: str(v or "").replace("\n", " ")[:n]
    return {"sig": cut(field.get("sig"), 300), "label": cut(field.get("label"), 300), "tag": cut(field.get("tag"), 20),
            "type": cut(field.get("type"), 30), "name": cut(field.get("name"), 80), "id": cut(field.get("id"), 80),
            "autocomplete": cut(field.get("autocomplete"), 40),
            "options": [cut(o, 80) for o in (field.get("options") or [])[:30]]}


def _call_model(fields: list[dict]) -> dict[str, str]:
    key, model = _openai_settings()
    if not key:
        raise ProviderError("AI is not configured.")
    schema = {"type": "object", "properties": {"fields": {"type": "array", "items": {
        "type": "object", "properties": {"sig": {"type": "string"}, "key": {"type": "string", "enum": list(KEYS)}},
        "required": ["sig", "key"], "additionalProperties": False}}}, "required": ["fields"], "additionalProperties": False}
    body = {"model": model, "instructions": INSTRUCTIONS, "store": False,
            "input": json.dumps({"KEYS": KEYS, "FIELDS": fields}),
            "text": {"format": {"type": "json_schema", "name": "field_map", "strict": True, "schema": schema}}}
    req = urllib.request.Request("https://api.openai.com/v1/responses", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode())
        text = "".join(b.get("text", "") for item in data.get("output", []) for b in item.get("content", [])
                       if b.get("type") == "output_text")
        return {f["sig"]: f["key"] for f in json.loads(text).get("fields", []) if f.get("key") in KEYS}
    except Exception as e:
        raise ProviderError("Field classification failed.") from e


def classify(host: str, fields: list[dict], model=_call_model) -> dict[str, str]:
    """Return {sig: key} for every field, from the site cache or one model call for the rest."""
    host = str(host or "").lower()[:200]
    fields = [_clean(f) for f in fields[:MAX_FIELDS] if f.get("sig")]
    with _LOCK:
        cached = _load(host)
    todo = [f for f in fields if f["sig"] not in cached]
    if todo:
        learned = model(todo)
        for f in todo:  # fields the model skipped are remembered as plain questions
            learned.setdefault(f["sig"], "question")
        with _LOCK:
            cached = {**_load(host), **learned}
            _save(host, cached)
    return {f["sig"]: cached.get(f["sig"], "question") for f in fields}


def save_report(uid: str | None, report: dict[str, Any]) -> str:
    """Store a user's 'this page did not fill correctly' report (form structure only, no values)."""
    from datetime import datetime, timezone
    import secrets
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    host = re.sub(r"[^a-z0-9.-]", "_", str(((report.get("capture") or {}).get("page") or {}).get("url_origin") or "unknown").split("//")[-1].lower())[:80]
    name = f"{stamp}-{host}-{secrets.token_hex(3)}.json"
    path = data_root() / "reports" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"uid": uid, **report}, ensure_ascii=False, indent=1), encoding="utf-8")
    return name
