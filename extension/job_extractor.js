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
  // The same extraction on a fetched document (no layout, so no visibility check).
  function extractDoc(doc,url){
    const selectors=['main','article','[role="main"]','.job-description','.jobDescription','.vacancy','.vacancy-details','.posting','section'];
    const sc=el=>{const t=clean(el.textContent);if(t.length<120)return -1;let x=Math.min(t.length/1000,8);if(/responsibilit|essential|desirable|requirements?|person specification|about the role|job description/i.test(t))x+=8;return x};
    doc.querySelectorAll('script,style,noscript,nav,header,footer').forEach(n=>n.remove());
    // Keep paragraph and bullet boundaries (a fetched page has no layout, so innerText is unavailable).
    doc.querySelectorAll('p,li,br,h1,h2,h3,h4,h5,tr,div').forEach(n=>n.append(doc.createTextNode('\n')));
    const best=[...new Set(selectors.flatMap(sel=>[...doc.querySelectorAll(sel)]))].map(el=>({el,score:sc(el)})).sort((a,b)=>b.score-a.score)[0];
    const body=best&&best.score>0?best.el:doc.body;
    const text=String(body?.textContent||'').split(/\n+/).map(clean).filter(Boolean).join('\n').slice(0,30000);
    return {url,title:clean(doc.querySelector('h1')?.textContent||doc.title),company:'',text,captured_at:new Date().toISOString()};
  }
  const JOBBY=/responsibilit|requirements?|essential|desirable|person specification|about the role|about you|you will|experience (?:in|of|with)|skills|qualifications?/gi;
  const looksLikeAd=t=>String(t||'').length>=600&&new Set((String(t).match(JOBBY)||[]).map(x=>x.toLowerCase())).size>=2;
  const words=t=>new Set(String(t||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!/^(the|and|for|job|jobs|apply|application|careers?|with|from|role)$/.test(w)));
  // The job advert behind an application form: this page if it carries the ad; otherwise the same
  // address without /apply (JobAdder, Lever, Workable…); otherwise an ad read in this browser in the
  // last few hours whose title matches (e.g. seen on LinkedIn, applied on the employer's site).
  async function posting(){
    const cur=extract();
    if(looksLikeAd(cur.text))return cur;
    const base=location.href.replace(/\/apply(?:\/[^?#]*)?(?=[?#]|$)/i,'');
    if(base!==location.href){
      try{const h=await (await fetch(base,{credentials:'include'})).text();const r=extractDoc(new DOMParser().parseFromString(h,'text/html'),base);
        if(looksLikeAd(r.text))return {...r,url:location.href,posting_url:base,title:r.title||cur.title}}catch(_){}
    }
    try{
      const {recentJobs=[]}=await chrome.storage.local.get('recentJobs');
      const mine=words(cur.title+' '+document.title);let best=null,bestScore=0;
      for(const j of recentJobs){if(Date.now()-Date.parse(j.captured_at)>6*3600e3)continue;
        const w=words(j.title);const common=[...w].filter(x=>mine.has(x)).length;const sc=w.size?common/w.size:0;
        if(sc>bestScore){best=j;bestScore=sc}}
      if(best&&bestScore>=0.5)return {...best,url:location.href,posting_url:best.url};
    }catch(_){}
    return {...cur,error:cur.error||'Could not find the job description for this application. Open the job advert once, then try again.'};
  }
  // Remember job adverts read in this browser (local only, last 15), so an application on another
  // page or site can still be matched to its advert.
  if(window===window.top)setTimeout(async()=>{try{
    if(document.querySelectorAll('input:not([type=hidden]),select,textarea').length>12)return;
    const r=extract();if(!looksLikeAd(r.text))return;
    if(!/job|career|vacanc|position|role|recruit|apply/i.test(location.href+' '+document.title))return;
    const {recentJobs=[]}=await chrome.storage.local.get('recentJobs');
    const next=[{url:r.url,title:r.title,company:r.company,text:r.text.slice(0,20000),captured_at:r.captured_at},...recentJobs.filter(j=>j.url!==r.url)].slice(0,15);
    await chrome.storage.local.set({recentJobs:next});
  }catch(_){}},2500);
  window.JobCopilotJobExtractor={extract,posting};
})();
