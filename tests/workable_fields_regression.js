// Workable (Starling Bank, 2026-10-26): read-only "Select an option…" list boxes, hidden id inputs,
// tick-box groups whose ids change on every re-render, and cover letters that must keep their paragraphs.
const assert=require('assert');const fs=require('fs');
const pq=fs.readFileSync(__dirname+'/../extension/page_questions.js','utf8');
assert.ok(/getAttribute\('aria-hidden'\)==='true'&&el\.tabIndex<0\)continue/.test(pq),'hidden id inputs are not questions');
assert.ok(/control:'aria_combobox'/.test(pq)&&/c\.control==='aria_combobox'\)\{const list=await openCombobox/.test(pq),'list boxes are read and filled as choices');
assert.ok(/'g:'\+\(group\.getAttribute\('data-ui'\)/.test(pq),'tick-box groups use the stable data-ui name');
assert.ok(/closest\('fieldset,\[role="group"\]'\)\?\.querySelectorAll\('input\[type="checkbox"\]'\)\.length\|\|0\)>1\)continue/.test(pq),'boxes of a group are not separate questions');
assert.ok(/HTMLTextAreaElement\?String\(value\)\.replace/.test(pq)&&/clean\(now\)===clean\(target\)/.test(pq),'text boxes keep line breaks');
const popup=fs.readFileSync(__dirname+'/../extension/popup.js','utf8');
assert.ok(/if\(!go\.isConnected\)/.test(popup),'a new AI draft can be filled again');
const api=fs.readFileSync(__dirname+'/../extension/api_client.js','utf8');
assert.ok(/Extension context invalidated/.test(api),'a panel left over from an update says so instead of logging errors');
console.log('Workable fields regression passed');
