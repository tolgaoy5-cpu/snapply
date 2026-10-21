"""CV structure read by AI and verified against the CV text.

CV layouts vary too much for fixed rules, so the model organises the CV into roles, education,
certificates and languages. It may only copy: every value it returns must appear in the CV text
(ignoring case, spacing and dash style), otherwise the value is dropped. Nothing is inferred, translated
or improved. Contact details (email, phone, postcode, links) stay with the deterministic importer.
"""
from __future__ import annotations

import json
import re
import urllib.request
from typing import Callable

from llm_provider import ProviderError, _openai_settings

INSTRUCTIONS = (
    "You organise a CV into structured data. Copy every value exactly as it is written in the CV text: "
    "same words, same spelling, same date format. Never add, infer, guess, translate, shorten or improve "
    "anything. If a value is not written in the CV, return an empty string (or an empty list). "
    "experience: every job, newest first; role is the job title, employer the organisation, bullets the "
    "description lines or sentences for that job copied verbatim. education: every degree, school or "
    "college qualification. certifications: certificates, licences and courses. languages: spoken languages "
    "with the level if the CV states one. skills: listed skills."
)

_STR = {"type": "string"}
SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["experience", "education", "certifications", "languages", "skills"],
    "properties": {
        "experience": {"type": "array", "items": {"type": "object", "additionalProperties": False,
            "required": ["role", "employer", "location", "start", "end", "bullets"],
            "properties": {"role": _STR, "employer": _STR, "location": _STR, "start": _STR, "end": _STR,
                           "bullets": {"type": "array", "items": _STR}}}},
        "education": {"type": "array", "items": {"type": "object", "additionalProperties": False,
            "required": ["qualification", "institution", "start", "end", "grade"],
            "properties": {"qualification": _STR, "institution": _STR, "start": _STR, "end": _STR, "grade": _STR}}},
        "certifications": {"type": "array", "items": _STR},
        "languages": {"type": "array", "items": {"type": "object", "additionalProperties": False,
            "required": ["language", "level"], "properties": {"language": _STR, "level": _STR}}},
        "skills": {"type": "array", "items": _STR},
    },
}

MONTHS = {m: i for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}


def _norm(s: str) -> str:
    s = str(s or '').lower().replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    s = re.sub(r'[–—−‐-]', '-', s)
    s = re.sub(r'^[\s•·▪●◦*\-–]+', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def _in_cv(value: str, cv: str) -> bool:
    v = _norm(value)
    return bool(v) and v in cv


def to_month_year(s: str) -> str:
    """'Mar 2021' / 'March 2021' / '03/2021' -> '03/2021'; 'Present' -> 'Present'; a year stays a year."""
    t = str(s or '').strip()
    if re.fullmatch(r'(?i)present|current|now|to date|date|ongoing', t):
        return 'Present'
    m = re.fullmatch(r'(\d{1,2})[/.](\d{4})', t)
    if m:
        return f'{int(m.group(1)):02d}/{m.group(2)}'
    m = re.fullmatch(r'([A-Za-z]{3,9})\.?,?\s+(\d{4})', t)
    if m and m.group(1)[:3].lower() in MONTHS:
        return f'{MONTHS[m.group(1)[:3].lower()]:02d}/{m.group(2)}'
    return t


def _call_model(text: str) -> dict:
    key, model = _openai_settings()
    if not key:
        raise ProviderError("AI is not configured.")
    body = {"model": model, "instructions": INSTRUCTIONS, "store": False, "input": text[:24000],
            "text": {"format": {"type": "json_schema", "name": "cv_structure", "strict": True, "schema": SCHEMA}}}
    req = urllib.request.Request("https://api.openai.com/v1/responses", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            data = json.loads(response.read().decode())
        out = "".join(b.get("text", "") for item in data.get("output", []) for b in item.get("content", [])
                      if b.get("type") == "output_text")
        return json.loads(out)
    except Exception as e:
        raise ProviderError("CV reading failed.") from e


def structure(text: str, model: Callable[[str], dict] = _call_model) -> dict:
    """Roles, education, certificates, languages and skills; only values found in the CV text survive."""
    raw = model(text)
    cv = _norm(text)
    keep = lambda v: v if _in_cv(v, cv) else ''
    dropped = 0

    def count(v):
        nonlocal dropped
        if v and not _in_cv(v, cv):
            dropped += 1

    experience = []
    for e in raw.get('experience') or []:
        for k in ('role', 'employer', 'location', 'start', 'end'):
            count(e.get(k))
        role, employer = keep(e.get('role')), keep(e.get('employer'))
        if not role and not employer:
            continue
        bullets = [b for b in (e.get('bullets') or []) if _in_cv(b, cv)]
        dropped += len(e.get('bullets') or []) - len(bullets)
        start, end = to_month_year(keep(e.get('start'))), to_month_year(keep(e.get('end')))
        experience.append({'role': role, 'employer': employer, 'location': keep(e.get('location')),
                           'dates': f'{start}-{end}' if start and end else (start or ''),
                           'country': 'UK' if re.search(r'\b(UK|United Kingdom|England|Scotland|Wales|London)\b', e.get('location') or '') else None,
                           'evidence': ' '.join(re.sub(r'^[\s•·▪●◦*\-–]+', '', b).strip() for b in bullets)[:2200]})
    education = []
    for e in raw.get('education') or []:
        for k in ('qualification', 'institution', 'start', 'end', 'grade'):
            count(e.get(k))
        degree, institution = keep(e.get('qualification')), keep(e.get('institution'))
        if not degree and not institution:
            continue
        start, end = to_month_year(keep(e.get('start'))), to_month_year(keep(e.get('end')))
        fm = re.search(r"\b(?:BSc|BA|MSc|MA|MBA|BEng|MEng|LLB|Bachelor(?:'s)?|Master(?:'s)?)\b\s*(?:\(Hons\))?\s*(?:of|in)?\s*(.+)$", degree, re.I)
        education.append({'degree': degree, 'institution': institution, 'field': fm.group(1).strip() if fm else '',
                          'grade': keep(e.get('grade')), 'dates': f'{start}-{end}' if start and end else (start or end or ''),
                          'country': None, 'evidence': ''})
    certifications = [c for c in (raw.get('certifications') or []) if _in_cv(c, cv)]
    languages = [{'language': l.get('language'), 'level': keep(l.get('level'))} for l in (raw.get('languages') or []) if _in_cv(l.get('language'), cv)]
    skills = [s for s in (raw.get('skills') or []) if _in_cv(s, cv)]
    dropped += len(raw.get('certifications') or []) - len(certifications) + len(raw.get('skills') or []) - len(skills)
    return {'experience': experience, 'education': education, 'certifications': certifications,
            'languages': languages, 'skills': skills, 'dropped_values': dropped}
