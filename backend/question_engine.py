import re
from dataclasses import dataclass, asdict
from typing import List, Dict
from evidence_matcher import match

QUESTION_TYPES = {
    'motivation': re.compile(r'why (?:do you|are you|would you).*?(?:apply|role|company|organisation|organization)|motivat', re.I),
    'competency': re.compile(r'describe|give an example|tell us about|demonstrate|evidence|competenc', re.I),
    'supporting_statement': re.compile(r'supporting statement|personal statement|suitability|essential criteria|person specification', re.I),
    'eligibility': re.compile(r'sponsor|right to work|eligible to work|driving licen[cs]e|registration|qualification required', re.I),
}

@dataclass
class QuestionPlan:
    question: str
    question_type: str
    character_limit: int | None
    matched_requirements: List[Dict]
    confidence: str
    ask_user: List[str]
    generation_rules: List[str]


def classify_question(question: str) -> str:
    for name, rx in QUESTION_TYPES.items():
        if rx.search(question or ''):
            return name
    return 'general_text'


def _requirement_score(question: str, requirement: str) -> float:
    q=set(re.findall(r'[a-z]{4,}', question.lower()))
    r=set(re.findall(r'[a-z]{4,}', requirement.lower()))
    if not q or not r: return 0.0
    return len(q & r)/max(1, min(len(r), 8))


def plan_question(question: str, profile: dict, job: dict, character_limit: int | None = None) -> dict:
    qtype=classify_question(question)
    ranked=[]
    for req in job.get('requirements',[]):
        semantic=_requirement_score(question, req)
        ev=asdict(match(req, profile))
        # Supporting statements are broad: include all criteria. Competency questions use top relevant criteria.
        if qtype=='supporting_statement' or semantic>0 or qtype=='general_text':
            ranked.append((semantic, ev))
    ranked.sort(key=lambda x:(x[0], x[1]['score']), reverse=True)
    if qtype!='supporting_statement': ranked=ranked[:4]
    matches=[m for _,m in ranked]
    ask=[m['requirement'] for m in matches if m['confidence']=='ASK_USER']
    supported=[m for m in matches if m['confidence'] in {'HIGH','MEDIUM'}]
    conf='HIGH' if supported and not ask else 'MEDIUM' if supported else 'ASK_USER'
    rules=[
        'Use only claims grounded in the listed CV/profile evidence.',
        'Do not invent tools, outcomes, dates, qualifications, diagnoses, interventions or responsibilities.',
        'Do not silently repair unresolved profile data.',
        'If a criterion is ASK_USER, do not claim the candidate meets it without new user evidence.',
        'Prefer concrete examples and preserve the character limit.'
    ]
    return asdict(QuestionPlan(question,qtype,character_limit,matches,conf,ask,rules))


def plan_questions(questions: List[dict], profile: dict, job: dict) -> List[dict]:
    return [plan_question(q['question'], profile, job, q.get('character_limit')) for q in questions]
