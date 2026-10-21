"""Builds the site's guide pages (site/guides/*.html), the guides index, sitemap.xml and robots.txt.
Content is plain, accurate UK job-application advice; each guide ends with a short Snapply note.
  python3 scripts/build_guides.py
"""
import html
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / 'site'
BASE = 'https://snapply.co.uk'
UPDATED = '21 October 2026'

GUIDES = [
    ('nhs-supporting-statement', 'How to write an NHS supporting statement',
     'Write your NHS supporting statement against the person specification: structure, examples and common mistakes.',
     """
<p>Most NHS applications on NHS Jobs and TRAC include a supporting information box. Shortlisting is usually done against the <b>person specification</b> for the post, so the job of your statement is to show, criterion by criterion, that you meet it.</p>
<h2>1. Start from the person specification</h2>
<p>Open the job description and person specification and list the <b>essential</b> criteria. These are the ones shortlisters normally check first. Note the desirable criteria separately.</p>
<p>Some criteria are marked as assessed by “application form”, others by “interview” or “test”. Prioritise the ones assessed on the application.</p>
<h2>2. Use the criteria as your structure</h2>
<p>Address the criteria in the same order as the person specification, using short headings or a clear opening sentence for each. This makes it easy for a shortlister to tick them off.</p>
<h2>3. Give one real example per criterion</h2>
<p>For each criterion, describe a specific situation: what you did and what happened as a result. A simple structure is <b>STAR</b> — Situation, Task, Action, Result (see our <a href="star-method-competency-questions">guide to competency questions</a>). Keep the focus on your own actions.</p>
<ul>
<li>Weak: “I have excellent communication skills.”</li>
<li>Stronger: “On a busy ward I handed over twelve patients each shift using SBAR, and introduced a written checklist that the team then adopted.”</li>
</ul>
<h2>4. Include the NHS values</h2>
<p>Many trusts expect you to show how you reflect the NHS values or their own trust values. Check the trust’s website and refer to them through examples rather than repeating the words.</p>
<h2>5. Keep to the limit and check it</h2>
<ul>
<li>Stay within the character or word limit of the box.</li>
<li>Check that every essential criterion assessed at application is covered.</li>
<li>Avoid copying the same statement into every application — tailor it to each person specification.</li>
<li>Write it in a document first and paste it in, so a timeout does not lose your work.</li>
</ul>
"""),
    ('uk-cover-letter', 'How to write a cover letter for UK jobs',
     'A clear structure for UK cover letters: opening, evidence that matches the advert, and a short close.',
     """
<p>A good UK cover letter is short — usually under one page — and does one thing: shows how your experience matches what the advert asks for.</p>
<h2>A simple structure</h2>
<ol>
<li><b>Opening (2–3 lines):</b> the role you are applying for and one line on why you are a good fit.</li>
<li><b>Evidence (2–3 short paragraphs):</b> pick the two or three most important requirements in the advert and give a real example for each from your experience.</li>
<li><b>Why this employer (2–3 lines):</b> something specific about the organisation or role, not a general compliment.</li>
<li><b>Close:</b> thank them and say you would welcome an interview.</li>
</ol>
<h2>Match the advert, honestly</h2>
<p>Use the advert’s wording for skills you genuinely have, and back each with an example. Do not claim experience you do not have — it is easy to check at interview, and a cover letter that overclaims can cost you the job later.</p>
<h2>Practical points</h2>
<ul>
<li>Address it to a named person if the advert gives one; otherwise “Dear Hiring Manager” is fine.</li>
<li>Use the exact job title and company name, and double-check them before sending.</li>
<li>Save it as a PDF when the form asks for an upload, so the formatting stays intact.</li>
<li>If your background is in a different field, focus on transferable strengths you can evidence.</li>
</ul>
"""),
    ('star-method-competency-questions', 'Competency questions: the STAR method',
     'Answer “Describe a time when…” questions on UK applications and in interviews with the STAR structure.',
     """
<p>Competency (or behavioural) questions ask you to describe a time you showed a particular skill: “Describe a time you dealt with a difficult customer”, “Give an example of working under pressure”. They are common on UK application forms and in interviews, including the Civil Service and the NHS.</p>
<h2>STAR in four steps</h2>
<ul>
<li><b>Situation</b> — brief context: where you were and what was happening.</li>
<li><b>Task</b> — what you were responsible for.</li>
<li><b>Action</b> — what <i>you</i> did, step by step. This should be the longest part.</li>
<li><b>Result</b> — what changed because of your actions, with a measurable outcome if you have a genuine one, and what you learned.</li>
</ul>
<h2>Tips</h2>
<ul>
<li>Say “I”, not “we”: the assessor needs to know what you personally did.</li>
<li>Prepare five or six strong examples you can adapt to different questions.</li>
<li>Use recent examples where you can, and keep to the word limit on written forms.</li>
<li>For Civil Service applications, check the behaviour descriptions for the grade you are applying for — they describe what good looks like at that level.</li>
</ul>
<h2>Example outline</h2>
<p><i>Situation:</i> our team’s month-end reports were regularly late. <i>Task:</i> I was asked to speed up the process. <i>Action:</i> I mapped the steps, removed duplicate checks and built a shared checklist with deadlines. <i>Result:</i> reports went out on time for the following quarters and the checklist became the team standard.</p>
"""),
    ('right-to-work-questions', 'Right to work questions on UK job applications',
     'What “Do you have the right to work in the UK?” and the sponsorship question are asking, and how to answer clearly.',
     """
<p>Most UK application forms ask about your right to work. They often ask two separate questions, and it helps to read them carefully.</p>
<h2>“Do you have the right to work in the UK?”</h2>
<p>This asks about your status today. UK employers must check that everyone they employ has the right to work, so the question is standard. Answer it truthfully based on your current status.</p>
<h2>“Will you now or in the future require sponsorship?”</h2>
<p>This asks whether the employer would need to sponsor a visa for you, now or later. Someone can have the right to work today but still need sponsorship in future, for example if their current permission is time-limited. Answer exactly what is asked.</p>
<h2>Time-limited permission</h2>
<p>If your permission to work ends on a certain date or has conditions, many forms include a box for details. Use it rather than forcing a simple Yes/No, and be ready to show your documents if you are offered the job.</p>
<h2>Where to check</h2>
<p>The official guidance on proving your right to work and on visas is on <a href="https://www.gov.uk/prove-right-to-work" rel="noopener">GOV.UK</a>. If you are unsure about your own status, use official sources or a regulated immigration adviser.</p>
"""),
    ('workday-job-applications', 'Workday job applications: a practical guide',
     'How Workday applications work, what each step asks for, and how to get through them faster.',
     """
<p>Many large employers use Workday for their careers sites. Applications usually need an account per employer, and they ask you to enter much of your CV into separate fields.</p>
<h2>The usual steps</h2>
<ol>
<li><b>Create an account</b> on the employer’s Workday site (each company has its own).</li>
<li><b>My Information</b> — name, contact details, address and how you heard about the role.</li>
<li><b>My Experience</b> — each job and education entry with dates, plus your CV upload, languages and websites.</li>
<li><b>Application Questions</b> — eligibility, notice period, salary expectations and role-specific questions.</li>
<li><b>Voluntary Disclosures</b> and <b>Self Identify</b> — equality monitoring, usually with a “Prefer not to say” option.</li>
<li><b>Review</b> — check everything before you submit.</li>
</ol>
<h2>Tips</h2>
<ul>
<li>Keep your CV dates consistent (month and year) — Workday asks for them in specific boxes.</li>
<li>Uploading your CV can pre-fill some fields, but check every one: parsing is often incomplete.</li>
<li>Use “Save and Continue” after each page so you do not lose work.</li>
<li>Keep a note of which employers you have accounts with and the email you used.</li>
</ul>
"""),
]

