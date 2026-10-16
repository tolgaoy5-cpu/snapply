const byId=id=>document.getElementById(id);
// Inside the in-page panel (iframe) the popup fills the panel instead of using a fixed width.
if(new URLSearchParams(location.search).has('embedded')){
  // The in-page panel shows its own header (logo, ATS, minimise), so the popup's title row is hidden.
  document.body.style.width='auto';
  document.querySelectorAll('header h1,header .version').forEach(n=>n.style.display='none');
}
async function active(){const [t]=await chrome.tabs.query({active:true,currentWindow:true});return t}
async function send(type,payload={}){const t=await active();return chrome.tabs.sendMessage(t.id,{type,...payload})}
function show(d){byId('out').textContent=JSON.stringify(d,null,2);if(d?.error)byId('summary').textContent=`Your input is needed · ${d.error}`} 
// Plain-language cards for required fields that are not handled as questions above.
const CARD_TEXT={
  AUTO_READY:['Fill this on the page','Snapply could not fill this field here. Please complete it on the page.'],
  HIGH:['Fill this on the page','Snapply could not fill this field here. Please complete it on the page.'],
  OPTION_READY:['Saved answer available','Press Fill this page to use your saved answer.'],
  SENSITIVE_REVIEW:['Personal data · your choice','Snapply never fills personal data. Answer it on the page if you want to.'],
  REVIEW:['Please check','Review this field on the page.'],
  FILE_REQUIRED:['Upload on the page','Use the site\'s upload button, or Attach saved CV.'],
  USER_REQUIRED:['Your answer is needed','Answer this on the page.'],
  ASK_USER:['Your answer is needed','Answer this on the page.']
};
// Contact details missing from the CV (postcode, address, town, phone…) are asked once here,
// saved to the profile memory and filled now and on every later application.
const PROFILE_ASK={postcode:'Postcode',address:'Address line 1',address_line2:'Address line 2',city:'Town / city',region:'Region / county',phone:'Phone number',title:'Title (Mr, Ms, Dr…)'};
function profileAskCard(x){
  const key=x.canonical==='region'?'city':x.canonical;
  const input=el('input',{placeholder:PROFILE_ASK[x.canonical],autocomplete:'on'});
  const status=el('div',{className:'muted',textContent:'Not in your CV. Enter it once — Snapply fills it on every application from now on.'});
  const go=el('button',{textContent:'Fill & save'});
  go.onclick=async()=>{try{
    const v=input.value.trim();if(!v)throw new Error('Enter a value first.');
    go.disabled=true;await window.JobCopilotMemory.set(key,v,{source:'panel'});
    await send('FILL_FORM',{profile:await profile()});
    status.className='done';status.textContent='Filled · saved for next time';
  }catch(e){go.disabled=false;status.className='block';status.textContent=e.message}};
  return el('div',{className:'ask-card'},[el('b',{textContent:PROFILE_ASK[x.canonical]}),el('div',{className:'muted',textContent:String(x.label||'').replace(/\s+/g,' ').trim()}),input,el('div',{className:'row'},[go]),status]);
}
function cards(items){const root=byId('cards');root.replaceChildren();(items||[]).slice(0,20).forEach(x=>{if(PROFILE_ASK[x.canonical]&&x.status!=='COMPLETE'){root.appendChild(profileAskCard(x));return}const [title,hint]=CARD_TEXT[x.status]||CARD_TEXT[x.decision]||['Please check',x.reason||''];const d=document.createElement('div');d.className='card';const t=document.createElement('b');t.textContent=title;const l=document.createElement('div');l.textContent=String(x.label||x.question||'').replace(/\s+/g,' ').trim();const h=document.createElement('div');h.className='muted';h.textContent=hint;d.append(t,l,h);root.appendChild(d)})}
async function profile(){
  await window.JobCopilotAPI.ensureScope();
  let {masterProfile}=await chrome.storage.local.get('masterProfile');
  // The local backend owns the current CV/profile across extension versions.
  // A cached Chrome profile may be stale after a previous tab or version edits it.
  try{
    const state=await window.JobCopilotAPI.get('/v1/state');
    if(state.master_profile&&Object.keys(state.master_profile).length){
      masterProfile=state.master_profile;
      await chrome.storage.local.set({masterProfile});
    }else{
      // The server has no profile for this account: do not keep showing an older cached one.
      masterProfile=null;await chrome.storage.local.remove('masterProfile');
    }
  }catch(_){ /* Use the last local copy while the backend is unavailable. */ }
  const base=masterProfile||{};
  return window.JobCopilotMemory?await window.JobCopilotMemory.mergeIntoProfile(base):base;
}
async function currentJob(){const x=await chrome.storage.local.get('currentJob');return x.currentJob||null}
function savedPostingForApplication(saved,pageUrl){
  if(!saved?.requirement_count||!saved.requirements?.length)return false;
  try{
    const a=new URL(pageUrl),b=new URL(saved.url);
    if(a.origin!==b.origin||!a.hostname.endsWith('.myworkdayjobs.com'))return false;
    if(!/\/apply(?:\/|$)/i.test(a.pathname)||/\/apply(?:\/|$)/i.test(b.pathname))return false;
    const id=p=>p.pathname.match(/_JR-?\d+/i)?.[0]?.toLowerCase().replace("-","");
    return !!id(a)&&id(a)===id(b);
  }catch(_){return false}
}
async function refreshProfileState(){renderSavedAnswers();const p=await profile();byId('profileState').textContent=p.full_name?`${p.full_name} · ${(p.experience||[]).length} experience · ${(p.education||[]).length} education${p.unresolved?.length?` · ${p.unresolved.length} needs review`:''}`:'No CV imported yet.';await renderUnresolved();await refreshSavedCVState()}
async function refreshSavedCVState(){
  const el=byId('savedCVState');if(!el)return;
  try{
    const cv=await window.JobCopilotSavedCV.get();
    if(!cv){el.textContent='No reusable CV saved yet.';return}
    el.textContent=`Saved CV: ${cv.name} · ${(cv.size/1024/1024).toFixed(2)} MB · ${cv.storage==='backend'?'persistent backend':'local cache'}`;
  }catch(_){el.textContent='Saved CV status unavailable. Start the local backend and reopen this panel; do not re-import the CV.';}
}

byId('importCV').onclick=async()=>{try{const f=byId('cvFile').files?.[0];if(!f)throw new Error('Choose a CV file first.');byId('summary').textContent='Importing and saving CV…';const d=await window.JobCopilotAPI.uploadCV(f);await chrome.storage.local.set({masterProfile:d.profile});const saved=await window.JobCopilotSavedCV.saveLocal(f);await refreshProfileState();byId('summary').textContent=(d.review_required?'CV imported · review unresolved items':'CV imported successfully')+` · saved ${saved.name}`;show({...d,saved_cv:{name:saved.name,size:saved.size,type:saved.type}})}catch(e){show({error:e.message})}};

byId('attachSavedCV').onclick=async()=>{try{
  const cv=await window.JobCopilotSavedCV.getPayload();
  if(!cv) throw new Error('No reusable CV is saved. Choose a CV and use Import + Save first.');
  byId('summary').textContent=`Attaching ${cv.name}…`;
  const d=await send('ATTACH_SAVED_CV',{savedCV:cv});
  byId('summary').textContent=d.ok?(d.site_upload_unverified?`CV selected · verify Workday upload · ${d.name}`:`Attached saved CV · ${d.name}`):`CV attachment needs attention · ${d.reason||d.error||'unknown issue'}`;
  show(d);
}catch(e){show({error:e.message})}};
byId('forgetSavedCV').onclick=async()=>{try{await window.JobCopilotSavedCV.forget();await refreshSavedCVState();byId('summary').textContent='Reusable CV removed from persistent backend and local cache.';show({ok:true,forgot_saved_cv:true})}catch(e){show({error:e.message})}};

