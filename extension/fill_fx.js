// Visual feedback while "Fill this page" runs: each field Snapply changes glows briefly, the page
// follows the fill, and a small toast counts progress ("Filling… 7/12", then "✓ 12 fields filled").
// Purely cosmetic: values are already committed by the fillers; this only watches the synthetic
// input/change events they fire between FILL_FX on and off. The user's own typing (trusted events)
// is never counted.
(() => {
  if (window.__snapplyFillFx) return;
  window.__snapplyFillFx = true;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const top = window === window.top;
  let active = false, seen = new WeakSet(), count = 0, total = 0, queue = [], timer = null, host = null, toast = null, hideTimer = null, offTimer = null;

  function style() {
    if (document.getElementById('snapply-fx-style')) return;
    const s = document.createElement('style');
    s.id = 'snapply-fx-style';
    s.textContent = `[data-snapply-fx]{outline:2px solid #ff2d87!important;outline-offset:2px!important;box-shadow:0 0 0 4px rgba(255,45,135,.18),0 0 18px rgba(124,58,237,.35)!important;transition:outline-color .4s,box-shadow .4s!important}
[data-snapply-fx="out"]{outline-color:transparent!important;box-shadow:none!important}`;
    (document.head || document.documentElement).appendChild(s);
  }

  function ensureToast() {
    if (!top || toast) return;
    host = document.createElement('div');
    host.id = 'snapply-fill-toast';
    host.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483646;pointer-events:none';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
.t{font:600 13px/1.2 Inter,system-ui,-apple-system,sans-serif;color:#1f1235;background:#fff;border-radius:999px;padding:9px 16px 9px 10px;display:flex;align-items:center;gap:10px;box-shadow:0 10px 30px rgba(31,18,53,.18),0 0 0 1px rgba(124,58,237,.12);opacity:0;transform:translateY(-8px);transition:opacity .25s,transform .25s;min-width:190px}
.t.on{opacity:1;transform:none}
.dot{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#ff7a3d,#ff2d87 55%,#7c3aed);display:grid;place-items:center;color:#fff;font-size:12px;flex:none}
.dot.spin{animation:p 1s ease-in-out infinite}
@keyframes p{50%{transform:scale(.82)}}
.bar{height:3px;border-radius:3px;background:#f1e8ff;overflow:hidden;margin-top:5px}
.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff7a3d,#ff2d87,#7c3aed);transition:width .25s}
@media (prefers-reduced-motion:reduce){.t,.bar i{transition:none}.dot.spin{animation:none}}
</style><div class="t" role="status" aria-live="polite"><span class="dot spin">✦</span><div style="flex:1"><div class="msg">Filling…</div><div class="bar"><i></i></div></div></div>`;
    toast = root.querySelector('.t');
    document.documentElement.appendChild(host);
  }

  function render(done) {
    if (!top) return;
    // A form inside a frame fills there; the top page then has nothing to report.
    if (done && !count) { if (toast) toast.classList.remove('on'); return; }
    ensureToast();
    // Centre over the page itself, not under the Snapply panel (which pushes the page left).
    const pushed = parseFloat(getComputedStyle(document.documentElement).marginRight) || 0;
    host.style.left = `${Math.round((innerWidth - pushed) / 2)}px`;
    const shown = Math.max(total, count);
    toast.querySelector('.msg').textContent = done
      ? `✓ ${count} field${count === 1 ? '' : 's'} filled`
      : `Filling… ${count}${shown ? '/' + shown : ''}`;
    toast.querySelector('.dot').classList.toggle('spin', !done);
    toast.querySelector('.dot').textContent = done ? '✓' : '✦';
    toast.querySelector('.bar i').style.width = done ? '100%' : `${shown ? Math.round(100 * count / shown) : 10}%`;
    toast.classList.add('on');
    clearTimeout(hideTimer);
    if (done) hideTimer = setTimeout(() => toast && toast.classList.remove('on'), 2600);
  }

  // The element worth highlighting: custom radios/checkboxes and styled selects hide the real input.
  function visual(el) {
    const r = el.getBoundingClientRect();
    if (r.width > 4 && r.height > 4) return el;
    return el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.parentElement;
  }

  function glow(el) {
    const v = visual(el);
    if (!v || !v.isConnected) return;
    style();
    if (!reduced()) v.scrollIntoView({ block: 'center', behavior: 'smooth' });
    v.setAttribute('data-snapply-fx', 'on');
    setTimeout(() => v.setAttribute('data-snapply-fx', 'out'), 700);
    setTimeout(() => v.removeAttribute('data-snapply-fx'), 1200);
  }

  // Highlights play one after another so the page visibly follows the fill (capped so a long form
  // never makes the user wait: past ~25 queued fields the rest flash together).
  function pump() {
    if (!queue.length) { timer = null; return; }
    const batch = queue.length > 25 ? queue.splice(0, queue.length) : [queue.shift()];
    batch.forEach(glow);
    timer = setTimeout(pump, reduced() ? 0 : 140);
  }

  function onEvent(e) {
    if (!active || e.isTrusted) return;
    const el = e.target;
    if (!(el instanceof Element) || !el.matches('input,select,textarea,[contenteditable],[role=combobox],[role=radio],[role=checkbox]')) return;
    if (el.closest('#snapply-fill-toast,[id^=snapply]')) return;
    if (seen.has(el)) return;
    seen.add(el);
    count++;
    queue.push(el);
    if (!timer) pump();
    render(false);
  }
  document.addEventListener('change', onEvent, true);
  document.addEventListener('input', onEvent, true);

  function fillable() {
    return [...document.querySelectorAll('input,select,textarea')].filter(el => {
      if (/^(hidden|submit|button|reset|image|file|password)$/i.test(el.type || '') || el.disabled || el.readOnly) return false;
      if (el.type === 'radio' || el.type === 'checkbox') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !String(el.value || '').trim();
    }).length;
  }

  function start() {
    clearTimeout(offTimer);
    if (!active) { seen = new WeakSet(); count = 0; queue = []; }
    active = true;
    total = fillable();
    render(false);
  }

  function stop() {
    // Let the last highlights and late React commits land before the summary.
    clearTimeout(offTimer);
    offTimer = setTimeout(() => { active = false; render(true); }, 350);
  }

  chrome.runtime.onMessage.addListener((m, _s, send) => {
    if (m.type !== 'FILL_FX') return;
    m.on ? start() : stop();
    send({ ok: true });
  });
})();
