(function(){
  const norm=v=>String(v??'').replace(/\s+/g,' ').trim().toLowerCase();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const visible=el=>{try{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.offsetParent!==null}catch(_){return false}};
  const text=el=>String(el?.innerText||el?.textContent||'').replace(/\s+/g,' ').trim();
  const esc=s=>{try{return CSS.escape(s)}catch(_){return s}};

  function labelledBy(el){
    const ids=(el.getAttribute?.('aria-labelledby')||'').split(/\s+/).filter(Boolean);
    return ids.map(id=>document.getElementById(id)).filter(Boolean).map(text).join(' ');
  }
  function labelFor(el){
    const bits=[];
    if(el.id){const l=document.querySelector(`label[for="${esc(el.id)}"]`);if(l)bits.push(text(l));}
    const al=el.getAttribute?.('aria-label'); if(al)bits.push(al);
    const lb=labelledBy(el); if(lb)bits.push(lb);
    ['placeholder','name','id','data-automation-id'].forEach(a=>{const v=el.getAttribute?.(a);if(v)bits.push(v)});
    // Workday often renders visual labels as div/span siblings rather than semantic <label> nodes.
    let node=el;
    for(let depth=0;node&&depth<6;depth++,node=node.parentElement){
      const parent=node.parentElement; if(!parent) break;
      const siblings=[...parent.children]; const pos=siblings.indexOf(node);
      for(let i=Math.max(0,pos-2);i<pos;i++){
        const s=text(siblings[i]); if(s&&s.length<180) bits.push(s);
      }
      const q=parent.querySelector?.('label,legend,[data-automation-id="formLabel"],[data-automation-id*="label"],h3,h4');
      if(q){const s=text(q);if(s&&s.length<180)bits.push(s)}
    }
    return [...new Set(bits.filter(Boolean))].join(' ');
  }
  function nativeSet(el,val){
    const wanted=String(val??''); if(wanted==='') return false;
    if(el.tagName==='SELECT'){
      const w=norm(wanted); const o=[...el.options].find(x=>norm(x.text)===w||norm(x.value)===w||norm(x.text).includes(w));
      if(!o)return false; el.value=o.value; el.dispatchEvent(new Event('change',{bubbles:true})); return true;
    }
    const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    try{
      el.focus();
      if(setter){setter.call(el,'');el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'deleteContentBackward',data:null}));setter.call(el,wanted)} else el.value=wanted;
      el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:wanted}));
      el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
      el.dispatchEvent(new FocusEvent('focusout',{bubbles:true,composed:true}));
      try{el.blur()}catch(_){}
      return String(el.value)===wanted;
    }catch(_){return false}
  }
  function parseDates(s){const m=String(s||'').match(/(\d{2})\/(\d{4})\s*[-–—]\s*(Present|Current|(\d{2})\/(\d{4}))/i);if(!m)return{};return{sm:m[1],sy:m[2],current:/present|current/i.test(m[3]),em:m[4]||'',ey:m[5]||''}}
  function controls(root){return [...root.querySelectorAll('input,textarea,select,[role="combobox"],button[aria-haspopup="listbox"]')].filter(visible)}

  function promptOptions(){
    const selectors=[
      '[role="option"]','[role="menuitem"]','[role="treeitem"]',
      '[data-automation-id="promptOption"]','[data-automation-id="menuItem"]',
      '[data-automation-id*="promptOption"]','[data-automation-id*="menuItem"]',
      '[data-automation-id*="option"]','[data-automation-id*="listItem"]'
    ].join(',');
    const strong=[...document.querySelectorAll(selectors)].filter(visible);
    const popupRoots=[...document.querySelectorAll('[role="listbox"],[role="menu"],[role="tree"],[data-automation-id*="prompt"],[data-automation-id*="menu"],[data-automation-id*="popover"],[data-automation-id*="popup"]')].filter(visible);
    const loose=[];
    for(const r of popupRoots){
      for(const el of r.querySelectorAll('button,li,[tabindex],div,span')){
        const t=text(el); if(visible(el)&&t&&t.length<160)loose.push(el);
      }
    }
    return [...new Set([...strong,...loose])];
  }
  function actionable(el){
    if(!el)return null;
    let n=el;
    for(let d=0;n&&d<5;d++,n=n.parentElement){
      const role=n.getAttribute?.('role')||'';
      const tab=n.getAttribute?.('tabindex');
      if(n.tagName==='BUTTON'||n.tagName==='LI'||/option|menuitem|treeitem/.test(role)||tab==='0'||typeof n.onclick==='function')return n;
    }
    return el;
  }
  function bestTextMatch(wants){
    const opts=promptOptions();
    for(const w of wants){
      const exact=opts.filter(o=>norm(text(o))===w);
      if(exact.length){
        exact.sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length);
        return actionable(exact[0]);
      }
    }
    for(const w of wants){
      const contains=opts.filter(o=>{const t=norm(text(o));return t&&t.length<120&&(t.includes(w)||w.includes(t));});
      if(contains.length===1)return actionable(contains[0]);
    }
    return null;
  }
  function key(el,key){
    try{
      el.dispatchEvent(new KeyboardEvent('keydown',{key,code:key,bubbles:true,composed:true}));
      el.dispatchEvent(new KeyboardEvent('keyup',{key,code:key,bubbles:true,composed:true}));
      return true;
    }catch(_){return false}
  }
  function popupSearchInput(original){
    const candidates=[...document.querySelectorAll('input[role="combobox"],input[autocomplete="off"],input[type="search"],input[type="text"]')].filter(visible).filter(x=>x!==original);
    const active=document.activeElement;
    if(active&&candidates.includes(active))return active;
    return candidates.find(x=>{
      const r=x.getBoundingClientRect();
      return r.width>60&&r.height>20;
    })||null;
  }
  async function choosePrompt(el,value,aliases=[]){
    const wants=[value,...aliases].map(norm).filter(Boolean); if(!wants.length)return false;
    if(el.tagName==='SELECT'){
      for(const w of wants){const o=[...el.options].find(x=>norm(x.text)===w||norm(x.value)===w||norm(x.text).includes(w));if(o){el.value=o.value;el.dispatchEvent(new Event('change',{bubbles:true}));return true}}
      return false;
    }
    try{el.focus();el.click()}catch(_){return false}
    let hit=null;
    for(let i=0;i<18;i++){await sleep(80);hit=bestTextMatch(wants);if(hit)break}
    if(hit){try{hit.click();await sleep(140);return true}catch(_){}}

    // Some Workday prompts open a portal with a hidden/search combobox. Filter the prompt
    // by a safe canonical query, then resolve the visible option text.
    const search=popupSearchInput(el);
    if(search){
      const query=(aliases[0]||value||'').replace(/['’]s degree$/i,'').replace(/ degree$/i,'').trim();
      if(query){nativeSet(search,query);await sleep(260);hit=bestTextMatch(wants);if(hit){try{hit.click();await sleep(140);return true}catch(_){}}}
    }
    try{document.body.click()}catch(_){} return false;
  }
  function degreeAliases(v){
    // Live Workday capture (Live Nation wd503) exposes concrete degree options such as
    // "Master of Science (M.S.)" and "Bachelor of Science (B.S.)". Put exact
    // Workday labels first; broader aliases remain as fallbacks for other tenants.
    const s=norm(v);
    if(/msc|master of science|master/.test(s))return ["Master of Science (M.S.)","Master of Arts (M.A.)","Master of Business Administration (MBA)","master"];
    if(/bsc|bachelor of science|bachelor/.test(s))return ["Bachelor of Science (B.S.)","Bachelor of Arts (B.A.)","Bachelor of Engineering (BEng)","bachelor"];
    if(/\bba\b/.test(s))return ["Bachelor of Arts (B.A.)","Bachelor of Business Administration (BBA)","bachelor"];
    if(/phd|doctor/.test(s))return ["Doctor of Philosophy (PhD)",'doctorate','doctoral degree','phd'];
    return [];
  }
  function findControl(root,patterns){
    const items=controls(root);
    for(const rx of patterns){
      const hits=items.filter(el=>rx.test(norm(labelFor(el))));
      if(hits.length===1)return hits[0];
    }
    return null;
  }
  function findCheckbox(root,patterns){
    const items=[...root.querySelectorAll('input[type="checkbox"],input[type="radio"]')].filter(visible);
    for(const rx of patterns){const hits=items.filter(el=>rx.test(norm(labelFor(el))));if(hits.length===1)return hits[0]}
    return null;
  }
  function setBool(el,v){if(!el)return false;const b=!!v;if(el.checked!==b)el.click();return el.checked===b}
  function nearestRowContainer(heading,kind){
    const want=kind==='employment'?['job title','company']:['school or university','degree'];
    let n=heading;
    const candidates=[];
    for(let d=0;n&&d<9;d++,n=n.parentElement){
      const t=norm(text(n)); const score=want.filter(x=>t.includes(x)).length;
      if(score===want.length){
        const rowHeads=[...n.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span')].filter(visible).filter(x=>new RegExp(`^${kind==='employment'?'work experience':'education'}\\s+\\d+$`,'i').test(text(x))).length;
        if(rowHeads<=1)candidates.push({n,size:n.querySelectorAll('*').length});
      }
    }
    candidates.sort((a,b)=>a.size-b.size); return candidates[0]?.n||heading.parentElement;
  }
  function rowContainers(kind){
    const rx=new RegExp(`^${kind==='employment'?'work experience':'education'}\\s+(\\d+)$`,'i');
    const heads=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span')].filter(visible).filter(x=>rx.test(text(x)));
    const seen=new Set(), out=[];
    for(const h of heads){const m=text(h).match(rx);const idx=Number(m?.[1]||0);if(!idx||seen.has(idx))continue;seen.add(idx);out.push({idx,root:nearestRowContainer(h,kind)})}
    return out.sort((a,b)=>a.idx-b.idx);
  }
  function sectionHeading(kind){
    const rx=kind==='employment'?/^work experience$/i:/^education$/i;
    return [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span')].filter(visible).find(x=>rx.test(text(x)))||null;
  }
  function nextSectionHeading(kind){
    // Some Workday tenants omit Education entirely. Stop at the first actual
    // section after this one so Languages' Add button is never treated as Add Another.
    const rx=kind==='employment'?/^(education|languages|skills|websites|resume\s*\/\s*cover letter)$/i:/^(languages|skills|websites|resume\s*\/\s*cover letter)$/i;
    const start=sectionHeading(kind);
    return [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span')].filter(visible)
      .find(x=>rx.test(text(x))&&(!start||(start.compareDocumentPosition(x)&Node.DOCUMENT_POSITION_FOLLOWING)))||null;
  }
  function betweenInDom(el,start,end){
    if(!el||!start)return false;
    const after=!!(start.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING);
    if(!after)return false;
    if(!end)return true;
    return !!(el.compareDocumentPosition(end)&Node.DOCUMENT_POSITION_FOLLOWING);
  }
  function addButton(kind){
    const start=sectionHeading(kind), end=nextSectionHeading(kind);
    if(!start)return null;
    const buttons=[...document.querySelectorAll('button')].filter(visible).filter(b=>/^(add|add another)$/i.test(text(b))).filter(b=>betweenInDom(b,start,end));
    if(!buttons.length)return null;
    // Workday places Add Another after the last existing row. Prefer the last in-section button.
    return buttons[buttons.length-1];
  }
  async function ensureRows(kind,count){
    let loops=0;
    while(rowContainers(kind).length<count && loops<Math.min(count+2,12)){
      const before=rowContainers(kind).length;
      const b=addButton(kind); if(!b)return{ok:false,reason:`Could not find ${kind} Add/Add Another button.`,count:before};
      b.click(); loops++;
      let advanced=false;
      for(let i=0;i<20;i++){
        await sleep(100);
        if(rowContainers(kind).length>before){advanced=true;break}
      }
      if(!advanced)return{ok:false,reason:`${kind} row did not appear after Add/Add Another.`,count:rowContainers(kind).length};
    }
    return{ok:rowContainers(kind).length>=count,count:rowContainers(kind).length};
  }
  function rowTextInputs(root){
    return [...root.querySelectorAll('input')].filter(visible).filter(el=>{
      const t=String(el.type||'text').toLowerCase();
      return ['text','tel','search',''].includes(t);
    });
  }
  function dateInputs(root){
    const xs=rowTextInputs(root).filter(el=>{
      const ph=norm(el.getAttribute('placeholder')||'');
      const idn=norm((el.id||'')+' '+(el.name||'')+' '+labelFor(el));
      return /mm\s*\/\s*yyyy/.test(ph)||/start date|end date|from|to/.test(idn);
    });
    // Workday rows render date fields left-to-right: From, then To (unless current role hides To).
    return xs;
  }
  function descriptionControl(root){
    const semantic=findControl(root,[/role description/,/description/,/responsibilit/]);
    if(semantic)return semantic;
    const tas=[...root.querySelectorAll('textarea')].filter(visible);
    if(tas.length===1)return tas[0];
    return tas[0]||null;
  }
  function findByIdContains(root,needle){
    return [...root.querySelectorAll('input,textarea,select,button,[role="combobox"]')].find(el=>visible(el)&&String(el.id||'').includes(needle))||null;
  }
  // Workday DateInput keeps its own {mm,yyyy} state and copies a segment into it on blur.
  // Verified live 2026-10-09:
  // - Calling the React onChange with a stub event (old main-world bridge) wrote the month
  //   into yyyy and left the date invalid, so Save and Continue reported From/To as missing.
  // - While the extension popup is open the page has no focus (document.hasFocus() is false),
  //   so el.focus()/el.blur() fire no events and the date never commits. Focus events are
  //   therefore dispatched explicitly; React's onBlur listens to focusout.
  // - The segment is cleared first so React sees a change even if the same digits are shown.
  async function commitDateSegment(el,value){
    if(!el||!/^\d{1,4}$/.test(String(value)))return {ok:false,reason:'Missing or invalid date segment.'};
    const id=el.id;
    const setValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    try{
      el.focus();
      el.dispatchEvent(new FocusEvent('focus'));
      el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
      await sleep(20);
      setValue.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));
      setValue.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));
      await sleep(40);
      const live=document.getElementById(id)||el;
      live.blur();
      live.dispatchEvent(new FocusEvent('blur'));
      live.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
    }catch(e){return {ok:false,reason:String(e?.message||e).slice(0,120)}}
    await sleep(120);
    const live=document.getElementById(id);
    // Workday normalises months without a leading zero ("01" is shown as "1").
    return live&&Number(live.value)===Number(value)?
      {ok:true,method:'setter_input_blur',validation_pending:true}:
      {ok:false,reason:'Date did not remain in the Workday control.'};
  }
  function splitMonthYear(value){
    const m=String(value||'').trim().match(/^(\d{2})\/(\d{4})$/);
    return m?{month:m[1],year:m[2]}:null;
  }
  async function setWorkdayDate(root,prefix,value){
    const p=splitMonthYear(value); if(!p)return false;
    const month=findByIdContains(root,`--${prefix}Date-dateSectionMonth-input`);
    const m=await commitDateSegment(month,p.month);
    await sleep(50);
    const year=findByIdContains(root,`--${prefix}Date-dateSectionYear-input`);
    const y=await commitDateSegment(year,p.year);
    return m.ok&&y.ok;
  }
  async function repairDates(){
    if(!window.JobCopilotWorkday?.isWorkday?.()||!/my experience/i.test(document.body.innerText||''))
      return {ok:false,reason:'Open Workday My Experience first.'};
    const rows=[];
    for(const {idx,root} of rowContainers('employment')){
      const segments=[...root.querySelectorAll('input[id*="-dateSectionMonth-input"],input[id*="-dateSectionYear-input"]')].filter(visible);
      const report={row:idx,segments:[],unverified:[]};
      for(const segment of segments){
        const value=String(segment.value||'').trim();
        if(!value){report.unverified.push({id:segment.id,reason:'Date is empty; no value invented.'});continue}
        const result=await commitDateSegment(document.getElementById(segment.id),value);
        report.segments.push({id:segment.id,...result});
        if(!result.ok)report.unverified.push({id:segment.id,reason:result.reason});
      }
      rows.push(report);
    }
    return {ok:rows.length>0&&rows.every(r=>!r.unverified.length),rows,
      validation_pending:true,note:'Date inputs were re-committed where possible. Workday Save and Continue must verify them. Other experience fields and languages were not changed.'};
  }
  function rowDateControls(root,current){
    const startMonth=findByIdContains(root,'--startDate-dateSectionMonth-input');
    const startYear=findByIdContains(root,'--startDate-dateSectionYear-input');
    const endMonth=findByIdContains(root,'--endDate-dateSectionMonth-input');
    const endYear=findByIdContains(root,'--endDate-dateSectionYear-input');
    return {startMonth,startYear,endMonth,endYear,current};
  }
  async function fillEmployment(root,rec){
    const d=parseDates(rec.dates); const report={filled:[],missing:[]};
    const current=findCheckbox(root,[/currently work here/,/current job/,/current position/]);
    if(current){if(setBool(current,d.current))report.filled.push('current'); await sleep(60)}
    const fields={
      job_title:findControl(root,[/^job title\b/,/position title/]),
      company:findControl(root,[/^company\b/,/employer/]),
      location:findControl(root,[/^location\b/]),
      desc:descriptionControl(root),
      current
    };
    const vals={
      job_title:rec.role,
      company:rec.employer,
      location:rec.country||'',
      from:d.sm&&d.sy?`${d.sm}/${d.sy}`:'',
      to:!d.current&&d.em&&d.ey?`${d.em}/${d.ey}`:'',
      desc:rec.evidence||''
    };
    for(const k of ['job_title','company','location','desc']){
      if(!vals[k]||!fields[k])continue;
      const ok=(fields[k].getAttribute('role')==='combobox'||fields[k].getAttribute('aria-haspopup')==='listbox'||fields[k].tagName==='SELECT')?await choosePrompt(fields[k],vals[k]):nativeSet(fields[k],vals[k]);
      if(ok)report.filled.push(k);
      await sleep(35);
    }
    if(vals.from&&await setWorkdayDate(root,'start',vals.from))report.filled.push('from');
    if(vals.to&&await setWorkdayDate(root,'end',vals.to))report.filled.push('to');
    for(const k of ['job_title','company','from']){if(vals[k]&&!report.filled.includes(k))report.missing.push(k)}
    if(!d.current&&vals.to&&!report.filled.includes('to'))report.missing.push('to');
    if(vals.desc&&!report.filled.includes('desc'))report.missing.push('desc');
    return report;
  }
  function nearbyPromptControl(root,labelRx){
    const candidates=[...root.querySelectorAll('button,[role="combobox"],input[autocomplete="off"],input[type="text"]')].filter(visible);
    for(const el of candidates){
      if(labelRx.test(norm(labelFor(el))))return el;
      let n=el.parentElement;
      for(let d=0;n&&d<4;d++,n=n.parentElement){
        const t=norm(text(n));
        if(labelRx.test(t))return el;
      }
    }
    return null;
  }
  function degreeControl(root){
    const semantic=findControl(root,[/^degree\b/,/qualification/])||nearbyPromptControl(root,/\bdegree\b|qualification/);
    if(semantic)return semantic;
    const candidates=[...root.querySelectorAll('button,[role="combobox"],[aria-haspopup="listbox"]')].filter(visible);
    return candidates.find(el=>/^select one$/i.test(text(el)))||candidates[0]||null;
  }
  function nearbyCommittedValue(el,value){
    const w=norm(value); if(!w)return false;
    let n=el.parentElement;
    for(let d=0;n&&d<5;d++,n=n.parentElement){
      const candidates=[...n.querySelectorAll('[data-automation-id*="selected"],[data-automation-id*="pill"],[data-automation-id*="tag"],[role="option"],button,span,div')].filter(visible);
      if(candidates.some(x=>x!==el&&norm(text(x))===w))return true;
    }
    return false;
  }
  function nativeTypeKeepingFocus(el,value){
    const wanted=String(value??''); if(!el||!wanted)return false;
    try{
      el.focus();
      const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if(setter){
        setter.call(el,'');
        el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'deleteContentBackward',data:null}));
        setter.call(el,wanted);
      }else el.value=wanted;
      // Do not blur/focusout here. Workday's Field of Study list is a live prompt and
      // closes before an option can be selected if the input loses focus.
      el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,composed:true,inputType:'insertText',data:wanted}));
      el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:wanted}));
      return String(el.value||'')===wanted;
    }catch(_){return false}
  }
  function fieldStudyAliases(value){
    // Source-first rule: always try the exact CV field first. Only if Workday does not
    // offer that exact taxonomy label, fall back to the broader Psychology category.
    // This fallback is deliberately narrow and only applies to psychology-related fields.
    const s=norm(value);
    if(!s)return [];
    if(s==='psychology')return [];
    if(/psycholog|counsell|counsel/.test(s))return ['Psychology'];
    return [];
  }
  function promptFieldContainer(el){
    if(!el)return null;
    return el.closest?.('[data-automation-id="formField-fieldOfStudy"],[data-automation-id="formField-skills"]')||el.parentElement;
  }
  function committedPromptText(container){
    if(!container)return [];
    return [...container.querySelectorAll('[data-automation-id="selectedItem"],[data-automation-id="promptOption"],[role="option"][id^="pill-"]')]
      .filter(visible).map(x=>norm(text(x))).filter(Boolean);
  }
  function promptCommitted(container,wants){
    const vals=committedPromptText(container);
    return wants.some(w=>vals.some(v=>v===w));
  }
  function activePromptOptions(){
    // Workday Field of Study uses a ReactVirtualized listbox rendered outside the row.
    // Prefer the currently visible virtualized/open listbox so selected pills from other
    // prompts cannot be mistaken for candidate menu options.
    const lists=[...document.querySelectorAll('[role="listbox"]')].filter(visible);
    const openLists=lists.filter(x=>x.classList?.contains('ReactVirtualized__List')||x.querySelector?.('[data-automation-id="menuItem"]'));
    const roots=openLists.length?openLists:(lists.length?lists:[document]);
    const seen=new Set(), out=[];
    for(const root of roots){
      for(const o of root.querySelectorAll('[data-automation-id="menuItem"],[data-automation-id="menuItem"][role="option"]')){
        if(!visible(o)||seen.has(o))continue;seen.add(o);out.push(o);
      }
    }
    return out;
  }
  function exactPromptOption(wants){
    const options=activePromptOptions();
    for(const w of wants){
      const hit=options.find(o=>norm(text(o))===w);
      if(hit)return hit;
    }
    return null;
  }
  async function typePromptQuery(el,value){
    const wanted=String(value??''); if(!el||!wanted)return false;
    try{
      el.focus();
      const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      const setv=v=>{if(setter)setter.call(el,v);else el.value=v};
      setv('');
      el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'deleteContentBackward',data:null}));
      await sleep(40);
      let cur='';
      for(const ch of wanted){
        el.dispatchEvent(new KeyboardEvent('keydown',{key:ch,code:/[a-z]/i.test(ch)?`Key${ch.toUpperCase()}`:'',bubbles:true,composed:true}));
        cur+=ch; setv(cur);
        el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,composed:true,inputType:'insertText',data:ch}));
        el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:ch}));
        el.dispatchEvent(new KeyboardEvent('keyup',{key:ch,code:/[a-z]/i.test(ch)?`Key${ch.toUpperCase()}`:'',bubbles:true,composed:true}));
        await sleep(18);
      }
      return String(el.value||'')===wanted;
    }catch(_){return false}
  }
  function clearPromptQuery(container,fallbackEl=null){
    try{
      const live=container?.querySelector('input[autocomplete="off"],input[type="text"],input[role="combobox"]')||fallbackEl;
      if(!live||!visible(live))return;
      const proto=live instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      setter?setter.call(live,''):live.value='';
      live.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'deleteContentBackward',data:null}));
      live.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
    }catch(_){}
  }
  function activePromptList(){
    return [...document.querySelectorAll('[role="listbox"][data-automation-id="activeListContainer"],[role="listbox"].ReactVirtualized__List')]
      .find(visible)||null;
  }
  function promptOpenTargets(el,container){
    const xs=[];
    if(el)xs.push(el);
    // Workday Field of Study has a dedicated prompt/list icon next to the text input.
    // Clicking the input alone is not sufficient on all tenants, so explicitly include
    // every visible button/interactive control inside this specific form field.
    if(container){
      for(const x of container.querySelectorAll('button,[role="button"],[aria-haspopup="listbox"],[data-automation-id*="prompt"]')){
        if(visible(x)&&x!==el)xs.push(x);
      }
      const shell=container.querySelector('[data-automation-id="multiSelectContainer"]');
      if(shell&&visible(shell))xs.push(shell);
    }
    return [...new Set(xs)];
  }
  async function openPromptList(el,container){
    if(!el)return null;
    for(const target of promptOpenTargets(el,container)){
      try{
        el.focus();
        target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,pointerType:'mouse',isPrimary:true}));
        target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,composed:true,view:window}));
        target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,composed:true,pointerType:'mouse',isPrimary:true}));
        target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,composed:true,view:window}));
        target.click?.();
      }catch(_){}
      for(let i=0;i<10;i++){
        await sleep(80);
        const list=activePromptList();
        if(list)return list;
      }
    }
    return null;
  }
  function promptOptionLabel(menuItem){
    if(!menuItem)return '';
    const label=menuItem.querySelector?.('[data-automation-id="promptOption"]');
    return text(label||menuItem);
  }
  function promptClickableNode(menuItem){
    if(!menuItem)return null;
    // Workday renders each taxonomy row as:
    // li[data-automation-id=menuItem] > div[role=option] > p[data-automation-id=promptOption].
    // The React selection handler is attached to the role=option node, not the outer li.
    return menuItem.matches?.('[role="option"]')?menuItem:
      menuItem.querySelector?.('[role="option"]')||
      menuItem.querySelector?.('[data-automation-id="promptOption"]')?.parentElement||
      menuItem;
  }
  function dispatchRealMouseClick(node){
    if(!node)return false;
    try{
      node.scrollIntoView?.({block:'center',inline:'nearest'});
      const r=node.getBoundingClientRect?.()||{left:0,top:0,width:1,height:1};
      const clientX=Math.round(r.left+Math.max(1,r.width)/2);
      const clientY=Math.round(r.top+Math.max(1,r.height)/2);
      const mouse={bubbles:true,cancelable:true,composed:true,view:window,button:0,buttons:1,clientX,clientY};
      const pointer={...mouse,pointerId:1,pointerType:'mouse',isPrimary:true};
      node.dispatchEvent(new PointerEvent('pointerover',pointer));
      node.dispatchEvent(new MouseEvent('mouseover',mouse));
      node.dispatchEvent(new PointerEvent('pointerdown',pointer));
      node.dispatchEvent(new MouseEvent('mousedown',mouse));
      node.dispatchEvent(new PointerEvent('pointerup',{...pointer,buttons:0}));
      node.dispatchEvent(new MouseEvent('mouseup',{...mouse,buttons:0}));
      node.dispatchEvent(new MouseEvent('click',{...mouse,buttons:0,detail:1}));
      return true;
    }catch(_){
      try{node.click?.();return true}catch(__){return false}
    }
  }
  function invokeMainReactSelection(node){
    return new Promise(resolve=>{
      if(!node?.id)return resolve({ok:false,error:'Option has no stable id for MAIN-world React bridge.'});
      const requestId=`jc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let done=false;
      const finish=r=>{if(done)return;done=true;document.removeEventListener('jc-main-react-select-response',onResponse);resolve(r)};
      const onResponse=ev=>{
        try{const r=JSON.parse(ev.detail||'{}');if(r.requestId===requestId)finish(r)}catch(_){}
      };
      document.addEventListener('jc-main-react-select-response',onResponse);
      document.dispatchEvent(new CustomEvent('jc-main-react-select-request',{detail:JSON.stringify({requestId,id:node.id})}));
      setTimeout(()=>finish({ok:false,error:'MAIN-world React bridge timed out.'}),700);
    });
  }
  async function clickPromptOption(hit){
    const node=promptClickableNode(hit);
    if(!node)return false;
    try{node.scrollIntoView?.({block:'center',inline:'nearest'});}catch(_){}

    // Root-cause fix for Workday Field of Study: synthetic DOM mouse events are visible
    // to the page but do not commit the React-controlled multi-select. Invoke the actual
    // React handler from the page MAIN world first. Only fall back to DOM events if no
    // React handler is discoverable.
    const main=await invokeMainReactSelection(node);
    if(main?.ok)return true;
    try{node.click?.();}catch(_){}
    return dispatchRealMouseClick(node);
  }
  async function scanVirtualPromptForExact(el,container,want){
    const wanted=norm(want); if(!wanted)return false;
    let list=await openPromptList(el,container);
    if(!list)return false;

    // Workday's Field of Study menu is a virtualized alphabetical list. Searching by
    // synthetic text proved unreliable, so scan the actual rendered taxonomy instead.
    // This keeps the source-first rule: exact CV label first, then the explicit fallback.
    try{list.scrollTop=0;list.dispatchEvent(new Event('scroll',{bubbles:true}))}catch(_){}
    await sleep(120);

    let lastTop=-1, stagnant=0;
    for(let i=0;i<180;i++){
      list=activePromptList()||list;
      const options=[...list.querySelectorAll('[data-automation-id="menuItem"]')].filter(visible);
      const hit=options.find(o=>norm(promptOptionLabel(o))===wanted);
      if(hit){
        if(!(await clickPromptOption(hit)))return false;
        for(let k=0;k<20;k++){
          await sleep(100);
          if(promptCommitted(container,[wanted]))return true;
        }
        return false;
      }

      const maxTop=Math.max(0,(list.scrollHeight||0)-(list.clientHeight||0));
      const cur=Number(list.scrollTop||0);
      if(cur>=maxTop-2)break;
      const step=Math.max(180,Math.floor((list.clientHeight||360)*0.82));
      const next=Math.min(maxTop,cur+step);
      try{
        list.scrollTop=next;
        list.dispatchEvent(new Event('scroll',{bubbles:true}));
      }catch(_){return false}
      await sleep(95);
      const now=Number(list.scrollTop||0);
      if(now===lastTop||now===cur)stagnant++;else stagnant=0;
      if(stagnant>=4)break;
      lastTop=now;
    }
    return false;
  }

  function setReactTrackedValue(el,value){
    const wanted=String(value??'');
    if(!el)return false;
    try{
      el.focus();
      const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      const prev=String(el.value||'');
      if(setter)setter.call(el,wanted);else el.value=wanted;
      // Workday/React keeps a value tracker. Force it to see the old value so the
      // following input event is treated as a genuine user edit.
      try{ if(el._valueTracker) el._valueTracker.setValue(prev); }catch(_){}
      try{el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,composed:true,inputType:'insertText',data:wanted}));}catch(_){}
      try{el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:wanted}));}catch(_){el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));}
      return String(el.value||'')===wanted;
    }catch(_){return false}
  }
  async function searchPromptAndClickExact(el,container,want){
    const wanted=norm(want); if(!wanted)return false;
    // Open the real prompt first, then update the React-controlled search value.
    let list=await openPromptList(el,container);
    if(!list)return false;
    if(!setReactTrackedValue(el,want))return false;
    // Give Workday time to filter/re-render the virtualized option list.
    for(let i=0;i<24;i++){
      await sleep(100);
      list=activePromptList()||list;
      const options=[...list.querySelectorAll('[data-automation-id="menuItem"],[data-automation-id="menuItem"][role="option"]')].filter(visible);
      const hit=options.find(o=>norm(promptOptionLabel(o))===wanted);
      if(hit){
        if(!(await clickPromptOption(hit)))return false;
        for(let k=0;k<20;k++){
          await sleep(100);
          if(promptCommitted(container,[wanted]))return true;
        }
        return false;
      }
    }
    return false;
  }

  async function chooseSearchInput(el,value,aliases=[]){
    if(!el||!value)return false;
    if(el.tagName==='INPUT'){
      const container=promptFieldContainer(el);
      const attempts=[value,...aliases].map(v=>String(v||'').trim()).filter(Boolean);
      const seen=new Set();
      for(const attempt of attempts){
        const w=norm(attempt);
        if(!w||seen.has(w))continue;
        seen.add(w);

        // Reacquire the row-local input after Workday rerenders the prompt.
        let input=el;
        if(!document.contains(input)){
          input=container?.querySelector('input[autocomplete="off"],input[type="text"],input[role="combobox"]')||null;
          if(!input)break;
        }

        // First use Workday's own search box, but update the React value tracker so
        // the search state really changes. If that still does not expose the exact
        // option, fall back to scanning the real virtualized taxonomy.
        if(await searchPromptAndClickExact(input,container,attempt))return true;
        clearPromptQuery(container,input);
        await sleep(120);
        if(await scanVirtualPromptForExact(input,container,attempt))return true;

        // Ensure no uncommitted text remains before trying a fallback.
        clearPromptQuery(container,input);
        try{document.body.click()}catch(_){}
        await sleep(100);
      }
      return false;
    }
    return choosePrompt(el,value,aliases);
  }
  function degreeExactLabels(value){
    const s=norm(value);
    if(/msc|master of science/.test(s))return ["Master of Science (M.S.)"];
    if(/bsc|bachelor of science/.test(s))return ["Bachelor of Science (B.S.)"];
    if(/\bma\b|master of arts/.test(s))return ["Master of Arts (M.A.)"];
    if(/\bba\b|bachelor of arts/.test(s))return ["Bachelor of Arts (B.A.)"];
    if(/mba/.test(s))return ["Master of Business Administration (MBA)"];
    if(/phd|doctor of philosophy/.test(s))return ["Doctor of Philosophy (PhD)"];
    return [];
  }
  async function chooseDegree(button,value){
    if(!button||!value)return false;
    const exact=degreeExactLabels(value);
    const wants=[...exact,value,...degreeAliases(value)].map(norm).filter(Boolean);
    try{button.focus();button.click()}catch(_){return false}
    // The live capture proves the degree button exposes aria-controls pointing to the
    // actual listbox; scope matching to that list first so another open prompt cannot win.
    let list=null;
    for(let i=0;i<16;i++){
      await sleep(80);
      const id=button.getAttribute('aria-controls');
      if(id)list=document.getElementById(id);
      if(list&&visible(list))break;
    }
    const candidates=()=>{
      const root=(list&&visible(list))?list:document;
      return [...root.querySelectorAll('[role="option"]')].filter(visible);
    };
    let hit=null;
    for(let i=0;i<10&&!hit;i++){
      for(const w of wants){hit=candidates().find(o=>norm(text(o))===w);if(hit)break}
      if(!hit)await sleep(80);
    }
    if(!hit)return false;
    try{hit.click();await sleep(220)}catch(_){return false}
    const selected=norm(text(button));
    return wants.some(w=>selected===w)||!/^select one$/.test(selected);
  }

  async function fillEducation(root,rec){
    const report={filled:[],missing:[]};
    const school=findControl(root,[/school or university/,/^school\b/,/university/,/institution/]);
    const degree=degreeControl(root);
    const field=findByIdContains(root,'--fieldOfStudy')||findControl(root,[/field of study/,/area of study/,/major/,/subject/])||nearbyPromptControl(root,/field of study|area of study|major|subject/);
    if(school&&rec.institution&&nativeSet(school,rec.institution))report.filled.push('institution'); else if(rec.institution)report.missing.push('institution');
    if(degree&&rec.degree){const ok=degree.tagName==='BUTTON'?await chooseDegree(degree,rec.degree):await chooseSearchInput(degree,rec.degree,degreeAliases(rec.degree));if(ok)report.filled.push('degree'); else report.missing.push('degree')}
    if(field&&rec.field){const ok=await chooseSearchInput(field,rec.field,fieldStudyAliases(rec.field));if(ok)report.filled.push('field'); else report.missing.push(`field (exact CV value and Psychology fallback not offered/committed: ${rec.field})`)}
    return report;
  }
  function valuePresent(el){if(!el)return false;if(el.type==='checkbox'||el.type==='radio')return el.checked;const v=String(el.value||'').trim();if(v&&!/^select one$/i.test(v))return true;return !!window.JobCopilotWorkday?.multiselectSelection?.(el).length}
  function requiredMissingInRows(kind){
    const misses=[];
    for(const {idx,root} of rowContainers(kind)){
      for(const el of controls(root)){
        // A checkbox's label text spans the whole row (other fields' "*"), so only an explicit
        // required attribute makes it required — "I currently work here" is optional.
        const explicit=el.required||el.getAttribute('aria-required')==='true';
        const l=labelFor(el);const req=explicit||(el.type!=='checkbox'&&el.type!=='radio'&&/\*/.test(l));if(req&&!valuePresent(el))misses.push(`${kind} ${idx}: ${l||el.id||'required field'}`)
      }
    }
    return misses;
  }
  function rowIsBlank(root,kind){
    const meaningful=[...root.querySelectorAll('input,textarea')].filter(visible).filter(el=>el.type!=='checkbox'&&el.type!=='radio');
    const vals=meaningful.map(el=>String(el.value||'').trim()).filter(Boolean);
    return vals.length===0;
  }
  async function trimBlankExtraRows(kind,keep){
    const rows=rowContainers(kind);
    for(let i=rows.length-1;i>=keep;i--){
      const r=rows[i]; if(!rowIsBlank(r.root,kind))continue;
      const del=[...r.root.querySelectorAll('button')].filter(visible).find(b=>/^delete$/i.test(text(b))||/delete/i.test(b.getAttribute('aria-label')||''));
      if(del){del.click();await sleep(120)}
    }
  }
  async function bulkFill(profile){
    if(!window.JobCopilotWorkday?.isWorkday?.())return{ok:false,reason:'Not a Workday page.'};
    const step=window.JobCopilotWorkday.currentStep?.()||'';
    if(step?!/my experience/.test(step):!/my experience/i.test(document.body.innerText||''))return{ok:false,reason:'Workday My Experience page not detected.'};
    const exps=(profile.experience||[]).filter(x=>!x.needs_confirmation);
    const edus=(profile.education||[]).filter(x=>!x.needs_confirmation);
    const out={ok:true,employment:[],education:[],created:{}};
    await trimBlankExtraRows('employment',exps.length);
    const er=await ensureRows('employment',exps.length); out.created.employment=er;
    if(!er.ok)return{...out,ok:false,reason:er.reason};
    await sleep(120);
    const eRows=rowContainers('employment');
    for(let i=0;i<exps.length;i++)out.employment.push({record:`${exps[i].role||''} — ${exps[i].employer||''}`,...await fillEmployment(eRows[i].root,exps[i])});

    // Create education only after employment writes settle. Workday can re-render the page
    // while date widgets commit, so pre-created education rows can otherwise be lost.
    await sleep(180);
    if(sectionHeading('education')){
      await trimBlankExtraRows('education',edus.length);
      const dr=await ensureRows('education',edus.length); out.created.education=dr;
      if(!dr.ok)return{...out,ok:false,reason:dr.reason};
      await sleep(160);
      const dRows=rowContainers('education');
      for(let i=0;i<edus.length;i++)out.education.push({record:`${edus[i].degree||''} — ${edus[i].institution||''}`,...await fillEducation(dRows[i].root,edus[i])});
      await sleep(120);
      await trimBlankExtraRows('education',edus.length);
    }else out.created.education={ok:true,count:0,skipped:'No Education section on this Workday form.'};
    out.required_missing=[...requiredMissingInRows('employment'),...requiredMissingInRows('education')];
    out.added_employment=out.employment.filter(x=>x.filled.includes('job_title')&&x.filled.includes('company')).length;
    out.added_education=out.education.filter(x=>x.filled.includes('institution')&&x.filled.includes('degree')).length;
    out.ok=out.required_missing.length===0;
    out.reason=out.ok?'Workday experience and education rows filled.':'Rows were created and filled where safe; some required controls still need review.';
    return out;
  }
  window.JobCopilotWorkdayExperience={bulkFill,repairDates,rowContainers,ensureRows,labelFor};
})();