byId('scan').onclick=async()=>{try{const d=await send('DYNAMIC_SCAN');byId('summary').textContent=`${d.ats} · ${d.pageType} · ${d.fields.length} fields`;show(d)}catch(e){show({error:e.message})}};
byId('review').onclick=async()=>{try{const d=await send('REVIEW_PLAN',{profile:await profile()});const c={HIGH:0,REVIEW:0,ASK_USER:0,BLOCKED:0};d.items.forEach(x=>c[x.decision]=(c[x.decision]||0)+1);byId('summary').textContent=`${d.ats} · HIGH ${c.HIGH} · REVIEW ${c.REVIEW} · ASK ${c.ASK_USER} · BLOCKED ${c.BLOCKED}`;cards(d.items.filter(x=>x.decision!=='HIGH'));show(d)}catch(e){show({error:e.message})}};
byId('extractJob').onclick=async()=>{try{const d=await send('EXTRACT_JOB');byId('summary').textContent=`Job captured · ${String(d.text||'').length} chars`;show(d)}catch(e){show({error:e.message})}};
byId('analyzeJob').onclick=async()=>{try{const capture=await send('EXTRACT_JOB');if(capture.error)throw new Error(capture.error);const analyzed=await window.JobCopilotAPI.post('/v1/job/analyze',capture);if(!analyzed.requirement_count)throw new Error(analyzed.error||'No job requirements found. Open the job posting first.');await chrome.storage.local.set({currentJob:analyzed});byId('summary').textContent=`${analyzed.requirement_count} requirements extracted`;cards((analyzed.requirements||[]).map((x,i)=>({decision:`R${i+1}`,label:x})));show(analyzed)}catch(e){show({error:e.message})}};
byId('questions').onclick=async()=>{try{const d=await send('EVIDENCE_QUESTIONS');byId('summary').textContent=`${d.ats} · ${d.questions.length} evidence questions`;cards(d.questions);show(d)}catch(e){show({error:e.message})}};
byId('fill').onclick=async()=>{try{show(await send('FILL_FORM',{profile:await profile()}))}catch(e){show({error:e.message})}};
// Page helpers that need the page's MAIN world (React internals) run through the content script's
// bridge, which works from the in-page panel as well as the toolbar popup (no activeTab needed).
async function runInPage(fn,args=[]){
  const r=await send('MAIN_CALL',{fn,args});
  return r||{ok:false,reason:'No result from the page.'};
}
async function questionOptions(q){
  if(q.control==='react_select'){const r=await runInPage('reactSelect',[q.qid,'options',null]);return r.ok?r.options:[]}
  const o=await send('QUESTION_OPTIONS',{qid:q.qid});return o.ok?o.options:[];
}
async function fillQuestion(q,value){
  if(q.control==='react_select'){
    const r=await runInPage('reactSelect',[q.qid,'select',value]);
    if(!r.ok)return r;
    // Confirm from the page's own rendering, not just the component.
    const page=await send('PAGE_QUESTIONS');const now=page?.questions?.find(x=>x.qid===q.qid)?.value||'';
    return now.toLowerCase().includes(String(value).trim().toLowerCase())?{ok:true,value:now}:{ok:false,reason:'The page did not keep the answer.'};
  }
  return send('FILL_QUESTION',{qid:q.qid,value});
}

// TRAC references: saved referees are other people's data — offered, filled only after confirmation.
const refereeLabel=f=>[f.title,f['first-name'],f.surname].filter(Boolean).join(' ')+(f.orgname?` — ${f.orgname}`:'')+(f.relationship?` (${f.relationship})`:'');
// "Add a referee" form built from the page's own referee fields (same options as the site).
async function refereeFormCard(onSaved){
  const spec=await send('TRAC_REFEREE_FORM');
  const box=el('div',{className:'ask-card'});
  if(!spec?.ok){box.append(el('div',{className:'block',textContent:spec?.reason||'Could not read the referee form.'}));return box}
  const inputs={};
  box.append(el('div',{textContent:'Add a referee'}),el('div',{className:'muted',textContent:'Saved on this computer only. Used again only when you confirm.'}));
  for(const f of spec.fields){
    const id='ref-'+f.key.replace(/[^a-z0-9]+/gi,'-');
    const input=f.type==='select'
      ?el('select',{id},[el('option',{value:'',textContent:'Choose…'}),...f.options.map(o=>el('option',{value:o,textContent:o}))])
      :el('input',{id,type:'text'});
    input.style.width='100%';
    inputs[f.key]=input;
    box.append(el('label',{htmlFor:id,textContent:f.label+(f.required?' *':'')}),input);
  }
  const status=el('div',{className:'muted'});
  const save=el('button',{textContent:'Save & fill'});
  save.onclick=async()=>{try{
    const fields={};for(const [k,i] of Object.entries(inputs)){const v=String(i.value||'').trim();if(v)fields[k]=v}
    const missing=spec.fields.filter(f=>f.required&&!fields[f.key]).map(f=>f.label);
    if(missing.length)throw new Error(`Please fill: ${missing.join(', ')}`);
    save.disabled=true;
    const ref={label:refereeLabel(fields),fields,confirmed_at:new Date().toISOString()};
    const saved=await window.JobCopilotMemory.getReferees();
    await window.JobCopilotMemory.saveReferees([...saved,ref]);
    const r=await send('TRAC_REFEREES_FILL',{referees:[ref]});
    if(!r.ok)throw new Error(r.reason||r.error||'Saved, but could not fill the page.');
    await onSaved(`${ref.label} saved and filled on the page. Review before saving.`);
  }catch(e){save.disabled=false;status.className='block';status.textContent=e.message}};
  box.append(el('div',{className:'row'},[save]),status);
  return box;
}
async function renderReferees(note=''){
  const list=byId('askList');list.replaceChildren();byId('askTitle').style.display='';cards([]);
  let saved=[];try{saved=await window.JobCopilotMemory.getReferees()}catch(_){}
  const status=el('div',{className:'muted'});
  const remember=el('button',{textContent:'Remember referees on this page'});
  remember.onclick=async()=>{try{
    const r=await send('TRAC_REFEREES_CAPTURE');if(!r.ok)throw new Error(r.reason||'Could not read the referees.');
    if(!r.referees.length)throw new Error('No referee with a name on this page yet.');
    const merged=[...saved];
    for(const ref of r.referees){const k=x=>`${x.fields['first-name']||''} ${x.fields.surname||''}`.trim().toLowerCase();const i=merged.findIndex(x=>k(x)===k(ref));if(i>=0)merged[i]={...ref,confirmed_at:new Date().toISOString()};else merged.push({...ref,confirmed_at:new Date().toISOString()})}
    saved=await window.JobCopilotMemory.saveReferees(merged);
    status.className='done';status.textContent=`${r.referees.length} referee${r.referees.length>1?'s':''} saved. Next time Snapply offers them here.`;
    await renderReferees();
  }catch(e){status.className='block';status.textContent=e.message}};
  const after=async msg=>renderReferees(msg);
  if(!saved.length){
    byId('summary').textContent='References · add a referee here once; next time Snapply offers it.';
    byId('askState').textContent='Referee details belong to other people, so Snapply fills them only from referees you saved and confirm.';
    list.append(await refereeFormCard(after));
    list.append(el('div',{className:'ask-card'},[el('div',{className:'muted',textContent:'Already typed referees on the page? Save them instead:'}),remember,status]));
    byId('askTitle').scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }
  byId('summary').textContent=`References · ${saved.length} saved referee${saved.length>1?'s':''} available. Confirm to fill.`;
  byId('askState').textContent='Referee details belong to other people. Tick the ones to use for this application and confirm.';
  const boxes=saved.map(()=>el('input',{type:'checkbox',checked:true}));
  const go=el('button',{textContent:'Confirm & fill referees'});
  go.onclick=async()=>{try{
    const chosen=saved.filter((_,i)=>boxes[i].checked);if(!chosen.length)throw new Error('Tick at least one referee.');
    go.disabled=true;const r=await send('TRAC_REFEREES_FILL',{referees:chosen});
    if(!r.ok)throw new Error(r.reason||r.error||'Could not fill the referees.');
    const miss=r.rows.flatMap(x=>x.missing);
    status.className='done';status.textContent=`${r.rows.length} referee row${r.rows.length===1?'':'s'} filled${r.remaining?` · ${r.remaining} could not be added`:''}${miss.length?` · check on the page: ${[...new Set(miss)].join(', ')}`:''}. Review before saving.`;
    show(r);
  }catch(e){go.disabled=false;status.className='block';status.textContent=e.message}};
  const addAnother=el('button',{textContent:'Add a referee'});
  addAnother.onclick=async()=>{addAnother.disabled=true;list.append(await refereeFormCard(after))};
  if(note){status.className='done';status.textContent=note}
  list.append(el('div',{className:'ask-card'},[
    el('div',{textContent:'Saved referees'}),el('span',{className:'badge',textContent:'Other people\'s details · confirm every time'}),
    ...saved.map((r,i)=>el('label',{},[boxes[i],' '+(r.label||'Referee')])),
    el('div',{className:'row'},[go,addAnother,remember]),status]));
  byId('askTitle').scrollIntoView({behavior:'smooth',block:'start'});
}

