(function(){
  const rowId=(i,key)=>`EditAppFieldset.education.gmrow_${i}.${key}`;
  const find=(i,key)=>document.getElementById(rowId(i,key));
  const onTrac=()=>/(^|\.)trac\.jobs$/i.test(location.hostname)&&/^\/application\//.test(location.pathname);
  // Two TRAC layouts: flat rows (gmrow_N.Subject/Place) and, at some trusts, a place of study per row
  // (grrow_N.place) with its own subject rows (grrow_N.details.gmrow_M.subject/grade/date).
  const gid=(i,key)=>`EditAppFieldset.education.grrow_${i}.${key}`;
  const grouped=()=>!!document.getElementById(gid(0,'place'));
  const isEducation=()=>onTrac()&&!!document.getElementById('EditAppFieldset')&&((!!find(0,'Subject')&&!!find(0,'Place'))||grouped());
  const clean=x=>String(x||'').trim();
  function yearFromDates(dates){
    const parts=clean(dates).match(/\b(?:19|20)\d{2}\b/g)||[];
    return parts.length>=2?parts[parts.length-1]:null;
  }
  function records(profile){return (profile?.education||[]).filter(x=>!x.needs_confirmation).map(x=>({
    subject:clean(x.degree),place:clean(x.institution),grade:clean(x.grade||x.result),year:yearFromDates(x.dates)
  })).filter(x=>x.subject&&x.place)}
  function rowIndices(){
    return [...document.querySelectorAll('[id^="EditAppFieldset.education.gmrow_"][id$=".Subject"]')]
      .map(x=>Number(x.id.match(/\.gmrow_(\d+)\.Subject$/)?.[1])).filter(Number.isInteger).sort((a,b)=>a-b);
  }
  function plan(profile){
    if(!isEducation())return {ok:false,reason:'Open the TRAC Education & professional qualifications form first.'};
    const recs=records(profile);
    return {ok:true,section:'education',records:recs,existing_rows:rowIndices(),
      skipped_unconfirmed:(profile?.education||[]).filter(x=>x.needs_confirmation).length,
      skipped_incomplete:(profile?.education||[]).filter(x=>!x.needs_confirmation&&(!clean(x.degree)||!clean(x.institution))).length,
      note:'Subject and place use exact CV profile values. Grade is filled only when recorded. Year requires an explicit end year. Missing rows are added with TRAC\'s Add button.'};
  }
  function fillField(el,wanted){
    if(!el||!wanted)return {filled:false,reason:'Missing field or verified value'};
    if(clean(el.value))return {filled:false,reason:'Existing content preserved'};
    if(el.maxLength>0&&wanted.length>el.maxLength)return {filled:false,reason:'Verified text exceeds the form limit; review manually'};
    el.focus();el.value=wanted;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.blur();
    return {filled:clean(el.value)===wanted,reason:clean(el.value)===wanted?'Value set':'Could not verify value'};
  }
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  async function clickAndWait(button,grew){if(!button)return false;button.click();for(let n=0;n<20;n++){await wait(100);if(grew())return true}return false}
  const placeRows=()=>[...document.querySelectorAll('[id^="EditAppFieldset.education.grrow_"][id$=".place"]')]
    .map(x=>Number(x.id.match(/\.grrow_(\d+)\.place$/)?.[1])).filter(Number.isInteger).sort((a,b)=>a-b);
  const subjectRows=i=>[...document.querySelectorAll(`[id^="EditAppFieldset.education.grrow_${i}.details.gmrow_"][id$=".subject"]`)]
    .map(x=>Number(x.id.match(/\.gmrow_(\d+)\.subject$/)?.[1])).filter(Number.isInteger).sort((a,b)=>a-b);
  async function fillGroupedEducation(p){
    // One place-of-study row per institution, its degrees as subject rows under it.
    const byPlace=[];for(const r of p.records){let g=byPlace.find(x=>x.place===r.place);if(!g)byPlace.push(g={place:r.place,items:[]});g.items.push(r)}
    const groups=byPlace.slice(0,11),out=[];
    for(let n=0;n<groups.length;n++){
      let rows=placeRows();
      if(rows.length<=n){const last=rows[rows.length-1];if(!await clickAndWait(document.getElementById(gid(last,'GRAddAfter')),()=>placeRows().length>rows.length))break;rows=placeRows()}
      const i=rows[n],g=groups[n];
      const current=clean(document.getElementById(gid(i,'place'))?.value);
      if(current&&current!==g.place){out.push({row:i,fields:{place:{filled:false,reason:'Row already holds a different place of study'}}});continue}
      const status={place:fillField(document.getElementById(gid(i,'place')),g.place)};
      for(let m=0;m<g.items.length;m++){
        let subs=subjectRows(i);
        if(subs.length<=m&&!await clickAndWait(document.getElementById(gid(i,'details.AddButton')),()=>subjectRows(i).length>subs.length))break;
        const j=subjectRows(i)[m],r=g.items[m],sub=key=>document.getElementById(gid(i,`details.gmrow_${j}.${key}`));
        status[`subject ${m+1}`]=fillField(sub('subject'),r.subject);
        if(r.grade)status[`grade ${m+1}`]=fillField(sub('grade'),r.grade);
        if(r.year)status[`date ${m+1}`]=fillField(sub('date'),r.year);
      }
      out.push({row:i,fields:status});
    }
    return {ok:true,section:'education',rows:out,existing_rows:placeRows(),remaining_records:Math.max(0,byPlace.length-groups.length),
      note:'Review the rows in TRAC. Rows were added with TRAC\'s own buttons where needed; Save, Submit and navigation were not clicked.'};
  }
  async function fillEducation(profile){
    const p=plan(profile);if(!p.ok)return p;
    if(!p.records.length)return {...p,ok:false,reason:'No verified education with both degree and institution in Master Profile.'};
    if(grouped())return fillGroupedEducation(p);
    if(p.records.length>20)return {...p,ok:false,reason:'More than 20 education records; review the profile first.'};
    for(let n=0;n<Math.min(p.existing_rows.length,p.records.length);n++){
      const i=p.existing_rows[n],r=p.records[n];
      if(['Subject','Place'].some((key)=>{
        const current=clean(find(i,key)?.value);
        return current&&current!==(key==='Subject'?r.subject:r.place);
      }))return {...p,ok:false,reason:`Row ${i} already contains a different education record; review before filling.`};
    }
    // Add rows with TRAC's own Add button until every verified record has one (TRAC allows 11).
    const wanted=Math.min(p.records.length,11);
    while(rowIndices().length<wanted){
      const before=rowIndices().length;
      const add=document.getElementById('EditAppFieldset.education.AddButton');
      if(!add)break;
      add.click();
      let grew=false;
      for(let n=0;n<20&&!grew;n++){await new Promise(r=>setTimeout(r,100));grew=rowIndices().length>before}
      if(!grew)break;
    }
    const indices=rowIndices(),out=[];
    for(let n=0;n<Math.min(p.records.length,indices.length);n++){
      const i=indices[n],r=p.records[n];
      const fields={Subject:r.subject,Place:r.place,Grade:r.grade,Year:r.year};
      const status={};
      for(const [key,value] of Object.entries(fields))status[key]=fillField(find(i,key),value);
      out.push({row:i,fields:status});
    }
    return {ok:true,section:'education',rows:out,existing_rows:indices,remaining_records:Math.max(0,p.records.length-indices.length),
      note:'Review the rows in TRAC. Rows were added with TRAC\'s Add button where needed; Save, Submit and navigation were not clicked.'};
  }
  const employerId=(i,key)=>`EditAppFieldset.otheremp.grrow_${i}.employment-${key}`;
  const employerField=(i,key)=>document.getElementById(employerId(i,key));
  const isEmployer=()=>onTrac()&&!!document.getElementById('EditAppFieldset')&&!!employerField(0,'empname')&&!!employerField(0,'jobtitle');
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  function employmentDates(dates){
    const m=clean(dates).match(/^(\d{2})\/(\d{4})\s*[-–—]\s*(Present|Current|(\d{2})\/(\d{4}))$/i);
    if(!m)return {};
    return {start_month:months[Number(m[1])-1]||'',start_year:m[2],
      end_month:m[4]?months[Number(m[4])-1]||'':'',end_year:m[5]||'',current:/present|current/i.test(m[3])};
  }
  function employerRecords(profile){
    return (profile?.experience||[]).filter(x=>!x.needs_confirmation).map(x=>({
      employer:clean(x.employer),role:clean(x.role),dates:employmentDates(x.dates),duties:clean(x.evidence)
    })).filter(x=>x.employer&&x.role);
  }
  function employerRows(){
    return [...document.querySelectorAll('[id^="EditAppFieldset.otheremp.grrow_"][id$=".employment-empname"]')]
      .map(x=>Number(x.id.match(/\.grrow_(\d+)\.employment-empname$/)?.[1]))
      .filter(Number.isInteger).sort((a,b)=>a-b);
  }
  function employerPlan(profile){
    if(!isEmployer())return {ok:false,reason:'Open the TRAC Employer/activity history form first.'};
    const records=employerRecords(profile);
    return {ok:true,section:'employment',records,existing_rows:employerRows(),
      skipped_unconfirmed:(profile?.experience||[]).filter(x=>x.needs_confirmation).length,
      note:'Only CV-confirmed employer, role, dates and duties are mapped. Address, salary, grade, notice and reason for leaving remain for review. No Save or Submit is clicked.'};
  }
  function fillSelect(el,wanted){
    if(!el||!wanted)return {filled:false,reason:'Missing field or verified value'};
    const option=[...el.options].find(o=>!o.disabled&&clean(o.textContent)===wanted);
    if(!option)return {filled:false,reason:'Verified date is not an available option'};
    if(el.selectedIndex>0&&el.value!==option.value)return {filled:false,reason:'Existing selection preserved'};
    if(el.value===option.value)return {filled:false,reason:'Already selected'};
    el.value=option.value;el.dispatchEvent(new Event('change',{bubbles:true}));
    return {filled:el.value===option.value,reason:el.value===option.value?'Option selected':'Could not verify selection'};
  }
  function formatDuties(raw){
    return clean(raw).replace(/\s*[•●▪]\s*/g,'\n• ').trim();
  }
  function fillDuties(el,raw){
    const formatted=formatDuties(raw);
    if(!el||!formatted)return {filled:false,reason:'No verified duties in CV'};
    const existing=clean(el.value);
    if(existing===formatted)return {filled:false,reason:'Already formatted'};
    if(existing&&existing!==clean(raw))return {filled:false,reason:'Existing edited duties preserved'};
    if(el.maxLength>0&&formatted.length>el.maxLength)return {filled:false,reason:'Verified duties exceed form limit; review manually'};
    el.focus();el.value=formatted;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();
    return {filled:el.value===formatted,reason:el.value===formatted?'CV bullet spacing applied':'Could not verify duties'};
  }
  async function waitForEmployerRow(previousCount){
    for(let n=0;n<20;n++){
      await new Promise(resolve=>setTimeout(resolve,100));
      if(employerRows().length>previousCount)return true;
    }
    return false;
  }
  async function fillEmployer(profile){
    const p=employerPlan(profile);if(!p.ok)return p;
    if(!p.records.length)return {...p,ok:false,reason:'No confirmed employer records in Master Profile.'};
    if(p.records.length>20)return {...p,ok:false,reason:'More than 20 employer records; review before filling.'};
    // Never overwrite another employment record that is already on the form.
    for(let n=0;n<Math.min(p.existing_rows.length,p.records.length);n++){
      const i=p.existing_rows[n],r=p.records[n];
      if([['empname',r.employer],['jobtitle',r.role]].some(([key,wanted])=>{
        const current=clean(employerField(i,key)?.value);return current&&current!==wanted;
      }))return {...p,ok:false,reason:`Row ${i} contains a different employment record; review before filling.`};
    }
    while(employerRows().length<p.records.length){
      const indices=employerRows(),last=indices.at(-1);
      const add=document.getElementById(`EditAppFieldset.otheremp.grrow_${last}.GRAddAfter`);
      if(!add)return {...p,ok:false,reason:'TRAC Add another control was not found.',remaining_records:p.records.length-indices.length};
      add.click();
      if(!await waitForEmployerRow(indices.length))return {...p,ok:false,reason:'TRAC did not create another row; stopped before filling.',remaining_records:p.records.length-employerRows().length};
    }
    const rows=[];
    for(let n=0;n<p.records.length;n++){
      const i=employerRows()[n],r=p.records[n],d=r.dates;
      const fields={employer:fillField(employerField(i,'empname'),r.employer),
        role:fillField(employerField(i,'jobtitle'),r.role),
        duties:fillDuties(employerField(i,'dutiesdesc'),r.duties),
        start_month:fillSelect(document.getElementById(`${employerId(i,'startdate')}.month`),d.start_month),
        start_year:fillSelect(document.getElementById(`${employerId(i,'startdate')}.year`),d.start_year),
        end_month:fillSelect(document.getElementById(`${employerId(i,'enddate')}.month`),d.end_month),
        end_year:fillSelect(document.getElementById(`${employerId(i,'enddate')}.year`),d.end_year)};
      rows.push({row:i,fields});
    }
    return {ok:true,section:'employment',rows,remaining_records:0,
      note:'Review all rows, especially dates and duties. Other employer questions remain blank. No Save, Submit or navigation was clicked.'};
  }
  // Training courses: the CV lists certification names only, so only the course title is filled.
  // The user chooses which certifications to add (TRAC allows 7); provider, duration and year stay theirs.
  const trainingField=(i,key)=>document.getElementById(`EditAppFieldset.training.gmrow_${i}.${key}`);
  const trainingRows=()=>[...document.querySelectorAll('[id^="EditAppFieldset.training.gmrow_"][id$=".course"]')]
    .map(x=>Number(x.id.match(/\.gmrow_(\d+)\.course$/)?.[1])).filter(Number.isInteger).sort((a,b)=>a-b);
  const isTraining=()=>onTrac()&&!!document.getElementById('EditAppFieldset')&&!!trainingField(0,'course');
  async function fillTraining(titles){
    if(!isTraining())return {ok:false,reason:'Open the TRAC training courses form first.'};
    const wanted=(titles||[]).map(clean).filter(Boolean).slice(0,7);
    if(!wanted.length)return {ok:false,reason:'Choose at least one course.'};
    const existing=trainingRows().map(i=>clean(trainingField(i,'course')?.value)).filter(Boolean);
    const todo=wanted.filter(t=>!existing.includes(t));
    const out=[];
    for(const title of todo){
      let free=trainingRows().find(i=>!clean(trainingField(i,'course')?.value));
      if(free===undefined){
        const before=trainingRows().length;if(before>=7)break;
        document.getElementById('EditAppFieldset.training.AddButton')?.click();
        for(let n=0;n<20&&trainingRows().length<=before;n++)await new Promise(r=>setTimeout(r,100));
        free=trainingRows().find(i=>!clean(trainingField(i,'course')?.value));
        if(free===undefined)break;
      }
      out.push({row:free,title,...fillField(trainingField(free,'course'),title)});
    }
    return {ok:true,section:'training',rows:out,skipped_existing:wanted.length-todo.length,remaining_records:todo.length-out.length,
      note:'Course titles only. Provider, duration and year are not in the CV; complete them on the page.'};
  }
  const isReferences=()=>onTrac()&&!!document.getElementById('EditAppFieldset.ref.grrow_0.first-name');
  // Referees: every field of a row is EditAppFieldset.ref.grrow_N.<key>. Captured and filled generically
  // by key, so new TRAC referee fields need no code. Filled only after the user confirms in the panel.
  const REF='EditAppFieldset.ref.grrow_';
  const refRows=()=>[...new Set([...document.querySelectorAll(`[id^="${REF}"]`)].map(e=>Number(e.id.slice(REF.length).split('.')[0])).filter(Number.isInteger))].sort((a,b)=>a-b);
  const PLACEHOLDER=/^(?:please select.*|select.*|\s*)$/i;
  function refControls(i){
    return [...document.querySelectorAll(`[id^="${REF}${i}."]`)].filter(e=>e.matches('input,select,textarea')&&!['hidden','button','submit'].includes(e.type)&&!/AddressLookup/i.test(e.id));
  }
  const keyOf=(e,i)=>e.id.slice(`${REF}${i}.`.length);
  function readControl(e){
    if(e.tagName==='SELECT'){const o=e.selectedOptions?.[0];return o&&o.value!==''&&!PLACEHOLDER.test(o.text)?clean(o.text):''}
    if(e.type==='checkbox'||e.type==='radio')return e.checked?'true':'';
    return clean(e.value);
  }
  function captureReferees(){
    if(!isReferences())return {ok:false,reason:'Open the TRAC references form first.'};
    const referees=[];
    for(const i of refRows()){
      const fields={};
      for(const e of refControls(i)){const v=readControl(e);if(v)fields[keyOf(e,i)]=v}
      if(!fields['first-name']&&!fields.surname)continue;
      const label=[fields.title,fields['first-name'],fields.surname].filter(Boolean).join(' ')+(fields.orgname?` — ${fields.orgname}`:'')+(fields.relationship?` (${fields.relationship})`:'');
      referees.push({label,fields});
    }
    return {ok:true,referees};
  }
  function writeControl(e,value){
    if(e.tagName==='SELECT'){
      const o=[...e.options].find(o=>clean(o.text).toLowerCase()===clean(value).toLowerCase());
      if(!o)return false;e.value=o.value;e.dispatchEvent(new Event('change',{bubbles:true}));return true;
    }
    if(e.type==='checkbox'||e.type==='radio'){if(value==='true'&&!e.checked)e.click();return true}
    return fillField(e,value).filled;
  }
  // The fields of one referee row, so the panel can offer the same form (and the same list options).
  function refereeForm(){
    if(!isReferences())return {ok:false,reason:'Open the TRAC references form first.'};
    const i=refRows()[0];
    const fields=refControls(i).filter(e=>e.type!=='checkbox'&&e.type!=='radio').map(e=>{
      const label=clean(document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.innerText||'').replace(/\s*\*\s*$/,'')||keyOf(e,i);
      return {key:keyOf(e,i),label,type:e.tagName==='SELECT'?'select':'text',
        required:e.required||e.getAttribute('aria-required')==='true'||/\*/.test(document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.innerText||''),
        options:e.tagName==='SELECT'?[...e.options].map(o=>clean(o.text)).filter(t=>t&&!PLACEHOLDER.test(t)):null};
    });
    return {ok:true,fields};
  }
  async function fillReferees(referees){
    if(!isReferences())return {ok:false,reason:'Open the TRAC references form first.'};
    const wanted=(referees||[]).filter(r=>r&&r.fields).slice(0,10);
    if(!wanted.length)return {ok:false,reason:'Choose at least one saved referee.'};
    const emptyRows=()=>refRows().filter(i=>!clean(document.getElementById(`${REF}${i}.first-name`)?.value)&&!clean(document.getElementById(`${REF}${i}.surname`)?.value));
    const addButton=()=>[...document.querySelectorAll('#EditAppFieldset button,#EditAppFieldset input[type=button]')].find(b=>/\.ref\./.test(b.id)&&/(AddButton|GRAdd)/i.test(b.id))
      ||[...document.querySelectorAll('#EditAppFieldset button,#EditAppFieldset input[type=button]')].find(b=>/add/i.test(b.innerText||b.value||'')&&!/address/i.test(b.id));
    while(emptyRows().length<wanted.length){
      const before=refRows().length,b=addButton();if(!b)break;b.click();
      let grew=false;for(let n=0;n<20&&!grew;n++){await new Promise(r=>setTimeout(r,100));grew=refRows().length>before}
      if(!grew)break;
    }
    const rows=emptyRows(),out=[];
    for(let n=0;n<Math.min(rows.length,wanted.length);n++){
      const i=rows[n],ref=wanted[n];let filled=0,missing=[];
      for(const [key,value] of Object.entries(ref.fields)){
        const e=document.getElementById(`${REF}${i}.${key}`);
        if(!e){missing.push(key);continue}
        if(readControl(e))continue;
        if(writeControl(e,value))filled++;else missing.push(key);
      }
      out.push({row:i,referee:ref.label,filled,missing});
    }
    return {ok:true,section:'references',rows:out,remaining:wanted.length-out.length,
      note:'Referee rows filled from your saved referees after your confirmation. Save, Submit and navigation were not clicked.'};
  }
  window.JobCopilotTrac={isEducation,plan,fillEducation,isEmployer,employerPlan,fillEmployer,isTraining,fillTraining,isReferences,captureReferees,fillReferees,refereeForm};
})();
