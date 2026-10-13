import re
from dataclasses import dataclass, asdict
from typing import List

GENERIC_SAFE={
 'i','am','have','my','and','the','a','an','to','of','in','with','for','this','role','experience','skills','work','working',
 'support','supported','supporting','through','also','while','across','including','which','that','as','has','been','from'
}

@dataclass
class ClaimCheck:
    sentence: str
    supported: bool
    support_score: float
    matched_evidence: List[str]
    risk_terms: List[str]


def _tokens(s):
    return {x for x in re.findall(r"[a-z][a-z'-]{3,}", (s or '').lower()) if x not in GENERIC_SAFE}


# Words that carry no claim of their own (connectives, letter phrasing). Everything else in a
# sentence should come from the evidence: a draft may rephrase, not add effects or qualities.
CONNECTIVE = GENERIC_SAFE | {
    'had','on','at','by','these','those','roles','experiences','skill','both','each','where','when','during','time',
    'within','able','ability','would','could','well','such','using','used','use','position','post','team','apply',
    'applying','application','opportunity','additionally','furthermore','moreover','particular','particularly',
    'previous','previously','current','currently','recent','recently','various','different','regular','regularly',
    'alongside','whilst','them','they','their','there','into','over','under','about','more','most','other','others',
    'very','just','what','who','whom','whose','will','shall','should','was','were','are','is','be','being','did',
    'does','do','not','all','any','some','one','two','three','me','we','our','us','it','its','so','or','but','if',
}
PUFFERY = re.compile(r'^(?:better|best|effective|efficient|enhanc|improv|facilitat|foster|ensur|crucial|significant|strong|excellent|outstanding|exceptional|valuable|successful|contribut|collaborative|empower|thriv|excel|passionate|dedicat|committ|impact|transform|drive|driven|proven|expert|extensive|deep|robust|innovative)')
MAX_NOVEL_RATIO = 0.34   # measured live 2026-10-13: faithful sentences 0.00-0.15, embellished 0.62-0.70


# US/UK spellings and plain synonyms the model swaps in for CV wording.
EQUIVALENT = {
    'behavior': 'behaviour', 'behaviors': 'behaviour', 'behavioral': 'behavioural', 'utilize': 'use', 'utilized': 'use',
    'utilise': 'use', 'utilised': 'use', 'utilizing': 'use', 'utilising': 'use', 'organize': 'organise', 'organized': 'organised',
    'students': 'pupils', 'student': 'pupils', 'children': 'pupils', 'child': 'pupils', 'learners': 'pupils',
    'one-on-one': '1:1', 'one-to-one': '1:1', 'individually': '1:1', 'colleagues': 'teachers', 'carers': 'parents',
}


def _stem(word: str) -> str:
    w = EQUIVALENT.get(word.lower().strip("'-"), word.lower().strip("'-"))
    for suffix in ("'s", 'ies', 'ing', 'ed', 'es', 'ly', 's'):
        if w.endswith(suffix) and len(w) - len(suffix) >= 4:
            return w[:-len(suffix)] + ('y' if suffix == 'ies' else '')
    return w


def _content(s: str) -> set:
    return {_stem(x) for x in re.findall(r"[a-z][a-z'-]{2,}", (s or '').lower())
            if len(x) >= 4 and x not in CONNECTIVE and _stem(x) not in CONNECTIVE}


def validate_claim(sentence: str, allowed_evidence: List[str], context: str = '') -> dict:
    st=_tokens(sentence)
    best=0.0; hits=[]
    for ev in allowed_evidence:
        et=_tokens(ev)
        score=len(st & et)/max(1,min(len(st),8))
        if score>0: hits.append(ev)
        best=max(best,score)
    # Explicit numerical/credential/clinical claims deserve stronger evidence.
    risk=[]
    for pat,name in [(r'\b\d+\b','number'),(r'certif|registered|licensed','credential'),(r'cognitive behavioural|cbt|dbt|therapy protocol|diagnos','specific clinical claim')]:
        if re.search(pat,sentence,re.I): risk.append(name)
    evidence_blob=' '.join(allowed_evidence).lower()
    exact_risk_ok=True
    if 'number' in risk:
        for n in re.findall(r'\b\d+\b', sentence):
            if re.search(rf'\b{re.escape(n)}\b', evidence_blob) is None:
                exact_risk_ok=False
    if 'credential' in risk and not any(k in evidence_blob for k in ['registered','licensed','certif']):
        exact_risk_ok=False
    # Overlapping experience words must not validate an unrelated credential in
    # the same sentence. Check explicit qualifications against evidence verbatim.
    for credential in re.findall(r'\b(?:phd|doctorate|doctoral|hcpc|bps|dbs|nvq|msc|bsc)\b',sentence,re.I):
        risk.append('specific qualification')
        if not re.search(rf'\b{re.escape(credential.lower())}\b',evidence_blob):
            exact_risk_ok=False
    if 'specific clinical claim' in risk:
        clinical_terms=[k for k in ['cbt','cognitive behavioural','dbt','therapy protocol','diagnos'] if k in sentence.lower()]
        if any(k not in evidence_blob for k in clinical_terms): exact_risk_ok=False
    # Grounding: most content words must come from the evidence (or the job title/company in context).
    content = _content(sentence)
    known = _content(' '.join(allowed_evidence))
    overlap = content & known
    novel = sorted(content - known - _content(context))
    # Outcome and quality words are claims in themselves; they need to be in the evidence.
    puffery = [t for t in novel if PUFFERY.match(t)]
    grounded = (len(overlap) >= min(2, len(content)) and len(novel) / max(1, len(content)) <= MAX_NOVEL_RATIO
                and not puffery)
    supported = best>=0.25 and exact_risk_ok and grounded
    result = asdict(ClaimCheck(sentence,supported,round(best,2),hits[:3],risk))
    result['novel_terms'] = novel
    result['grounded'] = grounded          # wording beyond the evidence (a warning for user-edited text)
    result['risk_ok'] = exact_risk_ok      # numbers, credentials, qualifications must match the evidence
    return result


