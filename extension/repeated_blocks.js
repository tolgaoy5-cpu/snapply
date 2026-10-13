(function(){
  function visible(el){const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.offsetParent!==null}
  function norm(s){return String(s||'').replace(/\s+/g,' ').trim().toLowerCase()}
  function label(el){const a=[];if(el.id){const l=document.querySelector(`label[for="${CSS.escape(el.id)}"]`);if(l)a.push(l.innerText)}if(el.closest('label'))a.push(el.closest('label').innerText);['aria-label','placeholder','name','id','data-automation-id'].forEach(k=>{if(el.getAttribute(k))a.push(el.getAttribute(k))});return norm(a.join(' '))}
  const F={employer:/employer|company|organisation|organization/,job_title:/job\s*title|position|role/,start_date:/start\s*date|date\s*from|from\s*date/,end_date:/end\s*date|date\s*to|to\s*date/,institution:/university|college|institution|school/,qualification:/degree|qualification|course|subject/};
  function canon(el){const l=label(el);return Object.entries(F).find(([,r])=>r.test(l))?.[0]||null}
  function kindOf(root){const t=norm((root.innerText||'')+' '+(root.className||'')+' '+(root.id||''));if(/employment|work history|experience|previous employer/.test(t))return'employment';if(/education|qualification|academic/.test(t))return'education';return null}
  function strategyRoots(){
    const current=window.JobCopilotRepeatedStrategies?.current?.()||{name:'GENERIC',strategy:{rowSelectors:['fieldset','.form-group','.question','.field','.row','section']}};
    const candidates=[];for(const sel of current.strategy.rowSelectors||[]){try{document.querySelectorAll(sel).forEach(x=>candidates.push(x))}catch(_){}}
    const uniq=[...new Set(candidates)].filter(visible).filter(r=>{const cs=[...r.querySelectorAll('input,select,textarea')].filter(visible).map(canon).filter(Boolean);const t=norm(r.innerText||'');return (cs.includes('employer')&&cs.includes('job_title'))||(cs.includes('institution')&&cs.includes('qualification'))||((/employment|education|qualification/.test(t))&&cs.length>=2)});
    const leaf=uniq.filter(r=>!uniq.some(o=>o!==r&&r.contains(o)));return {ats:current.name,roots:leaf.length?leaf:uniq,strategy:current.strategy};
  }
  function parseDates(s){const m=String(s||'').match(/(\d{2})\/(\d{4})\s*-\s*(Present|Current|(\d{2})\/(\d{4}))/i);if(!m)return{};return{start:`${m[2]}-${m[1]}`,end:/present|current/i.test(m[3])?'':`${m[5]}-${m[4]}`}}
  function fire(el){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
  function set(el,val){if(val===undefined||val===null||val==='')return false;if((el.type==='checkbox'||el.type==='radio')?el.checked:!!el.value)return false;if(window.JobCopilotDateControls?.setDateField?.(el,val))return true;if(el.tagName==='SELECT'){const ok=window.JobCopilotDateControls?.selectByValueOrText?.(el,val);if(ok)return true;const w=norm(val);const o=[...el.options].find(x=>norm(x.text)===w||norm(x.value)===w);if(!o)return false;el.value=o.value}else{el.focus();el.value=val}fire(el);return true}
  function records(profile,kind){return kind==='employment'?(profile.experience||[]):(profile.education||[])}
  function addButton(kind,strategy){
    const words=kind==='employment'?/add.*(employment|experience|job)|another.*(employment|experience|job)/i:/add.*(education|qualification|school)|another.*(education|qualification|school)/i;
    const all=[];for(const sel of strategy.addButtons||['button','a']){try{document.querySelectorAll(sel).forEach(x=>all.push(x))}catch(_){}}
    return [...new Set(all)].filter(visible).find(x=>words.test((x.innerText||'')+' '+(x.getAttribute('aria-label')||'')))||null;
  }
  async function ensureRows(profile,kind){
    let s=strategyRoots();let roots=s.roots.filter(r=>kindOf(r)===kind||([...r.querySelectorAll('input,select,textarea')].some(e=>canon(e)===(kind==='employment'?'employer':'institution'))));
    const need=records(profile,kind).filter(r=>!r.needs_confirmation).length;
    let clicks=0;
    while(roots.length<need&&clicks<Math.min(need,8)){
      const b=addButton(kind,s.strategy);if(!b)break;b.click();clicks++;await new Promise(r=>setTimeout(r,80));s=strategyRoots();roots=s.roots.filter(r=>kindOf(r)===kind||([...r.querySelectorAll('input,select,textarea')].some(e=>canon(e)===(kind==='employment'?'employer':'institution'))));
    }
    return {roots,clicks,ats:s.ats};
  }
  function plan(profile){const {ats,roots}=strategyRoots();return roots.map((root,idx)=>{const els=[...root.querySelectorAll('input,select,textarea')].filter(visible);const kind=kindOf(root)||(els.some(e=>canon(e)==='employer')?'employment':'education');const fields=els.map((el,i)=>({i,key:canon(el),label:label(el),has_value:(el.type==='checkbox'||el.type==='radio')?el.checked:!!el.value})).filter(x=>x.key);return{ats,block_index:idx,kind,fields,record_count:records(profile,kind).length,decision:fields.length>=2?'REVIEW':'ASK_USER'}})}
  function fillRoot(root,rec,kind){
    const els=[...root.querySelectorAll('input,select,textarea')].filter(visible);const d=parseDates(rec.dates);const map=kind==='employment'?{employer:rec.employer,job_title:rec.role,start_date:d.start,end_date:d.end}:{institution:rec.institution,qualification:rec.degree,start_date:d.start,end_date:d.end};let n=0;
    for(const el of els){const k=canon(el);if(k&&set(el,map[k]))n++}
    if(d.start)n+=window.JobCopilotDateControls?.setCompositeDate?.(root,d.start,'start')?.filled||0;
    if(d.end)n+=window.JobCopilotDateControls?.setCompositeDate?.(root,d.end,'end')?.filled||0;
    return n;
  }
  async function fill(profile){
    const out=[];
    for(const kind of ['employment','education']){
      const ensured=await ensureRows(profile,kind);const recs=records(profile,kind);let ri=0;
      for(let idx=0;idx<ensured.roots.length&&ri<recs.length;idx++){
        const rec=recs[ri++];if(rec.needs_confirmation){out.push({ats:ensured.ats,block_index:idx,kind,filled:0,decision:'REVIEW',reason:'Profile record has unresolved data; not auto-filled'});continue}
        const n=fillRoot(ensured.roots[idx],rec,kind);out.push({ats:ensured.ats,block_index:idx,kind,record:kind==='employment'?`${rec.role||''} — ${rec.employer||''}`:`${rec.degree||''} — ${rec.institution||''}`,filled:n,decision:n?'HIGH':'REVIEW',rows_added:ensured.clicks});
      }
    }
    return out;
  }
  window.JobCopilotRepeated={plan,fill,_strategyRoots:strategyRoots,_ensureRows:ensureRows};
})();
