// End-to-end check of "try without an account": fresh Chrome profile, cloud-mode test API, made-up CV.
// A signed-out user picks a CV in the first-run card, fills one application, and the second application
// asks them to sign in.   node scripts/e2e/guest_e2e.mjs
import {spawn, execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = path.join(os.homedir(), '.snapply-e2e/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PY = path.join(ROOT, 'backend/.venv/bin/python');
const API_PORT = 8796, WEB_PORT = 8898, CDP = 9363;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snapply-guest-'));
const data = path.join(tmp, 'data'), web = path.join(tmp, 'web'), prof = path.join(tmp, 'profile');
fs.mkdirSync(data); for (const d of ['a', 'b']) fs.mkdirSync(path.join(web, d), {recursive: true});
for (const d of ['a', 'b']) fs.copyFileSync(path.join(ROOT, '../Snapply Marketing/demo/apply.html'), path.join(web, d, 'apply.html'));
const cv = path.join(tmp, 'Sam-Taylor-CV.pdf');
execFileSync(PY, [path.join(ROOT, 'scripts/e2e/make_cv.py'), cv]);

const procs = [];
procs.push(spawn(PY, ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', String(API_PORT), '--log-level', 'warning'], {
  cwd: path.join(ROOT, 'backend'), stdio: 'ignore',
  env: {...process.env, JOB_COPILOT_DATA_DIR: data, SNAPPLY_MODE: 'cloud', SNAPPLY_SECRET: 'e2e-'.repeat(10), GOOGLE_CLIENT_ID: 'e2e.apps.googleusercontent.com', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: ''}}));
procs.push(spawn('python3', ['-m', 'http.server', String(WEB_PORT), '--bind', '127.0.0.1'], {cwd: web, stdio: 'ignore'}));
const done = async code => {procs.forEach(p => p.kill()); await sleep(1500); try {fs.rmSync(tmp, {recursive: true, force: true})} catch {} process.exit(code)};
for (let i = 0; i < 60; i++) {try {if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok) break} catch {} await sleep(500)}

procs.push(spawn(CHROME, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${prof}`, `--load-extension=${path.join(ROOT, 'extension')}`,
  `--disable-extensions-except=${path.join(ROOT, 'extension')}`, '--no-first-run', '--no-default-browser-check', '--window-size=1400,900', 'about:blank'], {stdio: 'ignore'}));
const targets = async () => (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
for (let i = 0; i < 60; i++) {try {await targets(); break} catch {await sleep(500)}}
const connect = async url => {const ws = new WebSocket(url); await new Promise(r => ws.onopen = r); let id = 0; const pend = new Map();
  ws.onmessage = e => {const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) {pend.get(m.id)(m); pend.delete(m.id)}};
  const send = (method, params = {}) => new Promise(r => {const i = ++id; pend.set(i, r); ws.send(JSON.stringify({id: i, method, params}))});
  const ev = async expr => (await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true})).result?.result?.value;
  return {send, ev, ws}};

let sw; for (let i = 0; i < 40 && !sw; i++) {sw = (await targets()).find(t => t.type === 'service_worker' && t.url.includes('background')); if (!sw) await sleep(500)}
const swc = await connect(sw.webSocketDebuggerUrl);
await swc.ev(`chrome.storage.local.set({apiBase:'http://127.0.0.1:${API_PORT}'}).then(()=>1)`);
const pageT = (await targets()).find(t => t.type === 'page' && !t.url.startsWith('chrome-extension'));
const page = await connect(pageT.webSocketDebuggerUrl);
const failures = [];
const check = (ok, msg) => {console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg)};

async function openPanel(url) {
  await page.send('Page.navigate', {url}); await sleep(3500);
  const t = (await targets()).find(t => t.type === 'iframe' && t.url.includes('popup.html'));
  return t && connect(t.webSocketDebuggerUrl);
}
// Point the extension at the test API (from inside the extension, then reopen the page).
let panel = await openPanel(`http://127.0.0.1:${WEB_PORT}/a/apply.html`);
await panel.ev(`chrome.storage.local.set({apiBase:'http://127.0.0.1:${API_PORT}'}).then(()=>1)`);
// 1. Signed out: the first-run card and the "try free" account card are shown
panel = await openPanel(`http://127.0.0.1:${WEB_PORT}/a/apply.html`);
check(!!panel, 'panel opens on the application page');
await sleep(1500);
check(/Try Snapply free/.test(await panel.ev(`document.getElementById('account').innerText`)), 'signed out: account card offers a free try');
check(await panel.ev(`!document.getElementById('onboard').hidden`), 'signed out: "Upload your CV" card is visible');
// 2. Choose the CV in the first-run card (no Google sign-in)
await panel.send('DOM.enable'); const doc = await panel.send('DOM.getDocument');
const node = await panel.send('DOM.querySelector', {nodeId: doc.result.root.nodeId, selector: '#onboardFile'});
await panel.send('DOM.setFileInputFiles', {nodeId: node.result.nodeId, files: [cv]});
let state = '';
for (let i = 0; i < 40 && !/^Done/.test(state); i++) {await sleep(500); state = await panel.ev(`document.getElementById('onboardState').innerText`)}
check(/^Done/.test(state), `CV imported without an account (${state.slice(0, 60)})`);
check(/Trying Snapply/.test(await panel.ev(`document.getElementById('account').innerText`)), 'account card now says it is a guest trial');
// 3. Fill the first application
await panel.ev(`document.getElementById('fillAllSafe').click(),1`); await sleep(4000);
const first = await page.ev(`document.getElementById('first_name').value`);
check(!!first, `first application filled (first name: "${first}")`);
// 4. A second application asks to sign in
panel = await openPanel(`http://127.0.0.1:${WEB_PORT}/b/apply.html`); await sleep(1500);
await panel.ev(`document.getElementById('fillAllSafe').click(),1`); await sleep(2500);
const msg = await panel.ev(`document.getElementById('summary').innerText`);
check(/free try/i.test(msg) && /Sign in with Google/.test(msg), `second application asks to sign in ("${msg.slice(0, 80)}")`);
check(!(await page.ev(`document.getElementById('first_name').value`)), 'second application was not filled');
await done(failures.length ? 1 : 0);
