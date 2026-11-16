// Public GET-only deployed asset and auth guard verification. No student session.
import assert from 'node:assert/strict';
const base='https://kksong90-crypto.github.io/allEnglish/';
let visible=false;
for(let attempt=0;attempt<30;attempt++){
 const r=await fetch(base+'?release=20261116&check='+attempt,{signal:AbortSignal.timeout(15000)}),html=await r.text();
 if(r.ok&&html.includes('20261116-admin-public-preview')&&html.includes('function assignedPracticeChooseMode(')){visible=true;break;}
 await new Promise(resolve=>setTimeout(resolve,10000));
}
assert.equal(visible,true,'Published practice release not visible');
const asset=await fetch(base+'station-library.js?v=20261116-admin',{signal:AbortSignal.timeout(15000)});assert.equal(asset.ok,true);const js=await asset.text();assert.ok(js.includes('publicationYear')&&js.includes("SUPPLEMENT: '부교재'"));
const dep='AKfycbxLW0buCbPNwp4RPYZo4rq5tgP8OgPmdOKc0nzuOiA0HtFG8-Qzyq_kcK5FV4fzL372fg';
for(const action of ['getVocaCatalog','getAssignedVocaPracticeQuestions']){
 const r=await fetch('https://script.google.com/macros/s/'+dep+'/exec?'+new URLSearchParams({action,testPlanId:'NO_SESSION_SMOKE'}),{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);assert.equal((await r.json()).success,false);
}
console.log(JSON.stringify({publicStaticReleaseVisible:true,publicCatalogAssetVisible:true,unauthenticatedCatalogAndPracticeRejected:true,authenticatedStudentUAT:false,businessWrites:0}));
