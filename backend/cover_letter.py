from __future__ import annotations

import base64
import io
import re
from datetime import date
from html import escape
from pathlib import Path
from typing import Any, Callable

from docx import Document
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

from claim_validator import validate_answer, grounded_rewrite
from evidence_matcher import SYNONYMS, blob, completed_certifications, match_job, tokens
from llm_provider import model_configured, rewrite


def _evidence(profile: dict, job: dict) -> tuple[list[str], list[str]]:
    matches = match_job(job, profile)
    allowed = list(dict.fromkeys(
        evidence for match in matches if match['confidence'] in {'HIGH', 'MEDIUM'}
        for evidence in match['evidence'] if evidence.strip()
    ))
    unsupported = [match['requirement'] for match in matches if match['confidence'] == 'ASK_USER']
    return allowed, unsupported


CORE_GENERIC = {
    'experience', 'substantial', 'ability', 'knowledge', 'understanding', 'skill', 'skills',
    'strong', 'highly', 'work', 'working', 'manage', 'management', 'support', 'supporting',
    'multiple', 'range', 'wide', 'including', 'required', 'role', 'team', 'teams',
    'relevant', 'good', 'excellent', 'candidate', 'professional', 'proven',
}
TITLE_GENERIC = {
    'manager', 'assistant', 'associate', 'worker', 'officer', 'specialist', 'senior',
    'junior', 'lead', 'head', 'coordinator', 'executive', 'advisor', 'adviser',
    'consultant', 'support', 'role', 'position',
}


def _body_mentions_job(body: str, job: dict) -> bool:
    title_core = tokens(str(job.get('title') or '')) - TITLE_GENERIC
    body_terms = tokens(body)
    return not title_core or any(({term} | SYNONYMS.get(term, set())) & body_terms for term in title_core)


def _job_relevance(profile: dict, job: dict) -> bool:
    """Require concrete overlap in the job's leading criteria before any model call."""
    records = [blob(item) for kind in ('experience', 'education')
               for item in profile.get(kind, []) if isinstance(item, dict) and not item.get('needs_confirmation')]
    records.extend(completed_certifications(profile))
    evidence_tokens = [tokens(record) for record in records]
    title_core = tokens(str(job.get('title') or '')) - TITLE_GENERIC
    if title_core and not any(
        any(({term} | SYNONYMS.get(term, set())) & record for term in title_core)
        for record in evidence_tokens
    ):
        return False
    leading = (job.get('requirements') or [])[:5]
    supported = 0
    for requirement in leading:
        core = tokens(str(requirement)) - CORE_GENERIC
        if not core:
            continue
        minimum = min(2, len(core))
        for record in evidence_tokens:
            covered = sum(bool(({term} | SYNONYMS.get(term, set())) & record) for term in core)
            if covered >= minimum:
                supported += 1
                break
    return supported >= min(2, len(leading))


def _ready(profile: dict, job: dict) -> tuple[list[str], list[str], str | None]:
    if not profile.get('full_name'):
        return [], [], 'Import and confirm a CV before creating a cover letter.'
    if not job.get('url') or not job.get('title') or not job.get('requirements'):
        return [], [], 'Analyze the current job page before creating a cover letter.'
    if not _job_relevance(profile, job):
        return [], list(job.get('requirements') or []), 'No sufficiently relevant verified CV evidence for this job. Choose a matching role or review manually.'
    allowed, unsupported = _evidence(profile, job)
    if not allowed:
        return [], unsupported, 'No verified CV evidence matched this job; do not generate claims.'
    return allowed, unsupported, None


def _readable_cv_evidence(profile: dict) -> list[str]:
    out = []
    for e in profile.get('experience', []):
        if isinstance(e, dict) and not e.get('needs_confirmation'):
            out.append(f"{e.get('role','')} — {e.get('employer','')}: {e.get('evidence') or e.get('dates') or ''}".strip())
    for e in profile.get('education', []):
        if isinstance(e, dict) and not e.get('needs_confirmation'):
            out.append(f"Education — {e.get('degree','')} {e.get('field','')} at {e.get('institution','')}".strip())
    return out + [f'Certificate — {c}' for c in completed_certifications(profile)]


