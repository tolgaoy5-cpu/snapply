// Visible Chrome for Testing window with the Snapply extension and the made-up test CV, for sites that need
// the user's own login (TRAC, Workday…). The user signs in by hand; Claude then drives it over CDP
// (port 9342). Nothing is ever submitted or saved.
//   node manual.mjs <api base> <url> [url…]          (run.sh-style local test API must already be running)
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, '../../extension');
const CHROME = path.join(os.homedir(), '.snapply-e2e/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PROFILE = path.join(os.homedir(), '.snapply-e2e/manual-profile');   // kept, so logins survive between sessions
const [, , API, ...URLS] = process.argv;
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(PROFILE, {recursive: true});
spawn(CHROME, ['--remote-debugging-port=9342', `--user-data-dir=${PROFILE}`, `--load-extension=${EXT}`,
  `--disable-extensions-except=${EXT}`, '--no-first-run', '--no-default-browser-check', '--window-size=1500,950', ...URLS],
  {stdio: 'ignore', detached: true}).unref();

// Point the extension at the test API (its service worker owns chrome.storage).
let ver;
for (let i = 0; i < 60 && !ver; i++) {try {ver = await (await fetch('http://127.0.0.1:9342/json/version')).json()} catch {await sleep(500)}}
let sw;
for (let i = 0; i < 40 && !sw; i++) {
  sw = (await (await fetch('http://127.0.0.1:9342/json/list')).json()).find(t => t.type === 'service_worker' && t.url.includes('background'));
  if (!sw) await sleep(500);
}
const ws = new WebSocket(sw.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression: `chrome.storage.local.set({apiBase:${JSON.stringify(API)}})`, awaitPromise: true}}));
await new Promise(r => ws.onmessage = r);
ws.close();
console.log('Chrome for Testing is open with Snapply (test CV). CDP on port 9342.');
process.exit(0);
