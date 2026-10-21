// Live end-to-end check: the real Snapply extension in Chrome for Testing, on real UK job application
// pages. For each page it opens the in-page panel, presses "Fill this page" there, and records what was
// filled, which basic fields stayed empty, whether the CV was attached and whether the cover letter
// card appeared. It never presses a form's submit button: the only page clicks are "Apply" links on
// job advert pages that have no form yet. Sample data only (a made-up CV on a local test server).
//
// node live.mjs --chrome <path> --ext <dir> --api http://127.0.0.1:8797 --out <dir> [--count 30] [--urls file]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';

const arg = (k, d) => {const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d};
const CHROME = arg('chrome'), EXT = path.resolve(arg('ext')), API = arg('api'), OUT = arg('out');
const COUNT = +arg('count', 30), URLS = arg('urls');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXT_ID = 'pcfpfbcmcbcecobknjeemebdpddhnkgf';
// Sites that need an account before the form: reported as such, not counted as fill failures.
const LOGIN_HOSTS = /myworkdayjobs|myworkdaysite|jobs\.nhs\.uk|webitrent|tal\.net|engageats|civilservicejobs|successfactors|taleo/i;

// ---- job pages: random adverts from the government job site, followed to the employer's form ----
async function randomApplyUrls(n) {
  const kws = ['administrator', 'assistant', 'receptionist', 'customer service', 'sales', 'marketing', 'accounts', 'warehouse',
    'care assistant', 'teaching assistant', 'developer', 'analyst', 'coordinator', 'officer', 'manager', 'support worker', 'cleaner', 'driver'];
  const locs = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Bristol', 'Glasgow', 'Liverpool', 'Sheffield', 'Nottingham', 'Cardiff'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const byHost = new Map();
  for (let round = 0; round < 40 && byHost.size < n; round++) {
    const url = `https://www.jobs.service.gov.uk/jobs/search?keywords=${encodeURIComponent(pick(kws))}&location=${pick(locs)}`;
    let html = '';
    try {html = await (await fetch(url)).text()} catch {continue}
    const ids = [...new Set([...html.matchAll(/href="\/jobs\/([0-9a-f]{24})"/g)].map(m => m[1]))].sort(() => Math.random() - .5).slice(0, 8);
    for (const id of ids) {
      try {
        const b = await (await fetch(`https://www.jobs.service.gov.uk/jobs/${id}/before-you-apply`)).text();
        const m = b.match(/href="(https?:\/\/(?!www\.jobs\.service)[^"]+)"[^>]*>\s*Continue to the employer/);
        if (!m) continue;
        const u = m[1].replace(/&amp;/g, '&'), host = new URL(u).host;
        if (!byHost.has(host)) byHost.set(host, u);
      } catch {}
      if (byHost.size >= n) break;
      await sleep(300);
    }
  }
  return [...byHost.values()];
}

