from question_engine import plan_question
from claim_validator import validate_answer


def _clean_evidence(evidence: str) -> str:
    # Evidence entries may contain a prefix such as "Role — Employer:". Keep readable source text only.
    return evidence.split(': ',1)[1] if ': ' in evidence else evidence


def build_evidence_locked_draft(question: str, profile: dict, job: dict, character_limit: int|None=None) -> dict:
    plan=plan_question(question, profile, job, character_limit)
    supported=[m for m in plan['matched_requirements'] if m['confidence'] in {'HIGH','MEDIUM'} and m['evidence']]
    paragraphs=[]; allowed=[]
    for m in supported[:4]:
        ev=_clean_evidence(m['evidence'][0]); allowed.extend(m['evidence'])
        paragraphs.append(ev.rstrip('.')+'.')
    if not paragraphs:
        draft=''
    else:
        # Deterministic, deliberately plain draft; production LLM can rewrite while validator enforces evidence lock.
        draft=' '.join(paragraphs)
    if character_limit and len(draft)>character_limit:
        draft=draft[:max(0,character_limit-1)].rstrip(' ,;:.')+'.'
    validation=validate_answer(draft,allowed,character_limit) if draft else {'valid':False,'unsupported_claims':[],'reason':'No supported evidence'}
    return {'plan':plan,'draft':draft,'allowed_evidence':allowed,'validation':validation}
