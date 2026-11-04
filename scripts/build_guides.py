"""Builds the site's guide pages (site/guides/*.html), the guides index, sitemap.xml and robots.txt.
Content is plain, accurate UK job-application advice; each guide ends with a short Snapply note.
  python3 scripts/build_guides.py
"""
import html
import json
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / 'site'
BASE = 'https://snapply.co.uk'
UPDATED = '4 November 2026'
DATE_ISO = '2026-11-04'

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
    ('notice-period-question', 'How to answer “What is your notice period?”',
     'What to write when a UK application asks for your notice period, with examples for every situation.',
     """
<p>Almost every UK application form asks for your notice period. Employers use it to plan a start date — it is not a test, so a short, accurate answer is best.</p>
<h2>Find your real notice period</h2>
<p>Check your employment contract or offer letter. If your contract says nothing, the legal minimum you must give after one month in a job is one week, but most contracts set a longer period — commonly one month, and often three months for senior roles.</p>
<h2>Example answers</h2>
<ul>
<li><b>Employed:</b> “One month.” or “Three months, though I can ask about an earlier release.”</li>
<li><b>On probation:</b> “One week (I am in my probation period).”</li>
<li><b>Not working:</b> “Available immediately.”</li>
<li><b>Contract or temporary role:</b> “My contract ends on 30 November, so I can start from 1 December.”</li>
<li><b>Student or graduate:</b> “Available from July after I finish my degree.”</li>
</ul>
<h2>Tips</h2>
<ul>
<li>Do not shorten it to look keen. Employers expect to wait, and a start date you cannot keep causes problems later.</li>
<li>If you have holiday left, you may be able to use it to leave earlier — only mention this if you have checked.</li>
<li>Give the same answer on every application, so your applications stay consistent.</li>
</ul>
"""),
    ('salary-expectations-question', 'How to answer salary expectations on an application',
     'Answer the salary expectations question on UK job applications with a researched, realistic range.',
     """
<p>Many UK forms ask “What are your salary expectations?” and some make the box required. A researched answer protects you from underselling yourself without pricing you out.</p>
<h2>1. Start from the advert</h2>
<p>If the advert gives a salary or a band — common in the NHS (Agenda for Change bands), the Civil Service and the public sector — your answer is usually simply that figure or band. For example: “In line with the advertised salary of £32,000.”</p>
<h2>2. Research the market</h2>
<p>For adverts without a salary, look at similar roles in the same city and industry on job boards and in salary surveys. London roles typically pay more than the same role elsewhere in the UK.</p>
<h2>3. Give a range, not a single number</h2>
<p>A short range — for example “£35,000–£38,000 depending on the full package” — leaves room to negotiate and shows you understand that benefits matter too.</p>
<h2>4. If the box only accepts a number</h2>
<p>Enter the figure you would genuinely accept, usually towards the middle of your range, and raise the full package at offer stage.</p>
<h2>Avoid</h2>
<ul>
<li>Writing “negotiable” in a required number box — it may be rejected or look evasive.</li>
<li>Quoting your current salary when the question asks for expectations.</li>
<li>Changing your answer from one application to the next for the same kind of role.</li>
</ul>
"""),
    ('civil-service-applications', 'Civil Service applications: Success Profiles, behaviours and statements',
     'How Civil Service job applications work: Success Profiles, behaviour examples, personal statements and sifting.',
     """
<p>Civil Service roles are advertised on Civil Service Jobs and assessed with the <b>Success Profiles</b> framework. Knowing how it works makes applications far less daunting.</p>
<h2>What Success Profiles assess</h2>
<p>Each advert lists which elements it will assess. The five elements are <b>Behaviours</b>, <b>Strengths</b>, <b>Ability</b>, <b>Experience</b> and <b>Technical</b>. At application stage you are usually asked for some of these:</p>
<ul>
<li><b>Behaviour examples</b> — for example “Delivering at Pace” or “Working Together”. Each has its own box, often with a word limit (250 words is common).</li>
<li><b>A personal statement</b> — a longer piece showing how you meet the essential criteria in the advert. Check the word limit in the advert.</li>
<li><b>A CV</b> — often a short employment history with key achievements.</li>
</ul>
<h2>Writing behaviour examples</h2>
<p>Use one real example per behaviour and structure it with <a href="star-method-competency-questions">STAR</a> (Situation, Task, Action, Result). Spend most of the words on what <b>you</b> did, use “I” rather than “we”, and end with a measurable result.</p>
<h2>Tips</h2>
<ul>
<li>Read the behaviour descriptions for the grade you are applying for — they differ by level.</li>
<li>Many Civil Service roles are sifted without names, so let the evidence speak for itself.</li>
<li>If there is a lead behaviour, it may be used for an initial sift, so make that example your strongest.</li>
<li>Write in a document first; long forms can time out.</li>
</ul>
"""),
    ('why-do-you-want-this-job', 'How to answer “Why do you want to work here?”',
     'Answer motivation questions on UK applications with specific, honest reasons that match the role.',
     """
<p>“Why do you want this role?” and “Why do you want to work for us?” appear on most applications. Shortlisters look for answers that could only be written about <b>this</b> job.</p>
<h2>A three-part answer</h2>
<ol>
<li><b>The role:</b> one or two parts of the job description that genuinely interest you, and why.</li>
<li><b>Your fit:</b> the experience or skills you would bring to those parts, with a brief example.</li>
<li><b>The organisation:</b> something specific — their services, a recent project, their values or the people they serve.</li>
</ol>
<h2>Example</h2>
<p>“I want to move into management accounting, and this role’s focus on monthly reporting and forecasting matches the work I enjoy most. In my current role I prepare the monthly variance analysis for our property portfolio. Northbridge Homes’ plan to build 500 affordable homes in east London is also something I would be proud to support.”</p>
<h2>Avoid</h2>
<ul>
<li>Generic praise (“a market leader with a great culture”) that fits any employer.</li>
<li>Talking only about what you will gain — show what you bring too.</li>
<li>Copying the same paragraph into every application without changing the details.</li>
</ul>
"""),
    ('reason-for-leaving', 'How to answer “Reason for leaving” on an application form',
     'Short, honest and professional ways to explain why you are leaving or left a job on UK application forms.',
     """
<p>Employment history sections often ask for a reason for leaving each job. Keep it short, true and neutral — a few words is usually enough.</p>
<h2>Common reasons and how to word them</h2>
<ul>
<li><b>Career progression:</b> “Seeking a role with more responsibility.”</li>
<li><b>End of contract:</b> “Fixed-term contract ended.”</li>
<li><b>Redundancy:</b> “Role made redundant.” Redundancy is about the role, not you, so there is no need to explain further.</li>
<li><b>Relocation:</b> “Moved to London.”</li>
<li><b>Study or caring:</b> “Left to complete an MSc.” or “Left to care for a family member.”</li>
<li><b>Still employed:</b> “Currently employed.” or “Seeking a new challenge.”</li>
</ul>
<h2>Tips</h2>
<ul>
<li>Do not criticise a previous employer or manager, even if the reason was difficult.</li>
<li>If you were dismissed, be honest but brief, and be ready to explain what you learned at interview.</li>
<li>Make sure your reasons and dates match your CV — inconsistencies are noticed.</li>
</ul>
"""),
    ('employment-gaps', 'How to explain gaps in your employment history',
     'Explain career breaks and gaps on UK applications and CVs honestly, briefly and with confidence.',
     """
<p>Gaps are common — study, caring, health, travel, redundancy or a difficult job market. Employers mostly want an accurate history, not a perfect one.</p>
<h2>How to explain a gap</h2>
<ul>
<li><b>Name it briefly:</b> “Career break to care for a family member (2023–2024).”</li>
<li><b>Add anything useful you did:</b> courses, volunteering, freelance work or a qualification.</li>
<li><b>Show you are ready now:</b> “Now looking to return to full-time finance work.”</li>
</ul>
<h2>On application forms</h2>
<p>Some forms — especially in the NHS, education, social care and other safer-recruitment roles — ask you to explain every gap, sometimes of more than a few weeks. Fill in each one: an unexplained gap can hold up your application or be queried at interview.</p>
<h2>Health-related gaps</h2>
<p>You do not have to give medical details on an application. A neutral phrase such as “career break for personal reasons” is fine; you can decide later whether to discuss adjustments with the employer.</p>
<h2>Keep it consistent</h2>
<p>Use the same dates (month and year) on your CV, the application form and LinkedIn.</p>
"""),
    ('job-references-uk', 'References on UK job applications: who to give and how',
     'Choose referees for UK job applications, ask their permission and fill in reference sections correctly.',
     """
<p>Most UK application forms ask for one or two referees. Employers often contact them after making an offer, though some (for example in the NHS or schools) may contact them earlier.</p>
<h2>Who to choose</h2>
<ul>
<li><b>Your current or most recent line manager</b> — usually required as the first referee.</li>
<li><b>A previous manager</b> — some forms ask for referees covering a set number of years.</li>
<li><b>Students and graduates:</b> a tutor, placement supervisor or part-time job manager.</li>
<li>Avoid friends and family unless a <b>character reference</b> is specifically requested.</li>
</ul>
<h2>Before you add someone</h2>
<ul>
<li>Ask their permission and confirm their current job title, work email and phone number.</li>
<li>Tell them which roles you are applying for, so they are not surprised by a request.</li>
<li>Many forms ask whether a referee may be contacted before interview — say no if you do not want your current employer to know yet.</li>
</ul>
<h2>What a reference usually contains</h2>
<p>Many UK employers give a factual reference — your job title and dates of employment — and some add information about absence or performance. A reference must be accurate and fair.</p>
"""),
    ('equality-monitoring-forms', 'Equality monitoring questions on job applications',
     'What the equality and diversity questions on UK application forms are for, and your choices when answering them.',
     """
<p>Many UK applications include an equality and diversity section asking about things like age, sex, ethnicity, disability, religion and sexual orientation — characteristics protected under the Equality Act 2010.</p>
<h2>Why employers ask</h2>
<p>Employers use the anonymous totals to check whether their recruitment is fair — for example, whether people from some groups drop out at a particular stage. This section is usually kept separate from your application and not seen by the people shortlisting.</p>
<h2>Your choices</h2>
<ul>
<li>These questions are normally voluntary, and most include a <b>“Prefer not to say”</b> option.</li>
<li>Answering, or not answering, should not affect your application.</li>
<li>Read the form’s privacy notice if you want to know exactly how the data is stored and used.</li>
</ul>
<h2>Disability and the Guaranteed Interview Scheme</h2>
<p>Some employers, including many in the public sector, offer an interview to disabled applicants who meet the essential criteria (often called the Disability Confident or Guaranteed Interview Scheme). This question is separate from equality monitoring — read it carefully if it applies to you. You can also ask for reasonable adjustments for interviews or tests.</p>
<p class="fine">Snapply never fills equality, disability or other personal questions for you — you always answer those yourself.</p>
"""),
    ('graduate-job-applications', 'Graduate job applications in the UK: a practical guide',
     'How UK graduate schemes and entry-level applications work: timelines, online tests, forms and interviews.',
     """
<p>Graduate schemes in the UK usually open in the autumn of your final year and many recruit on a rolling basis — applying early can matter.</p>
<h2>The typical process</h2>
<ol>
<li><b>Online application</b> — personal details, education, work experience and a few motivation or competency questions.</li>
<li><b>Online tests</b> — numerical, verbal or situational judgement tests, sometimes straight after applying.</li>
<li><b>Video or phone interview</b> — often pre-recorded.</li>
<li><b>Assessment centre</b> — group exercises, a presentation and interviews, often online.</li>
</ol>
<h2>Tips for the application form</h2>
<ul>
<li>Use part-time jobs, volunteering, societies and projects as evidence — they count.</li>
<li>Answer competency questions with <a href="star-method-competency-questions">STAR</a>.</li>
<li>Make each “Why this firm?” answer specific (see <a href="why-do-you-want-this-job">our guide</a>).</li>
<li>Keep a spreadsheet of deadlines, logins and stages — you may apply to dozens of schemes.</li>
<li>Check if a scheme asks about visa sponsorship before applying, if it applies to you.</li>
</ul>
"""),
    ('trac-job-applications', 'TRAC job applications: how to fill in the NHS TRAC form',
     'A section-by-section guide to TRAC applications (apps.trac.jobs) used by many NHS trusts: employment history, education, references and supporting information.',
     """
<p>Many NHS trusts, and some other public bodies, use <b>TRAC</b> for recruitment. When you press “Apply” on an advert, you are often taken to an application form on <b>apps.trac.jobs</b>. It is long, but it follows the same pattern every time, so it gets quicker once you know it.</p>
<h2>Before you start</h2>
<ul>
<li>Have your full work history to hand, with <b>month and year</b> start and end dates, employer addresses and a short list of duties for each job.</li>
<li>List your qualifications with the institution, subject, grade and date.</li>
<li>Ask two referees in advance, including your current or most recent line manager (see our <a href="job-references-uk">guide to references</a>).</li>
<li>Read the person specification — the supporting information section is judged against it.</li>
</ul>
<h2>The main sections</h2>
<ol>
<li><b>Personal details and contact information.</b> Use an email address you check daily: interview invitations often arrive by email with short deadlines.</li>
<li><b>Right to work and professional registration.</b> Answer the right to work questions exactly (see <a href="right-to-work-questions">our guide</a>). If the role needs registration (for example NMC or HCPC), have your PIN and expiry date ready.</li>
<li><b>Employment history.</b> Your current or most recent job comes first, then previous jobs. Each one is a separate row with dates, employer, job title and duties. Explain gaps briefly — see <a href="employment-gaps">explaining gaps</a>.</li>
<li><b>Education, qualifications and training.</b> One row per qualification. Include relevant short courses and mandatory training where the form asks for it.</li>
<li><b>References.</b> Usually covering the last few years of employment or study.</li>
<li><b>Supporting information.</b> This is where shortlisting is mostly decided. Address the person specification criterion by criterion — our <a href="nhs-supporting-statement">NHS supporting statement guide</a> shows how.</li>
<li><b>Declarations and equality monitoring.</b> Read each declaration carefully. Equality questions are usually voluntary (see <a href="equality-monitoring-forms">equality monitoring</a>).</li>
</ol>
<h2>Tips that save time</h2>
<ul>
<li>Save each section as you go. Forms can time out, and you can come back to a saved draft.</li>
<li>Write the supporting information in a document first, then paste it in.</li>
<li>Your TRAC account keeps some details between applications, but check every section again — especially your current job and dates.</li>
<li>Adverts can close early when a trust receives many applications, so do not leave it to the closing date.</li>
</ul>
"""),
    ('nhs-jobs-application-form', 'NHS Jobs application form: a step-by-step guide',
     'How to complete an application on NHS Jobs (jobs.nhs.uk): what each part asks for and how shortlisting works.',
     """
<p><b>NHS Jobs</b> (jobs.nhs.uk) is the main job site for NHS roles in England and Wales. Some adverts are completed on NHS Jobs itself; others send you to the trust’s own system, such as TRAC (see our <a href="trac-job-applications">TRAC guide</a>).</p>
<h2>1. Read the job pack first</h2>
<p>Download the job description and person specification. Note the <b>essential criteria</b> and which are assessed on the application form. That tells you what your answers must cover.</p>
<h2>2. Work through the form</h2>
<ul>
<li><b>Personal details and eligibility:</b> contact details, right to work, and any registration the role needs.</li>
<li><b>Employment history:</b> each job with dates, employer, title and main responsibilities. Most recent first.</li>
<li><b>Education and training:</b> qualifications with dates and grades, and relevant training.</li>
<li><b>References:</b> normally your current or most recent employer, covering a set number of years.</li>
<li><b>Supporting information:</b> the most important part — evidence against the person specification. See <a href="nhs-supporting-statement">how to write it</a>.</li>
<li><b>Declarations and equality monitoring.</b></li>
</ul>
<h2>3. How shortlisting usually works</h2>
<p>Shortlisters normally score applications against the person specification. Clear evidence for each essential criterion matters more than length. Many trusts shortlist without seeing your personal details, so the evidence has to speak for itself.</p>
<h2>4. Before you submit</h2>
<ul>
<li>Check dates line up and gaps are explained.</li>
<li>Make sure the supporting information is tailored to this post, not copied from another.</li>
<li>Check the closing date — some adverts close early.</li>
</ul>
"""),
    ('autofill-job-applications', 'How to autofill job applications (and what to check before you submit)',
     'The options for filling job application forms faster — browser autofill, extensions and saved answers — and the checks that stop mistakes.',
     """
<p>Most job application forms ask for the same things: contact details, work history, education, right to work, notice period and a CV upload. Filling them by hand for every application is slow, and retyping makes mistakes more likely.</p>
<h2>Your options</h2>
<ul>
<li><b>Browser autofill</b> (Chrome, Safari, Edge) fills name, email, phone and address. It is free and built in, but it does not handle work history, education rows or application questions.</li>
<li><b>A master document</b> you copy from. Free and reliable, but still manual.</li>
<li><b>Job application autofill extensions.</b> These read your CV and fill the longer parts of the form — job history, education, upload fields and common questions. Check which application systems they support (for example Workday, Greenhouse, Lever, TRAC) and how they handle your data.</li>
</ul>
<h2>What to check, whatever you use</h2>
<ol>
<li><b>Dates:</b> start and end dates in the format the form wants, and your current job marked as current.</li>
<li><b>Dropdowns:</b> degree level, country and phone type are easy to get wrong.</li>
<li><b>The right file in the right slot:</b> CV in the CV upload, cover letter in the cover letter upload.</li>
<li><b>Eligibility and legal questions:</b> right to work, sponsorship, criminal record and declarations should always be answered by you, carefully.</li>
<li><b>Written answers:</b> anything that sounds generic should be rewritten for the role.</li>
</ol>
<h2>Privacy</h2>
<p>Your CV contains personal data. Before using any tool, read where your data is stored, whether it is used to train AI models, and how to delete it.</p>
<p class="fine">Snapply is one of these tools: it fills UK application forms from your CV and saved answers, never submits for you, and never fills equality or other sensitive questions on its own. You review every page.</p>
"""),
    ('ai-cover-letter-uk', 'Using AI to write a cover letter — without making things up',
     'How to use AI for a UK cover letter safely: give it your real CV and the advert, then check every claim.',
     """
<p>AI tools can draft a cover letter in seconds. The risk is that they <b>invent things</b>: a team you never led, a qualification you do not have, numbers that sound impressive but are not yours. Recruiters notice, and it can come up at interview.</p>
<h2>A safer way to use AI</h2>
<ol>
<li><b>Give it your real CV and the job advert.</b> Ask it to use only experience that appears in your CV.</li>
<li><b>Ask for the advert’s top two or three requirements</b> to be matched with real examples — the structure in our <a href="uk-cover-letter">UK cover letter guide</a>.</li>
<li><b>Check every sentence against your CV.</b> Delete anything you cannot back up with a real example.</li>
<li><b>Make the opening and “why this employer” part yours.</b> These are the lines that sound most generic when AI writes them.</li>
<li><b>Keep it under one page</b> and save it as a PDF if the form asks for an upload.</li>
</ol>
<h2>Red flags to remove</h2>
<ul>
<li>Numbers or percentages you did not give it.</li>
<li>Job titles, employers or qualifications not in your CV.</li>
<li>Phrases like “I am thrilled to apply” or “dynamic, results-driven professional”.</li>
</ul>
<p class="fine">Snapply drafts cover letters only from your CV and the advert, checks each sentence against your CV and removes anything it cannot back up. You still read and edit it before attaching.</p>
"""),
    ('employment-history-application-form', 'How to fill in employment history on a job application form',
     'Dates, job titles, duties, gaps and reasons for leaving: how to complete the employment history section on UK application forms.',
     """
<p>The employment history section looks simple, but it is where many forms ask for the most detail — and where inconsistencies with your CV are spotted.</p>
<h2>What each row usually needs</h2>
<ul>
<li><b>Employer name and address.</b> Use the legal or commonly used name, and the address of the site you worked at.</li>
<li><b>Job title</b> exactly as it was.</li>
<li><b>Start and end dates</b> — usually month and year. For your current job, tick “current” or enter “present”.</li>
<li><b>Main duties.</b> Three to six short points, focused on what the new role cares about.</li>
<li><b>Reason for leaving</b> — keep it short and neutral (see <a href="reason-for-leaving">our guide</a>).</li>
<li><b>Notice period</b> for your current job (see <a href="notice-period-question">notice period</a>).</li>
</ul>
<h2>Order and gaps</h2>
<p>Most forms want your current or most recent job first. Many public sector forms ask you to account for every gap over a few months — a short line such as “travelling” or “caring for a family member” is enough (see <a href="employment-gaps">explaining gaps</a>).</p>
<h2>Keep it consistent with your CV</h2>
<p>Dates and titles on the form should match your CV and what your references will confirm. Keeping one accurate master list of your jobs makes every application faster and avoids contradictions.</p>
"""),
    ('startup-job-applications-greenhouse-lever', 'Applying through Greenhouse, Lever and Ashby: tips for tech and startup jobs',
     'What to expect on Greenhouse, Lever, Ashby and Workable application forms used by many UK tech companies and startups.',
     """
<p>Many UK tech companies and startups use application systems such as <b>Greenhouse</b>, <b>Lever</b>, <b>Ashby</b> and <b>Workable</b>. Their forms are shorter than NHS or Civil Service forms, but they have their own quirks.</p>
<h2>What these forms usually ask</h2>
<ul>
<li>Name, email, phone (often with a separate country code), location and LinkedIn URL.</li>
<li>A <b>CV upload</b> — and sometimes a separate cover letter upload or text box.</li>
<li>Short custom questions: right to work, sponsorship, notice period, salary expectations, “How did you hear about us?”.</li>
<li>Sometimes one longer question, such as “Why do you want to join us?” (see <a href="why-do-you-want-this-job">our guide</a>).</li>
<li>An optional equality or demographic survey.</li>
</ul>
<h2>Tips</h2>
<ul>
<li>Your CV does most of the work here, so tailor its top third to the role.</li>
<li>Check dropdowns such as phone country and location, which are easy to mis-set.</li>
<li>Keep your answers to the common questions (right to work, notice period, salary range) consistent across applications.</li>
<li>If there is a cover letter box, a short, specific note beats a generic page.</li>
</ul>
"""),
    ('apply-for-jobs-faster', 'How to apply for more jobs in less time',
     'A practical system for UK job seekers: reusable answers, tailored CVs and fewer repeated forms.',
     """
<p>Applying for jobs in the UK often means typing the same details into dozens of different forms. A simple system saves hours each week without making your applications generic.</p>
<h2>1. Keep a master document</h2>
<p>Store everything forms ask for in one place: dates of each job, employer addresses, qualifications with grades and dates, referees, your notice period and salary expectations. Copying from one source also keeps your applications consistent.</p>
<h2>2. Write reusable answers — then tailor them</h2>
<p>Draft your best examples once: a STAR example for each common competency, a short “about me”, and answers to eligibility questions. For each application, adapt the first and last sentences to the advert rather than starting from a blank page.</p>
<h2>3. Tailor the parts that matter</h2>
<p>Spend your time on what shortlisters read closely: the supporting statement or cover letter, and the top of your CV. Match them to the advert’s essential criteria.</p>
<h2>4. Track everything</h2>
<p>Keep a list of each application: employer, role, date, login email, closing date and status. It makes follow-ups and interview preparation much easier.</p>
<h2>5. Automate the repetitive part</h2>
<p>Tools such as Snapply fill the repeated fields — personal details, work history, saved answers and your CV upload — from your own CV, so you spend your time on the questions that need real thought. Always review the form before you submit.</p>
"""),
]

