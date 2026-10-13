// MAIN world: React-select lists keep their options and value in the component.
// selectOption() works without opening the menu or page focus (verified live on Greenhouse, 2026-10-12).
(function(){
  function reactSelect(id,action,wanted){
  const input=document.getElementById(id);if(!input)return {ok:false,reason:'Question not found on this page.'};
  const fk=Object.keys(input).find(k=>k.startsWith('__reactFiber'));
  let sel=null;for(let f=fk&&input[fk],i=0;f&&i<40;f=f.return,i++){if(f.stateNode&&typeof f.stateNode.selectOption==='function'){sel=f.stateNode;break}}
  if(!sel)return {ok:false,reason:'This list could not be read.'};
  const label=o=>String(o?.label??o?.value??'').replace(/\s+/g,' ').trim();
  const flat=(sel.props.options||[]).flatMap(o=>Array.isArray(o?.options)?o.options:[o]);
  if(action==='options')return {ok:true,options:flat.map(label).filter(Boolean)};
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  const opt=flat.find(o=>norm(label(o))===norm(wanted));
  if(!opt)return {ok:false,reason:'That option is not offered here.'};
  sel.selectOption(opt);
  const v=sel.props.value;const now=(Array.isArray(v)?v:[v]).map(label).filter(Boolean);
  return {ok:true,value:now.join(', ')};
}
  (window.__jcMain=window.__jcMain||{}).reactSelect=reactSelect;
})();
