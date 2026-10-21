"""Conservative CV -> Master Profile importer.

V0.14.1 fixes section-boundary leakage and multi-line dated-entry parsing.
It preserves source facts and flags chronological inconsistencies instead of repairing them.
"""
from __future__ import annotations
import re, json
from pathlib import Path

_MONTH = r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?'
_WHEN = rf'(?:\d{{1,2}}/\d{{4}}|{_MONTH}\s+\d{{4}}|(?:19|20)\d{{2}})'
DATE_RANGE = re.compile(rf'(?P<start>{_WHEN})\s*(?:[–—-]|to)\s*(?P<end>Present|Current|Now|To date|{_WHEN})', re.I)
EMAIL = re.compile(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}')
# UK numbers as people write them: 07700 900123, 07700-900-123, +44 7700 900123, +44 (0)20 7946 0000, 020 7946 0000.
PHONE = re.compile(r'(?<![\d+])(?:\+44\s?(?:\(0\)\s?)?|0)\d(?:[\s-]?\d){8,9}(?!\d)')
POSTCODE = re.compile(r'\b([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[A-Z]{2})\b')
# Section headings as CVs commonly write them (a short line on its own, any case, optional colon).
SECTION_ALIASES = {
    'experience': r'(?:professional |work |employment |career |relevant |working )?(?:experience|history)|employment(?: history)?|work history|career history',
    'education': r'education(?: (?:and|&) (?:training|qualifications))?|academic (?:background|qualifications|history)|qualifications',
    'certs': r'certificat\w*(?: (?:and|&) training)?|training(?: (?:and|&) (?:development|certifications))?|courses|licen[cs]es(?: (?:and|&) certifications)?|professional development',
    'languages': r'languages?',
    'other': r'(?:professional )?(?:summary|profile)|personal (?:statement|profile)|about me|objective|(?:key |core |technical )?skills|competenc\w*|references?|interests|hobbies|achievements|projects|volunteering|awards|additional information',
}
SECTION_NAMES = ['PROFESSIONAL SUMMARY','PROFESSIONAL EXPERIENCE','EDUCATION','CERTIFICATES & TRAINING','LANGUAGES','REFERENCES']

def clean_lines(text:str)->list[str]:
    out=[]
    for raw in text.splitlines():
        s=re.sub(r'\s+',' ',raw).strip()
        if s: out.append(s)
    return out

def extract_pdf_text(path:str|Path)->str:
    try:
        from pypdf import PdfReader
    except Exception as e:
        raise RuntimeError('pypdf is required for PDF import') from e
    return '\n'.join((p.extract_text() or '') for p in PdfReader(str(path)).pages)

