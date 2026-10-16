const FIELD_RULES=[
 {key:'application_source',re:/how did you hear about us|application source|source of application|where (?:did )?you (?:hear|heard|see|saw|find|found)\b|where .*heard about/i},{key:'first_name',re:/^known as\b|preferred (?:first )?name/i},{key:'first_name',re:/first\s*name|forename|given\s*name/i},{key:'last_name',re:/last\s*name|surname|family\s*name/i},
 {key:'email',re:/e-?mail/i},{key:'phone_country_code',re:/country\s+phone\s+code/i},{key:'country',re:/^country(?:\s*code)?$/i},{key:'phone_device_type',re:/phone\s+device\s+type/i},{key:'phone_extension',re:/phone\s+extension/i},{key:'phone',re:/^(?!.*extension)(?!.*device).*?(?:phone\s*number|mobile(?:\s*number)?|telephone(?:\s*number)?|phone)$/i},{key:'resume',re:/resume|cv|curriculum vitae/i},{key:'title',re:/^title(?:\s*\*)?|honou?rific|salutation/i},{key:'address',re:/address\s*(line)?\s*1|street\s*address/i},{key:'address_line2',re:/address\s*(line)?\s*2/i},{key:'address_line3',re:/address\s*(line)?\s*3/i},
 {key:'region',re:/^region\b|^county\b/i},{key:'city',re:/\bcity\b|\btown\b/i},{key:'postcode',re:/post\s*code|postal\s*code/i},{key:'right_to_work',re:/right\s+to\s+work|work\s+authori[sz]ation/i},
 {key:'sponsorship',re:/sponsor|sponsorship|visa sponsorship/i},{key:'notice_period',re:/notice\s+period/i},{key:'salary_expectation',re:/salary|compensation|pay expectation/i},
 {key:'supporting_statement',re:/supporting\s+statement|personal\s+statement|why.*role|why.*apply|why.*work|why.*company|motivation|suitability|relevant experience/i},
 {key:'recent_nhs_experience',re:/recent\s+nhs\s+experience|nhs\s+experience/i},{key:'employer',re:/employer|company|organisation|organization/i},{key:'job_title',re:/job\s*title|\bposition\b|\brole\b/i},
 {key:'start_date',re:/start\s*date|date\s*from|from\s*date/i},{key:'end_date',re:/end\s*date|date\s*to|to\s*date/i},
 {key:'education',re:/university|college|institution|education/i},{key:'qualification',re:/\bdegree\b|qualification/i}
];
function visible(el){const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.offsetParent!==null}
function structuralHelper(el){return !!(window.JobCopilotGreenhouse?.isGreenhouse?.()&&window.JobCopilotGreenhouse?.isReactSelectHelper?.(el))}
function semanticElements(){return [...document.querySelectorAll('input,select,textarea')].filter(visible).filter(el=>!structuralHelper(el))}
function textFor(el){const direct=[];if(el.id){const l=document.querySelector(`label[for="${CSS.escape(el.id)}"]`);if(l)direct.push(l.innerText)}const wrapped=el.closest('label');if(wrapped)direct.push(wrapped.innerText);const lb=el.getAttribute('aria-labelledby');if(lb)lb.split(/\s+/).forEach(id=>{const t=document.getElementById(id);if(t&&t!==el)direct.push(t.innerText||t.textContent)});['aria-label','placeholder'].forEach(x=>{if(el.getAttribute(x))direct.push(el.getAttribute(x))});const clean=[...new Set(direct.map(x=>String(x||'').replace(/\s+/g,' ').trim()).filter(Boolean))];if(clean.length)return clean.join(' ');const fallback=[];['name','id'].forEach(x=>{if(el.getAttribute(x))fallback.push(el.getAttribute(x))});const g=el.closest('fieldset,.form-group,.field,.question,.control-group,[class*=employment],[class*=education]');if(g){const l=g.querySelector(':scope > legend,:scope > .label,:scope > .question-text,:scope > h3,:scope > h4');if(l)fallback.push(l.innerText)}return [...new Set(fallback)].join(' ').replace(/\s+/g,' ').trim()}
function canonical(label,el=null){
  const wd=window.JobCopilotWorkday?.canonicalFrom?.(el); if(wd) return wd;
  const text=String(label||'').replace(/\s+/g,' ').trim();
  const id=String(el?.id||'').trim().toLowerCase();
  const name=String(el?.getAttribute?.('name')||'').trim().toLowerCase();
  const ac=String(el?.getAttribute?.('autocomplete')||'').trim().toLowerCase();

  // Prefer stable semantic DOM hints over nearby row text. This is important on
  // Greenhouse where the Country React combobox can expose a label such as
  // 'Country* country Phone' because Phone sits in the same visual row.
  if(id==='first_name'||name==='first_name'||ac==='given-name') return 'first_name';
  if(id==='last_name'||name==='last_name'||ac==='family-name') return 'last_name';
  if(id==='email'||name==='email'||ac==='email') return 'email';
  // Second phone numbers (alternative/home/other) are optional: never copy the main number into them.
  if(/\b(?:alternative|alternate|secondary|additional|other|home|evening|daytime|work|landline)\b.{0,20}\b(?:phone|telephone|tel|number|mobile)\b/i.test(text)||/phone__home|phone_home|alt(?:ernative)?_?phone|secondary_?phone/i.test(id+' '+name)) return 'phone_secondary';
  // A region/county list often reuses autocomplete="country-name"; it is not the country.
  if(/(^|_)(sub)?option_country$|region|county/.test(id+' '+name)||/^region\b|^county\b/i.test(text)) return 'region';
  if(ac==='tel-country-code'||/country-?code.*phone/.test(id+' '+name)) return 'phone_country_code';
  if(ac==='tel-national'||ac==='tel-local'||/phone-?number/.test(id+' '+name)) return 'phone';
  if(id==='country'||name==='country'||ac==='country'||ac==='country-name') return 'country';
  if(/phone.*extension/.test(id)||/phone.*extension/.test(name)) return 'phone_extension';
  if(/phone.*device.*type/.test(id)||/phone.*device.*type/.test(name)) return 'phone_device_type';
  if(id==='phone'||name==='phone'||ac==='tel') return 'phone';
  if(id==='resume'||name==='resume') return 'resume';

  // Greenhouse often renders honorific choices as checkbox labels like
  // 'Ms question_123[] ... Title *' rather than a field literally named Title.
  if(/\btitle\s*\*?\b/i.test(text)&&/question_\d+/i.test(text)) return 'title';
  return FIELD_RULES.find(r=>r.re.test(text))?.key||'unknown';
}
function groupInfo(el){let g=el.closest('fieldset,.form-group,.field,.question,.control-group,.row,[class*=employment],[class*=education]');let text=(g?.innerText||'').slice(0,300);let kind=/employment|work experience|work history/i.test(text)?'employment':/education|qualification|university|college/i.test(text)?'education':'generic';return {key:g?(g.id||g.getAttribute('data-testid')||String(g.className)||'group'):'root',kind}}
function scan(){return semanticElements().map((el,i)=>{const gi=groupInfo(el),label=textFor(el);return {index:i,tag:el.tagName.toLowerCase(),type:el.type||'',name:el.getAttribute('name')||'',id:el.id||'',label,canonical:canonical(label,el),required:el.required||el.getAttribute('aria-required')==='true',options:el.tagName==='SELECT'?[...el.options].map(o=>({text:o.text.trim(),value:o.value})).filter(o=>o.text):[],valuePresent:el.type==='checkbox'||el.type==='radio'?el.checked:!!el.value,group:gi.key,groupKind:gi.kind}})}
function fire(el){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
function setNativeValue(el,value){
  const wanted=String(value);
  const isTextLike=(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement);
  if(!isTextLike){ el.value=wanted; fire(el); return; }

  // React/Workday-safe value commit. Workday can render a DOM value while its
  // internal form model is still empty. Bypass any element-level value tracker,
  // then emit the full input/change/blur lifecycle that controlled inputs expect.
  const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const ownSetter=Object.getOwnPropertyDescriptor(el,'value')?.set;
  const protoSetter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
  const setter=(ownSetter && protoSetter && ownSetter!==protoSetter)?protoSetter:(protoSetter||ownSetter);

  try{ el.scrollIntoView({block:'center'}); }catch(_){ }
  try{ el.focus(); }catch(_){ }

  // Clear first so frameworks observe a real transition even when the visible
  // DOM already contains the desired value from a previous failed fill.
  try{
    if(setter) setter.call(el,''); else el.value='';
    el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'deleteContentBackward',data:null}));
  }catch(_){
    try{el.value='';el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));}catch(__){ }
  }

  try{
    if(setter) setter.call(el,wanted); else el.value=wanted;
  }catch(_){ el.value=wanted; }

  // beforeinput is informational; input is the event React/Workday should use
  // to update controlled state. change/focusout then commit the field.
  try{el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,composed:true,inputType:'insertText',data:wanted}));}catch(_){ }
  try{el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:wanted}));}catch(_){el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));}
  el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
  try{el.dispatchEvent(new FocusEvent('focusout',{bubbles:true,composed:true,relatedTarget:null}));}catch(_){ }
  try{el.blur();}catch(_){el.dispatchEvent(new Event('blur',{bubbles:false}));}
}

