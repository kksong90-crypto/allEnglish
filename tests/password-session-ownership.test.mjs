import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const apiSource=html.slice(html.indexOf('    let authExpiredNoticeShown = false;'),html.indexOf('    /************************************************************\n     *  로그인 유지 보정'));
const changeSource=html.slice(html.indexOf('    async function changeMyPassword()'),html.indexOf('    /************************************************************\n     *  4. 화면 전환'));
const nativeSource=html.slice(html.indexOf(' async function nativeReadonlyRequest(params)'),html.indexOf(' async function readNative(params)'));
const methods=['apiGet','apiPost','nativeGet','nativePost'];
const denied={success:false,message:'로그인 시간이 만료되었습니다.'};
function harness(){
 const nodes=new Map(),calls=[],saved=[];let resets=0,clears=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',style:{},classList:{add(){},remove(){}}});return nodes.get(id);};
 node('old-password').value='synthetic-old';node('new-password').value=node('new-password-confirm').value='synthetic-new';
 const ctx={URLSearchParams,Map,JSON,API_TIMEOUT_MS:1000,API_LONG_TIMEOUT_MS:2000,SHEET_URL:'https://fixture.invalid/',studentSessionEpoch:1,currentUser:{id:'synthetic',token:'synthetic-old-token'},document:{getElementById:node},setTimeout(){},resetUserScopedState(){resets++;ctx.studentSessionEpoch++;},clearUserSession(){clears++;},saveUserSession:u=>saved.push({...u}),fetchJsonWithTimeout:(url,opts={})=>new Promise(resolve=>calls.push({params:opts.body||new URL(url).searchParams,resolve}))};
 vm.createContext(ctx);vm.runInContext(apiSource+'\n'+changeSource+'\n'+nativeSource,ctx);
 const request=(method,params={})=>method.startsWith('native')?ctx.nativeReadonlyRequest({action:'getLegacyNativeFavorites',...(method==='nativePost'?{wordIds:'x'.repeat(7600)}:{}),...params}):ctx[method]({action:'fixtureProtected',...params});
 return{ctx,calls,saved,node,request,resets:()=>resets,clears:()=>clears};
}
test('GET and POST sent before actual password rotation cannot expire the replacement session',async()=>{
 for(const method of methods){const h=harness(),old=h.request(method),change=h.ctx.changeMyPassword();assert.equal(h.calls[0].params.get('token'),'synthetic-old-token');h.calls[1].resolve({success:true,token:'synthetic-new-token'});await change;assert.equal(h.ctx.currentUser.token,'synthetic-new-token');assert.equal(h.saved[0].token,'synthetic-new-token');h.calls[0].resolve(denied);assert.equal(await old,denied);assert.equal(h.ctx.currentUser?.token,'synthetic-new-token');assert.equal(h.resets(),0);assert.match(h.node('password-message').textContent,/변경되었습니다/);}
});
test('explicit stale token GET and POST failures cannot clear an already rotated session',async()=>{
 for(const method of methods){const h=harness();h.ctx.currentUser.token='synthetic-new-token';const pending=h.request(method,{token:'synthetic-old-token'});h.calls[0].resolve(denied);await pending;assert.equal(h.ctx.currentUser?.token,'synthetic-new-token');assert.equal(h.clears(),0);}
});
test('current token expiration and tokenless public failures retain existing logout behavior',async()=>{
 for(const method of methods)for(const tokenless of [false,true]){const h=harness();if(tokenless)h.ctx.currentUser=null;const pending=h.request(method);h.calls[0].resolve(denied);await pending;assert.equal(h.ctx.currentUser,null);assert.equal(h.resets(),1);assert.equal(h.clears(),1);assert.match(h.node('login-error').textContent,/만료/);}
});
test('a response from a previous epoch cannot expire a newer login even when tokens match',async()=>{
 for(const method of methods){const h=harness(),pending=h.request(method);h.ctx.studentSessionEpoch++;h.ctx.currentUser={id:'other-synthetic',token:'synthetic-old-token'};h.calls[0].resolve(denied);await pending;assert.equal(h.ctx.currentUser.id,'other-synthetic');assert.equal(h.resets(),0);}
});
