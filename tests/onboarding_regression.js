// New users signed in but never imported a CV (6 of 7 accounts, Nov 2026): a big first-run
// "Upload your CV" step must show until there is a profile, then point to step 2.
const assert=require('assert');const fs=require('fs');
const html=fs.readFileSync(__dirname+'/../extension/popup.html','utf8');
const js=fs.readFileSync(__dirname+'/../extension/popup.js','utf8');
assert.ok(/<section id="onboard"[^>]*hidden/.test(html)&&html.indexOf('id="onboard"')<html.indexOf('<h2>My Profile</h2>'),'the onboarding step sits above My Profile');
assert.ok(/id="onboardFile" type="file"/.test(html)&&/for="onboardFile"/.test(html),'one big button chooses the CV');
assert.ok(/await refreshOnboarding\(p\)/.test(js)&&/box\.hidden=\(!!p\?\.full_name&&!justOnboarded\)\|\|signedOut/.test(js),'shown only without a profile, and not before signing in');
assert.ok(/Step 2 of 2/.test(js),'after the upload it points to the next step');
const server=fs.readFileSync(__dirname+'/../backend/server.py','utf8');
assert.ok(/analytics\.record\('cv_imported'\)/.test(server)&&/analytics\.record\('cv_import_failed'\)/.test(server),'CV imports are counted');
console.log('Onboarding regression passed');
