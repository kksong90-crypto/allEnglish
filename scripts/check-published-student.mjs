// Production read-only verification of the exact published student vocabulary UI.
// No authenticated user, no student data, no result writes.
import assert from 'node:assert/strict';

const base='https://kksong90-crypto.github.io/allEnglish/';
const requireMarkers=(text,markers)=>markers.every(marker=>text.includes(marker));
const indexMarkers=[
  'practice-experience.js?v=20261117',
  'coverage: "ALL"',
  'station-library.js?v=20261120-contiguous3',
  'student-shell.css?v=20261120-contiguous3',
  'id="station-library-range-list"',
  'id="station-library-combined-practice"',
  'id="station-library-year"',
  'id="station-library-month"'
];
const jsMarkers=[
  'function startCombinedPractice()',
  'const MAX_SELECTED_RANGES = 150, MAX_SELECTED_WORDS = 5000',
  'function populateMetadataFilters()',
  'const MISSING_FACET =',
  'const categorySearch = categoryKey(book)',
  'const canonicalSchoolLevel =',
  'const canonicalPublisher =',
  'function refreshCategoryAvailability()',
  "SUPPLEMENT:'SUPPORT'",
  "MOCK_EXAM:['gradeNo','publicationYear','publicationMonth']",
  'function renderRangeCheckboxes()',
  "action:'getVocaSection'",
  "studentVisible !== false"
];
const cssMarkers=['#station-library-range-list','#station-library-selection-items','#station-library-combined-practice'];
const textFile=async(url,timeout=15000)=>{
  const response=await fetch(url,{signal:AbortSignal.timeout(timeout),cache:'no-store',redirect:'error'});
  if(!response.ok)throw Error('PUBLISHED_ASSET_HTTP_'+response.status);
  return response.text();
};

let deploymentVerified=false;
for(let attempt=0;attempt<30;attempt++){
  const check=String(attempt);
  try {
    const html=await textFile(base+'?public_library_check='+check);
    if(requireMarkers(html,indexMarkers)){
      const [js,css]=await Promise.all([
        textFile(base+'station-library.js?v=20261120-contiguous3&public_library_check='+check),
        textFile(base+'student-shell.css?v=20261120-contiguous3&public_library_check='+check)
      ]);
      deploymentVerified=requireMarkers(js,jsMarkers)&&requireMarkers(css,cssMarkers);
      if(deploymentVerified)break;
    }
  } catch {
    // Pages may still be propagating. Retry boundedly without using credentials.
  }
  if(attempt<29)await new Promise(resolve=>setTimeout(resolve,10000));
}
assert.equal(deploymentVerified,true,'Latest public multi-selection HTML, JS and CSS must all be visible together');

const [practiceJs,practiceCss]=await Promise.all([
  textFile(base+'practice-experience.js?v=20261117'),
  textFile(base+'practice-experience.css?v=20261117')
]);
assert.ok(practiceJs.includes('shuffleAssignedPractice'),'Existing practice module missing');
assert.ok(practiceCss.includes('.practice-experience'),'Existing practice CSS missing');

// Negative permission checks are unauthed GET only, never a write.
const dep='AKfycbxLW0buCbPNwp4RPYZo4rq5tgP8OgPmdOKc0nzuOiA0HtFG8-Qzyq_kcK5FV4fzL372fg';
for(const action of ['getVocaCatalog','getAssignedVocaPracticeQuestions']){
 const response=await fetch('https://script.google.com/macros/s/'+dep+'/exec?'+new URLSearchParams({
   action,testPlanId:'NO_SESSION_SMOKE',coverage:'ALL',offset:'0',limit:'200'
 }),{signal:AbortSignal.timeout(30000),redirect:'follow'});
 assert.equal(response.status,200);
 assert.equal((await response.json()).success,false,'Unauthenticated '+action+' must fail');
}
console.log(JSON.stringify({
  publishedMultiRangeHtmlJsCssVisible:true,existingPracticeAssetsVisible:true,
  unauthenticatedCatalogAndPracticeRejected:true,
  authenticatedStudentUAT:false,officialStudentWrites:0
}));
