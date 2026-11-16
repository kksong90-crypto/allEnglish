// Synthetic transport and corpus, real Chromium/paint. Never uses a real account or production API.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin='https://vocab-performance.invalid', artifact=path.join(root,'browser-tests/artifacts/vocab-performance.json');
const sectionSizes=n=>n===205?[105,100]:Array.from({length:Math.ceil(n/200)},(_,i)=>Math.min(200,n-i*200));
const books=Array.from({length:217},(_,i)=>{
 const count=i===1?205:i===2?5000:200, revisionId='PERF_'+i;
 return {revisionId,displayName:i===0?'교과서 200':i===1?'고2 전국연합 205':i===2?'교과서 큰 과 5000':`어휘 ${217-i}권`,
  categoryCode:i===1?'MOCK_EXAM':i===2||i===0?'TEXTBOOK':'WORD_BOOK',publicationMonth:i===1?10:null,
  sections:sectionSizes(count).map((wordCount,j)=>({sectionId:revisionId+'_S'+j,label:count>200?`3과 Part ${j+1}`:'Day 1',wordCount}))};
});
// Deterministically mix input order, not an already sorted best case.
const catalog=books.map((_,i)=>books[(i*73)%217]);
const bodies=new Map();
function bodyFor(book){
 if(!bodies.has(book.revisionId)){
  let n=0;const words=book.sections.flatMap(section=>Array.from({length:section.wordCount},()=>{
   const i=++n;return {vocabWordId:book.revisionId+'_W'+i,revisionId:book.revisionId,bookId:book.revisionId,
    sectionId:section.sectionId,displayName:book.displayName,sectionLabel:section.label,
    word:'term'+String(i).padStart(4,'0'),meaning:'가상 뜻 '+i,allowedAnswers:['term'+String(i).padStart(4,'0')]};
  }));bodies.set(book.revisionId,words);
 }return bodies.get(book.revisionId);
}
const report={kind:'synthetic-transport-real-chromium',generatedAt:new Date().toISOString(),productionMeasured:false,
 assumptions:{catalogBooks:217,wordCounts:[200,205,5000],maxWordsPerSection:200,samplesPerLocalAction:15,
 transportDelayMs:350,slowTransportDelayMs:2500,localBudgetMs:200,controlledReadBudgetMs:2000,
 clockNote:'performance.now + next paint; cache expiry advances Date.now only; no production cold-start inference'},profiles:[]};
