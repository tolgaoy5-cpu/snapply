# Chrome Web Store listing — Snapply

Package: `python3 scripts/build_store.py` → `dist/snapply-<version>-store.zip`
Images: `store/screenshot-s1..s4.png` (1280×800), `store/promo-tile-440x280.png`, icon `extension/icons/icon128.png`

## Store listing tab

**Name:** Snapply

**Summary (max 132 characters):**
Fill job applications from your CV in one click. Remembers your answers, drafts honest cover letters. You review and submit.

**Category:** Productivity → Workflow & planning
**Language:** English (United Kingdom)

**Description:**

Snap. Apply. Done.

Snapply fills job applications from your CV, remembers every answer you give once, and drafts cover letters from your real experience. You stay in control: you review every page and press submit yourself.

FILL THIS PAGE — ONE CLICK
• Work history, education, dates, languages and contact details from your CV
• Workday: every experience and education row, with dates the site actually accepts
• NHS Jobs / TRAC: education and employment history, training courses you choose
• Greenhouse: text, list and consent questions
• Lever, Ashby and CIPHR detected, with more sites coming

ANSWER ONCE, REUSED FOREVER
• A new question appears in the Snapply panel with the site's own options
• Your answer is filled and remembered — the same or a reworded question on another site is filled next time
• Legal and personal questions (right to work, convictions, equality data) are only suggested, never filled silently

HONEST AI, BUILT ON YOUR CV
• Cover letters and written answers drafted only from experience you really have
• Every sentence is checked against your CV; unsupported claims are rewritten or removed
• Cover letters are attached to the application as PDF

PRIVATE BY DESIGN
• Legal declarations, equality data and referee details stay in your browser and never reach our servers
• Snapply never presses the final submit button
• Delete your account, CV and answers with one click

PLANS
Free: 5 applications a month, remembered answers, 3 AI drafts a month.
Pro: unlimited applications, 300 AI drafts a month and cover letters for every application — £9.99/month (launch offer: £4.99 for the first 2 months) or £79/year.

Website: https://snapply.co.uk · Support: hello@snapply.co.uk

## Privacy practices tab

**Single purpose:**
Snapply helps the user complete online job application forms: it fills form fields from the user's own CV and confirmed answers, and drafts answers and cover letters for the user to review.

**Permission justifications:**
- `storage` / `unlimitedStorage`: keeps the user's session, cached profile, a copy of the user's CV file for attaching to applications, and legal/personal answers that must stay on the device (never sent to our server). The CV file can exceed the default storage quota.
- `identity`: Google sign-in (OpenID Connect) to the user's Snapply account via chrome.identity.launchWebAuthFlow.
- `activeTab`: reads the current application page when the user opens the Snapply popup, to detect the form and fill it on request.
- Host permission (content scripts on all sites): job applications are hosted on thousands of employer and applicant-tracking domains (Workday, Greenhouse, TRAC, Lever, Ashby, CIPHR and employers' own sites), so the form detector and filler must run on any site the user applies on. It only reads and fills form fields when the user asks; it never submits forms.
- Host permission `https://snapply-api.fly.dev/*`, `https://api.snapply.co.uk/*`: Snapply's own API (account, CV import, saved answers, AI drafting, payments).

**Remote code:** No, I am not using remote code. (All JavaScript is in the package; the API returns data only.)

**Data usage — collected:**
- Personally identifiable information (name, email, address, phone from the CV; Google account email)
- Personal communications: No
- Authentication information: No (Google sign-in tokens are exchanged for a Snapply session; no passwords)
- Location: No (beyond the address in the user's CV — counted under PII)
- Web history: No
- User activity: No
- Website content: Yes — text of the job advert and application questions on the page, used to fill the form and draft answers
- Financial and payment information: No (payments are handled by Stripe on its own pages)
- Health information: No (disability/health equality questions are kept in the browser only, not collected)

**Certifications (tick all three):**
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://snapply.co.uk/privacy

## Distribution tab
- Visibility: **Unlisted** for the beta (only people with the link can install)
- Regions: United Kingdom (all regions later)
- Pricing: Free (subscriptions are sold on our own site via Stripe)

## After the store assigns the extension id
Add `https://<store-id>.chromiumapp.org/` to the Google OAuth client's Authorized redirect URIs
(Google Cloud → Google Auth Platform → Clients → Snapply extension), otherwise sign-in fails in the store build.
