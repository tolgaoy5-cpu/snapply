# Snapply

*Snap. Apply. Done.* — a Chrome extension that fills job applications from your CV, remembers your answers, and drafts
written answers and cover letters with AI — **without inventing anything and without ever
submitting for you.**

It opens as a side panel on supported application sites, fills what it can verify, asks you once
for what it cannot, and remembers that answer for the next application.

```
Your CV ─► Local backend (FastAPI) ─► Master profile ─┐
                                                        ├─► Chrome extension ─► Application form
Saved answers / referees (on this computer) ───────────┘        │
                                                                 ├─ fills verified fields
Job description ─► requirements ─► CV evidence ─► AI draft ──────┤─ asks you once, remembers
                                    (grounding check)            └─ you review and submit
```

**Sister projects:** [Lunoviq Valuation](https://github.com/tolgaoy5-cpu/lunoviq-valuation) ·
[Lunoviq FP&A](https://github.com/tolgaoy5-cpu/lunoviq-fpa)

## What it does

**Fill this page** — one button, per page of the application:
- Personal details, phone, address and links from your profile.
- **Workday** — every work experience and education row, dates and languages. Dates are committed
  to Workday's own form model and verified, so *Save and Continue* accepts them.
- **TRAC (NHS)** — education and employment history rows (adding rows as needed); training courses
  are chosen by you from the certifications in your CV.
- **Greenhouse** — text, list (react-select) and consent questions.

**Ask once, remember, fill next time**
- An unanswered question is shown in the panel with the site's own options; *Fill & remember*
  writes it to the page and saves it. The same or a reworded question on another site is filled
  automatically next time (e.g. a notice period saved on Workday filled a Greenhouse form).
- **Confirm every time** for anything that should never be reused silently: legal declarations
  (right to work, convictions, barred lists, consents), personal and equality data (date of birth,
  ethnicity, disability, nationality…), and job-specific statements (supporting information, reasons
  for applying, gaps in employment).
- **Referees** are other people's data: entered once in the panel, filled only after you confirm.

**AI drafting (optional, your own OpenAI key)**
- *Draft with AI* for written questions and *Generate from current job* for cover letters, built
  only from CV evidence that matches the job's requirements.
- **Grounding check**: every sentence must share content with your CV and may add little new
  content; unsupported outcome or quality words ("effective", "fostered", "crucial") are rejected.
  The model gets one revision round; invented tails are trimmed and what is still unsupported is
  removed and reported. Credentials and numbers must appear in the CV verbatim.
- Jobs outside your CV's field are declined by default; on request the letter describes
  transferable experience only. Your own letter can be attached too (its wording is your
  responsibility; unverified credentials still block).
- Cover letters are rendered to PDF/DOCX and attached to the site's cover letter field.

**In-page panel** — opens automatically on recognised application sites (Workday, Greenhouse,
Lever, Ashby, TRAC, CIPHR), pushes the page aside so the site's own buttons stay reachable, and
minimises to a launcher.

## Safety rules (enforced in code and tests)

- Never submits an application or clicks the final submit button.
- Never fabricates CV facts; anything not verified is asked, not guessed.
- A value that is visible on the page is not treated as accepted until the site's own form model
  holds it (Workday dates, React inputs).
- Never writes your own details into other people's fields (referee and employer rows).
- Personal data stays on your computer; only matching CV evidence is sent to the AI provider, and
  only when you ask for a draft.

## Hosted mode

The backend also runs as a multi-user service (`SNAPPLY_MODE=cloud`): Google sign-in, per-user
storage, monthly AI allowances, Stripe subscriptions, and **legal/personal answers and referees kept
in the browser only**. See [docs/DEPLOY.md](docs/DEPLOY.md).

## Run it locally (developer setup)

Requirements: Chrome, Python 3.10+.

```bash
./START_BACKEND.command          # creates backend/.venv, installs requirements, serves http://127.0.0.1:8787
```

1. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked** → select `extension/`.
2. Open the panel on a job application, **Import or replace CV** (PDF/DOCX) and review the profile.
3. Optional AI: put an OpenAI key in `~/.lunoviq/ai.toml` (`[ai] provider = "openai"`,
   `api_key = "..."`) or set `OPENAI_API_KEY` (and optionally `JOB_COPILOT_MODEL`, default `gpt-4o-mini`).

Your data lives in `~/.job-copilot/` (profile, saved CV, saved answers, referees).

## Tests

```bash
./run_tests.sh
```

22 regression suites (Node and Python) use mocks, synthetic data and temporary data directories:
Workday date commit and multiselect detection, question matching and sensitivity classes,
saved answers and referee persistence, TRAC referee capture/fill, field-rule word boundaries,
requirement extraction, the AI grounding check, and the cover letter review/attach flow, cloud accounts (sign-in, isolation, quotas, Stripe
webhooks, deletion) and browser-only storage of sensitive answers.

## Project status

Working prototype, verified page by page on live Workday, Greenhouse and TRAC applications.
Known limits: Workday multi-select and date-of-birth questions are read and remembered but filled
by the user; location search lists are left to the user; Lever/Ashby have detection but no
dedicated filler yet. Hosted mode is built and tested; not yet deployed or published on the Chrome Web Store.

## Repository layout

```
extension/   Chrome extension (MV3): content scripts, ATS adapters, in-page panel, popup UI
site/        Landing page, privacy policy and terms (static)
backend/     FastAPI service: CV import, profile, saved answers, AI drafting, grounding, cover letters
tests/       Regression suites and live-captured form fixtures (no personal data)
```

## License

All rights reserved — publicly visible for portfolio and evaluation purposes only. See [LICENSE](LICENSE).
