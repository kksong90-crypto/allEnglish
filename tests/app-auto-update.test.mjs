import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {createController}=require('../app-auto-update.js');
function fixture(){
 let now=0,visible=true,online=true,busy=false,release='new',readError=false,allowed=true;
 const reloads=[],notices=[];
 const env={currentRelease:'old',now:()=>now,visible:()=>visible,online:()=>online,busy:()=>busy,
 readRelease:async()=>{if(readError)throw Error('offline');return release;},notify:v=>notices.push(v),
 canReload:()=>allowed,remember(){},reload:v=>reloads.push(v)};
 const c=createController(env);
 return {c,reloads,notices,advance(){now+=11000;},set(v){({now=now,visible=visible,online=online,busy=busy,release=release,readError=readError,allowed=allowed}=v);}};
}
test('safe idle page receives a newer publication automatically',async()=>{
 const f=fixture();await f.c.check();assert.equal(await f.c.tick(),false);
 f.advance();assert.equal(await f.c.tick(),true);assert.deepEqual(f.reloads,['new']);
});
test('activity delays application until another idle period',async()=>{
 const f=fixture();await f.c.check();f.advance();f.c.activity();assert.equal(await f.c.tick(),false);
 f.advance();assert.equal(await f.c.tick(),true);
});
test('active work defers update and applies after work completes',async()=>{
 const f=fixture();await f.c.check();f.advance();f.set({busy:true});assert.equal(await f.c.tick(),false);
 f.set({busy:false});assert.equal(await f.c.tick(),true);
});
test('recording hold explicitly blocks navigation until released',async()=>{
 const f=fixture(),release=f.c.hold('recording');await f.c.check();f.advance();
 assert.equal(await f.c.tick(),false);release();assert.equal(await f.c.tick(),true);
});
test('in-flight save and its completion settle before update',async()=>{
 const f=fixture();let finish;const work=f.c.protect(()=>new Promise(r=>finish=r));
 await f.c.check();f.advance();assert.equal(await f.c.tick(),false);
 finish();await work;assert.equal(await f.c.tick(),false);
 f.advance();assert.equal(await f.c.tick(),true);
});
test('failed save releases the request guard and still requires idle',async()=>{
 const f=fixture();await assert.rejects(f.c.protect(async()=>{throw Error('save failed');}));
 assert.equal(f.c.state().inflight,0);await f.c.check();assert.equal(await f.c.tick(),false);
});
test('offline and hidden pages neither reload nor apply pending updates',async()=>{
 for(const state of [{online:false},{visible:false}]){
 const f=fixture();await f.c.check();f.advance();f.set(state);assert.equal(await f.c.tick(),false);
 }
});
test('a failed version read cannot trigger navigation',async()=>{
 const f=fixture();await f.c.check();f.advance();f.set({readError:true});
 assert.equal(await f.c.tick(),false);assert.equal(f.reloads.length,0);
});
test('version is revalidated before applying a pending update',async()=>{
 const f=fixture();await f.c.check();f.advance();f.set({release:'third'});
 assert.equal(await f.c.tick(),false);assert.equal(f.reloads.length,0);
 assert.equal(await f.c.tick(),true);assert.deepEqual(f.reloads,['third']);
});
test('concurrent checks are coalesced',async()=>{
 let finish,reads=0;
 const c=createController({currentRelease:'old',now:()=>0,visible:()=>true,online:()=>true,
 readRelease:()=>{reads++;return new Promise(r=>finish=r);},notify(){}});
 const first=c.check();await c.check();assert.equal(reads,1);finish('new');await first;
});
test('retry-loop budget stops reloads',async()=>{
 const f=fixture();await f.c.check();f.advance();f.set({allowed:false});
 assert.equal(await f.c.tick(),false);assert.deepEqual(f.notices,['pending','paused']);
});
test('a withdrawn release clears the pending notice without navigation',async()=>{
 const f=fixture();await f.c.check();f.set({release:'old'});await f.c.check();f.advance();
 assert.equal(f.c.state().pending,null);assert.equal(await f.c.tick(),false);
 assert.deepEqual(f.notices,['pending','current']);
});
test('a failed asset refresh cannot navigate to a partial update',async()=>{
 let now=0,nav=0;
 const d=createController({currentRelease:'old',now:()=>now,visible:()=>true,online:()=>true,busy:()=>false,readRelease:async()=> 'new',notify(){},canReload:()=>true,prepare:async()=>{throw Error('asset unavailable');},reload:()=>nav++});
 await d.check();now=20000;assert.equal(await d.tick(),false);assert.equal(nav,0);
});

