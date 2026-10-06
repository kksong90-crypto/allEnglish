// Loopback-only synthetic UI fixture. No production URL, identity or credential.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../recording');const calls=[];
function dashboard(date='2026-10-06') {return {targetDate:date,targetLabel:date,sourceOfTruth:'SYNTHETIC TEST ONLY',lastAuthoritativeReadAt:'12:00:00',deadlineAt:date+' 15:00',deadlinePassed:false,noticeStartAt:date+' 15:00',noticeEndAt:date+' 18:00',notice:{missing:1},totalStudents:1,totalReceived:0,totalUnknown:1,totalMissing:0,candidates:['06','07','08','10'].map(d=>({date:'2026-10-'+d,shortLabel:'검증 10/'+d,studentCount:1})),classes:[{classId:'TEST_CLASS',className:'합성 검증 반',vocabSummary:'합성 범위 · 운영 데이터 아님',canCheck:true,receivedCount:0,students:[{studentId:'TEST_STUDENT',name:'합성 학생 A',status:'UNKNOWN',received:false,canCheck:true}]}]};}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:43187');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/fixture-log'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(calls));}
 if(url.pathname==='/mock-api'&&req.method==='POST'){
  let body='';for await(const chunk of req)body+=chunk;const {action,payload={}}=JSON.parse(body);calls.push({action,targetDate:payload.targetDate||'',synthetic:true});res.setHeader('Content-Type','application/json');
  if(action==='login')return res.end(JSON.stringify({success:true,data:{token:'SYNTHETIC_LOCAL_ONLY'}}));
  if(action==='opsDashboard'){
   if(payload.targetDate==='2026-10-07')return res.end(JSON.stringify({success:false,error:{message:'합성 조회 실패 · 운영 서버 호출 없음'}}));
   if(payload.targetDate==='2026-10-10')await new Promise(r=>setTimeout(r,1800));
   return res.end(JSON.stringify({success:true,data:dashboard(payload.targetDate==='2026-10-08'?'2026-10-09':payload.targetDate||'2026-10-06')}));
  }
  if(action==='opsSaveOne'){await new Promise(r=>setTimeout(r,1800));return res.end(JSON.stringify({success:true,data:{status:'RECEIVED',received:true,savedAt:'12:01',notice:{complete:true,active:false,missing:0},summary:{total:1,received:1,missing:0}}}));}
  return res.end(JSON.stringify({success:false,error:{message:'Unsupported synthetic action'}}));
 }
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!/^(index\.html|app\.js|styles\.css|manifest\.webmanifest|icon-(192|512)\.png)$/.test(name)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,name)));
});server.listen(43187,'127.0.0.1',()=>console.log('Synthetic recording fixture http://127.0.0.1:43187; live API calls disabled by fixture routing.'));
