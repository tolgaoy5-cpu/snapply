from __future__ import annotations
import json
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
from origin_policy import ALLOWED_ORIGIN, origin_allowed
import accounts
import billing
import letter_writer
import field_classifier
import rate_limit
import analytics
import re

app=FastAPI(title='Snapply Core API',version='0.27.0')
app.add_middleware(CORSMiddleware,allow_origins=[],allow_origin_regex=ALLOWED_ORIGIN,
                   allow_credentials=False,allow_methods=['POST','GET','DELETE'],allow_headers=['Content-Type','Authorization'])

# Routes that work without a session in cloud mode.
PUBLIC_PATHS={'/health','/v1/auth/google','/v1/billing/webhook','/v1/waitlist','/v1/events'}

@app.middleware('http')
async def reject_foreign_origins(request:Request,call_next):
    if not origin_allowed(request.headers.get('origin')):
        return JSONResponse(status_code=403,content={'detail':'Origin is not allowed on this API.'})
    if accounts.cloud_mode() and request.url.path not in PUBLIC_PATHS and request.method!='OPTIONS':
        header=request.headers.get('authorization') or ''
        if not header.lower().startswith('bearer '):
            return JSONResponse(status_code=401,content={'detail':'Please sign in to Snapply.'})
        try:
            uid=accounts.verify_session(header[7:].strip())
        except accounts.AuthError as e:
            return JSONResponse(status_code=401,content={'detail':str(e)})
        if not accounts.load_account(uid):
            return JSONResponse(status_code=401,content={'detail':'Account not found, please sign in again.'})
        accounts.current_uid.set(uid)
        accounts.current_user_dir.set(accounts.user_dir(uid))
    if accounts.cloud_mode() and request.method!='OPTIONS':
        wait=rate_limit.check(request.url.path,accounts.current_uid.get(),rate_limit.client_ip(request.headers))
        if wait:
            return JSONResponse(status_code=429,headers={'Retry-After':str(wait)},
                                content={'detail':f'Too many requests. Please wait {wait} seconds and try again.'})
    return await call_next(request)

def _consume_ai(units:int=1):
    try:
        accounts.consume_ai(accounts.current_uid.get(),units)
    except accounts.QuotaError as e:
        raise HTTPException(status_code=402,detail=str(e))

# Special-category and legal declarations, and other people's details (referees), never leave
# the user's browser in cloud mode; the extension keeps them in chrome.storage.local.
BROWSER_ONLY_SENSITIVITY={'legal','sensitive'}

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
    length:str=Field(default='standard',pattern='^(standard|detailed)$')

class CoverLetterRenderRequest(BaseModel):
    job:dict[str,Any]
    body:str=Field(min_length=1,max_length=3500)
    format:str='pdf'
    own:bool=False

@app.post('/v1/cover-letter/generate')
def cover_letter_generate(r:CoverLetterRequest):
    uid=accounts.current_uid.get()
    if uid is not None and accounts.plan_of(accounts.load_account(uid))!='pro':
        raise HTTPException(status_code=402,detail='Cover letters are part of Snapply Pro. Upgrade to Pro to generate them.')
    profile=_refresh_profile_from_saved_cv_if_needed().get('master_profile') or {}
    _consume_ai()
    try:
        return generate_cover_letter(profile,r.job,transferable=r.transferable,length=r.length)
    except ProviderError as e:
        raise HTTPException(status_code=502,detail=f'Model provider error: {e}') from e

@app.post('/v1/cover-letter/render')
def cover_letter_render(r:CoverLetterRenderRequest):
    profile=_refresh_profile_from_saved_cv_if_needed().get('master_profile') or {}
    return render_cover_letter(profile,r.job,r.body,r.format,r.own)