report.sourceHashes={};
for(const file of ['index.html','station-library.js','student-shell.css'])report.sourceHashes[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
try{
 report.browser=browser.version();
 for(const [name,rate,width] of [['desktop',1,1365],['mobile-cpu4x',4,390]]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600,locale:'ko-KR'});
  const page=await context.newPage(), calls=[],errors=[];let delay=350;
  page.on('pageerror',error=>errors.push(String(error)));
  await context.addInitScript(()=>{
   localStorage.setItem('allbarun-user',JSON.stringify({id:'PERF_SYNTHETIC',role:'student',name:'가상 성능 계정',token:'SYNTHETIC_ONLY'}));
   const now=Date.now.bind(Date);window.__cacheOffset=0;Date.now=()=>now()+window.__cacheOffset;
  });
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===origin){
    const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep))return route.abort();
    try{return route.fulfill({status:200,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html',body:await readFile(file)});}catch{return route.fulfill({status:404,body:''});}
   }
   if(!['script.google.com','script.googleusercontent.com'].includes(url.hostname))return route.abort();
   const p=Object.fromEntries(request.method()==='POST'?new URLSearchParams(request.postData()||''):url.searchParams);
   const entry={action:p.action,at:Date.now(),responseBytes:0};calls.push(entry);
   let result;
   if(['getVocaCatalog','getVocaSection','searchVoca'].includes(p.action))await new Promise(resolve=>setTimeout(resolve,delay));
   if(p.action==='getVocaCatalog')result={success:true,books:catalog};
   else if(p.action==='getVocaSection'){
    const book=books.find(b=>b.revisionId===p.revisionId), ids=JSON.parse(p.sectionIdsJson);
    result={success:true,revisionId:p.revisionId,words:bodyFor(book).filter(w=>ids.includes(w.sectionId))};
   }else if(p.action==='searchVoca'){
    const results=books.filter(b=>!p.revisionId||b.revisionId===p.revisionId).flatMap(b=>bodyFor(b).filter(w=>(w.word+' '+w.meaning).includes(p.query)));
    result={success:true,count:Math.min(100,results.length),truncated:results.length>100,words:results.slice(0,100)};
   }else if(p.action==='getVocabData')result={success:false,message:'Full legacy hydration is forbidden in this performance journey'};
   else if(p.action==='getStudentContent')result={success:true,home:{},notices:[],homeNotices:[]};
   else if(p.action==='getFavoriteState')result={success:true,folders:{기본:[]}};
   else if(p.action==='getMyLearningSchedule')result={success:true,days:[],visibleDays:[]};
   else if(p.action==='getMyPointSummary')result={success:true,totalPoints:0};
   else result={success:true,rows:[]};
   const body=JSON.stringify(result);entry.responseBytes=Buffer.byteLength(body);
   return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body});
  });
  if(rate>1){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});}
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!currentUser?.token);
  const profile={name,cpuThrottleRate:rate,viewportWidth:width,metrics:[],violations:[],invariants:{}};report.profiles.push(profile);
  const readCount=()=>calls.filter(p=>['getVocaCatalog','getVocaSection','searchVoca'].includes(p.action)).length;
  async function sample(label,action,done=()=>true,budget=200,repetitions=1,expectedReads=null){
   const samples=[],before=readCount();
   for(let i=0;i<repetitions;i++)samples.push(await page.evaluate(async({action,done})=>{
    const act=(0,eval)('('+action+')'),ready=(0,eval)('('+done+')');
    const start=performance.now();act();
    if(!ready())await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>{observer.disconnect();reject(Error('PERF_READ_TIMEOUT'));},15000);
     const observer=new MutationObserver(()=>{if(ready()){observer.disconnect();clearTimeout(timer);resolve();}});
     observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
     if(ready()){observer.disconnect();clearTimeout(timer);resolve();}
    });
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return performance.now()-start;
   },{action:action.toString(),done:done.toString()}));
   const sorted=[...samples].sort((a,b)=>a-b),maximum=sorted.at(-1),reads=readCount()-before;
   const metric={label,samples:samples.length,medianMs:+sorted[Math.floor(sorted.length/2)].toFixed(1),maxMs:+maximum.toFixed(1),budgetMs:budget,withinBudget:maximum<=budget,readRequests:reads};
   profile.metrics.push(metric);
   if(!metric.withinBudget)profile.violations.push(label);
   if(expectedReads!==null)assert.equal(reads,expectedReads,label+' unexpected remote read');
   console.log(JSON.stringify({profile:name,...metric}));return metric;
  }
  await sample('first_catalog_217',()=>showTab('vocab'),()=>document.querySelectorAll('#station-library-book option').length===218,2000,1,1);
  await sample('title_filter_217',()=>{const q=document.getElementById('station-library-query');q.value=q.value?'':'고2 10월';q.dispatchEvent(new Event('input'));},()=>true,200,15,0);
  await page.evaluate(()=>{const q=document.getElementById('station-library-query');q.value='';q.dispatchEvent(new Event('input'));});
  for(const [revision,count] of [['PERF_0',200],['PERF_1',205],['PERF_2',5000]]){
   await page.evaluate(revision=>{const b=document.getElementById('station-library-book');b.value=revision;b.dispatchEvent(new Event('change'));},revision);
   await sample('first_scope_'+count,()=>{const s=document.getElementById('station-library-scope');s.value='0';s.dispatchEvent(new Event('change'));},()=>!!document.getElementById('station-library-practice-button'),2000,1,count===5000?2:1);
   await sample('cached_scope_'+count,()=>document.getElementById('station-library-scope').dispatchEvent(new Event('change')),()=>!!document.getElementById('station-library-practice-button'),200,3,0);
   await page.evaluate(()=>{document.getElementById('station-library-word-scope').value='section';document.getElementById('station-library-word-query').value='가상';});
   await sample('local_broad_search_'+count,()=>document.getElementById('station-library-word-search').click(),()=>!!document.getElementById('station-library-search-result').querySelector('ol'),200,3,0);
   if(count===5000){
    await sample('next_100_words',()=>{const list=document.querySelector('#station-library-words ol');list.scrollTop=300;document.querySelectorAll('#station-library-words > .button-row button')[1].click();},()=>document.querySelector('#station-library-words ol').scrollTop===0,200,3,0);
    const reach=await page.evaluate(()=>{
      for(const hostId of ['station-library-words','station-library-search-result']){
        const host=document.getElementById(hostId),next=host.querySelectorAll(':scope > .button-row button')[1];
        let guard=0;while(!next.disabled&&guard++<60)next.click();
        const list=host.querySelector('ol');
        if(list.children.length!==100||!list.lastElementChild.textContent.includes('term5000'))return false;
      }return true;
    });assert.equal(reach,true,'last word remains reachable in body and search pages');
   }
   await sample('start_practice_'+count,()=>document.getElementById('station-library-practice-button').click(),()=>!!document.querySelector('#practice-view .practice-modes'),200,1,0);
   await sample('choose_cards_'+count,()=>assignedPracticeChooseMode('card'),()=>!!document.getElementById('practice-reveal-button'),200,3,0);
   await sample('card_reveal_'+count,()=>{assignedPracticeHide();assignedPracticeReveal();},()=>!!document.querySelector('.practice-reveal'),200,15,0);
   await sample('card_hide_'+count,()=>{assignedPracticeReveal();assignedPracticeHide();},()=>!!document.getElementById('practice-reveal-button'),200,15,0);
   await sample('card_advance_'+count,()=>{assignedPracticeReveal();assignedPracticeRate(true);},()=>!!document.getElementById('practice-reveal-button'),200,15,0);
   await sample('choose_recall_'+count,()=>assignedPracticeChooseMode('recall'),()=>!!document.querySelector('.practice-choice'),200,5,0);
   await sample('choose_spelling_'+count,()=>assignedPracticeChooseMode('spell'),()=>!!document.getElementById('practice-spell-input'),200,3,0);
   await sample('spelling_check_next_'+count,()=>{document.getElementById('practice-spell-input').value=assignedPracticeState.rows[assignedPracticeCurrentIndex()][2];assignedPracticeSubmitSpelling();assignedPracticeNext();},()=>!!document.getElementById('practice-spell-input'),200,15,0);
   await sample('return_to_selected_scope_'+count,()=>{assignedPracticeBackToMenu();assignedPracticeReturnToSource();},()=>document.getElementById('vocab').classList.contains('active'),200,1,0);
  }
  await page.evaluate(()=>{document.getElementById('station-library-word-scope').value='all';document.getElementById('station-library-word-query').value='term0001';});
  await sample('first_global_search',()=>document.getElementById('station-library-word-search').click(),()=>!!document.getElementById('station-library-search-result').querySelector('ol'),2000,1,1);
  await sample('cached_global_search',()=>document.getElementById('station-library-word-search').click(),()=>!!document.getElementById('station-library-search-result').querySelector('ol'),200,5,0);
  await page.evaluate(()=>{window.__cacheOffset+=120001;});
  await sample('expired_global_search',()=>document.getElementById('station-library-word-search').click(),()=>!!document.getElementById('station-library-search-result').querySelector('ol'),2000,1,1);
  delay=2500;
  await page.evaluate(()=>{document.getElementById('station-library-word-query').value='term0002';});
  await sample('slow_search_loading_feedback',()=>{document.getElementById('station-library-word-search').click();document.getElementById('station-library-word-query').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));},()=>document.getElementById('station-library-search-result').textContent.includes('검색하는 중'),200,1,1);
  await page.waitForFunction(()=>!!document.getElementById('station-library-search-result').querySelector('ol'));
  profile.invariants={fullLegacyReads:calls.filter(p=>p.action==='getVocabData').length,officialWrites:calls.filter(p=>['saveVocabResult','submitPointTest'].includes(p.action)).length,
   slowSearchRequests:calls.filter(p=>p.action==='searchVoca').length-2,totalReadResponseBytes:calls.filter(p=>['getVocaCatalog','getVocaSection','searchVoca'].includes(p.action)).reduce((n,p)=>n+p.responseBytes,0),uncaughtErrors:errors};
  assert.equal(profile.invariants.slowSearchRequests,1);assert.equal(profile.invariants.fullLegacyReads,0);assert.equal(profile.invariants.officialWrites,0);assert.deepEqual(errors,[]);
  await context.close();
 }
}finally{
 await mkdir(path.dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(report,null,2)+'\n');await browser.close();
}
const failures=report.profiles.flatMap(p=>p.violations.map(metric=>p.name+':'+metric));
console.log(JSON.stringify({artifact,productionMeasured:false,budgetViolations:failures}));
if(failures.length)process.exitCode=1;
