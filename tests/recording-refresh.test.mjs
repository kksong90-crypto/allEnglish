import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
function harness({saving=[],hidden=false,online=true,lastLoaded=Date.now()}={}){
 const calls=[],events={},APP={saving:new Set(saving),lastLoaded,targetDate:'2026-11-10'};
 const ctx={APP,Date,Intl,document:{hidden,addEventListener:(name,handler)=>events[name]=handler},
  navigator:{onLine:online},window:{addEventListener:(name,handler)=>events[name]=handler},
  apiUrl:()=> 'test',token:()=> 'test',updateNetwork(){},
  setInterval:(fn,ms)=>{events.tick=fn;events.interval=ms;},
  loadData:async(force,date)=>{calls.push({force,date});}};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('async function refreshRecording('),source.indexOf("if('serviceWorker'in navigator)")),ctx);
 return {ctx,APP,calls,events};
}
test('one-minute refresh defers while student checks are pending',async()=>{
 const h=harness({saving:['C|S']});
 assert.equal(h.events.interval,60000);
 await h.ctx.refreshRecording();
 assert.equal(h.calls.length,0);
 assert.equal(h.APP.refreshPending,true);
 h.APP.saving.clear();
 await h.ctx.refreshRecording();
 assert.deepEqual(h.calls,[{force:false,date:'2026-11-10'}]);
});
test('a failed refresh leaves the existing displayed model intact',async()=>{
 const h=harness();const old={classes:[{classId:'C'}]};h.APP.data=old;
 h.ctx.loadData=async()=>null;
 await h.ctx.refreshRecording();
 assert.equal(h.APP.data,old);
});
test('crossing the Korean calendar date asks the server for its current default',async()=>{
 const h=harness({lastLoaded:Date.now()-86400000});
 await h.ctx.refreshRecording();
 assert.equal(h.calls[0].date,'');
});
test('offline and hidden screens do not poll',async()=>{
 for(const options of [{hidden:true},{online:false}]){
  const h=harness(options);await h.ctx.refreshRecording();assert.equal(h.calls.length,0);
 }
});
test('screen unlock, restored page and connection recovery trigger a fresh read',async()=>{
 const h=harness();h.events.visibilitychange();h.events.pageshow({persisted:true});h.events.online();
 await Promise.resolve();assert.equal(h.calls.length,3);
});