CTA = """<div class="cta-card"><b>Fill applications from your CV in one click</b>
<p>Snapply is a Chrome extension that fills job applications from your CV, remembers your answers and drafts cover letters from your real experience. You review everything and press submit yourself. Free for 5 applications a month.</p>
<a class="btn btn-dark" href="/?utm_source=guide">Try Snapply free</a></div>"""


def page(title, desc, body, path):
    return f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} · Snapply</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{BASE}/{path}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:image" content="{BASE}/img/fill.jpg">
<link rel="icon" href="/favicon.png">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
</head>
<body data-event="guide_visit">
<header class="nav scrolled"><div class="wrap"><a class="brand" href="/"><img src="/logo.png" alt="">Snapply</a><nav class="links"><a href="/#how">How it works</a><a href="/#pricing">Pricing</a><a href="/guides/">Guides</a></nav><div class="actions"><a class="btn btn-dark btn-sm" href="https://chromewebstore.google.com/detail/snapply/pbciplmicohoeflmnjapakibfgbmjcmb" target="_blank" rel="noopener">Add to Chrome</a></div></div></header>
<main class="doc">
{body}
</main>
<footer><div class="wrap"><div><a class="brand" href="/" style="display:flex;margin:0 0 12px"><img src="/logo.png" alt="">Snapply</a><span>Job applications, filled in a snap.</span></div><div><h4>Product</h4><a href="/#how">How it works</a><a href="/#pricing">Pricing</a><a href="/guides/">Guides</a></div><div><h4>Company</h4><a href="mailto:hello@snapply.co.uk">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div><div class="legal">© 2026 Snapply. Operated by Tolga Oy, United Kingdom.</div></div></footer>
<script src="/app.js" defer></script>
</body>
</html>
"""


def main():
    out = SITE / 'guides'
    out.mkdir(exist_ok=True)
    for slug, title, desc, body in GUIDES:
        content = f'<p class="fine"><a href="/guides/">Guides</a> · Updated {UPDATED}</p>\n<h1>{html.escape(title)}</h1>\n<p class="intro">{html.escape(desc)}</p>\n{body}\n{CTA}'
        (out / f'{slug}.html').write_text(page(title, desc, content, f'guides/{slug}'))
    items = '\n'.join(f'<li><a href="/guides/{s}"><b>{html.escape(t)}</b></a><br><span class="fine">{html.escape(d)}</span></li>' for s, t, d, _ in GUIDES)
    index = f'<h1>Job application guides</h1>\n<p class="intro">Practical, honest advice for UK job applications.</p>\n<ul class="guide-list">\n{items}\n</ul>\n{CTA}'
    (out / 'index.html').write_text(page('Job application guides', 'Practical advice for UK job applications: NHS supporting statements, cover letters, competency questions, right to work and Workday.', index, 'guides/'))
    urls = ['', 'guides/', *[f'guides/{s}' for s, *_ in GUIDES], 'privacy', 'terms']
    (SITE / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                      + ''.join(f'  <url><loc>{BASE}/{u}</loc></url>\n' for u in urls) + '</urlset>\n')
    (SITE / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n')
    print(f'{len(GUIDES)} guides, index, sitemap.xml, robots.txt')


if __name__ == '__main__':
    main()
