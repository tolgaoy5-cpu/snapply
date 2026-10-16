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
      b.append(line('Sign in to use Snapply','acct-title'),
        line('Your CV and saved answers are kept in your account. Personal and legal answers and referees stay in this browser only.'),
        button('Sign in with Google',async e=>{e.target.disabled=true;try{await API().signIn();render();window.dispatchEvent(new Event('snapply-signed-in'))}catch(err){b.append(line(err.message,'acct-status muted'));e.target.disabled=false}},'primary-small'));
      return;
    }
    let a;try{a=await API().account()}catch(e){b.append(line(e.message));return}
    const pro=a.plan==='pro';
    const offer=!pro&&m.launch_offer;
    b.append(line(`${a.email} · ${pro?'Pro':'Free'} plan`,'acct-title'),
      line(a.applications_limit==null?`Applications this month: ${a.applications_used||0} (unlimited)`:`Applications this month: ${a.applications_used||0} of ${a.applications_limit}`),
      line(`AI drafts this month: ${a.ai_used} of ${a.ai_limit}`),
      ...(offer?[line('Pro: unlimited applications, 300 AI drafts and cover letters. Launch offer: £4.99/month for your first 2 months, then £9.99/month.','acct-offer')]:[]),
      ...(pro?[button('Manage subscription',()=>openTab('/v1/billing/portal'))]:[button(offer?'Pro · £4.99/month':'Pro · £9.99/month',()=>openTab('/v1/billing/checkout',{interval:'month'}),'primary-small'),button('Pro · £79/year',()=>openTab('/v1/billing/checkout',{interval:'year'}))]),
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
