import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('    let loginRequestPending = false;'),html.indexOf('    function afterLogin()'));
function harness(){
  const error={textContent:''}, button={disabled:false}, calls=[];
  let resolve,reject;
  const ctx={document:{getElementById:id=>id==='login-error'?error:{value:'synthetic'},querySelector:()=>button},
    API_LONG_TIMEOUT_MS:90000,apiPost:(params,timeout)=>{calls.push({action:params.action,timeout});return new Promise((a,b)=>{resolve=a;reject=b;});},
    resetUserScopedState(){},saveUserSession(){},afterLogin(){},currentUser:null};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {ctx,error,button,calls,resolve:x=>resolve(x),reject:x=>reject(x)};
}
test('login waits beyond server lock budget and suppresses concurrent clicks',async()=>{
 const h=harness(),pending=h.ctx.checkLogin();await h.ctx.checkLogin();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].timeout,90000);assert.equal(h.button.disabled,true);
 h.resolve({success:true,id:'synthetic',role:'ADMIN',token:'synthetic'});await pending;
 assert.equal(h.button.disabled,false);assert.equal(h.ctx.currentUser.role,'ADMIN');
});
test('abort is distinct from bad password and unlocks retry without automatic replay',async()=>{
 const h=harness(),pending=h.ctx.checkLogin();h.reject({name:'AbortError'});await pending;
 assert.match(h.error.textContent,/비밀번호 오류로 확인된 것은 아닙니다/);assert.equal(h.button.disabled,false);assert.equal(h.calls.length,1);
 const retry=h.ctx.checkLogin();assert.equal(h.calls.length,2);h.resolve({success:false,message:'거절'});await retry;
 assert.equal(h.error.textContent,'거절');assert.equal(h.button.disabled,false);
});
test('connection errors do not create a local session',async()=>{
 const h=harness(),pending=h.ctx.checkLogin();h.reject(new Error('network'));await pending;
 assert.equal(h.ctx.currentUser,null);assert.match(h.error.textContent,/network/);assert.equal(h.button.disabled,false);
});
