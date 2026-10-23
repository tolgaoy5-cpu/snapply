// Small driver for the manual test window (manual.mjs, CDP port 9342):
//   node cdp.mjs shot <file.png>          screenshot of the current page tab
//   node cdp.mjs page '<js expression>'   evaluate in the page (main world)
//   node cdp.mjs panel '<js expression>'  evaluate inside the Snapply panel (popup.html iframe)
//   node cdp.mjs go <url>                 navigate the page tab
//   node cdp.mjs click '<button text>'    real mouse click on the first visible button/link with that text
//   node cdp.mjs clicksel '<css selector>' real mouse click on the element matching the selector
import fs from 'node:fs';

const [, , CMD, ARG] = process.argv;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9342/json/list')).json();
const page = list.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('devtools://'));
const panel = list.find(t => t.type === 'iframe' && t.url.includes('popup.html'));
const target = CMD === 'panel' ? panel : page;
if (!target) {console.log(CMD === 'panel' ? 'no Snapply panel on this page' : 'no page'); process.exit(1)}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0;
const send = (method, params = {}) => new Promise(r => {const i = ++id; const h = e => {const m = JSON.parse(e.data); if (m.id === i) {ws.removeEventListener('message', h); r(m)}}; ws.addEventListener('message', h); ws.send(JSON.stringify({id: i, method, params}))});
if (CMD === 'shot') {
  await send('Page.bringToFront');
  const {result} = await send('Page.captureScreenshot', {format: 'png'});
  fs.writeFileSync(ARG, Buffer.from(result.data, 'base64')); console.log(ARG);
} else if (CMD === 'click') {
  const r = await send('Runtime.evaluate', {returnByValue: true, expression: `(()=>{const t=${JSON.stringify(ARG)}.toLowerCase();const el=[...document.querySelectorAll('a,button,[role=button],input[type=submit]')].find(x=>x.offsetParent!==null&&(x.innerText||x.value||'').trim().toLowerCase()===t);if(!el)return null;el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`});
  const p = r.result?.result?.value;
  if (!p) console.log('not found');
  else {for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, x: p.x, y: p.y, button: 'left', clickCount: 1}); await sleep(3000); console.log('clicked')}
} else if (CMD === 'clicksel') {
  const r = await send('Runtime.evaluate', {returnByValue: true, expression: `(()=>{const el=document.querySelector(${JSON.stringify(ARG)});if(!el)return null;el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`});
  const p = r.result?.result?.value;
  if (!p) console.log('not found');
  else {for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, x: p.x, y: p.y, button: 'left', clickCount: 1}); await sleep(3000); console.log('clicked')}
} else if (CMD === 'go') {
  await send('Page.navigate', {url: ARG}); await sleep(4000); console.log('ok');
} else {
  const r = await send('Runtime.evaluate', {expression: ARG, awaitPromise: true, returnByValue: true});
  console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r.result, null, 1));
}
ws.close(); process.exit(0);