def _generate_letter_answer(r:AnswerRequest)->dict[str,Any]:
    # Cover-letter and motivation questions get a full, tailored letter written from the CV and the advert.
    uid=accounts.current_uid.get()
    if uid is not None and re.search(r'cover|covering',r.question,re.I) and accounts.plan_of(accounts.load_account(uid))!='pro':
        raise HTTPException(status_code=402,detail='Cover letters are part of Snapply Pro. Upgrade to Pro to generate them.')
    _consume_ai()
    try:
        long_field=not r.character_limit or r.character_limit>=3000
        written=letter_writer.write_letter(r.profile,r.job,length='detailed' if long_field and re.search(r'supporting|statement',r.question,re.I) else 'standard',
                                           character_limit=r.character_limit,question=r.question)
    except ProviderError as e:
        raise HTTPException(status_code=502,detail=f'Model provider error: {e}')
    if written['status']!='REVIEW':
        return {'status':'ASK_USER','answer':'','insert_allowed':False,'validation':{'valid':False,'reason':written['reason']}}
    cover=bool(re.search(r'cover|covering',r.question,re.I))
    answer=letter_writer.full_letter(written['body'],r.profile,r.job) if cover else written['body']
    if r.character_limit and len(answer)>r.character_limit:
        answer=written['body']
    return {'status':'REVIEW','answer':answer,'insert_allowed':True,'letter':True,'word_count':written['word_count'],
            'removed_sentences':written['removed_sentences'],'validation':{'valid':True,'unsupported_claims':[]},
            'provider':'openai-letter'}

def _generate_one(r:AnswerRequest)->dict[str,Any]:
    if letter_writer.is_letter_question(r.question) and (r.job.get('requirements') or r.job.get('description')):
        return _generate_letter_answer(r)
    plan=plan_question(r.question,r.profile,r.job,r.character_limit)
    allowed=[]
    for m in plan.get('matched_requirements',[]):
        if m.get('confidence') in {'HIGH','MEDIUM'}:
            allowed.extend(m.get('evidence') or [])
    if not allowed:
        return {'status':'ASK_USER','plan':plan,'answer':'','validation':{'valid':False,'reason':'No supported evidence'},'insert_allowed':False}
    context=f"{r.job.get('title') or ''} {r.job.get('company') or ''}"
    _consume_ai()
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

CURRENT_PARSERS={'deterministic-v0.26.6','ai-verified-v1'}


def _refresh_profile_from_saved_cv_if_needed():
    state=load_state()
    profile=state.get('master_profile') or {}
    parser=(profile.get('import_meta') or {}).get('parser')
    meta=get_saved_cv_meta(); content=get_saved_cv_bytes()
    # Profiles from a current importer are kept as they are (and keep the user's edits); only profiles
    # from older importers are read again from the saved CV.
    if parser in CURRENT_PARSERS or not meta or content is None:
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
    if accounts.cloud_mode() and r.sensitivity in BROWSER_ONLY_SENSITIVITY:
        raise HTTPException(status_code=422,detail='Personal and legal answers are kept in your browser only')
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
    if accounts.cloud_mode():
        raise HTTPException(status_code=422,detail='Referees are kept in your browser only')
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
    return {'ok':True,'version':'0.27.0','auth':'google' if accounts.cloud_mode() else 'none',
            'google_client_id':os.environ.get('GOOGLE_CLIENT_ID','').split(',')[0].strip() if accounts.cloud_mode() else '',
            'billing':billing.configured(),
            'launch_offer':billing.LAUNCH_OFFER if billing.launch_offer_on() else None,'plans':billing.plans()}

class GoogleSignIn(BaseModel):
    id_token:str=Field(min_length=20,max_length=8000)
    ref:str=Field(default='',max_length=20)

@app.post('/v1/auth/google')
def auth_google(r:GoogleSignIn):
    if not accounts.cloud_mode():
        raise HTTPException(status_code=404,detail='Sign-in is only used by the hosted service')
    try:
        token,account=accounts.sign_in(accounts.verify_google_id_token(r.id_token),ref=r.ref or None)
    except accounts.AuthError as e:
        raise HTTPException(status_code=401,detail=str(e))
    return {'ok':True,'session':token,'account':account}

class ApplicationUsage(BaseModel):
    url:str=Field(min_length=8,max_length=4000)

@app.post('/v1/usage/application')
def usage_application(r:ApplicationUsage):
    try:
        return {'ok':True,**accounts.record_application(accounts.current_uid.get(),r.url)}
    except accounts.QuotaError as e:
        raise HTTPException(status_code=402,detail=str(e))

class FieldClassifyRequest(BaseModel):
    host:str=Field(min_length=1,max_length=200)
    fields:list[dict[str,Any]]=Field(max_length=60)

@app.post('/v1/fields/classify')
def fields_classify(r:FieldClassifyRequest):
    # Form wording only (labels, names, option texts); never the user's values.
    try:
        return {'ok':True,'hints':field_classifier.classify(r.host,r.fields)}
    except ProviderError as e:
        raise HTTPException(status_code=502,detail=f'Model provider error: {e}')