// TRAC training courses: the user picks which CV certifications to list (max 7).
function renderTrainingChoice(p){
  const certs=(p.certifications||[]).map(x=>String(x||'').trim()).filter(Boolean);
  const list=byId('askList');list.replaceChildren();
  byId('askTitle').style.display='';
  if(!certs.length){byId('askState').textContent='Your CV has no certifications or courses to add. Enter any training on the page.';return}
  byId('summary').textContent=`Training courses · choose up to 7 of the ${certs.length} certifications in your CV.`;
  byId('askState').textContent='Only course titles are in your CV. After adding, complete provider, duration and year on the page.';
  const boxes=certs.map(c=>el('input',{type:'checkbox',value:c}));
  const status=el('div',{className:'muted'});
  const go=el('button',{textContent:'Add selected courses'});
  const sync=()=>{const n=boxes.filter(b=>b.checked).length;boxes.forEach(b=>{b.disabled=!b.checked&&n>=7});go.textContent=n?`Add ${n} selected course${n>1?'s':''}`:'Add selected courses'};
  boxes.forEach(b=>b.onchange=sync);
  go.onclick=async()=>{try{
    const titles=boxes.filter(b=>b.checked).map(b=>b.value);if(!titles.length)throw new Error('Tick at least one course.');
    go.disabled=true;const r=await send('TRAC_TRAINING_FILL',{titles});
    if(!r.ok)throw new Error(r.reason||r.error||'Could not add the courses.');
    status.className='done';status.textContent=`${r.rows.filter(x=>x.filled).length} course title${r.rows.length===1?'':'s'} added${r.skipped_existing?` · ${r.skipped_existing} already listed`:''}. Complete provider, duration and year on the page.`;
    show(r);
  }catch(e){go.disabled=false;status.className='block';status.textContent=e.message}};
  list.append(el('div',{className:'ask-card'},[el('div',{textContent:'Which courses should be listed for this job?'}),
    ...certs.map((c,i)=>el('label',{},[boxes[i],' '+c])),go,status]));
  byId('askTitle').scrollIntoView({behavior:'smooth',block:'start'});
}

// ---- Ask once, remember, fill next time ----
// Empty required questions are filled from saved answers when the saved answer is an ordinary one.
// Legal declarations and personal data are only proposed; the user confirms each time.
function el(tag,props={},kids=[]){const n=document.createElement(tag);Object.assign(n,props);kids.forEach(k=>n.append(k));return n}
const SENSITIVITY_NOTE={legal:'Legal declaration · confirm every time',sensitive:'Personal data · confirm every time',review:'Job-specific answer · confirm every time'};
async function answerQuestions(){
  const page=await send('PAGE_QUESTIONS').catch(()=>null);
  if(!page?.ok){renderAsk([]);return {filled:0,ask:0,askedIds:new Set()}}
  let saved=[];try{saved=await window.JobCopilotMemory.getAnswers()}catch(_){}
  const ask=[],optional=[];let filled=0,answered=0,unsaved=0,optionalPersonal=0;
  for(const q of page.questions){
    if(q.value){answered++;if(q.sensitivity!=='never'&&!window.JobCopilotQuestions.findMatch(saved,{...q,options:null}))unsaved++;continue}
    let match=window.JobCopilotQuestions.findMatch(saved,q);
    if(!match&&!q.required){
      if(q.sensitivity==='sensitive'||q.sensitivity==='legal')optionalPersonal++;
      // Optional lists: read options only where that does not open anything on the page.
      if(q.kind==='choice'&&!q.options&&q.fillable&&q.control==='react_select')q.options=await questionOptions(q);
      if(q.kind==='choice'&&!q.options?.length&&q.control==='workday_listbox')q.fillable=false;
      if(q.control==='react_select'&&!q.options?.length)q.fillable=false;
      optional.push({...q,suggestion:''});continue;
    }
    if(q.kind==='choice'&&!q.options&&q.fillable){q.options=await questionOptions(q);match=window.JobCopilotQuestions.findMatch(saved,q)}
    // Lists whose options load only while typing (e.g. location search) are answered on the page.
    if(q.control==='react_select'&&!q.options?.length)q.fillable=false;
    if(match&&q.sensitivity==='normal'&&q.fillable){
      const f=await fillQuestion(q,match.item.value);
      if(f.ok){filled++;continue}
      q.error=f.reason;
    }
    ask.push({...q,suggestion:match?.item?.value||''});
  }
  renderAsk(ask,{answered,unsaved,optionalPersonal,optional});
  return {filled,ask:ask.length,answered,unsaved,optionalPersonal,optional:optional.length,askedIds:new Set([...ask,...optional].map(q=>q.qid))};
}
function askCard(q){
  if(q.fillable===false)return el('div',{className:'ask-card'},[el('div',{textContent:q.label}),
    ...(SENSITIVITY_NOTE[q.sensitivity]?[el('span',{className:'badge',textContent:SENSITIVITY_NOTE[q.sensitivity]})]:[]),
    el('div',{className:'muted',textContent:(q.suggestion?`Saved answer: ${q.suggestion}. `:'')+'Answer this one on the page, then press “Remember answers on this page”.'})]);
  const control=q.kind==='choice'&&q.options?.length
    ?el('select',{},[el('option',{value:'',textContent:'Choose…'}),...q.options.map(o=>el('option',{value:o,textContent:o,selected:o===q.suggestion}))])
    :el('textarea',{value:q.suggestion||'',placeholder:'Your answer'});
  // Job-specific statements are not remembered unless the user ticks it.
  const remember=el('input',{type:'checkbox',checked:q.sensitivity!=='review'});
  const status=el('div',{className:'muted',textContent:q.error?`Could not use the saved answer: ${q.error}`:''});
  const confirmSaved=q.suggestion&&q.sensitivity!=='normal';
  const go=el('button',{textContent:confirmSaved?'Confirm & fill':'Fill & remember'});
  go.onclick=async()=>{try{
    const value=String(control.value||'').trim();if(!value)throw new Error('Enter an answer first.');
    go.disabled=true;
    const f=await fillQuestion(q,value);
    if(!f.ok)throw new Error(f.reason||'The page did not accept the answer.');
    go.remove();
    // Filling and remembering are separate: a failed save must not hide that the page was filled.
    let saved=false;
    if(remember.checked){try{await window.JobCopilotMemory.saveAnswer({signature:q.signature,question:q.label,value,kind:q.kind,sensitivity:q.sensitivity});saved=true}
      catch(e){status.className='ask';status.textContent='Filled on the page, but could not remember it for next time. Is the local backend running?';return}}
    status.className='done';status.textContent=saved?'Filled · saved for next time':'Filled';
    await renderSavedAnswers();
  }catch(e){go.disabled=false;status.className='block';status.textContent=e.message}};
  // Written questions about the job (not personal data or declarations) can get an AI draft
  // built only from CV evidence that matches the job's requirements. The user edits it before filling.
  const draftable=q.kind==='text'&&(q.sensitivity==='normal'||q.sensitivity==='review')&&aiReady;
  const draft=draftable?el('button',{textContent:'Draft with AI'}):null;
  if(draft)draft.onclick=async()=>{try{
    draft.disabled=true;status.className='muted';status.textContent='Drafting from your CV and the job requirements…';
    // The saved advert for this application, or the job text on this page (simple one-page forms).
    let job=await currentJob();
    if(!job?.requirements?.length){
      try{const cur=await resolveCurrentJob();job=cur.job;if(job?.requirement_count&&!cur.capture.error)await chrome.storage.local.set({currentJob:job})}catch(_){}
    }
    if(!job?.requirements?.length)throw new Error('Open the job advert and press “Read job description” first, then come back to this page.');
    const r=await window.JobCopilotAPI.post('/v1/answers/generate',{question:q.label,profile:await profile(),job,character_limit:q.max_length||null});
    if(r.status==='ASK_USER'||!r.answer)throw new Error('Your CV has no evidence that matches this question. Please write it yourself.');
    control.value=r.answer;remember.checked=false;if(r.letter){control.rows=16;control.style.minHeight='260px'}
    const claims=[...(r.validation?.unsupported_claims||[])];
    status.className=claims.length?'ask':'muted';
    const removedN=(r.removed_sentences||[]).length;
    status.textContent=`${r.letter?`Tailored letter (${r.word_count} words)`:'AI draft'} for “${job.title||'the saved job'}”, written only from your CV and the advert — check it and edit before filling.${removedN?` ${removedN} sentence${removedN>1?'s':''} that went beyond your CV ${removedN>1?'were':'was'} trimmed or removed.`:''}${claims.length?` Not supported by your CV: ${claims.join('; ')}`:''}`;
  }catch(e){status.className='block';status.textContent=e.message}finally{draft.disabled=false}};
  return el('div',{className:'ask-card'},[
    el('div',{textContent:q.label}),
    ...(SENSITIVITY_NOTE[q.sensitivity]?[el('span',{className:'badge',textContent:SENSITIVITY_NOTE[q.sensitivity]})]:[]),
    ...(confirmSaved?[el('div',{className:'muted',textContent:`Saved answer: ${q.suggestion}`})]:[]),
    control,
    el('label',{},[remember,' Remember for future applications']),
    el('div',{className:'row'},[go,...(draft?[draft]:[])]),status]);
}
// AI drafting is offered only when the local backend reports a configured model (key never reaches the panel).
let aiReady=false;
const refreshAiReady=()=>window.JobCopilotAPI?.get?.('/v1/ai/status').then(s=>{aiReady=!!s?.configured}).catch(()=>{});
refreshAiReady();window.addEventListener('snapply-signed-in',refreshAiReady);
function renderAsk(items,{answered=0,unsaved=0,optionalPersonal=0,optional=[]}={}){
  const list=byId('askList');list.replaceChildren();
  byId('askTitle').style.display=items.length||optional.length?'':'none';
  // Always say what happened, so a page with nothing to fill does not look like a failure.
  const parts=[];
  if(items.length)parts.push(`${items.length} question${items.length>1?'s':''} need your answer. Answers you remember are filled automatically next time.`);
  else if(answered)parts.push(`All ${answered} answered question${answered>1?'s':''} on this page are complete.${unsaved?` ${unsaved} ${unsaved>1?'are':'is'} not saved yet — press “Remember answers on this page” to reuse ${unsaved>1?'them':'it'} on future applications.`:''}`);
  if(optional.length)parts.push(`${optional.length} optional question${optional.length>1?'s are':' is'} below — answer only if ${optional.length>1?'they apply':'it applies'} to you.`);
  if(optionalPersonal)parts.push('Snapply never fills personal data such as date of birth, ethnicity or disability on its own.');
  if(!parts.length)parts.push('There are no questions on this page for you to answer.');
  byId('askState').textContent=parts.join(' ');
  for(const q of items)list.append(askCard(q));
  if(optional.length){
    const box=el('details',{},[el('summary',{textContent:`Optional questions (${optional.length})`})]);
    for(const q of optional)box.append(askCard(q));
    if(!items.length)box.open=true;
    list.append(box);
  }
}
async function renderSavedAnswers(){
  const list=byId('savedAnswersList');if(!list)return;
  let items=[];try{items=await window.JobCopilotMemory.getAnswers()}catch(_){byId('savedAnswersState').textContent='Saved answers need the local backend.';return}
  items.sort((a,b)=>String(b.confirmed_at||'').localeCompare(String(a.confirmed_at||'')));
  byId('savedAnswersState').textContent=items.length?`${items.length} saved question answer${items.length>1?'s':''}`:'No saved question answers yet.';
  list.replaceChildren(...items.map(x=>{
    const del=el('button',{textContent:'Delete'});
    del.onclick=async()=>{await window.JobCopilotMemory.deleteAnswer(x.signature);await renderSavedAnswers()};
    return el('div',{className:'saved-row'},[el('div',{},[el('div',{textContent:x.question}),el('div',{className:'muted',textContent:x.value+(x.sensitivity!=='normal'?' · confirm each time':'')})]),del]);
  }));
}
byId('rememberPage').onclick=async()=>{try{
  const page=await send('PAGE_QUESTIONS');
  const answered=(page.questions||[]).filter(q=>q.value&&q.sensitivity!=='never');
  for(const q of answered)await window.JobCopilotMemory.saveAnswer({signature:q.signature,question:q.label,value:q.value,kind:q.kind,sensitivity:q.sensitivity});
  byId('summary').textContent=`Saved ${answered.length} answer${answered.length===1?'':'s'} from this page for future applications.`;
  await renderSavedAnswers();
}catch(e){show({error:e.message})}};

