// V0.16 Greenhouse DOM normalization based on a real live fixture.
// This adapter only normalizes structure; it does not contain candidate-specific data.
(function(){
  function isGreenhouse(){return /(^|\.)greenhouse\.io$/i.test(location.hostname)}
  function pageType(){return /\/jobs\//i.test(location.pathname)?'APPLICATION':'UNKNOWN'}
  function isReactSelectHelper(el){
    if(!el || el.tagName!=='INPUT') return false;
    const cls=String(el.className||'');
    const container=el.closest('.select__container,[class*="select__container"],[class*="select-shell"]');
    const semantic=el.id||el.name||el.getAttribute('aria-label')||el.getAttribute('placeholder');
    return !!container && !semantic && /requiredInput|select/i.test(cls);
  }
  function fieldContainer(el){return el.closest('.field,.form-group,.question,fieldset,[class*="field"],[class*="question"]')}
  function questionContext(el){return fieldContainer(el)?.innerText||''}
  window.JobCopilotGreenhouse={isGreenhouse,pageType,isReactSelectHelper,fieldContainer,questionContext};
})();
