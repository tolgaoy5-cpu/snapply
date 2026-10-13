(function(){
  const DEFAULT='http://127.0.0.1:8787';
  async function base(){const x=await chrome.storage.local.get('apiBase');return x.apiBase||DEFAULT}
  async function request(path,opts){const r=await fetch((await base())+path,opts);if(!r.ok)throw new Error(`API ${r.status}: ${await r.text()}`);return r.json()}
  async function get(path){return request(path,{method:'GET'})}
  async function post(path,payload){return request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})}
  async function uploadCV(file){const fd=new FormData();fd.append('file',file,file.name);return request('/v1/profile/import',{method:'POST',body:fd})}
  window.JobCopilotAPI={get,post,base,uploadCV};
})();
