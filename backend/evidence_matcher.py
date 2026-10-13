import re
from dataclasses import dataclass, asdict
from typing import List

STOP={'ability','supporting','young','people','settings','requirements','related','strong','multiple','accurate','standards',
      'required','certificate','certification','qualification','training'}
SYNONYMS={
 'therapeutic':{'counselling','therapy','psychologist','emotional','wellbeing'},
 'families':{'family','parents'}, 'education':{'school','teacher','pupils','students','classroom'},
 'safeguarding':{'safeguarding','privacy','confidentiality','prevent'},
 'records':{'recorded','notes','observations','record'}, 'cultural':{'cultural','multicultural','translation','interpretation'},
 'communication':{'communication','liaising','translation','interpretation'}, 'research':{'research','dissertation','systematic','review'},
 'psychology':{'psychology','psychologist','counselling'}, 'supervision':{'supervised','supervision'}
}
def tokens(s): return {x for x in re.findall(r"[a-z]{3,}",s.lower())
                       if x not in STOP and (len(x)>=4 or x in {'cbt','dbt','nhs','bps','msc','bsc','phd'})}
def blob(exp): return ' '.join(str(v) for k,v in exp.items() if k not in {'needs_confirmation'}).lower()
PENDING_CERT=re.compile(r'\b(?:planned|planning|intend(?:ed|ing)?|upcoming|scheduled|in progress|working towards|pursuing|not yet completed|to be completed|future training)\b',re.I)

def completed_certifications(profile):
    for item in profile.get('certifications') or []:
        if isinstance(item,dict):
            if item.get('needs_confirmation') or str(item.get('status','')).lower() in {'planned','pending','in progress','ongoing'}:
                continue
            label=str(item.get('name') or item.get('title') or '').strip()
        elif isinstance(item,str):
            label=item.strip()
        else:
            continue
        if label and not PENDING_CERT.search(label):
            yield label
@dataclass
class EvidenceMatch:
    requirement:str; score:float; confidence:str; evidence:List[str]; unsupported:List[str]

def match(requirement:str, profile:dict)->EvidenceMatch:
    rt=tokens(requirement); expanded=set(rt)
    for t in list(rt): expanded |= SYNONYMS.get(t,set())
    hits=[]; best=0.0
    for exp in profile.get('experience',[]):
        if exp.get('needs_confirmation'):
            continue
        b=blob(exp); matched={t for t in expanded if t in b}; score=len(matched)/max(1,min(len(rt),6))
        if score>=0.25:
            hits.append(f"{exp.get('role','')} — {exp.get('employer','')}: {exp.get('evidence','') or exp.get('dates','')}")
            best=max(best,score)
    for edu in profile.get('education',[]):
        if edu.get('needs_confirmation'):
            continue
        b=blob(edu); matched={t for t in expanded if t in b}; score=len(matched)/max(1,min(len(rt),6))
        if score>=0.25:
            hits.append(f"Education — {edu.get('degree','')} at {edu.get('institution','')}");best=max(best,score)
    for cert in completed_certifications(profile):
        if any(t in cert.lower() for t in expanded):
            hits.append('Certificate — '+cert);best=max(best,.5)
    conf='HIGH' if best>=.6 and hits else 'MEDIUM' if hits else 'ASK_USER'
    return EvidenceMatch(requirement,round(min(best,1),2),conf,hits,[] if hits else sorted(rt))

def match_job(job,profile): return [asdict(match(r,profile)) for r in job.get('requirements',[])]
