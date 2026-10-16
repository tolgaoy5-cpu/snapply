"""Persuasive cover letters that still never invent facts.

The model writes a structured letter in which every sentence declares what it rests on:
  - "cv":       a statement about the candidate -> must be grounded in the CV evidence
  - "job":      a statement about the employer or role -> must be grounded in the job advert
  - "courtesy": motivation, connective or closing wording -> may carry no factual claim at all
Sentences that fail their check get one revision round; whatever still fails is removed.
Numbers, credentials and qualifications must appear verbatim in the CV or the advert.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from typing import Any, Callable

from claim_validator import _content, validate_claim
from evidence_matcher import completed_certifications, match_job
from llm_provider import ProviderError, _openai_settings

LENGTHS = {
    # (target words, maximum words) for the letter body (greeting and sign-off excluded).
    "standard": (380, 470),
    "detailed": (650, 800),
}

LETTER_RULES = """You write persuasive, specific, professional cover letters in British English for job applications.
Hard rules:
- Every statement about the candidate (experience, duties, skills, qualifications, employers, dates, numbers, results) must come from CV_EVIDENCE. You may rephrase, combine and connect evidence to the role, but never add facts, tools, metrics or outcomes it does not state.
- Statements about the employer, team or role must come from JOB_ADVERT.
- You may write warm, confident motivational or connective sentences (why the role appeals, what the candidate looks forward to, an invitation to interview) as long as they make no factual claim about the candidate's history or results.
- Do not claim the candidate meets a requirement unless CV_EVIDENCE shows it. Leave unmet requirements out.
- No clichés such as "I am writing to express my interest". Open with something specific to this role.
- Structure: an opening paragraph (the role, what in the advert draws the candidate, one line summarising their most relevant background); two or three body paragraphs, each linking one or two key requirements from the advert to concrete CV evidence; a short closing paragraph (what they would bring, invitation to discuss).
- Length: aim for TARGET_WORDS words in total (never more than MAX_WORDS). Body paragraphs have 4 to 6 sentences each; the opening and closing have 2 to 3. A one-paragraph answer is a failure.
- Each sentence should do one job: a sentence that mentions the candidate's experience is "cv" (it may also refer to the role it is relevant to); keep pure employer/role description in separate "job" sentences.
- Do not include the greeting, sign-off, address or date.
Return JSON: {"paragraphs":[{"sentences":[{"text":"...","kind":"cv|job|courtesy","cv_evidence":[indices]}]}]}.
Label each sentence honestly: "cv" if it says anything about the candidate's experience, skills or qualifications; "job" if it describes the employer or role; "courtesy" only if it makes no factual claim."""

# First-person statements of experience belong to "cv" sentences only.
EXPERIENCE_CLAIM = re.compile(
    r"\bI\s+(?:have|had|'ve|led|managed|worked|built|delivered|developed|created|designed|ran|handled|"
    r"prepared|supported|trained|supervised|coordinated|oversaw|achieved|hold|held|completed|gained|"
    r"am\s+(?:a|an|the|experienced|qualified|certified|skilled|trained))\b|\bmy\s+(?:experience|background|"
    r"role|time|work)\s+(?:at|as|in|with)\b|\bmy\s+(?:[\w-]+\s+){0,3}(?:experience|expertise|skills?|background|"
    r"knowledge|track\s+record|qualifications?|achievements?)\b", re.I)
# Outcome words assert results; for the candidate they need evidence. Personal motivation words are fine.
OUTCOME = re.compile(r"^(?:improv|enhanc|increas|reduc|grow|grew|saving|saved|success|significant|transform|"
                     r"impact|proven|expert|exceptional|outstanding|award|exceed|record|top)")
QUALIFICATION = re.compile(r"\b(?:phd|doctorate|msc|ma|mba|bsc|ba|degree|diploma|nvq|hnd|acca|cima|aca|fmva|cfa|"
                           r"chartered|registered|licensed|certified|accredited|dbs|hcpc|nmc|qts)\b", re.I)
