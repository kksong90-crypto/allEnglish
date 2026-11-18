import fs from 'node:fs';
import {journalContext} from './recording-journal-harness.mjs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
function harness(){
 const old={targetDate:'2026-11-16',classes:[]},fresh={targetDate:'2026-11-16',classes:[],marker:'stale-response'};
 let resolve,resolveRefresh,onSaved;const pending=new Promise(r=>resolve=r),nextRead=new Promise(r=>resolveRefresh=r),renders=[],cached=[],refreshes=[],APP={targetDate:old.targetDate,data:old,saving:new Set()};let requests=0;
 const ctx={...journalContext(),APP,performance,ensureConnected:()=>true,setSync(){},toast(){},clearDashboardCache(){},updateNetwork(){},renderError(){},renderReadTiming(){},
  render:data=>renders.push(data),saveDashboardCache:data=>cached.push(data),api:()=>{if(!requests++)return pending;refreshes.push('refresh');return nextRead;},
  document:{hidden:false},navigator:{onLine:true},apiUrl:()=> 'SYNTHETIC_API',token:()=> 'SYNTHETIC_SESSION',
  FormData:class{get(k){return {startDate:'2026-11-16',endDate:'2026-11-16',reason:'synthetic'}[k]||''}},
  $:()=>({value:'STUDENT'}),loadWorkspaceAbsences(){},saveWorkspaceForm:(_f,_a,_p,_accept,saved)=>{onSaved=saved}};
 vm.createContext(ctx);
 const start=source.indexOf('function invalidateRecordingRead(');
 if(start>=0)vm.runInContext(source.slice(start,source.indexOf('async function loadData(',start)),ctx);
 vm.runInContext(source.split('\n').find(l=>l.startsWith('async function loadData(')),ctx);
 vm.runInContext(source.slice(source.indexOf('async function refreshRecording('),source.indexOf("window.addEventListener('online'")),ctx);
 vm.runInContext(source.slice(source.indexOf('function submitWorkspaceAbsence('),source.indexOf('async function loadWorkspaceAbsences(')),ctx);
 const saveAbsence=()=>{ctx.submitWorkspaceAbsence({preventDefault(){},currentTarget:{reset(){}}});onSaved({plannedAbsenceId:'SYNTHETIC_ABSENCE'});};
 return {ctx,APP,old,fresh,renders,cached,refreshes,resolve,resolveRefresh,saveAbsence};
}
test('an absence saved during an old recording read prevents the stale reply from restoring that roster',async()=>{
 const h=harness(),read=h.ctx.loadData(false);
 h.saveAbsence();
 h.resolve(h.fresh);await read;
 assert.equal(h.APP.data,h.old);assert.equal(h.APP.needsRead,true);assert.equal(h.renders.length,0);assert.equal(h.cached.length,0);
 assert.deepEqual(h.refreshes,['refresh']);
 const latest={targetDate:h.old.targetDate,classes:[],marker:'after-absence'};
 h.resolveRefresh(latest);await Promise.resolve();await Promise.resolve();
 assert.equal(h.APP.data,latest);assert.equal(h.APP.needsRead,false);assert.equal(h.renders.length,1);
});
test('invalidation waits until all recording saves have drained',async()=>{
 const h=harness(),read=h.ctx.loadData(false);h.APP.saving.add('CLASS|STUDENT');
 h.saveAbsence();h.resolve(h.fresh);await read;
 assert.equal(h.refreshes.length,0);assert.equal(h.APP.refreshPending,true);
});
