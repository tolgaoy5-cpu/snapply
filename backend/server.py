from __future__ import annotations
from fastapi import FastAPI, HTTPException, UploadFile, File, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Any
from tempfile import NamedTemporaryFile
from pathlib import Path
import os

from requirement_extractor import analyze_job
from question_engine import plan_question
from claim_validator import validate_answer, grounded_rewrite
from llm_provider import rewrite, ProviderError, model_status
from cv_import import import_cv
from profile_review import review_items, resolve_profile
from state_store import load_state, set_master_profile, set_memory_item, replace_memory, upsert_saved_answer, delete_saved_answer, set_referees, save_cv, get_saved_cv_meta, get_saved_cv_bytes, forget_saved_cv
from cover_letter import generate as generate_cover_letter, render as render_cover_letter
from origin_policy import EXTENSION_ORIGIN, origin_allowed

app=FastAPI(title='Snapply Core API',version='0.26.31')
app.add_middleware(CORSMiddleware,allow_origins=[],allow_origin_regex=EXTENSION_ORIGIN,
                   allow_credentials=False,allow_methods=['POST','GET','DELETE'],allow_headers=['Content-Type'])

@app.middleware('http')
async def reject_foreign_origins(request:Request,call_next):
    if not origin_allowed(request.headers.get('origin')):
        return JSONResponse(status_code=403,content={'detail':'Origin is not allowed on this local API.'})
    return await call_next(request)

class JobCapture(BaseModel):
    title:str=''; company:str=''; url:str=''; text:str=''

class AnswerRequest(BaseModel):
    question:str
    profile:dict[str,Any]
    job:dict[str,Any]
    character_limit:int|None=Field(default=None,ge=20,le=20000)

class AnswerBatchRequest(BaseModel):
    questions:list[dict[str,Any]]
    profile:dict[str,Any]
    job:dict[str,Any]

class CoverLetterRequest(BaseModel):
    job:dict[str,Any]
    transferable:bool=False

class CoverLetterRenderRequest(BaseModel):
    job:dict[str,Any]
    body:str=Field(min_length=1,max_length=3500)
    format:str='pdf'
    own:bool=False

@app.post('/v1/cover-letter/generate')
def cover_letter_generate(r:CoverLetterRequest):
    profile=_refresh_profile_from_saved_cv_if_needed().get('master_profile') or {}
    try:
        return generate_cover_letter(profile,r.job,transferable=r.transferable)
    except ProviderError as e:
        raise HTTPException(status_code=502,detail=f'Model provider error: {e}') from e

@app.post('/v1/cover-letter/render')
def cover_letter_render(r:CoverLetterRenderRequest):
    profile=_refresh_profile_from_saved_cv_if_needed().get('master_profile') or {}
    return render_cover_letter(profile,r.job,r.body,r.format,r.own)

def _generate_one(r:AnswerRequest)->dict[str,Any]:
    plan=plan_question(r.question,r.profile,r.job,r.character_limit)
    allowed=[]
    for m in plan.get('matched_requirements',[]):
        if m.get('confidence') in {'HIGH','MEDIUM'}:
            allowed.extend(m.get('evidence') or [])
    if not allowed:
        return {'status':'ASK_USER','plan':plan,'answer':'','validation':{'valid':False,'reason':'No supported evidence'},'insert_allowed':False}
    context=f"{r.job.get('title') or ''} {r.job.get('company') or ''}"
    try:
        drafted=grounded_rewrite(rewrite,r.question,plan,r.character_limit,allowed,context)
    except ProviderError as e:
        raise HTTPException(status_code=502,detail=f'Model provider error: {e}')
    answer=(drafted.get('answer') or '').strip()
    validation=validate_answer(answer,allowed,r.character_limit,context) if answer else {'valid':False,'unsupported_claims':[],'reason':'Nothing in the draft was supported by your CV'}
    status='REVIEW' if answer else 'ASK_USER'
    if drafted.get('unsupported_claims') or validation.get('unsupported_claims'):
        status='REVIEW'
    return {
        'status':status,
        'answer':answer,
        'plan':plan,
        'allowed_evidence':allowed,
        'used_evidence_indices':drafted.get('used_evidence_indices',[]),
        'provider':drafted.get('provider'),
        'validation':validation,
        'insert_allowed':bool(validation.get('valid')),
        'removed_sentences':drafted.get('removed_sentences',[]),
    }