RELEVANCE_REASON = 'No sufficiently relevant verified CV evidence for this job. Choose a matching role or review manually.'


def generate(profile: dict, job: dict, model_rewrite: Callable = rewrite, transferable: bool = False) -> dict[str, Any]:
    allowed, unsupported, reason = _ready(profile, job)
    # A job outside the CV's field: only on the user's request, write from transferable experience,
    # still using only CV facts and never claiming the job's criteria are met.
    mode = 'matched'
    if reason == RELEVANCE_REASON and transferable:
        allowed, unsupported, reason, mode = _readable_cv_evidence(profile), list(job.get('requirements') or []), None, 'transferable'
    if reason:
        return {'status': 'ASK_USER', 'reason': reason, 'attachment_ready': False,
                'can_draft_transferable': reason == RELEVANCE_REASON}
    if not model_configured():
        return {'status': 'MODEL_NOT_CONFIGURED', 'reason': 'Configure OPENAI_API_KEY and JOB_COPILOT_MODEL on the local backend to generate a job-specific cover letter.', 'attachment_ready': False}
    title = str(job['title']).strip()
    company = str(job.get('company') or '').strip()
    question = (
        f'Write only evidence-rich body paragraphs of a concise, tailored cover letter for the {title} role'
        + (f' at {company}' if company else '')
        + '. Use only the verified evidence in this plan. Do not assert that unmet criteria are met. '
          'Do not include an address, date, greeting, generic introduction or sign-off; the document renderer adds those. '
          'Each sentence must describe a supported experience or qualification; omit generic closing sentences.'
    )
    if mode == 'transferable':
        question = (
            f'Write two short body paragraphs of an honest cover letter for the {title} role'
            + (f' at {company}' if company else '')
            + ". The candidate's background is in a different field. Using only the CV evidence, describe experience that "
              'transfers to this role (for example working with people, communication, organisation, languages). '
              'Do not claim experience, skills, tools or results the evidence does not state, and do not say the job '
              'requirements are met. Do not include a greeting or sign-off.'
        )
    plan = {
        'cv_evidence': allowed,
        'job_requirements_for_context_only': unsupported,
    } if mode == 'transferable' else {
        'matched_requirements': match_job(job, profile),
        'generation_rules': [
            'Write in first person and use only the supplied verified evidence.',
            'Do not invent qualifications, employers, dates, metrics or clinical skills.',
            'Write two or three evidence-rich paragraphs, staying below 3500 characters.',
            'If a criterion has no evidence, omit that claim.',
            'Mention every certificate or qualification in the evidence that matches a requirement.',
        ],
    }
    context = f'{title} {company}'
    drafted = grounded_rewrite(model_rewrite, question, plan, 3500, allowed, context)
    if drafted.get('provider') == 'deterministic-fallback':
        return {'status': 'MODEL_NOT_CONFIGURED', 'reason': 'AI generation did not run.', 'attachment_ready': False}
    body = str(drafted.get('answer') or '').strip()
    validation = validate_answer(body, allowed, 3500, context)
    if body and mode == 'matched' and not _body_mentions_job(body, job):
        validation['valid'] = False
        validation['job_focus_warning'] = 'Draft does not address the occupation in this job title.'
    if drafted.get('unsupported_claims'):
        validation['valid'] = False
        validation['unsupported_claims'] = list(dict.fromkeys(validation['unsupported_claims'] + drafted['unsupported_claims']))
    return {
        'status': 'REVIEW', 'body': body, 'validation': validation,
        'attachment_ready': bool(body and validation['valid']),
        'unsupported_requirements': unsupported,
        'removed_sentences': drafted.get('removed_sentences', []),
        'mode': mode,
        'job': {'title': title, 'company': company, 'url': job['url']},
        'provider': drafted.get('provider'),
    }


def _all_cv_evidence(profile: dict) -> list[str]:
    records = [blob(item) for kind in ('experience', 'education')
               for item in profile.get(kind, []) if isinstance(item, dict) and not item.get('needs_confirmation')]
    return records + [f'Certificate — {c}' for c in completed_certifications(profile)]


