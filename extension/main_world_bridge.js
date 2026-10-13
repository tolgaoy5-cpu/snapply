(()=>{
  if(window.__JC_MAIN_WORLD_BRIDGE_V2618)return;
  window.__JC_MAIN_WORLD_BRIDGE_V2618=true;

  const eventStub=(node,type)=>({
    type,
    target:node,
    currentTarget:node,
    nativeEvent:{target:node,currentTarget:node,type,isTrusted:true,button:0,buttons:1},
    button:0,buttons:1,
    defaultPrevented:false,
    preventDefault(){this.defaultPrevented=true;},
    stopPropagation(){},
    persist(){},
    isDefaultPrevented(){return this.defaultPrevented;},
    isPropagationStopped(){return false;}
  });
  const reactProps=(node)=>{
    if(!node)return null;
    for(const k of Object.getOwnPropertyNames(node)){
      if(k.startsWith('__reactProps$')||k.startsWith('__reactEventHandlers$')){
        const v=node[k]; if(v&&typeof v==='object')return v;
      }
    }
    return null;
  };
  const candidateNodes=(node)=>{
    const out=[]; const seen=new Set();
    const add=n=>{if(n&&!seen.has(n)){seen.add(n);out.push(n)}};
    add(node);
    if(node?.querySelectorAll){for(const n of node.querySelectorAll('[data-automation-id="promptOption"],span,p,div'))add(n)}
    let p=node?.parentElement; for(let i=0;p&&i<5;i++,p=p.parentElement)add(p);
    return out;
  };
  function invoke(node){
    const nodes=candidateNodes(node);
    const handlerOrder=['onClick','onMouseDown','onPointerDown','onMouseUp','onPointerUp'];
    const found=[];
    for(const n of nodes){
      const props=reactProps(n); if(!props)continue;
      const names=handlerOrder.filter(k=>typeof props[k]==='function');
      if(names.length)found.push({node:n,props,names});
    }
    // Prefer the node carrying the option role/menuItem identity, then descendants/ancestors.
    found.sort((a,b)=>{
      const score=x=>((x.node===node)?20:0)+(x.node.getAttribute?.('role')==='option'?10:0)+(x.node.getAttribute?.('data-automation-id')==='menuItem'?10:0);
      return score(b)-score(a);
    });
    for(const item of found){
      // Workday option selection is normally onClick. Invoke exactly one handler to avoid toggling twice.
      for(const name of handlerOrder){
        const fn=item.props[name]; if(typeof fn!=='function')continue;
        try{
          fn(eventStub(item.node,name.slice(2).toLowerCase()));
          return {ok:true,handler:name,nodeTag:item.node.tagName,role:item.node.getAttribute?.('role')||null,automation:item.node.getAttribute?.('data-automation-id')||null};
        }catch(e){
          return {ok:false,error:String(e&&e.message||e),handler:name};
        }
      }
    }
    return {ok:false,error:'No React selection handler found on option or nearby nodes.'};
  }

  document.addEventListener('jc-main-react-select-request',(ev)=>{
    let req={}; try{req=JSON.parse(ev.detail||'{}')}catch(_){return}
    const node=req.id?document.getElementById(req.id):null;
    const result=node?invoke(node):{ok:false,error:'Target option node not found in MAIN world.'};
    document.dispatchEvent(new CustomEvent('jc-main-react-select-response',{detail:JSON.stringify({requestId:req.requestId,...result})}));
  });

  // Generic call into MAIN-world helpers registered on window.__jcMain (react-select, Workday dates).
  document.addEventListener('jc-main-call',async(ev)=>{
    let req={};try{req=JSON.parse(ev.detail||'{}')}catch(_){return}
    let result;
    try{const fn=window.__jcMain?.[req.fn];result=fn?await fn(...(req.args||[])):{ok:false,reason:'Unknown page helper.'}}
    catch(e){result={ok:false,reason:String(e?.message||e).slice(0,160)}}
    document.dispatchEvent(new CustomEvent('jc-main-result',{detail:JSON.stringify({requestId:req.requestId,result})}));
  });
})();
