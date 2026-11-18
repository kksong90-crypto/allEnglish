// Actual app, synthetic roles/API only. Does not establish authenticated production access.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),origin='https://home-visibility.invalid';
const engine=process.argv[2]||'chromium';if(!['chromium','webkit'].includes(engine))throw Error('Use chromium or webkit');
const out=path.join(root,'browser-tests/artifacts/home-vocab-first',engine);await mkdir(out,{recursive:true});
const header=['단어장','Day','영어','뜻','순서','book_id','허용답'];
const sample=[['evaluate','평가하다'],['maintain','유지하다'],['inevitable','불가피한'],['scarce','부족한'],['justify','정당화하다']];
const regular=sample.map(([word,meaning],i)=>['가상 정규 단어장',1,word,meaning,i+1,'FAKE_BOOK',word]);
const point=['🎯 이번주 포인트 단어','가상 이번 주','pointword','가상 포인트 뜻',1,'FAKE_POINT','pointword'];
const books=[['REV_TEXT','TEXTBOOK','가상 교과서','L3'],['REV_MOCK','MOCK_EXAM','가상 모의고사','Q18'],['REV_WORD','WORD_BOOK','가상 시중 단어장','D1']].map(([revisionId,categoryCode,displayName,sectionId])=>({revisionId,categoryCode,displayName,sections:[{sectionId,label:sectionId==='L3'?'3과':sectionId==='D1'?'Day 1':'18번',wordCount:sample.length}]}));
const publicWords=book=>sample.map(([word,meaning],i)=>({word,meaning,vocabWordId:book.revisionId+'_W'+i,revisionId:book.revisionId,bookId:'FAKE_PUBLIC',sectionId:book.sections[0].sectionId,displayName:book.displayName,sectionLabel:book.sections[0].label,allowedAnswers:[word]}));
const report={engine,syntheticRoles:true,authenticatedProductionUAT:false,officialWrites:0,cases:[],findings:[]};
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
async function setup(role,legacy='normal',assigned='normal',options={}){
 const config={role,legacy,assigned,...options},calls=[],errors=[];
 const context=await browser.newContext({viewport:options.viewport||{width:390,height:844},colorScheme:options.dark?'dark':'light',isMobile:true,hasTouch:true,locale:'ko-KR'});
 await context.addInitScript(({role,options})=>{if(options.saved!==false)localStorage.setItem('allbarun-user',JSON.stringify({id:'SYNTHETIC_'+role,name:'합성 계정',role,token:'SYNTHETIC_ONLY'}));if(options.savedTab){sessionStorage.setItem('allbarun-current-tab',options.savedTab);sessionStorage.setItem('allbarun-tab-history',JSON.stringify(['home']));}}, {role,options});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin){const target=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!target.startsWith(root+path.sep))return route.abort();try{return route.fulfill({status:200,body:await readFile(target),contentType:target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':target.endsWith('.png')?'image/png':'text/html; charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}}
  if(!['script.google.com','script.googleusercontent.com'].includes(url.hostname))return route.abort();
  const p=Object.fromEntries(request.method()==='POST'?new URLSearchParams(request.postData()||''):url.searchParams);calls.push(p);
  if(config.legacy==='network'&&p.action==='getVocabData')return route.abort('failed');
  if(p.action==='getMyVocabPreparation'&&config.fastHold)await new Promise(resolve=>(config.fastWaiters||=[]).push(resolve));
  if(p.action==='getMyLearningSchedule'&&config.fullDelay)await new Promise(resolve=>setTimeout(resolve,config.fullDelay));
  if(p.action==='getMyLearningSchedule'&&config.schedule==='slow')await new Promise(resolve=>(config.scheduleWaiters||=[]).push(resolve));
  let reply;
  if(p.action==='getVocabData')reply=config.legacy==='expired'?{success:false,message:'로그인 시간이 만료되었습니다.'}:config.legacy==='empty'?{success:true,values:[]}:config.legacy==='header'?{success:true,values:[header]}:config.legacy==='nameless'?{success:true,values:[header,['',1,'evaluate','평가하다',1]]}:config.legacy==='apierror'?{success:false,message:'CoreDB VocabWords private implementation error'}:{success:true,values:[header,...regular,...(role==='student'?[point]:[])]};
  else if(p.action==='getVocaCatalog')reply={success:true,books:[...books,{revisionId:'HIDDEN',displayName:'숨김 교재',studentVisible:false,sections:[]},{revisionId:'INTERNAL',displayName:'내부 범위',usageScope:'SCHOOL_EXAM',sections:[]}]};
  else if(p.action==='getVocaSection')reply={success:true,revisionId:p.revisionId,words:publicWords(books.find(b=>b.revisionId===p.revisionId))};
  else if(p.action==='searchVoca'){const words=books.filter(b=>!p.revisionId||b.revisionId===p.revisionId).flatMap(publicWords).filter(w=>(w.word+' '+w.meaning).includes(p.query));reply={success:true,count:words.length,truncated:false,words};}
  else if(p.action==='getAssignedVocaPracticeQuestions'){
   const count=config.assigned==='legacy200'?200:5;
   const questions=Array.from({length:count},(_,i)=>({questionNo:i+1,prompt:sample[i]?.[1]||'가상 뜻 '+i,acceptedAnswers:[sample[i]?.[0]||'word'+i],sourceLabel:'Day 1',bookId:'FAKE_BOOK',vocabWordId:'FAKE_ASSIGNED_'+i}));
   reply=config.assigned==='backendError'?{success:false,message:'전체 시험범위 응답을 확인할 수 없습니다. 처음부터 다시 시작하세요.'}:config.assigned==='legacy200'?{success:true,questions,planDate:'가상 배정'}:{success:true,testPlanId:'FAKE_PLAN',mode:'MEANING_TO_WORD',coverage:'ALL',scopeVersion:'FAKE_SCOPE_V1',offset:0,count:questions.length,totalCount:questions.length,nextOffset:null,planDate:'가상 배정',questions};
   if(config.assigned==='missingCoverage')delete reply.coverage;
  }
  else if(p.action==='login')reply={success:true,id:'SYNTHETIC_'+config.role,name:'합성 계정',role:config.role,token:'SYNTHETIC_'+config.role};
  else if(p.action==='logout')reply={success:true};
  else if(p.action==='getMyLearningSchedule'&&config.schedule==='error')reply={success:false,message:'SYNTHETIC_INTERNAL_SCHEDULE_FAILURE'};
  else if(p.action==='getMyLearningSchedule'&&config.schedule==='empty')reply={success:true,days:[],visibleDays:[]};
  else if(p.action==='getMyLearningSchedule'){const date=p.fromDate||new Date().toISOString().slice(0,10),day={date,displayDate:date,className:'가상 반',hasPlan:true,scheduled:true,vocab:[{testPlanId:'FAKE_PLAN',vocaScopeState:'CONNECTED',sourceRanges:[{bookId:'FAKE_BOOK',sectionId:'FAKE_SCOPE'}],displayText:'가상 정규 단어장 Day 1',bookName:'가상 정규 단어장',regularText:'Day 1'}],listening:null,quiz:{scope:''},homework:{text:'',public:true}};reply={success:true,range:p.range||'upcoming',days:[day],visibleDays:[day],nextPlan:day};}
  else if(p.action==='getFavoriteState')reply={success:true,folders:{기본:['가상 정규 단어장|1|evaluate']}};
  else if(p.action==='getStudentStats')reply={success:true,testCount:0,wrongCount:0};
  else if(p.action==='getStudentContent')reply={success:true,home:{heroTitle:'합성 계정'},notices:[],homeNotices:[]};
  else if(p.action==='getMyPointSummary')reply={success:true,totalPoints:0,canTake:false};
  else if(p.action==='getRetestList')reply={success:true,rows:[]};
  else reply={success:false,message:'SYNTHETIC_ACTION_NOT_SUPPORTED'};
  if(p.action==='getMyVocabPreparation'){
   if(config.fast==='unsupported')reply={success:false,message:'Unknown action: getMyVocabPreparation'};
   else if(config.fast==='denied')reply={success:false,code:'FORBIDDEN',message:'PRIVATE_AUTH'};
   else if(config.fast==='network')return route.abort('failed');
   else{const date=config.fastDateOffset?new Date(Date.parse(p.fromDate+'T00:00:00Z')+86400000*config.fastDateOffset).toISOString().slice(0,10):p.fromDate,day={date,displayDate:date,className:'가상 반',hasPlan:true,vocab:['FIRST','SECOND'].map((slotKey,i)=>({testPlanId:'FAKE_PLAN',slotKey,lessonTime:i?'17:00–19:00':'14:00–16:00',personalScopeFingerprint:(i?'b':'a').repeat(64),vocaScopeState:'CONNECTED',sourceRanges:[{bookId:'FAKE_BOOK',sectionId:'SLOT_'+i}],bookName:'FAST_SCOPE',regularText:'Day '+(i+7),displayText:'FAST_SCOPE Day '+(i+7)}))};reply={success:true,version:1,preparationOnly:true,range:p.range||'upcoming',days:[day],visibleDays:[day],nextPlan:day,nextClassPlan:null};}
  }
  await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(reply)});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(origin+(options.hash?'#'+options.hash:options.savedTab?'#'+options.savedTab:''),{waitUntil:'domcontentloaded'});if(options.saved!==false)await page.waitForFunction(()=>!!currentUser?.token);
 const showVocab=async()=>{await page.evaluate(()=>showTab('vocab'));await page.locator('#station-library-book option[value="REV_TEXT"]').waitFor({state:'attached'});};
 const legacyOpen=async()=>{await showVocab();await page.locator('#legacy-vocab-library>summary').click();};
 return {context,page,config,calls,errors,showVocab,legacyOpen};
}
async function run(name,role,config,fn){const s=await setup(role,...config);try{await fn(s);assert.deepEqual(s.errors,[]);assert.equal(s.calls.some(p=>['saveVocabResult','submitPointTest','saveFavoriteState','saveWrongNote'].includes(p.action)),false);report.cases.push({name,role,passed:true});console.log('PASS '+name+' '+role);}catch(error){process.exitCode=1;const text=String(error);report.cases.push({name,role,passed:false,error:text});console.log('FAIL '+name+' '+role+': '+error.message);await s.page.screenshot({path:path.join(out,name+'-'+role+'-failure.png'),fullPage:true});}finally{await s.context.close();}}

