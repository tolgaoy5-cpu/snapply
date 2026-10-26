// CV date ranges reach TRAC's day/month/year selects whatever format the CV used (seen live: only
// "MM/YYYY - MM/YYYY" worked, so "Sep 2019 – Mar 2023" or "2019 - 2022" left the dates empty).
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const c=fs.readFileSync(__dirname+'/../extension/trac_adapter.js','utf8');
const ctx={clean:x=>String(x||'').trim()};
vm.runInNewContext(c.match(/const months=[^;]+;/)[0]+c.slice(c.indexOf('  const MONTH_RX'),c.indexOf('  function employerRecords'))+';this.f=employmentDates',ctx);
const f=d=>JSON.parse(JSON.stringify(ctx.f(d)));
assert.deepEqual(f('03/2021-Present'),{start_month:'March',start_year:'2021',end_month:'',end_year:'',current:true});
assert.deepEqual(f('Sep 2019 – Mar 2023'),{start_month:'September',start_year:'2019',end_month:'March',end_year:'2023',current:false});
assert.deepEqual(f('September 2021 to date'),{start_month:'September',start_year:'2021',end_month:'',end_year:'',current:true});
assert.deepEqual(f('2019 - 2022'),{start_month:'',start_year:'2019',end_month:'',end_year:'2022',current:false});
assert.deepEqual(f('Oct. 2018 - Current'),{start_month:'October',start_year:'2018',end_month:'',end_year:'',current:true});
assert.deepEqual(f('not a date'),{});
console.log('TRAC date ranges ok');
