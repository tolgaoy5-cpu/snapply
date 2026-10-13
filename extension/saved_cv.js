// V0.23 reusable CV store.
// Backend persistence is primary so extension reinstalls do not lose the saved CV.
// Local extension storage remains a fast fallback/cache. Attachment is always user-triggered.
(function(){
  const KEY='savedCV';
  const MAX_BYTES=15*1024*1024;
  function readAsDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Failed to read CV'));r.readAsDataURL(file)})}
  async function saveLocal(file){
    if(!file) throw new Error('Choose a CV file first.');
    if(file.size>MAX_BYTES) throw new Error('CV is too large for reusable storage (15 MB max in prototype).');
    const dataUrl=await readAsDataURL(file); const comma=dataUrl.indexOf(','); if(comma<0) throw new Error('Could not encode CV.');
    const item={name:file.name,type:file.type||'application/octet-stream',size:file.size,lastModified:file.lastModified||Date.now(),base64:dataUrl.slice(comma+1),saved_at:new Date().toISOString(),storage:'local-cache'};
    await chrome.storage.local.set({[KEY]:item}); return item;
  }
  async function local(){const x=await chrome.storage.local.get(KEY);return x[KEY]||null}
  async function backendMeta(){
    const d=await window.JobCopilotAPI.get('/v1/state/cv'); return d.saved?d.cv:null;
  }
  function arrayBufferToBase64(buf){
    const bytes=new Uint8Array(buf); let binary=''; const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
    return btoa(binary);
  }
  async function fetchBackendPayload(){
    const meta=await backendMeta(); if(!meta) return null;
    const base=await window.JobCopilotAPI.base(); const r=await fetch(base+'/v1/state/cv/content');
    if(!r.ok) throw new Error(`Saved CV fetch failed: ${r.status}`);
    const buf=await r.arrayBuffer();
    return {name:meta.name||'cv',type:meta.type||r.headers.get('content-type')||'application/octet-stream',size:buf.byteLength,lastModified:Date.now(),base64:arrayBufferToBase64(buf),saved_at:meta.saved_at||null,storage:'backend'};
  }
  async function get(){
    // Prefer backend because it survives extension removal/reinstall.
    let backendError=null;
    try{const meta=await backendMeta(); if(meta) return {...meta,storage:'backend'}}catch(e){backendError=e}
    const cached=await local();
    if(cached)return cached;
    if(backendError)throw new Error('Saved CV status could not be checked. Start the local backend and retry; do not re-import the CV.');
    return null;
  }
  async function getPayload(){
    let backendError=null;
    try{const fromBackend=await fetchBackendPayload(); if(fromBackend) return fromBackend}
    catch(e){backendError=e}
    const cached=await local();if(cached)return cached;
    if(backendError)throw new Error('Local backend is unavailable or the saved CV could not be fetched. Start the backend and retry; do not re-import the CV.');
    return null;
  }
  async function forget(){
    await chrome.storage.local.remove(KEY);
    try{const base=await window.JobCopilotAPI.base(); await fetch(base+'/v1/state/cv',{method:'DELETE'});}catch(_){}
  }
  window.JobCopilotSavedCV={saveLocal,get,getPayload,forget,MAX_BYTES};
})();
