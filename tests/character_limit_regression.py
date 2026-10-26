"""Workable's cover-letter box has maxlength=200000; the server used to answer that with a 422.
Limits above 20,000 now mean no limit, tiny ones are raised to 20, and real limits are kept."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
from server import AnswerRequest, RevalidateRequest

base = {'question': 'Cover letter', 'profile': {}, 'job': {}}
assert AnswerRequest(**base, character_limit=200000).character_limit is None
assert AnswerRequest(**base, character_limit=1500).character_limit == 1500
assert AnswerRequest(**base, character_limit=5).character_limit == 20
assert AnswerRequest(**base, character_limit=None).character_limit is None
assert AnswerRequest(**base, character_limit='abc').character_limit is None
assert RevalidateRequest(answer='x', allowed_evidence=[], character_limit=524288).character_limit is None
print('character limit regression passed')
