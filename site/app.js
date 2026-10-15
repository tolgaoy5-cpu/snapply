// Snapply website: pricing toggle, Chrome Web Store links, and buying Pro from the website
// (Google sign-in -> Snapply session -> Stripe Checkout or the subscription portal).
(function(){
  const API='https://snapply-api.fly.dev';
  const STORE_URL='https://chromewebstore.google.com/detail/pbciplmicohoeflmnjapakibfgbmjcmb';
  const STORE_LIVE=false; // set true once the Chrome Web Store listing is approved
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  let interval='month', intent='buy', clientId='';

  // Sticky nav border once the page scrolls.
  const nav=$('#nav');addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>8),{passive:true});

  // "Add to Chrome": the Chrome Web Store once the listing is live; until then, a short
  // "almost here" note that takes an email address to send the install link to.
  $$('[data-store]').forEach(a=>{
    if(STORE_LIVE){a.href=STORE_URL;a.target='_blank';a.rel='noopener';return}
    a.onclick=e=>{e.preventDefault();$('#notifyStatus').textContent='';$('#notify').showModal();$('#notifyEmail').focus()};
  });
  $('#notifyForm').onsubmit=async e=>{
    e.preventDefault();const st=$('#notifyStatus');st.textContent='Saving…';
    try{
      const r=await fetch(API+'/v1/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#notifyEmail').value.trim()})});
      if(!r.ok)throw new Error('Please check the email address.');
      st.textContent="Thanks — we'll email you the install link as soon as it's live.";$('#notifyForm').hidden=true;
    }catch(err){st.textContent=err.message}
  };

  // Monthly / yearly prices.
  const PRICES={month:['£4.99<small> / month</small>','for your first 2 months, then £9.99/month. Cancel any time.'],
                year:['£79<small> / year</small>','£6.58 a month, billed yearly. Cancel any time.']};
  $$('.toggle button').forEach(b=>b.onclick=()=>{
    interval=b.dataset.interval;
    $$('.toggle button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-selected',x===b)});
    $('#proPrice').innerHTML=PRICES[interval][0];$('#proNote').textContent=PRICES[interval][1];
  });

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
    const apps=account.applications_limit==null?'unlimited applications':`${account.applications_used} of ${account.applications_limit} applications`;
    $('#gsi').innerHTML='';
    const p=document.createElement('p');p.textContent=`${account.email} · ${apps} and ${account.ai_used} of ${account.ai_limit} AI drafts used this month.`;
    const b=document.createElement('button');b.className='btn '+(pro?'btn-dark':'btn-brand');b.style.width='100%';
    b.textContent=pro?'Manage subscription':'Get Pro';
    b.onclick=async()=>{try{status('Opening…');location.href=(await api(pro?'/v1/billing/portal':'/v1/billing/checkout',pro?{}:{interval})).url}catch(e){status(e.message)}};
    $('#gsi').append(p,b);status('');
  }

  async function onCredential(resp){
    try{status('Signing in…');const d=await api('/v1/auth/google',{id_token:resp.credential});setSession(d.session);await proceed()}
    catch(e){status(e.message)}
  }

  async function open(kind){
    intent=kind;const dlg=$('#signin');
    $('#signinTitle').textContent=kind==='buy'?(interval==='year'?'Get Snapply Pro — yearly':'Get Snapply Pro'):'Log in to Snapply';
    status('');dlg.showModal();
    try{
      if(session()){try{await proceed();return}catch(_){setSession('')}}
      if(!clientId)clientId=(await api('/health')).google_client_id;
      if(!window.google?.accounts?.id)throw new Error('Google sign-in is still loading — try again in a moment.');
      google.accounts.id.initialize({client_id:clientId,callback:onCredential,ux_mode:'popup'});
      $('#gsi').innerHTML='';google.accounts.id.renderButton($('#gsi'),{theme:'outline',size:'large',shape:'pill',text:'continue_with',width:300});
    }catch(e){status(e.message)}
  }

  $$('[data-action="buy"]').forEach(b=>b.onclick=()=>open('buy'));
  $$('[data-action="account"]').forEach(b=>b.onclick=e=>{e.preventDefault();open('account')});
  $$('[data-action="close"]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
})();
