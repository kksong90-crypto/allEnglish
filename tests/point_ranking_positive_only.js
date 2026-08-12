const fs=require('fs');const path=require('path');const vm=require('vm');
const root=path.resolve(process.argv[2]||'.');const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n?/g,'\n');const checks=[];
function check(n,v){if(!v)throw new Error('FAIL: '+n);checks.push(n)}
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/\bsrc\s*=/.test(m[1]));
check('inline javascript syntax',scripts.every(m=>{try{new vm.Script(m[2]);return true}catch(e){return false}}));
check('student version includes ranking guard follow-up',/allbarun-student-version" content="6\.6\.2-RUNTIME-RESILIENCE"/.test(html));
check('student API contract version is not changed',/allbarun-student-api-version" content="6\.5\.1-VOCA-GATEWAY-RETEST-SAFETY"/.test(html));
check('current ranking payload filters zero and negative points',/currentTop10\s*=\s*\(json\.currentTop10\s*\|\|\s*\[\]\)\.filter\([^\n]*currentPoint[^\n]*>\s*0/.test(html));
check('cumulative ranking payload filters zero and negative points',/totalTop10\s*=\s*\(json\.totalTop10\s*\|\|\s*\[\]\)\.filter\([^\n]*totalPoint[^\n]*>\s*0/.test(html));
check('render current ranking has second defensive positive filter',/pointRankingPayload\.currentTop10[\s\S]{0,180}filter\([^\n]*currentPoint[^\n]*>\s*0/.test(html));
check('render cumulative ranking has second defensive positive filter',/pointRankingPayload\.totalTop10[\s\S]{0,180}filter\([^\n]*totalPoint[^\n]*>\s*0/.test(html));
check('ranking display still uses server-provided rank titles',/item\.currentRankTitle/.test(html)&&/item\.totalRankTitle/.test(html));
check('ranking display still shows both current and cumulative points',/item\.currentPoint/.test(html)&&/item\.totalPoint/.test(html));
check('no client code pads ranking to ten zero-point students',!/while\s*\([^)]*length\s*<\s*10/.test(html)&&!/fill\([^)]*10/.test(html));
check('empty positive ranking has explicit message',/1P 이상|포인트가 있는 학생|랭킹 대상/.test(html));
console.log(`point ranking positive-only: ${checks.length}/${checks.length} passed`);