// Workday My Experience: rows, dates and languages, then the required check. Never submits.
async function fillWorkdayExperiencePage(p){
  byId('summary').textContent='Filling Workday experience, education and languages…';
  const experience=await send('WORKDAY_BULK_EXPERIENCE_FILL',{profile:p});
  const dates=experience.ok||experience.employment?.length?await repairDatesInActiveTab():{ok:false,reason:'Skipped: rows were not filled.'};
  const languages=await send('WORKDAY_LANGUAGE_FILL',{profile:p});
  const required=await send('REQUIRED_FIELD_STATUS',{profile:p});
  const rowMisses=experience.required_missing||[];
  const parts=[`${experience.added_employment||0} experience`,`${experience.added_education||0} education`];
  if(languages.ok)parts.push(`${languages.rows?.length||0} languages`);
  byId('summary').textContent=experience.ok===false&&!experience.employment?.length
    ?`Your input is needed · ${experience.reason||experience.error||'Experience fill stopped'}`
    :`Filled ${parts.join(' · ')} · ${dateSummary(dates)} · confirm with Save and Continue`;
  const missing=required.missing_count+rowMisses.length;
  byId('requiredState').textContent=missing?`${missing} required fields still need attention.`:'All detected required fields are complete.';
  cards([...rowMisses.map(x=>({status:'ASK_USER',label:x,reason:'Required row field is still empty.'})),...required.items.filter(x=>x.status!=='COMPLETE')]);
  show({experience,dates,languages,required});
  byId('requiredState').scrollIntoView({behavior:'smooth',block:'start'});
}
byId('fillAllSafe').onclick=async()=>{try{
  const p=await profile();
  const page=await send('WORKDAY_STEP').catch(()=>null);
  if(page?.workday&&/my experience/.test(page.step||''))return await fillWorkdayExperiencePage(p);
  // TRAC history sections (education, employment) are table rows with their own fillers.
  const trac=await send('TRAC_SECTION').catch(()=>null);
  if(trac?.training)return renderTrainingChoice(p);
  if(trac?.references)return renderReferees();
  const section=trac?.education?await send('TRAC_EDUCATION_FILL',{profile:p}):trac?.employer?await send('TRAC_EMPLOYER_FILL',{profile:p}):null;
  const sectionNote=section?(section.ok?`${section.section==='employment'?'Employment':'Education'}: ${section.rows.length} row${section.rows.length===1?'':'s'} filled from your CV${section.remaining_records?` · ${section.remaining_records} more need adding`:''} · `:`${section.reason||'History fill stopped'} · `):'';
  await learnFields();
  const deterministic=await send('FILL_FORM',{profile:p});
  const attached=await attachEverything();
  const memory=await window.JobCopilotMemory.getAll();
  const options=await send('FILL_CONFIRMED_OPTIONS',{memory});
  let answers=await answerQuestions();
  let required=await send('REQUIRED_FIELD_STATUS',{profile:p});
  // Filling can reveal conditional questions ("If no, give details…", "Where did you see it online?").
  // Scan once more so they get answer cards in the panel too.
  const unseen=r=>(r.items||[]).some(x=>x.status!=='COMPLETE'&&!PROFILE_ASK[x.canonical]&&!answers.askedIds.has(x.id)&&!answers.askedIds.has('radio:'+x.name));
  if(unseen(required)){await new Promise(res=>setTimeout(res,400));answers=await answerQuestions();required=await send('REQUIRED_FIELD_STATUS',{profile:p})}
  byId('requiredState').textContent=required.missing_count?`${required.missing_count} required fields still need attention.`:'All detected required fields are complete.';
  const filledNow=(deterministic?.results||[]).filter(x=>x.filled).length;
  byId('summary').textContent=!section&&!answers.ask&&!answers.filled&&!filledNow&&!required.missing_count
    ?`Required questions are complete${answers.optional?` · ${answers.optional} optional below`:''} (${required.filled_required}/${required.required_total} answered).`
    :`${sectionNote}Filled · ${required.filled_required}/${required.required_total} required complete${attached.note}${answers.filled?` · ${answers.filled} from saved answers`:''}${answers.ask?` · ${answers.ask} need your answer`:''}`;
  // Questions listed under "Your input is needed" are not repeated as generic cards.
  cards(required.items.filter(x=>x.status!=='COMPLETE'&&!answers.askedIds.has(x.id)&&!answers.askedIds.has('radio:'+x.name)));
  await renderDocumentAsks();
  show({section,deterministic,options,answers:{filled:answers.filled,ask:answers.ask},required});
  // Bring what needs the user into view: their questions first, otherwise the review results.
  (answers.ask||answers.optional?byId('askTitle'):byId('askState').textContent?byId('askState'):byId('requiredState')).scrollIntoView({behavior:'smooth',block:'start'});
}catch(e){show({error:e.message})}};

