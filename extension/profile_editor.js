// "Edit profile": change what Snapply fills without re-uploading the CV — a new current job, a corrected
// phone number, an extra certificate. Saved to the account's profile and marked as edited by the user,
// so a later CV re-read does not overwrite it.
(function(){
  const $=id=>document.getElementById(id);
  const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const CONTACT=[['full_name','Full name'],['email','Email'],['phone','Phone'],['address','Address line 1'],
    ['city','Town / city'],['postcode','Postcode'],['country','Country']];

  function el(tag,props={},kids=[]){const n=document.createElement(tag);Object.assign(n,props);n.append(...kids);return n}
  function input(value,placeholder,area=false){return el(area?'textarea':'input',{value:value||'',placeholder,rows:area?3:undefined})}
  // A small caption above each box, so filled boxes still say what they are.
  const field=(label,box)=>el('label',{className:'pe-field'},[el('span',{textContent:label}),box]);

  // "Sep 2021 – Present", "09/2021 - 03/2023", "2019 to 2022" → the profile's "MM/YYYY-MM/YYYY|Present" form.
  function part(raw){
    const t=String(raw||'').trim().replace(/[.,]/g,' ').replace(/\s+/g,' ');
    if(!t)return '';
    if(/^(present|current|now|to date|date|ongoing)$/i.test(t))return 'Present';
    let m=t.match(/^(\d{1,2})\s*[\/.-]\s*((?:19|20)\d{2})$/);if(m)return `${m[1].padStart(2,'0')}/${m[2]}`;
    m=t.match(/^([a-z]+)\s+((?:19|20)\d{2})$/i);
    if(m){const i=MONTHS.indexOf(m[1].slice(0,3).toLowerCase());if(i>=0)return `${String(i+1).padStart(2,'0')}/${m[2]}`}
    m=t.match(/^((?:19|20)\d{2})$/);if(m)return m[1];
    return null;
  }
  function normaliseDates(raw){
    const text=String(raw||'').trim();if(!text)return '';
    const bits=text.split(/\s*(?:[-–—]|\bto\b|\buntil\b)\s*/i).filter(Boolean);
    const out=bits.map(part);
    return out.length<=2&&out.every(x=>x!==null)?out.join('-'):text;   // keep the user's text if it is unusual
  }

  // A job's dates as start and end boxes; "I currently work here" replaces the end date.
  function splitDates(raw){
    const bits=String(raw||'').split(/\s*(?:[-–—]|\bto\b|\buntil\b)\s*/i).filter(Boolean);
    const current=/^(present|current|now|to date|date|ongoing)$/i.test(bits[1]||'');
    return {start:bits[0]||'',end:current?'':(bits[1]||''),current};
  }
  function jobRow(job){
    const d=splitDates(job.dates);
    const role=input(job.role,'Job title'),employer=input(job.employer,'Employer'),
      start=input(d.start,'e.g. Aug 2024'),end=input(d.end,'e.g. Mar 2023'),
      current=el('input',{type:'checkbox',checked:d.current}),duties=input(job.evidence,'Main duties (optional)',true);
    const remove=el('button',{type:'button',className:'linkish',textContent:'Remove this job'});
    const box=el('div',{className:'card pe-row'},[field('Job title',role),field('Employer',employer),field('Start',start),
      el('label',{className:'pe-check'},[current,' I currently work here']),field('End',end),field('Duties',duties),remove]);
    const sync=()=>{end.disabled=current.checked;end.parentElement.hidden=current.checked};sync();
    // Only one current job: ticking this one ends the others, at this job's start date when they have no end yet.
    current.onchange=()=>{sync();if(!current.checked)return;
      for(const other of box.parentElement?.children||[])if(other!==box&&other.isCurrent?.())other.endAt(start.value.trim())};
    box.isCurrent=()=>current.checked;
    box.endAt=date=>{current.checked=false;if(!end.value.trim())end.value=date;sync()};
    remove.onclick=()=>box.remove();
    box.read=()=>({...job,role:role.value.trim(),employer:employer.value.trim(),
      dates:normaliseDates(start.value.trim()?`${start.value.trim()} - ${current.checked?'Present':end.value.trim()}`.replace(/\s-\s$/,''):''),
      evidence:duties.value.trim()});
    return box;
  }
  function eduRow(ed){
    const degree=input(ed.degree,'Qualification, e.g. BA (Hons) Psychology'),inst=input(ed.institution,'University / college / school'),
      dates=input(ed.dates,'e.g. 2015 – 2018'),grade=input(ed.grade,'Grade (optional)');
    const remove=el('button',{type:'button',className:'linkish',textContent:'Remove'});
    const box=el('div',{className:'card pe-row'},[field('Qualification',degree),field('Where',inst),field('Dates',dates),field('Grade',grade),remove]);
    remove.onclick=()=>box.remove();
    box.read=()=>({...ed,degree:degree.value.trim(),institution:inst.value.trim(),dates:normaliseDates(dates.value),grade:grade.value.trim()});
    return box;
  }

  async function render(){
    const root=$('profileEditor');if(!root)return;
    let p={};try{p=await window.profile()}catch(_){}
    if(!p||!Object.keys(p).length){root.replaceChildren(el('div',{className:'muted',textContent:'Import your CV first, then you can edit what Snapply fills.'}));return}
    const contact=Object.fromEntries(CONTACT.map(([k,l])=>[k,input(p[k],l)]));
    const jobs=el('div',{},(p.experience||[]).map(jobRow));
    const edus=el('div',{},(p.education||[]).map(eduRow));
    const certs=input((p.certifications||[]).map(c=>c?.name||c).join('\n'),'One certificate or course per line',true);
    const addJob=el('button',{type:'button',textContent:'+ Add a job (newest first)'});
    addJob.onclick=()=>{const row=jobRow({});jobs.prepend(row);row.querySelector('input').focus()};
    const addEdu=el('button',{type:'button',textContent:'+ Add education'});
    addEdu.onclick=()=>edus.append(eduRow({}));
    const save=el('button',{type:'button',className:'primary-small',textContent:'Save profile'});
    const status=el('div',{className:'muted',role:'status'});
    save.onclick=async()=>{
      save.disabled=true;status.className='muted';status.textContent='Saving…';
      try{
        const next={...p};
        for(const [k,i] of Object.entries(contact))next[k]=i.value.trim();
        const [first,...rest]=next.full_name.split(' ');if(next.full_name){next.first_name=first;next.last_name=rest.join(' ')}
        next.experience=[...jobs.children].map(r=>r.read()).filter(j=>j.role||j.employer);
        next.education=[...edus.children].map(r=>r.read()).filter(e=>e.degree||e.institution);
        next.certifications=certs.value.split('\n').map(x=>x.trim()).filter(Boolean);
        next.import_meta={...(p.import_meta||{}),user_edited:true};
        await window.JobCopilotAPI.post('/v1/state/profile',next);
        await chrome.storage.local.set({masterProfile:next});
        window.forgetServerState?.();
        await window.refreshProfileState?.();
        status.className='done';status.textContent='Saved. The next “Fill this page” uses it.';
      }catch(e){status.className='block';status.textContent=e.message}finally{save.disabled=false}
    };
    root.replaceChildren(
      el('div',{className:'muted',textContent:'Change what Snapply fills — for example a new current job — without uploading your CV again.'}),
      el('h4',{textContent:'Contact details'}),...CONTACT.map(([k,l])=>field(l,contact[k])),
      el('h4',{textContent:'Jobs (newest first)'}),addJob,jobs,
      el('h4',{textContent:'Education'}),edus,addEdu,
      el('h4',{textContent:'Certificates and courses'}),field('One per line',certs),
      save,status);
  }
  window.SnapplyProfileEditor={render,normaliseDates};
  document.addEventListener('DOMContentLoaded',()=>{const d=$('profileEditorBox');if(d)d.addEventListener('toggle',()=>{if(d.open)render()})});
})();
