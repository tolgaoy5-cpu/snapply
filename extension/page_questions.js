// Application questions on the current page, for "ask once, remember, fill next time".
// Loaded after content.js (uses its textFor/visible/canonical/semanticElements helpers).
// Reads questions, reads dropdown options, and fills one answer at a time. Never submits.
(function(){
  const Q=window.JobCopilotQuestions;
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  const norm=s=>clean(s).toLowerCase();
  const sleep=t=>new Promise(r=>setTimeout(r,t));
  const isWorkday=()=>!!window.JobCopilotWorkday?.isWorkday?.();
  const EMPTY=/^(?:(?:please\s+)?(?:select|choose)(?:\s+one)?(?:\s*(?:\.{3}|…))?|-+|none selected)$/i;
  const stripStar=s=>clean(s).replace(/\s*\(required\)\s*$/i,'').replace(/\s*\*\s*$/,'');

  // Profile-driven fields are filled elsewhere; these are not "questions".
  const PROFILE_KEYS=new Set(['full_name','location','linkedin','github','website','first_name','last_name','email','phone','phone_country_code','phone_extension','phone_device_type','country','postcode','city','address','address_line2','address_line3','title','resume','employer','job_title','start_date','end_date','education','qualification','application_source']);

  function legendFor(el){return clean(el.closest('fieldset')?.querySelector('legend')?.innerText||'')}
  // Group caption: <legend>, or an ARIA group's aria-labelledby / aria-label (TRAC radio groups).
  function groupLabel(el){
    const legend=legendFor(el);if(legend)return legend;
    const g=el.closest('[role="group"],[role="radiogroup"]');if(!g)return containerLabelPQ(el);
    const ids=(g.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean);
    const byIds=ids.map(id=>document.getElementById(id)?.innerText||'').join(' ');
    return clean(byIds||g.getAttribute('aria-label')||'')||containerLabelPQ(el);
  }
// The caption of the question a control sits in, for forms whose labels are not linked to the
// control (Lever custom questions, many hand-built forms): nearest question container's label text.
function containerLabelPQ(el){
  const tidy=s=>String(s||'').replace(/\s+/g,' ').replace(/\s*[✱*]\s*$/,'').replace(/\(required\)/i,'').trim();
  for(const sel of ['.application-question','[data-qa*="question"]','fieldset','[role="group"]','[role="radiogroup"]','.form-group','.field','[class*="question"]','[class*="field"]']){
    const box=el.closest(sel);if(!box)continue;
    for(const c of box.querySelectorAll('.application-label .text,.application-label,legend,label,[class*="label"],[class*="title"],h3,h4,h5')){
      if(c.contains(el)||c.querySelector('input,select,textarea'))continue;
      const t=tidy(c.innerText||c.textContent);if(t&&t.length<=300)return t;
    }
  }
  return '';
}

  // Field labels like "Day", "Month", "Other. Please specify..." need their group's caption.
  const GENERIC=/^(day|month|year|other\.?(\s*please specify\.*)?|please provide details below|please specify\.*|details)$/i;
  const STEM={dob:'Date of birth',dateofbirth:'Date of birth',startdate:'Start date',enddate:'End date',nhsstart:'NHS start date',registrationexpiry:'Registration expiry'};
  function withCaption(el,label){
    if(!GENERIC.test(stripStar(label)))return label;
    const box=el.closest('.form-widget-container,[data-automation-id^="formField"],fieldset');
    const cap=clean(box?.querySelector('[id$="_caption"],.order-1,legend')?.innerText||'');
    if(cap&&cap!==label)return `${stripStar(cap)} › ${label}`;
    const stem=(el.id||'').toLowerCase().match(/([a-z]+)(?:-\d+)?\.(day|month|year|select|text)$/)?.[1]||'';
    const key=Object.keys(STEM).find(k=>stem.endsWith(k));
    return key?`${STEM[key]} › ${label}`:label;
  }
  // Whole sections that hold personal/monitoring data, whatever each question says.
  const PERSONAL_SECTION=/equalop|equality|diversity|demograph|selfident|self-ident|disabilit|personal-dob|dateofbirth|ethnic|religion|orientation|marital|gender|veteran/i;
  // A sentence asking something is a question, even if it mentions "college", "employer" or a city.
  const isQuestionSentence=l=>/\?\s*\*?\s*$/.test(clean(l))||/^(are|do|does|did|have|has|is|was|were|will|would|can|could|please|what|which|how|when|where|why|if)\b/i.test(clean(l));
  const isRequiredText=l=>/\*|\(required\)/i.test(l);

  // Each entry: {qid, el, label, kind:'text'|'choice', control:'workday_listbox'|'select'|'radio'|'text', required}
  function controls(){
    const out=[];const seen=new Set();
    const add=x=>{if(x.label&&x.el)x.label=withCaption(x.el,x.label);if(!x.label||seen.has(x.qid)||Q.sensitivity(x.label)==='never')return;seen.add(x.qid);out.push(x)};
    if(isWorkday()){
      // Questionnaire pages plus Workday's personal-data pages (Voluntary Disclosures, self-identification).
      const WD_IDS=/Questionnaire|personalInfo|selfIdentif|disabilit|veteran/i;
      const wdLabel=el=>legendFor(el)||clean(el.closest('[data-automation-id^="formField"]')?.querySelector('label')?.innerText||'')||textFor(el);
      const wdRequired=(el,label)=>el.getAttribute('aria-required')==='true'||/required/i.test(el.getAttribute('aria-label')||'')||/\*\s*$/.test(label);
      const dates=new Set();
      for(const el of document.querySelectorAll('button[aria-haspopup="listbox"][id],textarea[id],input[id]')){
        if(!WD_IDS.test(el.id)||!visible(el))continue;
        const label=wdLabel(el);
        if(/-dateSection(Month|Day|Year)-input$/.test(el.id)){
          const base=el.id.replace(/-dateSection(Month|Day|Year)-input$/,'');
          if(dates.has(base))continue;dates.add(base);
          add({qid:base,el,label:stripStar(label),kind:'text',control:'workday_date',required:wdRequired(el,label)});
        }else if(el.matches('button[aria-haspopup="listbox"]'))
          add({qid:el.id,el,label:stripStar(label),kind:'choice',control:'workday_listbox',required:wdRequired(el,label)});
        else if(el.getAttribute('data-uxi-widget-type')==='selectinput')
          add({qid:el.id,el,label:stripStar(label),kind:'choice',control:'workday_multiselect',required:wdRequired(el,label)});
        else if(el.matches('textarea,input[type="text"],input:not([type])'))
          add({qid:el.id,el,label:stripStar(label),kind:'text',control:'text',required:wdRequired(el,label)});
      }
    }else{
      for(const el of semanticElements()){
        if(el.type==='hidden'||el.type==='file'||el.type==='checkbox'||el.type==='password')continue;
        // Rows of repeated history tables (TRAC education/employment) are filled by their own adapters.
        if(/\.(gmrow|grrow)_\d+\./.test(el.id||''))continue;
        // Prefer the field's own <label>; textFor() also appends aria-label/placeholder copies.
        const label=clean(el.id&&document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText||'')||textFor(el);
        if(PROFILE_KEYS.has(canonical(label,el))&&!isQuestionSentence(label))continue;
        // React-select (Greenhouse and others): a text input inside .select__control is a list, not text.
        if(el.matches('input.select__input')&&el.closest('.select__control')&&el.id){
          const own=clean(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText||'')||label;
          if((PROFILE_KEYS.has(canonical(own,el))&&!isQuestionSentence(own))||/^(country|candidate-location)$/.test(el.id))continue;
          add({qid:el.id,el,label:stripStar(own),kind:'choice',control:'react_select',required:el.getAttribute('aria-required')==='true'||/\*/.test(own)});
          continue;
        }
        // Sliders ("How many years of experience?", Teamtailor): a choice between their whole steps.
        if(el.tagName==='INPUT'&&el.type==='range'){add({qid:el.id||el.name,el,label:stripStar(label),kind:'choice',control:'range',required:el.required||isRequiredText(label)});continue}
        if(el.tagName==='SELECT')add({qid:el.id||el.name,el,label:stripStar(label),kind:'choice',control:'select',required:el.required||el.getAttribute('aria-required')==='true'||isRequiredText(label)});
        else if(el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&/^(text|number|)$/.test(el.type)&&(el.id||el.name)))
          add({qid:el.id||el.name,el,label:stripStar(label),kind:'text',control:'text',required:el.required||el.getAttribute('aria-required')==='true'||/\*/.test(label)});
      }
    }
    // A lone required checkbox ("I consent…", "I confirm…") is a yes/no question the user answers.
    for(const cb of document.querySelectorAll('input[type="checkbox"]')){
      if(!visible(cb)||!(cb.required||cb.getAttribute('aria-required')==='true'))continue;
      if(cb.name&&document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(cb.name)}"]`).length>1)continue;
      const label=clean(document.querySelector(`label[for="${CSS.escape(cb.id||'')}"]`)?.innerText||'')||textFor(cb);
      add({qid:cb.id||'checkbox:'+cb.name,el:cb,label:stripStar(label),kind:'choice',control:'checkbox',required:true});
    }
    // Radio groups (Workday and generic), grouped by name, labelled by their fieldset legend.
    const groups={};
    for(const r of document.querySelectorAll('input[type="radio"]')){if(visible(r)&&r.name)(groups[r.name]=groups[r.name]||[]).push(r)}
    for(const [name,radios] of Object.entries(groups)){
      const label=groupLabel(radios[0]);if(!label)continue;
      if(!isWorkday()&&PROFILE_KEYS.has(canonical(label,radios[0]))&&!isQuestionSentence(label))continue;
      add({qid:'radio:'+name,el:radios[0],radios,label:stripStar(label),kind:'choice',control:'radio',required:isRequiredText(label)||radios.some(r=>r.required||r.getAttribute('aria-required')==='true')});
    }
    // Native checkbox groups ("Pronouns", "Tick all that apply"): several boxes sharing one name.
    // Boxes belong together when they share a name, or (Ashby: each box named after its option) a fieldset/group.
    const checks={};const boxKey=new Map();let n=0;
    for(const c of document.querySelectorAll('input[type="checkbox"]')){
      if(!visible(c))continue;
      const sameName=c.name&&document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(c.name)}"]`).length>1;
      const group=c.closest('fieldset,[role="group"]');
      let key=sameName?'n:'+c.name:group?(boxKey.get(group)||(boxKey.set(group,'g:'+(group.id||++n)),boxKey.get(group))):null;
      if(key)(checks[key]=checks[key]||[]).push(c);
    }
    for(const [name,boxes] of Object.entries(checks)){
      if(boxes.length<2)continue;
      const label=groupLabel(boxes[0]);if(!label)continue;
      add({qid:'checks:'+(name.startsWith('n:')?name.slice(2):(boxes[0].id||name)),el:boxes[0],radios:boxes,label:stripStar(label),kind:'choice',control:'checkbox_group',required:isRequiredText(label)||boxes.some(b=>b.required)});
    }
    // Yes/No (or few-choice) answer buttons with aria-pressed, e.g. Ashby, backed by a hidden input.
    const pressedBoxes=new Set();
    for(const b of document.querySelectorAll('button[aria-pressed]')){
      const box=b.parentElement;if(!box||pressedBoxes.has(box)||!visible(b))continue;pressedBoxes.add(box);
      const btns=[...box.querySelectorAll(':scope > button[aria-pressed]')].filter(visible);
      if(btns.length<2||btns.length>6)continue;
      const label=containerLabelPQ(btns[0]);if(!label)continue;
      add({qid:'pressed:'+(box.querySelector('input[name]')?.name||clean(label).slice(0,60)),el:box,options:btns,label:stripStar(label),
        kind:'choice',control:'pressed_buttons',required:isRequiredText(label)});
    }
    // ARIA radio/checkbox groups (TalentLink and other custom widgets): the real inputs are hidden and
    // the visible options are role="radio"/"checkbox" elements labelled through aria-labelledby.
    for(const g of document.querySelectorAll('[role="radiogroup"],[role="group"]')){
      if(!visible(g))continue;
      const role=g.getAttribute('role')==='radiogroup'?'radio':'checkbox';
      const opts=[...g.querySelectorAll(`[role="${role}"]`)].filter(visible);
      if(opts.length<2||opts.every(o=>o.matches('input')))continue;
      // Options wrapping ordinary visible inputs are already read as a native radio/checkbox group.
      if(opts.some(o=>[...o.querySelectorAll('input[type="radio"],input[type="checkbox"]')].some(visible)))continue;
      const label=ariaText(g)||groupLabel(opts[0]);if(!label)continue;
      const qid='aria:'+(g.id||g.getAttribute('aria-labelledby')||clean(label).slice(0,60));
      add({qid,el:g,options:opts,label:stripStar(label),kind:'choice',control:role==='radio'?'aria_radio':'aria_checkbox',
        required:g.getAttribute('aria-required')==='true'||isRequiredText(label)});
    }
    return out;
  }
  function rangeOptions(el){
    const min=Number(el.min||0),max=Number(el.max||100),step=Number(el.step||1)||1;
    if(!(max>min)||(max-min)/step>30)return [];
    const out=[];for(let v=min;v<=max+1e-9;v+=step)out.push(String(Math.round(v*100)/100));return out;
  }
  function ariaText(el){
    const ids=String(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean);
    const t=ids.map(id=>document.getElementById(id)?.innerText||'').join(' ');
    return clean(t||el.getAttribute('aria-label')||el.innerText||'').replace(/\(required\)/i,'').trim();
  }
  const ariaChecked=o=>o.getAttribute('aria-checked')==='true'||!!o.querySelector('input:checked');
  function radioLabel(r){return clean(document.querySelector(`label[for="${CSS.escape(r.id||'')}"]`)?.innerText||r.closest('label')?.innerText||r.value)}
  // Controls Snapply can read and remember but does not fill yet.
  const READ_ONLY=new Set(['workday_date','workday_multiselect']);
  function currentValue(c){
    if(c.control==='workday_listbox'){const t=clean(c.el.innerText);return EMPTY.test(t)?'':t}
    if(c.control==='checkbox')return c.el.checked?'Yes':'';
    if(c.control==='react_select'){
      const box=c.el.closest('.select__control');
      const v=[...(box?.querySelectorAll('.select__single-value,.select__multi-value__label')||[])].map(n=>clean(n.innerText)).filter(Boolean);
      return v.join(', ');
    }
    if(c.control==='workday_multiselect')return (window.JobCopilotWorkday?.multiselectSelection?.(c.el)||[]).join(', ');
    if(c.control==='workday_date'){
      const part=k=>String(document.getElementById(`${c.qid}-dateSection${k}-input`)?.value||'').trim();
      const v=['Day','Month','Year'].map(part).filter(Boolean);
      return v.length&&v.length===['Day','Month','Year'].filter(k=>document.getElementById(`${c.qid}-dateSection${k}-input`)).length?v.join('/'):'';
    }
    if(c.control==='select'){const o=c.el.selectedOptions?.[0];return o&&o.value!==''&&!EMPTY.test(clean(o.text))?clean(o.text):''}
    if(c.control==='radio'){const r=c.radios.find(x=>x.checked);return r?radioLabel(r):''}
    if(c.control==='aria_radio'){const o=c.options.find(ariaChecked);return o?ariaText(o):''}
    if(c.control==='range')return c.el.dataset.snapplySet?String(c.el.value):'';
    if(c.control==='pressed_buttons'){const o=c.options.find(x=>x.getAttribute('aria-pressed')==='true');return o?clean(o.innerText):''}
    if(c.control==='checkbox_group')return c.radios.filter(x=>x.checked).map(radioLabel).join(', ');
    if(c.control==='aria_checkbox')return c.options.filter(ariaChecked).map(ariaText).join(', ');
    return String(c.el.value||'').trim();
  }
  function find(qid){return controls().find(c=>c.qid===qid)}

  const RANK={normal:0,review:1,sensitive:2,legal:3,never:4};
  // Repeated labels (three "Email:" fields for three referees) are told apart by the nearest
  // preceding label that is unique on the page, so one saved answer never fills all of them.
  // On a page about referees, contact fields hold other people's data: confirm every time.
  function withContext(list){
    const count={};list.forEach(c=>{const k=Q.signature(c.label);count[k]=(count[k]||0)+1});
    const aboutReferees=/referee|\breferences?\b/i.test(document.querySelector('main')?.innerText||document.body.innerText||'');
    let anchor='';
    return list.map(c=>{
      const dup=count[Q.signature(c.label)]>1;
      if(!dup){anchor=c.label;}
      const label=dup&&anchor?`${anchor} › ${c.label}`:c.label;
      let sensitivity=Q.sensitivity(label);
      if(aboutReferees&&Q.isContact(c.label)&&RANK[sensitivity]<RANK.sensitive)sensitivity='sensitive';
      // Workday personal-data sections are personal by definition, whatever the wording.
      if((/personalInfo|selfIdentif/i.test(c.el?.id||c.qid)||PERSONAL_SECTION.test(c.el?.id||c.qid||''))&&RANK[sensitivity]<RANK.sensitive)sensitivity='sensitive';
      return {...c,label,sensitivity};
    });
  }

  function questions(){
    return withContext(controls()).map(c=>({qid:c.qid,label:c.label,kind:c.kind,control:c.control,required:c.required,
      value:currentValue(c),sensitivity:c.sensitivity,signature:Q.signature(c.label),fillable:!READ_ONLY.has(c.control),
      max_length:c.el&&c.el.maxLength>0?c.el.maxLength:null,multiline:!!(c.el&&c.el.tagName==='TEXTAREA'),
      options:c.control==='checkbox'?['Yes']:c.control==='select'?[...c.el.options].map(o=>clean(o.text)).filter(t=>t&&!EMPTY.test(t))
        :c.control==='radio'||c.control==='checkbox_group'?c.radios.map(radioLabel):c.control==='pressed_buttons'?c.options.map(o=>clean(o.innerText)):c.control==='range'?rangeOptions(c.el):/^aria_/.test(c.control)?c.options.map(ariaText):null}));
  }

  // Workday dropdown options only exist while the list is open: open, read, close. No option is clicked.
  async function options(qid){
    const c=find(qid);if(!c)return {ok:false,reason:'Question not found on this page.'};
    if(c.control!=='workday_listbox')return {ok:true,options:questions().find(q=>q.qid===qid)?.options||[]};
    const before=currentValue(c);
    try{c.el.scrollIntoView({block:'center'});c.el.click()}catch(_){return {ok:false,reason:'Could not open the list.'}}
    let opts=[];
    for(let i=0;i<10&&!opts.length;i++){
      await sleep(80);
      opts=[...document.querySelectorAll('[role="option"]')].filter(visible).map(o=>clean(o.innerText)).filter(t=>t&&!EMPTY.test(t));
    }
    const esc=new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,bubbles:true});
    (document.activeElement||c.el).dispatchEvent(esc);c.el.dispatchEvent(esc);
    await sleep(200);
    const after=currentValue(find(qid)||c);
    return {ok:after===before,options:[...new Set(opts)],reason:after===before?undefined:'The answer changed while reading options.'};
  }

  function setText(el,value){
    const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const set=Object.getOwnPropertyDescriptor(proto,'value').set;
    // The page may not have focus while the popup is open; dispatch focus events explicitly.
    el.focus();el.dispatchEvent(new FocusEvent('focus'));el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
    set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));
    set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    el.blur();el.dispatchEvent(new FocusEvent('blur'));el.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
  }

  async function fill(qid,value){
    const c=find(qid);if(!c)return {ok:false,reason:'Question not found on this page.'};
    const wanted=clean(value);if(!wanted)return {ok:false,reason:'Answer is empty.'};
    if(Q.sensitivity(c.label)==='never')return {ok:false,reason:'This question is never filled automatically.'};
    if(READ_ONLY.has(c.control))return {ok:false,reason:'Answer this one on the page for now; Snapply can remember it afterwards.'};
    try{
      if(c.control==='workday_listbox'){
        const r=await window.JobCopilotWorkday.chooseExact(c.el,wanted);
        if(!r?.ok)return {ok:false,reason:r?.reason||'Option could not be selected.'};
      }else if(c.control==='select'){
        const o=[...c.el.options].find(o=>norm(o.text)===norm(wanted)||norm(o.value)===norm(wanted));
        if(!o)return {ok:false,reason:'That option is not offered here.'};
        c.el.value=o.value;c.el.dispatchEvent(new Event('input',{bubbles:true}));c.el.dispatchEvent(new Event('change',{bubbles:true}));
      }else if(c.control==='checkbox'){
        if(norm(wanted)!=='yes')return {ok:false,reason:'Leave this box unticked on the page if you do not agree.'};
        if(!c.el.checked)c.el.click();
      }else if(c.control==='radio'){
        const r=c.radios.find(x=>norm(radioLabel(x))===norm(wanted));
        if(!r)return {ok:false,reason:'That option is not offered here.'};
        r.click();
      }else if(c.control==='range'){
        const v=String(wanted).match(/\d+(?:\.\d+)?/)?.[0];
        if(v==null||!rangeOptions(c.el).includes(v))return {ok:false,reason:'Choose one of the values on the slider.'};
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(c.el,v);
        c.el.dataset.snapplySet='1';c.el.dispatchEvent(new Event('input',{bubbles:true}));c.el.dispatchEvent(new Event('change',{bubbles:true}));
      }else if(c.control==='pressed_buttons'){
        const o=c.options.find(x=>norm(clean(x.innerText))===norm(wanted));
        if(!o)return {ok:false,reason:'That option is not offered here.'};
        if(o.getAttribute('aria-pressed')!=='true')o.click();
      }else if(c.control==='checkbox_group'){
        const labels=c.radios.map(radioLabel);
        let want=labels.filter(l=>norm(l)===norm(wanted));
        if(!want.length){let rest=norm(wanted);for(const l of [...labels].sort((x,y)=>y.length-x.length)){const n=norm(l);if(n&&rest.includes(n)){want.push(l);rest=rest.replace(n,' ')}}
          if(!want.length||rest.replace(/[\s,]+/g,'').length)return {ok:false,reason:`“${wanted}” is not offered here.`}}
        for(const b of c.radios){const on=want.some(w=>norm(w)===norm(radioLabel(b)));if(b.checked!==on)b.click()}
      }else if(c.control==='aria_radio'||c.control==='aria_checkbox'){
        // Several ticked boxes are saved as "A, B", but option texts can contain commas themselves:
        // pick out whole option labels (longest first) instead of splitting on commas.
        let want=[wanted];
        if(c.control==='aria_checkbox'&&!c.options.some(x=>norm(ariaText(x))===norm(wanted))){
          let rest=norm(wanted);want=[];
          for(const label of c.options.map(ariaText).sort((x,y)=>y.length-x.length)){
            const n=norm(label);if(n&&rest.includes(n)){want.push(label);rest=rest.replace(n,' ')}
          }
          if(!want.length||rest.replace(/[\s,]+/g,'').length)return {ok:false,reason:`“${wanted}” is not offered here.`};
        }
        // The answer describes the whole group: untick boxes that are not part of it.
        if(c.control==='aria_checkbox')for(const o of c.options){
          if(ariaChecked(o)&&!want.some(w=>norm(ariaText(o))===norm(w))){o.click();if(ariaChecked(o)){const inp=o.querySelector('input');if(inp){inp.click();if(inp.checked){inp.checked=false;inp.dispatchEvent(new Event('change',{bubbles:true}))}}}}
        }
        for(const w of want){
          const o=c.options.find(x=>norm(ariaText(x))===norm(w));
          if(!o)return {ok:false,reason:`“${w}” is not offered here.`};
          if(ariaChecked(o))continue;
          o.click();
          // Some widgets only react to their hidden input.
          if(!ariaChecked(o)){const inp=o.querySelector('input');if(inp){inp.click();if(!inp.checked){inp.checked=true;inp.dispatchEvent(new Event('change',{bubbles:true}))}}}
        }
      }else setText(c.el,wanted);
    }catch(e){return {ok:false,reason:String(e?.message||e).slice(0,120)}}
    await sleep(120);
    const now=currentValue(find(qid)||c);
    const target=c.control==='range'?(String(wanted).match(/\d+(?:\.\d+)?/)||[''])[0]:wanted;
    const ok=c.kind==='choice'?norm(now)===norm(target):now===target;
    return ok?{ok:true,value:now}:{ok:false,reason:'The page did not keep the answer.',value:now};
  }

  chrome.runtime.onMessage.addListener((m,_s,send)=>{
    if(m.type==='PAGE_QUESTIONS'){send({ok:true,questions:questions()});return}
    if(m.type==='QUESTION_OPTIONS'){options(m.qid).then(send).catch(e=>send({ok:false,reason:e.message}));return true}
    if(m.type==='FILL_QUESTION'){fill(m.qid,m.value).then(send).catch(e=>send({ok:false,reason:e.message}));return true}
  });
  window.JobCopilotPageQuestions={questions,options,fill};
})();