byId('requiredCheck').onclick=async()=>{try{
  const d=await send('REQUIRED_FIELD_STATUS',{profile:await profile()});
  byId('requiredState').textContent=d.missing_count?`${d.missing_count} required fields need attention.`:'All detected required fields are complete.';
  byId('summary').textContent=`${d.ats} · ${d.filled_required}/${d.required_total} required complete`;
  cards(d.items.filter(x=>x.status!=='COMPLETE'));
  show(d);
}catch(e){show({error:e.message})}};

byId('guideMissing').onclick=async()=>{try{
  const d=await send('GUIDE_NEXT_MISSING',{profile:await profile()});
  if(d.ok){byId('requiredState').textContent=`Guided to: ${d.label}`;byId('summary').textContent=`Needs attention · ${d.status} · ${d.canonical||'unknown'}`}
  else{byId('requiredState').textContent=d.reason||'No missing required field found.'}
  show(d);
}catch(e){show({error:e.message})}};
byId('repeatPlan').onclick=async()=>{try{show(await send('REPEATED_BLOCK_PLAN',{profile:await profile()}))}catch(e){show({error:e.message})}};
byId('repeatFill').onclick=async()=>{try{const r=await send('FILL_REPEATED_SAFE',{profile:await profile()});show(r);await window.JobCopilotSessionAudit?.log?.('REPEATED_FILL',{url:(await active()).url,ats:(await send('ATS_DETECT')).ats,result_count:(r.results||[]).length})}catch(e){show({error:e.message})}};
byId('saveMemory').onclick=async()=>{try{
  const key=byId('memoryKey').value,val=byId('memoryValue').value.trim();
  if(!val)throw new Error('Enter a confirmed answer.');
  await window.JobCopilotMemory.set(key,val);
  if(byId('memoryStatus')) byId('memoryStatus').textContent=`Saved: ${key} = ${val}`;
  await refreshProfileState();
  // Immediately rebuild the plan so the user can see that memory was applied.
  const d=await send('REVIEW_PLAN',{profile:await profile()});
  const c={HIGH:0,REVIEW:0,ASK_USER:0,BLOCKED:0};d.items.forEach(x=>c[x.decision]=(c[x.decision]||0)+1);
  byId('summary').textContent=`Saved ${key} · ${d.ats} · HIGH ${c.HIGH} · REVIEW ${c.REVIEW} · ASK ${c.ASK_USER}`;
  cards(d.items.filter(x=>x.decision!=='HIGH'));
  show({saved:key,value:val,plan:d});
}catch(e){show({error:e.message})}};

function queueMessage(text){byId('queueActionStatus').textContent=text}
async function renderQueue(){
  const q=await window.JobCopilotQueue.load();const n=q.items.length;const x=q.items[q.cursor];
  byId('queuePos').textContent=n?`${q.cursor+1}/${n}`:'0/0';
  queueMessage('');
  byId('copyQueueAnswer').disabled=!x;
  byId('saveQueueEdit').disabled=!x;
  byId('insertQueue').disabled=!x||x.source==='manual'||!x.insert_allowed;
  byId('saveQueueEdit').textContent=x?.source==='manual'?'Save answer':'Save + Revalidate';
  if(!x){byId('queueQuestion').textContent='No answer queue yet.';byId('queueAnswer').value='';byId('queueEvidence').textContent='';return}
  byId('queueQuestion').textContent=`${x.state||x.status} · ${x.question}`;
  byId('queueAnswer').value=x.user_answer??x.answer??'';
  const ev=(x.allowed_evidence||[]).slice(0,4);
  byId('queueEvidence').textContent=x.source==='manual'
    ?'Your input is needed. Write your answer and use Copy. This question is not linked to a form field.'
    :ev.length?`Evidence: ${ev.join(' | ')}`:(x.validation?.reason||'No evidence available');
}
byId('addManualQuestion').onclick=async()=>{try{
  const question=byId('manualQuestion').value.trim();
  if(!question)throw new Error('Paste a question first.');
  if(question.length>10000)throw new Error('The question must be 10,000 characters or fewer.');
  await window.JobCopilotQueue.append({question,source:'manual',question_index:null,status:'ASK_USER',answer:'',allowed_evidence:[],insert_allowed:false});
  byId('manualQuestion').value='';await renderQueue();byId('queueAnswer').focus();
  queueMessage('Question added. Write your answer below, then click Copy.');
}catch(e){queueMessage(e.message)}};
byId('copyQueueAnswer').onclick=async()=>{try{
  const answer=byId('queueAnswer').value.trim();
  if(!answer)throw new Error('Write an answer before copying.');
  if(!navigator.clipboard?.writeText)throw new Error('Clipboard access is unavailable. Select the answer and copy it manually.');
  await navigator.clipboard.writeText(answer);
  queueMessage('Copied. You can now paste the answer into the application.');
}catch(e){queueMessage(`Could not copy: ${e.message}`)}};
byId('queueAnswer').oninput=()=>{
  byId('insertQueue').disabled=true;
  queueMessage('Answer changed. Use Save or Copy. Revalidate the edited answer before inserting it.');
};
byId('buildQueue').onclick=async()=>{try{const q=await send('EVIDENCE_QUESTIONS');if(!q.questions?.length)throw new Error('No evidence-text questions detected.');const job=await currentJob();if(!job)throw new Error('Analyze job requirements first.');const r=await window.JobCopilotAPI.post('/v1/answers/batch',{questions:q.questions,profile:await profile(),job});await window.JobCopilotQueue.create(r.items);await renderQueue();byId('summary').textContent=`Generated queue for ${r.count} questions`;show(r)}catch(e){show({error:e.message})}};
byId('prevQ').onclick=async()=>{const q=await window.JobCopilotQueue.load();await window.JobCopilotQueue.setCursor(q.cursor-1);await renderQueue()};
byId('nextQ').onclick=async()=>{const q=await window.JobCopilotQueue.load();await window.JobCopilotQueue.setCursor(q.cursor+1);await renderQueue()};
byId('saveQueueEdit').onclick=async()=>{try{
  const q=await window.JobCopilotQueue.load();const x=q.items[q.cursor];if(!x)throw new Error('No queue item.');
  const answer=byId('queueAnswer').value.trim();if(!answer)throw new Error('Answer cannot be empty.');
  if(x.source==='manual'){
    await window.JobCopilotQueue.update(q.cursor,{user_answer:answer,state:'USER_PROVIDED',insert_allowed:false});
    await renderQueue();queueMessage('Answer saved for this question. It has not been added to Application Memory.');return;
  }
  const rv=await window.JobCopilotAPI.post('/v1/answers/revalidate',{answer,allowed_evidence:x.allowed_evidence||[],character_limit:x.character_limit||null});
  await window.JobCopilotQueue.update(q.cursor,{user_answer:answer,state:rv.insert_allowed?'REVALIDATED':'REVIEW_REQUIRED',validation:rv.validation,insert_allowed:rv.insert_allowed});
  await renderQueue();queueMessage(rv.insert_allowed?'Answer validated. You can now insert it into the form.':'Your input is needed: this answer could not be validated.');
  show({saved:true,revalidated:true,insert_allowed:rv.insert_allowed,validation:rv.validation});
}catch(e){queueMessage(e.message);show({error:e.message})}};
byId('insertQueue').onclick=async()=>{try{
  const q=await window.JobCopilotQueue.load();const x=q.items[q.cursor];if(!x)throw new Error('No queue item.');
  if(x.source==='manual')throw new Error('This question is not linked to a form field. Use Copy instead.');
  const answer=byId('queueAnswer').value.trim();if(!answer)throw new Error('Answer cannot be empty.');
  if(!x.insert_allowed||answer!==String(x.user_answer??x.answer??'').trim())throw new Error('Answer changed or has not been validated. Use Save + Revalidate first.');
  const d=await send('INSERT_QUEUE_ANSWER',{question_index:x.question_index,question:x.question,answer});
  if(d.ok)await window.JobCopilotQueue.update(q.cursor,{user_answer:answer,state:'INSERTED'});
  await renderQueue();queueMessage(d.ok?'Filled. Review the answer in the application.':`Not supported: ${d.reason||'You can copy and paste the answer instead.'}`);show(d);
}catch(e){queueMessage(e.message);show({error:e.message})}};

