// CIPHR iRecruit adapter: conservative, no-submit, no-2FA handling.
const CIPHR = {
  isCiphr() { return /\.ciphr-irecruit\.com$/i.test(location.hostname); },
  pageType() {
    const t=(document.body.innerText||'').slice(0,6000);
    if (/two.factor|authenticator|verification code|backup code/i.test(t)) return 'AUTH';
    if (/eligibility check|killer question/i.test(t)) return 'ELIGIBILITY';
    if (/competency question|supporting statement/i.test(t)) return 'COMPETENCY';
    if (/employment|work history|previous employer/i.test(t)) return 'EMPLOYMENT';
    if (/education|qualification/i.test(t)) return 'EDUCATION';
    return 'APPLICATION';
  },
  blocks(kind) {
    const rx=kind==='employment'?/employment|work history|previous employer/i:/education|qualification|university|college/i;
    return [...document.querySelectorAll('fieldset,.form-group,.panel,.card,.row,section,[class*=employment],[class*=education]')]
      .filter(x=>rx.test((x.innerText||'').slice(0,500)) && x.querySelector('input,select,textarea'));
  },
  questionContext(el) {
    const box=el.closest('fieldset,.form-group,.question,.panel,.card,.row')||el.parentElement;
    return (box?.innerText||'').replace(/\s+/g,' ').trim().slice(0,1000);
  }
};
window.JobCopilotCIPHR=CIPHR;
