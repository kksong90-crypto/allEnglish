// Browser UAT with synthetic identity/API only. --published-static fetches real deployed HTML/JS/CSS.
// All Google Apps Script requests are mocked, so no authenticated session or student data is used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publishedStatic=process.argv.includes('--published-static');
const origin=publishedStatic?'https://kksong90-crypto.github.io':'https://public-multi.invalid';
const engine=process.argv[2]||'chromium';
assert.ok(['chromium','webkit'].includes(engine));
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
const catalog=[
 {revisionId:'MOCK',displayName:'고2 2026년 9월 모의고사',categoryCode:'MOCK_EXAM',schoolLevel:'고등학교',gradeNo:2,publicationYear:2026,publicationMonth:'09',
  sections:[{sectionId:'Q18',label:'18번',wordCount:2},{sectionId:'Q20',label:'20번',wordCount:2},{sectionId:'Q21',label:'21번',wordCount:2}]},
 {revisionId:'BOOK',displayName:'해커스보카 수능필수',categoryCode:'VOCAB_BOOK',publisher:'해커스',
  sections:[{sectionId:'DAY1',label:'Day 1',wordCount:2},{sectionId:'DAY2',label:'Day 2',wordCount:2}]},
 {revisionId:'PRIVATE',displayName:'비공개 자료',studentVisible:false,categoryCode:'CUSTOM',
  sections:[{sectionId:'HIDDEN',label:'1과',wordCount:1}]}
];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR',isMobile:true,hasTouch:true}),reads=[],writes=[];
 await context.addInitScript(()=>localStorage.setItem('allbarun-user',JSON.stringify({token:'SYNTHETIC',id:'SYNTHETIC',role:'student'})));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin){
   if(publishedStatic)return route.continue(); // Actual hosted assets only. All APIs below remain synthetic.
   try{const body=await readFile(path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1)));
    return route.fulfill({status:200,body,contentType:url.pathname.endsWith('.js')?'application/javascript':url.pathname.endsWith('.css')?'text/css':'text/html; charset=utf-8'});}
   catch{return route.fulfill({status:404,body:''});}
  }
  if(!['script.google.com','script.googleusercontent.com'].includes(url.hostname))return route.abort();
  const p=Object.fromEntries(request.method()==='POST'?new URLSearchParams(request.postData()||''):url.searchParams);
  // getVocabData is a legacy READ; only these actions can change official outcomes.
  if(['saveVocabResult','submitAssignedPractice','addPoint'].includes(p.action))writes.push(p.action);
  if(['getVocaCatalog','getVocaSection'].includes(p.action))reads.push(p);
  const ids=p.action==='getVocaSection'?JSON.parse(p.sectionIdsJson||'[]'):[];
  const response=p.action==='getVocaCatalog'?{success:true,books:catalog}:
   p.action==='getVocaSection'?{success:true,revisionId:p.revisionId,words:ids.flatMap(id=>Array.from({length:2},(_,i)=>({
    revisionId:p.revisionId,sectionId:id,vocabWordId:id+'-'+i,word:id+'-'+i,meaning:'합성 뜻',allowedAnswers:[]})))}:
   p.action==='getMyLearningSchedule'?{success:true,days:[],visibleDays:[]}:
   p.action==='getMyVocabPreparation'?{success:false,code:'UNSUPPORTED_ACTION'}:
   p.action==='getFavoriteState'?{success:true,folders:{기본:[]}}:
   p.action==='getStudentContent'?{success:true,home:{},notices:[],homeNotices:[]}:{success:true};
  return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(response)});
 });
 const page=await context.newPage();
 await page.goto(publishedStatic?origin+'/allEnglish/?published-static-uat=20261119':origin,{waitUntil:'domcontentloaded'});
 if(publishedStatic) {
  assert.equal(await page.locator('script[src*="station-library.js?v=20261120-taxonomy4"]').count(),1,'Published app must load the current library script');
  assert.equal(await page.locator('#station-library-combined-practice').count(),1,'Published app must contain the combined-practice control');
 }
 await page.waitForFunction(()=>!!currentUser?.token);
 await page.evaluate(()=>showTab('vocab'));
 await page.locator('#station-library').evaluate(el=>el.open=true);
 await page.locator('#station-library-book option[value="MOCK"]').waitFor({state:'attached'});
 assert.equal(await page.locator('#station-library-category optgroup[label="주요 분류"] option').count(),4);
 assert.equal(await page.locator('#station-library-category option[value="CUSTOM"]').isDisabled(),true,
   'No publicly visible academy material means the choice must be unavailable');
 assert.equal(await page.locator('#station-library-category option[value="SUPPORT"]').isDisabled(),true,
   'Missing supplementary content cannot be a selectable empty category');
 await page.locator('#station-library-category').selectOption('MOCK_EXAM');
 assert.equal(await page.locator('#station-library-grade-label').innerText(),'학년·시험');
 assert.equal(await page.locator('#station-library-school-level-field').isHidden(),true,'School-level is redundant for high-school mock exams');
 assert.deepEqual(await page.locator('#station-library-grade option').evaluateAll(os=>os.map(o=>[o.value,o.textContent])),[['','전체'],['2','고2']]);

 await page.locator('#station-library-year').selectOption('2026');
 assert.deepEqual(await page.locator('#station-library-month option').evaluateAll(os=>os.map(o=>o.value)),['','9']);
 await page.locator('#station-library-book').selectOption('MOCK');
 await page.locator('#station-library-range-list input[type=checkbox]').nth(0).check();
 await page.locator('#station-library-range-list input[type=checkbox]').nth(1).check();
 assert.equal(reads.filter(x=>x.action==='getVocaSection').length,0,'checkbox selection must be local');
 await page.locator('#station-library-category').selectOption('VOCAB');
 await page.locator('#station-library-book').selectOption('BOOK');
 await page.locator('#station-library-range-list input[type=checkbox]').nth(0).check();
 assert.match(await page.locator('#station-library-selection-summary').innerText(),/3개/);
 assert.equal(await page.locator('#station-library-selection-items .vocab-library-chip').count(),3);
 await page.locator('#station-library-combined-practice').click();
 await page.waitForFunction(()=>!!window.assignedPracticeState?.personal || (typeof assignedPracticeState!=='undefined'&&assignedPracticeState?.planId==='PUBLIC_PREVIEW:PUBLIC_COMBINED'));
 const practice=await page.evaluate(()=>({planId:assignedPracticeState?.planId,personal:assignedPracticeState?.personal,sourceRows:assignedPracticeState?.sourceRows?.length}));
 assert.equal(practice.planId,'PUBLIC_PREVIEW:PUBLIC_COMBINED');
 assert.equal(practice.personal,true);assert.equal(practice.sourceRows,6);
 assert.equal(reads.filter(x=>x.action==='getVocaCatalog').length,1);
 assert.deepEqual(reads.filter(x=>x.action==='getVocaSection').map(x=>x.revisionId),['MOCK','BOOK']);
 assert.equal(writes.length,0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 console.log(JSON.stringify({engine,passed:true,publishedStaticAssets:publishedStatic,syntheticIdentityAndAPI:true,checkedRanges:3,cards:6,reads:reads.length,officialWrites:0,realStudentData:0}));
 await context.close();
}finally{await browser.close();}