CTA = """<div class="cta-card"><b>Fill applications from your CV in one click</b>
<p>Snapply is a Chrome extension that fills job applications from your CV, remembers your answers and drafts cover letters from your real experience. You review everything and press submit yourself. Free for 5 applications a month.</p>
<a class="btn btn-dark" href="/?utm_source=guide">Try Snapply free</a></div>"""


def page(title, desc, body, path):
    ld = '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@type": "Article", "headline": title, "description": desc,
        "dateModified": DATE_ISO, "inLanguage": "en-GB", "mainEntityOfPage": f"{BASE}/{path}", "image": f"{BASE}/img/fill.jpg",
        "author": {"@type": "Organization", "name": "Snapply", "url": BASE}, "publisher": {"@type": "Organization", "name": "Snapply", "url": BASE}}, ensure_ascii=False) + '</script>'
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
{ld}
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
    (out / 'index.html').write_text(page('Job application guides', 'Practical advice for UK job applications: NHS and Civil Service applications, cover letters, competency questions, notice period, salary, references and more.', index, 'guides/'))
    urls = ['', 'guides/', *[f'guides/{s}' for s, *_ in GUIDES], 'privacy', 'terms']
    (SITE / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                      + ''.join(f'  <url><loc>{BASE}/{u}</loc><lastmod>{DATE_ISO}</lastmod></url>\n' for u in urls) + '</urlset>\n')
    llms = ['# Snapply', '', '> Snapply is a Chrome extension for UK job seekers. It fills job application forms from your CV (personal details, work history, education, CV upload and saved answers such as notice period and right to work), drafts cover letters only from your real CV, and never submits for you. Works on Workday, Greenhouse, Lever, Ashby, Workable, Teamtailor, TalentLink, NHS Jobs and TRAC. Free for 5 applications a month; paid Pro plans for more.', '',
            '- [Homepage](https://snapply.co.uk/): what Snapply does, pricing and FAQ', '- [Chrome Web Store](https://chromewebstore.google.com/detail/snapply/pbciplmicohoeflmnjapakibfgbmjcmb)', '- [Privacy policy](https://snapply.co.uk/privacy)', '', '## Guides', '']
    llms += [f'- [{t}]({BASE}/guides/{sl}): {d}' for sl, t, d, _ in GUIDES]
    (SITE / 'llms.txt').write_text('\n'.join(llms) + '\n')
    (SITE / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n')
    print(f'{len(GUIDES)} guides, index, sitemap.xml, robots.txt')


if __name__ == '__main__':
    main()
