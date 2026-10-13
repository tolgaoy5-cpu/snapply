(function(){
  const KEY='jobCopilotSession';
  function id(){return `sess-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
  async function get(){const x=await chrome.storage.local.get(KEY);return x[KEY]||null}
  async function start(meta={}){
    const s={id:id(),started_at:new Date().toISOString(),url:meta.url||'',ats:meta.ats||'UNKNOWN',job_title:meta.job_title||'',company:meta.company||'',events:[]};
    await chrome.storage.local.set({[KEY]:s});return s;
  }
  async function ensure(meta={}){return await get()||await start(meta)}
  async function log(type,data={}){
    const s=await ensure({url:data.url,ats:data.ats});
    s.events.push({at:new Date().toISOString(),type,data});
    if(s.events.length>250)s.events=s.events.slice(-250);
    await chrome.storage.local.set({[KEY]:s});return s;
  }
  async function clear(){await chrome.storage.local.remove(KEY)}
  window.JobCopilotSessionAudit={get,start,ensure,log,clear};
})();
