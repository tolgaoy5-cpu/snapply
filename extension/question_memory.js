// Question memory: "ask once, remember, fill next time".
// Shared by the content script (page questions) and the popup (matching + saved answers).
// Pure functions only; storage lives in the local backend (saved_answers in state.json).
(function(){
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  const STOP=new Set(['a','an','the','of','to','in','on','for','and','or','is','are','you','your','do','does','did','have','has','please','any','if','this','that','with','we','our','be','been','at','by','as','it','what','how','long','which','when','where','who','why','is','was','will','would','can','could','provide','give','state','tell','us','me','my']);

  // Stable key for a question: case, punctuation, "*" and "Required" do not matter.
  function signature(label){
    return clean(label).toLowerCase()
      .replace(/\brequired\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ').trim()
      // Legal paragraphs can run to hundreds of words; the first 1000 characters identify the question.
      .slice(0,1000).trim();
  }
  function tokens(label){return new Set(signature(label).split(' ').filter(t=>t&&!STOP.has(t)))}
  // jaccard: shared / all meaningful words; overlap: shared / words of the shorter question.
  function similarity(a,b){
    const A=tokens(a),B=tokens(b);
    if(!A.size||!B.size)return {jaccard:0,overlap:0};
    let inter=0;A.forEach(t=>{if(B.has(t))inter++});
    return {jaccard:inter/(A.size+B.size-inter),overlap:inter/Math.min(A.size,B.size)};
  }

  // Legal declarations: a wrong answer can disqualify the applicant or be unlawful.
  const LEGAL=/\bbarred\b|regulated activity|criminal|conviction|caution|\bdbs\b|disclosure and barring|dismissed|right to work|eligib\w* to work|work permit|\bvisa\b|sponsor|immigration|leave to remain|settled status|consent|by checking this box|i confirm|i certify|authori[sz]|\bi agree\b|declar|happy for (us|it)|permission|transmitted/i;
  // Personal/EDI data: reused only with the user's confirmation.
  const SENSITIVE=/ethnic|\brace\b|religio|sexual orientation|disabilit|gender|\bsex\b|date of birth|marital|pronoun|national insurance|passport|health condition|pregnan|referee|\breference\b|next of kin|emergency contact|nationality|citizenship|country of birth|veteran|military|neurodiver|transgender|trans\b|socio.?economic|household earner|main earner|parents?.{0,20}occupation|free school meals|type of school|caring responsibilit|carer\b|age range|\bage\b.{0,10}group|marriage|civil partnership|maternity|gender reassignment|how you think of yourself|sexuality|heterosexual|bisexual/i;
  // Contact details: on a page about referees these belong to other people.
  const CONTACT=/\bname\b|e-?mail|tele?phone|\bphone\b|mobile|address|post ?code|relationship|job title/i;
  // Never stored or filled.
  const NEVER=/password|verification code|authenticator|security question|one.time code|\bpin\b/i;

  // Statements written for one job (or one person's circumstances) are proposed, never copied silently.
  const JOB_SPECIFIC=/supporting (information|statement)|personal statement|cover letter|reasons? for applying|why (do )?you (want|wish|are applying)|why (this|our) (role|job|company|organisation)|motivation|suitab|person specification|essential (and|&) desirable|gaps? (in|within) (your )?employment|career break|tell us about yourself|additional information/i;
  function sensitivity(label){
    if(NEVER.test(label))return 'never';
    if(LEGAL.test(label))return 'legal';
    if(SENSITIVE.test(label))return 'sensitive';
    if(JOB_SPECIFIC.test(label))return 'review';
    return 'normal';
  }
  const norm=s=>clean(s).toLowerCase();

  // Best saved answer for a page question, or null.
  // Exact signature first; otherwise a close wording match of the same kind.
  // For choice questions the saved value must be one of the options offered on this page.
  // A reworded question matches only if nearly all meaningful words are shared and little is added.
  function findMatch(saved,question,{minOverlap=0.85,minJaccard=0.6}={}){
    const list=Array.isArray(saved)?saved:Object.values(saved||{});
    const sig=signature(question.label);
    const fits=item=>{
      if(!item||!clean(item.value))return false;
      if((item.kind||'text')!==(question.kind||'text'))return false;
      if(question.kind==='choice'&&Array.isArray(question.options)&&question.options.length)
        return question.options.some(o=>norm(o)===norm(item.value));
      return true;
    };
    const exact=list.find(x=>x.signature===sig&&fits(x));
    if(exact)return {item:exact,score:1};
    let best=null;
    for(const item of list){
      if(!fits(item))continue;
      const sim=similarity(item.question,question.label);
      if(sim.overlap>=minOverlap&&sim.jaccard>=minJaccard&&(!best||sim.jaccard>best.score))best={item,score:sim.jaccard};
    }
    return best;
  }

  const api={signature,similarity,sensitivity,findMatch,clean,isContact:l=>CONTACT.test(l)};
  (typeof window!=='undefined'?window:globalThis).JobCopilotQuestions=api;
})();
