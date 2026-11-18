import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {test} from 'node:test';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
test('screen hiding flushes an existing transport immediately; returning resumes authoritative reads',()=>{
 const listeners={},docListeners={};let flushed=0,resumed=0;
 const ctx={APP:{batchTransport:{flush:()=>{flushed++}}},document:{hidden:true,addEventListener:(n,fn)=>docListeners[n]=fn},window:{addEventListener:(n,fn)=>listeners[n]=fn},resumeRecording:()=>{resumed++},updateNetwork(){}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function prepareRecordingBackground('),source.indexOf("if(typeof setInterval==='function')")),ctx);
 docListeners.visibilitychange();assert.equal(flushed,2);assert.equal(resumed,0);listeners.pagehide();assert.equal(flushed,4);
 ctx.document.hidden=false;docListeners.visibilitychange();assert.equal(resumed,1);assert.equal(flushed,4);
 listeners.focus();docListeners.resume();assert.equal(resumed,3);
 delete ctx.APP.batchTransport;ctx.document.hidden=true;assert.doesNotThrow(()=>docListeners.visibilitychange());
});