function choose(el,value){const wanted=String(value).trim().toLowerCase();if(el.tagName==='SELECT'){const opts=[...el.options].filter(x=>x.value!=='');let o=opts.find(x=>[x.value,x.text].some(v=>String(v).trim().toLowerCase()===wanted));if(!o&&wanted.length>=3){const esc=wanted.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const near=opts.filter(x=>new RegExp(`^${esc}\\b|\\b${esc}\\s*\\(`,'i').test(x.text.trim()));if(near.length===1)o=near[0]}if(!o)return false;el.value=o.value;fire(el);return true}if(el.type==='radio'||el.type==='checkbox'){const label=textFor(el).toLowerCase(),own=String(el.value||'').toLowerCase();if(label.includes(wanted)||own===wanted||(value===true&&['yes','true','1','on'].includes(own))||(value===false&&['no','false','0'].includes(own))){el.click();return true}return false}el.focus();setNativeValue(el,value);return String(el.value)===String(value)}
function flatProfile(p){return {application_source:p.application_source,first_name:p.first_name,last_name:p.last_name,email:p.email,country:p.country,phone_country_code:p.phone_country_code||p.country,phone:p.phone,phone_device_type:p.phone_device_type,phone_extension:p.phone_extension,address:p.address||p.address_line1,address_line2:p.address_line2,address_line3:p.address_line3,city:p.city,region:p.region||p.city,postcode:p.postcode,title:p.title,recent_nhs_experience:p.recent_nhs_experience,right_to_work:p.right_to_work,sponsorship:p.sponsorship,notice_period:p.notice_period,salary_expectation:p.salary_expectation}}
function confidenceFor(key,value,el){if(key==='unknown'||value===undefined||value===null||value==='')return 'ASK_USER';if(key==='country'&&el?.tagName==='INPUT'&&el.tagName!=='SELECT')return 'MEDIUM';if(['supporting_statement','salary_expectation','notice_period','resume','title','application_source','phone_device_type'].includes(key))return 'MEDIUM';return 'HIGH'}
function currentField(original){
 if(original.isConnected!==false)return original;
 if(original.id){const byId=document.getElementById(original.id);if(byId&&visible(byId))return byId}
 const name=original.getAttribute?.('name');
 if(name){
   const matches=semanticElements().filter(el=>el.getAttribute('name')===name&&el.tagName===original.tagName);
   if(matches.length===1)return matches[0];
 }
 return null;
}
function fill(profile){
 const simple=flatProfile(profile),els=semanticElements(),out=[];
 const decisions=new Map(reviewPlan(profile).map(item=>[item.index,item.decision]));
 for(let index=0;index<els.length;index++){
   const el=els[index];
   const label=textFor(el),key=canonical(label,el),value=simple[key],questionType=classifyQuestion(label);
   // Never put the applicant's own details into rows about other people or other jobs
   // (TRAC referee/employer/education rows: "Referee's first name", "City / Town", "Telephone").
   if(/\.(gmrow|grrow)_\d+\./.test(el.id||'')||/referee|reference|next of kin|emergency contact/i.test(label)){out.push({label,key,questionType,decision:'SKIP',confidence:'SKIP',filled:false,reason:'Third-party or history row'});continue}
   // Review Plan is the policy source for both the UI and the actual fill action.
   // Confidence alone cannot override its sensitive, eligibility or option reviews.
   const decision=decisions.get(index)||'REVIEW';
   const confidence=decision==='HIGH'?confidenceFor(key,value,el):'REVIEW';
   let filled=false;
   const live=currentField(el);
   // A React rerender may replace controls after each change. Never fill a
   // detached element or a replacement with a different semantic label.
   if(confidence==='HIGH'&&live&&canonical(textFor(live),live)===key&&!((live.type==='radio'||live.type==='checkbox')?live.checked:live.value))filled=choose(live,value);
   out.push({label,key,questionType,decision,confidence,filled,group:groupInfo(live||el)});
 }
 return out;
}
function repeatedPlan(profile){const fields=scan();const employment=fields.filter(f=>['employer','job_title','start_date','end_date'].includes(f.canonical));const education=fields.filter(f=>['education','qualification','start_date','end_date'].includes(f.canonical)&&f.groupKind==='education');return {employmentRecords:profile.experience||[],educationRecords:profile.education||[],detectedEmploymentFields:employment,detectedEducationFields:education,note:'Plan only: repeated blocks are not auto-filled until block identity is unambiguous.'}}
chrome.runtime.onMessage.addListener((m,_s,send)=>{if(m.type==='SCAN_FORM')send({url:location.href,title:document.title,fields:scan()});if(m.type==='FILL_FORM')send({results:fill(m.profile||{})});if(m.type==='PLAN_REPEATED')send(repeatedPlan(m.profile||{}));return true});

