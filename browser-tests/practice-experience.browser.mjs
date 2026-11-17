// Actual student app + synthetic identity/API only. No production API or real account is used.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const engineArg=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
const engine=engineArg||'chromium';
if(!['chromium','webkit'].includes(engine))throw Error('Usage: node browser-tests/practice-experience.browser.mjs [chromium|webkit] [--preview]');
const browserEngine=engine==='webkit'?webkit:chromium;
const out=path.join(root,'browser-tests/artifacts/practice-experience',...(engine==='webkit'?['webkit']:[]));
const sample=[['inevitable','불가피한'],['evaluate','평가하다'],['maintain','유지하다'],['scarce','부족한'],['justify','정당화하다']];
const corpus=n=>Array.from({length:n},(_,i)=>({word:sample[i]?.[0]||'term'+i,meaning:sample[i]?.[1]||'가상 뜻 '+i,vocabWordId:'FAKE_W'+i,bookId:'FAKE_BOOK',revisionId:'FAKE_REV',sectionId:'FAKE_SCOPE',allowedAnswers:[sample[i]?.[0]||'term'+i]}));
function answer(action,p,config){
 const words=corpus(config.count||5);
 if(action==='getAssignedVocaPracticeQuestions'){
  const offset=Number(p.offset||0),page=words.slice(offset,offset+200);
  const result={success:true,testPlanId:'FAKE_PLAN',mode:'MEANING_TO_WORD',coverage:'ALL',scopeVersion:'SYNTHETIC_SCOPE_V1',offset,count:page.length,totalCount:words.length,nextOffset:offset+page.length<words.length?offset+page.length:null,planDate:'2026-11-17 · 가상 교재 3과',questions:page.map((word,i)=>({questionNo:offset+i+1,prompt:word.meaning,acceptedAnswers:word.allowedAnswers,sourceLabel:'3과',bookId:word.bookId,vocabWordId:word.vocabWordId}))};
  if(config.apiScenario==='legacy')return {success:true,testPlanId:result.testPlanId,mode:result.mode,planDate:result.planDate,questions:result.questions};
  if(config.apiScenario==='metadata')result.count++;
  if(config.apiScenario==='mutation'&&offset>0)result.scopeVersion='SYNTHETIC_SCOPE_CHANGED';
  if(config.apiScenario==='totalMutation'&&offset>0)result.totalCount--;
  if(config.apiScenario==='duplicate'&&offset>0)result.questions[0].vocabWordId='FAKE_W0';
  if(config.apiScenario==='pageGap'&&offset===0)result.nextOffset++;
  return result;
 }
 if(action==='getMyLearningSchedule'){
  const date=p.fromDate||'2026-11-17';const day={date,displayDate:date,className:'합성 반',hasPlan:true,scheduled:true,vocab:[{testPlanId:'FAKE_PLAN',vocaScopeState:'CONNECTED',sourceRanges:[{bookId:'FAKE_BOOK',sectionId:'FAKE_SCOPE'}],displayText:'가상 교재 3과',bookName:'가상 교재',regularText:'3과'}],listening:null,quiz:{scope:''},homework:{text:'',public:true}};
  return {success:true,range:p.range||'upcoming',days:[day],visibleDays:[day],nextPlan:day};
 }
 if(action==='getVocaCatalog')return {success:true,books:[{revisionId:'FAKE_REV',displayName:'가상 공개 교재',categoryCode:'TEXTBOOK',sections:[{sectionId:'FAKE_SCOPE',label:'3과',wordCount:words.length}]}]};
 if(action==='getVocaSection')return {success:true,revisionId:'FAKE_REV',words};
 if(action==='getStudentContent')return {success:true,home:{heroTitle:'합성 계정 학습 검증'},notices:[],homeNotices:[]};
 if(action==='getFavoriteState')return {success:true,folders:{기본:[]}};
 if(action==='getMyPointSummary')return {success:true,totalPoints:0,canTake:false};
 if(action==='getRetestList')return {success:true,rows:[]};
 if(action==='logout')return {success:true};
 if(action==='login')return {success:true,id:'FAKE_LOGIN',name:'합성 계정',role:'student',token:'SYNTHETIC_ONLY'};
 return {success:false,message:'SYNTHETIC_ACTION_NOT_SUPPORTED'};
}
const preview=process.argv.includes('--preview');
const previewConfig={count:24};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(preview&&url.pathname==='/__fixture_api'){
   let raw='';for await(const chunk of req)raw+=chunk;
   const p=Object.fromEntries(req.method==='POST'?new URLSearchParams(raw):url.searchParams);
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(answer(p.action,p,previewConfig)));return;
  }
  const target=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  let body=await readFile(target);
  if(preview&&target.endsWith('/index.html')){
   const api='http://127.0.0.1:'+server.address().port+'/__fixture_api';
   const role=url.searchParams.get('role')==='admin'?'admin':'student';
   body=Buffer.from(body.toString().replace(/const SHEET_URL = "[^"]+";/,'const SHEET_URL = '+JSON.stringify(api)+';').replace('<head>','<head><script>localStorage.setItem("allbarun-user",JSON.stringify({id:"LOCAL_PREVIEW",name:"합성 미리보기",role:'+JSON.stringify(role)+',token:"SYNTHETIC_ONLY"}));window.__SYNTHETIC_PREVIEW__=true;</script>'));
  }
  const type=target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':target.endsWith('.png')?'image/png':target.endsWith('.json')?'application/json':'text/html; charset=utf-8';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404);res.end('not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base='http://127.0.0.1:'+server.address().port+'/';
if(preview){
 console.log('Synthetic-only local preview: '+base+' (admin: '+base+'?role=admin). Production source/authentication is unchanged. API responses are local fixtures.');
 process.on('SIGINT',()=>server.close(()=>process.exit(0)));process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}else{
 await mkdir(out,{recursive:true});
 const report={kind:'actual-app-synthetic-experience',engine,productionMeasured:false,officialWrites:0,localPaintMeasurements:[],cases:[]};
 const browser=await browserEngine.launch({headless:true,...(engine==='chromium'?(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}):{})});
 async function session({role='student',count=5,width=390,apiScenario='normal'}={}){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600,locale:'ko-KR',timezoneId:'Asia/Seoul'}),calls=[],errors=[],config={count,apiScenario};
  await context.addInitScript(({role})=>localStorage.setItem('allbarun-user',JSON.stringify({id:'FAKE_EXPERIENCE',name:'합성 학습 계정',role,token:'SYNTHETIC_ONLY'})),{role});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===new URL(base).origin)return route.continue();
   if(!['script.google.com','script.googleusercontent.com'].includes(url.hostname))return route.abort();
   const p=Object.fromEntries(request.method()==='POST'?new URLSearchParams(request.postData()||''):url.searchParams);
   calls.push({action:p.action,method:request.method(),...(p.action==='getAssignedVocaPracticeQuestions'?{coverage:p.coverage,offset:Number(p.offset||0),limit:Number(p.limit||0),randomize:p.randomize,hasScopeVersion:Boolean(p.scopeVersion)}:{})});
   return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(answer(p.action,p,config))});
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!currentUser?.token&&!!window.PracticeExperience);
  const pe=action=>page.locator('#practice-view [data-pe="'+action+'"]');
  const currentRow=()=>page.evaluate(()=>{const s=assignedPracticeState,w=s.experience,i=w.queue[w.positions[w.stage]],row=s.rows[i];return {index:i,word:row?.[2],meaning:row?.[3],id:row?.[7],queue:[...w.queue],stage:w.stage,position:w.positions[w.stage]};});
  const shot=async name=>{await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));return page.screenshot({path:path.join(out,name+'.png'),fullPage:true});};
  async function assigned(expectError){await page.locator('#home-learning-content button[data-test-plan-id="FAKE_PLAN"]').waitFor();await page.locator('#home-learning-content button[data-test-plan-id="FAKE_PLAN"]').click();if(expectError)await page.locator('#practice-view').getByText(expectError).waitFor();else await page.locator('.practice-experience').waitFor();}
  async function publicScope(){await page.evaluate(()=>showTab('vocab'));await page.locator('#station-library-book option[value="FAKE_REV"]').waitFor({state:'attached'});await page.locator('#station-library-book').selectOption('FAKE_REV');await page.locator('#station-library-scope').selectOption('0');await page.locator('#station-library-practice-button').click();await page.locator('.practice-experience').waitFor();}
  function safe(){assert.deepEqual(errors,[]);assert.equal(calls.some(p=>['saveVocabResult','submitPointTest','saveFavoriteState','saveWrongNote'].includes(p.action)),false);assert.equal(calls.some(p=>p.action==='getVocabData'),false);}
  return {context,page,calls,errors,pe,shot,assigned,publicScope,currentRow,safe};
 }
 async function run(name,options,fn){const s=await session(options);try{await fn(s);s.safe();report.cases.push({name,passed:true,requests:s.calls.map(p=>p.action)});console.log('PASS '+name);}catch(error){await s.shot(name+'-failure');report.cases.push({name,passed:false,error:String(error)});console.log('FAIL '+name+': '+error.message);process.exitCode=1;}finally{await s.context.close();}}
 try{
  for(const width of [390,1365])await run('student-flow-'+width,{width},async({page,pe,assigned,shot,currentRow})=>{
   await assigned();assert.equal(await page.locator('.pe-mode').count(),3);await shot('student-'+width+'-focus');
   await pe('start').click();const first=await currentRow();assert.equal((await page.locator('.pe-word').textContent()).trim(),first.word);
   const paint=await page.evaluate(async()=>{
    const samples=[];
    for(let i=0;i<20;i++){
     const started=performance.now();document.querySelector('#practice-view [data-pe="reveal"]').click();
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));samples.push(performance.now()-started);
    }
    const sorted=[...samples].sort((a,b)=>a-b);
    return {kind:'synthetic-app-local-paint-only',samples:20,medianMs:(sorted[9]+sorted[10])/2,p95ObservedMs:sorted[18],maxMs:sorted.at(-1),productionNetworkMeasured:false};
   });
   report.localPaintMeasurements.push({viewportWidth:width,...paint});
   await pe('reveal').click();assert.ok((await page.locator('.pe-meaning').textContent()).includes(first.meaning));await pe('reveal').click();assert.equal((await page.locator('.pe-meaning').textContent()).includes(first.meaning),false);
   await pe('reveal').click();await pe('difficult').click();await pe('next').click();await pe('prev').click();assert.equal((await page.locator('.pe-word').textContent()).trim(),first.word);
   await page.locator('#practice-view [data-pe="stage"][data-stage="spell"]').click();await page.locator('#pe-answer').fill('draft-'+first.word);
   await page.locator('[data-pe="view"][data-view="challenge"]').click();await shot('student-'+width+'-challenge');
   await page.locator('#practice-view [data-pe="stage"][data-stage="spell"]').click();assert.equal(await page.locator('#pe-answer').inputValue(),'draft-'+first.word);
   await page.locator('#pe-answer').fill('incorrect');await pe('check').click();assert.ok((await page.locator('.pe-feedback').textContent()).includes('정답: '+first.word));
   await shot('student-'+width+'-wrong');await pe('retry').click();await page.locator('#pe-answer').fill(first.word);await pe('check').click();assert.match(await page.locator('.pe-feedback').textContent(),/맞았어요/);
   await pe('next').click();const second=await currentRow();const secondDraft='draft-'+second.word;await page.locator('#pe-answer').fill(secondDraft);await pe('prev').click();await pe('next').click();assert.equal(await page.locator('#pe-answer').inputValue(),secondDraft);
   await page.locator('[data-pe="view"][data-view="studio"]').click();await shot('student-'+width+'-studio');await pe('start').click();assert.equal(await page.locator('#pe-answer').inputValue(),secondDraft);
   page.once('dialog',dialog=>dialog.dismiss());await pe('source').click();assert.equal(await page.locator('#pe-answer').inputValue(),secondDraft);assert.equal(await page.locator('section#practice.active').count(),1);
   page.once('dialog',dialog=>dialog.accept());await pe('source').click();await page.locator('section#home.active').waitFor();await shot('student-'+width+'-source-return');
   await assigned();await pe('start').click();
   for(let i=0;i<5;i++){if(await pe('known').count()===0)await pe('reveal').click();await pe(i===2?'difficult':'known').click();await pe('next').click();}
   await page.getByText('이번 단계를 마쳤어요.',{exact:true}).waitFor();await shot('student-'+width+'-completion');assert.equal(await pe('weak').count(),1);
   await pe('weak').click();assert.equal((await page.locator('.pe-count').textContent()).trim(),'1 / 1');assert.equal(await pe('next').isDisabled(),true);
   if(await pe('known').count()===0)await pe('reveal').click();await pe('known').click();await pe('next').click();await page.getByText('이번 단계를 마쳤어요.',{exact:true}).waitFor();
   await pe('all').click();assert.equal(await pe('next').isDisabled(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  });
  await run('single-word-recall-fallback',{count:1},async({page,pe,assigned,shot})=>{
   await assigned();await page.locator('[data-pe="view"][data-view="challenge"]').click();await page.locator('#practice-view [data-pe="stage"][data-stage="recall"]').click();assert.equal(await pe('choice').count(),0);await page.locator('#pe-answer').fill('inevitable');await page.locator('#pe-answer').dispatchEvent('keydown',{key:'Enter',isComposing:true});assert.equal(await page.locator('.pe-feedback').count(),0);await pe('check').click();await pe('next').click();await page.getByText('이번 단계를 마쳤어요.',{exact:true}).waitFor();await shot('single-word-fallback');
   await pe('advance').click();await page.locator('#pe-answer').fill('new-spelling-draft');
   page.once('dialog',dialog=>dialog.dismiss());await pe('source').click();
   assert.equal(await page.locator('section#practice.active').count(),1,'previous recall feedback must not mark a new spelling draft as graded');
   assert.equal(await page.locator('#pe-answer').inputValue(),'new-spelling-draft');
  });
  await run('challenge-safe-recall',{count:5},async({page,pe,assigned,shot,currentRow})=>{
   await assigned();await page.locator('[data-pe="view"][data-view="challenge"]').click();await page.locator('#practice-view [data-pe="stage"][data-stage="recall"]').click();
   const first=await currentRow();const options=await pe('choice').allTextContents();assert.equal(options.length,4);assert.equal(new Set(options).size,4);assert.ok(options.every(text=>sample.some(([,meaning])=>meaning===text)));
   await pe('choice').filter({hasText:options.find(text=>text!==first.meaning)}).click();assert.ok((await page.locator('.pe-feedback').textContent()).includes('정답: '+first.word));await shot('challenge-recall-wrong');
   await pe('retry').click();assert.deepEqual(await pe('choice').allTextContents(),options);await pe('choice').filter({hasText:first.meaning}).click();assert.match(await page.locator('.pe-feedback').textContent(),/맞았어요/);await pe('next').click();await pe('prev').click();assert.equal((await page.locator('.pe-word').textContent()).trim(),first.word);
  });
  await run('logout-resets-workspace',{count:5},async({page,pe,assigned,shot})=>{
   await assigned();await pe('start').click();await page.locator('#practice-view [data-pe="stage"][data-stage="spell"]').click();await page.locator('#pe-answer').fill('synthetic-unsubmitted');
   await page.evaluate(()=>logout());await page.locator('#login-screen').waitFor({state:'visible'});assert.equal(await page.locator('#pe-answer').count(),0);
   await page.locator('#login-id').fill('SYNTHETIC_NEXT');await page.locator('#login-pw').fill('SYNTHETIC_PASSWORD');await page.locator('#login-screen button[onclick="checkLogin()"]').click();
   await page.waitForFunction(()=>!!currentUser?.token);await page.evaluate(()=>showTab('home'));await assigned();await pe('start').click();await page.locator('#practice-view [data-pe="stage"][data-stage="spell"]').click();assert.equal(await page.locator('#pe-answer').inputValue(),'');assert.equal(await page.evaluate(()=>assignedPracticeState.experience.drafts.size),0);await shot('new-login-clean-workspace');
  });
  for(const count of [201,401])await run('assigned-full-scope-'+count,{count},async({page,pe,assigned,calls,shot})=>{
   await assigned();const requests=calls.filter(item=>item.action==='getAssignedVocaPracticeQuestions');
   assert.deepEqual(requests.map(item=>item.offset),Array.from({length:Math.ceil(count/200)},(_,i)=>i*200));
   assert.ok(requests.every((item,i)=>item.coverage==='ALL'&&item.limit===200&&item.randomize==='false'&&item.hasScopeVersion===(i>0)));
   assert.equal(await page.evaluate(()=>assignedPracticeState.sourceRows.length),count);assert.equal(await page.evaluate(()=>assignedPracticeState.totalCount),count);
   const ids=[];for(let batch=0;batch<Math.ceil(count/200);batch++){
    ids.push(...await page.evaluate(()=>assignedPracticeState.rows.map(row=>row[7])));
    if(batch+1<Math.ceil(count/200))await page.getByRole('button',{name:'다음 묶음 →',exact:true}).click();
   }
   assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);assert.deepEqual([...ids].sort(),corpus(count).map(row=>row.vocabWordId).sort());
   assert.equal(await page.getByRole('button',{name:'다음 묶음 →',exact:true}).isDisabled(),true);await shot('assigned-full-scope-'+count+'-last-batch');
  });
  for(const [apiScenario,message] of [['legacy',/전체 시험범위 연습 API가 아직 업데이트/],['metadata',/문항 수나 페이지 정보/],['mutation',/시험범위가 변경/],['totalMutation',/시험범위가 변경/],['duplicate',/문항이 중복/],['pageGap',/페이지가 누락되었거나 중복/]])await run('reject-'+apiScenario,{count:401,apiScenario},async({page,assigned})=>{
   await assigned(message);assert.equal(await page.locator('.practice-experience').count(),0);assert.equal(await page.evaluate(()=>assignedPracticeState),null,'partial or mixed scope cannot become a usable practice state');
  });
  await run('admin-205-batch-preservation',{role:'admin',count:205},async({page,pe,publicScope,shot})=>{
   await publicScope();assert.match(await page.locator('.pe-aside').textContent(),/미리보기/);await pe('start').click();await page.locator('#practice-view [data-pe="stage"][data-stage="spell"]').click();await page.locator('#pe-answer').fill('saved-batch-draft');
   await page.getByRole('button',{name:'다음 묶음 →',exact:true}).click();assert.match(await page.locator('.practice-experience').textContent(),/201–205번째/);assert.equal(await page.evaluate(()=>assignedPracticeState.rows.length),5);await shot('admin-205-second-batch');
   await page.getByRole('button',{name:'← 이전 묶음',exact:true}).click();if(await pe('start').count())await pe('start').click();assert.equal(await page.locator('#pe-answer').inputValue(),'saved-batch-draft');
   await pe('overview').click();await pe('mock').click();await page.locator('#practice-answer-0').fill(await page.evaluate(()=>currentVocabWords[0][2]));await page.getByRole('button',{name:'채점하기',exact:true}).click();await page.locator('#practice-result').waitFor();await shot('admin-official-write-free-mock');
  });
 }finally{await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
 console.log(JSON.stringify({report:path.join(out,'results.json'),engine,passed:report.cases.filter(c=>c.passed).length,total:report.cases.length,officialWrites:report.officialWrites}));
}
