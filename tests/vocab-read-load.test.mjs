import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const once=html.slice(html.indexOf('async function loadVocabBooksOnce('),html.indexOf('async function loadRetestOnce('));
const load=html.slice(html.indexOf('    async function loadVocabBooks('),html.indexOf('    async function loadVocabDays('));
const data=()=>({success:true,values:[['book','day','word','meaning','order'],['synthetic','1','false','0',1]]});
function harness(){
 const nodes=new Map(),requests=[];
 const ctx={studentSessionEpoch:1,vocabLoadedOnce:false,vocabLoadPromise:null,vocabData:[],escapeHtml:x=>String(x),loadVocabDays(){},showVocabList(){},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',addEventListener(){throw Error('duplicate listener registration forbidden');}});return nodes.get(id);}},apiGet:p=>new Promise((resolve,reject)=>requests.push({p,resolve,reject}))};
 vm.createContext(ctx);vm.runInContext(once+'\n'+load,ctx);
 return {ctx,nodes,requests,start:force=>ctx.loadVocabBooksOnce(force),reset:()=>{ctx.studentSessionEpoch++;ctx.vocabLoadedOnce=false;ctx.vocabLoadPromise=null;ctx.vocabData=[];}};
}
test('inline scripts remain syntactically valid',()=>{for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(!/src=|application\/json/.test(m[1])&&m[2].trim())new vm.Script(m[2]);}});
test('concurrent navigation and force refresh share one read',async()=>{const h=harness(),a=h.start(),b=h.start(true);assert.equal(h.requests.length,1);h.requests[0].resolve(data());assert.equal(await a,true);assert.equal(await b,true);assert.equal(h.ctx.vocabLoadedOnce,true);await h.start();assert.equal(h.requests.length,1);assert.match(h.nodes.get('vocab-book-select').innerHTML,/synthetic/);});
test('API failure is not cached as successful load and manual retry works',async()=>{const h=harness(),a=h.start();h.requests[0].resolve({success:false,message:'synthetic error'});assert.equal(await a,false);assert.equal(h.ctx.vocabLoadedOnce,false);const b=h.start();assert.equal(h.requests.length,2);h.requests[1].resolve(data());assert.equal(await b,true);});
test('network rejection unlocks next explicit read without replay',async()=>{const h=harness(),a=h.start();h.requests[0].reject(Error('network'));assert.equal(await a,false);assert.equal(h.requests.length,1);assert.equal(h.ctx.vocabLoadPromise,null);assert.equal(h.ctx.vocabLoadedOnce,false);});
test('empty successful catalog remains a valid completed read',async()=>{const h=harness(),a=h.start();h.requests[0].resolve({success:true,values:[]});assert.equal(await a,true);assert.equal(h.ctx.vocabLoadedOnce,true);assert.match(h.nodes.get('vocab-view').innerHTML,/데이터가 없습니다/);});
test('old session success cannot replace new session data or pending request',async()=>{const h=harness(),a=h.start();h.reset();const b=h.start(),owned=h.ctx.vocabLoadPromise;h.requests[0].resolve(data());assert.equal(await a,false);assert.equal(h.ctx.vocabData.length,0);assert.equal(h.ctx.vocabLoadPromise,owned);h.requests[1].resolve(data());assert.equal(await b,true);});
test('old session rejection cannot render an error in new session',async()=>{const h=harness(),a=h.start();h.reset();h.nodes.get('vocab-view').innerHTML='new-session';h.requests[0].reject(Error('old'));assert.equal(await a,false);assert.equal(h.nodes.get('vocab-view').innerHTML,'new-session');});
test('explicit refresh replaces change handlers instead of accumulating',async()=>{const h=harness(),a=h.start();h.requests[0].resolve(data());await a;const book=h.nodes.get('vocab-book-select'),handler=book.onchange,b=h.start(true);h.requests[1].resolve(data());await b;assert.equal(book.onchange,handler);assert.equal(h.requests.length,2);assert.equal(h.ctx.vocabData[1][2],'false');assert.equal(h.ctx.vocabData[1][3],'0');});
test('session reset clears the pending read owner',()=>{const reset=html.slice(html.indexOf('    function resetUserScopedState()'),html.indexOf('    let loginRequestPending'));assert.match(reset,/vocabLoadPromise = null;/);});
