import fs from 'node:fs';import assert from 'node:assert/strict';
const root=new URL('../recording/',import.meta.url);let app=fs.readFileSync(new URL('app.js',root),'utf8');
function once(a,b){assert.equal(app.split(a).length,2,a.slice(0,80));app=app.replace(a,b)}
once('controller=new AbortController();let slow=false;',"controller=new AbortController(),externalSignal=write?null:override.signal,externalAbort=()=>controller.abort();if(externalSignal?.aborted)controller.abort();else externalSignal?.addEventListener('abort',externalAbort,{once:true});let slow=false;");
once('const text=await response.text();let json;',"const text=await response.text();if(externalSignal?.aborted)throw Object.assign(new Error('이전 명단 조회를 중단했습니다.'),{obsolete:true});let json;");
once("if(error?.name==='AbortError'){const delayed=", "if(error?.name==='AbortError'){if(externalSignal?.aborted)throw Object.assign(new Error('이전 명단 조회를 중단했습니다.'),{obsolete:true});const delayed=");
once('finally{clearTimeout(timer);clearTimeout(slowTimer);if(slow)',"finally{externalSignal?.removeEventListener('abort',externalAbort);clearTimeout(timer);clearTimeout(slowTimer);if(slow)");
once("const readEpoch=APP.readEpoch||0;const readStarted=performance.now();", "const readEpoch=APP.readEpoch||0,readLease=typeof AbortController==='function'?{controller:new AbortController(),startedAt:Date.now(),superseded:false}:null;APP.activeDashboardRead=readLease;const readStarted=performance.now();");
once("readOnlyCandidateCache:true},{onSlow:","readOnlyCandidateCache:true},{signal:readLease?.controller.signal,onSlow:");
once('finally{APP.loading=false;delete APP.loadingTargetDate;', 'finally{if(APP.activeDashboardRead===readLease)delete APP.activeDashboardRead;APP.loading=false;delete APP.loadingTargetDate;');
const marker="window.addEventListener('online',()=>{updateNetwork();void refreshRecording()});";
once(marker,`function resumeRecording(){
 if(document.hidden||!navigator.onLine)return;
 const lease=APP.activeDashboardRead;
 if(APP.loading&&lease?.controller&&!lease.superseded&&Date.now()-lease.startedAt>=15000){
  lease.superseded=true;APP.readEpoch=(APP.readEpoch||0)+1;APP.refreshPending=true;
  lease.controller.abort();return;
 }
 return refreshRecording();
}
window.addEventListener('online',()=>{updateNetwork();void resumeRecording()});`);
once("if(event.persisted)void refreshRecording()", "if(event.persisted)void resumeRecording()");
once("if(!document.hidden)void refreshRecording();", "if(!document.hidden)void resumeRecording();");
app=app.replace("version:'8.2.22'","version:'8.2.23'");fs.writeFileSync(new URL('app.js',root),app);
for(const name of ['index.html','sw.js']){const p=new URL(name,root),s=fs.readFileSync(p,'utf8').replaceAll('8.2.22-PENDING-FEEDBACK','8.2.23-RESUME-READ').replaceAll('v8.2.22','v8.2.23').replaceAll('v8222-pending-feedback','v8223-resume-read');fs.writeFileSync(p,s);}
