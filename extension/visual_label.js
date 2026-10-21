// Labels by position, for forms whose captions are plain text next to the control instead of a
// <label> (no-code builders such as Bubble, many hand-built employer forms): the nearest short text
// directly above the control (or the radio/checkbox group), or just to its left on the same row.
// Used only when the control has no linked label, ARIA name, placeholder or question container.
(function(){
  if(window.snapplyVisualLabel)return;
  const CONTROL='input,select,textarea,button,[role=combobox],[role=radio],[role=checkbox],[role=listbox]';
  const tidy=s=>String(s||'').replace(/\s+/g,' ').replace(/\s*[✱*]\s*$/,'').trim();

  function rectOf(els){
    let r=null;
    for(const e of els){
      const b=e.getBoundingClientRect();if(!b.width&&!b.height)continue;
      r=r?{left:Math.min(r.left,b.left),top:Math.min(r.top,b.top),right:Math.max(r.right,b.right),bottom:Math.max(r.bottom,b.bottom)}:{left:b.left,top:b.top,right:b.right,bottom:b.bottom};
    }
    return r;
  }
  // Elements that carry their own text (not just nested text), with no form controls inside.
  function textBlocks(root,skip){
    const out=[];
    for(const c of root.querySelectorAll('*')){
      if(skip.some(s=>c===s||c.contains(s)||s.contains(c)))continue;
      if(c.matches(CONTROL)||c.querySelector(CONTROL))continue;
      // A label tied to another visible control belongs to that control.
      if(c.matches('label[for]')&&!skip.some(s=>s.id&&c.getAttribute('for')===s.id)){const o=document.getElementById(c.getAttribute('for'));if(o&&o.getBoundingClientRect().width>0)continue}
      const own=[...c.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
      if(!own)continue;
      const t=tidy(c.innerText||c.textContent);
      if(t.length<2||t.length>200)continue;
      out.push([c,t]);
    }
    return out;
  }

  function visualLabel(el){
    let parts=[el];
    if(el.type==='radio'||el.type==='checkbox'){
      const same=el.name?[...document.querySelectorAll(`input[type="${el.type}"][name="${CSS.escape(el.name)}"]`)]:[el];
      parts=same.flatMap(r=>[r,...(r.labels?[...r.labels]:[])]);
    }
    const t=rectOf(parts);if(!t)return '';
    const cy=(t.top+t.bottom)/2;
    let best=null,node=el;
    for(let depth=0;depth<6&&node.parentElement&&node.parentElement!==document.body;depth++){
      node=node.parentElement;
      for(const [c,text] of textBlocks(node,parts)){
        const b=c.getBoundingClientRect();if(!b.width||!b.height)continue;
        let d=null;
        // Above: overlapping horizontally (or ending just left of it, over a country-code picker
        // that shares the row), close vertically.
        if(b.bottom<=t.top+6&&t.top-b.bottom<=70&&b.left<t.right&&b.right>t.left-140)d=t.top-b.bottom+(b.right<t.left?8:0);
        // Left on the same row.
        else if(b.right<=t.left+6&&t.left-b.right<=240&&b.top-6<=cy&&b.bottom+6>=cy)d=(t.left-b.right)/2;
        if(d!=null&&(!best||d<best.d))best={d,text};
      }
      if(best&&best.d<=28)break;
    }
    return best?best.text:'';
  }
  window.snapplyVisualLabel=visualLabel;
})();
