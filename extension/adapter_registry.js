(function(){
 const rules=[
  {name:'WORKDAY',host:/(^|\.)(workday\.com|myworkdayjobs\.com)$/i,markers:['[data-automation-id="applicationPage"]','form[action*="myworkdayjobs.com"]']},
  {name:'GREENHOUSE',host:/(^|\.)greenhouse\.io$/i,markers:['form[action*="greenhouse.io"]','iframe[src*="greenhouse.io"]']},
  {name:'LEVER',host:/(^|\.)lever\.co$/i,markers:['form[action*="lever.co"]','iframe[src*="lever.co"]']},
  {name:'ASHBY',host:/(^|\.)ashbyhq\.com$/i,markers:['form[action*="ashbyhq.com"]','iframe[src*="ashbyhq.com"]']},
  {name:'CIPHR',host:/(^|\.)ciphr-irecruit\.com$/i,markers:[]},
  {name:'TRAC',host:/(^|\.)trac\.jobs$/i,markers:[]}
 ];
 function detect(doc=document,loc=location){
   const host=String(loc.hostname||'');
   // Hostname is authoritative. Always resolve known ATS hosts before using
   // generic DOM markers, because unrelated ATS products can share classes
   // such as .application-form or generic <form> structures.
   for(const r of rules){if(r.host.test(host))return r.name;}
   for(const r of rules){for(const m of r.markers){try{if(doc.querySelector(m))return r.name}catch(_){}}}
   return 'GENERIC';
 }
 window.JobCopilotAdapterRegistry={detect,rules};
})();
