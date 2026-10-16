// "My documents": certificates, memberships, papers and other files the user uploads once and
// Snapply attaches to matching upload areas. Kept only in this browser (per account), never sent
// to the Snapply server.
(function(){
  const MAX_BYTES=10*1024*1024, MAX_DOCS=15;
  const LABELS={qualifications:'Qualification certificate',membership:'Professional membership',research:'Research paper / publication',other:'Other document'};
  const key=()=>window.JobCopilotAPI.accountKey('documentLibrary');
  async function list(){const k=await key();return (await chrome.storage.local.get(k))[k]||[]}
  async function save(items){await chrome.storage.local.set({[await key()]:items})}
  function read(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(r.error);r.readAsDataURL(file)})}
  async function add(file,category){
    if(!file)throw new Error('Choose a file first.');
    if(!LABELS[category])throw new Error('Choose what kind of document this is.');
    if(file.size>MAX_BYTES)throw new Error('Documents can be up to 10 MB.');
    const items=await list();
    if(items.length>=MAX_DOCS)throw new Error(`You can keep up to ${MAX_DOCS} documents. Remove one first.`);
    items.push({id:crypto.randomUUID(),category,name:file.name,type:file.type||'application/octet-stream',size:file.size,base64:await read(file),added_at:new Date().toISOString()});
    await save(items);return items;
  }
  async function remove(id){const items=(await list()).filter(d=>d.id!==id);await save(items);return items}
  window.SnapplyDocumentLibrary={list,add,remove,LABELS};
})();