let unresolvedCursor=0;
async function renderUnresolved(){
  const p=await profile();const items=p.unresolved||[];
  if(!items.length){byId('unresolvedState').textContent='No unresolved CV items.';byId('unresolvedEditor').style.display='none';return}
  unresolvedCursor=Math.max(0,Math.min(unresolvedCursor,items.length-1));const x=items[unresolvedCursor];
  byId('unresolvedState').textContent=`${unresolvedCursor+1}/${items.length} · ${x.field} · source: ${x.source_value||'n/a'}`;
  byId('unresolvedReason').textContent=x.reason||'Requires confirmation.';byId('unresolvedValue').value=x.source_value||'';byId('unresolvedEditor').style.display='block';
}
byId('nextUnresolved').onclick=async()=>{const p=await profile();if((p.unresolved||[]).length){unresolvedCursor=(unresolvedCursor+1)%(p.unresolved.length);await renderUnresolved()}};
byId('resolveUnresolved').onclick=async()=>{try{const x=await chrome.storage.local.get('masterProfile');const p=x.masterProfile||{};const items=p.unresolved||[];if(!items.length)throw new Error('No unresolved item.');const item=items[Math.min(unresolvedCursor,items.length-1)];const value=byId('unresolvedValue').value.trim();if(!value)throw new Error('Enter a confirmed value.');const r=await window.JobCopilotAPI.post('/v1/profile/resolve',{profile:p,unresolved_id:item.id||`unresolved-${unresolvedCursor}`,value});await chrome.storage.local.set({masterProfile:r.profile});unresolvedCursor=0;await refreshProfileState();show({resolved:true,field:item.field,remaining:r.unresolved.length})}catch(e){show({error:e.message})}};


async function refreshMemoryStatus(){
  try{
    const all=await window.JobCopilotMemory?.getAll?.();
    const entries=Object.entries(all||{});
    if(byId('memoryStatus')) byId('memoryStatus').textContent=entries.length
      ? `Saved memory: ${entries.map(([k,v])=>`${k}=${v?.value??''}`).join(' · ')}`
      : 'No saved Application Memory yet.';
  }catch(_){ if(byId('memoryStatus')) byId('memoryStatus').textContent='Unable to read saved memory.'; }
}

(async()=>{await window.JobCopilotMemory?.syncFromBackend?.();await refreshProfileState();await renderQueue();await refreshSessionState();await refreshMemoryStatus();})().catch(()=>{});

async function refreshSessionState(){
  const s=await window.JobCopilotSessionAudit?.get?.();
  byId('sessionState').textContent=s?`${s.id} · ${s.ats} · ${s.events.length} events`:'No active application session.';
}
byId('readiness').onclick=async()=>{try{const d=await send('BROWSER_READINESS');byId('summary').textContent=`${d.ats} · ${d.field_count} fields · ${d.evidence_question_count} evidence questions`;cards((d.notes||[]).map((x,i)=>({decision:i?'INFO':'READY',label:x})));show(d);await window.JobCopilotSessionAudit?.log?.('READINESS_CHECK',{url:d.url,ats:d.ats,field_count:d.field_count,evidence_question_count:d.evidence_question_count,repeated_root_count:d.repeated_root_count});await refreshSessionState()}catch(e){show({error:e.message})}};
byId('startSession').onclick=async()=>{try{const d=await send('BROWSER_READINESS');const job=await currentJob();const s=await window.JobCopilotSessionAudit.start({url:d.url,ats:d.ats,job_title:job?.title||'',company:job?.company||''});await window.JobCopilotSessionAudit.log('SESSION_STARTED',{url:d.url,ats:d.ats});await refreshSessionState();show(s)}catch(e){show({error:e.message})}};
byId('showAudit').onclick=async()=>{const s=await window.JobCopilotSessionAudit.get();show(s||{message:'No active session'})};
byId('clearAudit').onclick=async()=>{await window.JobCopilotSessionAudit.clear();await refreshSessionState();show({cleared:true})};