async function home(s,hasPlan=true){
 const {page}=s;
 await page.locator('#home.active').waitFor({state:'visible',timeout:2000});
 assert.equal(await page.locator('.home-learning-panel').isVisible(),true,'home preparation panel must be visible');
 assert.equal(await page.locator('.home-learning-panel h2').innerText(),'무엇을 준비할까요?');
 assert.equal(await page.locator('.home-learning-panel .home-panel-kicker').innerText(),'다음 수업까지');
 if(hasPlan)await page.locator('#home-learning-content button[data-test-plan-id="FAKE_PLAN"]').waitFor({state:'visible'});
 await page.locator('.home-learning-panel').screenshot({path:path.join(out,s.config.role+'-'+(s.config.schedule||'normal')+'-'+(hasPlan?'plan':'state')+'.png')});
}
async function login(s){await s.page.locator('#login-id').fill('SYNTHETIC_ONLY');await s.page.locator('#login-pw').fill('SYNTHETIC_ONLY');await s.page.locator('#login-screen button[onclick="checkLogin()"]').click();await s.page.waitForFunction(()=>!!currentUser?.token);}
async function practice(s){await home(s);await s.page.locator('#home-learning-content button[data-test-plan-id="FAKE_PLAN"]').click();await s.page.locator('.practice-experience').waitFor();}
try{
 await run('home-words-visible-through-60s-full-delay','student',['normal','normal',{fullDelay:60000,fastDateOffset:1}],async s=>{const started=Date.now();await s.page.locator('#home-vocab-preparation [data-slot-key="SECOND"]').waitFor();assert.ok(Date.now()-started<3000);assert.equal(await s.page.locator('#home-vocab-preparation [data-test-plan-id]').count(),2);assert.match(await s.page.locator('#home-other-preparation').innerText(),/確認|확인하고/);assert.doesNotMatch(await s.page.locator('#home-learning-content').innerText(),/듣기 면제|현재 등록된 듣기 안내/);await s.page.locator('#home-vocab-preparation [data-slot-key="SECOND"]').click();await s.page.locator('.practice-experience').waitFor();const request=s.calls.find(p=>p.action==='getAssignedVocaPracticeQuestions');assert.equal(request.testPlanId,'FAKE_PLAN');assert.equal(request.slotKey,'SECOND');assert.equal(request.personalScopeFingerprint,'b'.repeat(64));assert.equal(request.coverage,'ALL');console.log('FAST_SCOPE_CLICKABLE ALL-request-correct full-request-still-held');await s.page.waitForTimeout(61000);await s.page.locator('#home-other-preparation').waitFor({state:'detached'});assert.match(await s.page.locator('#home-learning-content').innerText(),/FAST_SCOPE/);assert.doesNotMatch(await s.page.locator('#home-learning-content').innerText(),/가상 정규 단어장/);const fastDate=new Date(Date.parse(s.calls.find(p=>p.action==='getMyVocabPreparation').fromDate+'T00:00:00Z')+86400000).toISOString().slice(0,10);assert.deepEqual(await s.page.locator('#home-learning-content .home-task time').allTextContents(),[fastDate,fastDate]);assert.match(await s.page.locator('#home-learning-content').innerText(),/17:00–19:00/);});
 await run('today-words-before-full-response','student',['normal','normal',{schedule:'slow'}],async s=>{await s.page.locator('#home-vocab-preparation').waitFor();await s.page.evaluate(()=>showTab('exam'));await s.page.locator('#schedule-range-today').click();await s.page.locator('#exam-table [data-slot-key="SECOND"]').waitFor();assert.equal(await s.page.locator('#exam-table [data-test-plan-id]').count(),2);assert.match(await s.page.locator('#today-other-preparation').innerText(),/확인하고/);s.config.schedule='normal';for(const done of s.config.scheduleWaiters||[])done();await s.page.locator('#today-other-preparation').waitFor({state:'detached'});assert.match(await s.page.locator('#exam-table').innerText(),/FAST_SCOPE/);});
 for(const fast of ['denied','network'])await run('fast-'+fast+'-no-heavy-fallback','student',['normal','normal',{fast}],async s=>{await s.page.locator('#home-learning-content').getByText('지금은 계획을 확인하지 못했어요.').waitFor();assert.equal(s.calls.filter(p=>p.action==='getMyLearningSchedule').length,0);assert.doesNotMatch(await s.page.locator('#home-learning-content').innerText(),/PRIVATE_AUTH/);});
 await run('explicit-unsupported-old-server-fallback','student',['normal','normal',{fast:'unsupported'}],async s=>{await home(s);const fast=s.calls.filter(p=>p.action==='getMyVocabPreparation').length,full=s.calls.filter(p=>p.action==='getMyLearningSchedule').length;assert.ok(fast>=1&&fast<=2);assert.ok(full>=1&&full<=fast);});
 await run('late-fast-read-after-logout-discarded','student',['normal','normal',{fastHold:true}],async s=>{await s.page.waitForFunction(()=>!!currentUser?.token);await s.page.evaluate(()=>logout());s.config.fastHold=false;for(const done of s.config.fastWaiters||[])done();await s.page.waitForTimeout(100);assert.equal(await s.page.evaluate(()=>currentUser),null);assert.doesNotMatch(await s.page.locator('#home-learning-content').innerText(),/FAST_SCOPE/);assert.equal(s.calls.filter(p=>p.action==='getMyLearningSchedule').length,0);});
 await run('range-force-coalesce-and-token-isolation','student',['normal','normal',{fastHold:true}],async s=>{await s.page.evaluate(()=>{window.__fastReads=[fetchMyVocabPreparation(false,'upcoming'),fetchMyVocabPreparation(false,'upcoming'),fetchMyVocabPreparation(true,'upcoming'),fetchMyVocabPreparation(false,'today')];});await s.page.waitForTimeout(100);const calls=s.calls.filter(p=>p.action==='getMyVocabPreparation');assert.equal(calls.length,3);s.config.fastHold=false;for(const done of s.config.fastWaiters||[])done();await s.page.evaluate(()=>Promise.all(window.__fastReads));});
}finally{await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({engine,passed:report.cases.filter(c=>c.passed).length,total:report.cases.length,officialWrites:0,authenticatedProductionUAT:false}));
