// Full public app and real IndexedDB; all authentication/API replies are synthetic.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),origin='https://direct-prepared.invalid',engine=process.argv[2]||'chromium';
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
const words=Array.from({length:205},(_,i)=>({bookId:'BOOK_FIXTURE',vocabWordId:'W'+i,word:'word'+i,meaning:'합成 뜻'+i,acceptedAnswers:['word'+i]}));
const contentHash=createHash('sha256').update(JSON.stringify(words.map(w=>[w.bookId,w.vocabWordId,w.word,w.meaning,w.acceptedAnswers]))).digest('hex');
const ready={success:true,status:'READY',assignmentKey:'assignment',generation:'1',scopeFingerprint:'scope',setId:'set',contentHash,wordCount:words.length,testPlanId:'PLAN',slotKey:'first',personalScopeFingerprint:'fp',planDate:'2026-11-20'};
const context=await browser.newContext(),calls=[],errors=[],pendingPrep=[];let mode='READY',rejectSelection=false;
await context.addInitScript(()=>localStorage.setItem('allbarun-user',JSON.stringify({id:'synthetic-direct',role:'student',token:'synthetic-token'})));
await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin===origin){const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))return route.abort();try{return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});}catch{return route.fulfill({status:404,body:''});}}if(url.hostname!=='script.google.com')return route.abort();const p=Object.fromEntries(req.method()==='POST'?new URLSearchParams(req.postData()||''):url.searchParams);calls.push(p);let reply={success:true,rows:[],folders:{기본:[]}};
 if(p.action==='getMyVocabPreparation'){await new Promise(r=>pendingPrep.push(r));reply={success:true,preparationOnly:true,preparedPracticeSupported:true,days:[],visibleDays:[]};}
 if(p.action==='getMyNextPreparedVocabPractice'){
  if(p.testPlanId&&rejectSelection)reply={success:false,status:'CANCELLED',code:'PREPARED_SELECTION_CHANGED'};
  else if(p.testPlanId)reply={...ready,slotKey:p.slotKey,personalScopeFingerprint:p.personalScopeFingerprint,sourceKind:'LIVE_ASSIGNED',storageState:'NOT_PERSISTED',selectionBundle:true,wordsIncluded:true,words};
  else if(mode==='SELECTION_REQUIRED')reply={success:true,status:mode,choices:['first','second'].map(slotKey=>({testPlanId:'PLAN',slotKey,personalScopeFingerprint:(slotKey==='first'?'a':'b').repeat(64),displayLabel:slotKey,planDate:'2026-11-20'}))};
  else if(mode==='READY'){const included=!JSON.parse(p.knownContentHashesJson).includes(contentHash);reply={...ready,selectionBundle:true,wordsIncluded:included,...(included?{words}:{})};}
  else reply={success:false,status:mode};
 }
 if(p.action==='getMyPreparedVocabManifest')reply={...ready,slotKey:p.slotKey,personalScopeFingerprint:p.personalScopeFingerprint,selectionBundle:true,wordsIncluded:true,words};
 if(p.action==='getStudentContent')reply={success:true,notices:[],homeNotices:[]};
 return route.fulfill({contentType:'application/json',body:JSON.stringify(reply)});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));const count=a=>calls.filter(p=>p.action===a).length;
try{
 await page.goto(origin);await page.locator('#home-direct-prepared-start').waitFor();assert.equal(await page.locator('#home-learning-content').getAttribute('aria-busy'),'true');await page.locator('#home-direct-prepared-start').click();await page.locator('#practice-view [data-pe=start]').waitFor();assert.equal(count('getMyNextPreparedVocabPractice'),1);assert.equal(count('getMyPreparedVocabManifest'),0);assert.equal(count('getMyPreparedVocabWords'),0);
 assert.equal(await page.evaluate(()=>assignedPracticeState.sourceRows.length),205);const pointer=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('allbarun-prepared-practice-v1');r.onerror=reject;r.onsuccess=()=>{const db=r.result,tx=db.transaction('contents'),get=tx.objectStore('contents').getAll();get.onsuccess=()=>resolve(get.result.map(r=>({hash:r.key,count:r.words.length})));tx.oncomplete=()=>db.close();};}));assert.deepEqual(pointer,[{hash:contentHash,count:205}]);assert.deepEqual(await page.evaluate(()=>PreparedPracticeCache.indexedStore().hints('synthetic-other-owner')),[]);
 await page.locator('#practice-view [data-pe=start]').click();await page.locator('#practice-view [data-pe=reveal]').waitFor();const before=calls.filter(p=>/PreparedVocab|NextPrepared|AssignedVoca/.test(p.action)).length;await page.locator('#practice-view [data-pe=reveal]').click();await page.locator('#practice-view [data-pe=reveal]').click();await page.locator('#practice-view [data-pe=overview]').click();assert.equal(calls.filter(p=>/PreparedVocab|NextPrepared|AssignedVoca/.test(p.action)).length,before);
 await page.evaluate(()=>startNextPreparedPractice());assert.equal(count('getMyNextPreparedVocabPractice'),2);assert.equal(count('getMyPreparedVocabWords'),0);assert.equal(JSON.parse(calls.filter(p=>p.action==='getMyNextPreparedVocabPractice').at(-1).knownContentHashesJson)[0],contentHash);
 mode='SELECTION_REQUIRED';await page.evaluate(()=>startNextPreparedPractice());await page.locator('[data-next-choice="1"]').waitFor();assert.equal(count('getMyPreparedVocabManifest'),0);assert.equal(await page.evaluate(()=>assignedPracticeState),null);await page.locator('[data-next-choice="1"]').click();await page.locator('#practice-view [data-pe=start]').waitFor();assert.equal(count('getMyPreparedVocabManifest'),0);assert.equal(await page.evaluate(()=>assignedPracticeState.slotKey),'second');
 await page.evaluate(()=>startNextPreparedPractice());await page.locator('[data-next-choice="1"]').waitFor();rejectSelection=true;await page.locator('[data-next-choice="1"]').click();await page.locator('#practice-load-error-heading').waitFor();assert.equal(await page.evaluate(()=>assignedPracticeState),null);assert.equal(count('getMyPreparedVocabManifest'),0);rejectSelection=false;
 mode='CANCELLED';await page.evaluate(()=>startNextPreparedPractice());await page.locator('#practice-load-error-heading').waitFor();assert.equal(await page.evaluate(()=>assignedPracticeState),null);assert.equal(count('getAssignedVocaPracticeQuestions'),0);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({engine,passed:true,cases:6,coldNextRequests:1,coldManifestRequests:0,coldWordsRequests:0,fullWordCount:205,warmHintsOwnerBound:true,multiTimeExplicit:true,changedNextDateDenied:true,cancelledFailClosed:true,backMenuExtraNetwork:0,realNetworkCalls:0,officialWrites:0}));
}finally{for(const done of pendingPrep)done();await context.close();await browser.close();}
