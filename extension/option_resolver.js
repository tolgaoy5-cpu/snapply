// V0.19 option resolver: fills only explicit user-confirmed Application Memory values.
// Safety rule: exact normalized option match only. No fuzzy guesses and no submit.
(function(){
  const norm=v=>String(v??'').replace(/\s+/g,' ').trim().toLowerCase();
  const stripFlags=v=>String(v??'').replace(/[\u{1F1E6}-\u{1F1FF}]/gu,'').replace(/\s+/g,' ').trim();
  function semanticCountry(v){
    return norm(stripFlags(v).replace(/\s+\+\d[\d -]*$/,'').trim());
  }
  function setNativeInputValue(el,value){
    const proto=window.HTMLInputElement?.prototype;
    const desc=proto&&Object.getOwnPropertyDescriptor(proto,'value');
    if(desc?.set) desc.set.call(el,value); else el.value=value;
    el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  const esc=v=>{try{return CSS.escape(v)}catch(_){return v}};

  function labelText(el){
    const bits=[];
    if(el?.id){const l=document.querySelector(`label[for="${esc(el.id)}"]`); if(l) bits.push(l.innerText)}
    const wrapped=el?.closest?.('label'); if(wrapped) bits.push(wrapped.innerText);
    ['aria-label','placeholder'].forEach(a=>{const v=el?.getAttribute?.(a); if(v) bits.push(v)});
    return [...new Set(bits.map(x=>String(x||'').replace(/\s+/g,' ').trim()).filter(Boolean))].join(' ');
  }

  function optionGroupForCanonical(canonical){
    const inputs=[...document.querySelectorAll('input[type="checkbox"],input[type="radio"]')].filter(el=>el.offsetParent!==null);
    if(canonical==='title') return inputs.filter(el=>/\btitle\s*\*?/i.test(labelText(el)) || /question_\d+/i.test(el.name||'') && /^(miss|mrs|ms|mr|dr|professor)\b/i.test(labelText(el)));
    return [];
  }

  function exactChoice(group,value){
    const wanted=norm(value);
    return group.find(el=>{
      const label=norm(labelText(el));
      const own=norm(el.value);
      const first=label.split(/\s+question_|\s+title\b/)[0].trim();
      return own===wanted || first===wanted || label===wanted;
    })||null;
  }

  function exactNativeSelect(el,value){
    if(!el || el.tagName!=='SELECT') return null;
    const wanted=norm(value);
    return [...el.options].find(o=>norm(o.text)===wanted || norm(o.value)===wanted)||null;
  }

  function visibleOptionNodes(){
    const selectors='[role="option"],.select__option,[class*="select__option"],[data-option-index],li';
    return [...document.querySelectorAll(selectors)].filter(el=>el.offsetParent!==null && norm(el.innerText));
  }

  function dispatchKey(el,key,code){
    const opts={bubbles:true,cancelable:true,key,code:code||key};
    el.dispatchEvent(new KeyboardEvent('keydown',opts));
    el.dispatchEvent(new KeyboardEvent('keyup',opts));
  }

  function semanticOptionText(v,canonical){
    return canonical==='country' ? semanticCountry(v) : norm(v);
  }

  function findVisibleExactOption(value,canonical){
    const wanted=semanticOptionText(value,canonical);
    const selectors=[
      '[role="option"]',
      '[id*="-option-"]',
      '[class*="option"]',
      '[data-option-index]',
      '[role="listbox"] *'
    ];
    const seen=new Set();
    const nodes=[];
    for(const sel of selectors){
      for(const el of document.querySelectorAll(sel)){
        if(seen.has(el) || el.offsetParent===null) continue;
        seen.add(el);
        const t=String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
        if(!t) continue;
        if(semanticOptionText(t,canonical)===wanted) nodes.push(el);
      }
    }
    // Prefer role=option and leaf-ish nodes so we do not click an entire listbox container.
    nodes.sort((a,b)=>((b.getAttribute('role')==='option')-(a.getAttribute('role')==='option')) || (a.children.length-b.children.length));
    return nodes;
  }

  function committedCountryValue(el){
    const own=semanticCountry(el.value||'');
    if(own) return own;
    const root=el.closest('[class*="select"], [role="combobox"]') || el.parentElement;
    const txt=String(root?.innerText||'').replace(/\s+/g,' ').trim();
    return semanticCountry(txt);
  }

  async function resolveCustomInput(el,value,canonical){
    const wanted=semanticOptionText(value,canonical);
    const previous=el.value;
    el.scrollIntoView({block:'center',inline:'nearest'});
    el.focus({preventScroll:true});

    // React-select style controls usually need a real click before the menu exists.
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'mouse'}));
    el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));
    el.click();
    await new Promise(r=>setTimeout(r,120));

    // Clear only this exact canonical input, never sibling/helper inputs.
    try{setNativeInputValue(el,'');}catch(_){el.value=''}
    dispatchKey(el,'Backspace','Backspace');
    await new Promise(r=>setTimeout(r,40));
    try{setNativeInputValue(el,value);}catch(_){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}
    await new Promise(r=>setTimeout(r,260));

    // Strategy 1: click one exact visible semantic option.
    let exact=findVisibleExactOption(value,canonical);
    if(exact.length===1){
      const node=exact[0];
      const matched=String(node.innerText||node.textContent||'').replace(/\s+/g,' ').trim();
      node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'mouse'}));
      node.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));
      node.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0}));
      node.click();
      await new Promise(r=>setTimeout(r,180));
      const committed=canonical==='country' ? committedCountryValue(el) : norm(el.value);
      if(committed===wanted) return {ok:true,method:'custom_exact_click',matched,verified:true};
    }

    // Strategy 2: React Select commonly highlights the sole filtered option after typing.
    // Use keyboard commit, but only after confirming exactly one semantic option is visible.
    exact=findVisibleExactOption(value,canonical);
    if(exact.length===1){
      dispatchKey(el,'ArrowDown','ArrowDown');
      await new Promise(r=>setTimeout(r,40));
      dispatchKey(el,'Enter','Enter');
      await new Promise(r=>setTimeout(r,180));
      const committed=canonical==='country' ? committedCountryValue(el) : norm(el.value);
      if(committed===wanted) return {ok:true,method:'custom_exact_keyboard',matched:String(exact[0].innerText||exact[0].textContent||'').trim(),verified:true};
    }

    // Strategy 3: if aria-activedescendant points to the exact semantic option, Enter is safe.
    const activeId=el.getAttribute('aria-activedescendant');
    if(activeId){
      const active=document.getElementById(activeId);
      const t=String(active?.innerText||active?.textContent||'').replace(/\s+/g,' ').trim();
      if(active && semanticOptionText(t,canonical)===wanted){
        dispatchKey(el,'Enter','Enter');
        await new Promise(r=>setTimeout(r,180));
        const committed=canonical==='country' ? committedCountryValue(el) : norm(el.value);
        if(committed===wanted) return {ok:true,method:'custom_active_enter',matched:t,verified:true};
      }
    }

    // Restore search text if no verified commit was possible. This does not alter sibling fields.
    try{setNativeInputValue(el,previous||'');}catch(_){el.value=previous||''}
    return {ok:false,reason:'Could not verify an exact option commit; left for user review.'};
  }

  function canonicalFor(el){
    const wd=window.JobCopilotWorkday?.canonicalFrom?.(el); if(wd) return wd;
    const id=norm(el.id), name=norm(el.name), txt=norm(labelText(el));
    if(id==='country'||name==='country') return 'country';
    if(/recent nhs experience/.test(txt)||/question_18744472003/.test(id)) return 'recent_nhs_experience';
    if(/phone device type/.test(txt)||/phone.*device.*type/.test(id)||/phone.*device.*type/.test(name)) return 'phone_device_type';
    if(/how did you hear about us/.test(txt)||/source--source/.test(id)) return 'application_source';
    if(/country phone code/.test(txt)||/phonenumber--countryphonecode/.test(id)) return 'phone_country_code';
    return null;
  }

  async function applyConfirmed(memory){
    const results=[];
    const mem=memory||{};

    // Honorific/title groups.
    if(mem.title?.value){
      const group=optionGroupForCanonical('title');
      const match=exactChoice(group,mem.title.value);
      if(match){
        if(!match.checked) match.click();
        results.push({canonical:'title',ok:true,method:'choice_exact',matched:labelText(match)});
      } else if(!(window.JobCopilotWorkday?.virtualControls?.()||[]).some(v=>v.canonical==='title')) results.push({canonical:'title',ok:false,reason:'Exact title option not found.'});
    }

    // Native selects and custom combobox-like inputs.
    for(const el of [...document.querySelectorAll('select,input')].filter(x=>x.offsetParent!==null)){
      const canonical=canonicalFor(el); if(!canonical) continue;
      const item=mem[canonical] || (canonical==='phone_country_code'?mem.country:null); if(!item?.value) continue;
      const value=item.value;
      if(el.tagName==='SELECT'){
        const o=exactNativeSelect(el,value);
        if(o){el.value=o.value;el.dispatchEvent(new Event('change',{bubbles:true}));results.push({canonical,ok:true,method:'native_exact',matched:o.text.trim()});}
        else results.push({canonical,ok:false,reason:'Exact native option not found.'});
      } else {
        // Country / Greenhouse React-like input or custom question input.
        const r=await resolveCustomInput(el,value,canonical); results.push({canonical,...r});
      }
    }
    // Workday non-input dropdowns such as Phone Device Type.
    for(const v of (window.JobCopilotWorkday?.virtualControls?.()||[])){
      const item=mem[v.canonical] || (v.canonical==='phone_country_code'?mem.country:null);
      if(!item?.value || window.JobCopilotWorkday.complete(v.el)) continue;
      const r=await window.JobCopilotWorkday.chooseExact(v.el,item.value,v.canonical);
      results.push({canonical:v.canonical,...r});
    }
    return {ok:true,results,filled:results.filter(x=>x.ok).length,review_required:results.filter(x=>!x.ok).length};
  }

  window.JobCopilotOptionResolver={applyConfirmed};
})();
