// Loaded in the page's MAIN world; run on demand through the main-world bridge.
// Does not create rows, store values, navigate, or submit the application.
//
// Workday's DateInput keeps its own {mm,yyyy} model; the visible month/year segments can show
// numbers the model never received. This script reads that model (only reachable from the MAIN
// world), re-commits segments whose model is out of sync using setter + input + blur (verified live
// 2026-10-09), and reports a date as ok only when the model matches what is on screen.
(function(){
async function verifyWorkdayDatesInActiveTab(){
  const sleep=t=>new Promise(r=>setTimeout(r,t));
  if(!/(^|\.)[^.]*workdayjobs\.com$/i.test(location.hostname))
    return {ok:false,reason:'Open the Workday My Experience form first.'};
  const visible=el=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.offsetParent!==null};
  const months=[...document.querySelectorAll('input[id$="-dateSectionMonth-input"]')].filter(visible);
  if(!months.length)return {ok:false,reason:'No visible Workday month/year controls were found.'};

  function model(el){
    const fk=el&&Object.keys(el).find(k=>k.startsWith('__reactFiber'));
    for(let f=fk&&el[fk],i=0;f&&i<30;f=f.return,i++){
      const name=f.type?.displayName||f.type?.name;
      if(name==='DateInput'&&f.memoizedProps?.value&&'mm' in f.memoizedProps.value)return f.memoizedProps.value;
    }
    return null;
  }
  const same=(a,b)=>String(a??'').trim()!==''&&Number(a)===Number(b);
  function check(base){
    const m=document.getElementById(base+'Month-input'),y=document.getElementById(base+'Year-input');
    const v=model(m);
    return {m,y,month:String(m?.value||'').trim(),year:String(y?.value||'').trim(),model:v,
      synced:!!v&&same(m?.value,v.mm)&&same(y?.value,v.yyyy)};
  }
  // The page has no focus while the popup is open, so focus()/blur() alone fire nothing;
  // dispatch the focus events explicitly. Clearing first makes React see a change even when
  // the segment already shows the same digits.
  async function commit(id,value){
    const el=document.getElementById(id);if(!el)return;
    const setValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    el.focus();el.dispatchEvent(new FocusEvent('focus'));el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
    await sleep(20);
    setValue.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));
    setValue.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));
    await sleep(40);
    const live=document.getElementById(id)||el;
    live.blur();live.dispatchEvent(new FocusEvent('blur'));live.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
    await sleep(120);
  }

  const results=[];
  for(const monthEl of months){
    const base=monthEl.id.replace(/Month-input$/,'');
    let s=check(base);
    if(!s.model){results.push({date:base,ok:false,reason:'Workday date model not found; cannot verify.'});continue}
    if(s.synced){results.push({date:base,ok:true,status:'verified'});continue}
    if(!/^\d{1,2}$/.test(s.month)||!/^\d{4}$/.test(s.year)){
      results.push({date:base,ok:false,reason:'Date is empty or incomplete on screen; no value invented.'});continue;
    }
    const month=s.month,year=s.year;
    await commit(s.m.id,month);await sleep(50);await commit(s.y.id,year);
    s=check(base);
    results.push({date:base,ok:s.synced,status:s.synced?'recommitted':'rejected',
      reason:s.synced?undefined:'Workday did not accept the date; enter it manually.'});
  }
  return {ok:results.every(x=>x.ok),dates:results.length,results,
    verified:results.filter(x=>x.ok).length,
    note:'Dates were checked against Workday\'s own form model. Save and Continue remains the final check.'};
}
(window.__jcMain=window.__jcMain||{}).verifyWorkdayDates=verifyWorkdayDatesInActiveTab;
})();