class RevalidateRequest(BaseModel):
    answer:str
    allowed_evidence:list[str]
    character_limit:int|None=Field(default=None,ge=20,le=20000)

class ResolveProfileRequest(BaseModel):
    profile:dict[str,Any]
    unresolved_id:str
    value:str

@app.post('/v1/answers/revalidate')
def revalidate(r:RevalidateRequest):
    validation=validate_answer(r.answer.strip(),r.allowed_evidence,r.character_limit)
    return {'validation':validation,'insert_allowed':bool(validation.get('valid'))}

@app.post('/v1/profile/resolve')
def profile_resolve(r:ResolveProfileRequest):
    try:
        profile=resolve_profile(r.profile,r.unresolved_id,r.value.strip())
    except ValueError as e:
        raise HTTPException(status_code=422,detail=str(e))
    set_master_profile(profile)
    return {'ok':True,'profile':profile,'unresolved':review_items(profile),'review_required':bool(profile.get('unresolved'))}


class MemoryItemRequest(BaseModel):
    key:str
    value:str
    confirmed_at:str|None=None
    source:str='user_confirmed'

class MemoryReplaceRequest(BaseModel):
    memory:dict[str,Any]

class RefereesRequest(BaseModel):
    referees:list[dict[str,Any]]=Field(max_length=10)

class SavedAnswerRequest(BaseModel):
    signature:str=Field(min_length=1,max_length=2000)
    question:str=Field(min_length=1,max_length=8000)
    value:str=Field(min_length=1,max_length=20000)
    kind:str='text'
    sensitivity:str='normal'
    confirmed_at:str|None=None
    source:str='user_confirmed'

def _refresh_profile_from_saved_cv_if_needed():
    state=load_state()
    profile=state.get('master_profile') or {}
    parser=(profile.get('import_meta') or {}).get('parser')
    meta=get_saved_cv_meta(); content=get_saved_cv_bytes()
    if parser=='deterministic-v0.26.6' or not meta or content is None:
        return state
    suffix=Path(meta.get('name') or 'cv.pdf').suffix.lower() or '.pdf'
    path=None
    try:
        with NamedTemporaryFile(delete=False,suffix=suffix) as tmp:
            tmp.write(content); path=tmp.name
        refreshed=import_cv(path)
        refreshed.setdefault('import_meta',{})['original_filename']=meta.get('name')
        set_master_profile(refreshed)
        return load_state()
    except Exception:
        return state
    finally:
        if path:
            try: os.unlink(path)
            except OSError: pass

@app.get('/v1/state')
def state_get():
    state=_refresh_profile_from_saved_cv_if_needed()
    return {'ok':True,**state}

@app.post('/v1/state/profile')
def state_profile(profile:dict[str,Any]):
    state=set_master_profile(profile)
    return {'ok':True,'master_profile':state['master_profile']}

@app.post('/v1/state/memory/item')
def state_memory_item(r:MemoryItemRequest):
    key=r.key.strip()
    value=r.value.strip()
    if not key or not value:
        raise HTTPException(status_code=422,detail='Memory key and value are required')
    item={'value':value,'confirmed_at':r.confirmed_at,'source':r.source or 'user_confirmed'}
    state=set_memory_item(key,item)
    return {'ok':True,'key':key,'item':state['application_memory'][key],'application_memory':state['application_memory']}

@app.post('/v1/state/memory')
def state_memory_replace(r:MemoryReplaceRequest):
    state=replace_memory(r.memory)
    return {'ok':True,'application_memory':state['application_memory']}


@app.post('/v1/state/answers')
def state_answer_upsert(r:SavedAnswerRequest):
    if r.kind not in ('text','choice'):
        raise HTTPException(status_code=422,detail='kind must be text or choice')
    if r.sensitivity=='never':
        raise HTTPException(status_code=422,detail='This question type is never stored')
    item={'signature':r.signature.strip(),'question':r.question.strip(),'value':r.value.strip(),'kind':r.kind,
          'sensitivity':r.sensitivity,'confirmed_at':r.confirmed_at,'source':r.source or 'user_confirmed'}
    if not item['signature'] or not item['value']:
        raise HTTPException(status_code=422,detail='Question and answer are required')
    state=upsert_saved_answer(item)
    return {'ok':True,'item':state['saved_answers'][item['signature']],'saved_answers':state['saved_answers']}

