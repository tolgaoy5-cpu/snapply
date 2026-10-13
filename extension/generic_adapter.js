// Universal fallback adapter. It must not know about any specific ATS vendor.
const GenericATS = {
  detect(){ return true; },
  name(){ return 'GENERIC'; },
  pageType(){
    const t=(document.body.innerText||'').slice(0,10000);
    if(/employment|work history|previous employer/i.test(t)) return 'EMPLOYMENT';
    if(/education|qualification|university|college/i.test(t)) return 'EDUCATION';
    if(/supporting statement|competency|person specification|essential criteria/i.test(t)) return 'COMPETENCY';
    return 'APPLICATION';
  },
  questionContainer(el){ return el.closest('fieldset,.form-group,.question,.field,.control-group,.row,.panel,.card,section')||el.parentElement; }
};
window.JobCopilotGenericATS=GenericATS;
