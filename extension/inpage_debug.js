// V0.26.20 - In-page privacy-safe ATS debug capture + live TRAC form structure.
// Workday dropdowns/portals disappear when the extension popup is opened.
// This observer captures dynamic option/menu STRUCTURE automatically while it is visible.
// It never records input values, passwords, uploaded file names, or free-text answers.
(function(){
  if(window.__jobCopilotInPageDebugInstalled) return;
  window.__jobCopilotInPageDebugInstalled=true;

  const MAX_SNAPS=20;
  const MAX_SECTION_SNAPS=40;
  const snapshots=[];
  const sectionSnapshots=[];
  const sectionSeen=new Set();
  const sectionStorageKey=`job-copilot-trac-forms:${location.origin}${location.pathname}`;
  const SECTION_TTL_MS=24*60*60*1000;
  let storageWrite=Promise.resolve();
  const seen=new Set();
  let staticSnapshot=null;
  let panel=null, countEl=null, statusEl=null;
  let staticTimer=null;

  const clean=(v,max=240)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,max);
  const visible=el=>{
    if(!el||!(el instanceof Element)) return false;
    const s=getComputedStyle(el);
    return s.display!=='none'&&s.visibility!=='hidden'&&el.getClientRects().length>0;
  };
  const attr=(el,name)=>clean(el.getAttribute?.(name),180)||null;
  const safeClass=el=>clean(typeof el.className==='string'?el.className:'',220)||null;

  function sectionFingerprint(s){
    return JSON.stringify({
      headings:s.headings,
      fields:s.fields.map(f=>[f.tag,f.type,f.name,f.id,f.label,f.options]),
      controls:s.controls.map(c=>[c.text,c.id])
    });
  }
  function rememberSection(s){
    const fingerprint=sectionFingerprint(s);
    if(sectionSeen.has(fingerprint)) return false;
    sectionSeen.add(fingerprint);
    sectionSnapshots.push(s);
    if(sectionSnapshots.length>MAX_SECTION_SNAPS){
      sectionSnapshots.shift();
      sectionSeen.clear();
      for(const old of sectionSnapshots) sectionSeen.add(sectionFingerprint(old));
    }
    return true;
  }
  function persistSections(){
    if(typeof chrome==='undefined'||!chrome.storage?.local) return;
    const data={saved_at:Date.now(),section_captures:sectionSnapshots.slice()};
    storageWrite=storageWrite.catch(()=>{}).then(()=>chrome.storage.local.set({[sectionStorageKey]:data}));
    storageWrite.then(()=>updatePanel(`${sectionSnapshots.length} TRAC form structures saved across page reloads`))
      .catch(e=>updatePanel(`Form capture storage error: ${e.message}`));
  }
  async function restoreSections(){
    if(window.JobCopilotAdapterRegistry?.detect?.()!=='TRAC'||typeof chrome==='undefined'||!chrome.storage?.local) return;
    try{
      const record=(await chrome.storage.local.get(sectionStorageKey))[sectionStorageKey];
      if(record&&Date.now()-record.saved_at<SECTION_TTL_MS&&Array.isArray(record.section_captures)){
        const current=sectionSnapshots.splice(0);
        sectionSeen.clear();
        for(const s of [...record.section_captures,...current]){
          if(s?.fields&&s?.headings&&s?.controls) rememberSection(s);
        }
        persistSections();
      }
    }catch(e){updatePanel(`Form capture restore error: ${e.message}`)}
  }

  function nodeMeta(el){
    return {
      tag:el.tagName?.toLowerCase()||null,
      role:attr(el,'role'),
      text:clean(el.innerText||el.textContent,260),
      id:clean(el.id,180)||null,
      class:safeClass(el),
      data_automation_id:attr(el,'data-automation-id'),
      data_testid:attr(el,'data-testid'),
      aria_label:attr(el,'aria-label'),
      aria_selected:attr(el,'aria-selected'),
      aria_expanded:attr(el,'aria-expanded'),
      aria_controls:attr(el,'aria-controls'),
      aria_activedescendant:attr(el,'aria-activedescendant')
    };
  }

  function parentChain(el){
    const out=[]; let n=el?.parentElement;
    for(let i=0;n&&i<5;i++,n=n.parentElement){
      if(n.id==='job-copilot-debug-panel') break;
      out.push(nodeMeta(n));
    }
    return out;
  }


  function labelForField(el){
    const bits=[];
    if(el.id){
      try{const l=document.querySelector(`label[for="${CSS.escape(el.id)}"]`);if(l)bits.push(l.innerText)}catch(_){ }
    }
    const wrapped=el.closest?.('label'); if(wrapped) bits.push(wrapped.innerText);
    ['aria-label','placeholder','name','id'].forEach(a=>{const v=el.getAttribute?.(a);if(v)bits.push(v)});
    const group=el.closest?.('fieldset,.form-group,.field,.question,.control-group,.row,.form-row,[class*="question"],[class*="field"]');
    if(group){
      const h=group.querySelector?.('legend,.label,.question-text,h1,h2,h3,h4,h5,h6');
      if(h) bits.push(h.innerText);
    }
    return clean([...new Set(bits)].join(' '),260);
  }

  function safeSelectOptions(el){
    if(el.tagName!=='SELECT') return [];
    return [...el.options].slice(0,100).map(o=>({text:clean(o.textContent,140),disabled:!!o.disabled}));
  }

  function staticFormStructure(){
    const ats=window.JobCopilotAdapterRegistry?.detect?.()||'UNKNOWN';
    const fields=[...document.querySelectorAll('input,select,textarea')]
      .filter(el=>!el.closest('#job-copilot-debug-panel'))
      .slice(0,300)
      .map((el,index)=>({
        index,
        tag:el.tagName.toLowerCase(),
        type:clean(el.getAttribute('type')||'',40)||null,
        name:clean(el.getAttribute('name')||'',180)||null,
        id:clean(el.id||'',180)||null,
        label:labelForField(el)||null,
        required:!!(el.required||el.getAttribute('aria-required')==='true'),
        disabled:!!el.disabled,
        readonly:!!el.readOnly,
        role:attr(el,'role'),
        autocomplete:attr(el,'autocomplete'),
        aria_label:attr(el,'aria-label'),
        aria_describedby:attr(el,'aria-describedby'),
        options:safeSelectOptions(el),
        privacy:{value_captured:false,file_name_captured:false}
      }));
    const controls=[...document.querySelectorAll('button,a,[role="button"]')]
      .filter(el=>!el.closest('#job-copilot-debug-panel'))
      .filter(visible)
      .slice(0,180)
      .map((el,index)=>({
        index,
        tag:el.tagName.toLowerCase(),
        text:clean(el.innerText||el.getAttribute('aria-label')||el.getAttribute('title'),180),
        id:clean(el.id||'',160)||null,
        role:attr(el,'role'),
        type:attr(el,'type'),
        aria_label:attr(el,'aria-label')
      })).filter(x=>x.text||x.aria_label);
    const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,legend')]
      .filter(visible).slice(0,120).map(el=>clean(el.innerText,200)).filter(Boolean);
    const forms=[...document.querySelectorAll('form')].slice(0,30).map((form,index)=>({
      index,
      id:clean(form.id,160)||null,
      name:attr(form,'name'),
      method:clean(form.getAttribute('method')||'GET',20).toUpperCase(),
      action_path:(()=>{try{return new URL(form.getAttribute('action')||location.href,location.href).pathname}catch(_){return null}})(),
      field_count:form.querySelectorAll('input,select,textarea').length
    }));
    return {
      captured_at:new Date().toISOString(),
      page:{origin:location.origin,path:location.pathname,title:clean(document.title,200),ats},
      headings,forms,fields,controls,
      counts:{forms:forms.length,fields:fields.length,controls:controls.length,headings:headings.length},
      privacy:{input_values_captured:false,passwords_captured:false,file_names_captured:false,free_text_answers_captured:false}
    };
  }

  function captureStaticIfUseful(){
    try{
      const ats=window.JobCopilotAdapterRegistry?.detect?.()||'UNKNOWN';
      // V0.26.19 diagnostic target: TRAC pages need a structural snapshot even
      // when no dropdown/menu is open. Do not capture field values.
      if(ats==='TRAC'){
        staticSnapshot=staticFormStructure();
        if(rememberSection(staticSnapshot)) persistSections();
        updatePanel(`TRAC ${sectionSnapshots.length} form structures · latest ${new Date(staticSnapshot.captured_at).toLocaleTimeString()}`);
      }
      return staticSnapshot;
    }catch(e){updatePanel('Static debug capture error: '+e.message);return null}
  }

  function visibleOptionNodes(){
    const selectors=[
      '[role="option"]','[role="listbox"]','[role="menu"]','[role="tree"]',
      '[data-automation-id*="prompt"]','[data-automation-id*="menu"]',
      '[data-automation-id*="popover"]','[data-automation-id*="popup"]',
      '[data-automation-id*="option"]','[data-automation-id*="select"]',
      '[id*="option"]'
    ];
    const nodes=[]; const seenNodes=new Set();
    for(const sel of selectors){
      for(const el of document.querySelectorAll(sel)){
        if(seenNodes.has(el)||!visible(el)||el.closest('#job-copilot-debug-panel')) continue;
        seenNodes.add(el);
        const t=clean(el.innerText||el.textContent,500);
        if(!t && !el.querySelector?.('[role="option"]')) continue;
        nodes.push(el);
      }
    }
    return nodes;
  }

  function nearestContextText(el){
    // Structure/context only. We intentionally do not read any input/textarea values.
    let n=el;
    for(let i=0;n&&i<7;i++,n=n.parentElement){
      const heading=n.querySelector?.('h1,h2,h3,h4,h5,h6,legend,label');
      const t=clean(heading?.innerText,180);
      if(t) return t;
    }
    return null;
  }

  function makeSnapshot(){
    const nodes=visibleOptionNodes();
    if(!nodes.length) return null;
    const optionLeaves=[...document.querySelectorAll('[role="option"]')].filter(visible).filter(x=>!x.closest('#job-copilot-debug-panel'));
    const data={
      captured_at:new Date().toISOString(),
      page:{origin:location.origin,path:location.pathname,title:clean(document.title,200),ats:window.JobCopilotAdapterRegistry?.detect?.()||'UNKNOWN'},
      context:nearestContextText(nodes[0]),
      visible_menu_nodes:nodes.slice(0,60).map(el=>({meta:nodeMeta(el),parents:parentChain(el)})),
      visible_options:optionLeaves.slice(0,120).map(el=>nodeMeta(el)),
      active_comboboxes:[...document.querySelectorAll('[role="combobox"],[aria-haspopup="listbox"],input[aria-expanded="true"]')]
        .filter(visible).slice(0,40).map(el=>({meta:nodeMeta(el),label:clean(el.getAttribute('aria-label')||el.closest('label')?.innerText||'',180)})),
      privacy:{input_values_captured:false,passwords_captured:false,file_names_captured:false,free_text_answers_captured:false}
    };
    const fp=JSON.stringify({ctx:data.context,opts:data.visible_options.map(o=>o.text),menus:data.visible_menu_nodes.map(x=>x.meta.text)});
    if(seen.has(fp)) return null;
    seen.add(fp);
    snapshots.push(data);
    if(snapshots.length>MAX_SNAPS) snapshots.shift();
    updatePanel(`Captured dynamic menu #${snapshots.length}`);
    return data;
  }

  let scanTimer=null;
  function scheduleScan(){
    clearTimeout(scanTimer);
    scanTimer=setTimeout(()=>{
      try{makeSnapshot()}catch(e){updatePanel('Debug capture error: '+e.message)}
    },180);
  }

  function download(){
    // TRAC changes sections at the same URL; capture the current DOM at export time.
    if(window.JobCopilotAdapterRegistry?.detect?.()==='TRAC'){
      clearTimeout(staticTimer);
      captureStaticIfUseful();
    }
    const payload={
      schema_version:'ats-dynamic-debug-v2',
      exported_at:new Date().toISOString(),
      page:{origin:location.origin,path:location.pathname,title:clean(document.title,200),ats:window.JobCopilotAdapterRegistry?.detect?.()||'UNKNOWN'},
      static_capture:staticSnapshot||captureStaticIfUseful(),
      section_captures:sectionSnapshots.slice(),
      captures:snapshots,
      privacy:{input_values_captured:false,passwords_captured:false,file_names_captured:false,free_text_answers_captured:false}
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const ats=(payload.page.ats||'ats').toLowerCase();
    a.href=url; a.download=`job-copilot-dynamic-debug-${ats}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    document.documentElement.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    updatePanel(`Downloaded ${sectionSnapshots.length} form structures · ${snapshots.length} menus`);
  }

  function clearCaptures(){
    snapshots.splice(0,snapshots.length); seen.clear(); sectionSnapshots.splice(0,sectionSnapshots.length); sectionSeen.clear(); staticSnapshot=null;
    if(typeof chrome!=='undefined'&&chrome.storage?.local){
      storageWrite=storageWrite.catch(()=>{}).then(()=>chrome.storage.local.remove(sectionStorageKey));
    }
    captureStaticIfUseful(); updatePanel('Captures cleared');
  }

  function updatePanel(msg){
    if(!panel) return;
    if(countEl) countEl.textContent=`${sectionSnapshots.length} form structures · ${snapshots.length} menus`;
    if(statusEl&&msg) statusEl.textContent=msg;
  }

  function installPanel(){
    if(document.getElementById('job-copilot-debug-panel')) return;
    panel=document.createElement('div');
    panel.id='job-copilot-debug-panel';
    Object.assign(panel.style,{
      position:'fixed',left:'12px',bottom:'12px',zIndex:'2147483647',background:'#111827',color:'#fff',
      font:'12px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',padding:'10px',borderRadius:'9px',
      boxShadow:'0 5px 20px rgba(0,0,0,.30)',minWidth:'210px',maxWidth:'280px'
    });
    const title=document.createElement('div'); title.textContent='JC ATS Debug'; title.style.fontWeight='700'; title.style.marginBottom='5px';
    countEl=document.createElement('div'); countEl.textContent='0 menu captures'; countEl.style.marginBottom='4px';
    statusEl=document.createElement('div'); statusEl.textContent=(window.JobCopilotAdapterRegistry?.detect?.()==='TRAC')?'TRAC page structure capture is automatic.':'Open a dropdown/menu; dynamic capture is automatic.'; statusEl.style.opacity='.8'; statusEl.style.marginBottom='8px';
    const row=document.createElement('div'); row.style.display='flex'; row.style.gap='6px';
    const dl=document.createElement('button'); dl.textContent='Download ATS Debug';
    const cl=document.createElement('button'); cl.textContent='Clear';
    for(const b of [dl,cl]) Object.assign(b.style,{border:'0',borderRadius:'6px',padding:'6px 8px',cursor:'pointer',font:'inherit'});
    dl.onclick=e=>{e.preventDefault();e.stopPropagation();download()};
    cl.onclick=e=>{e.preventDefault();e.stopPropagation();clearCaptures()};
    row.append(dl,cl); panel.append(title,countEl,statusEl,row); document.documentElement.appendChild(panel);
  }

  // Automatic observer: the user never has to click the overlay while the Workday menu is open.
  function onMutation(mutations){
    // The debug panel's own timestamp update must not retrigger a capture loop.
    const pageChanged=mutations.some(m=>!m.target.closest?.('#job-copilot-debug-panel'));
    if(!pageChanged) return;
    scheduleScan();
    if(window.JobCopilotAdapterRegistry?.detect?.()==='TRAC'){
      clearTimeout(staticTimer);
      staticTimer=setTimeout(captureStaticIfUseful,250);
    }
  }
  const obs=new MutationObserver(onMutation);
  obs.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-expanded','aria-selected','class','style']});
  document.addEventListener('focusin',scheduleScan,true);
  document.addEventListener('keydown',scheduleScan,true);
  document.addEventListener('click',scheduleScan,true);
  // The overlay is a developer tool: shown only when enabled under Advanced. Capture still runs.
  if(typeof chrome!=='undefined'&&chrome.storage?.local)chrome.storage.local.get('showDebugOverlay').then(x=>{if(x?.showDebugOverlay)installPanel()}).catch(()=>{});
  restoreSections();
  setTimeout(()=>{captureStaticIfUseful();scheduleScan();},500);

  window.JobCopilotInPageDebug={snapshot:makeSnapshot,captureStatic:captureStaticIfUseful,download,get staticCapture(){return staticSnapshot},get sectionCaptures(){return sectionSnapshots.slice()},get captures(){return snapshots.slice()}};
})();
