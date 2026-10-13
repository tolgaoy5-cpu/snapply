(function(){
  const norm=v=>String(v??'').replace(/\s+/g,' ').trim().toLowerCase();
  const visible=el=>{try{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.offsetParent!==null}catch(_){return false}};
  function isWorkday(){return /(^|\.)[^.]*workdayjobs\.com$/i.test(location.hostname)||/workday/i.test(location.hostname)}
  function canonicalFrom(el){
    const id=String(el?.id||'').toLowerCase(), name=String(el?.getAttribute?.('name')||'').toLowerCase();
    const key=`${id} ${name}`;
    if(/source--source/.test(key)) return 'application_source';
    if(/legalname--title/.test(key)) return 'title';
    if(/phonenumber--phonetype/.test(key)) return 'phone_device_type';
    if(/legalname--firstname|legalname.*first/.test(key)) return 'first_name';
    if(/legalname--lastname|legalname.*last/.test(key)) return 'last_name';
    if(/address--addressline1/.test(key)) return 'address';
    if(/address--addressline2/.test(key)) return 'address_line2';
    if(/address--addressline3/.test(key)) return 'address_line3';
    if(/address--city/.test(key)) return 'city';
    if(/address--postalcode/.test(key)) return 'postcode';
    if(/phonenumber--countryphonecode/.test(key)) return 'phone_country_code';
    if(/phonenumber--phonenumber/.test(key)) return 'phone';
    if(/phonenumber--extension/.test(key)) return 'phone_extension';
    return null;
  }
  function fieldText(el){
    const bits=[];
    if(el?.id){try{const l=document.querySelector(`label[for="${CSS.escape(el.id)}"]`);if(l)bits.push(l.innerText)}catch(_){}}
    ['aria-label','data-automation-label','placeholder'].forEach(a=>{const v=el?.getAttribute?.(a);if(v)bits.push(v)});
    let p=el;
    for(let i=0;i<4&&p;i++,p=p.parentElement){
      const t=String(p.innerText||'').replace(/\s+/g,' ').trim();
      if(t&&t.length<220) bits.push(t);
    }
    return [...new Set(bits.map(x=>String(x||'').replace(/\s+/g,' ').trim()).filter(Boolean))].join(' ');
  }
  function virtualControls(){
    if(!isWorkday()) return [];
    const raw=[...document.querySelectorAll('[role="combobox"],button[aria-haspopup="listbox"],[aria-haspopup="listbox"]')].filter(visible);
    const out=[];
    for(const el of raw){
      if(el.matches('input,select,textarea')) continue;
      if(el.querySelector('input,select,textarea')) continue;
      const txt=fieldText(el);
      let canonical=null;
      if(/legalname--title/i.test(el.id)||/\bprefix\b/i.test(el.getAttribute('aria-label')||'')) canonical='title';
      else if(/phone device type/i.test(txt)) canonical='phone_device_type';
      else if(/country phone code/i.test(txt)) canonical='phone_country_code';
      else if(/how did you hear about us/i.test(txt)) canonical='application_source';
      else if(/^country\b|\bcountry\*/i.test(txt)) canonical='country';
      if(!canonical) continue;
      const required=/\*|\brequired\b/i.test(el.getAttribute('aria-label')||'')||el.getAttribute('aria-required')==='true';
      out.push({el,canonical,label:txt.slice(0,180),required});
    }
    return out.filter((x,i,a)=>a.findIndex(y=>y.el===x.el)===i);
  }
  function selectedText(el){
    const t=String(el?.innerText||el?.textContent||'').replace(/\s+/g,' ').trim();
    if(!t||/^select one$/i.test(t)||/^search$/i.test(t)) return '';
    return t;
  }
  function complete(el){return !!selectedText(el)}
  // Active application step from the progress bar, e.g. "my experience". Every step's label is
  // visible in the bar, so body text alone cannot tell which step is open.
  function currentStep(){
    const t=document.querySelector?.('[data-automation-id="progressBarActiveStep"]')?.innerText||'';
    return String(t).split('\n').map(s=>s.trim()).filter(s=>s&&!/^current step/i.test(s)).join(' ').toLowerCase();
  }
  // Workday multiselect prompts (How Did You Hear About Us?, Country Phone Code) keep the
  // search <input> empty after a choice; the selection lives in sibling selectedItem pills.
  function multiselectSelection(el){
    const box=el?.closest?.('[data-automation-id="multiSelectContainer"]');
    if(!box) return [];
    return [...box.querySelectorAll('[data-automation-id="selectedItem"]')]
      .map(n=>String(n.innerText||n.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean);
  }
  function optionNodes(){
    const sels=['[role="option"]','[data-automation-id="promptOption"]','[data-automation-id*="promptOption"]','[role="listbox"] [data-automation-id]'];
    const seen=new Set(),out=[];
    for(const s of sels){for(const el of document.querySelectorAll(s)){if(seen.has(el)||!visible(el))continue;seen.add(el);const t=String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();if(t)out.push(el)}}
    return out;
  }
  async function chooseExact(el,value,canonical){
    const wanted=norm(value);
    try{el.scrollIntoView({block:'center'});el.click()}catch(_){return {ok:false,reason:'Could not open Workday control.'}}
    await new Promise(r=>setTimeout(r,160));
    const nodes=optionNodes();
    const semantic=t=>{
      let x=norm(t);
      if(canonical==='title') x=x.replace(/\.$/,'');
      if(canonical==='phone_country_code'||canonical==='country') x=x.replace(/^.*?united kingdom.*$/,'united kingdom');
      return x;
    };
    const target=canonical==='title'?semantic(wanted):wanted;
    const exact=nodes.filter(n=>semantic(n.innerText||n.textContent)===target || norm(n.innerText||n.textContent)===wanted);
    if(exact.length!==1){
      try{document.body.click()}catch(_){ }
      return {ok:false,reason:`Expected one exact Workday option for ${value}; found ${exact.length}.`};
    }
    exact[0].click();
    await new Promise(r=>setTimeout(r,120));
    const selected=norm(selectedText(el));
    const verified=canonical==='phone_country_code'?(/united kingdom|\+44/.test(selected)&&wanted==='united kingdom'):canonical==='title'?semantic(selected)===target:selected.includes(wanted);
    return verified?{ok:true,method:'workday_exact_click',matched:String(exact[0].innerText||'').trim(),verified:true}:{ok:false,reason:'Workday option click could not be verified.'};
  }
  window.JobCopilotWorkday={isWorkday,canonicalFrom,virtualControls,fieldText,selectedText,complete,multiselectSelection,currentStep,chooseExact};
})();