function classifyQuestion(label){
 if(/two.factor|authenticator|verification code|backup code|password|secret question/i.test(label)) return 'AUTH_NEVER_FILL';
 if(/ethnic|race|religion|sexual orientation|disability|gender|date of birth|marital/i.test(label)) return 'SENSITIVE_REVIEW';
 if(/sponsor|right to work|eligible to work|qualification required|registration required|driving licen[cs]e/i.test(label)) return 'KILLER_REVIEW';
 // Legal declarations: a wrong answer can disqualify the applicant, so never fill without the user.
 if(/\bbarred\b|regulated activity|criminal|conviction|caution|\bdbs\b|disclosure and barring|safeguarding concern|dismissed/i.test(label)) return 'KILLER_REVIEW';
 if(/supporting statement|competency|describe|give an example|why.*apply|suitability|relevant experience/i.test(label)) return 'EVIDENCE_TEXT';
 return 'STANDARD';
}
function reviewPlan(profile){
 const fields=scan();
 const simple=flatProfile(profile);
 const confirmed=profile?.__confirmed_memory||{};
 const seenChoiceGroups=new Set();
 return fields.map(f=>{
   const q=classifyQuestion(f.label), value=simple[f.canonical];
   // Collapse repeated Greenhouse honorific checkbox choices into one review item.
   if(f.canonical==='title'){
     const groupKey=f.name||String(f.id||'').replace(/_\d+$/,'')||'title';
     if(seenChoiceGroups.has(groupKey)) return null;
     seenChoiceGroups.add(groupKey);
   }
   let decision='ASK_USER', reason='No verified profile value.';
   if(q==='AUTH_NEVER_FILL'){decision='BLOCKED';reason='Authentication/2FA/password fields are never filled.'}
   else if(q==='SENSITIVE_REVIEW'){decision='REVIEW';reason='Sensitive/EDI data requires explicit user action.'}
   else if(q==='KILLER_REVIEW'){decision=value!==undefined&&value!==''?'REVIEW':'ASK_USER';reason='Eligibility/killer-style field requires confirmation before fill.'}
   else if(q==='EVIDENCE_TEXT'){decision='REVIEW';reason='Generate only from evidence-backed claims, then user reviews.'}
   else if(f.canonical==='resume'){decision='REVIEW';reason='CV upload is user-controlled in V1; never silently attach a file.'}
   else if(f.canonical==='title'){decision=value!==undefined&&value!==''?'REVIEW':'ASK_USER';reason=value!==undefined&&value!==''?'User-confirmed honorific is available; verify exact option before fill.':'Honorific/title is not inferred from name or CV.'}
   else if(f.canonical==='country'&&f.tag==='input'&&value!==undefined&&value!==''){decision='REVIEW';reason=confirmed.country?'Saved in Application Memory; custom combobox requires exact option confirmation.':'Country value is available; custom combobox requires exact option confirmation.'}
   else if(f.canonical==='recent_nhs_experience'&&value!==undefined&&value!==''){decision='REVIEW';reason=confirmed.recent_nhs_experience?'Saved in Application Memory; verify the exact site option before fill.':'NHS experience answer is available; verify the site option before fill.'}
   else if(value!==undefined&&value!==''){decision='HIGH';reason='Verified deterministic Master Profile value.'}
   return {...f,questionType:q,decision,proposedValue:value,confirmedFromMemory:!!confirmed[f.canonical],reason};
 }).filter(Boolean);
}
function dynamicScan(){
 const ats=detectedATS();
 const pageType=window.JobCopilotCIPHR?.isCiphr?.()?window.JobCopilotCIPHR.pageType():(window.JobCopilotGenericATS?.pageType?.()||'APPLICATION');
 return {ats,pageType,fields:scan()};
}
// Additive listener for V0.6 commands.
chrome.runtime.onMessage.addListener((m,_s,send)=>{
 if(m.type==='REVIEW_PLAN') send({ats:detectedATS(),pageType:window.JobCopilotCIPHR?.isCiphr?.()?window.JobCopilotCIPHR.pageType():(window.JobCopilotGenericATS?.pageType?.()||'APPLICATION'),items:reviewPlan(m.profile||{})});
 if(m.type==='DYNAMIC_SCAN') send(dynamicScan());
 return true;
});

// V0.7: universal evidence-question extraction. Site-specific adapters only normalize DOM quirks.
function activeAdapter(){
 if(window.JobCopilotCIPHR?.isCiphr?.()) return {name:'CIPHR', impl:window.JobCopilotCIPHR};
 if(window.JobCopilotGreenhouse?.isGreenhouse?.()) return {name:'GREENHOUSE', impl:window.JobCopilotGreenhouse};
 return {name:'GENERIC', impl:window.JobCopilotGenericATS};
}
function characterLimit(el,label){
 const direct=Number(el.maxLength); if(Number.isFinite(direct)&&direct>0) return direct;
 const box=(activeAdapter().impl.questionContext?.(el)) || (activeAdapter().impl.questionContainer?.(el)?.innerText||'') || label;
 const m=String(box).match(/(?:maximum|max\.?|up to|limit(?: of)?)\s*(\d{2,5})\s*(?:characters|chars)/i);
 return m?Number(m[1]):null;
}
function evidenceQuestions(){
 const adapter=activeAdapter();
 return semanticElements().filter(el=>el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&el.type==='text')).map((el,index)=>{
   const label=textFor(el); const qt=classifyQuestion(label);
   if(qt!=='EVIDENCE_TEXT') return null;
   return {index,label,canonical:canonical(label,el),questionType:qt,character_limit:characterLimit(el,label),required:el.required||el.getAttribute('aria-required')==='true',ats:adapter.name};
 }).filter(Boolean);
}
chrome.runtime.onMessage.addListener((m,_s,send)=>{
 if(m.type==='EVIDENCE_QUESTIONS') send({ats:activeAdapter().name,pageType:activeAdapter().impl.pageType?.()||'APPLICATION',questions:evidenceQuestions()});
 return true;
});

