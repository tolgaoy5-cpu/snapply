// Hero demo: a looping, scripted walk-through of Snapply on a three-step application
// (fill details, reuse saved answers, write a cover letter, ready to submit). Plain HTML so it
// stays sharp at any size; sample data only. Shows the final state when motion is reduced.
(function(){
  const root=document.getElementById('heroDemo');
  if(!root)return;
  const W=620,H=560;
  root.innerHTML=`<div class="sd-stage">
  <div class="sd-bar"><i></i><i></i><i></i><span>careers.acme.co.uk/finance-analyst/apply</span></div>
  <div class="sd-body">
    <div class="sd-page">
      <div class="sd-co">ACME</div>
      <div class="sd-job">Finance Analyst <small>London · Full-time</small></div>
      <ol class="sd-steps"><li>Details</li><li>Questions</li><li>Cover letter</li></ol>
      <div class="sd-form"></div>
      <button class="sd-next" type="button" tabindex="-1">Save and continue</button>
    </div>
    <aside class="sd-panel">
      <div class="sd-ph"><img src="logo.png" alt=""><div><b>Snapply</b><span><i></i>Application detected</span></div></div>
      <div class="sd-sum"></div>
      <button class="sd-fill" type="button" tabindex="-1">Fill this page</button>
      <div class="sd-feed"></div>
    </aside>
  </div>
  <div class="sd-toast"><span class="sd-dot">✦</span><div><div class="sd-msg"></div><div class="sd-pb"><i></i></div></div></div>
  <div class="sd-end"><div class="sd-endcard"><div class="sd-big">✓</div><b>Ready to submit</b><span>3 pages filled · cover letter written and checked</span><small>You review it and press Submit yourself.</small></div></div>
  <svg class="sd-cursor" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l16 9-7 2-3 7z" fill="#0f172a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
</div>`;
  const $=s=>root.querySelector(s);
  const stage=$('.sd-stage'),form=$('.sd-form'),feed=$('.sd-feed'),sum=$('.sd-sum'),fillBtn=$('.sd-fill'),next=$('.sd-next'),toast=$('.sd-toast'),cursor=$('.sd-cursor'),end=$('.sd-end');
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  // Fit the fixed-size stage to the column.
  const fit=()=>{const s=root.clientWidth/W;stage.style.transform=`scale(${s})`;root.style.height=`${H*s}px`};
  new ResizeObserver(fit).observe(root);fit();

  const SCENES=[
    {step:0,fields:[['First name','Sam'],['Last name','Taylor'],['Email','sam.taylor@example.com'],['Phone','07700 900123'],['Postcode','E5 9PB'],['LinkedIn','linkedin.com/in/sam-taylor']]},
    {step:1,fields:[['Notice period','1 month','select'],['Do you have the right to work in the UK?','Yes','pills'],['Salary expectation','£42,000'],['Are you happy to work hybrid (3 days in the office)?','Yes','pills']]},
    {step:2,fields:[['Cover letter','', 'letter']]},
  ];
  const LETTER=`Dear Hiring Team,

I'm applying for the Finance Analyst role at Acme. At Northbridge Properties I prepare the monthly management accounts and run the annual budget, which matches the reporting and forecasting at the heart of this role.

I build the Excel models our directors use for scenario planning, and I explain variances to non-finance managers every month.

I'd welcome the chance to bring this to Acme.

Kind regards,
Sam Taylor`;

  function renderForm(scene){
    root.querySelectorAll('.sd-steps li').forEach((li,i)=>{li.className=i<scene.step?'done':i===scene.step?'on':''});
    form.innerHTML=scene.fields.map(([label,,kind])=>kind==='pills'
      ?`<div class="sd-f"><label>${label}</label><div class="sd-pills"><span>Yes</span><span>No</span></div></div>`
      :kind==='letter'?`<div class="sd-f"><label>${label} <em>*</em></label><div class="sd-in sd-letter"></div></div>`
      :`<div class="sd-f"><label>${label}</label><div class="sd-in${kind==='select'?' sd-sel':''}">${kind==='select'?'<span class="ph">Select…</span>':''}</div></div>`).join('');
    next.textContent=scene.step===2?'Review application':'Save and continue';
  }
  function pointAt(el,dx=0,dy=0){
    const s=root.clientWidth/W,r=el.getBoundingClientRect(),b=stage.getBoundingClientRect();
    cursor.style.transform=`translate(${(r.left-b.left)/s+r.width/(2*s)+dx}px,${(r.top-b.top)/s+r.height/(2*s)+dy}px)`;
  }
  async function click(el){pointAt(el);await sleep(650);cursor.classList.add('down');el.classList.add('press');await sleep(160);cursor.classList.remove('down');el.classList.remove('press')}
  function say(text,cls=''){const d=document.createElement('div');d.className='sd-line '+cls;d.innerHTML=text;feed.append(d);requestAnimationFrame(()=>d.classList.add('in'));return d}
  function showToast(msg,pct,done){toast.querySelector('.sd-msg').textContent=msg;toast.querySelector('.sd-pb i').style.width=pct+'%';toast.classList.toggle('done',!!done);toast.classList.add('on')}
  function glow(el){el.classList.add('glow');setTimeout(()=>el.classList.remove('glow'),900)}

  async function fillScene(scene,label){
    const boxes=[...form.querySelectorAll('.sd-f')];
    showToast(`Filling… 0/${boxes.length}`,4);
    for(let i=0;i<boxes.length;i++){
      const [,value,kind]=scene.fields[i],f=boxes[i];
      if(kind==='pills')f.querySelectorAll('.sd-pills span').forEach(p=>p.classList.toggle('sel',p.textContent===value));
      else f.querySelector('.sd-in').textContent=value;
      glow(kind==='pills'?f.querySelector('.sd-pills'):f.querySelector('.sd-in'));
      showToast(`Filling… ${i+1}/${boxes.length}`,Math.round(100*(i+1)/boxes.length));
      if(label)say(`<b>${label[i]}</b> ${value}<i>✓</i>`,'ok');
      await sleep(330);
    }
    showToast(`✓ ${boxes.length} ${scene.step===1?'answers':'fields'} filled`,100,true);
  }

  async function writeLetter(){
    const box=form.querySelector('.sd-letter');
    fillBtn.textContent='Write cover letter';
    await click(fillBtn);
    fillBtn.textContent='Writing…';fillBtn.classList.add('busy');
    say('Reading the job advert…','muted');await sleep(700);
    for(const t of ['Monthly reporting','Budgeting and forecasting','Excel modelling']){say(`<b>${t}</b><i>✓ in CV</i>`,'ok');await sleep(380)}
    box.classList.add('typing');
    const words=LETTER.split(/(\s+)/);let out='';
    for(let i=0;i<words.length;i++){out+=words[i];if(i%2===0){box.textContent=out;box.scrollTop=box.scrollHeight;await sleep(22)}}
    box.textContent=LETTER;box.classList.remove('typing');glow(box);
    say('<b>Checked against CV</b><i>✓</i>','ok');await sleep(350);
    say('<b>PDF attached</b><i>✓</i>','ok');
    fillBtn.textContent='Fill this page';fillBtn.classList.remove('busy');
    showToast('✓ Cover letter ready',100,true);
  }

  function reset(){end.classList.remove('on');toast.classList.remove('on');feed.innerHTML='';sum.textContent='Acme · press Fill this page to start.';cursor.style.transform='translate(250px,470px)'}

  async function play(){
    reset();renderForm(SCENES[0]);await sleep(900);
    await click(fillBtn);
    sum.textContent='Filling from your CV…';
    await fillScene(SCENES[0]);
    sum.textContent='Details · 6/6 complete';await sleep(1100);
    await click(next);toast.classList.remove('on');feed.innerHTML='';
    renderForm(SCENES[1]);sum.textContent='4 questions found';await sleep(600);
    await click(fillBtn);
    say('From your saved answers','head');
    await fillScene(SCENES[1],['Notice period','Right to work','Salary','Hybrid']);
    sum.textContent='Questions · 4/4 answered';await sleep(1200);
    await click(next);toast.classList.remove('on');feed.innerHTML='';
    renderForm(SCENES[2]);sum.textContent='Cover letter required';await sleep(500);
    await writeLetter();
    sum.textContent='All 3 pages complete';await sleep(1400);
    pointAt(next,0,0);await sleep(700);
    end.classList.add('on');await sleep(3200);
  }

  async function staticFinal(){
    reset();renderForm(SCENES[2]);form.querySelector('.sd-letter').textContent=LETTER;
    say('<b>Checked against CV</b><i>✓</i>','ok in');say('<b>PDF attached</b><i>✓</i>','ok in');
    sum.textContent='All 3 pages complete';cursor.style.display='none';
  }

  if(matchMedia('(prefers-reduced-motion: reduce)').matches){staticFinal();return}
  (async()=>{for(;;){if(document.hidden){await sleep(500);continue}try{await play()}catch(_){await sleep(1000)}}})();
})();
