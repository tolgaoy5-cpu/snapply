// V0.14 privacy-safe live fixture capture.
// Captures form structure for debugging/adapters but NEVER input values, passwords,
// authentication secrets, file names or free-text user answers.
(function(){
  function visible(el){
    const s=getComputedStyle(el);
    return s.display!=='none'&&s.visibility!=='hidden'&&el.offsetParent!==null;
  }
  function esc(s){
    try{return CSS.escape(String(s))}catch(_){return String(s).replace(/[^a-zA-Z0-9_-]/g,'_')}
  }
  function selectorHint(el){
    if(el.id) return '#'+esc(el.id);
    const dt=el.getAttribute('data-testid'); if(dt) return `[data-testid="${String(dt).replace(/"/g,'')}"]`;
    const name=el.getAttribute('name'); if(name) return `${el.tagName.toLowerCase()}[name="${String(name).replace(/"/g,'')}"]`;
    const parts=[]; let n=el;
    for(let i=0;n&&n.nodeType===1&&i<4;i++,n=n.parentElement){
      let part=n.tagName.toLowerCase();
      if(n.classList?.length) part+='.'+[...n.classList].slice(0,2).map(esc).join('.');
      parts.unshift(part);
    }
    return parts.join(' > ');
  }
  function cleanText(s,max=260){
    return String(s||'').replace(/\s+/g,' ').trim().slice(0,max);
  }
  function labelFor(el){
    const xs=[];
    if(el.id){const l=document.querySelector(`label[for="${esc(el.id)}"]`);if(l)xs.push(l.innerText)}
    if(el.closest('label')) xs.push(el.closest('label').innerText);
    ['aria-label','placeholder','name','id'].forEach(a=>{const v=el.getAttribute(a);if(v)xs.push(v)});
    const g=el.closest('fieldset,.form-group,.field,.question,.control-group,.row,[class*=employment],[class*=education]');
    if(g){const l=g.querySelector('legend,.label,.question-text,h1,h2,h3,h4');if(l)xs.push(l.innerText)}
    return cleanText([...new Set(xs)].join(' '));
  }
  function sensitiveKind(el,label){
    const type=String(el.type||'').toLowerCase();
    if(type==='password') return 'AUTH';
    if(type==='file') return 'FILE';
    if(/two.factor|authenticator|verification code|backup code|password|secret question/i.test(label)) return 'AUTH';
    if(/ethnic|race|religion|sexual orientation|disability|gender|date of birth|marital/i.test(label)) return 'SENSITIVE';
    return 'STANDARD';
  }
  function structuralHelper(el){
    return !!(window.JobCopilotGreenhouse?.isGreenhouse?.()&&window.JobCopilotGreenhouse?.isReactSelectHelper?.(el));
  }
  function optionShape(el){
    if(el.tagName!=='SELECT') return [];
    return [...el.options].slice(0,80).map(o=>({text:cleanText(o.text,120),value_present:!!o.value,disabled:!!o.disabled}));
  }
  function field(el,index){
    const label=labelFor(el), kind=sensitiveKind(el,label);
    return {
      index,
      tag:el.tagName.toLowerCase(),
      type:String(el.type||''),
      label,
      selector_hint:selectorHint(el),
      required:!!(el.required||el.getAttribute('aria-required')==='true'),
      disabled:!!el.disabled,
      readonly:!!el.readOnly,
      visible:visible(el),
      autocomplete:cleanText(el.getAttribute('autocomplete'),80),
      inputmode:cleanText(el.getAttribute('inputmode'),40),
      maxlength:Number.isFinite(Number(el.maxLength))&&Number(el.maxLength)>0?Number(el.maxLength):null,
      options:optionShape(el),
      privacy_kind:kind,
      // No values. Only whether the field already contains something.
      has_value:kind==='AUTH'||kind==='FILE'?null:(el.type==='checkbox'||el.type==='radio'?!!el.checked:!!String(el.value||'').trim()),
      structural_helper:structuralHelper(el)
    };
  }
  function addRowCandidates(){
    return [...document.querySelectorAll('button,a,[role="button"]')].filter(visible).map((el,index)=>({
      index,
      text:cleanText(el.innerText||el.getAttribute('aria-label')||el.getAttribute('title'),140),
      selector_hint:selectorHint(el)
    })).filter(x=>/add|another|employment|experience|education|qualification|history/i.test(x.text)).slice(0,40);
  }
  function sectionHeadings(){
    return [...document.querySelectorAll('h1,h2,h3,h4,legend')].filter(visible).map(x=>cleanText(x.innerText,180)).filter(Boolean).slice(0,80);
  }
  function capture(){
    const ats=window.JobCopilotAdapterRegistry?.detect?.()||'GENERIC';
    const all=[...document.querySelectorAll('input,select,textarea')].filter(visible);
    const fields=all.map(field);
    return {
      schema_version:'live-fixture-v2',
      captured_at:new Date().toISOString(),
      page:{
        url_origin:location.origin,
        url_path:location.pathname,
        title:cleanText(document.title,200),
        ats,
        lang:document.documentElement.lang||null
      },
      counts:{raw_fields:fields.length,semantic_fields:fields.filter(x=>!x.structural_helper).length,structural_helpers:fields.filter(x=>x.structural_helper).length,required:fields.filter(x=>x.required&&!x.structural_helper).length,selects:fields.filter(x=>x.tag==='select'&&!x.structural_helper).length,textareas:fields.filter(x=>x.tag==='textarea'&&!x.structural_helper).length,auth:fields.filter(x=>x.privacy_kind==='AUTH'&&!x.structural_helper).length,sensitive:fields.filter(x=>x.privacy_kind==='SENSITIVE'&&!x.structural_helper).length},
      headings:sectionHeadings(),
      fields,
      add_row_candidates:addRowCandidates(),
      privacy:{values_captured:false,passwords_captured:false,file_names_captured:false,free_text_answers_captured:false}
    };
  }
  window.JobCopilotLiveFixture={capture};
})();
