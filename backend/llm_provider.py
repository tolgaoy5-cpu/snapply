from __future__ import annotations
import json
import os
import tomllib
import urllib.request
from pathlib import Path

SYSTEM_RULES = """You are a job-application drafting engine. Rewrite only from supplied evidence.
Never add facts, dates, metrics, qualifications, tools, clinical interventions, outcomes or responsibilities that are not present in the evidence.
Paraphrase the evidence closely. Do not add effects, outcomes, environments, relationships, feelings or quality words (effective, strong, successful, crucial, collaborative) that the evidence does not state. Plain and specific is better than persuasive. Write one sentence per evidence item and do not end sentences with a clause about purpose, benefit or impact (no 'to ensure ...', 'which helped ...', 'providing ...').
If evidence is insufficient, say so in the structured response instead of inventing content.
Return JSON with keys: answer, used_evidence_indices, unsupported_claims. Keep within character_limit when provided."""

class ProviderError(RuntimeError):
    pass


# The OpenAI key is shared with the user's other Lunoviq tools and lives outside every repository:
# ~/.lunoviq/ai.toml ([ai] provider = "openai", api_key = "...", model = "..."). Environment variables win.
SHARED_SETTINGS = Path.home() / '.lunoviq' / 'ai.toml'
DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'


def _openai_settings() -> tuple[str, str]:
    key = os.getenv('OPENAI_API_KEY', '').strip()
    model = os.getenv('JOB_COPILOT_MODEL', '').strip()
    if not key and SHARED_SETTINGS.exists():
        try:
            cfg = tomllib.loads(SHARED_SETTINGS.read_text(encoding='utf-8')).get('ai', {})
        except (OSError, tomllib.TOMLDecodeError):
            cfg = {}
        if (cfg.get('provider') or 'openai') == 'openai':
            key = str(cfg.get('api_key') or '').strip()
            model = model or str(cfg.get('model') or '').strip()
    return key, (model or DEFAULT_OPENAI_MODEL) if key else ''


def model_status() -> dict:
    """What the panel may show: provider and model, never the key."""
    if os.getenv('JOB_COPILOT_MODEL_URL', '').strip():
        return {'configured': True, 'provider': 'configured-http', 'model': None}
    key, model = _openai_settings()
    return {'configured': bool(key), 'provider': 'openai' if key else None, 'model': model or None}


def model_configured() -> bool:
    return model_status()['configured']


def _openai_response(question: str, plan: dict, character_limit: int | None) -> dict:
    schema = {
        'type': 'object', 'properties': {
            'answer': {'type': 'string'},
            'used_evidence_indices': {'type': 'array', 'items': {'type': 'integer'}},
            'unsupported_claims': {'type': 'array', 'items': {'type': 'string'}},
        },
        'required': ['answer', 'used_evidence_indices', 'unsupported_claims'],
        'additionalProperties': False,
    }
    payload = {
        'model': _openai_settings()[1],
        'instructions': SYSTEM_RULES,
        'input': json.dumps({'question': question, 'plan': plan, 'character_limit': character_limit}),
        'text': {'format': {'type': 'json_schema', 'name': 'job_application_answer', 'strict': True, 'schema': schema}},
        'store': False,
    }
    req = urllib.request.Request(
        'https://api.openai.com/v1/responses', data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f"Bearer {_openai_settings()[0]}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode())
        if data.get('status') != 'completed':
            raise ProviderError('Model response was not completed.')
        blocks = [block for item in data.get('output', []) for block in item.get('content', [])]
        if any(block.get('type') == 'refusal' for block in blocks):
            raise ProviderError('Model declined to generate a response.')
        content = ''.join(block.get('text', '') for block in blocks if block.get('type') == 'output_text')
        parsed = json.loads(content)
        if not isinstance(parsed, dict) or not isinstance(parsed.get('answer'), str):
            raise ProviderError('Model returned an invalid answer.')
        parsed['provider'] = 'openai-responses'
        return parsed
    except ProviderError:
        raise
    except Exception as e:
        raise ProviderError('Model request failed or returned an invalid response.') from e


def _deterministic(plan: dict, character_limit: int | None = None) -> dict:
    evidence=[]
    for m in plan.get('matched_requirements', []):
        if m.get('confidence') in {'HIGH','MEDIUM'}:
            evidence.extend(m.get('evidence') or [])
    unique=[]
    for e in evidence:
        if e not in unique:
            unique.append(e)
    answer=' '.join(e.split(': ',1)[1] if ': ' in e else e for e in unique[:4]).strip()
    answer=' '.join(answer.split())
    if character_limit and len(answer)>character_limit:
        answer=answer[:max(0,character_limit-1)].rstrip(' ,;:.')+'.'
    return {'answer':answer,'used_evidence_indices':list(range(min(4,len(unique)))),'unsupported_claims':[],'provider':'deterministic-fallback'}


def rewrite(question: str, plan: dict, character_limit: int | None = None) -> dict:
    """Rewrite via a configured JSON endpoint or the OpenAI Responses API."""
    url=os.getenv('JOB_COPILOT_MODEL_URL','').strip()
    if not url:
        if _openai_settings()[0]:
            return _openai_response(question, plan, character_limit)
        return _deterministic(plan,character_limit)
    payload={
        'system':SYSTEM_RULES,
        'question':question,
        'character_limit':character_limit,
        'plan':plan,
    }
    req=urllib.request.Request(url,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
    token=os.getenv('JOB_COPILOT_MODEL_TOKEN','').strip()
    if token:
        req.add_header('Authorization',f'Bearer {token}')
    try:
        with urllib.request.urlopen(req,timeout=30) as r:
            data=json.loads(r.read().decode())
    except Exception as e:
        raise ProviderError(str(e)) from e
    if isinstance(data,dict) and 'answer' in data:
        data.setdefault('provider','configured-http')
        return data
    # Keep the existing custom endpoint response format for older deployments.
    try:
        content=data['choices'][0]['message']['content']
        parsed=json.loads(content) if isinstance(content,str) and content.lstrip().startswith('{') else {'answer':content}
        parsed.setdefault('used_evidence_indices',[]); parsed.setdefault('unsupported_claims',[]); parsed['provider']='configured-http'
        return parsed
    except Exception as e:
        raise ProviderError('Configured model endpoint returned an unsupported response shape') from e