def render(profile: dict, job: dict, body: str, format: str = 'pdf', own: bool = False) -> dict[str, Any]:
    # A letter the user wrote themselves is not bound to the AI relevance gate; its numbers,
    # credentials and qualifications are still checked against the whole CV.
    if own:
        if not profile.get('full_name'):
            return {'ok': False, 'reason': 'Import and confirm a CV before attaching a cover letter.'}
        if not job.get('url') or not job.get('title'):
            return {'ok': False, 'reason': 'Open the job posting so the letter can be addressed to this job.'}
        allowed = _all_cv_evidence(profile)
    else:
        allowed, _, reason = _ready(profile, job)
        if reason:
            return {'ok': False, 'reason': reason}
    body = body.strip()
    if not body:
        return {'ok': False, 'reason': 'Cover letter text is empty.'}
    validation = validate_answer(body, allowed, 3500, f"{job.get('title') or ''} {job.get('company') or ''}")
    if not own and not _body_mentions_job(body, job):
        validation['valid'] = False
        validation['job_focus_warning'] = 'Draft does not address the occupation in this job title.'
    # The text being rendered has been reviewed and edited by the user: wording beyond the CV is a
    # warning, but unverified numbers/credentials/qualifications, the length limit and job focus still block.
    hard = [c['sentence'] for c in validation['claims'] if not c.get('risk_ok', True)]
    if hard or validation.get('over_limit') or validation.get('job_focus_warning'):
        return {'ok': False, 'reason': 'Cover letter has unverified credentials or numbers, exceeds the length limit, or does not address this job.', 'validation': validation, 'blocking_sentences': hard}
    validation['warnings'] = [c['sentence'] for c in validation['claims'] if not c.get('grounded', True)]
    if format not in {'pdf', 'docx'}:
        return {'ok': False, 'reason': 'Unsupported cover letter format.'}
    name = str(profile['full_name']).strip()
    title = str(job['title']).strip()
    company = str(job.get('company') or '').strip()
    heading = f'Re: {title}' + (f' - {company}' if company else '')
    intro = f'I am applying for the {title} role' + (f' at {company}.' if company else '.')
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', body) if p.strip()]
    stream = io.BytesIO()
    if format == 'pdf':
        font_path = Path(__file__).parent / 'assets' / 'DejaVuSans.ttf'
        if 'JobCopilotDejaVu' not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont('JobCopilotDejaVu', str(font_path)))
        normal = ParagraphStyle('CoverLetter', fontName='JobCopilotDejaVu', fontSize=10.5,
                                leading=16, textColor=colors.HexColor('#17212f'), alignment=TA_LEFT,
                                spaceAfter=13)
        name_style = ParagraphStyle('ApplicantName', parent=normal, fontSize=13.5, leading=20, spaceAfter=8)
        document = SimpleDocTemplate(stream, pagesize=A4, leftMargin=55, rightMargin=55,
                                     topMargin=55, bottomMargin=55, title=f'Cover Letter - {title}')
        story = [Paragraph(escape(name), name_style), Paragraph(date.today().strftime('%d %B %Y'), normal),
                 Spacer(1, 8), Paragraph(escape(heading), normal), Spacer(1, 8),
                 Paragraph('Dear Hiring Team,', normal), Paragraph(escape(intro), normal)]
        story.extend(Paragraph(escape(p).replace('\n', '<br/>'), normal) for p in paragraphs)
        story.extend([Spacer(1, 8), Paragraph('Yours sincerely,', normal), Paragraph(escape(name), normal)])
        document.build(story)
        mime = 'application/pdf'
    else:
        doc = Document()
        for p in [name, date.today().strftime('%d %B %Y'), heading, 'Dear Hiring Team,', intro,
                  *paragraphs, 'Yours sincerely,', name]:
            doc.add_paragraph(p)
        doc.save(stream)
        mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    slug = re.sub(r'[^a-zA-Z0-9]+', '-', str(job['title'])).strip('-')[:45] or 'role'
    return {
        'ok': True, 'name': f'Cover-Letter-{slug}.{format}',
        'mime_type': mime,
        'base64': base64.b64encode(stream.getvalue()).decode('ascii'),
        'size': stream.tell(), 'validation': validation,
    }
