(function(){
  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function render(result){
    const used=(result.allowed_evidence||[]).map((e,i)=>`<li><b>E${i+1}</b> ${esc(e)}</li>`).join('');
    const unsupported=(result.validation?.unsupported_claims||[]).map(x=>`<li>${esc(x)}</li>`).join('');
    return `<div class="card"><b>${esc(result.status)}</b><div class="answer">${esc(result.answer)}</div><div class="muted">Provider: ${esc(result.provider||'n/a')} · Insert allowed: ${result.insert_allowed?'yes':'no'}</div><details><summary>Evidence used/allowed</summary><ol>${used||'<li>None</li>'}</ol></details>${unsupported?`<details open><summary>Unsupported claims</summary><ul>${unsupported}</ul></details>`:''}</div>`;
  }
  window.JobCopilotAnswerReview={render};
})();
