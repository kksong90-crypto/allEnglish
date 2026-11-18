// Actual app, synthetic roles/API only. Does not establish authenticated production access.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),origin='https://vocab-recovery.invalid';
const engine=process.argv[2]||'chromium';if(!['chromium','webkit'].includes(engine))throw Error('Use chromium or webkit');
const out=path.join(root,'browser-tests/artifacts/vocab-recovery',engine);await mkdir(out,{recursive:true});
const header=['단어장명','Day','영어','뜻','정렬번호','book_id','허용답'];
const sample=[['evaluate','평가하다'],['maintain','유지하다'],['inevitable','불가피한'],['scarce','부족한'],['justify','정당화하다']];
const regular=sample.map(([word,meaning],i)=>['가상 정규 단어장',1,word,meaning,i+1,'FAKE_BOOK',word]);
const point=['🎯 이번주 포인트 단어','가상 이번 주','pointword','가상 포인트 뜻',1,'FAKE_POINT','pointword'];
const books=[['REV_TEXT','TEXTBOOK','가상 교과서','L3'],['REV_MOCK','MOCK_EXAM','가상 모의고사','Q18'],['REV_WORD','WORD_BOOK','가상 시중 단어장','D1']].map(([revisionId,categoryCode,displayName,sectionId])=>({revisionId,categoryCode,displayName,sections:[{sectionId,label:sectionId==='L3'?'3과':sectionId==='D1'?'Day 1':'18번',wordCount:sample.length}]}));
const publicWords=book=>sample.map(([word,meaning],i)=>({word,meaning,vocabWordId:book.revisionId+'_W'+i,revisionId:book.revisionId,bookId:'FAKE_PUBLIC',sectionId:book.sections[0].sectionId,displayName:book.displayName,sectionLabel:book.sections[0].label,allowedAnswers:[word]}));
const report={engine,syntheticRoles:true,authenticatedProductionUAT:false,officialWrites:0,cases:[],findings:[]};
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
async function setup(role,legacy='normal',assigned='normal'){
 const config={role,legacy,assigned},calls=[],errors=[];
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ko-KR'});
 await context.addInitScript(({role})=>localStorage.setItem('allbarun-user',JSON.stringify({id:'SYNTHETIC_'+role,name:'합성 계정',role,token:'SYNTHETIC_ONLY'})),{role});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin){const target=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!target.startsWith(root+path.sep))return route.abort();try{return route.fulfill({status:200,body:await readFile(target),contentType:target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':target.endsWith('.png')?'image/png':'text/html; charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}}
  if(!['script.google.com','script.googleusercontent.com'].includes(url.hostname))return route.abort();
  const p=Object.fromEntries(request.method()==='POST'?new URLSearchParams(request.postData()||''):url.searchParams);calls.push(p);
  if(config.legacy==='network'&&p.action==='getVocabData')return route.abort('failed');
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
  else if(p.action==='getMyLearningSchedule'){const date=p.fromDate||new Date().toISOString().slice(0,10),day={date,displayDate:date,className:'가상 반',hasPlan:true,scheduled:true,vocab:[{testPlanId:'FAKE_PLAN',vocaScopeState:'CONNECTED',sourceRanges:[{bookId:'FAKE_BOOK',sectionId:'FAKE_SCOPE'}],displayText:'가상 정규 단어장 Day 1',bookName:'가상 정규 단어장',regularText:'Day 1'}],listening:null,quiz:{scope:''},homework:{text:'',public:true}};reply={success:true,range:p.range||'upcoming',days:[day],visibleDays:[day],nextPlan:day};}
  else if(p.action==='getFavoriteState')reply={success:true,folders:{기본:['가상 정규 단어장|1|evaluate']}};
  else if(p.action==='getStudentStats')reply={success:true,testCount:0,wrongCount:0};
  else if(p.action==='getStudentContent')reply={success:true,home:{heroTitle:'합성 계정'},notices:[],homeNotices:[]};
  else if(p.action==='getMyPointSummary')reply={success:true,totalPoints:0,canTake:false};
  else if(p.action==='getRetestList')reply={success:true,rows:[]};
  else reply={success:false,message:'SYNTHETIC_ACTION_NOT_SUPPORTED'};
  if(p.action==='getMyVocabPreparation')reply={success:false,code:'UNSUPPORTED_ACTION'};
  await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(reply)});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!currentUser?.token);
 const showVocab=async()=>{await page.evaluate(()=>showTab('vocab'));if(!await page.locator('#station-library').evaluate(el=>el.open))await page.locator('#station-library > summary').click();await page.locator('#station-library-book option[value="REV_TEXT"]').waitFor({state:'attached'});};
 const legacyOpen=async()=>{await page.evaluate(()=>showTab('vocab'));assert.equal(await page.locator('#legacy-vocab-library').evaluate(el=>el.open),true);};
 return {context,page,config,calls,errors,showVocab,legacyOpen};
}
async function run(name,role,config,fn){const s=await setup(role,...config);try{await fn(s);assert.deepEqual(s.errors,[]);assert.equal(s.calls.some(p=>['saveVocabResult','submitPointTest','saveFavoriteState','saveWrongNote'].includes(p.action)),false);report.cases.push({name,role,passed:true});console.log('PASS '+name+' '+role);}catch(error){process.exitCode=1;const text=String(error);report.cases.push({name,role,passed:false,error:text});console.log('FAIL '+name+' '+role+': '+error.message);await s.page.screenshot({path:path.join(out,name+'-'+role+'.png'),fullPage:true});}finally{await s.context.close();}}
try{
 for(const role of ['student','admin']){
  await run('public-legacy-assigned-favorites-entry',role,[],async({page,calls,showVocab,legacyOpen})=>{
   await showVocab();assert.ok(calls.filter(p=>p.action==='getVocabData').every(p=>p.view==='CATALOG'&&p.valuesOnly==='Y'));
   assert.deepEqual(await page.locator('#station-library-book option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean).sort()),books.map(b=>b.revisionId).sort());
   await page.locator('#station-library-word-query').fill('evaluate');await page.locator('#station-library-word-search').click();await page.locator('#station-library-search-result').getByText('검색 결과 3개').waitFor();
   await page.locator('#station-library-book').selectOption('REV_TEXT');await page.locator('#station-library-scope').selectOption('0');await page.locator('#station-library-practice-button').waitFor();
   await page.locator('#station-library-practice-button').click();await page.locator('.practice-experience').waitFor();assert.equal(await page.evaluate(()=>assignedPracticeState.preview),role==='admin');assert.equal(calls.filter(p=>p.action==='getAssignedVocaPracticeQuestions').length,0);
   await page.locator('[data-pe="source"]').click();assert.equal(await page.locator('#legacy-vocab-library').evaluate(el=>el.open),true);await page.waitForFunction(()=>vocabLoadedOnce);
   assert.equal(await page.evaluate(()=>vocabData.slice(1).length),0,'catalog entry must not hydrate word bodies');assert.equal(await page.locator('#vocab-book-select option[value="🎯 이번주 포인트 단어"]').count(),role==='student'?1:0);
   await page.locator('#vocab-book-select').selectOption('가상 정규 단어장');await page.locator('#vocab-day-select').selectOption('1');await page.locator('#vocab-view table').waitFor();assert.deepEqual(await page.evaluate(()=>vocabData.slice(1)),regular);
   await page.locator('#vocab-search-input').fill('evaluate');await page.locator('#vocab-search-result').evaluate(()=>searchVocab());await page.locator('#vocab-search-result').getByText('검색 결과 1개').waitFor();
   await page.evaluate(()=>loadFavoriteFolders());await page.evaluate(()=>showTab('favorites'));await page.locator('#favorites-view .speak-word').waitFor();assert.equal(await page.locator('#favorites-view .speak-word').textContent(),'evaluate');
   await page.evaluate(()=>showTab('home'));
   const assigned=page.locator('#home-learning-content button[data-test-plan-id="FAKE_PLAN"]');
   if(role==='student'){await assigned.click();await page.locator('.practice-experience').waitFor();assert.equal(await page.evaluate(()=>assignedPracticeState.totalCount),5);}else assert.equal(await assigned.count(),0);
  });
  for(const scenario of ['empty','header','nameless','network','apierror'])await run('legacy-'+scenario+'-retry',role,[scenario],async({page,calls,config,legacyOpen})=>{
   await legacyOpen();await page.locator('#vocab-view').getByRole('button',{name:'다시 불러오기',exact:true}).waitFor();assert.equal(await page.evaluate(()=>vocabLoadedOnce),false);assert.equal(await page.evaluate(()=>vocabData.slice(1).length),0);assert.doesNotMatch(await page.locator('#vocab-view').innerText(),/CoreDB|Vocab|A열|private implementation/);config.legacy='normal';await page.locator('#vocab-view').getByRole('button',{name:'다시 불러오기',exact:true}).click();await page.waitForFunction(()=>vocabLoadedOnce);assert.equal(calls.filter(p=>p.action==='getVocabData').length,2);
  });
  await run('expired-session-on-legacy-read',role,['expired'],async({page,legacyOpen})=>{await legacyOpen();await page.locator('#login-screen').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>currentUser),null);assert.equal(await page.evaluate(()=>vocabLoadedOnce),false);assert.equal(await page.evaluate(()=>assignedPracticeState),null);assert.equal(await page.locator('#station-library-words li').count(),0);});
  await run('favorites-before-legacy-load',role,[],async({page,calls})=>{await page.evaluate(()=>loadFavoriteFolders());assert.equal(await page.evaluate(()=>favoriteFolders['기본'].length),1);await page.evaluate(()=>showTab('favorites'));await page.waitForTimeout(100);assert.equal(await page.locator('#favorites-view .speak-word').count(),1,'A saved favorite must not be reported as empty just because legacy word rows have not loaded.');assert.ok(calls.some(p=>p.action==='getVocabData'));});
 }
 for(const [scenario,message] of [['backendError','전체 시험범위 응답을 확인할 수 없습니다. 처음부터 다시 시작하세요.'],['legacy200','전체 시험범위 연습 API가 아직 업데이트되지 않았습니다.'],['missingCoverage','전체 시험범위 연습 API가 아직 업데이트되지 않았습니다.']])await run('assigned-strict-'+scenario,'student',['normal',scenario],async({page,calls})=>{
  await page.locator('#home-learning-content button[data-test-plan-id="FAKE_PLAN"]').click();await page.locator('#practice-view').getByText('시험범위 연습을 시작하지 못했어요.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>assignedPracticeState),null);assert.equal(await page.locator('.practice-experience').count(),0);const req=calls.filter(p=>p.action==='getAssignedVocaPracticeQuestions');assert.equal(req.length,1);assert.equal(req[0].coverage,'ALL');assert.equal(calls.filter(p=>p.action==='getVocabData').length,0);
 });
}finally{await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({engine,passed:report.cases.filter(c=>c.passed).length,total:report.cases.length,officialWrites:0,authenticatedProductionUAT:false}));