// V0.8 commands: active-page job extraction + conservative repeated block fill.
chrome.runtime.onMessage.addListener((m,_s,send)=>{
 if(m.type==='EXTRACT_JOB') send(window.JobCopilotJobExtractor?.extract?.()||{error:'Job extractor unavailable'});
 if(m.type==='REPEATED_BLOCK_PLAN') send({items:window.JobCopilotRepeated?.plan?.(m.profile||[])||[]});
 if(m.type==='FILL_REPEATED_SAFE'){Promise.resolve(window.JobCopilotRepeated?.fill?.(m.profile||[])||[]).then(results=>send({results})).catch(e=>send({error:e.message}));return true}
 return true;
});

// V0.10: insert an already-reviewed generated answer into the exact detected evidence field.
// Never submits the form and never overwrites non-empty user content without explicit force=true.
function evidenceQuestionElements(){
  return semanticElements().filter(el=>el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&el.type==='text')).filter(el=>classifyQuestion(textFor(el))==='EVIDENCE_TEXT');
}
function insertGeneratedAnswer(payload){
  const els=evidenceQuestionElements();
  const idx=Number(payload?.question_index ?? 0); const el=els[idx];
  if(!el) return {ok:false,reason:'Target evidence field not found'};
  const expected=String(payload?.question||'').replace(/\s+/g,' ').trim();
  const actual=textFor(el).replace(/\s+/g,' ').trim();
  if(expected && actual && expected!==actual) return {ok:false,reason:'Question changed since generation; re-scan required',expected,actual};
  if(el.value && !payload?.force) return {ok:false,reason:'Field already contains user content; refusing overwrite'};
  const answer=String(payload?.answer||'').trim(); if(!answer) return {ok:false,reason:'Empty answer'};
  if(el.maxLength>0 && answer.length>el.maxLength) return {ok:false,reason:`Answer exceeds field maxLength ${el.maxLength}`};
  el.focus(); el.value=answer; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
  return {ok:true,inserted_chars:answer.length,label:actual,index:idx};
}
chrome.runtime.onMessage.addListener((m,_s,send)=>{if(m.type==='INSERT_GENERATED_ANSWER')send(insertGeneratedAnswer(m));return true});

// V0.11: universal adapter registry + queue-safe per-question insertion.
function detectedATS(){
  try{return window.JobCopilotAdapterRegistry?.detect?.()||activeAdapter().name||'GENERIC'}catch(_){return 'GENERIC'}
}
function answerTargets(){return evidenceQuestionElements().map((el,index)=>({index,label:textFor(el),character_limit:characterLimit(el,textFor(el)),required:el.required||el.getAttribute('aria-required')==='true'}))}
function insertQueueAnswer(payload){
  const els=evidenceQuestionElements(); const idx=Number(payload?.question_index ?? -1); const el=els[idx];
  if(!el)return {ok:false,reason:'Target evidence field not found',index:idx};
  const expected=String(payload?.question||'').replace(/\s+/g,' ').trim(); const actual=textFor(el).replace(/\s+/g,' ').trim();
  if(expected&&actual&&expected!==actual)return {ok:false,reason:'Question changed since queue creation; re-scan required',expected,actual};
  const answer=String(payload?.answer||'').trim(); if(!answer)return {ok:false,reason:'Empty reviewed answer'};
  if(el.maxLength>0&&answer.length>el.maxLength)return {ok:false,reason:`Reviewed answer exceeds maxLength ${el.maxLength}`};
  if(el.value&&!payload?.force)return {ok:false,reason:'Field already contains content; refusing overwrite'};
  el.focus();el.value=answer;fire(el);return {ok:true,index:idx,label:actual,inserted_chars:answer.length};
}
chrome.runtime.onMessage.addListener((m,_s,send)=>{
 if(m.type==='ATS_DETECT')send({ats:detectedATS(),url:location.href});
 if(m.type==='ANSWER_TARGETS')send({ats:detectedATS(),questions:answerTargets()});
 if(m.type==='INSERT_QUEUE_ANSWER')send(insertQueueAnswer(m));
 return true;
});


// V0.13 browser-readiness diagnostics. No form submission, authentication handling or hidden-field mutation.
function browserReadiness(){
  const fields=scan();
  const auth=fields.filter(f=>classifyQuestion(f.label)==='AUTH_NEVER_FILL');
  const sensitive=fields.filter(f=>classifyQuestion(f.label)==='SENSITIVE_REVIEW');
  const repeated=window.JobCopilotRepeated?._strategyRoots?.()?.roots||[];
  const evidence=evidenceQuestions();
  return {
    ok:true,
    ats:detectedATS(),
    url:location.href,
    title:document.title,
    field_count:fields.length,
    evidence_question_count:evidence.length,
    repeated_root_count:repeated.length,
    auth_fields:auth.map(x=>x.label),
    sensitive_fields:sensitive.map(x=>x.label),
    can_safe_fill:fields.some(f=>['first_name','last_name','email','phone','address','city','postcode'].includes(f.canonical)),
    notes:[
      auth.length?'Authentication/2FA detected and will remain user-controlled.':'No authentication field detected on this page.',
      repeated.length?'Repeated employment/education structure detected.':'No repeated employment/education row detected on this page.'
    ]
  };
}
chrome.runtime.onMessage.addListener((m,_s,send)=>{if(m.type==='BROWSER_READINESS')send(browserReadiness());return true});

// V0.14: export a privacy-safe structural fixture from a real ATS page.
// This deliberately excludes field values, passwords, uploaded filenames and user-written answers.
chrome.runtime.onMessage.addListener((m,_s,send)=>{
  if(m.type==='CAPTURE_LIVE_FIXTURE'){
    try{send(window.JobCopilotLiveFixture?.capture?.()||{error:'Live fixture capture unavailable'});}
    catch(e){send({error:e.message});}
  }
  return true;
});

// V0.19: apply only explicitly user-confirmed memory values to option controls.
chrome.runtime.onMessage.addListener((m,_s,send)=>{
  if(m.type==='FILL_CONFIRMED_OPTIONS'){
    Promise.resolve(window.JobCopilotOptionResolver?.applyConfirmed?.(m.memory||{})||{ok:false,reason:'Option resolver unavailable'})
      .then(send).catch(e=>send({ok:false,error:e.message}));
    return true;
  }
  return true;
});


