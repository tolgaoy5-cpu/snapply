from dataclasses import dataclass, asdict
from typing import List
from evidence_matcher import match_job

@dataclass
class StatementSection:
    requirement: str
    confidence: str
    evidence: List[str]
    instruction: str


def build_plan(job: dict, profile: dict) -> dict:
    matches = match_job(job, profile)
    sections=[]
    for m in matches:
        if m['confidence']=='ASK_USER':
            instruction='Do not claim this criterion. Ask the candidate for evidence or leave it unsupported.'
        elif m['confidence']=='MEDIUM':
            instruction='Use cautiously and only paraphrase the cited evidence; do not strengthen the claim.'
        else:
            instruction='Use this evidence directly, keeping the claim within what the CV supports.'
        sections.append(asdict(StatementSection(m['requirement'],m['confidence'],m['evidence'],instruction)))
    return {
      'sections':sections,
      'generation_rules':[
        'Use only evidence listed in each section.',
        'Never invent employers, dates, qualifications, responsibilities, outcomes, tools or clinical interventions.',
        'Do not silently repair unresolved profile data.',
        'ASK_USER criteria must not be converted into positive claims.',
        'Prefer concrete examples over generic adjectives.'
      ]
    }

if __name__=='__main__':
    import argparse
    import json
    from pathlib import Path
    parser=argparse.ArgumentParser(description='Build an evidence plan from local profile and job JSON files.')
    parser.add_argument('profile_json',type=Path)
    parser.add_argument('job_json',type=Path)
    args=parser.parse_args()
    profile=json.loads(args.profile_json.read_text(encoding='utf-8'))
    job=json.loads(args.job_json.read_text(encoding='utf-8'))
    print(json.dumps(build_plan(job,profile),indent=2,ensure_ascii=False))
