"""Cover letters: full, structured and persuasive, but every claim checked by kind (CV, advert, courtesy).

The model is replaced by scripted responses; nothing is sent anywhere.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
import letter_writer as L

profile = {
    'full_name': 'Alex Morgan',
    'experience': [{'role': 'Finance Manager', 'employer': 'Northbridge Properties', 'dates': '2021-Present',
                    'evidence': 'Prepare monthly management accounts for a portfolio of 400 residential properties.\n'
                                'Lead the annual budget and quarterly reforecasts with property managers.\n'
                                'Built a cash flow model in Excel used by the board.'}],
    'education': [{'degree': 'MSc', 'field': 'Finance', 'institution': 'University of Leeds'}],
    'certifications': [],
}
job = {'title': 'Financial Analyst', 'company': 'Harbour Homes', 'url': 'https://jobs.example.com/1',
       'requirements': ['Experience preparing management accounts', 'Budgeting and forecasting experience',
                        'Advanced Excel modelling skills'],
       'description': 'Harbour Homes is a housing association providing 12,000 affordable homes across London. '
                      'The Financial Analyst will support budgeting, forecasting and monthly reporting to the executive team.'}

cv = L.cv_evidence(profile)
assert any('400 residential properties' in c for c in cv) and any('cash flow model' in c for c in cv)
jobtext = L.job_evidence(job)

ok = lambda text, kind: L.check_sentence({'text': text, 'kind': kind}, cv, jobtext)[0]
# CV sentences: rephrasing is fine; invented results, numbers and qualifications are not.
assert ok('At Northbridge Properties I prepare monthly management accounts for a portfolio of 400 residential properties.', 'cv')
assert not ok('I prepare management accounts for 900 properties.', 'cv')
assert not ok('I significantly improved forecasting accuracy across the business.', 'cv')
assert not ok('I hold an ACCA qualification and lead the annual budget.', 'cv')
# Advert sentences: about the employer, from the advert.
assert ok('Harbour Homes provides 12,000 affordable homes across London.', 'job')
assert not ok('Harbour Homes is the fastest growing housing association in Europe.', 'job')
# Experience smuggled in as courtesy or advert wording is rejected.
assert not ok('I have led large finance teams for many years.', 'courtesy')
assert not ok('I managed reporting to the executive team at Harbour Homes.', 'job')
# Courtesy: no facts, no unknown names, no numbers.
assert ok('I would welcome the opportunity to discuss how I could support your team.', 'courtesy')
assert not ok('I would welcome the chance to bring what I learned at Goldman to your team.', 'courtesy')
assert not ok('I am available to start within 2 weeks.', 'courtesy')

calls = []
def scripted(responses):
    def model(payload):
        calls.append(payload)
        return responses[len(calls) - 1]
    return model

S = lambda text, kind: {'text': text, 'kind': kind, 'cv_evidence': []}
good = {'paragraphs': [
    {'sentences': [S('The Financial Analyst role at Harbour Homes, supporting budgeting, forecasting and monthly reporting to the executive team, matches the work I do every day.', 'job'),
                   S('As Finance Manager at Northbridge Properties I prepare monthly management accounts for a portfolio of 400 residential properties.', 'cv')]},
    {'sentences': [S('I lead the annual budget and quarterly reforecasts with property managers at Northbridge Properties.', 'cv'),
                   S('I built a cash flow model in Excel that the board uses.', 'cv'),
                   S('Harbour Homes provides 12,000 affordable homes across London, and the reporting behind that work is what I enjoy most.', 'job')]},
    {'sentences': [S('My MSc in Finance from the University of Leeds underpins this work.', 'cv'),
                   S('I significantly improved the accuracy of every forecast.', 'cv')]},
    {'sentences': [S('I would welcome the opportunity to discuss how I could support your team.', 'courtesy')]},
]}
better = {'paragraphs': good['paragraphs'][:2] + [{'sentences': [good['paragraphs'][2]['sentences'][0]]}] + good['paragraphs'][3:]}
res = L.write_letter(profile, job, model=scripted([good, better]))
assert res['status'] == 'REVIEW', res
assert len(calls) == 2 and 'REVISE' in calls[1] and 'significantly' in calls[1]['REVISE']
assert 'significantly' not in res['body'] and '400 residential properties' in res['body']
assert res['body'].count('\n\n') == 3 and res['word_count'] >= 80
assert calls[0]['TARGET_WORDS'] == 380 and calls[0]['EMPLOYER'] == 'Harbour Homes'

# A field limit is respected without cutting a sentence.
calls.clear()
short = L.write_letter(profile, job, character_limit=600, model=scripted([better]))
assert short['status'] in ('REVIEW', 'ASK_USER')
if short['status'] == 'REVIEW':
    assert len(short['body']) <= 600 and short['body'].endswith('.')

full = L.full_letter(res['body'], profile, job)
assert full.startswith('Dear Harbour Homes Hiring Team,') and full.rstrip().endswith('Alex Morgan')
assert L.is_letter_question('Cover letter') and L.is_letter_question('Please provide your supporting statement')
assert L.is_letter_question('Why do you want to work for us?') and not L.is_letter_question('Notice period')
print('letter writer ok')