// V0.14 live browser fixture capture. Generates a local JSON download only after the user clicks.
function safeFilenamePart(s){return String(s||'ats').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'ats'}
function downloadJSON(obj,name){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
byId('captureFixture').onclick=async()=>{try{
  const d=await send('CAPTURE_LIVE_FIXTURE');if(d.error)throw new Error(d.error);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');const name=`job-copilot-fixture-${safeFilenamePart(d.page?.ats)}-${stamp}.json`;
  downloadJSON(d,name);
  byId('summary').textContent=`Fixture captured · ${d.page?.ats||'GENERIC'} · ${d.counts?.semantic_fields??d.counts?.fields??0} semantic fields · no values captured`;
  show(d);
  await window.JobCopilotSessionAudit?.log?.('LIVE_FIXTURE_CAPTURE',{ats:d.page?.ats,url_origin:d.page?.url_origin,url_path:d.page?.url_path,field_count:d.counts?.fields,privacy:d.privacy});
  await refreshSessionState();
}catch(e){show({error:e.message})}};

if(byId('fillConfirmedOptions')) byId('fillConfirmedOptions').onclick=async()=>{try{
  const memory=await window.JobCopilotMemory.getAll();
  const r=await send('FILL_CONFIRMED_OPTIONS',{memory});
  byId('summary').textContent=`Confirmed options · filled ${r.filled||0} · review ${r.review_required||0}`;
  show(r);
}catch(e){show({error:e.message})}};

refreshProfileState().catch(()=>{});


if(byId('saveConfirmedFormValues')) byId('saveConfirmedFormValues').onclick=async()=>{try{
  const d=await send('CAPTURE_CONFIRMED_FORM_VALUES');
  const entries=Object.entries(d.values||{});
  if(!entries.length) throw new Error('No reusable confirmed form values detected on this page.');
  for(const [key,value] of entries) await window.JobCopilotMemory.set(key,value);
  await refreshMemoryStatus();
  byId('summary').textContent=`Saved ${entries.length} reusable form values to Application Memory`;
  show({saved:Object.fromEntries(entries),policy:d.excluded_policy});
}catch(e){show({error:e.message})}};

if(byId('workdayBulkFill')) byId('workdayBulkFill').onclick=async()=>{try{
  byId('summary').textContent='Workday bulk fill running…';
  const r=await send('WORKDAY_BULK_EXPERIENCE_FILL',{profile:await profile()});
  byId('summary').textContent=r.ok?`Workday bulk fill · ${r.added_employment||0} experience · ${r.added_education||0} education${r.stopped?' · stopped for review':''}`:(r.reason||r.error||'Bulk fill failed');
  show(r);
}catch(e){show({error:e.message})}};
function dateSummary(d){return d.dates?(d.ok?`${d.dates} dates verified`:`${d.verified||0}/${d.dates} dates verified · rest need review`):'dates need review'}
async function repairDatesInActiveTab(){return runInPage('verifyWorkdayDates',[])}
if(byId('workdayRepairDates')) byId('workdayRepairDates').onclick=async()=>{try{
  byId('summary').textContent='Workday date repair running…';
  const r=await repairDatesInActiveTab();
  byId('summary').textContent=r.dates?`${dateSummary(r)} · verify with Workday Save and Continue`:(r.reason||'Some dates need review');
  show(r);
}catch(e){show({error:e.message})}};
byId('workdayLanguagePlan').onclick=async()=>{try{
  const r=await send('WORKDAY_LANGUAGE_PLAN',{profile:await profile()});
  byId('summary').textContent=r.ok?`Workday languages · ${r.records.length} verified · ${r.review_required.length} need levels`:(r.reason||'Workday language form unavailable');
  show(r);
}catch(e){show({error:e.message})}};
byId('workdayLanguageFill').onclick=async()=>{try{
  byId('summary').textContent='Workday language fill running…';
  const r=await send('WORKDAY_LANGUAGE_FILL',{profile:await profile()});
  byId('summary').textContent=r.ok?`Workday languages · ${r.rows.length} rows · ${r.review_required.length} need levels`:(r.reason||'Workday language fill stopped');
  show(r);
}catch(e){show({error:e.message})}};

byId('tracEducationPlan').onclick=async()=>{try{
  const r=await send('TRAC_EDUCATION_PLAN',{profile:await profile()});
  byId('summary').textContent=r.ok?`TRAC education · ${r.records.length} verified records · ${r.existing_rows.length} current rows`:(r.reason||'TRAC education form unavailable');
  show(r);
}catch(e){show({error:e.message})}};
byId('tracEducationFill').onclick=async()=>{try{
  byId('summary').textContent='TRAC education fill running…';
  const r=await send('TRAC_EDUCATION_FILL',{profile:await profile()});
  byId('summary').textContent=r.ok?`TRAC education · ${r.rows.length} rows prepared · ${r.remaining_records} need manual Add`:(r.reason||'TRAC education fill stopped');
  show(r);
}catch(e){show({error:e.message})}};
byId('tracEmployerPlan').onclick=async()=>{try{
  const r=await send('TRAC_EMPLOYER_PLAN',{profile:await profile()});
  byId('summary').textContent=r.ok?`TRAC employment · ${r.records.length} verified records · ${r.existing_rows.length} current rows`:(r.reason||'TRAC employer form unavailable');
  show(r);
}catch(e){show({error:e.message})}};
byId('tracEmployerFill').onclick=async()=>{try{
  byId('summary').textContent='TRAC employer fill running…';
  const r=await send('TRAC_EMPLOYER_FILL',{profile:await profile()});
  byId('summary').textContent=r.ok?`TRAC employment · ${r.rows.length} rows prepared for review`:(r.reason||'TRAC employer fill stopped');
  show(r);
}catch(e){show({error:e.message})}};

async function attachReviewedCoverLetter(draft){
  const activePage=await active();
  if(activePage.url!==draft?.job?.url)throw new Error('The active job page changed. Generate a letter for this page.');
  const body=byId('coverLetterBody').value.trim();
  if(!body)throw new Error('Review the cover letter body before attaching.');
  const field=await send('COVER_LETTER_UPLOAD_FORMATS',{expected_url:draft.job.url});
  if(!field.ok){byId('coverLetterState').textContent=field.reason||'No compatible cover letter upload field.';show(field);return field;}
  const format=field.formats.includes('pdf')?'pdf':'docx';
  const rendered=await window.JobCopilotAPI.post('/v1/cover-letter/render',{job:draft.job,body,format,own:!!draft.own});
  if(!rendered.ok){
    byId('coverLetterState').textContent=rendered.reason||'Cover letter requires review.';
    show(rendered);return rendered;
  }
  const attached=await send('ATTACH_COVER_LETTER',{document:{
    expected_url:draft.job.url,name:rendered.name,mime_type:rendered.mime_type,base64:rendered.base64
  }});
  const warn=(rendered.validation?.warnings||[]).length;
  byId('coverLetterState').textContent=attached.ok?`Attached ${attached.name}; review it on the site before submitting.${warn?` ${warn} sentence${warn>1?'s are':' is'} your own wording, not taken from your CV — make sure ${warn>1?'they are':'it is'} accurate.`:''}`:(attached.reason||attached.error||'Attachment needs review.');
  show({rendered:{ok:rendered.ok,name:rendered.name,validation:rendered.validation},attached});
  return attached;
}

// The job this page belongs to: analysed here, or the saved posting for this application.
async function resolveCurrentJob(){
  const capture=await send('EXTRACT_JOB');
  if(capture.error){
    const saved=await currentJob();
    if(!savedPostingForApplication(saved,capture.url))throw new Error('Open this job posting and click Read job description once, then return to the application.');
    return {capture,job:{...saved,url:capture.url,posting_url:saved.url}};
  }
  return {capture,job:await window.JobCopilotAPI.post('/v1/job/analyze',capture)};
}
async function generateCoverLetter(transferable=false){try{
  byId('coverLetterState').textContent=transferable?'Writing from the transferable experience in your CV…':'Analyzing the current job and checking verified CV evidence…';
  const {capture,job}=await resolveCurrentJob();
  if(!job.requirement_count)throw new Error('No job requirements found on this page. Open the job description first.');
  const length=byId('coverLetterLength')?.value||'standard';
  const draft=await window.JobCopilotAPI.post('/v1/cover-letter/generate',{job,transferable,length});
  if(draft.status!=='REVIEW'){
    byId('coverLetterBody').value='';
    byId('coverLetterState').replaceChildren((draft.reason||'Could not generate a cover letter.')+' You can still write your own letter in the box and press Validate + Attach.');
    // Job outside the CV's field: offer an honest letter from transferable experience, on request only.
    if(draft.can_draft_transferable){
      const b=el('button',{textContent:'Draft anyway from my general experience'});
      b.onclick=()=>generateCoverLetter(true);
      byId('coverLetterState').append(el('div',{},[b]));
    }
    show(draft);return;
  }
  // Transferable drafts use the whole CV as evidence, so they are checked like the user's own letter.
  await chrome.storage.local.set({coverLetterDraft:{job:draft.job,body:draft.body,own:draft.mode==='transferable'},...(capture.error?{}:{currentJob:job})});
  byId('coverLetterBody').value=draft.body;
  const removedN=(draft.removed_sentences||[]).length,missing=(draft.unsupported_requirements||[]).length;
  byId('coverLetterState').textContent=(draft.attachment_ready?'Draft ready, written only from your CV. Review or edit it, then click Validate + Attach.':'Draft needs review before it can be attached.')
    +(removedN?` ${removedN} AI sentence${removedN>1?'s':''} went beyond your CV and ${removedN>1?'were':'was'} trimmed or removed.`:'')
    +(missing?` Not covered (no CV evidence): ${draft.unsupported_requirements.slice(0,3).join('; ')}${missing>3?'…':''}.`:'');
  if(draft.mode==='transferable')byId('coverLetterState').textContent='This job is outside your CV\'s field, so the letter describes transferable experience only — nothing your CV does not show. '+byId('coverLetterState').textContent.replace(/ Not covered \(no CV evidence\):.*$/,'');
  show({status:draft.status,mode:draft.mode,validation:draft.validation,unsupported_requirements:draft.unsupported_requirements,removed_sentences:draft.removed_sentences});
}catch(e){byId('coverLetterState').textContent=e.message;show({error:e.message})}}
byId('generateCoverLetter').onclick=()=>generateCoverLetter(false);

byId('attachCoverLetter').onclick=async()=>{try{
  const {coverLetterDraft}=await chrome.storage.local.get('coverLetterDraft');
  const body=byId('coverLetterBody').value.trim();
  const pageUrl=(await active()).url;
  // A generated draft for another job is never attached here (the page changed). With no draft for
  // this page, the text in the box is the user's own letter for this job.
  const ownLetter=body&&(!coverLetterDraft||(coverLetterDraft.job?.url!==pageUrl&&body!==String(coverLetterDraft.body||'').trim()));
  if(ownLetter){
    byId('coverLetterState').textContent='Checking your letter against your CV…';
    const {job}=await resolveCurrentJob();
    await attachReviewedCoverLetter({job:{title:job.title,company:job.company,url:pageUrl,requirements:job.requirements},own:true});
    return;
  }
  if(!coverLetterDraft)throw new Error('Write your cover letter in the box or generate one for this job first.');
  await attachReviewedCoverLetter(coverLetterDraft);
}catch(e){byId('coverLetterState').textContent=e.message;show({error:e.message})}};

(async()=>{
  const {coverLetterDraft}=await chrome.storage.local.get('coverLetterDraft');
  if(coverLetterDraft?.job?.url===(await active()).url){
    byId('coverLetterBody').value=coverLetterDraft.body||'';
    byId('coverLetterState').textContent='Draft restored for this job. Review before attaching.';
  }
})().catch(()=>{});

// Opening status: say what was detected instead of the generic placeholder.
send('ATS_DETECT').then(d=>{
  const s=byId('summary');
  if(!d?.ats||d.ats==='GENERIC'||!/^Open an application page/.test(s.textContent))return;
  const name=d.ats.charAt(0)+d.ats.slice(1).toLowerCase();
  s.textContent=`${name} application detected · press Fill this page to start.`;
}).catch(()=>{});

// Developer overlay on pages is off unless switched on here.
chrome.storage.local.get('showDebugOverlay').then(x=>{byId('debugOverlayToggle').checked=!!x.showDebugOverlay}).catch(()=>{});
byId('debugOverlayToggle').onchange=e=>chrome.storage.local.set({showDebugOverlay:e.target.checked});

// Monthly application allowance (hosted service only): every fill action first registers the
// current application; all pages of one application count once. Local mode is never limited.
async function allowApplication(){
  try{
    if(!await window.JobCopilotAPI.isCloud())return true;
    const url=(await active())?.url||'';
    if(!/^https?:/.test(url))return true;
    await window.JobCopilotAPI.post('/v1/usage/application',{url});
    window.SnapplyAccount?.render();
    return true;
  }catch(e){
    const s=byId('summary');
    s.textContent=e.status===402?`${e.message} Open the Snapply account card above to upgrade.`:`Could not check your plan: ${e.message}`;
    s.scrollIntoView({behavior:'smooth',block:'center'});
    return false;
  }
}
['fillAllSafe','fill','repeatFill','workdayBulkFill','workdayLanguageFill','tracEducationFill','tracEmployerFill'].forEach(id=>{
  const b=byId(id);if(!b||typeof b.onclick!=='function')return;
  const run=b.onclick;b.onclick=async e=>{if(await allowApplication())return run.call(b,e)};
});

// Saved CV and the document library go into empty upload areas they clearly match.
async function attachEverything(){
  const names=[];
  try{
    const slots=(await send('DOCUMENT_SLOTS'))?.slots||[];
    if(slots.includes('cv')){
      const cv=await window.JobCopilotSavedCV.get().catch(()=>null);
      if(cv){const payload=await window.JobCopilotSavedCV.getPayload();const d=payload?await send('ATTACH_SAVED_CV',{savedCV:payload}):null;if(d?.ok&&!d.already_uploaded)names.push('CV')}
    }
    const docs=await window.SnapplyDocumentLibrary.list();
    if(docs.length&&slots.some(c=>c&&c!=='cv'&&c!=='cover_letter')){
      const r=await send('ATTACH_DOCUMENTS',{documents:docs});
      (r?.results||[]).filter(x=>x.ok).forEach(x=>names.push(...x.names));
    }
  }catch(_){/* attaching is a convenience; the fill result still stands */}
  return {names,note:names.length?` · attached ${names.join(', ')}`:''};
}
async function renderDocuments(){
  const box=byId('docList');if(!box)return;
  const docs=await window.SnapplyDocumentLibrary.list();
  box.replaceChildren(...(docs.length?docs.map(d=>{
    const rm=el('button',{textContent:'Remove'});rm.onclick=async()=>{await window.SnapplyDocumentLibrary.remove(d.id);renderDocuments()};
    return el('div',{className:'row'},[el('span',{textContent:`${window.SnapplyDocumentLibrary.LABELS[d.category]} · ${d.name} (${Math.max(1,Math.round(d.size/1024))} KB)`}),rm]);
  }):[el('div',{className:'muted',textContent:'No documents yet.'})]));
}
byId('docAdd')&&(byId('docAdd').onclick=async()=>{
  const st=byId('docState');
  try{await window.SnapplyDocumentLibrary.add(byId('docFile').files?.[0],byId('docCategory').value);byId('docFile').value='';st.textContent='Saved. It will be attached wherever an application asks for this kind of document.';renderDocuments()}
  catch(e){st.textContent=e.message}
});
renderDocuments();

// Upload areas on this page with no matching saved document: offer to add one here, once.
async function renderDocumentAsks(){
  const slots=(await send('DOCUMENT_SLOTS').catch(()=>null))?.details||[];
  const docs=await window.SnapplyDocumentLibrary.list();
  const L=window.SnapplyDocumentLibrary.LABELS;
  const root=byId('cards');
  // One card per kind of document, titled with the page's own heading(s).
  const byKind={};
  for(const slot of slots){
    if(slot.filled||!L[slot.category]||docs.some(d=>d.category===slot.category))continue;
    (byKind[slot.category]=byKind[slot.category]||[]).push(slot.label||L[slot.category]);
  }
  for(const [category,labels] of Object.entries(byKind)){
    const slot={category,label:[...new Set(labels)].join(' · ')};
    const file=el('input',{type:'file'});
    const st=el('div',{className:'muted',textContent:`Optional · add your ${L[slot.category].toLowerCase()} once and Snapply attaches it to every application that asks for it.`});
    const go=el('button',{textContent:'Add & attach'});
    go.onclick=async()=>{try{
      go.disabled=true;await window.SnapplyDocumentLibrary.add(file.files?.[0],slot.category);
      const r=await send('ATTACH_DOCUMENTS',{documents:await window.SnapplyDocumentLibrary.list()});
      const ok=(r?.results||[]).some(x=>x.ok&&x.category===slot.category);
      st.className=ok?'done':'block';st.textContent=ok?'Attached · saved in My documents':'Saved in My documents, but this upload area did not accept it — upload it on the page.';
      renderDocuments();
    }catch(e){go.disabled=false;st.className='block';st.textContent=e.message}};
    root.appendChild(el('div',{className:'ask-card'},[el('b',{textContent:slot.label||L[slot.category]}),file,el('div',{className:'row'},[go]),st]));
  }
}

// Unfamiliar fields: ask the AI field map once per site (form wording only), cache the answer here.
async function learnFields(){
  try{
    const url=(await active())?.url||'';if(!/^https?:/.test(url))return;
    const host=new URL(url).hostname,key='fieldHints:'+host;
    const hints=(await chrome.storage.local.get(key))[key]||{};
    const unknown=(await send('UNKNOWN_FIELDS'))?.fields||[];
    const todo=unknown.filter(f=>!(f.sig in hints));
    if(todo.length){
      const r=await window.JobCopilotAPI.post('/v1/fields/classify',{host,fields:todo.slice(0,60)});
      Object.assign(hints,r.hints||{});await chrome.storage.local.set({[key]:hints});
    }
    if(Object.keys(hints).length)await send('FIELD_HINTS',{hints});
  }catch(_){/* the rules still fill what they recognise */}
}
// "This page didn't fill correctly": send the form's structure (no values) so it can be fixed.
byId('reportPage')&&(byId('reportPage').onclick=()=>{
  const box=byId('reportBox');box.hidden=!box.hidden;
});
byId('reportSend')&&(byId('reportSend').onclick=async()=>{
  const st=byId('reportState');
  try{
    byId('reportSend').disabled=true;st.textContent='Sending…';
    const capture=await send('CAPTURE_LIVE_FIXTURE');if(capture?.error)throw new Error(capture.error);
    const fill=await send('REVIEW_PLAN',{profile:{}}).catch(()=>({}));
    const r=await window.JobCopilotAPI.post('/v1/reports',{capture,note:byId('reportNote').value.trim().slice(0,1000),
      fill:{ats:fill?.ats,keys:(fill?.items||[]).map(x=>[x.label?.slice(0,80),x.canonical]).slice(0,120)},version:chrome.runtime.getManifest().version});
    st.textContent='Thank you — sent. We use it to make Snapply fill this site properly.';byId('reportNote').value='';
  }catch(e){st.textContent=e.message;byId('reportSend').disabled=false}
});
