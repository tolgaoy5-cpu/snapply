// CV language names can be selected directly. Only an explicitly native
// language supports filling all five Workday levels without guessing.
(function(){
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
  const norm=x=>clean(x).toLowerCase();
  const onWorkday=()=>window.JobCopilotAdapterRegistry?.detect?.()==='WORKDAY';
  const rowButtons=()=>[...document.querySelectorAll('button[id^="language-"][id$="--language"]')];
  const verifiedRecords=profile=>{
    const seen=new Set();
    return (profile?.languages||[]).filter(x=>clean(x.language)).map(x=>({
      language:clean(x.language),native:/^native$/i.test(clean(x.level))
    })).filter(x=>{const key=norm(x.language);if(seen.has(key))return false;seen.add(key);return true});
  };
  const dimensions=['Comprehension','Overall','Reading','Speaking','Writing'];
  const rowLanguage=button=>clean(button?.textContent);

  function plan(profile){
    if(!onWorkday())return {ok:false,reason:'Open a Workday application My Experience page.'};
    const records=verifiedRecords(profile);
    return {ok:true,records,visible_rows:rowButtons().length,
      review_required:records.filter(x=>!x.native).map(x=>x.language),
      note:'Verified CV language names can be selected. Only native languages get five Fluent levels; other levels require review. No Save or Submit is clicked.'};
  }
  function levelButton(prefix,dimension){
    return [...document.querySelectorAll(`button[id^="${prefix}"]`)]
      .find(x=>norm(x.getAttribute('aria-label')).startsWith(norm(dimension)+' '))||null;
  }
  async function choose(button,wanted){
    if(!button)return {ok:false,reason:'Required Workday control was not found'};
    if(norm(button.textContent)===norm(wanted))return {ok:true,reason:'Already selected'};
    if(!/^select one$/i.test(clean(button.textContent)))return {ok:false,reason:'Existing selection preserved'};
    button.click();
    let list=null;
    for(let i=0;i<15;i++){
      await sleep(80);
      const id=button.getAttribute('aria-controls');
      list=(id?document.getElementById(id):null)||
        [...document.querySelectorAll('[role="listbox"]')].find(x=>x.getClientRects().length&&
          [...x.querySelectorAll('[role="option"]')].some(o=>norm(o.textContent)===norm(wanted)))||null;
      if(list)break;
    }
    if(!list)return {ok:false,reason:'Workday listbox did not open'};
    let hit=null;
    for(let i=0;i<15&&!hit;i++){
      hit=[...list.querySelectorAll('[role="option"]')].find(x=>norm(x.textContent)===norm(wanted));
      if(!hit)await sleep(80);
    }
    if(!hit)return {ok:false,reason:`Verified option ${wanted} is unavailable`};
    hit.click();
    for(let i=0;i<15;i++){
      await sleep(80);
      if(norm(button.textContent)===norm(wanted))return {ok:true,reason:'Selection committed'};
    }
    return {ok:false,reason:'Workday did not commit the selection'};
  }
  function sectionHeading(label){
    return [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(x=>norm(x.textContent)===norm(label))||null;
  }
  function addLanguageButton(){
    const start=sectionHeading('Languages');
    const end=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .find(x=>start&&(start.compareDocumentPosition(x)&Node.DOCUMENT_POSITION_FOLLOWING)&&
        /^(skills|websites|resume\s*\/\s*cover letter|social network urls)$/i.test(clean(x.textContent)));
    if(!start||!end)return null;
    const following=Node.DOCUMENT_POSITION_FOLLOWING;
    return [...document.querySelectorAll('button')].find(b=>{
      const t=norm(b.textContent);
      return (t==='add'||t==='add another')&&
        !!(start.compareDocumentPosition(b)&following)&&!!(b.compareDocumentPosition(end)&following);
    })||null;
  }
  async function ensureBlankRow(){
    const empty=rowButtons().find(b=>/^select one$/i.test(clean(b.textContent)));
    if(empty)return empty;
    const add=addLanguageButton();if(!add)return null;
    const before=rowButtons().length;add.click();
    for(let i=0;i<20;i++){
      await sleep(100);
      if(rowButtons().length>before)return rowButtons().find(b=>/^select one$/i.test(clean(b.textContent)))||null;
    }
    return null;
  }
  async function fill(profile){
    const p=plan(profile);if(!p.ok)return p;
    if(!p.records.length)return {...p,ok:false,reason:'No verified CV languages are available.'};
    const rows=[];
    for(const record of p.records.slice(0,10)){
      const matches=rowButtons().filter(b=>norm(rowLanguage(b))===norm(record.language));
      if(matches.length>1)return {...p,ok:false,rows,reason:`Multiple existing ${record.language} rows require review.`};
      const language=matches[0]||await ensureBlankRow();
      if(!language)return {...p,ok:false,rows,reason:'Could not create a blank Workday language row; stopped without saving.'};
      const prefix=language.id.slice(0,-'language'.length);
      const languageResult=await choose(language,record.language);
      if(!languageResult.ok)return {...p,ok:false,rows,reason:languageResult.reason};
      const native=document.getElementById(`${prefix}native`);
      if(!native)return {...p,ok:false,rows,reason:'Native language checkbox was not found.'};
      if(!record.native){
        if(native.checked)return {...p,ok:false,rows,reason:`Existing ${record.language} Native selection requires review.`};
        rows.push({language:record.language,levels:'Review required',native:false});
        continue;
      }
      const levels={};
      for(const dimension of dimensions){
        levels[dimension]=await choose(levelButton(prefix,dimension),'5 - Fluent');
        if(!levels[dimension].ok)return {...p,ok:false,rows,reason:`${dimension}: ${levels[dimension].reason}`};
      }
      if(!native.checked)native.click();
      rows.push({language:record.language,levels,native:!!native.checked});
    }
    return {...p,ok:true,rows,remaining_records:Math.max(0,p.records.length-rows.length),
      note:'Review and complete the five required levels for non-native languages before saving. No Save or Submit was clicked.'};
  }
  window.JobCopilotWorkdayLanguages={plan,fill};
})();