const source=fs.readFileSync(new URL('../app-auto-update.js',import.meta.url),'utf8');
function browser({marker=true,dirty=false,tab='home',inTest=false}={}){
 let now=Date.parse('2026-10-18T05:00:00Z'),remote='new',requests=[],navigations=[];
 const listeners={},storage=new Map(),fields=[];
 const node=text=>({tagName:'SCRIPT',textContent:text,getAttribute:()=>null});
 const doc={baseURI:'https://example.test/allEnglish/',lastModified:'2026-10-18T04:00:00Z',visibilityState:'visible',activeElement:null,
 querySelector:selector=>selector.startsWith('meta')?{}:null,querySelectorAll:()=>[node('old')],
 createElement:()=>({style:{},setAttribute(){}}),body:{appendChild(){}},
 addEventListener:(name,fn)=>listeners[name]=fn};
 const win={document:doc,navigator:{onLine:true},location:{href:'https://example.test/allEnglish/?keep=1',replace:u=>navigations.push(u)},
 sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 addEventListener:(name,fn)=>listeners['window:'+name]=fn,setInterval(){},setTimeout(){},
 apiPost:async function(value){assert.equal(this,win);return value;},
 fetch:async(url,options)=>{requests.push({url,options});return {ok:true,headers:{get:k=>k==='content-type'?(options.cache==='reload'?'text/javascript':'text/html'):'Sun, 18 Oct 2026 04:00:00 GMT'},text:async()=>remote,arrayBuffer:async()=>new ArrayBuffer(2)};}};
 const context={window:win,module:undefined,URL,AbortController,setTimeout,clearTimeout,Date:class extends Date{static now(){return now;}},
 DOMParser:class{parseFromString(text){return {querySelector:()=>marker?{}:null,querySelectorAll:selector=>selector==='script[src],link[rel="stylesheet"][href]'?[{getAttribute:k=>k==='src'?'app.js':null}]:[node(text)]};}},
 getActiveTabId:()=>tab,currentUser:{token:'synthetic'},currentTestMeta:inTest?{}:null,testAlreadySaved:false,console};
 vm.runInNewContext(source,context);
 if(dirty){
 const field={type:'text',value:'unfinished',defaultValue:'',isConnected:true,matches:()=>true,closest:()=>null};
 fields.push(field);listeners.input({target:field});
 }
 return {win,doc,requests,navigations,storage,listeners,context,advance(){now+=11000;},get controller(){return win.AllbarunAutoUpdate.controller;},
 setTab:v=>tab=v,setRemote:v=>remote=v,fields};
}
test('real shell adapter detects new code and cache-busts without losing existing URL options',async()=>{
 const b=browser();await b.controller.check();b.advance();assert.equal(await b.controller.tick(),true);
 const url=new URL(b.navigations[0]);assert.equal(url.searchParams.get('keep'),'1');assert.ok(url.searchParams.get('_app_build'));
 assert.ok(b.requests.every(r=>['no-store','reload'].includes(r.options.cache)&&r.options.credentials==='omit'));
 assert.ok(b.requests.some(r=>r.options.cache==='reload'&&r.url.endsWith('app.js')));
});
test('real shell preserves unsaved input and active test answers',async()=>{
 for(const options of [{dirty:true},{inTest:true},{tab:'point'}]){
 const b=browser(options);await b.controller.check();b.advance();
 assert.equal(await b.controller.tick(),false);assert.equal(b.navigations.length,0);
 }
});
test('clearing unfinished input allows a delayed update',async()=>{
 const b=browser({dirty:true});await b.controller.check();b.advance();assert.equal(await b.controller.tick(),false);
 b.fields[0].value='';assert.equal(await b.controller.tick(),true);
});
test('captive portal or unrelated HTML is never treated as a release',async()=>{
 const b=browser({marker:false});await b.controller.check();b.advance();
 assert.equal(await b.controller.tick(),false);assert.equal(b.navigations.length,0);
});
test('shell API wrapper preserves result and this binding, including safety guard',async()=>{
 const b=browser();assert.equal(await b.win.apiPost('result'),'result');assert.equal(b.controller.state().inflight,0);
});
test('no login clearing, service worker takeover, global cache purge or study writes',()=>{
 assert.doesNotMatch(source,/localStorage|removeItem|\.clear\(|caches\.delete|serviceWorker\.register|submitPointTest|saveVocab|changePassword/);
});
test('unchanged version metadata avoids repeated full HTML downloads',async()=>{
 const b=browser();await b.controller.check();await b.controller.check();
 assert.equal(b.requests.filter(r=>r.options.method==='GET').length,1);
});
test('already targeted release cannot produce a reload loop even without session storage',async()=>{
 const b=browser();await b.controller.check();
 b.win.location.href+='&_app_build='+b.controller.state().pending;
 b.advance();assert.equal(await b.controller.tick(),false);assert.equal(b.navigations.length,0);
});
test('after one successful navigation, pending timers cannot navigate again',async()=>{
 const b=browser();await b.controller.check();b.advance();await b.controller.tick();
 await b.controller.check();await b.controller.tick();assert.equal(b.navigations.length,1);
});
test('updater is mounted once in the outer shell rather than a generated report popup',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.equal(html.split('app-auto-update.js?v=20261018.1').length,2);
 assert.match(html,/<script defer src="app-auto-update\.js\?v=20261018\.1"><\/script>\s*<\/body>/);
 assert.doesNotMatch(html,/myScheduleLoadedOnce|myScheduleLastPayload/);
});
test('all embedded student scripts retain valid JavaScript syntax',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 let count=0;for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){new vm.Script(match[1]);count++;}
 assert.ok(count>0);
});

