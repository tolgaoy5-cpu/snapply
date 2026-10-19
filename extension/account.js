// Account bar: sign-in, plan and AI allowance on the hosted service; server choice in Advanced.
(function(){
  const API=()=>window.JobCopilotAPI;
  const box=()=>document.getElementById('account');
  function button(text,onclick,cls=''){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;b.onclick=onclick;return b}
  function line(text,cls='muted'){const d=document.createElement('div');d.className=cls;d.textContent=text;return d}
  async function openTab(path,payload={}){
    const b=box();b.querySelector('.acct-status')?.remove();
    try{const d=await API().post(path,payload);window.open(d.url,'_blank','noopener')}
    catch(e){b.append(line(e.message,'acct-status muted'))}
  }
  async function render(){
    const b=box();if(!b)return;b.replaceChildren();
    const m=await API().mode();
    if(m.auth!=='google'){b.hidden=true;return}
    b.hidden=false;
    if(!await API().session()){
      const code=document.createElement('input');code.placeholder='Invite code (optional)';code.maxLength=12;code.className='acct-code';
      const {snapplyRef}=await chrome.storage.local.get('snapplyRef');if(snapplyRef)code.value=snapplyRef;
      code.onchange=()=>chrome.storage.local.set({snapplyRef:code.value.trim().toUpperCase()});
      b.append(line('Sign in to use Snapply','acct-title'),
        line('Your CV and saved answers are kept in your account. Personal and legal answers and referees stay in this browser only.'),
        button('Sign in with Google',async e=>{e.target.disabled=true;try{await API().signIn();render();window.dispatchEvent(new Event('snapply-signed-in'))}catch(err){b.append(line(err.message,'acct-status muted'));e.target.disabled=false}},'primary-small'),code);
      return;
    }
    let a;try{a=await API().account()}catch(e){b.append(line(e.message));return}
    const pro=a.plan==='pro';
    const inviteUrl=`https://snapply.co.uk/?ref=${a.referral_code}`;
    const copy=button('🎁 Copy invite link',async e=>{try{await navigator.clipboard.writeText(inviteUrl);e.target.textContent='Copied ✓ Send it to a friend'}catch(_){e.target.textContent=inviteUrl}},'primary-small');
    const invite=document.createElement('div');invite.className='acct-invite-card';
    invite.append(line('Invite a friend, get 15 days of Pro','acct-invite-title'),
      line(`They get 15 days of Pro too, after their first application.${a.referral_rewards?` You've earned ${a.referral_rewards*15} days so far.`:''}`,'acct-invite'),copy);
    const offer=!pro&&m.launch_offer;
    // Plans come from the server so prices can change without an extension update.
    const plans=(m.plans&&m.plans.length)?m.plans:[{interval:'week',label:'1 week',price:3.99,per_day:0.57},{interval:'month',label:'1 month',price:9.99,per_day:0.33},{interval:'quarter',label:'3 months',price:24.99,per_day:0.27,popular:true}];
    const gbp=n=>'£'+Number(n).toFixed(2);
    const planLabel=p=>`${p.label} · ${offer&&p.launch_price?`${gbp(p.launch_price)} first month`:gbp(p.price)} · ${gbp(p.per_day)}/day${p.popular?' · Most popular':''}`;
    b.append(line(`${a.email} · ${pro?'Pro':'Free'} plan`,'acct-title'),
      line(a.applications_limit==null?`Applications this month: ${a.applications_used||0} (unlimited)`:`Applications this month: ${a.applications_used||0} of ${a.applications_limit}`),
      line(`AI drafts this month: ${a.ai_used} of ${a.ai_limit}`),
      ...(pro?[]:[line(`Pro: unlimited applications, 300 AI drafts and cover letters.${offer?' Launch offer: your first month for £4.99, then £9.99/month.':''}`,'acct-offer')]),
      ...(pro?[button('Manage subscription',()=>openTab('/v1/billing/portal'))]:plans.map(p=>button(planLabel(p),()=>openTab('/v1/billing/checkout',{interval:p.interval}),p.popular?'primary-small':''))),
      ...(a.pro_until?[line(`Free Pro until ${new Date(a.pro_until).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`)]:[]),
      invite,
      button('Sign out',async()=>{await API().signOut();render()}),
      button('Delete account',async e=>{
        // Two-step confirmation inside the panel (no browser dialogs): first click arms, second deletes.
        if(e.target.dataset.armed!=='1'){e.target.dataset.armed='1';e.target.textContent='Click again to delete your account, CV and saved answers';return}
        try{await API().del('/v1/me');await chrome.storage.local.remove([await API().accountKey('browserAnswers'),await API().accountKey('browserReferees'),await API().accountKey('documentLibrary')]);await API().signOut();render()}
        catch(err){b.append(line(err.message,'acct-status muted'))}
      }));
  }
  async function renderServer(){
    const sel=document.getElementById('serverChoice');if(!sel)return;
    sel.value=(await API().base())===API().CLOUD?'cloud':'local';
    sel.onchange=async()=>{await API().setBase(sel.value==='cloud'?API().CLOUD:API().LOCAL);await API().signOut();location.reload()};
  }
  window.addEventListener('snapply-signed-out',render);
  document.addEventListener('DOMContentLoaded',()=>{render();renderServer()});
  if(document.readyState!=='loading'){render();renderServer()}
  window.SnapplyAccount={render};
})();
