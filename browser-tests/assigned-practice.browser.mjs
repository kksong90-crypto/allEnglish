// Legacy fallback only: deliberately fail the new experience module request.
// Real browser engines, synthetic-only student/API. Never call real Student API.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const legacyFallback=process.env.PRACTICE_LEGACY_FALLBACK==='1';
if(!legacyFallback)throw Error('Legacy selector suite: set PRACTICE_LEGACY_FALLBACK=1 to test the explicitly unavailable-module fallback; use practice-experience.browser.mjs for the main UI.');
console.log('LEGACY FALLBACK TEST: practice-experience.js is deliberately blocked; this does not verify the main experience UI.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const artifacts=path.join(root,'browser-tests','artifacts');
const words=[
  ['inevitable','불가피한'],
  ['evaluate','평가하다'],
  ['maintain','유지하다'],
  ['scarce','부족한'],
  ['justify','정당화하다'],
];
const asQuestions=()=>words.map(([en,ko],i)=>({
  questionNo:i+1,prompt:ko,acceptedAnswers:[en],
  sourceLabel:'Day 12',bookId:'SYNTHETIC_BOOK',vocabWordId:'SYNTH_W'+(i+1)
}));
const logs=[];
let mockScenario='connected';
let slowResolve=null;
let legacyEnabled=false;
const publicBooks=[
 {revisionId:'PUB_TEXT',displayName:'고1 동아(윤)',categoryCode:'TEXTBOOK',publisher:'동아',sections:[{sectionId:'L3',label:'3과',wordCount:5}]},
 {revisionId:'PUB_MOCK',displayName:'고2 전국연합',categoryCode:'MOCK_EXAM',publicationYear:2026,publicationMonth:10,sections:[{sectionId:'Q18',label:'18번',wordCount:5}]},
 {revisionId:'PUB_BOOK',displayName:'시중 어휘',categoryCode:'WORD_BOOK',sections:[{sectionId:'D1',label:'Day 1',wordCount:5}]}
];
const publicWords=book=>words.map(([word,meaning],i)=>({vocabWordId:book.revisionId+'_W'+i,revisionId:book.revisionId,bookId:book.revisionId,sectionId:book.sections[0].sectionId,displayName:book.displayName,sectionLabel:book.sections[0].label,word,meaning,allowedAnswers:[word]}));
const server=createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    const base=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!base.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const bytes=await readFile(base);
    const ext=path.extname(base).toLowerCase();
    const contentType=ext==='.js'?'application/javascript':ext==='.css'?'text/css':ext==='.png'?'image/png':ext==='.json'?'application/json':'text/html; charset=utf-8';
    res.writeHead(200,{'Content-Type':contentType,'Cache-Control':'no-store'});res.end(bytes);
  } catch {res.writeHead(404);res.end('not found');}
});
const listen=()=>new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port+'/'));
});
const close=()=>new Promise(resolve=>server.close(resolve));

