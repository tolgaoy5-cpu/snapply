from __future__ import annotations
import re
from urllib.parse import urlsplit
from typing import Iterable

HEADINGS = re.compile(r"(?:essential|desirable|requirements?|person specification|what (?:we|you) (?:are )?looking for|skills|experience|about you|criteria)", re.I)
BULLET_PREFIX = re.compile(r"^\s*(?:[-•●▪◦*]|\d+[.)])\s*")
ACTION_WORDS = re.compile(r"\b(?:experience|ability|knowledge|skill|understanding|qualification|degree|training|communication|safeguarding|research|work|working|deliver|support|manage|record|collaborat|organis|organiz|supervis|cultur|inclusive|therapeutic|psycholog|certif|licen[cs]e|first aid|registration|registered|driving|dbs)\w*\b", re.I)
NOISE = re.compile(r"cookie|privacy|sign in|login|register|equal opportunities|terms and conditions", re.I)
SECTION_START = re.compile(r"^(?:who you are|about you|what the role includes|your responsibilities|key responsibilities|the role|person specification|essential(?: criteria| requirements)?|desirable(?: criteria| requirements)?|requirements|qualifications|competencies(?:\s*/\s*(?:skills|knowledge|experience))*|skills(?:\s*/\s*(?:knowledge|experience))*)$", re.I)
SECTION_END = re.compile(r"^(?:equal opportunities|equal opportunity|the company|about (?:the )?company|application deadline|how to apply)(?:\s*[:.]|$)", re.I)
META_LINE = re.compile(r"^(?:.+ page is loaded\b|(?:department|reports to|working hours|location|job type|time type|posted on|job requisition id):|the following attributes determine\b)", re.I)


# A heading is made only of heading words ("Skills and knowledge", "Essential criteria"); a short
# criterion such as "Experience supporting children with SEN" is not.
HEADING_WORDS = {'essential','desirable','requirements','requirement','person','specification','skills','skill','knowledge',
                 'experience','qualifications','qualification','criteria','about','you','who','are','what','we','looking','for',
                 'and','&','/','the','key','required','competencies','abilities','education','training','other','additional'}


def _is_heading(line: str) -> bool:
    words = re.findall(r"[a-z&/]+", line.lower())
    return 0 < len(words) <= 5 and all(w in HEADING_WORDS for w in words) and not re.search(r'[.!?]$', line)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip(" \t-•●▪◦*")


def _sentences(text: str) -> Iterable[str]:
    # Preserve bullets/newlines first, then split long prose.
    for raw in re.split(r"[\r\n]+", text or ""):
        raw = _clean(BULLET_PREFIX.sub("", raw))
        if not raw:
            continue
        if len(raw) > 240:
            for s in re.split(r"(?<=[.!?;])\s+", raw):
                s = _clean(s)
                if s:
                    yield s
        else:
            yield raw


def extract_requirements(text: str, limit: int = 24) -> list[str]:
    lines = list(_sentences(text))
    section_starts = [i for i, line in enumerate(lines) if SECTION_START.fullmatch(line)]
    first_section = section_starts[0] if section_starts else None
    out: list[str] = []
    in_relevant_section = False
    for index, line in enumerate(lines):
        if first_section is not None and index < first_section:
            continue
        if first_section is not None and SECTION_END.match(line):
            break
        if META_LINE.match(line):
            continue
        if NOISE.search(line):
            continue
        if SECTION_START.fullmatch(line) or _is_heading(line):
            in_relevant_section = True
            continue
        score = 0
        if ACTION_WORDS.search(line):
            score += 2
        if 25 <= len(line) <= 220:
            score += 1
        if in_relevant_section:
            score += 1
        if re.search(r"\b(?:must|essential|required|ideally|desirable|you will|you'll|we are looking)\b", line, re.I):
            score += 1
        if score >= 3 and len(line) <= 220:
            # Strip employer-facing prefixes while preserving criterion wording.
            line = re.sub(r"^(?:you (?:will|should|must|have|are)|we (?:are looking for|require)|the successful candidate (?:will|should|must|has))\s*[:,-]?\s*", "", line, flags=re.I)
            line = _clean(line)
            if len(line) >= 20 and line.lower() not in {x.lower() for x in out}:
                out.append(line)
        if len(out) >= limit:
            break
    return out


def analyze_job(payload: dict) -> dict:
    url = payload.get('url') or ''
    parsed = urlsplit(url)
    if parsed.hostname and parsed.hostname.endswith('.myworkdayjobs.com') and re.search(r'/apply(?:/|$)', parsed.path, re.I):
        return {'title': payload.get('title') or '', 'company': '', 'url': url, 'requirements': [], 'requirement_count': 0, 'source': 'application_form', 'error': 'Open the job posting to analyze its requirements.'}
    reqs = extract_requirements(payload.get("text", ""))
    return {
        "title": payload.get("title") or "",
        "company": payload.get("company") or "",
        "url": payload.get("url") or "",
        "requirements": reqs,
        "requirement_count": len(reqs),
        # The advert text itself, so letters can refer to what the employer actually says.
        "description": re.sub(r"\s+\n", "\n", str(payload.get("text") or ""))[:8000],
        "source": "active_page_text",
    }
