(function(){
  const KEY='answerQueueV012';
  async function load(){const x=await chrome.storage.local.get(KEY);return x[KEY]||{cursor:0,items:[]}}
  async function save(q){await chrome.storage.local.set({[KEY]:q});return q}
  async function create(items){return save({cursor:0,items:items.map((x,i)=>({...x,queue_id:i,user_answer:x.answer||'',state:x.status||'REVIEW'}))})}
  async function append(item){const q=await load();q.items.push({...item,queue_id:q.items.length,user_answer:item.answer||'',state:item.status||'ASK_USER'});q.cursor=q.items.length-1;return save(q)}
  async function update(index,patch){const q=await load();if(!q.items[index])throw new Error('Queue item not found');q.items[index]={...q.items[index],...patch};return save(q)}
  async function setCursor(cursor){const q=await load();q.cursor=Math.max(0,Math.min(cursor,Math.max(0,q.items.length-1)));return save(q)}
  async function clear(){await chrome.storage.local.remove(KEY)}
  window.JobCopilotQueue={load,create,append,update,setCursor,clear};
})();
