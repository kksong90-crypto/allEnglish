import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
function harness({failure}={}) {
  let next=0;const timers=new Map(),requests=[],events=[];
  const ctx={AbortController,JSON,Error,navigator:{onLine:true},
    apiUrl:()=> 'https://synthetic.example/exec',token:()=> 'SYNTHETIC_SESSION',requestId:()=> 'REC_SAVE_generated',
    isSessionError:()=>false,requireSessionLogin:()=>new Error('session'),
    setTimeout:(f,ms)=>{const id=++next;timers.set(id,{f,ms});return id},clearTimeout:id=>timers.delete(id),
    fetch:(_url,options)=>{requests.push(options);if(failure)return Promise.reject(new Error(failure));
      return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}));}};
  vm.createContext(ctx);
  vm.runInContext(source.split(/\r?\n/).filter(l=>l.startsWith('function isWriteAction(')||l.startsWith('async function api(')).join('\n'),ctx);
  return{ctx,requests,timers,events,fire:ms=>{for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.f();}}};
}
test('suspended write reaches the timeout, keeps its retry identity and settles all timers',async()=>{
  const h=harness(),p=h.ctx.api('opsSaveOne',{requestId:'REC_SAVE_original'},{onSlow:()=>h.events.push('slow'),onRecovered:()=>h.events.push('settled')});
  h.fire(12000);assert.deepEqual(h.events,['slow']);h.fire(45000);
  await assert.rejects(p,e=>e.uncertain===true&&e.requestId==='REC_SAVE_original');
  assert.equal(JSON.parse(h.requests[0].body).payload.requestId,'REC_SAVE_original');
  assert.deepEqual(h.events,['slow','settled']);assert.equal(h.timers.size,0);
});
test('stalled read settles as a read failure rather than an uncertain save',async()=>{
  const h=harness(),p=h.ctx.api('opsDashboard',{});h.fire(45000);
  await assert.rejects(p,e=>!e.uncertain&&e.message.includes('기존 화면은 유지'));
  assert.equal(h.timers.size,0);
});
test('connection loss retains uncertainty for writes but does not turn a read into a write',async()=>{
  for(const action of ['opsSaveOne','opsDashboard']){const h=harness({failure:'synthetic disconnected'});
    await assert.rejects(h.ctx.api(action,{requestId:'REC_SAVE_original'}),e=>e.uncertain===(action==='opsSaveOne'?true:undefined));
    assert.equal(h.timers.size,0);
  }
});