MAX_NOVEL_CV = 0.6   # generic letter wording is fine; facts are policed by numbers, names, qualifications and outcomes
MAX_NOVEL_JOB = 0.5
# Claims of rank or reputation about an employer must be in the advert.
RANKING = re.compile(r"^(?:\w+est|leading|largest|biggest|premier|renowned|award|world-class|number|top|first|only|unique)$")


def _stray_names(text: str, sources: list[str]) -> list[str]:
    """Capitalised names in the sentence (not its first word) that appear in none of the sources."""
    words = re.findall(r"\b[A-Z][a-zA-Z]{2,}\b", text)
    first = re.match(r"\s*([A-Z][a-zA-Z]+)", text)
    if first and words and words[0] == first.group(1):
        words = words[1:]
    known = set(re.findall(r"\b[A-Z][a-zA-Z]{2,}\b", " ".join(sources)))
    return sorted({w for w in words if w not in known and w not in {"I", "Snapply"}})


def cv_evidence(profile: dict) -> list[str]:
    """Readable CV facts: each role with its bullets, education, certificates and skills."""
    out: list[str] = []
    for e in profile.get("experience", []) or []:
        if not isinstance(e, dict) or e.get("needs_confirmation"):
            continue
        head = " — ".join(x for x in [e.get("role") or e.get("title"), e.get("employer") or e.get("company")] if x)
        dates = str(e.get("dates") or "").strip()
        out.append(f"{head} ({dates})" if dates else head)
        # The imported role text is one block; split it into bullet-sized facts.
        detail = str(e.get("evidence") or e.get("description") or "")
        for line in re.split(r"\n+|\s*[•▪●◦·]\s*|(?<=[.;])\s+(?=[A-Z])", detail):
            line = line.strip(" -–—*\t")
            if len(line) > 12:
                out.append(f"{head}: {line}")
    for e in profile.get("education", []) or []:
        if isinstance(e, dict) and not e.get("needs_confirmation"):
            out.append("Education — " + " ".join(str(e.get(k) or "") for k in ("degree", "field", "institution")).strip())
    out += [f"Certificate — {c}" for c in completed_certifications(profile)]
    skills = profile.get("skills") or []
    if isinstance(skills, list) and skills:
        out.append("Skills — " + ", ".join(str(s) for s in skills[:40]))
    if profile.get("summary"):
        out.append(f"Profile summary — {profile['summary']}")
    return [x for x in dict.fromkeys(o.strip() for o in out) if len(x) > 3]


def job_evidence(job: dict) -> list[str]:
    parts = [str(job.get("title") or ""), str(job.get("company") or "")]
    parts += [str(r) for r in job.get("requirements") or []]
    description = str(job.get("description") or "")
    parts += [p.strip() for p in re.split(r"(?<=[.!?])\s+|\n+", description) if len(p.strip()) > 20][:120]
    return [p for p in parts if p.strip()]


def _words(text: str) -> int:
    return len(re.findall(r"\b\w[\w'-]*\b", text))


