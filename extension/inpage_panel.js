// In-page Job Copilot panel (Simplify-style). On recognised ATS pages the panel opens on the
// right automatically; closing it leaves a logo button on the right edge to reopen it. The panel is popup.html
// in an iframe, so it is the same UI and code as the toolbar popup. Never submits anything.
(function(){
  if(window.top!==window||window.__JC_INPAGE_PANEL)return;
  window.__JC_INPAGE_PANEL=true;
  const ats=window.JobCopilotAdapterRegistry?.detect?.(document,location)||'GENERIC';
  if(ats==='GENERIC')return;

  // Closing hides the panel for this page only; the next job or application opens it again.
  const CLOSED_KEY='jcPanelClosed:'+location.hostname+location.pathname;
  const store={
    get(){try{return sessionStorage.getItem(CLOSED_KEY)==='1'}catch(_){return false}},
    set(v){try{v?sessionStorage.setItem(CLOSED_KEY,'1'):sessionStorage.removeItem(CLOSED_KEY)}catch(_){}}
  };

  // Logo image (Spark J). An <img> avoids SVG gradient ids, which do not paint when the
  // defining copy sits inside the hidden panel.
  const LOGO_URL=chrome.runtime.getURL('icons/icon256.png');
    const STYLE=`
    :host{all:initial}
    *{box-sizing:border-box}
    .panel{position:fixed;top:16px;right:16px;bottom:16px;width:480px;max-width:calc(100vw - 32px);z-index:2147483646;
      display:none;flex-direction:column;overflow:hidden;background:#f5f7fa;border:1px solid rgba(15,23,42,.08);border-radius:18px;
      box-shadow:0 24px 64px rgba(15,23,42,.22),0 4px 12px rgba(15,23,42,.08);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .panel.open{display:flex;animation:jc-in .28s cubic-bezier(.2,.8,.2,1)}
    .bar{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 16px;background:#fff;border-bottom:1px solid #e8ecf2}
    .bar .logo{width:34px;height:34px;border-radius:10px;display:block;box-shadow:0 4px 12px rgba(255,45,135,.28)}
    .titles{flex:1;min-width:0}
    .title{font-size:15px;font-weight:700;color:#0f172a;letter-spacing:-.01em;line-height:1.2}
    .sub{display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px #fff;flex:none}
    .hide{all:unset;display:grid;place-items:center;width:34px;height:34px;border-radius:10px;color:#475569;cursor:pointer}
    .hide svg{width:20px;height:20px}
    .hide:hover{background:#f1f5f9;color:#0f172a}
    .hide:focus-visible{outline:3px solid #93c5fd;outline-offset:1px}
    iframe{border:0;flex:1;width:100%;background:#f5f7fa}

    .tab{all:unset;position:fixed;right:0;top:50%;z-index:2147483646;display:none;align-items:center;gap:0;cursor:pointer;
      padding:8px 10px 8px 8px;background:rgba(255,255,255,.96);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
      border:1px solid rgba(15,23,42,.08);border-right:0;border-radius:16px 0 0 16px;
      box-shadow:0 12px 32px rgba(15,23,42,.16),0 2px 6px rgba(15,23,42,.06);
      transform:translateY(-50%);transition:gap .22s ease,padding .22s ease,box-shadow .22s ease;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .tab.show{display:flex;animation:jc-slide .45s cubic-bezier(.2,.8,.2,1)}
    .mark{position:relative;display:block;width:44px;height:44px;flex:none}
    .mark img{width:44px;height:44px;border-radius:12px;display:block;box-shadow:0 6px 16px rgba(255,45,135,.35)}
    .mark .dot{position:absolute;top:-2px;right:-2px;width:11px;height:11px}
    .tab.show .mark img{animation:jc-glow 1.8s ease-out .5s 2}
    .text{display:flex;flex-direction:column;max-width:0;overflow:hidden;white-space:nowrap;transition:max-width .26s ease}
    .text .title{font-size:14px}
    .tab:hover,.tab:focus-visible{gap:12px;padding-right:16px;box-shadow:0 16px 40px rgba(15,23,42,.2),0 2px 6px rgba(15,23,42,.06)}
    .tab:hover .text,.tab:focus-visible .text{max-width:180px}
    .tab:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}
    @keyframes jc-in{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
    @keyframes jc-slide{from{opacity:0;transform:translate(100%,-50%)}to{opacity:1;transform:translateY(-50%)}}
    @keyframes jc-glow{0%{box-shadow:0 6px 16px rgba(255,45,135,.35),0 0 0 0 rgba(255,45,135,.5)}100%{box-shadow:0 6px 16px rgba(255,45,135,.35),0 0 0 14px rgba(255,45,135,0)}}
    @media (prefers-reduced-motion:reduce){.panel.open,.tab.show,.tab.show .mark img{animation:none}.tab,.text{transition:none}}
  `;
  const host=document.createElement('div');
  host.id='job-copilot-inpage';
  const root=host.attachShadow({mode:'closed'});
  const atsLabel=ats.charAt(0)+ats.slice(1).toLowerCase();
  root.innerHTML=`<style>${STYLE}</style>
  <section class="panel" role="complementary" aria-label="Job Copilot">
    <header class="bar">
      <img class="logo" src="${LOGO_URL}" alt="">
      <div class="titles"><div class="title">Job Copilot</div><div class="sub"><span class="dot"></span>${atsLabel} detected · You review and submit</div></div>
      <button class="hide" type="button" aria-label="Minimise Job Copilot" title="Minimise">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </header>
  </section>
  <button class="tab" type="button" aria-label="Open Job Copilot">
    <span class="mark"><img src="${LOGO_URL}" alt=""><span class="dot"></span></span>
    <span class="text"><span class="title">Job Copilot</span><span class="sub">${atsLabel} detected</span></span>
  </button>`;
  const panel=root.querySelector('.panel'),tab=root.querySelector('.tab');
  let frame=null;

  // While the panel is open the page is pushed left so its own controls (e.g. Workday's sticky
  // Save and Continue) stay reachable. Narrow windows keep the overlay instead of squeezing the page.
  const html=document.documentElement;
  const prevMargin=html.style.getPropertyValue('margin-right'),prevPriority=html.style.getPropertyPriority('margin-right');
  function pushPage(on){
    if(on&&innerWidth>=1000)html.style.setProperty('margin-right',(Math.ceil(panel.getBoundingClientRect().width)+32)+'px','important');
    else if(prevMargin)html.style.setProperty('margin-right',prevMargin,prevPriority);
    else html.style.removeProperty('margin-right');
  }
  addEventListener('resize',()=>pushPage(panel.classList.contains('open')));

  function open(){
    if(!frame){
      frame=document.createElement('iframe');
      frame.title='Job Copilot';
      frame.src=chrome.runtime.getURL('popup.html')+'?embedded=1';
      panel.append(frame);
    }
    panel.classList.add('open');tab.classList.remove('show');store.set(false);pushPage(true);
  }
  function close(){panel.classList.remove('open');tab.classList.add('show');store.set(true);pushPage(false)}
  root.querySelector('.hide').addEventListener('click',close);
  tab.addEventListener('click',open);

  (document.body||document.documentElement).append(host);
  if(store.get())tab.classList.add('show');else open();

  chrome.runtime.onMessage.addListener((m,_s,send)=>{
    if(m.type==='JC_PANEL_TOGGLE'){panel.classList.contains('open')?close():open();send({ok:true})}
  });
})();