class PageReport(BaseModel):
    capture:dict[str,Any]
    note:str=Field(default='',max_length=1000)
    fill:dict[str,Any]=Field(default_factory=dict)
    version:str=Field(default='',max_length=20)

@app.post('/v1/reports')
async def page_report(request:Request,r:PageReport):
    if len(await request.body())>400_000:
        raise HTTPException(status_code=413,detail='Report too large')
    if (r.capture.get('privacy') or {}).get('values_captured'):
        raise HTTPException(status_code=422,detail='Reports must not contain field values')
    name=field_classifier.save_report(accounts.current_uid.get(),r.model_dump())
    return {'ok':True,'id':name}

class SiteEvent(BaseModel):
    name:str=Field(min_length=3,max_length=40)
    source:str=Field(default='',max_length=60)

@app.post('/v1/events')
async def site_event(request:Request):
    # Anonymous funnel counter for the website and welcome page (no cookies, no identifiers).
    # Browsers send it with navigator.sendBeacon as text/plain (a JSON content type is refused there),
    # so the body is read as JSON whatever its declared type.
    try:
        r=SiteEvent(**json.loads((await request.body()).decode('utf-8')[:2000]))
    except Exception:
        raise HTTPException(status_code=422,detail='Invalid event')
    return {'ok':analytics.record(r.name,r.source)}

class FillStats(BaseModel):
    # Counts only: which site (host name) and how much of its form was filled. No values, labels or user id.
    host:str=Field(min_length=1,max_length=200)
    ats:str=Field(default='',max_length=40)
    detected:int=Field(default=0,ge=0,le=10000)
    filled:int=Field(default=0,ge=0,le=10000)
    required_total:int=Field(default=0,ge=0,le=10000)
    required_missing:int=Field(default=0,ge=0,le=10000)
    cv_slots:int=Field(default=0,ge=0,le=100)
    cv_attached:int=Field(default=0,ge=0,le=100)

@app.post('/v1/fill-stats')
def fill_stats(r:FillStats):
    analytics.record_fill(r.host,r.ats,**r.model_dump(exclude={'host','ats'}))
    return {'ok':True}

class WaitlistRequest(BaseModel):
    email:str=Field(min_length=5,max_length=254,pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

@app.post('/v1/waitlist')
def waitlist(r:WaitlistRequest):
    # People who want the Chrome Web Store link when it goes live (public, no sign-in).
    accounts.add_to_waitlist(r.email)
    analytics.record('waitlist_join')
    return {'ok':True}

@app.get('/v1/me')
def me():
    uid=accounts.current_uid.get()
    if uid is None:
        return {'ok':True,'local':True,'account':{'plan':'local','ai_used':0,'ai_limit':None}}
    return {'ok':True,'local':False,'account':accounts.public_account(uid)}

@app.delete('/v1/me')
def me_delete():
    uid=accounts.current_uid.get()
    if uid is None:
        raise HTTPException(status_code=404,detail='Local mode has no account')
    accounts.delete_user(uid)
    return {'ok':True,'deleted':True}

class CheckoutRequest(BaseModel):
    interval:str=Field(default='month',pattern='^(week|month|quarter|year)$')

@app.post('/v1/billing/checkout')
def billing_checkout(r:CheckoutRequest=CheckoutRequest()):
    uid=accounts.current_uid.get()
    if uid is None:
        raise HTTPException(status_code=404,detail='Local mode has no subscription')
    try:
        url=billing.checkout_url(uid,r.interval)
        analytics.record('checkout_started',r.interval)
        return {'ok':True,'url':url}
    except billing.BillingError as e:
        raise HTTPException(status_code=503,detail=str(e))

@app.post('/v1/billing/portal')
def billing_portal():
    uid=accounts.current_uid.get()
    if uid is None:
        raise HTTPException(status_code=404,detail='Local mode has no subscription')
    try:
        return {'ok':True,'url':billing.portal_url(uid)}
    except billing.BillingError as e:
        raise HTTPException(status_code=400,detail=str(e))

@app.post('/v1/billing/webhook')
async def billing_webhook(request:Request):
    body=await request.body()
    try:
        event=billing.verify_webhook(body,request.headers.get('stripe-signature',''))
    except billing.BillingError as e:
        raise HTTPException(status_code=400,detail=str(e))
    result=billing.handle_event(event)
    if result=='upgraded':
        analytics.record('pro_converted')
    return {'ok':True,'result':result}

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
