// Scenario review only. Synthetic account and API; no real user interview or operational writes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin='https://mobile-review.invalid';
const errors=[],actions=[],observations=[];
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : fs.existsSync('/usr/bin/chromium') ? {executablePath:'/usr/bin/chromium'} : {})});
try {
 const context=await browser.newContext({viewport:{width:320,height:580},isMobile:true,hasTouch:true,locale:'ko-KR'});
 await context.addInitScript(()=>localStorage.setItem('allbarun-user',JSON.stringify({id:'SYNTHETIC_MOBILE',name:'가상 학생',role:'student',token:'SYNTHETIC_ONLY'})));
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===origin){
   const target=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
   if(!target.startsWith(root+path.sep))return route.abort();
   try{const body=await readFile(target);return route.fulfill({status:200,contentType:target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':target.endsWith('.png')?'image/png':'text/html',body});}catch{return route.fulfill({status:404,body:''});}
  }
  if(url.hostname==='script.google.com'||url.hostname==='script.googleusercontent.com'){
   const action=url.searchParams.get('action');actions.push(action);
   const data=action==='getStudentContent'?{success:true,home:{},notices:[],homeNotices:[]}:action==='getFavoriteState'?{success:true,folders:{기본:[]}}:action==='getMyLearningSchedule'?{success:true,days:[],visibleDays:[]}:action==='getMyPointSummary'?{success:true,totalPoints:0}: {success:true,rows:[]};
   return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
  }
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!currentUser?.token);
 await page.evaluate(()=>startPublicVocaPractice({revisionId:'SYNTHETIC_REV',label:'테스트 Day 1',words:[
  {vocabWordId:'W1',word:'apple',meaning:'사과'},
  {vocabWordId:'W2',word:'banana',meaning:'바나나'},
  {vocabWordId:'W3',word:'orange',meaning:'오렌지'},
  {vocabWordId:'W4',word:'grape',meaning:'포도'}]}));
 await page.getByRole('button',{name:'스펠링',exact:true}).click();
 const input=page.locator('#practice-spell-input');
 observations.push({scenario:'spelling-mode-entry',...await page.evaluate(()=>({active:document.activeElement?.id||document.activeElement?.tagName,inputVisible:!!document.getElementById('practice-spell-input'),horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1}))});
 await input.fill('apple');await input.press('Enter');
 observations.push({scenario:'spelling-submit',...await page.evaluate(()=>({active:document.activeElement?.id||document.activeElement?.tagName,feedback:document.querySelector('.practice-feedback')?.textContent}))});
 await page.getByRole('button',{name:'다음 단어',exact:true}).click();
 observations.push({scenario:'spelling-next',...await page.evaluate(()=>({active:document.activeElement?.id||document.activeElement?.tagName,prompt:document.querySelector('.practice-prompt')?.textContent,inputTop:document.getElementById('practice-spell-input')?.getBoundingClientRect().top,viewport:innerHeight}))});
 await page.keyboard.press('Tab');
 observations.push({scenario:'keyboard-tab-after-next',...await page.evaluate(()=>({active:document.activeElement?.id||document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent}))});
 await page.getByRole('button',{name:'암기 카드',exact:true}).click();
 await page.getByRole('button',{name:'뜻 확인하기',exact:true}).click();
 observations.push({scenario:'card-reveal',...await page.evaluate(()=>({active:document.activeElement?.id||document.activeElement?.tagName,revealLive:document.querySelector('.practice-reveal')?.getAttribute('aria-live'),revealRole:document.querySelector('.practice-reveal')?.getAttribute('role'),modeSelection:document.querySelector('.practice-mode.active')?.getAttribute('aria-pressed'),visibleActions:[...document.querySelectorAll('.practice-actions button')].map(b=>({label:b.textContent,top:b.getBoundingClientRect().top,bottom:b.getBoundingClientRect().bottom,height:b.getBoundingClientRect().height})),viewport:innerHeight}))});
 await page.getByRole('button',{name:'뜻 다시 가리기',exact:true}).click();
 observations.push({scenario:'card-hide',...await page.evaluate(()=>({active:document.activeElement?.id||document.activeElement?.tagName,revealCount:document.querySelectorAll('.practice-reveal').length}))});
 for(let i=0;i<4;i++){
  await page.getByRole('button',{name:'뜻 확인하기',exact:true}).click();
  await page.getByRole('button',{name:'기억했어요',exact:true}).click();
  if(i===0)observations.push({scenario:'card-next',...await page.evaluate(()=>({active:document.activeElement?.id||document.activeElement?.tagName,prompt:document.querySelector('.practice-prompt')?.textContent}))});
 }
 observations.push({scenario:'study-finish',...await page.evaluate(()=>({active:document.activeElement?.id||document.activeElement?.tagName,title:document.querySelector('.practice-finished h3')?.textContent}))});
 assert.deepEqual(errors,[]);
 assert.equal(actions.some(a=>['saveVocabResult','submitPointTest','saveFavoriteState'].includes(a)),false);
 console.log(JSON.stringify({type:'synthetic-mobile-review',observations,errors,officialWrites:0},null,2));
 // Regression expectation: after advancing spelling, the next answer box owns keyboard focus.
 const scenario=name=>observations.find(o=>o.scenario===name);
 assert.equal(scenario('spelling-mode-entry').active,'practice-spell-input','Entering spelling must focus its answer box.');
 assert.equal(scenario('spelling-submit').active,'practice-next-button','Spelling feedback must retain an actionable keyboard focus.');
 assert.equal(scenario('spelling-next').active,'practice-spell-input','Advancing a spelling card must focus the next answer box instead of dropping focus to BODY.');
 assert.equal(scenario('keyboard-tab-after-next').label,'정답 확인','Tab from the answer box must advance to its submit action.');
 assert.equal(scenario('card-reveal').active,'practice-hide-button','Revealing a card must retain focus at its reversible reveal action.');
 assert.equal(scenario('card-reveal').revealLive,'polite','Newly revealed meanings need a live announcement.');
 assert.equal(scenario('card-reveal').revealRole,'status');
 assert.equal(scenario('card-reveal').modeSelection,'true','Assistive technology must identify the selected learning mode.');
 assert.equal(scenario('card-hide').active,'practice-reveal-button');
 assert.equal(scenario('card-hide').revealCount,0);
 assert.equal(scenario('card-next').active,'practice-reveal-button');
 assert.equal(scenario('card-next').prompt,'banana');
 assert.equal(scenario('study-finish').active,'practice-finished-heading');
 assert.equal(scenario('study-finish').title,'이번 연습 완료');
} finally {await browser.close();}
