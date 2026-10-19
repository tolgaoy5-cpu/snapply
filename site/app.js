// Snapply website: pricing toggle, Chrome Web Store links, and buying Pro from the website
// (Google sign-in -> Snapply session -> Stripe Checkout or the subscription portal).
(function(){
  const API='https://snapply-api.fly.dev';
  const STORE_URL='https://chromewebstore.google.com/detail/snapply/pbciplmicohoeflmnjapakibfgbmjcmb';
  const STORE_LIVE=true; // Chrome Web Store listing approved 2026-10-19
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  let interval='quarter', intent='buy', clientId='';

  // Referral and source tracking: ?ref=CODE is kept for 30 days so the extension (or the sign-in
  // below) can claim it; counts are anonymous (no cookies, no identifiers).
  const params=new URLSearchParams(location.search);
  const store={get:k=>{try{const v=JSON.parse(localStorage.getItem(k)||'null');return v&&v.exp>Date.now()?v.val:''}catch(_){return ''}},
               set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify({val:v,exp:Date.now()+30*864e5}))}catch(_){}}};
  const ref=(params.get('ref')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12);
  if(ref)store.set('snapply_ref',ref);
  const source=(params.get('utm_source')||(ref?'referral':'')||(document.referrer?new URL(document.referrer).hostname.replace(/^www\./,''):'')).slice(0,40);
  if(source)store.set('snapply_source',source);
  const event=name=>{try{navigator.sendBeacon?navigator.sendBeacon(API+'/v1/events',new Blob([JSON.stringify({name,source:store.get('snapply_source')||source})],{type:'application/json'})):fetch(API+'/v1/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,source}),keepalive:true})}catch(_){}};
  if(!document.body.dataset.noVisit)event(document.body.dataset.event||'site_visit');
  if(store.get('snapply_ref')){
    const bar=document.createElement('div');bar.className='refbar';
    bar.textContent='A friend invited you: you both get 15 days of Snapply Pro free after your first application.';
    document.body.prepend(bar);
  }

  // Sticky nav border once the page scrolls.
  const nav=$('#nav');addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>8),{passive:true});

  // "Add to Chrome": the Chrome Web Store once the listing is live; until then, a short
  // "almost here" note that takes an email address to send the install link to.
  $$('[data-store]').forEach(a=>{
    if(STORE_LIVE){a.href=STORE_URL;a.target='_blank';a.rel='noopener';a.addEventListener('click',()=>event('add_to_chrome_click'));return}
    a.onclick=e=>{e.preventDefault();$('#notifyStatus').textContent='';$('#notify').showModal();$('#notifyEmail').focus()};
  });
  $('#notifyForm')&&($('#notifyForm').onsubmit=async e=>{
    e.preventDefault();const st=$('#notifyStatus');st.textContent='Saving…';
    try{
      const r=await fetch(API+'/v1/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#notifyEmail').value.trim()})});
      if(!r.ok)throw new Error('Please check the email address.');
      st.textContent="Thanks — we'll email you the install link as soon as it's live.";$('#notifyForm').hidden=true;
    }catch(err){st.textContent=err.message}
  });

  // Plan length (1 week, 1 month, 3 months).
  const NOTES={week:'£3.99 every week. Cancel any time.',month:'£4.99 for your first month, then £9.99 every month. Cancel any time.',quarter:'£24.99 every 3 months. Cancel any time.'};
  const pick=()=>{interval=($('.durations input:checked')||{}).value||'quarter';$('#proNote').textContent=NOTES[interval]};
  $$('.durations input').forEach(r=>r.onchange=pick);if($('.durations'))pick();

  const session=()=>{try{return sessionStorage.getItem('snapplySession')||''}catch(_){return ''}};
  const setSession=t=>{try{sessionStorage.setItem('snapplySession',t)}catch(_){}};
  async function api(path,body){
    const headers={'Content-Type':'application/json'};const t=session();if(t)headers.Authorization='Bearer '+t;
    const r=await fetch(API+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.detail||`Request failed (${r.status})`);
    return d;
  }
  const status=t=>{$('#signinStatus').textContent=t;$('#buyStatus').textContent=t};

  // After sign-in: buyers go to Checkout (or the portal if already Pro); "Log in" shows the plan.
  async function proceed(){
    const {account}=await api('/v1/me');
    const pro=account.plan==='pro';
    if(intent==='buy'&&!pro){status('Opening secure checkout…');location.href=(await api('/v1/billing/checkout',{interval})).url;return}
    $('#signinTitle').textContent=pro?'You are on Pro ✦':'You are on the Free plan';
    $('#signinIntro').hidden=true;$('#gsi').innerHTML='';$('#gsi').hidden=true;
    const apps=account.applications_limit==null?'Unlimited applications':`${account.applications_used} of ${account.applications_limit} applications`;
    const who=document.createElement('div');who.className='who';
    const email=document.createElement('b');email.textContent=account.email;
    const usage=document.createElement('span');usage.textContent=`${apps} · ${account.ai_used} of ${account.ai_limit} AI drafts this month`;
    who.append(email,usage);
    const b=document.createElement('button');b.className='btn '+(pro?'btn-dark':'btn-brand');
    b.textContent=pro?'Manage subscription':'Get Pro';
    b.onclick=async()=>{try{status('Opening…');location.href=(await api(pro?'/v1/billing/portal':'/v1/billing/checkout',pro?{}:{interval})).url}catch(e){status(e.message)}};
    $('#acct').replaceChildren(who,b);$('#acct').hidden=false;status('');
  }

  async function onCredential(resp){
    try{status('Signing in…');const d=await api('/v1/auth/google',{id_token:resp.credential,ref:store.get('snapply_ref')});setSession(d.session);await proceed()}
    catch(e){status(e.message)}
  }

  async function open(kind){
    intent=kind;const dlg=$('#signin');
    $('#signinTitle').textContent=kind==='buy'?`Get Snapply Pro — ${{week:'1 week',month:'1 month',quarter:'3 months'}[interval]||'Pro'}`:'Log in to Snapply';
    status('');$('#signinIntro').hidden=false;$('#gsi').hidden=false;$('#acct').hidden=true;dlg.showModal();
    try{
      if(session()){try{await proceed();return}catch(_){setSession('')}}
      if(!clientId)clientId=(await api('/health')).google_client_id;
      if(!window.google?.accounts?.id)throw new Error('Google sign-in is still loading — try again in a moment.');
      google.accounts.id.initialize({client_id:clientId,callback:onCredential,ux_mode:'popup'});
      $('#gsi').innerHTML='';google.accounts.id.renderButton($('#gsi'),{theme:'outline',size:'large',shape:'pill',text:'continue_with',width:300});
    }catch(e){status(e.message)}
  }

  $$('[data-action="buy"]').forEach(b=>b.onclick=()=>{event('get_pro_click');open('buy')});
  $$('[data-action="account"]').forEach(b=>b.onclick=e=>{e.preventDefault();open('account')});
  $$('[data-action="close"]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
})();