// ---- Chrome DevTools Protocol over the browser websocket (flattened sessions) ----
class CDP {
  constructor(ws) {this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.onmessage = e => {const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {const {res, rej} = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result)}
      else if (m.method) this.handlers.forEach(h => h(m))}}
  send(method, params = {}, sessionId) {const id = ++this.id;
    return new Promise((res, rej) => {this.pending.set(id, {res, rej}); this.ws.send(JSON.stringify({id, method, params, sessionId}));
      setTimeout(() => {if (this.pending.has(id)) {this.pending.delete(id); rej(new Error('timeout ' + method))}}, 30000)})}
  on(h) {this.handlers.push(h)}
}
async function evaluate(cdp, sessionId, expression) {
  const r = await cdp.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

// Every frame of a target, including same-site iframes that share its process (they are not separate
// targets): an isolated world per frame, so the page's own scripts are untouched.
async function frameEvals(cdp, sessionId, expression, seen) {
  const out = [];
  let tree;
  try {tree = (await cdp.send('Page.getFrameTree', {}, sessionId)).frameTree} catch {return out}
  const walk = n => [n.frame, ...(n.childFrames || []).flatMap(walk)];
  for (const f of walk(tree)) {
    if (seen.has(f.id) || /^(chrome-extension|about|data|javascript):/.test(f.url || '')) continue;
    try {
      const {executionContextId} = await cdp.send('Page.createIsolatedWorld', {frameId: f.id, worldName: 'snapply-e2e'}, sessionId);
      const r = await cdp.send('Runtime.evaluate', {expression, contextId: executionContextId, returnByValue: true, awaitPromise: true}, sessionId);
      if (!r.exceptionDetails) {seen.add(f.id); out.push(r.result.value)}
    } catch {}
  }
  return out;
}

// What a frame looks like: its fields, which are filled, upload areas, password boxes.
const FRAME_STATS = `(()=>{
  const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return (r.width>0&&r.height>0&&s.visibility!=='hidden')||e.type==='file'};
  const lab=e=>String(e.labels?.[0]?.innerText||e.getAttribute('aria-label')||e.placeholder||e.closest('label')?.innerText||e.name||e.id||'').replace(/\\s+/g,' ').trim().slice(0,70);
  const els=[...document.querySelectorAll('input,select,textarea')].filter(e=>!/^(hidden|submit|button|image|reset)$/.test(e.type)&&!e.disabled&&vis(e)&&!e.matches('.select2-focusser,.select2-input'));
  const seen=new Set(),fields=[];
  for(const e of els){
    if(e.type==='radio'){if(seen.has(e.name))continue;seen.add(e.name);const g=[...document.querySelectorAll('input[type=radio][name="'+CSS.escape(e.name)+'"]')];
      fields.push({kind:'choice',label:(e.closest('fieldset')?.querySelector('legend')?.innerText||lab(e)).slice(0,70),filled:g.some(x=>x.checked)});continue}
    if(e.type==='checkbox'){fields.push({kind:'checkbox',label:lab(e),filled:e.checked});continue}
    if(e.type==='file'){fields.push({kind:'file',label:(lab(e)+' '+(e.parentElement?.innerText||'')).replace(/\\s+/g,' ').trim().slice(0,70),filled:e.files.length>0});continue}
    if(e.type==='password'){fields.push({kind:'password',label:lab(e),filled:!!e.value});continue}
    fields.push({kind:e.tagName==='SELECT'?'select':'text',label:lab(e),filled:!!String(e.value||'').trim()});
  }
  return {url:location.href,fields};
})()`;
const BASIC = /\b(first|last|given|family|sur|full)\s*-?name\b|^name\b|e-?mail|phone|mobile|telephone|post\s*code|zip/i;
const SECONDARY = /home|work|other|alternative|secondary|evening|day\s*time|landline|confirm|re-?enter|verify|referee|reference|emergency|next of kin/i;

async function checkSite(cdp, url) {
  const res = {url, host: new URL(url).host, panel: false, summary: '', notes: []};
  const {targetId} = await cdp.send('Target.createTarget', {url: 'about:blank'});
  const {sessionId: page} = await cdp.send('Target.attachToTarget', {targetId, flatten: true});
  const frames = new Map(); // sessionId -> url (iframes, including the Snapply panel)
  const onEvt = m => {
    if (m.method === 'Target.attachedToTarget' && (m.sessionId === page || frames.has(m.sessionId))) {
      frames.set(m.params.sessionId, m.params.targetInfo.url);
      cdp.send('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: false, flatten: true}, m.params.sessionId).catch(() => {});
    }
    if (m.method === 'Target.detachedFromTarget') frames.delete(m.params.sessionId);
    if (m.method === 'Target.targetInfoChanged') for (const [s] of frames) if (s && m.params.targetInfo) {/* urls refreshed below */}
  };
  cdp.on(onEvt);
  try {
    await cdp.send('Page.enable', {}, page);
    await cdp.send('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: false, flatten: true}, page);
    await cdp.send('Page.navigate', {url}, page);
    await sleep(9000);
    const urlNow = await evaluate(cdp, page, 'location.href').catch(() => url);
    res.final = urlNow;
    const stats = async () => {
      const seen = new Set(), all = [];
      for (const s of [page, ...frames.keys()]) all.push(...await frameEvals(cdp, s, FRAME_STATS, seen));
      return all.filter(st => st && !st.url.startsWith('chrome-extension://') && st.fields.length);
    };
    const count = async () => (await stats()).reduce((n, st) => n + st.fields.length, 0);
    // A job advert page: follow its Apply link (a link, or a button outside any form) to the form.
    if (await count() < 3) {
      const clicked = await evaluate(cdp, page, `(()=>{const c=[...document.querySelectorAll('a,button')].filter(a=>!a.closest('form')||a.tagName==='A').find(a=>/^\\s*(apply( now| online| for (this )?(job|position|role|vacancy))?|start (your )?application|i'?m interested)\\s*!?\\s*$/i.test(a.innerText||''));if(!c)return '';c.click();return (c.innerText||'').trim()})()`).catch(() => '');
      if (clicked) {res.notes.push(`followed "${clicked}"`); await sleep(9000)}
    }
    // The panel opens on its own on recognised pages; wait for it a little longer on slow ones.
    let panel = null;
    for (let i = 0; i < 12 && !panel; i++) {
      for (const [s, u] of frames) {try {if ((await evaluate(cdp, s, 'location.href')).includes('popup.html')) panel = s} catch {}}
      if (!panel) await sleep(1000);
    }
    res.panel = !!panel;
    if (panel) {
      await sleep(1500);
      await evaluate(cdp, panel, `document.getElementById('fillAllSafe').click()`);
      let last = '', stable = 0;
      for (let i = 0; i < 45 && stable < 3; i++) {
        await sleep(1000);
        const s = await evaluate(cdp, panel, `document.getElementById('summary')?.innerText||''`).catch(() => '');
        stable = s && s === last && !/Filling|Open an application|press Fill/i.test(s) ? stable + 1 : 0;
        last = s;
      }
      res.summary = last;
      res.coverCard = await evaluate(cdp, panel, `/Cover letter/.test(document.getElementById('cards')?.innerText||'')`).catch(() => false);
    }
    // Collect every form frame's fields after the fill.
    res.frames = await stats();
  } catch (e) {res.error = e.message} finally {
    cdp.handlers = cdp.handlers.filter(h => h !== onEvt);
    await cdp.send('Target.closeTarget', {targetId}).catch(() => {});
  }
  const all = (res.frames || []).flatMap(f => f.fields);
  res.fields = all.length;
  res.filled = all.filter(f => f.filled).length;
  res.login = all.some(f => f.kind === 'password') || LOGIN_HOSTS.test(res.final || url);
  res.missedBasics = all.filter(f => f.kind === 'text' && !f.filled && BASIC.test(f.label) && !SECONDARY.test(f.label)).map(f => f.label);
  const files = all.filter(f => f.kind === 'file');
  res.cvSlot = files.some(f => /cv|resume|résumé|curriculum/i.test(f.label)) || files.length === 1;
  res.cvAttached = files.some(f => f.filled);
  res.verdict = res.error ? 'error' : res.login ? 'login needed' : !res.fields ? 'no form found'
    : !res.panel ? 'PANEL MISSING' : res.missedBasics.length ? 'BASICS MISSED' : res.cvSlot && !res.cvAttached ? 'CV MISSED' : 'ok';
  return res;
}

async function main() {
  fs.mkdirSync(OUT, {recursive: true});
  const urls = URLS ? fs.readFileSync(URLS, 'utf8').split('\n').map(s => s.trim()).filter(s => /^https?:/.test(s)) : await randomApplyUrls(COUNT);
  console.log(`checking ${urls.length} application pages`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'snapply-e2e-profile-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9341', `--user-data-dir=${profile}`,
    `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1440,1000', 'about:blank'], {stdio: 'ignore'});
  let ver;
  for (let i = 0; i < 60 && !ver; i++) {try {ver = await (await fetch('http://127.0.0.1:9341/json/version')).json()} catch {await sleep(500)}}
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  const cdp = new CDP(ws);
  // Point the extension at the local test server (made-up CV), through its service worker.
  let sw;
  for (let i = 0; i < 40 && !sw; i++) {
    sw = (await cdp.send('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url.includes(EXT_ID));
    if (!sw) await sleep(500);
  }
  if (!sw) throw new Error('Snapply did not load in Chrome for Testing');
  const {sessionId: swS} = await cdp.send('Target.attachToTarget', {targetId: sw.targetId, flatten: true});
  await evaluate(cdp, swS, `chrome.storage.local.set({apiBase:${JSON.stringify(API)}})`);
  const results = [];
  for (const u of urls) {
    process.stdout.write(`- ${new URL(u).host} … `);
    const r = await Promise.race([checkSite(cdp, u), sleep(150000).then(() => ({url: u, host: new URL(u).host, verdict: 'error', error: 'timed out'}))]);
    console.log(r.verdict);
    results.push(r);
  }
  ws.close();
  const exited = new Promise(r => chrome.once('exit', r));
  chrome.kill(); await Promise.race([exited, sleep(5000)]);
  try {fs.rmSync(profile, {recursive: true, force: true})} catch {}
  const stamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(OUT, `${stamp}.json`), JSON.stringify(results, null, 2));
  const counts = results.reduce((a, r) => (a[r.verdict] = (a[r.verdict] || 0) + 1, a), {});
  const lines = [`# Snapply live check · ${stamp}`, '', `Pages: ${results.length} · ` + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · '), '',
    '| Site | Result | Panel | Filled | Basics left empty | CV | Cover card | Notes |', '|---|---|---|---|---|---|---|---|',
    ...results.map(r => `| ${r.host} | ${r.verdict} | ${r.panel ? 'yes' : 'no'} | ${r.filled ?? '-'}/${r.fields ?? '-'} | ${(r.missedBasics || []).join('; ')} | ${r.cvSlot ? (r.cvAttached ? 'attached' : 'NOT attached') : '-'} | ${r.coverCard ? 'yes' : '-'} | ${[...(r.notes || []), r.error || '', (r.summary || '').slice(0, 120)].filter(Boolean).join(' · ').replace(/\|/g, '/')} |`),
    '', 'Never submitted anything. Sample data only.'];
  fs.writeFileSync(path.join(OUT, `${stamp}.md`), lines.join('\n') + '\n');
  console.log(`report: ${path.join(OUT, stamp + '.md')}`);
}
main().catch(e => {console.error(e); process.exit(1)});
