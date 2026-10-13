const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const code=fs.readFileSync(__dirname+'/../extension/inpage_debug.js','utf8');
let observer, section='summary', exportedBlob;
class Element {
  constructor(tag='div') { this.tagName=tag.toUpperCase();this.style={};this.id='';this.textContent='';this.innerText=''; }
  getAttribute() { return null; }
  closest() { return null; }
  querySelectorAll() { return []; }
  getClientRects() { return [1]; }
  append() {}
  appendChild() {}
  click() {}
  remove() {}
}
const root=new Element('html');
const document={
  documentElement:root,title:'TRAC application',
  querySelectorAll(selector) {
    if(selector==='input,select,textarea') return [Object.assign(new Element('input'),{id:section})];
    if(selector==='h1,h2,h3,h4,h5,h6,legend') return [Object.assign(new Element('h2'),{innerText:section})];
    return [];
  },
  querySelector() { return null; },
  getElementById() { return null; },
  createElement(tag) { return new Element(tag); },
  addEventListener() {}
};
const window={JobCopilotAdapterRegistry:{detect:()=> 'TRAC'}};
class TestURL extends URL {static createObjectURL(blob){exportedBlob=blob;return 'blob:test'}static revokeObjectURL(){}}
const sandbox={window,document,location:{origin:'https://apps.trac.jobs',pathname:'/application/123',href:'https://apps.trac.jobs/application/123'},
  Element,MutationObserver:class {constructor(cb){observer=cb}observe(){}},
  getComputedStyle:()=>({display:'block',visibility:'visible'}),
  setTimeout,clearTimeout,Date,URL:TestURL,Blob,CSS:{escape:x=>x}};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
(async()=>{
  await new Promise(resolve=>setTimeout(resolve,550));
  const first=window.JobCopilotInPageDebug.staticCapture;
  assert.strictEqual(first.fields[0].id,'summary');
  section='application-questions';
  observer([{target:root,type:'childList'}]);
  await new Promise(resolve=>setTimeout(resolve,320));
  const second=window.JobCopilotInPageDebug.staticCapture;
  assert.strictEqual(second.fields[0].id,'application-questions');
  assert.notStrictEqual(first,second);
  assert.strictEqual(second.privacy.input_values_captured,false);
  section='references';
  observer([{target:root,type:'childList'}]);
  window.JobCopilotInPageDebug.download();
  const payload=JSON.parse(await exportedBlob.text());
  assert.strictEqual(payload.static_capture.fields[0].id,'references');
  assert.strictEqual(payload.static_capture.privacy.input_values_captured,false);
  console.log('TRAC same-URL section recapture passed');
})().catch(e=>{console.error(e);process.exitCode=1});
