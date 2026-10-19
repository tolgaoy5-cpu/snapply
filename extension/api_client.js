// API client for the Snapply backend: the local one (127.0.0.1, no sign-in) or the hosted one
// (Google sign-in, session token in chrome.storage.local).
(function(){
  const LOCAL='http://127.0.0.1:8787';
  const CLOUD='https://snapply-api.fly.dev';
  async function base(){const x=await chrome.storage.local.get('apiBase');return x.apiBase||LOCAL}
  async function setBase(url){await chrome.storage.local.set({apiBase:url});healthCache=null;await ensureScope()}
  let healthCache=null;
  // Server mode: {auth:'none'} locally, {auth:'google', google_client_id} on the hosted service.
  async function mode(){
    if(!healthCache)healthCache=fetch((await base())+'/health').then(r=>r.json()).catch(()=>({auth:'none',offline:true}));
    return healthCache;
  }
  async function isCloud(){return (await mode()).auth==='google'}
  async function session(){return (await chrome.storage.local.get('snapplySession')).snapplySession||''}
  // Account id from the session token's (unsigned-readable) payload; '' when signed out or local.
  function sessionUid(token){
    try{const p=token.split('.')[0].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(p+'='.repeat((4-p.length%4)%4))).uid||''}
    catch(_){return ''}
  }
  async function uid(){return sessionUid(await session())}
  // Cached copies of server data belong to one server + account. When either changes, drop them so a
  // different account (or the local server) never shows the previous person's CV or answers.
  const CACHE_KEYS=['masterProfile','applicationMemory','savedCV','currentJob','coverLetterDraft','answerQueueV012','jobCopilotSession'];
  async function ensureScope(){
    const scope=(await base())+'|'+(await uid());
    const {cacheScope}=await chrome.storage.local.get('cacheScope');
    if(cacheScope!==scope){await chrome.storage.local.remove(CACHE_KEYS);await chrome.storage.local.set({cacheScope:scope})}
  }
  // Browser-only data (legal/personal answers, referees) is kept per account.
  async function accountKey(name){const id=await uid();return id?`${name}:${id}`:name}
  // fetch() with the session attached; returns the raw Response.
  async function raw(path,opts={}){
    await ensureScope();
    const headers={...(opts.headers||{})};
    const token=await session(); if(token)headers.Authorization='Bearer '+token;
    const r=await fetch((await base())+path,{...opts,headers});
    if(r.status===401&&token){await chrome.storage.local.remove('snapplySession');window.dispatchEvent(new Event('snapply-signed-out'))}
    return r;
  }
  async function request(path,opts){
    const r=await raw(path,opts);
    if(!r.ok){
      const text=await r.text();let detail=text;try{detail=JSON.parse(text).detail||text}catch(_){}
      const e=new Error(r.status===401?`Please sign in to Snapply. (${detail})`:r.status===402?detail:`API ${r.status}: ${text}`);
      e.status=r.status;throw e;
    }
    return r.json();
  }
  async function get(path){return request(path,{method:'GET'})}
  async function post(path,payload){return request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})}
  async function del(path){return request(path,{method:'DELETE'})}
  async function uploadCV(file){const fd=new FormData();fd.append('file',file,file.name);return request('/v1/profile/import',{method:'POST',body:fd})}

  // Google sign-in: an OpenID id_token from Google's consent page, exchanged for a Snapply session.
  async function signIn(){
    const m=await mode();
    if(m.auth!=='google'||!m.google_client_id)throw new Error('This server does not use sign-in.');
    const nonce=crypto.getRandomValues(new Uint32Array(4)).join('');
    const url='https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({
      client_id:m.google_client_id,response_type:'id_token',redirect_uri:chrome.identity.getRedirectURL(),
      scope:'openid email profile',nonce,prompt:'select_account'});
    const redirect=await chrome.identity.launchWebAuthFlow({url,interactive:true});
    const idToken=new URLSearchParams(new URL(redirect).hash.slice(1)).get('id_token');
    if(!idToken)throw new Error('Google sign-in was cancelled.');
    const {snapplyRef}=await chrome.storage.local.get('snapplyRef');
    const d=await post('/v1/auth/google',{id_token:idToken,ref:snapplyRef||''});
    await chrome.storage.local.set({snapplySession:d.session});await chrome.storage.local.remove('snapplyRef');
    await ensureScope();
    return d.account;
  }
  async function signOut(){await chrome.storage.local.remove('snapplySession');await ensureScope()}
  async function account(){return (await get('/v1/me')).account}
  window.JobCopilotAPI={get,post,del,raw,base,setBase,mode,isCloud,session,uid,ensureScope,accountKey,uploadCV,signIn,signOut,account,LOCAL,CLOUD};
})();
