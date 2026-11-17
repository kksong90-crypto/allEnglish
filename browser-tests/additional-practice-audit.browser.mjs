// Actual app, synthetic roles/API only. Does not establish authenticated production access.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),origin='https://home-visibility.invalid';
const engine=process.argv[2]||'chromium';if(!['chromium','webkit'].includes(engine))throw Error('Use chromium or webkit');
const out=path.join(root,'browser-tests/artifacts/additional-practice',engine);await mkdir(out,{recursive:true});
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
  if(url.origin===origin&&config.module404&&url.pathname==='/practice-experience.js')return route.fulfill({status:404,body:''});
  if(url.origin===origin){const target=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!target.startsWith(root+path.sep))return route.abort();try{return route.fulfill({status:200,body:await readFile(target),contentType:target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':target.endsWith('.png')?'image/png':'text/html; charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}}
  if(!['script.google.com','script.googleusercontent.com'].includes(url.hostname))return route.abort();
  const p=Object.fromEntries(request.method()==='POST'?new URLSearchParams(request.postData()||''):url.searchParams);calls.push(p);
  if(config.legacy==='network'&&p.action==='getVocabData')return route.abort('failed');
  if(p.action==='getMyLearningSchedule'&&config.schedule==='slow')await new Promise(resolve=>(config.scheduleWaiters||=[]).push(resolve));
  let reply;
  if(p.action==='getVocabData')reply=config.legacy==='expired'?{success:false,message:'로그인 시간이 만료되었습니다.'}:config.legacy==='empty'?{success:true,values:[]}:config.legacy==='header'?{success:true,values:[header]}:config.legacy==='nameless'?{success:true,values:[header,['',1,'evaluate','평가하다',1]]}:config.legacy==='apierror'?{success:false,message:'CoreDB VocabWords private implementation error'}:{success:true,values:[header,...regular,...(role==='student'?[point]:[])]};
  else if(p.action==='getVocaCatalog')reply={success:true,books:[...books,{revisionId:'HIDDEN',displayName:'숨김 교재',studentVisible:false,sections:[]},{revisionId:'INTERNAL',displayName:'내부 범위',usageScope:'SCHOOL_EXAM',sections:[]}]};
  else if(p.action==='getVocaSection')reply={success:true,revisionId:p.revisionId,words:publicWords(books.find(b=>b.revisionId===p.revisionId))};
  else if(p.action==='searchVoca'){const words=books.filter(b=>!p.revisionId||b.revisionId===p.revisionId).flatMap(publicWords).filter(w=>(w.word+' '+w.meaning).includes(p.query));reply={success:true,count:words.length,truncated:false,words};}
  else if(p.action==='getAssignedVocaPracticeQuestions'){
   if(config.offline)return route.abort('failed');
   if(config.holdAssigned)await new Promise(resolve=>(config.assignedWaiters||=[]).push(resolve));
   const count=config.slotMode?201:config.assigned==='legacy200'?200:5;const offset=config.slotMode?Number(p.offset||0):0;
   const questions=Array.from({length:Math.min(200,count-offset)},(_,n)=>{const i=offset+n;return {questionNo:i+1,prompt:sample[i]?.[1]||'가상 뜻 '+i,acceptedAnswers:[sample[i]?.[0]||'word'+i],sourceLabel:p.slotKey||'Day 1',bookId:'FAKE_BOOK',vocabWordId:'FAKE_ASSIGNED_'+i};});
   reply=config.assigned==='backendError'?{success:false,message:'전체 시험범위 응답을 확인할 수 없습니다. 처음부터 다시 시작하세요.'}:config.assigned==='legacy200'?{success:true,questions,planDate:'가상 배정'}:{success:true,testPlanId:'FAKE_PLAN',mode:'MEANING_TO_WORD',coverage:'ALL',scopeVersion:'FAKE_SCOPE_V1',offset,count:questions.length,totalCount:count,nextOffset:offset+questions.length<count?offset+questions.length:null,planDate:'가상 배정',questions};
   if(config.assigned==='missingCoverage')delete reply.coverage;
  }
  else if(p.action==='login')reply={success:true,id:'SYNTHETIC_'+config.role,name:'합성 계정',role:config.role,token:'SYNTHETIC_'+config.role};
  else if(p.action==='logout')reply={success:true};
  else if(p.action==='getMyLearningSchedule'&&config.schedule==='error')reply={success:false,message:'SYNTHETIC_INTERNAL_SCHEDULE_FAILURE'};
  else if(p.action==='getMyLearningSchedule'&&config.schedule==='empty')reply={success:true,days:[],visibleDays:[]};
  else if(p.action==='getMyLearningSchedule'){const date=p.fromDate||new Date().toISOString().slice(0,10),day={date,displayDate:date,className:'가상 반',hasPlan:true,scheduled:true,vocab:[{testPlanId:'FAKE_PLAN',vocaScopeState:'CONNECTED',sourceRanges:[{bookId:'FAKE_BOOK',sectionId:'FAKE_SCOPE'}],displayText:'가상 정규 단어장 Day 1',bookName:'가상 정규 단어장',regularText:'Day 1'}],listening:null,quiz:{scope:''},homework:{text:'',public:true}};if(config.slotMode)day.vocab=['SLOT_A','SLOT_B'].map(slotKey=>({...day.vocab[0],slotKey,displayText:'가상 범위 '+slotKey}));reply={success:true,range:p.range||'upcoming',days:[day],visibleDays:[day],nextPlan:day};}
  else if(p.action==='getFavoriteState')reply={success:true,folders:{기본:['가상 정규 단어장|1|evaluate']}};
  else if(p.action==='getStudentStats')reply={success:true,testCount:0,wrongCount:0};
  else if(p.action==='getStudentContent')reply={success:true,home:{heroTitle:'합성 계정'},notices:[],homeNotices:[]};
  else if(p.action==='getMyPointSummary')reply={success:true,totalPoints:0,canTake:false};
  else if(p.action==='getRetestList')reply={success:true,rows:[]};
  else reply={success:false,message:'SYNTHETIC_ACTION_NOT_SUPPORTED'};
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
const pe=(s,a)=>s.page.locator('#practice-view [data-pe="'+a+'"]');
async function cardFinish(s,difficult=false){await pe(s,'start').click();for(let i=0;i<5;i++){if(await pe(s,'known').count()===0)await pe(s,'reveal').click();await pe(s,difficult?'difficult':'known').click();await pe(s,'next').click();}await s.page.getByText('이번 단계를 마쳤어요.',{exact:true}).waitFor();}
try{
 await run('completed-round-restart-clears-progress','student',[],async s=>{await practice(s);await cardFinish(s);await pe(s,'all').click();assert.equal(await s.page.locator('.pe-count').innerText(),'1 / 5');assert.equal(await pe(s,'next').isDisabled(),true);});
 await run('weak-round-restore-parent','student',[],async s=>{await practice(s);await cardFinish(s,true);await pe(s,'weak').click();assert.equal(await s.page.locator('.pe-count').innerText(),'1 / 5');await pe(s,'overview').click();await pe(s,'start').click();for(let i=0;i<5;i++){if(await pe(s,'known').count()===0)await pe(s,'reveal').click();await pe(s,'known').click();await pe(s,'next').click();}await pe(s,'restore').click();await s.page.getByText('이번 단계를 마쳤어요.',{exact:true}).waitFor();});
 await run('rapid-mode-switch-retains-draft','student',[],async s=>{await practice(s);await pe(s,'start').click();await s.page.locator('[data-stage="spell"]').click();await s.page.locator('#pe-answer').fill('unfinished');await s.page.locator('[data-view="challenge"]').click();await s.page.locator('[data-view="studio"]').click();await s.page.locator('[data-view="focus"]').click();await pe(s,'start').click();assert.equal(await s.page.locator('#pe-answer').inputValue(),'unfinished');});
 await run('double-answer-click-does-not-skip','student',[],async s=>{await practice(s);await pe(s,'start').click();await pe(s,'reveal').click();await pe(s,'known').dblclick();assert.equal(await s.page.locator('.pe-count').innerText(),'1 / 5');await pe(s,'next').dblclick();assert.equal(await s.page.locator('.pe-count').innerText(),'2 / 5');});
 await run('slow-assigned-cancel-home-rejects-late','student',['normal','normal',{holdAssigned:true}],async s=>{await home(s);await s.page.locator('[data-test-plan-id="FAKE_PLAN"]').click();await s.page.getByText('배정된 시험범위를 확인하고 있습니다…',{exact:true}).waitFor();await s.page.locator('#app-back-button').click();await home(s);s.config.holdAssigned=false;for(const done of s.config.assignedWaiters||[])done();await s.page.waitForTimeout(300);await home(s);assert.equal(await s.page.evaluate(()=>assignedPracticeState===null),true);});
 await run('slow-assigned-logout-rejects-late','student',['normal','normal',{holdAssigned:true}],async s=>{await home(s);await s.page.locator('[data-test-plan-id="FAKE_PLAN"]').click();await s.page.getByText('배정된 시험범위를 확인하고 있습니다…',{exact:true}).waitFor();await s.page.evaluate(()=>logout());s.config.holdAssigned=false;for(const done of s.config.assignedWaiters||[])done();await login(s);await home(s);assert.equal(await s.page.evaluate(()=>assignedPracticeState===null),true);});
 await run('offline-assigned-return-and-recover','student',['normal','normal',{offline:true}],async s=>{await home(s);await s.page.locator('[data-test-plan-id="FAKE_PLAN"]').click();await s.page.getByRole('button',{name:'홈에서 최신 시험범위 확인',exact:true}).waitFor();s.config.offline=false;await s.page.getByRole('button',{name:'홈에서 최신 시험범위 확인',exact:true}).click();await home(s);await practice(s);});
 await run('studio-inspect-preserves-other-stage-word','student',[],async s=>{await practice(s);await pe(s,'start').click();await s.page.locator('[data-stage="spell"]').click();const previous=await s.page.evaluate(()=>{const w=assignedPracticeState.experience;return {queue:[...w.queue],word:assignedPracticeState.rows[w.queue[w.positions.spell]][2]};});await s.page.locator('[data-stage="card"]').click();await s.page.locator('[data-view="studio"]').click();await pe(s,'inspect').nth(3).click();await s.page.locator('[data-stage="spell"]').click();const current=await s.page.evaluate(()=>{const w=assignedPracticeState.experience;return {queue:[...w.queue],word:assignedPracticeState.rows[w.queue[w.positions.spell]][2]};});assert.deepEqual(current,previous,'opening a card must preserve the pending spelling word and order');});
 await run('weak-subset-outside-inspect-and-parent-restore','student',[],async s=>{await practice(s);await pe(s,'start').click();for(let i=0;i<5;i++){if(await pe(s,'known').count()===0)await pe(s,'reveal').click();await pe(s,i===0?'difficult':'known').click();await pe(s,'next').click();}const parent=await s.page.evaluate(()=>[...assignedPracticeState.experience.queue]);await pe(s,'weak').click();assert.equal(await s.page.locator('.pe-count').innerText(),'1 / 1');await pe(s,'overview').click();await s.page.locator('[data-view="studio"]').click();const outside=await s.page.evaluate(()=>assignedPracticeState.rows.findIndex((_,n)=>!assignedPracticeState.experience.queue.includes(n)));await pe(s,'inspect').nth(outside).click();await pe(s,'restore').click();await s.page.getByText('이번 단계를 마쳤어요.',{exact:true}).waitFor();assert.deepEqual(await s.page.evaluate(()=>[...assignedPracticeState.experience.queue]),parent);});
 await run('plan-only-button-does-not-invent-slot','student',[],async s=>{await practice(s);const calls=s.calls.filter(p=>p.action==='getAssignedVocaPracticeQuestions');assert.equal(calls.length,1);assert.equal(Object.hasOwn(calls[0],'slotKey'),false);});
 await run('same-plan-distinct-slot-all-pages-home-and-schedule','student',['normal','normal',{slotMode:true}],async s=>{
  for(const [tab,slot] of [['home','SLOT_A'],['exam','SLOT_B']]){
   if(tab==='exam')await s.page.evaluate(()=>showTab('exam'));
   const region=tab==='home'?'#home-learning-content':'#exam-table';
   const button=s.page.locator(region+' button[data-test-plan-id="FAKE_PLAN"][data-slot-key="'+slot+'"]');
   await button.first().click();await s.page.locator('.practice-experience').waitFor();
   assert.equal(await s.page.evaluate(()=>assignedPracticeState.slotKey),slot);
   await pe(s,'source').click();
  }
  assert.deepEqual(s.calls.filter(p=>p.action==='getAssignedVocaPracticeQuestions').map(p=>({plan:p.testPlanId,slot:p.slotKey,offset:Number(p.offset),coverage:p.coverage})),[
   {plan:'FAKE_PLAN',slot:'SLOT_A',offset:0,coverage:'ALL'},{plan:'FAKE_PLAN',slot:'SLOT_A',offset:200,coverage:'ALL'},
   {plan:'FAKE_PLAN',slot:'SLOT_B',offset:0,coverage:'ALL'},{plan:'FAKE_PLAN',slot:'SLOT_B',offset:200,coverage:'ALL'}]);
 });
 await run('missing-module-legacy-remains-usable','student',['normal','normal',{module404:true}],async s=>{await home(s);await s.page.locator('[data-test-plan-id="FAKE_PLAN"]').click();await s.page.getByRole('button',{name:'암기 카드',exact:true}).waitFor();assert.equal(await s.page.locator('.practice-experience').count(),0);});

}finally{await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({engine,passed:report.cases.filter(c=>c.passed).length,total:report.cases.length,officialWrites:0,authenticatedProductionUAT:false}));