def check_sentence(sentence: dict, cv: list[str], job: list[str]) -> tuple[bool, str]:
    text = str(sentence.get("text") or "").strip()
    kind = sentence.get("kind")
    if not text:
        return False, "empty"
    facts = cv + job
    blob = " ".join(facts).lower()
    for n in re.findall(r"\d[\d,.]*%?", text):
        n = n.strip(".,")
        if not re.search(rf"(?<![\d.,]){re.escape(n)}(?![\d])", blob):
            return False, f"number {n} is not in the CV or the advert"
    for q in QUALIFICATION.findall(text):
        if not re.search(rf"\b{re.escape(q.lower())}\b", blob):
            return False, f"qualification '{q}' is not in the CV or the advert"
    context = " ".join(job[:2])
    stray = _stray_names(text, facts)
    if stray:
        return False, "names something that is not in the CV or the advert: " + ", ".join(stray)
    if kind == "cv":
        content = _content(text)
        known = _content(" ".join(cv))
        novel = content - known - _content(" ".join(job))
        if len(content & known) < min(2, len(content)):
            return False, "does not match the CV evidence"
        if len(novel) / max(1, len(content)) > MAX_NOVEL_CV:
            return False, "adds wording the CV does not support: " + ", ".join(sorted(novel)[:6])
        outcome = sorted(t for t in novel if OUTCOME.match(t))
        if outcome:
            return False, "claims results the CV does not state: " + ", ".join(outcome)
        return True, ""
    if EXPERIENCE_CLAIM.search(text):
        return False, "describes the candidate's experience, so it must be a cv sentence"
    if kind == "job":
        content = _content(text)
        known = _content(" ".join(job))
        novel = content - known
        if len(content & known) < min(2, len(content)):
            return False, "does not match the job advert"
        if len(novel) / max(1, len(content)) > MAX_NOVEL_JOB:
            return False, "says things about the role the advert does not state: " + ", ".join(sorted(novel)[:6])
        ranking = sorted(t for t in novel if RANKING.match(t) and t not in {"interest", "best"} or t in {"fastest", "largest", "leading"})
        if ranking:
            return False, "makes a claim about the employer the advert does not: " + ", ".join(ranking)
        return True, ""
    outcome_words = sorted(t for t in _content(text) - _content(" ".join(cv + job)) if OUTCOME.match(t))
    if outcome_words:
        return False, "claims results or expertise the CV and advert do not state: " + ", ".join(outcome_words)
    if kind == "courtesy":
        if _words(text) > 40:
            return False, "too long for a courtesy sentence"
        return True, ""
    return False, "unknown sentence kind"


