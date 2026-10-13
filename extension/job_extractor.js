// Vendor-independent job description extraction from the active page.
// It only collects visible page text/metadata; requirement reasoning remains in the core.
(function(){
  function visible(el){const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.offsetParent!==null}
  function clean(s){return String(s||'').replace(/\s+/g,' ').trim()}
  function cleanLines(s){return String(s||'').split(/\n+/).map(clean).filter(Boolean).join('\n')}
  function score(el){
    const t=clean(el.innerText); if(t.length<120) return -1;
    let x=Math.min(t.length/1000,8);
    if(/responsibilit|essential|desirable|requirements?|person specification|about the role|job description/i.test(t)) x+=8;
    if(/cookie|privacy|sign in|login|register/i.test(t.slice(0,300))) x-=3;
    return x;
  }
  function extract(){
    if(/\.myworkdayjobs\.com$/i.test(location.hostname)&&/\/apply(?:\/|$|\?)/i.test(location.pathname)){
      return {url:location.href,title:clean(document.querySelector('h1')?.innerText||document.title),company:'',text:'',error:'This is the application form. Open the job posting to analyze its requirements.',captured_at:new Date().toISOString()};
    }
    const selectors=['main','article','[role="main"]','.job-description','.jobDescription','.vacancy','.vacancy-details','.posting','section'];
    const candidates=[];
    selectors.forEach(sel=>document.querySelectorAll(sel).forEach(el=>{if(visible(el)) candidates.push(el)}));
    const best=[...new Set(candidates)].map(el=>({el,score:score(el)})).sort((a,b)=>b.score-a.score)[0];
    const body=best&&best.score>0?best.el:document.body;
    const text=cleanLines(body.innerText).slice(0,30000);
    const title=clean(document.querySelector('h1')?.innerText||document.title);
    const company=clean(document.querySelector('[data-company],.company,.organisation,.organization,.employer')?.innerText||'');
    return {url:location.href,title,company,text,source_selector:best?.el?.tagName||'BODY',captured_at:new Date().toISOString()};
  }
  window.JobCopilotJobExtractor={extract};
})();
