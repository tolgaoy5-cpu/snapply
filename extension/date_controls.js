(function(){
  function norm(s){return String(s||'').replace(/\s+/g,' ').trim().toLowerCase()}
  function parseMonthYear(value){
    const s=String(value||'').trim();
    let m=s.match(/^(\d{4})-(\d{2})$/); if(m)return {year:m[1],month:m[2]};
    m=s.match(/^(\d{2})\/(\d{4})$/); if(m)return {year:m[2],month:m[1]};
    return null;
  }
  function fire(el){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
  function selectByValueOrText(el,val){
    const wanted=norm(val); const candidates=[...el.options];
    const aliases={
      '01':['1','01','jan','january'],'02':['2','02','feb','february'],'03':['3','03','mar','march'],'04':['4','04','apr','april'],
      '05':['5','05','may'],'06':['6','06','jun','june'],'07':['7','07','jul','july'],'08':['8','08','aug','august'],
      '09':['9','09','sep','sept','september'],'10':['10','oct','october'],'11':['11','nov','november'],'12':['12','dec','december']
    };
    const tokens=aliases[String(val).padStart(2,'0')]||[wanted];
    const o=candidates.find(x=>tokens.includes(norm(x.value))||tokens.includes(norm(x.text))||norm(x.value)===wanted||norm(x.text)===wanted);
    if(!o)return false; el.value=o.value; fire(el); return true;
  }
  function labelText(el){
    const out=[];if(el.id){const l=document.querySelector(`label[for="${CSS.escape(el.id)}"]`);if(l)out.push(l.innerText)}
    ['aria-label','placeholder','name','id','data-automation-id'].forEach(k=>{const v=el.getAttribute(k);if(v)out.push(v)});
    return norm(out.join(' '));
  }
  function setCompositeDate(container,value,kind){
    const parsed=parseMonthYear(value); if(!parsed)return {filled:0,reason:'Unsupported date format'};
    const controls=[...container.querySelectorAll('select,input')].filter(x=>x.type!=='hidden');
    let month=null,year=null;
    for(const el of controls){
      const l=labelText(el);
      const isKind=!kind||l.includes(kind)||!/(start|end|from|to)/.test(l);
      if(!isKind)continue;
      if(!month && /month|mm\b/.test(l))month=el;
      if(!year && /year|yyyy/.test(l))year=el;
    }
    let filled=0;
    if(month){ if(month.tagName==='SELECT'){if(selectByValueOrText(month,parsed.month))filled++}else if(!month.value){month.value=parsed.month;fire(month);filled++}}
    if(year){ if(year.tagName==='SELECT'){if(selectByValueOrText(year,parsed.year))filled++}else if(!year.value){year.value=parsed.year;fire(year);filled++}}
    return {filled,month:!!month,year:!!year};
  }
  function setDateField(el,value){
    if(!value)return false;
    if(el.type==='month'){const p=parseMonthYear(value);if(!p)return false;el.value=`${p.year}-${p.month}`;fire(el);return true}
    if(el.type==='date'){const p=parseMonthYear(value);if(!p)return false;el.value=`${p.year}-${p.month}-01`;fire(el);return true}
    return false;
  }
  window.JobCopilotDateControls={parseMonthYear,setCompositeDate,setDateField,selectByValueOrText};
})();