// V0.20: required-field completeness + guided resolution.
// This is ATS-agnostic and never submits the application.
function isRequiredElement(el){
  if(el.required||el.getAttribute('aria-required')==='true') return true;
  const label=textFor(el);
  return /\*/.test(label) && !/optional/i.test(label);
}
function groupChoiceElements(el){
  const key=canonical(textFor(el),el);
  if(!['title'].includes(key)) return [el];
  return semanticElements().filter(x=>canonical(textFor(x),x)===key && ['checkbox','radio'].includes(x.type));
}
function customControlLooksSelected(el,key){
  if(el.value && String(el.value).trim()) return true;
  if(window.JobCopilotWorkday?.multiselectSelection?.(el).length) return true;
  // React-select (Greenhouse): the chosen option is rendered next to an empty search input.
  if(el.matches?.('input.select__input')&&el.closest('.select__control')?.querySelector('.select__single-value,.select__multi-value')) return true;
  if(key==='country'){
    const box=el.closest('.select,[class*=select],.field,.form-group')||el.parentElement;
    const txt=String(box?.innerText||'').replace(/\s+/g,' ').trim();
    // Greenhouse country control shows a flag and dial code after a selection.
    if(/\+\d{1,4}/.test(txt) && !/^Country\*?$/i.test(txt)) return true;
  }
  const aria=el.getAttribute('aria-valuetext')||el.getAttribute('aria-label')||'';
  return !!String(aria).trim() && !/^select/i.test(String(aria).trim());
}
function elementComplete(el){
  const key=canonical(textFor(el),el);
  if(el.type==='file') return !!(el.files&&el.files.length);
  if(el.type==='checkbox'||el.type==='radio'){
    const group=groupChoiceElements(el); return group.some(x=>x.checked);
  }
  if(el.tagName==='SELECT') return !!String(el.value||'').trim();
  return customControlLooksSelected(el,key);
}
function requiredStatus(profile){
  const plan=reviewPlan(profile||{});
  const semantic=semanticElements();
  const bySignature=[];
  const seen=new Set();
  for(const item of plan){
    const el=semantic[item.index]; if(!el||!isRequiredElement(el)) continue;
    const key=item.canonical||'unknown';
    const groupSig=(key==='title')?'title-choice-group':`${key}:${item.id||item.name||item.index}`;
    if(seen.has(groupSig)) continue; seen.add(groupSig);
    const complete=elementComplete(el);
    let status='USER_REQUIRED',reason=item.reason||'Required field needs a confirmed answer.';
    if(complete){status='COMPLETE';reason='Required field already has a value.'}
    else if(item.questionType==='SENSITIVE_REVIEW'){status='SENSITIVE_REVIEW';reason='Sensitive field requires explicit user action.'}
    else if(item.canonical==='resume'){status='FILE_REQUIRED';reason='Browser file upload remains user-controlled. Use the site Attach button.'}
    else if(item.decision==='HIGH'){status='AUTO_READY';reason='Verified deterministic profile value is available.'}
    else if(item.confirmedFromMemory){status='OPTION_READY';reason='Confirmed Application Memory value is available.'}
    else if(item.decision==='REVIEW'){status='REVIEW';}
    bySignature.push({index:item.index,id:el.id||'',name:el.name||'',label:item.label,canonical:key,status,reason,decision:item.decision,proposedValue:item.proposedValue});
  }
  // Workday renders some required dropdowns (e.g. Phone Device Type) as non-input controls.
  for(const v of (window.JobCopilotWorkday?.virtualControls?.()||[])){
    if(!v.required) continue;
    const sig=`virtual:${v.canonical}:${v.label}`; if(seen.has(sig)) continue; seen.add(sig);
    const complete=window.JobCopilotWorkday.complete(v.el);
    const mem=(profile?.__confirmed_memory||{})[v.canonical];
    bySignature.push({index:-1,label:v.label,canonical:v.canonical,status:complete?'COMPLETE':mem?'OPTION_READY':'USER_REQUIRED',reason:complete?'Required custom control already has a value.':mem?'Confirmed Application Memory value is available.':'Required Workday custom control needs a confirmed answer.',decision:mem?'REVIEW':'ASK_USER',proposedValue:mem?.value||null,virtual:true});
  }
  // Workday questionnaire dropdowns are buttons, not inputs, so they are counted here.
  for(const q of (window.JobCopilotPageQuestions?.questions?.()||[])){
    if(q.control!=='workday_listbox'||!q.required)continue;
    const sig=`question:${q.qid}`; if(seen.has(sig)) continue; seen.add(sig);
    bySignature.push({index:-1,id:q.qid,label:q.label,canonical:'question',status:q.value?'COMPLETE':'USER_REQUIRED',reason:q.value?'Required question already answered.':'Required question needs your answer.',decision:q.value?'HIGH':'ASK_USER'});
  }
  const filled=bySignature.filter(x=>x.status==='COMPLETE').length;
  return {ok:true,ats:detectedATS(),required_total:bySignature.length,filled_required:filled,missing_count:bySignature.length-filled,items:bySignature};
}
function guideNextMissing(profile){
  const d=requiredStatus(profile||{});
  const priority=['AUTO_READY','OPTION_READY','FILE_REQUIRED','SENSITIVE_REVIEW','REVIEW','USER_REQUIRED'];
  const target=priority.map(p=>d.items.find(x=>x.status===p)).find(Boolean);
  if(!target) return {ok:false,reason:'All detected required fields are complete.',required:d};
  const el=target.virtual?(window.JobCopilotWorkday?.virtualControls?.().find(v=>v.canonical===target.canonical)?.el):semanticElements()[target.index];
  if(!el) return {ok:false,reason:'Target field is no longer present; re-scan the page.',target};
  try{el.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){el.scrollIntoView();}
  const prev=el.style.outline,prevOffset=el.style.outlineOffset;
  el.style.outline='3px solid #f59e0b';el.style.outlineOffset='3px';
  try{el.focus({preventScroll:true});}catch(_){try{el.focus()}catch(__){}}
  setTimeout(()=>{el.style.outline=prev;el.style.outlineOffset=prevOffset},3500);
  return {ok:true,...target,required_total:d.required_total,missing_count:d.missing_count};
}
chrome.runtime.onMessage.addListener((m,_s,send)=>{
  if(m.type==='REQUIRED_FIELD_STATUS') send(requiredStatus(m.profile||{}));
  if(m.type==='GUIDE_NEXT_MISSING') send(guideNextMissing(m.profile||{}));
  return true;
});




