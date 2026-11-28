// Actual app + IndexedDB, synthetic authentication and endpoint replies only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {existsSync} from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),origin='https://prepared-practice.invalid';
const engine=process.argv[2]||'chromium';if(!['chromium','webkit'].includes(engine))throw Error('BROWSER_REQUIRED');
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
const bundleMode=process.argv.includes('--bundle'),fixturePath=process.argv.slice(3).find(v=>v!=='--bundle');
const fixture=fixturePath?JSON.parse(await readFile(fixturePath,'utf8')):null;
if(fixture&&fixture.syntheticOnly!==true)throw Error('SYNTHETIC_FIXTURE_REQUIRED');
const words=fixture?.words?.words||Array.from({length:205},(_,i)=>({bookId:'SYNTH_BOOK',vocabWordId:'SYNTH_'+i,word:'word'+i,meaning:'합성 뜻 '+i,acceptedAnswers:['word'+i]}));
const contentHash=createHash('sha256').update(JSON.stringify(words.map(w=>[w.bookId,w.vocabWordId,w.word,w.meaning,w.acceptedAnswers]))).digest('hex');
const manifest=fixture?.manifest||{success:true,status:'READY',generation:'generation1',assignmentKey:'assignment1',scopeFingerprint:'scope1',setId:'set1',contentHash,wordCount:205,testPlanId:'SYNTH_PLAN',slotKey:'first',personalScopeFingerprint:'synthetic-fingerprint'};
assert.equal(manifest.contentHash,contentHash);
const expectedColdWords=bundleMode?0:1;
let status='READY',holdManifest=false,supportedHint;const manifestWaiters=[];const calls=[],errors=[],context=await browser.newContext();
await context.addInitScript(()=>localStorage.setItem('allbarun-user',JSON.stringify({id:'synthetic-A',role:'student',token:'synthetic-token'})));
await context.route('**/*',async route=>{const r=route.request(),url=new URL(r.url());if(url.origin===origin){const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))return route.abort();try{return route.fulfill({status:200,body:await readFile(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}}if(url.hostname!=='script.google.com')return route.abort();const p=Object.fromEntries(r.method()==='POST'?new URLSearchParams(r.postData()||''):url.searchParams);calls.push(p);if(p.action==='getMyPreparedVocabManifest'&&holdManifest)await new Promise(resolve=>manifestWaiters.push(resolve));let reply;if(p.action==='getMyPreparedVocabManifest'){const bundled=bundleMode&&p.preferBundle==='Y',included=bundled&&p.knownContentHash!==contentHash;reply={...manifest,status,...(bundled&&status==='READY'?{selectionBundle:true,wordsIncluded:included,...(included?{words}:{})}:{})};}else if(p.action==='getMyPreparedVocabWords')reply={...(fixture?.words||manifest),words};else if(p.action==='getMyVocabPreparation')reply=typeof supportedHint==='boolean'?{success:true,preparationOnly:true,preparedPracticeSupported:supportedHint,days:[],visibleDays:[]}:{success:false,code:'UNSUPPORTED_ACTION'};else if(p.action==='getAssignedVocaPracticeQuestions'){const offset=Number(p.offset),slice=words.slice(offset,offset+200);reply={success:true,testPlanId:p.testPlanId,mode:'MEANING_TO_WORD',coverage:'ALL',scopeVersion:manifest.scopeFingerprint,totalCount:words.length,offset,count:slice.length,nextOffset:offset+slice.length<words.length?offset+slice.length:null,questions:slice.map((w,i)=>({questionNo:offset+i+1,prompt:w.meaning,acceptedAnswers:w.acceptedAnswers,bookId:w.bookId,vocabWordId:w.vocabWordId}))};}else if(p.action==='getMyLearningSchedule')reply={success:true,days:[],visibleDays:[]};else if(p.action==='getStudentContent')reply={success:true,notices:[],homeNotices:[]};else reply={success:true,rows:[],books:[],folders:{기본:[]}};return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},body:JSON.stringify(reply)});});
let page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));const count=action=>calls.filter(p=>p.action===action).length;
async function enter(){await page.evaluate(selection=>startAssignedVocaPractice(selection.testPlanId,null,selection.slotKey,selection.personalScopeFingerprint),manifest);}
async function verifyV1Migration() {
 const isolated=await browser.newContext(),migrationPage=await isolated.newPage();
 try {
  await migrationPage.route(origin+'/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><p>synthetic cache migration</p>'}));
  await migrationPage.goto(origin);
  await migrationPage.evaluate(({identity,words})=>new Promise((resolve,reject)=>{
   const open=indexedDB.open('allbarun-prepared-practice-v1',1);
   open.onupgradeneeded=()=>{for(const name of ['contents','assignments'])open.result.createObjectStore(name,{keyPath:'key'});};
   open.onerror=reject;open.onsuccess=()=>{const db=open.result,tx=db.transaction(['contents','assignments'],'readwrite'),lastUsed=Date.now();
    tx.objectStore('contents').put({key:identity.contentHash,words,wordCount:words.length,lastUsed});
    tx.objectStore('assignments').put({key:JSON.stringify(['synthetic-migration',identity.assignmentKey]),owner:'synthetic-migration',...identity,lastUsed});
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject;
   };
  }),{identity:manifest,words});
  await migrationPage.addScriptTag({content:await readFile(path.join(root,'prepared-practice-cache.js'),'utf8')});
  return await migrationPage.evaluate(async({identity,words})=>{
   let wordRequests=0,manifestRequests=0;
   const client=PreparedPracticeCache.createClient({request:async p=>{if(p.action==='getMyPreparedVocabManifest'){manifestRequests++;return identity;}wordRequests++;return{...identity,words};}});
   const selection={testPlanId:identity.testPlanId,slotKey:identity.slotKey,personalScopeFingerprint:identity.personalScopeFingerprint},session={owner:'synthetic-migration',sessionKey:'synthetic-migration-session',isCurrent:()=>true};
   const loaded=await client.load(selection,session);
   const schema=await new Promise((resolve,reject)=>{const open=indexedDB.open('allbarun-prepared-practice-v1');open.onerror=reject;open.onsuccess=()=>{const db=open.result,tx=db.transaction(['contents','assignments'],'readonly');const result={version:db.version,indexes:['contents','assignments'].every(name=>tx.objectStore(name).indexNames.contains('gc'))};tx.oncomplete=()=>{db.close();resolve(result);};};});
   const migratedWordRequests=wordRequests;
   // A future/unknown cache version must close existing connections and fall
   // back to freshly authorized words, without blocking or reusing permission.
   await new Promise((resolve,reject)=>{const open=indexedDB.open('allbarun-prepared-practice-v1',3);open.onerror=open.onblocked=reject;open.onsuccess=()=>{open.result.close();resolve();};});
   const fallback=await client.load(selection,session);
   return{...schema,words:loaded.words.length,migratedWordRequests,manifestRequests,cacheFailureWordsRequests:wordRequests,fallbackWords:fallback.words.length};
  },{identity:manifest,words});
 }finally{await isolated.close();}
}
try{
 await page.goto(origin);await page.waitForFunction(()=>!!currentUser?.token);holdManifest=true;
 await Promise.all([page.waitForRequest(r=>new URLSearchParams(r.postData()||'').get('action')==='getMyPreparedVocabManifest'),page.evaluate(selection=>{window.__preparedTriple=Array.from({length:3},()=>startAssignedVocaPractice(selection.testPlanId,null,selection.slotKey,selection.personalScopeFingerprint));},manifest)]);
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(count('getMyPreparedVocabManifest'),1);holdManifest=false;manifestWaiters.splice(0).forEach(resolve=>resolve());await page.evaluate(()=>Promise.all(window.__preparedTriple));assert.equal(await page.evaluate(()=>assignedPracticeState.sourceRows.length),205);assert.equal(await page.evaluate(()=>assignedPracticeState.planDate),manifest.planDate||'');assert.equal(count('getMyPreparedVocabWords'),expectedColdWords);
 await page.evaluate(()=>{assignedPracticeChooseMode('card');assignedPracticeReveal();assignedPracticeHide();});assert.equal(count('getMyPreparedVocabManifest'),1);
 await page.reload();await page.waitForFunction(()=>!!currentUser?.token);
 await page.evaluate(()=>{window.__preparedBodyReads={get:0,getAll:0};for(const name of ['get','getAll']){const original=IDBObjectStore.prototype[name];IDBObjectStore.prototype[name]=function(...args){if(this.name==='contents')window.__preparedBodyReads[name]++;return original.apply(this,args);};}});
 await enter();const warmReads=await page.evaluate(()=>window.__preparedBodyReads);assert.deepEqual(warmReads,{get:1,getAll:0});assert.equal(calls.filter(p=>p.action==='getMyPreparedVocabManifest').at(-1).knownContentHash,contentHash);assert.equal(count('getMyPreparedVocabManifest'),2);assert.equal(count('getMyPreparedVocabWords'),expectedColdWords);
 await page.evaluate(hash=>new Promise((resolve,reject)=>{const open=indexedDB.open('allbarun-prepared-practice-v1');open.onerror=reject;open.onsuccess=()=>{const db=open.result,tx=db.transaction('contents','readwrite'),store=tx.objectStore('contents'),get=store.get(hash);get.onsuccess=()=>{get.result.words[0].meaning='synthetic tamper';store.put(get.result);};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject;};}),contentHash);await enter();assert.equal(count('getMyPreparedVocabWords'),expectedColdWords+1);
 status='CANCELLED';await enter();assert.equal(await page.evaluate(()=>assignedPracticeState),null);assert.equal(count('getAssignedVocaPracticeQuestions'),0);assert.equal(count('getMyPreparedVocabWords'),expectedColdWords+1);
 status='READY';await page.evaluate(()=>{resetUserScopedState();currentUser={id:'synthetic-B',role:'student',token:'synthetic-B-token'};});await enter();assert.equal(count('getMyPreparedVocabWords'),expectedColdWords+1);assert.equal(calls.filter(p=>p.action==='getMyPreparedVocabManifest').at(-1).knownContentHash,'');
 const owners=await page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('allbarun-prepared-practice-v1');open.onerror=reject;open.onsuccess=()=>{const db=open.result,tx=db.transaction('assignments','readonly'),get=tx.objectStore('assignments').getAll();tx.oncomplete=()=>{db.close();resolve([...new Set(get.result.map(r=>r.owner))].length);};};}));assert.equal(owners,2);
 const stats=await page.evaluate(async()=>{const before=window.__preparedBodyReads.getAll,store=PreparedPracticeCache.indexedStore();for(let i=0;i<55;i++)await store.write('synthetic-GC',{assignmentKey:'gc'+i,contentHash:'gc'+i},Array.from({length:2500},()=>({word:'synthetic'})));for(const owner of ['synthetic-A','synthetic-B'])await store.write(owner,{assignmentKey:'shared-active',contentHash:'gc-active'},Array.from({length:2500},()=>({word:'synthetic'})));const gcBodyScans=window.__preparedBodyReads.getAll-before;return new Promise((resolve,reject)=>{const open=indexedDB.open('allbarun-prepared-practice-v1');open.onerror=reject;open.onsuccess=()=>{const db=open.result,tx=db.transaction(['contents','assignments'],'readonly'),c=tx.objectStore('contents').getAll(),a=tx.objectStore('assignments').getAll();tx.oncomplete=()=>{db.close();resolve({sets:c.result.length,words:c.result.reduce((n,r)=>n+r.wordCount,0),assignments:a.result.length,gcBodyScans,activeOwners:a.result.filter(r=>r.assignmentKey==='shared-active').map(r=>r.owner).sort()});};};});});assert.ok(stats.sets<=12&&stats.words<=25000&&stats.assignments<=50);assert.equal(stats.gcBodyScans,0);assert.deepEqual(stats.activeOwners,['synthetic-A','synthetic-B']);
 const expiry=await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const open=indexedDB.open('allbarun-prepared-practice-v1');open.onerror=reject;open.onsuccess=()=>{const db=open.result,tx=db.transaction(['contents','assignments'],'readwrite');tx.objectStore('contents').clear();tx.objectStore('assignments').clear();tx.oncomplete=()=>{db.close();resolve();};};});const old=PreparedPracticeCache.indexedStore(indexedDB,()=>Date.now()-8*86400000);await old.write('synthetic-old',{assignmentKey:'old',contentHash:'old'},[{word:'synthetic'}]);await PreparedPracticeCache.indexedStore().write('synthetic-new',{assignmentKey:'new',contentHash:'new'},[{word:'synthetic'}]);return new Promise(resolve=>{const open=indexedDB.open('allbarun-prepared-practice-v1');open.onsuccess=()=>{const db=open.result,tx=db.transaction(['contents','assignments'],'readonly'),c=tx.objectStore('contents').getAll(),a=tx.objectStore('assignments').getAll();tx.oncomplete=()=>{db.close();resolve({sets:c.result.map(r=>r.key),assignments:a.result.map(r=>r.assignmentKey)});};};});});assert.deepEqual(expiry,{sets:['new'],assignments:['new']});
 supportedHint=false;const beforeNonpilot=count('getMyPreparedVocabManifest');await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(origin);await page.waitForFunction(()=>preparedPracticeCapability?.supported===false);await enter();assert.equal(count('getMyPreparedVocabManifest'),beforeNonpilot);assert.equal(count('getAssignedVocaPracticeQuestions'),2);assert.equal(await page.evaluate(()=>assignedPracticeState.sourceRows.length),205);
 const migration=await verifyV1Migration();assert.deepEqual(migration,{version:2,indexes:true,words:205,migratedWordRequests:0,manifestRequests:2,cacheFailureWordsRequests:1,fallbackWords:205});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,bundleMode,actualDomainFixture:!!fixture,passed:true,cases:8,migration,nonpilotManifestRequests:0,simultaneousClicks:3,initialManifestRequests:1,initialWordsRequests:expectedColdWords,persistentReload:true,warmSelectedBodyReads:warmReads.get,gcWholeBodyScans:warmReads.getAll,cacheTamperRecovered:true,cancelledFailClosed:true,ownerSwitchFreshManifest:true,boundedGC:stats,expiredRowsRemoved:true,ownerPointers:owners,realNetworkCalls:0,officialWrites:0}));
}finally{await context.close();await browser.close();}
