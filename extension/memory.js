// Application Memory V0.22: backend-persisted source of truth with local fallback/cache.
(function(){
  const ALLOWED_KEYS=new Set([
    'notice_period','salary_expectation','willing_to_relocate','preferred_work_arrangement',
    'driving_licence','right_to_work','sponsorship','country','postcode','title','recent_nhs_experience',
    'address','address_line2','address_line3','city','phone_device_type','phone_extension','phone_country_code','application_source'
  ]);
  const DEFAULT_API='http://127.0.0.1:8787';
  async function apiBase(){
    const {apiBase}=await chrome.storage.local.get('apiBase');
    return apiBase||DEFAULT_API;
  }
  async function api(path,opts={}){
    const r=await fetch((await apiBase())+path,opts);
    if(!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
    return r.json();
  }
  async function localGet(){
    const {applicationMemory}=await chrome.storage.local.get('applicationMemory');
    return applicationMemory||{};
  }
  async function syncFromBackend(){
    try{
      const state=await api('/v1/state');
      const memory=state.application_memory||{};
      const cached=await localGet();
      // A newly started backend with an empty/misconfigured data directory must
      // not silently erase confirmed answers cached by the extension.
      const effective=(!Object.keys(memory).length&&Object.keys(cached).length)?cached:memory;
      if(effective===memory)await chrome.storage.local.set({applicationMemory:memory});
      if(state.master_profile && Object.keys(state.master_profile).length){
        await chrome.storage.local.set({masterProfile:state.master_profile});
      }
      return effective;
    }catch(_){
      return localGet();
    }
  }
  async function getAll(){
    // Prefer backend so extension reinstalls do not erase confirmed answers.
    return syncFromBackend();
  }
  async function set(key,value,meta={}){
    if(!ALLOWED_KEYS.has(key)) throw new Error('Unsupported memory key');
    const clean=String(value??'').trim();
    if(!clean) throw new Error('Confirmed answer cannot be empty');
    const item={value:clean,confirmed_at:new Date().toISOString(),source:meta.source||'user_confirmed'};
    try{
      const d=await api('/v1/state/memory/item',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key,value:clean,confirmed_at:item.confirmed_at,source:item.source})
      });
      await chrome.storage.local.set({applicationMemory:d.application_memory||{[key]:d.item}});
      return d.item||item;
    }catch(e){
      // Local fallback keeps prototype usable if backend temporarily stops.
      const all=await localGet();all[key]=item;await chrome.storage.local.set({applicationMemory:all});
      item.persistence_warning=e.message;return item;
    }
  }
  async function mergeIntoProfile(profile){
    const all=await getAll();
    const out={...(profile||{})};const confirmed={};
    Object.entries(all).forEach(([k,v])=>{
      if(!ALLOWED_KEYS.has(k) || !v || v.value===undefined || v.value===null || String(v.value).trim()==='') return;
      out[k]=v.value;
      confirmed[k]={value:v.value,confirmed_at:v.confirmed_at||null,source:v.source||'user_confirmed'};
    });
    out.__confirmed_memory=confirmed;return out;
  }
  // Saved answers to application questions ("ask once, remember"). Backend only: these are
  // the user's own declarations, so there is no silent local fallback that could diverge.
  async function getAnswers(){
    const state=await api('/v1/state');
    return Object.values(state.saved_answers||{});
  }
  async function saveAnswer({signature,question,value,kind,sensitivity}){
    const d=await api('/v1/state/answers',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({signature,question,value:String(value??'').trim(),kind,sensitivity,confirmed_at:new Date().toISOString(),source:'user_confirmed'})});
    return d.item;
  }
  async function deleteAnswer(signature){
    return api('/v1/state/answers/'+encodeURIComponent(signature),{method:'DELETE'});
  }
  // Saved referees (other people's details the user entered once and confirms before each use).
  async function getReferees(){const state=await api('/v1/state');return state.referees||[]}
  async function saveReferees(referees){
    const d=await api('/v1/state/referees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({referees})});
    return d.referees||[];
  }
  window.JobCopilotMemory={getAll,set,mergeIntoProfile,syncFromBackend,getAnswers,saveAnswer,deleteAnswer,getReferees,saveReferees,allowedKeys:[...ALLOWED_KEYS]};
})();