def extract_docx_text(path:str|Path)->str:
    try:
        from docx import Document
    except Exception as e:
        raise RuntimeError('python-docx is required for DOCX import') from e
    doc=Document(str(path)); parts=[p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            vals=[c.text.strip() for c in row.cells if c.text.strip()]
            if vals: parts.append(' | '.join(vals))
    return '\n'.join(parts)

def section_lines(lines:list[str], start:str, end_candidates:list[str])->list[str]:
    upper=[x.upper() for x in lines]
    try: s=upper.index(start.upper())+1
    except ValueError: return []
    e=len(lines)
    for c in end_candidates:
        try:
            j=upper.index(c.upper(),s)
            e=min(e,j)
        except ValueError:
            pass
    return lines[s:e]

def section_kind(line:str)->str|None:
    t=line.strip().rstrip(':').strip()
    if not t or len(t)>45:
        return None
    for kind,pat in SECTION_ALIASES.items():
        if re.fullmatch(pat,t,re.I):
            return kind
    return None


def sections(lines:list[str])->dict[str,list[str]]:
    """Lines under each recognised heading, up to the next heading of any kind."""
    out:dict[str,list[str]]={};current=None
    for ln in lines:
        k=section_kind(ln)
        if k:
            current=k;out.setdefault(k,[]);continue
        if current:
            out[current].append(ln)
    return out


def parse_name(lines:list[str])->str|None:
    for s in lines[:12]:
        if s and '@' not in s and not re.search(r'\d',s) and len(s.split()) in range(2,6) and not any(k in s.upper() for k in SECTION_NAMES) and not section_kind(s):
            return s
    return None

def _strip_dates(line:str)->str:
    return DATE_RANGE.sub('',line).strip(' |,-–—')


def _looks_like_heading(line:str, kind:str)->bool:
    s=line.strip()
    if DATE_RANGE.search(s) and len(_strip_dates(s))>3:
        s=_strip_dates(s)
    elif DATE_RANGE.search(s):
        return False
    if not s or s.startswith(('•','-','–','—')):
        return False
    if len(s)>180 or s.endswith(('.', ';')):
        return False
    if kind=='experience':
        # Experience headings in conventional CVs usually separate role and employer with a comma.
        return bool(re.search(r',| at | \| | [–—-] ', s)) and not re.search(r'\b(?:through|while|with|and|supporting|demonstrating|maintaining|coordinating)\b', s, re.I)
    # Education headings commonly contain degree markers and/or an institution name.
    return bool(re.search(r'\b(?:BSc|BA|MSc|MA|MBA|PhD|Bachelor|Master|University|College|School)\b', s, re.I))


def _find_heading_indices(lines:list[str], kind:str)->list[int]:
    out=[]
    for i,line in enumerate(lines):
        if _looks_like_heading(line,kind):
            # Require a date range before the next plausible heading. This avoids treating prose as a heading.
            j=i+1; found_date=bool(DATE_RANGE.search(line))
            while j<len(lines) and not found_date:
                if j!=i+1 and _looks_like_heading(lines[j],kind):
                    break
                if DATE_RANGE.search(lines[j]):
                    found_date=True; break
                j+=1
            if found_date: out.append(i)
    return out


def _dates(m)->str:
    from cv_ai import to_month_year
    return f"{to_month_year(m.group('start'))}-{to_month_year(m.group('end'))}"


def _parse_dated_entries(lines:list[str], kind:str)->list[dict]:
    headings=_find_heading_indices(lines,kind)
    out=[]
    for idx,hidx in enumerate(headings):
        next_h=headings[idx+1] if idx+1<len(headings) else len(lines)
        date_idx=None; m=DATE_RANGE.search(lines[hidx])
        if m: date_idx=hidx
        for j in ([] if m else range(hidx+1,next_h)):
            dm=DATE_RANGE.search(lines[j])
            if dm:
                date_idx=j; m=dm; break
        if date_idx is None or m is None:
            continue
        heading=_strip_dates(lines[hidx]).strip(' ,-|')
        country=None
        # Country is often on the line immediately after the date in PDF text extraction.
        if date_idx+1<next_h:
            c=lines[date_idx+1].strip()
            if re.fullmatch(r'UK|United Kingdom',c,re.I): country='UK'
            elif re.fullmatch(r'Turkey|Türkiye',c,re.I): country='Turkey'
        # Preserve all actual bullet/prose evidence between heading and next heading, excluding date/country lines.
        body_lines=[]
        for j in range(hidx+1,next_h):
            if j==date_idx and j!=hidx: continue
            if country and j==date_idx+1: continue
            body_lines.append(lines[j])
        body=' '.join(body_lines).strip()
        if kind=='experience':
            parts=[x.strip() for x in re.split(r',| at | \| | [–—-] ',heading,maxsplit=1)]
            role=parts[0] if parts else heading
            employer=parts[1] if len(parts)>1 else ''
            employer=re.split(r',| \| ',employer)[0].strip()
            rec={'role':role,'employer':employer,'dates':_dates(m),'country':country,'evidence':body[:2200]}
        else:
            # Split on the last comma so degree names can themselves contain punctuation.
            if ',' in heading:
                degree,institution=[x.strip() for x in heading.rsplit(',',1)]
            else:
                degree,institution=heading,''
            field=''
            # Conservative field-of-study extraction for common degree titles.
            fm=re.search(r'\b(?:BSc|BA|MSc|MA|MBA|Bachelor(?:\'s)?|Master(?:\'s)?)\s+(?:of|in)?\s*(.+)$',degree,re.I)
            if fm: field=fm.group(1).strip()
            rec={'degree':degree,'institution':institution,'field':field,'dates':_dates(m),'country':country,'evidence':body[:2200]}
        out.append(rec)
    return out

def parse_cv_text(text:str)->dict:
    lines=clean_lines(text); flat='\n'.join(lines)
    full_name=parse_name(lines) or ''; parts=full_name.split()
    email=(EMAIL.search(flat).group(0) if EMAIL.search(flat) else None)
    pm=PHONE.search('\n'.join(lines[:15])) or PHONE.search(flat)
    phone=re.sub(r'\s+',' ',pm.group(0)).strip() if pm else None
    head='\n'.join(lines[:15])
    pc=POSTCODE.search(head)
    postcode=f'{pc.group(1)} {pc.group(2)}' if pc else None
    city=None
    if pc:
        # "12 Example Road, Manchester M1 2AB": the word(s) just before the postcode.
        cm=re.search(r'([A-Z][A-Za-z\'-]+(?:[ -][A-Z][A-Za-z\'-]+)?)\s*,?\s*'+re.escape(pc.group(0)),head)
        if cm and not re.search(r'\d|road|street|lane|avenue|close|way|drive|court|house|flat',cm.group(1),re.I): city=cm.group(1)
    # Street line: the part of the postcode line before the town ("12 Example Road, London E5 9PB").
    address=None
    if pc:
        line=next((l for l in lines[:15] if pc.group(0) in l),'')
        before=line.split(pc.group(0))[0]
        if city:before=before.rsplit(city,1)[0]
        before=re.split(r'[|·•]',before)[-1].strip(' ,')
        if re.match(r'\d+[A-Za-z]?\s+\w|(?:flat|apartment|unit)\s+\d',before,re.I) and len(before)<=80:address=before
    if not city and re.search(r'\bLondon\b',head,re.I): city='London'
    if not city and re.search(r'\bLondon\b',flat,re.I): city='London'
    work_auth=None
    for ln in lines:
        if re.search(r'full right to work|graduate visa|right to work',ln,re.I):
            work_auth=ln; break

    sec=sections(lines)
    exp_lines=sec.get('experience') or section_lines(lines,'PROFESSIONAL EXPERIENCE',['EDUCATION'])
    edu_lines=sec.get('education') or section_lines(lines,'EDUCATION',['CERTIFICATES & TRAINING','LANGUAGES'])
    cert_lines=sec.get('certs') or section_lines(lines,'CERTIFICATES & TRAINING',['LANGUAGES','REFERENCES'])
    lang_lines=sec.get('languages') or section_lines(lines,'LANGUAGES',['REFERENCES'])

    experiences=_parse_dated_entries(exp_lines,'experience')
    education=_parse_dated_entries(edu_lines,'education')
    unresolved=[]
    for i,rec in enumerate(experiences):
        start,end=rec['dates'].split('-',1)
        if end.lower() not in {'present','current'} and '/' in start and '/' in end:
            sm,sy=map(int,start.split('/')); em,ey=map(int,end.split('/'))
            if (ey,em)<(sy,sm):
                rec['needs_confirmation']=True
                unresolved.append({'id':f'experience-{i}-dates','field':f'experience[{i}].dates','reason':'Start/end dates are chronologically inconsistent in source CV; do not infer correction.','source_value':rec['dates'],'status':'OPEN'})

    certifications=[]
    for x in cert_lines:
        if x not in certifications: certifications.append(x)
    languages=[]; levels={'native','proficient','conversational','fluent','intermediate','basic'}
    i=0
    while i<len(lang_lines)-1:
        if lang_lines[i+1].lower() in levels:
            languages.append({'language':lang_lines[i],'level':lang_lines[i+1]}); i+=2
        else: i+=1

    def _url(pattern):
        m=re.search(pattern,flat,re.I)
        if not m:return None
        u=m.group(0).rstrip('/.,;)')
        return u if u.lower().startswith('http') else 'https://'+u
    linkedin=_url(r'(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9_%-]+/?')
    github=_url(r'(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_-]+')
    website=None
    for m in re.finditer(r'https?://[^\s,;)]+|(?<![@\w])www\.[^\s,;)]+',flat,re.I):
        u=m.group(0).rstrip('/.,;)')
        if not re.search(r'linkedin\.com|github\.com',u,re.I):
            website=u if u.lower().startswith('http') else 'https://'+u;break
    return {
        'full_name':full_name,
        'linkedin':linkedin,'github':github,'website':website,
        'first_name':' '.join(parts[:-1]) if len(parts)>1 else full_name,
        'last_name':parts[-1] if parts else '',
        'email':email,'phone':phone,'address':address,'postcode':postcode,'city':city,
        'country':'United Kingdom' if postcode or (phone and phone.startswith('+44')) else None,'location':f'{city}, UK' if city else None,
        'right_to_work':'Yes' if work_auth and re.search(r'full right to work|right to work',work_auth,re.I) else None,
        'sponsorship':'No' if work_auth and re.search(r'full right to work',work_auth,re.I) else None,
        'work_authorisation':work_auth,
        'experience':experiences,'education':education,'certifications':certifications,'languages':languages,'unresolved':unresolved,
        'import_meta':{'parser':'deterministic-v0.26.6','requires_user_review':bool(unresolved)}
    }

def import_cv(path:str|Path)->dict:
    p=Path(path); ext=p.suffix.lower()
    if ext=='.pdf': text=extract_pdf_text(p)
    elif ext=='.docx': text=extract_docx_text(p)
    elif ext in {'.txt','.md'}: text=p.read_text(errors='ignore')
    else: raise ValueError('Importer supports PDF, DOCX, TXT and MD.')
    out=parse_cv_text(text)
    out=with_ai_structure(out,text)
    out.setdefault('import_meta',{}).update({'source_format':ext.lstrip('.'),'source_file':p.name})
    return out


def with_ai_structure(profile:dict,text:str,model=None)->dict:
    """Replace rule-based roles/education with the AI reading when it finds more (values verified against
    the CV text in cv_ai). Without a configured model, or if it fails, the rule-based result stands."""
    try:
        from cv_ai import structure
        from llm_provider import model_configured
        if model is None and not model_configured():
            return profile
        ai=structure(text) if model is None else structure(text,model=model)
    except Exception:
        profile.setdefault('import_meta',{})['ai_structure']='failed'
        return profile
    if len(ai['experience'])+len(ai['education'])<len(profile.get('experience') or [])+len(profile.get('education') or []):
        profile.setdefault('import_meta',{})['ai_structure']='kept rules (found less)'
        return profile
    profile['experience']=ai['experience'];profile['education']=ai['education']
    if ai['certifications']:profile['certifications']=ai['certifications']
    if ai['languages']:profile['languages']=ai['languages']
    if ai['skills']:profile['skills']=ai['skills']
    profile.setdefault('import_meta',{}).update({'parser':'ai-verified-v1','ai_dropped_values':ai['dropped_values']})
    return profile

if __name__=='__main__':
    import argparse
    ap=argparse.ArgumentParser(); ap.add_argument('cv'); ap.add_argument('-o','--output',default='imported_profile.json')
    a=ap.parse_args(); profile=import_cv(a.cv); Path(a.output).write_text(json.dumps(profile,indent=2,ensure_ascii=False)); print(a.output)