// V0.26: capture only globally reusable, user-confirmed values already present on the form.
// Company/job-specific answers are deliberately excluded.
const GLOBAL_MEMORY_KEYS=new Set(['country','title','address','address_line2','address_line3','city','postcode','phone_device_type','phone_country_code','phone_extension','recent_nhs_experience','right_to_work','sponsorship','notice_period','driving_licence']);
function captureConfirmedFormValues(){
  const values={};
  for(const el of semanticElements()){
    const key=canonical(textFor(el),el); if(!GLOBAL_MEMORY_KEYS.has(key)) continue;
    let value='';
    if(el.type==='checkbox'||el.type==='radio'){if(!el.checked)continue;value=String(el.value||textFor(el)).trim();}
    else value=String(el.value||'').trim();
    if(value&&!/^select one$/i.test(value)) values[key]=value;
  }
  for(const v of (window.JobCopilotWorkday?.virtualControls?.()||[])){
    if(!GLOBAL_MEMORY_KEYS.has(v.canonical))continue;
    const value=window.JobCopilotWorkday.selectedText(v.el);if(value)values[v.canonical]=value;
  }
  return {ok:true,values,count:Object.keys(values).length,excluded_policy:'Company/job-specific answers are not captured.'};
}
chrome.runtime.onMessage.addListener((m,_s,send)=>{
  if(m.type==='CAPTURE_CONFIRMED_FORM_VALUES')send(captureConfirmedFormValues());
  if(m.type==='MAIN_CALL'){
    const requestId=`jc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let done=false;
    const finish=r=>{if(done)return;done=true;document.removeEventListener('jc-main-result',onResult);send(r)};
    const onResult=ev=>{try{const r=JSON.parse(ev.detail||'{}');if(r.requestId===requestId)finish(r.result)}catch(_){}};
    document.addEventListener('jc-main-result',onResult);
    document.dispatchEvent(new CustomEvent('jc-main-call',{detail:JSON.stringify({requestId,fn:m.fn,args:m.args||[]})}));
    setTimeout(()=>finish({ok:false,reason:'The page did not answer in time.'}),30000);
    return true;
  }
  if(m.type==='WORKDAY_STEP')send({workday:!!window.JobCopilotWorkday?.isWorkday?.(),step:window.JobCopilotWorkday?.currentStep?.()||''});
  if(m.type==='WORKDAY_BULK_EXPERIENCE_FILL'){
    Promise.resolve(window.JobCopilotWorkdayExperience?.bulkFill?.(m.profile||{})||{ok:false,reason:'Workday bulk filler unavailable'})
      .then(send).catch(e=>send({ok:false,error:e.message}));return true;
  }
  if(m.type==='WORKDAY_REPAIR_DATES'){
    Promise.resolve(window.JobCopilotWorkdayExperience?.repairDates?.()||{ok:false,reason:'Workday date repair unavailable'})
      .then(send).catch(e=>send({ok:false,error:e.message}));return true;
  }
  if(m.type==='WORKDAY_LANGUAGE_PLAN')send(window.JobCopilotWorkdayLanguages?.plan?.(m.profile||{})||{ok:false,reason:'Workday language adapter unavailable'});
  if(m.type==='WORKDAY_LANGUAGE_FILL'){
    Promise.resolve(window.JobCopilotWorkdayLanguages?.fill?.(m.profile||{})||{ok:false,reason:'Workday language adapter unavailable'})
      .then(send).catch(e=>send({ok:false,error:e.message}));return true;
  }
  if(m.type==='TRAC_EDUCATION_PLAN')send(window.JobCopilotTrac?.plan?.(m.profile||{})||{ok:false,reason:'TRAC adapter unavailable'});
  if(m.type==='TRAC_SECTION')send({education:!!window.JobCopilotTrac?.isEducation?.(),employer:!!window.JobCopilotTrac?.isEmployer?.(),training:!!window.JobCopilotTrac?.isTraining?.(),references:!!window.JobCopilotTrac?.isReferences?.()});
  if(m.type==='TRAC_REFEREE_FORM')send(window.JobCopilotTrac?.refereeForm?.()||{ok:false,reason:'TRAC adapter unavailable'});
  if(m.type==='TRAC_REFEREES_CAPTURE')send(window.JobCopilotTrac?.captureReferees?.()||{ok:false,reason:'TRAC adapter unavailable'});
  if(m.type==='TRAC_REFEREES_FILL'){Promise.resolve(window.JobCopilotTrac?.fillReferees?.(m.referees)||{ok:false,reason:'TRAC adapter unavailable'}).then(send).catch(e=>send({ok:false,error:e.message}));return true}
  if(m.type==='TRAC_TRAINING_FILL'){Promise.resolve(window.JobCopilotTrac?.fillTraining?.(m.titles)||{ok:false,reason:'TRAC adapter unavailable'}).then(send).catch(e=>send({ok:false,error:e.message}));return true}
  if(m.type==='TRAC_EDUCATION_FILL'){
    Promise.resolve(window.JobCopilotTrac?.fillEducation?.(m.profile||{})||{ok:false,reason:'TRAC adapter unavailable'})
      .then(send).catch(e=>send({ok:false,error:e.message}));return true;
  }
  if(m.type==='TRAC_EMPLOYER_PLAN')send(window.JobCopilotTrac?.employerPlan?.(m.profile||{})||{ok:false,reason:'TRAC adapter unavailable'});
  if(m.type==='TRAC_EMPLOYER_FILL'){
    Promise.resolve(window.JobCopilotTrac?.fillEmployer?.(m.profile||{})||{ok:false,reason:'TRAC adapter unavailable'})
      .then(send).catch(e=>send({ok:false,error:e.message}));return true;
  }
  return true;
});

// V0.21: attach a user-selected, locally saved CV to a detected resume/CV file input.
// This is user-triggered only. It never chooses a file from the filesystem itself and never submits.
(function(){
  function decodeBase64(base64){
    const raw=atob(String(base64||''));
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
    return bytes;
  }
  function acceptAllows(el,file){
    const accept=String(el.getAttribute('accept')||'').trim();
    if(!accept) return true;
    const tokens=accept.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    const name=String(file.name||'').toLowerCase(), type=String(file.type||'').toLowerCase();
    return tokens.some(t=>{
      if(t.startsWith('.')) return name.endsWith(t);
      if(t.endsWith('/*')) return type.startsWith(t.slice(0,-1));
      return type===t;
    });
  }
  function resumeFileInputs(){
    const visible=semanticElements().filter(el=>el.tagName==='INPUT'&&el.type==='file')
      .filter(el=>canonical(textFor(el),el)==='resume' || /resume|cv|curriculum vitae/i.test(textFor(el)));
    if(visible.length)return visible;
    // Drag-and-drop upload areas (TalentLink and others) keep a hidden file input whose id names
    // the CV slot ("upload_attached_resume_13") while the visible label just says "upload file".
    const named=[...document.querySelectorAll('input[type="file"]')]
      .filter(el=>/(^|[_-])(attached[_-])?resume|(^|[_-])cv([_-]|$)|curriculum/i.test(`${el.id} ${el.name} ${el.className}`)&&!/cover/i.test(`${el.id} ${el.name}`));
    if(named.length===1)return named;
    // Workday's visible Resume/Cover Letter drop zone uses one display:none
    // file input as its actual React change target. Require that exact structure
    // and a unique file input before assigning a user-requested saved CV.
    if(window.JobCopilotAdapterRegistry?.detect?.()!=='WORKDAY')return [];
    const all=[...document.querySelectorAll('input[type="file"]')];
    if(all.length!==1)return [];
    const el=all[0];
    if(el.getAttribute('data-automation-id')!=='file-upload-input-ref'||
       !el.parentElement?.querySelector('[data-automation-id="file-upload-drop-zone"]'))return [];
    const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    const start=headings.find(h=>/resume\s*\/\s*cover\s*letter/i.test(h.textContent||''));
    const end=headings.find(h=>/websites\s*\/\s*portfolio/i.test(h.textContent||''));
    const following=Node.DOCUMENT_POSITION_FOLLOWING;
    if(!start||!(start.compareDocumentPosition(el)&following)||
       (end&&!(el.compareDocumentPosition(end)&following)))return [];
    return [el];
  }
  function workdayUploadedFile(name){
    const text=String(document.body?.innerText||'').replace(/\s+/g,' ');
    const at=text.indexOf(name);
    return at>=0&&/Successfully Uploaded!/i.test(text.slice(at,at+250));
  }
  async function attachSavedCV(saved){
    if(!saved?.base64||!saved?.name) return {ok:false,reason:'Saved CV payload is missing.'};
    const inputs=resumeFileInputs();
    if(inputs.length!==1) return {ok:false,reason:inputs.length?`Found ${inputs.length} possible CV upload fields; refusing ambiguous attachment.`:'No visible CV/resume file upload field found.'};
    const el=inputs[0];
    const isWorkday=window.JobCopilotAdapterRegistry?.detect?.()==='WORKDAY';
    if(isWorkday&&workdayUploadedFile(saved.name))
      return {ok:true,name:saved.name,verified:true,already_uploaded:true,note:'Existing successful Workday upload preserved.'};
    if(el.files?.length) return {ok:false,reason:'CV upload field already contains a file; refusing overwrite.',existing_file_count:el.files.length};
    const bytes=decodeBase64(saved.base64);
    if(isWorkday&&bytes.length>5*1024*1024)
      return {ok:false,reason:'Saved CV exceeds this Workday upload area\'s 5 MB limit.'};
    const file=new File([bytes],saved.name,{type:saved.type||'application/octet-stream',lastModified:saved.lastModified||Date.now()});
    if(!acceptAllows(el,file)) return {ok:false,reason:`Saved CV type is not accepted by this field (${el.getAttribute('accept')||'site restriction'}).`,name:file.name,type:file.type};
    const dt=new DataTransfer(); dt.items.add(file);
    try{el.files=dt.files;}catch(e){return {ok:false,reason:'Browser refused programmatic file assignment.',error:e.message}}
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    if(isWorkday){
      for(let i=0;i<40;i++){
        if(workdayUploadedFile(file.name))
          return {ok:true,name:file.name,size:file.size,type:file.type,verified:true,note:'Workday displayed Successfully Uploaded! for this file.'};
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      return {ok:false,reason:'Workday did not confirm the upload. Check the file card on the page before retrying.'};
    }
    const verified=!!(el.files&&el.files.length===1&&el.files[0].name===file.name);
    return verified?{ok:true,name:file.name,size:file.size,type:file.type,label:textFor(el),verified:true,
      note:'Check the uploaded file card on the application page before continuing.'}
      :{ok:false,reason:'File assignment could not be verified after change event.'};
  }
  chrome.runtime.onMessage.addListener((m,_s,send)=>{
    if(m.type==='ATTACH_SAVED_CV'){
      Promise.resolve(attachSavedCV(m.savedCV||{})).then(send).catch(e=>send({ok:false,error:e.message}));
    }
    return true;
  });
})();

// Attach a reviewed, evidence-validated cover letter to one unambiguous field.
// This never clicks any page button or submits an application.
(function(){
  const types={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
  const isWorkday=()=>window.JobCopilotAdapterRegistry?.detect?.()==='WORKDAY';
  function workdayUploadStatus(name){
    const text=String(document.body?.innerText||'').replace(/\s+/g,' ');
    const at=text.indexOf(name);
    return at>=0&&/Successfully Uploaded!/i.test(text.slice(at,at+250));
  }
  function uploadField(){
    // Greenhouse labels both file inputs "Attach"; the field is identified by its id/name
    // (cover_letter) or its group heading, never by mistaking the resume field.
    const coverLetterish=el=>/cover\s*letter/i.test(textFor(el))||/cover[\s_-]*letter/i.test(`${el.id} ${el.name}`)
      ||/^\s*cover\s*letter/i.test(el.closest('[class*="field"],fieldset,.file-upload')?.querySelector('label,legend,[class*="label"],h3,h4')?.innerText||'');
    let inputs=semanticElements().filter(el=>el.tagName==='INPUT'&&el.type==='file')
      .filter(el=>coverLetterish(el)&&!/resume|\bcv\b/i.test(`${el.id} ${el.name}`));
    if(!inputs.length&&isWorkday()){
      const all=[...document.querySelectorAll('input[type="file"]')];
      const el=all.length===1?all[0]:null;
      const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
      const start=headings.find(h=>/resume\s*\/\s*cover\s*letter/i.test(h.textContent||''));
      const end=headings.find(h=>/websites\s*\/\s*portfolio/i.test(h.textContent||''));
      const following=Node.DOCUMENT_POSITION_FOLLOWING;
      if(el?.multiple&&el.getAttribute('data-automation-id')==='file-upload-input-ref'&&
         el.parentElement?.querySelector('[data-automation-id="file-upload-drop-zone"]')&&
         start&&(start.compareDocumentPosition(el)&following)&&
         (!end||(el.compareDocumentPosition(end)&following)))inputs=[el];
    }
    if(inputs.length!==1)return {ok:false,reason:inputs.length?'More than one cover letter upload field was found.':'No compatible cover letter upload field was found.'};
    if(inputs[0].files?.length)return {ok:false,reason:'Cover letter field already contains a file; refusing overwrite.'};
    const el=inputs[0],accept=String(el.getAttribute('accept')||'').toLowerCase();
    const allowed=Object.keys(types).filter(format=>!accept||accept.split(',').map(x=>x.trim()).some(x=>
      x===`.${format}`||x===types[format]||x==='application/*'||x==='*/*'));
    return {ok:true,el,allowed};
  }
  async function attachCoverLetter(payload){
    if(location.href!==payload?.expected_url)return {ok:false,reason:'Job page changed since the cover letter was generated.'};
    if(!payload?.base64||!payload?.name||!/^Cover-Letter-[a-zA-Z0-9-]+\.(pdf|docx)$/.test(payload.name))
      return {ok:false,reason:'Validated cover letter document is missing.'};
    const field=uploadField();if(!field.ok)return field;
    const format=payload.name.split('.').pop(),mime=types[format];
    if(!field.allowed.includes(format)||payload.mime_type!==mime)
      return {ok:false,reason:'Cover letter format is not accepted by this upload field.'};
    const el=field.el;
    const raw=atob(payload.base64);
    const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    if(bytes.length>1024*1024)return {ok:false,reason:'Generated cover letter exceeds the attachment limit.'};
    if(isWorkday()&&workdayUploadStatus(payload.name))
      return {ok:true,name:payload.name,verified:true,already_uploaded:true};
    const file=new File([bytes],payload.name,{type:mime});
    const transfer=new DataTransfer();transfer.items.add(file);
    try{el.files=transfer.files}catch(e){return {ok:false,reason:'Browser refused file assignment.',error:e.message}}
    fire(el);
    if(isWorkday()){
      for(let i=0;i<40;i++){
        if(workdayUploadStatus(file.name))return {ok:true,name:file.name,verified:true};
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      return {ok:false,reason:'Workday did not confirm the cover letter upload. Check the file card before retrying.'};
    }
    return el.files?.length===1&&el.files[0].name===file.name
      ?{ok:true,name:file.name,verified:true,label:textFor(el)}
      :{ok:false,reason:'Cover letter attachment could not be verified.'};
  }
  chrome.runtime.onMessage.addListener((m,_s,send)=>{
    if(m.type==='COVER_LETTER_UPLOAD_FORMATS'){
      if(location.href!==m.expected_url){send({ok:false,reason:'Job page changed since the cover letter was generated.'});return true}
      const field=uploadField();
      send(field.ok?{ok:!!field.allowed.length,formats:field.allowed,reason:field.allowed.length?null:'This upload field does not accept PDF or DOCX.'}:{ok:false,reason:field.reason});
      return true;
    }
    if(m.type==='ATTACH_COVER_LETTER'){
      Promise.resolve(attachCoverLetter(m.document||{})).then(send).catch(e=>send({ok:false,error:e.message}));
    }
    return true;
  });
})();

// Document library: attach the user's saved documents (certificates, memberships, papers, other)
// to the upload areas whose heading or field name says what they are for. Never overwrites a
// field that already holds a file, never touches CV or cover letter fields, never submits.
(function(){
  const CATEGORIES=[
    ['cv',/resume|\bcv\b|curriculum/i],
    ['cover_letter',/cover[\s_-]*letter|covering[\s_-]*letter/i],
    ['qualifications',/qualification|certificat|degree|diploma|transcript/i],
    ['membership',/membership|professional[\s_-]*(?:body|registration)|registration[\s_-]*certificate/i],
    ['research',/research[\s_-]*paper|publication|writing[\s_-]*sample|\bpaper[\s_-]*\d/i],
    ['other',/other[\s_-]*(?:attachment|document|file)|otherattachment|additional[\s_-]*(?:document|file|attachment)|supporting[\s_-]*document/i],
  ];
  const GENERIC=/^\s*(?:upload\s*file|choose\s*file|browse|attach|upload|drop\s+a?\s*file.*)\s*$/i;
  function headingFor(el){
    // The visible title of a drag-and-drop area usually sits just before it.
    let node=el;
    for(let depth=0;depth<5&&node;depth++,node=node.parentElement){
      let prev=node.previousElementSibling;
      for(let hops=0;prev&&hops<2;hops++,prev=prev.previousElementSibling){
        const t=String(prev.innerText||prev.textContent||'').replace(/\s+/g,' ').trim();
        if(t&&t.length<=80&&!GENERIC.test(t))return t;
      }
    }
    return '';
  }
  function slotText(el){
    const label=el.id?document.querySelector(`label[for="${CSS.escape(el.id)}"]`):null;
    const lt=String(label?.innerText||'').replace(/\s+/g,' ').trim();
    const group=el.closest('.form-group,[class*="upload"],[class*="attach"],fieldset');
    return [el.id,el.name,String(el.className||''),String(group?.className||''),GENERIC.test(lt)?'':lt,headingFor(el)].join(' ');
  }
  function categoryOf(el){const t=slotText(el);return (CATEGORIES.find(([,re])=>re.test(t))||[null])[0]}
  function decode(base64){const raw=atob(String(base64||''));const b=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)b[i]=raw.charCodeAt(i);return b}
  function accepts(el,file){
    const accept=String(el.getAttribute('accept')||'').trim();if(!accept)return true;
    const name=file.name.toLowerCase(),type=String(file.type||'').toLowerCase();
    return accept.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).some(t=>t.startsWith('.')?name.endsWith(t):t.endsWith('/*')?type.startsWith(t.slice(0,-1)):type===t);
  }
  function put(el,docs){
    const dt=new DataTransfer();
    for(const d of docs){const f=new File([decode(d.base64)],d.name,{type:d.type||'application/octet-stream'});if(!accepts(el,f))return {ok:false,reason:`${d.name} is not an accepted file type here`};dt.items.add(f)}
    try{el.files=dt.files}catch(e){return {ok:false,reason:'The browser refused the file'}}
    el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    return {ok:el.files.length===docs.length};
  }
  function attachDocuments(library){
    const slots=[...document.querySelectorAll('input[type="file"]')].map(el=>({el,category:categoryOf(el)}));
    const results=[];
    for(const [category] of CATEGORIES){
      if(category==='cv'||category==='cover_letter')continue;
      const docs=(library||[]).filter(d=>d.category===category&&d.base64);
      const free=slots.filter(s=>s.category===category);
      let next=0;
      for(const s of free){
        if(next>=docs.length)break;
        if(s.el.files?.length){results.push({category,slot:slotText(s.el).trim().slice(0,60),ok:false,reason:'already has a file'});continue}
        // A field that takes several files gets all remaining documents of its kind.
        const batch=s.el.multiple?docs.slice(next):[docs[next]];
        const r=put(s.el,batch);
        results.push({category,names:batch.map(d=>d.name),ok:r.ok,reason:r.reason});
        if(r.ok)next+=batch.length;
      }
      if(next<docs.length&&free.length)results.push({category,ok:false,reason:`${docs.length-next} more ${category} document(s) than upload areas`,names:docs.slice(next).map(d=>d.name)});
    }
    return {ok:true,results,slots:slots.map(s=>s.category)};
  }
  window.SnapplyDocuments={categoryOf,attachDocuments};
  chrome.runtime.onMessage.addListener((m,_s,send)=>{
    if(m.type==='ATTACH_DOCUMENTS'){try{send(attachDocuments(m.documents||[]))}catch(e){send({ok:false,error:e.message})}}
    if(m.type==='DOCUMENT_SLOTS'){const all=[...document.querySelectorAll('input[type="file"]')];
      send({slots:all.map(categoryOf),details:all.map(el=>({category:categoryOf(el),label:headingFor(el),filled:!!el.files?.length}))})}
  });
})();