function responseFor(action,p){
  if(action==='getVocaCatalog')return {success:true,books:publicBooks};
  if(action==='getVocaSection'){const book=publicBooks.find(b=>b.revisionId===p.revisionId);return {success:true,revisionId:book.revisionId,words:publicWords(book)};}
  if(action==='searchVoca'){const result=publicBooks.filter(b=>!p.revisionId||b.revisionId===p.revisionId).flatMap(publicWords).filter(w=>(w.word+' '+w.meaning).includes(p.query));return {success:true,count:result.length,truncated:false,words:result};}
  if(action==='getVocabData'&&legacyEnabled)return {success:true,values:[['단어장명','Day','영어','뜻','정렬번호','book_id','허용답'],...words.map(([word,meaning],i)=>['기존 단어장',1,word,meaning,i,'B',word])]};
  if(action==='getMyVocabPreparation')return {success:false,code:'UNSUPPORTED_ACTION'};
  if(action==='getMyLearningSchedule'){
    const day=p.fromDate||new Date().toISOString().slice(0,10);
    const scope={
      testPlanId:'SYNTHETIC_PLAN',vocaScopeState:mockScenario==='duplicate'?'DUPLICATE':'CONNECTED',
      sourceRanges:[{bookId:'SYNTHETIC_BOOK',sectionId:'DAY_12'}],
      displayText:'해커스보카 수능완성 Day 12',regularText:'Day 12',
      bookName:'해커스보카 수능완성'
    };
    const lesson={date:day,displayDate:day,className:'가상 반',hasPlan:true,scheduled:true,
      vocab:mockScenario==='missing'?[]:[scope],
      listening:null,quiz:{scope:''},homework:{text:'',public:true}};
    return {success:true,range:p.range||'upcoming',today:day,
      days:[lesson],visibleDays:[lesson],nextPlan:lesson,startDate:day,endDate:day};
  }
  if(action==='getAssignedVocaPracticeQuestions'){
    const offset=Number(p.offset||0),questions=asQuestions().slice(offset,offset+200);
    return {success:true,testPlanId:'SYNTHETIC_PLAN',mode:'MEANING_TO_WORD',coverage:'ALL',scopeVersion:'SYNTHETIC_SCOPE_V1',offset,count:questions.length,totalCount:words.length,nextOffset:null,planDate:new Date().toISOString().slice(0,10),questions};
  }
  if(action==='getStudentContent')
    return {success:true,home:{heroTitle:'All바른 가상 학생 학습'},notices:[],homeNotices:[]};
  if(action==='getFavoriteState')
    return {success:true,folders:{'기본':[]}};
  if(action==='getMyPointSummary')
    return {success:true,totalPoints:0,canTake:false};
  if(action==='getRetestList')
    return {success:true,rows:[]};
  if(action==='getVocabData')
    return {success:false,message:'Whole catalog must not be loaded for direct practice'};
  return {success:false,message:'MOCK_ACTION_NOT_SUPPORTED'};
}
const routeMock=async route=>{
  const req=route.request();
  const url=new URL(req.url());
  const params=new URLSearchParams(req.method()==='POST'?(req.postData()||''):url.search.slice(1));
  const p=Object.fromEntries(params);
  logs.push({action:p.action||'',method:req.method(),planId:p.testPlanId||'',token:p.token||'',view:p.view||'',valuesOnly:p.valuesOnly||''});
  if(url.hostname==='script.google.com'||url.hostname==='script.googleusercontent.com'){
    const body=responseFor(p.action,p);
    await route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS'},
      body:JSON.stringify(body)});
  } else await route.abort('blockedbyclient');
};
function syntheticScript(){
  try {
    localStorage.setItem('allbarun-user',JSON.stringify({
      id:'STUDENT_BROWSER_FAKE',name:'가상 학생',className:'가상 반',
      role:'student',token:'SYNTHETIC_AUTH_TOKEN'
    }));
  } catch {}
}
async function testViewport(browser,name,viewport,isMobile,base){
  mockScenario='connected';logs.length=0;
  const context=await browser.newContext({viewport,isMobile,hasTouch:isMobile,deviceScaleFactor:isMobile?2:1,
    locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await context.addInitScript(syntheticScript);
  const page=await context.newPage();
  const unexpected=[];
  page.on('pageerror',err=>unexpected.push(String(err)));
  // Playwright runs the last matching handler first; specific mock routes must win.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort('blockedbyclient'));
  await page.route('https://script.google.com/**',routeMock);
  await page.route('https://script.googleusercontent.com/**',routeMock);
  if(legacyFallback)await page.route('**/practice-experience.js*',route=>route.abort('failed'));
  try {
    await page.goto(base,{waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(()=>typeof window.PracticeExperience),'undefined','legacy test must exercise the unavailable-module fallback');
    await page.locator('#home-learning-content button[data-test-plan-id="SYNTHETIC_PLAN"]')
      .waitFor({state:'visible',timeout:20000});
    assert.equal(await page.locator('#home-learning-content button[data-test-plan-id]').count(),1,
      name+' home has one confirmed practice CTA');
    await page.locator('#home-learning-content button[data-test-plan-id]').click();
    await page.locator('#practice-view .practice-mode').first().waitFor();
    assert.equal(await page.locator('#practice-view .practice-mode').count(),4);
    assert.equal(await page.locator('.bottom-nav').evaluate(el=>getComputedStyle(el).display),'none',
      name+' focused practice must hide the redundant bottom navigation');
    assert.equal(await page.locator('.top-user-bar').evaluate(el=>getComputedStyle(el).display),'none',
      name+' focused practice must hide account buttons while typing');
    assert.equal(logs.filter(x=>x.action==='getVocabData').length,0,
      name+' practice must not load whole vocabulary table');
    const widths=await page.locator('#practice-view .practice-mode').evaluateAll(elements=>
      elements.map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})));
    assert.ok(widths.every(x=>x.w>=48&&x.h>=40),name+' tap target size '+JSON.stringify(widths));
    const overflow=await page.locator('#practice-view').evaluate(el=>el.scrollWidth-el.clientWidth);
    assert.ok(overflow<6,name+' practice panel horizontal overflow '+overflow);

    // Flashcard shows answer only after the explicit reveal action.
    await page.locator('#practice-view .practice-mode').filter({hasText:'암기 카드'}).click();
    assert.equal(await page.locator('#practice-view .practice-reveal').count(),0);
    const firstCardWord=await page.locator('#practice-view .practice-prompt').innerText();
    await page.locator('#practice-view button').filter({hasText:'뜻 확인하기'}).click();
    assert.equal(await page.locator('#practice-view .practice-reveal').innerText(),words.find(([word])=>word===firstCardWord)[1]);
    await page.locator('#practice-view button').filter({hasText:'다시 보기'}).click();
    assert.ok((await page.locator('#practice-view').innerText()).includes('남은 시도'));

    // Recall uses four choices from the assigned scope; no official writes.
    await page.locator('#practice-view .practice-mode').filter({hasText:'리콜'}).click();
    assert.equal(await page.locator('#practice-view .practice-choice').count(),4);
    const options=await page.locator('#practice-view .practice-choice').allTextContents();
    assert.equal(new Set(options).size,4);
    const recallWord=await page.evaluate(()=>assignedPracticeState.rows[assignedPracticeCurrentIndex()][2]);
    await page.getByRole('button',{name:recallWord,exact:true}).click();
    assert.match(await page.locator('#practice-view .practice-feedback').innerText(),/정답입니다/);

    // Spelling can make a mistake, then retry without saving to official records.
    await page.locator('#practice-view .practice-mode').filter({hasText:'스펠링'}).click();
    const spellingWord=await page.evaluate(()=>assignedPracticeState.rows[assignedPracticeCurrentIndex()][2]);
    await page.locator('#practice-spell-input').fill('bad-spelling');
    await page.locator('#practice-view button').filter({hasText:'정답 확인'}).click();
    assert.ok((await page.locator('#practice-view .practice-feedback').innerText()).includes(spellingWord));
    await page.locator('#practice-view button').filter({hasText:'다음 단어'}).click();

    // Holding Enter cannot accept feedback through a newly focused Next button.
    const completedBefore = await page.evaluate(()=>assignedPracticeState.study.completed);
    const heldWord = await page.evaluate(()=>assignedPracticeState.rows[assignedPracticeCurrentIndex()][2]);
    await page.locator('#practice-spell-input').fill(heldWord);
    const imePrevented = await page.locator('#practice-spell-input').evaluate(input=>{
      const event=new KeyboardEvent('keydown',{key:'Enter',repeat:true,isComposing:true,bubbles:true,cancelable:true});
      input.dispatchEvent(event);return event.defaultPrevented;
    });
    assert.equal(imePrevented,false);
    assert.equal(await page.evaluate(()=>assignedPracticeState.study.feedback),null,'IME must not submit early');
    const repeatedPrevented = await page.locator('#practice-spell-input').evaluate(input=>{
      const event=new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true});
      input.dispatchEvent(event);return event.defaultPrevented;
    });
    assert.equal(repeatedPrevented,true);
    assert.equal(await page.evaluate(()=>assignedPracticeState.study.feedback),null,'repeated Enter must not reach inline submit');
    await page.keyboard.down('Enter');
    assert.equal(await page.locator('#practice-next-button').evaluate(el=>el===document.activeElement),true);
    await page.waitForTimeout(50);
    await page.keyboard.down('Enter');await page.keyboard.up('Enter');
    assert.equal(await page.evaluate(()=>assignedPracticeState.study.completed),completedBefore);
    assert.notEqual(await page.evaluate(()=>assignedPracticeState.study.feedback),null);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>assignedPracticeState.study.completed),completedBefore+1);

    // Typed draft is not erased by accidentally changing modes.
    await page.locator('#practice-spell-input').fill('inev');
    page.once('dialog',dialog=>dialog.dismiss());
    await page.locator('#practice-view .practice-mode').filter({hasText:'실전 TEST'}).click();
    assert.equal(await page.locator('#practice-spell-input').inputValue(),'inev');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#practice-view .practice-mode').filter({hasText:'실전 TEST'}).click();

    const mockWord=await page.evaluate(()=>currentVocabWords[0][2]);
    await page.locator('#practice-answer-0').fill(mockWord);
    assert.equal(await page.locator('#practice-answer-0').inputValue(),mockWord);
    assert.match(await page.locator('#practice-view').innerText(),/스펠링 중심 사전 연습이며 실제 시험의 문항 유형·수·순서는 다를 수 있습니다/);
    await page.locator('#practice-view button').filter({hasText:'채점하기'}).click();
    assert.match(await page.locator('#practice-result').innerText(),/1개 정답/);
    assert.equal(logs.filter(x=>['saveVocabResult','submitPointTest'].includes(x.action)).length,0);

    // Station-style spelling must not accept letters separated by spaces.
    await page.locator('#practice-result button').filter({hasText:'이 범위 다시 연습하기'}).click();
    await page.locator('#practice-view .practice-mode').filter({hasText:'실전 TEST'}).click();
    const strictMockWord=await page.evaluate(()=>currentVocabWords[0][2]);
    await page.locator('#practice-answer-0').fill(strictMockWord.split('').join(' '));
    await page.locator('#practice-view button').filter({hasText:'채점하기'}).click();
    assert.match(await page.locator('#practice-result').innerText(),/0개 정답/);
    assert.equal(logs.filter(x=>['saveVocabResult','submitPointTest'].includes(x.action)).length,0);

    // Capture only synthetic practice content for UI inspection.
    if(process.env.CI){
      await mkdir(artifacts,{recursive:true});
      await page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:true});
    }

    // Page view change is safe after completed private practice.
    await page.evaluate(()=>showTab('home'));
    assert.equal(await page.locator('section#home.active').count(),1);
    if(isMobile) assert.notEqual(await page.locator('.bottom-nav').evaluate(el=>getComputedStyle(el).display),'none',
      name+' bottom navigation must return after leaving focused practice');
    assert.ok(!unexpected.length,name+' uncaught exceptions: '+unexpected.join('; '));
    console.log('BROWSER PASS: '+name+' '+viewport.width+'x'+viewport.height+
      '; 4 modes, immediate correction, draft protection, official writes 0.');
  } finally {
    await context.close();
  }
}
async function testUncertainScope(browser,base){
  mockScenario='duplicate';logs.length=0;
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul'});
  await context.addInitScript(syntheticScript);
  const page=await context.newPage();
  // Playwright runs the last matching handler first; specific mock routes must win.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort('blockedbyclient'));
  await page.route('https://script.google.com/**',routeMock);
  await page.route('https://script.googleusercontent.com/**',routeMock);
  if(legacyFallback)await page.route('**/practice-experience.js*',route=>route.abort('failed'));
  try {
    await page.goto(base,{waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(()=>typeof window.PracticeExperience),'undefined','legacy test must exercise the unavailable-module fallback');
    await page.locator('#home-learning-content .home-task-warning').waitFor({timeout:20000});
    assert.equal(await page.locator('#home-learning-content button[data-test-plan-id]').count(),0);
    assert.equal(logs.filter(x=>x.action==='getAssignedVocaPracticeQuestions').length,0);
    console.log('BROWSER PASS: duplicate plan fails closed, no private practice started');
  } finally { await context.close(); }
}
async function testLibrary(browser,role,viewport,base){
  logs.length=0;legacyEnabled=false;
  const context=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  await context.addInitScript(({role})=>localStorage.setItem('allbarun-user',JSON.stringify({id:'FAKE_'+role,name:'가상 계정',role,token:'SYNTHETIC_AUTH_TOKEN'})),{role});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort('blockedbyclient'));
  await page.route('https://script.google.com/**',routeMock);
  await page.route('https://script.googleusercontent.com/**',routeMock);
  if(legacyFallback)await page.route('**/practice-experience.js*',route=>route.abort('failed'));
  try{
    await page.goto(base+(role==='admin'?'?vocabSpeed=1':''),{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!currentUser?.token);
    await page.evaluate(()=>showTab('vocab'));
    if(!await page.locator('#station-library').evaluate(el=>el.open))await page.locator('#station-library > summary').click();
    await page.locator('#station-library-book option[value="PUB_TEXT"]').waitFor({state:'attached'});
    assert.ok(logs.filter(p=>p.action==='getVocabData').every(p=>p.view==='CATALOG'&&p.valuesOnly==='Y'),'default assigned library may read catalog metadata, never word bodies');
    await page.locator('#station-library-category').selectOption('MOCK_EXAM');
    await page.locator('#station-library-query').fill('고2 10월');
    assert.equal(await page.locator('#station-library-book option').count(),2);
    await page.locator('#station-library-book').selectOption('PUB_MOCK');
    await page.locator('#station-library-scope').selectOption('0');
    await page.getByText('evaluate — 평가하다',{exact:false}).first().waitFor();
    const bodies=logs.filter(p=>p.action==='getVocaSection').length;
    await page.locator('#station-library-word-scope').selectOption('section');
    await page.locator('#station-library-word-query').fill('평가');
    await page.locator('#station-library-word-search').click();
    await page.locator('#station-library-search-result').getByText('검색 결과 1개').waitFor();
    assert.equal(logs.filter(p=>p.action==='searchVoca').length,0);
    await page.locator('#station-library-word-scope').selectOption('all');
    await page.locator('#station-library-word-search').click();
    await page.locator('#station-library-search-result').getByText('검색 결과 3개').waitFor();
    await page.locator('#station-library-word-search').click();
    await page.locator('#station-library-search-result').getByText('검색 결과 3개').waitFor();
    assert.equal(logs.filter(p=>p.action==='searchVoca').length,1,'repeat search must use login-scoped cache');
    await page.locator('#station-library-words button').click();
    await page.locator('#practice-view').getByRole('button',{name:'암기 카드',exact:true}).click();
    const firstPublicCard=await page.locator('.practice-prompt').textContent();
    await page.getByRole('button',{name:'뜻 확인하기',exact:true}).click();
    if(process.env.CI){await mkdir(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,'card-'+role+'-'+viewport.width+'.png'),fullPage:true});}
    await page.getByRole('button',{name:'뜻 다시 가리기',exact:true}).click();
    assert.equal(await page.locator('.practice-reveal').count(),0);
    await page.getByRole('button',{name:'뜻 확인하기',exact:true}).click();
    await page.getByRole('button',{name:'기억했어요',exact:true}).click();
    await page.getByRole('button',{name:'← 이전 단어',exact:true}).click();
    assert.equal(await page.locator('.practice-prompt').textContent(),firstPublicCard);
    await page.locator('#app-back-button').click();
    await page.getByRole('button',{name:'선택한 단어장으로 돌아가기',exact:true}).click();
    assert.equal(await page.locator('#station-library-book').inputValue(),'PUB_MOCK');
    assert.equal(await page.locator('#station-library-scope').inputValue(),'0');
    assert.equal(logs.filter(p=>p.action==='getVocaSection').length,bodies);
    assert.equal(logs.filter(p=>p.action==='getVocabData'&&p.view!=='CATALOG').length,0);
    if(role==='admin'){
      legacyEnabled=true;
      assert.equal(await page.locator('#legacy-vocab-library').evaluate(el=>el.open),true);
      await page.locator('#vocab-view').getByRole('button',{name:'다시 불러오기',exact:true}).click();
      await page.locator('#vocab-book-select option[value="기존 단어장"]').waitFor({state:'attached'});
      await page.locator('#vocab-book-select').selectOption('기존 단어장');
      await page.locator('#vocab-day-select').selectOption('1');
      await page.getByRole('button',{name:'뜻 확인 카드',exact:true}).click();
      await page.locator('#vocab-view').getByRole('button',{name:'뜻 보기',exact:true}).first().click();
      await page.locator('#vocab-view').getByRole('button',{name:'뜻 가리기',exact:true}).first().click();
      await page.locator('#app-back-button').click();
      await page.getByRole('button',{name:'혼자 카드·리콜·스펠링 연습',exact:true}).waitFor();
      assert.equal(await page.locator('#vocab-book-select').inputValue(),'기존 단어장');
      assert.equal(await page.locator('#vocab-day-select').inputValue(),'1');
    }
    if(role==='admin'){
      const output=page.locator('#station-library > details pre');await output.waitFor({state:'attached'});
      const timing=JSON.parse(await output.textContent());
      assert.equal(timing.schema,'VOCAB_SPEED_V1');assert.ok(timing.results.some(r=>r.action==='scope'));
      assert.doesNotMatch(JSON.stringify(timing),/SYNTHETIC_AUTH|PUB_MOCK|evaluate|평가|token|revisionId/);
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    if(overflow)console.log(JSON.stringify({overflowReview:role,width:viewport.width,offenders:await page.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,id:el.id,classes:el.className,left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right),width:Math.round(el.getBoundingClientRect().width)})).filter(el=>el.width>0&&(el.right>innerWidth+1||el.left< -1)).slice(-30))}));
    assert.equal(overflow,false,'library must fit mobile viewport');
    assert.equal(logs.filter(p=>['saveVocabResult','submitPointTest','saveFavoriteState'].includes(p.action)).length,0);
    assert.deepEqual(errors,[]);
    if(process.env.CI){await mkdir(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,'library-'+role+'-'+viewport.width+'.png'),fullPage:true});}
    console.log('BROWSER PASS: '+role+' library '+viewport.width+'px; categories, bounded search/cache, cards/back/source, official writes 0.');
  }finally{legacyEnabled=false;await context.close();}
}
const mode=process.argv[2]||'chromium';
if(!['chromium','webkit'].includes(mode))throw Error('Usage: node browser-tests/assigned-practice.browser.mjs chromium|webkit');
const browserEngine=mode==='webkit'?webkit:chromium;
const base=await listen();
let browser;
try {
  browser=await browserEngine.launch({headless:true, ...(mode==='chromium' && process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {})});
  const sizes=mode==='webkit'?[{width:390,height:844}]:[{width:320,height:740},{width:390,height:844},{width:1365,height:850}];
  for(const size of sizes)await testViewport(browser,mode+'-'+size.width,size,size.width<600,base);
  await testUncertainScope(browser,base);
  for(const role of ['student','admin'])for(const width of [320,390,1365])await testLibrary(browser,role,{width,height:844},base);
  console.log('ALL LEGACY FALLBACK BROWSER TESTS PASSED ('+mode+', synthetic API only).');
} finally {
  if(browser)await browser.close();
  await close();
}
