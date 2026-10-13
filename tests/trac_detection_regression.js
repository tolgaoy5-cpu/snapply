const fs=require('fs'),vm=require('vm');
const code=fs.readFileSync(__dirname+'/../extension/adapter_registry.js','utf8');
function detect(host,selectors=[]){
 const sandbox={window:{},location:{hostname:host},document:{querySelector:(s)=>selectors.includes(s)?{}:null}};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 return sandbox.window.JobCopilotAdapterRegistry.detect(sandbox.document,sandbox.location);
}
const cases=[
 ['apps.trac.jobs',['#application_form'],'TRAC'],
 ['foo.trac.jobs',['.application-form'],'TRAC'],
 ['boards.greenhouse.io',['form'],'GREENHOUSE'],
 ['livenation.wd503.myworkdayjobs.com',['#application_form'],'WORKDAY'],
 // Generic ids such as #application_form are shared across ATS products and must not claim an unknown host.
 ['example.com',['#application_form'],'GENERIC'],
 // An embedded Greenhouse board on a company domain is still detected by its ATS-specific marker.
 ['careers.example.com',['iframe[src*="greenhouse.io"]'],'GREENHOUSE'],
 ['example.com',[],'GENERIC']
];
for(const [host,selectors,want] of cases){
 const got=detect(host,selectors);
 if(got!==want) throw new Error(`${host}: got ${got}, want ${want}`);
 console.log(`${host} -> ${got}`);
}
console.log('TRAC host-first detector regression passed');