def _call_model(payload: dict) -> dict:
    key, model = _openai_settings()
    if not key:
        raise ProviderError("AI is not configured.")
    # Letters need a stronger writer than short answers; overridable per deployment.
    model = os.getenv("SNAPPLY_LETTER_MODEL", "").strip() or "gpt-4.1"
    sentence = {"type": "object", "properties": {
        "text": {"type": "string"}, "kind": {"type": "string", "enum": ["cv", "job", "courtesy"]},
        "cv_evidence": {"type": "array", "items": {"type": "integer"}}},
        "required": ["text", "kind", "cv_evidence"], "additionalProperties": False}
    schema = {"type": "object", "properties": {"paragraphs": {"type": "array", "items": {
        "type": "object", "properties": {"sentences": {"type": "array", "items": sentence}},
        "required": ["sentences"], "additionalProperties": False}}},
        "required": ["paragraphs"], "additionalProperties": False}
    body = {"model": model, "instructions": LETTER_RULES, "input": json.dumps(payload), "store": False,
            "text": {"format": {"type": "json_schema", "name": "cover_letter", "strict": True, "schema": schema}}}
    req = urllib.request.Request("https://api.openai.com/v1/responses", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            data = json.loads(response.read().decode())
        blocks = [b for item in data.get("output", []) for b in item.get("content", [])]
        if data.get("status") != "completed" or any(b.get("type") == "refusal" for b in blocks):
            raise ProviderError("The model did not complete the letter.")
        parsed = json.loads("".join(b.get("text", "") for b in blocks if b.get("type") == "output_text"))
        if not isinstance(parsed.get("paragraphs"), list):
            raise ProviderError("The model returned an invalid letter.")
        return parsed
    except ProviderError:
        raise
    except Exception as e:  # network, JSON
        raise ProviderError("Letter request failed.") from e


def _validate(letter: dict, cv: list[str], job: list[str]) -> tuple[list[list[str]], list[dict]]:
    kept, failed = [], []
    for paragraph in letter.get("paragraphs") or []:
        ok_sentences = []
        for s in paragraph.get("sentences") or []:
            ok, why = check_sentence(s, cv, job)
            if ok:
                ok_sentences.append(str(s["text"]).strip())
            else:
                failed.append({"text": s.get("text", ""), "kind": s.get("kind"), "reason": why})
        if ok_sentences:
            kept.append(ok_sentences)
    return kept, failed


LETTER_QUESTION = re.compile(r"cover\s*letter|covering\s*letter|supporting\s*(?:statement|information)|personal\s*statement|"
                             r"why\s+(?:do\s+)?you\s+want|why\s+are\s+you\s+(?:interested|applying)|motivation|"
                             r"tell\s+us\s+(?:why|about\s+yourself)|why\s+(?:this|our)\s+(?:role|company|organisation|organization)", re.I)


def is_letter_question(label: str) -> bool:
    return bool(LETTER_QUESTION.search(label or ""))


def write_letter(profile: dict, job: dict, length: str = "standard", character_limit: int | None = None,
                 model: Callable[[dict], dict] = _call_model, transferable: bool = False,
                 question: str = "") -> dict[str, Any]:
    cv, jobtext = cv_evidence(profile), job_evidence(job)
    if not cv:
        return {"status": "ASK_USER", "reason": "Import and confirm a CV before writing a cover letter."}
    if len(jobtext) < 3:
        return {"status": "ASK_USER", "reason": "Read the job description first so the letter can be tailored to it."}
    target, maximum = LENGTHS.get(length, LENGTHS["standard"])
    if character_limit:
        maximum = min(maximum, max(80, character_limit // 6))
        target = min(target, int(maximum * 0.85))
    matches = [{"requirement": m["requirement"], "evidence": m.get("evidence") or [], "confidence": m.get("confidence")}
               for m in match_job(job, profile)]
    payload = {
        "ROLE": job.get("title"), "EMPLOYER": job.get("company") or "", "TARGET_WORDS": target, "MAX_WORDS": maximum,
        "CV_EVIDENCE": cv, "JOB_ADVERT": jobtext, "REQUIREMENT_MATCHES": matches,
        "CANDIDATE_NAME": profile.get("full_name") or "",
    }
    if question:
        payload["ANSWERING_QUESTION"] = question
    if transferable:
        payload["NOTE"] = ("The candidate's background is in a different field. Describe experience that transfers "
                           "to this role; do not say the advert's requirements are met.")
    letter = model(payload)
    kept, failed = _validate(letter, cv, jobtext)
    too_short = _words(" ".join(" ".join(p) for p in kept)) < target * 0.8
    if failed or too_short:
        if too_short:
            payload["EXPAND"] = (f"The draft was too short. Write the complete letter at about {target} words, "
                                 "with every body paragraph developed from the CV evidence and the advert.")
        payload["REVISE"] = ("Rewrite the whole letter. These sentences broke the rules and must be fixed or left out: "
                             + json.dumps(failed[:10]))
        retry = model(payload)
        kept2, failed2 = _validate(retry, cv, jobtext)
        if sum(map(len, kept2)) >= sum(map(len, kept)):
            kept, failed = kept2, failed2
    paragraphs = [" ".join(p) for p in kept]
    body = "\n\n".join(paragraphs)
    # Respect the field's limit without cutting a sentence in half.
    if character_limit and len(body) > character_limit:
        trimmed = []
        for p in paragraphs:
            if len("\n\n".join(trimmed + [p])) > character_limit:
                break
            trimmed.append(p)
        body = "\n\n".join(trimmed)
    if _words(body) < 80:
        return {"status": "ASK_USER", "reason": "Not enough CV evidence matches this job to write an honest letter.",
                "removed_sentences": [f["text"] for f in failed]}
    return {"status": "REVIEW", "body": body, "word_count": _words(body),
            "removed_sentences": [f["text"] for f in failed], "removed_reasons": failed}


def full_letter(body: str, profile: dict, job: dict) -> str:
    """Greeting and sign-off around the body, for pasting into a text box."""
    company = str(job.get("company") or "").strip()
    greeting = f"Dear {company} Hiring Team," if company else "Dear Hiring Manager,"
    name = str(profile.get("full_name") or "").strip()
    return f"{greeting}\n\n{body}\n\nYours sincerely,\n{name}".strip()
