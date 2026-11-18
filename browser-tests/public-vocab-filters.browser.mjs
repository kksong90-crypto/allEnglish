// Actual public-library JS; synthetic metadata only. The opt-in snippet fixture supports isolated review before index integration.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),origin='https://public-filters.invalid';
const engine=process.argv[2]||'chromium';assert.ok(['chromium','webkit'].includes(engine));
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
const controls=[['school-level','학교급'],['grade','학년'],['publisher','출판사']].map(([id,label])=>`<div><label class="field-label" for="station-library-${id}">${label}</label><select id="station-library-${id}"><option value="">전체</option></select></div>`).join('');
const catalog=[
 {revisionId:'M1',displayName:'중1 교과서',schoolLevel:'중학교',gradeNo:1,publisher:'동아'},
 {revisionId:'M2',displayName:'중2 교과서',schoolLevel:'중학교',gradeNo:2,publisher:'비상'},
 {revisionId:'H1',displayName:'고1 교과서',schoolLevel:'고등학교',gradeNo:1,publisher:'동아'},
 {revisionId:'UNKNOWN',displayName:'중학교 2 동아 분류 미입력'}
].map(book=>({...book,categoryCode:'TEXTBOOK',sections:[]}));
try{for(const role of ['student','admin']){
 const context=await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true,locale:'ko-KR'}),reads=[],wordReads=[];
 await context.addInitScript(role=>localStorage.setItem('allbarun-user',JSON.stringify({token:'SYNTHETIC',id:'SYNTHETIC',role})),role);
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin){try{let body=await readFile(path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1)));if(url.pathname==='/'&&process.env.PUBLIC_LIBRARY_CONTROLS_FIXTURE==='1'&&!body.toString().includes('id="station-library-school-level"'))body=Buffer.from(body.toString().replace('<div><label class="field-label" for="station-library-book">',controls+'<div><label class="field-label" for="station-library-book">'));return route.fulfill({status:200,body,contentType:url.pathname.endsWith('.js')?'application/javascript':url.pathname.endsWith('.css')?'text/css':'text/html; charset=utf-8'});}catch{return route.fulfill({status:404,body:''});}}
  if(!['script.google.com','script.googleusercontent.com'].includes(url.hostname))return route.abort();
  const p=Object.fromEntries(req.method()==='POST'?new URLSearchParams(req.postData()||''):url.searchParams);
  if(p.action==='getVocaCatalog')reads.push(p);if(['getVocaSection','searchVoca'].includes(p.action))wordReads.push(p);
  let reply=p.action==='getVocaCatalog'?{success:true,books:catalog}:p.action==='getMyVocabPreparation'?{success:false,code:'UNSUPPORTED_ACTION'}:p.action==='getMyLearningSchedule'?{success:true,days:[],visibleDays:[]}:p.action==='getFavoriteState'?{success:true,folders:{기본:[]}}:p.action==='getStudentContent'?{success:true,home:{},notices:[],homeNotices:[]}:{success:true};
  return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(reply)});
 });
 const page=await context.newPage();await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!currentUser?.token);
 await page.evaluate(()=>showTab('vocab'));await page.locator('#station-library').evaluate(el=>el.open=true);
 await page.locator('#station-library-book option[value="UNKNOWN"]').waitFor({state:'attached'});
 await page.getByLabel('학교급',{exact:true}).selectOption('중학교');await page.getByLabel('학년',{exact:true}).selectOption('2');await page.getByLabel('출판사',{exact:true}).selectOption('비상');
 assert.deepEqual(await page.locator('#station-library-book option').evaluateAll(options=>options.map(x=>x.value)),['','M2']);
 await page.getByLabel('출판사',{exact:true}).selectOption('동아');assert.equal(await page.locator('#station-library-book option').count(),1);assert.match(await page.locator('#station-library-status').innerText(),/일치하는 교재가 없습니다/);
 for(const label of ['학교급','학년','출판사'])await page.getByLabel(label,{exact:true}).selectOption('');
 assert.equal(await page.locator('#station-library-book option[value="UNKNOWN"]').count(),1);assert.equal(reads.length,1,'metadata filters must not fetch another catalog');assert.equal(wordReads.length,0,'metadata filters must not fetch word bodies');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.evaluate(()=>StationLibrary.reset());for(const id of ['school-level','grade','publisher'])assert.equal(await page.locator('#station-library-'+id+' option').count(),1);
 console.log(JSON.stringify({engine,role,passed:true,metadataReads:reads.length,wordBodyReads:wordReads.length,realStudentData:0}));await context.close();
}}finally{await browser.close();}