def validate_answer(answer: str, allowed_evidence: List[str], character_limit: int|None=None, context: str='') -> dict:
    sentences=[s.strip() for s in re.split(r'(?<=[.!?])\s+', answer.strip()) if s.strip()]
    checks=[validate_claim(s,allowed_evidence,context) for s in sentences]
    return {
      'valid': all(c['supported'] for c in checks) and (not character_limit or len(answer)<=character_limit),
      'character_count':len(answer),
      'character_limit':character_limit,
      'over_limit':bool(character_limit and len(answer)>character_limit),
      'claims':checks,
      'unsupported_claims':[c['sentence'] for c in checks if not c['supported']]
    }


# Models like to end a faithful sentence with an invented purpose or effect ("..., which helped...",
# "... to ensure ..."). Cutting that tail often leaves a sentence the evidence supports.
TAIL = re.compile(r',\s*(?:which|providing|ensuring|allowing|enabling|helping|fostering|contributing|resulting|leading|thereby|aiming)\b'
                  r'|\s+(?:to (?:ensure|help|assist|support|promote|improve|enhance|foster|maintain|create|meet|address)|in order to|so that|regarding|which)\b', re.I)


def _trimmed(sentence: str, allowed_evidence: List[str], context: str) -> str | None:
    cuts = [m.start() for m in TAIL.finditer(sentence)]
    for cut in sorted(cuts, reverse=True):
        candidate = sentence[:cut].rstrip(' ,;:') + '.'
        if len(candidate.split()) >= 5 and validate_claim(candidate, allowed_evidence, context)['supported']:
            return candidate
    return None


def keep_grounded(answer: str, allowed_evidence: List[str], context: str = '') -> tuple[str, list]:
    """Keep grounded sentences, trim invented tails where that suffices, drop the rest (paragraphs kept)."""
    kept_paragraphs, removed = [], []
    for paragraph in re.split(r'\n\s*\n', answer.strip()):
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', paragraph.strip()) if s.strip()]
        kept = []
        for sentence in sentences:
            if validate_claim(sentence, allowed_evidence, context)['supported']:
                kept.append(sentence); continue
            short = _trimmed(sentence, allowed_evidence, context)
            if short:
                kept.append(short)
            removed.append(sentence)
        if kept:
            kept_paragraphs.append(' '.join(kept))
    return '\n\n'.join(kept_paragraphs), removed


def grounded_rewrite(rewrite_fn, question: str, plan: dict, limit, allowed_evidence: List[str], context: str = '') -> dict:
    """Draft, give the model one chance to fix ungrounded sentences, then remove what is still ungrounded."""
    drafted = rewrite_fn(question, plan, limit)
    answer = str(drafted.get('answer') or '').strip()
    flagged = [c for c in validate_answer(answer, allowed_evidence, limit, context)['claims'] if not c['supported']] if answer else []
    if flagged and drafted.get('provider') != 'deterministic-fallback':
        feedback = ' '.join(f'"{c["sentence"]}" (not in the evidence: {", ".join(c.get("novel_terms") or []) or "unsupported"})' for c in flagged[:8])
        retry = rewrite_fn(question + '\nRevise the draft. These sentences went beyond the evidence: ' + feedback +
                           ' Paraphrase the evidence closely and leave out anything it does not state.', plan, limit)
        retry_answer = str(retry.get('answer') or '').strip()
        if retry_answer:
            drafted, answer = retry, retry_answer
    final, removed = keep_grounded(answer, allowed_evidence, context)
    return {**drafted, 'answer': final, 'removed_sentences': removed}
