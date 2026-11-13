// Real browser engines, synthetic-only student/API. Never call real Student API.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

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
  if(action==='getAssignedVocaPracticeQuestions')
    return {success:true,planDate:new Date().toISOString().slice(0,10),questions:asQuestions()};
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
  logs.push({action:p.action||'',method:req.method(),planId:p.testPlanId||'',token:p.token||''});
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
  try {
    await page.goto(base,{waitUntil:'domcontentloaded'});
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
    await page.locator('#practice-view button').filter({hasText:'뜻 확인하기'}).click();
    assert.match(await page.locator('#practice-view .practice-reveal').innerText(),/불가피한/);
    await page.locator('#practice-view button').filter({hasText:'다시 보기'}).click();
    assert.ok((await page.locator('#practice-view').innerText()).includes('남은 시도'));

    // Recall uses four choices from the assigned scope; no official writes.
    await page.locator('#practice-view .practice-mode').filter({hasText:'리콜'}).click();
    assert.equal(await page.locator('#practice-view .practice-choice').count(),4);
    const options=await page.locator('#practice-view .practice-choice').allTextContents();
    assert.equal(new Set(options).size,4);
    await page.locator('#practice-view .practice-choice').filter({hasText:'inevitable'}).click();
    assert.match(await page.locator('#practice-view .practice-feedback').innerText(),/정답입니다/);

    // Spelling can make a mistake, then retry without saving to official records.
    await page.locator('#practice-view .practice-mode').filter({hasText:'스펠링'}).click();
    await page.locator('#practice-spell-input').fill('bad-spelling');
    await page.locator('#practice-view button').filter({hasText:'정답 확인'}).click();
    assert.match(await page.locator('#practice-view .practice-feedback').innerText(),/inevitable/);
    await page.locator('#practice-view button').filter({hasText:'다음 단어'}).click();

    // Typed draft is not erased by accidentally changing modes.
    await page.locator('#practice-spell-input').fill('inev');
    page.once('dialog',dialog=>dialog.dismiss());
    await page.locator('#practice-view .practice-mode').filter({hasText:'실전 TEST'}).click();
    assert.equal(await page.locator('#practice-spell-input').inputValue(),'inev');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#practice-view .practice-mode').filter({hasText:'실전 TEST'}).click();

    await page.locator('#practice-answer-0').fill('inevitable');
    assert.equal(await page.locator('#practice-answer-0').inputValue(),'inevitable');
    assert.match(await page.locator('#practice-view').innerText(),/스펠링 중심 사전 연습이며 실제 시험의 문항 유형·수·순서는 다를 수 있습니다/);
    await page.locator('#practice-view button').filter({hasText:'채점하기'}).click();
    assert.match(await page.locator('#practice-result').innerText(),/1개 정답/);
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
  try {
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.locator('#home-learning-content .home-task-warning').waitFor({timeout:20000});
    assert.equal(await page.locator('#home-learning-content button[data-test-plan-id]').count(),0);
    assert.equal(logs.filter(x=>x.action==='getAssignedVocaPracticeQuestions').length,0);
    console.log('BROWSER PASS: duplicate plan fails closed, no private practice started');
  } finally { await context.close(); }
}
const mode=process.argv[2]||'chromium';
if(!['chromium','webkit'].includes(mode))throw Error('Usage: node browser-tests/assigned-practice.browser.mjs chromium|webkit');
const browserEngine=mode==='webkit'?webkit:chromium;
const base=await listen();
let browser;
try {
  browser=await browserEngine.launch({headless:true});
  const sizes=mode==='webkit'?[{width:390,height:844}]:[{width:320,height:740},{width:390,height:844},{width:1365,height:850}];
  for(const size of sizes)await testViewport(browser,mode+'-'+size.width,size,size.width<600,base);
  await testUncertainScope(browser,base);
  console.log('ALL BROWSER SMOKE TESTS PASSED ('+mode+', synthetic API only).');
} finally {
  if(browser)await browser.close();
  await close();
}
