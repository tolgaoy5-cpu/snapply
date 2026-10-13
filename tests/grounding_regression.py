"""AI drafts may rephrase CV evidence but not add effects, qualities or outcomes (live finding 2026-10-13)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
from claim_validator import validate_claim, keep_grounded, grounded_rewrite  # noqa: E402

EVIDENCE = ['Teaching Assistant — Example School: Supported pupils with special educational needs in small groups and 1:1. '
            'Used de-escalation strategies and positive behaviour plans. Wrote weekly updates for class teachers and parents.']
FAITHFUL = [
    'In my role as a Teaching Assistant at Example School, I had the opportunity to support pupils with special educational needs both in small groups and in one-on-one settings.',
    'I used de-escalation strategies and positive behaviour plans, and wrote weekly updates for class teachers and parents.',
]
EMBELLISHED = [  # produced by gpt-4o-mini for this evidence; the old validator accepted all of them
    'This experience allowed me to implement de-escalation strategies and positive behaviour plans effectively, which contributed to creating a supportive learning environment.',
    "Additionally, I regularly wrote weekly updates for class teachers and parents to ensure effective communication regarding each student's progress and challenges, fostering a collaborative approach to support.",
    'My ability to use behaviour management strategies was crucial during this time, as I adapted my techniques to meet the varying needs of the children.',
]
for s in FAITHFUL:
    assert validate_claim(s, EVIDENCE)['supported'], s
EMBELLISHED.append('Additionally, I wrote weekly updates for class teachers and parents, which facilitated better understanding and coordination regarding pupil needs.')
# US spelling and plain synonyms are not new content.
assert validate_claim('I utilized de-escalation strategies and positive behavior plans with students.', EVIDENCE)['supported']
# A certificate in the evidence supports a sentence naming it.
assert validate_claim('I hold a Paediatric First Aid certificate.', EVIDENCE+['Certificate — Paediatric First Aid (12 hour)'])['supported']
EMBELLISHED.append('I also wrote weekly updates for class teachers and parents, providing insights into student participation and engagement.')
for s in EMBELLISHED:
    c = validate_claim(s, EVIDENCE)
    assert not c['supported'] and not c['grounded'] and c['risk_ok'], s

# The job title/company may be named without counting as new content.
assert validate_claim('I am applying for the Teaching Assistant post at Example Academy, having supported pupils with special educational needs.', EVIDENCE, 'Teaching Assistant Example Academy')['supported']

# Unsupported sentences are removed; paragraphs survive.
text = FAITHFUL[0] + ' ' + EMBELLISHED[0] + '\n\n' + FAITHFUL[1]
kept, removed = keep_grounded(text, EVIDENCE)
assert kept == FAITHFUL[0] + '\n\n' + FAITHFUL[1] and removed == [EMBELLISHED[0]]

# One revision round: the model sees what went beyond the evidence and rewrites.
calls = []
def fake_rewrite(question, plan, limit):
    calls.append(question)
    return {'answer': ' '.join(EMBELLISHED) if len(calls) == 1 else ' '.join(FAITHFUL), 'provider': 'test'}
out = grounded_rewrite(fake_rewrite, 'Write a cover letter', {}, 3500, EVIDENCE)
assert len(calls) == 2 and 'went beyond the evidence' in calls[1] and 'environment' in calls[1]
assert out['answer'] == ' '.join(FAITHFUL) and out['removed_sentences'] == []

# If the revision still embellishes, those sentences are dropped and reported.
calls.clear()
out = grounded_rewrite(lambda q, p, l: (calls.append(q), {'answer': FAITHFUL[0] + ' ' + EMBELLISHED[2], 'provider': 'test'})[1], 'q', {}, 3500, EVIDENCE)
assert out['answer'] == FAITHFUL[0] and out['removed_sentences'] == [EMBELLISHED[2]]

# An invented tail is trimmed when the rest is supported (live gpt-4o-mini output).
CERT_EV = EVIDENCE + ['Certificate — Paediatric First Aid (12 hour)']
kept, removed = keep_grounded('I possess a Certificate in Paediatric First Aid, which aids in ensuring the safety and support of children in educational settings.', CERT_EV)
assert kept == 'I possess a Certificate in Paediatric First Aid.' and len(removed) == 1, kept

# Credentials still need verbatim evidence.
assert not validate_claim('I hold a DBS certificate and supported pupils with special educational needs.', EVIDENCE)['risk_ok']
print('Grounding regression passed (faithful kept, embellishment flagged, one revision, removal, credentials)')

# Requirement extraction: short criteria starting with "Experience" are criteria, heading-only lines are not.
from requirement_extractor import extract_requirements  # noqa: E402
reqs = extract_requirements('Teaching Assistant\nEssential criteria\nExperience supporting children with special educational needs\n'
                            'Good communication with teachers and parents\nDesirable criteria\nPaediatric first aid certificate\n'
                            'Experience\nSkills and knowledge\nKnowledge of safeguarding procedures')
assert reqs == ['Experience supporting children with special educational needs', 'Good communication with teachers and parents',
                'Paediatric first aid certificate', 'Knowledge of safeguarding procedures'], reqs
print('Requirement extraction regression passed')