@app.delete('/v1/state/answers/{signature}')
def state_answer_delete(signature:str):
    state=delete_saved_answer(signature)
    return {'ok':True,'saved_answers':state['saved_answers']}


@app.get('/v1/state/cv')
def state_cv_get():
    meta=get_saved_cv_meta()
    return {'ok':True,'saved':bool(meta),'cv':meta}

@app.get('/v1/state/cv/content')
def state_cv_content():
    meta=get_saved_cv_meta()
    content=get_saved_cv_bytes()
    if not meta or content is None:
        raise HTTPException(status_code=404,detail='No saved CV')
    headers={'Content-Disposition':f'attachment; filename="{meta.get("name","cv")}"'}
    return Response(content=content,media_type=meta.get('type') or 'application/octet-stream',headers=headers)

@app.delete('/v1/state/cv')
def state_cv_delete():
    forget_saved_cv()
    return {'ok':True,'saved':False}

@app.post('/v1/state/referees')
def state_referees(r:RefereesRequest):
    clean=[]
    for ref in r.referees:
        fields={str(k)[:80]:str(v)[:300] for k,v in (ref.get('fields') or {}).items() if str(v).strip()}
        if fields:
            clean.append({'label':str(ref.get('label') or '')[:160],'fields':fields,'confirmed_at':ref.get('confirmed_at')})
    state=set_referees(clean)
    return {'ok':True,'referees':state['referees']}

@app.get('/v1/ai/status')
def ai_status():
    return {'ok':True,**model_status()}

@app.get('/health')
def health():
    return {'ok':True,'version':'0.26.31'}

@app.post('/v1/job/analyze')
def job_analyze(p:JobCapture):
    return analyze_job(p.model_dump())

@app.post('/v1/profile/import')
async def profile_import(file:UploadFile=File(...)):
    suffix=Path(file.filename or '').suffix.lower()
    if suffix not in {'.pdf','.docx','.txt','.md'}:
        raise HTTPException(status_code=415,detail='Supported CV formats: PDF, DOCX, TXT, MD')
    content=await file.read()
    if not content:
        raise HTTPException(status_code=400,detail='Empty CV upload')
    if len(content)>8*1024*1024:
        raise HTTPException(status_code=413,detail='CV exceeds 8 MB limit')
    path=None
    try:
        with NamedTemporaryFile(delete=False,suffix=suffix) as tmp:
            tmp.write(content); path=tmp.name
        profile=import_cv(path)
        profile.setdefault('import_meta',{})['original_filename']=file.filename
        set_master_profile(profile)
        cv_meta=save_cv(content,filename=file.filename or 'cv'+suffix,content_type=file.content_type or 'application/octet-stream')
        return {'ok':True,'profile':profile,'review_required':bool(profile.get('unresolved')),'saved_cv':cv_meta}
    except Exception as e:
        raise HTTPException(status_code=422,detail=f'Could not import CV: {e}')
    finally:
        if path:
            try: os.unlink(path)
            except OSError: pass

@app.post('/v1/answers/generate')
def generate(r:AnswerRequest):
    return _generate_one(r)

@app.post('/v1/answers/batch')
def generate_batch(r:AnswerBatchRequest):
    items=[]
    for i,q in enumerate(r.questions[:50]):
        question=str(q.get('label') or q.get('question') or '').strip()
        if not question:
            continue
        limit=q.get('character_limit')
        try:
            result=_generate_one(AnswerRequest(question=question,profile=r.profile,job=r.job,character_limit=limit))
        except HTTPException as e:
            result={'status':'ERROR','answer':'','insert_allowed':False,'validation':{'valid':False,'reason':str(e.detail)}}
        result.update({'question_index':q.get('index',i),'question':question,'character_limit':limit})
        items.append(result)
    return {'count':len(items),'items':items}
