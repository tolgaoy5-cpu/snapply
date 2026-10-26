// "Edit profile" stores dates in the profile's own "MM/YYYY-MM/YYYY|Present" form whatever the user types,
// so every filler (TRAC, Workday, generic) reads them; unusual text is kept as typed.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const ctx={window:{},document:{getElementById:()=>null,addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../extension/profile_editor.js','utf8'),ctx);
const n=ctx.window.SnapplyProfileEditor.normaliseDates;
assert.equal(n('Sep 2021 – Present'),'09/2021-Present');
assert.equal(n('9/2019 - 03/2023'),'09/2019-03/2023');
assert.equal(n('2015 to 2018'),'2015-2018');
assert.equal(n('March 2020'),'03/2020');
assert.equal(n('Summer 2019 – Spring 2020'),'Summer 2019 – Spring 2020');
assert.equal(n(''),'');
console.log('profile editor dates ok');
