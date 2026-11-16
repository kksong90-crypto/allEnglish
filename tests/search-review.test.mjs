// Scenario review using synthetic DOM/API only, not real user interviews or live timings.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source = readFileSync(new URL('../station-library.js', import.meta.url), 'utf8');
const flush = async () => {for (let i=0;i<20;i++) await Promise.resolve();};
function fixture(answer, catalogAnswer) {
  const created=[];
  function node(tag='DIV') {
    const result={tagName:String(tag).toUpperCase(),value:'',textContent:'',children:[],handlers:{},disabled:false,
      addEventListener(event,callback){this.handlers[event]=callback;},
      replaceChildren(...children){this.children=children;this.textContent='';this.value='';},
      append(...children){this.children.push(...children);},
      add(child){this.children.push(child);}};
    created.push(result);return result;
  }
  const ids=['station-library','query','category','book','scope','status','words','word-query','word-scope','word-search','word-clear','search-result','legacy-vocab-library'];
  const nodes=Object.fromEntries(ids.map(id=>[id==='station-library'||id==='legacy-vocab-library'?id:'station-library-'+id,node()]));
  const calls=[],window={},book={revisionId:'PUBLIC',displayName:'가상 교과서',categoryCode:'TEXTBOOK',sections:[{sectionId:'LESSON',label:'1과',wordCount:1}]};
  runInNewContext(source,{window,currentUser:{token:'SYNTHETIC_ONLY',role:'student'},Date,
    document:{getElementById:id=>nodes[id],createElement:node},
    Option:function(label,value){this.label=label;this.value=value;},
    loadVocabBooksOnce(){throw Error('UNEXPECTED_WHOLE_LEGACY_READ');},
    apiGet:params=>{calls.push(params);if(params.action==='getVocaCatalog')return Promise.resolve(catalogAnswer ? catalogAnswer(book) : {success:true,books:[book]});return answer(params);}});
  const changeSelect=async(id,value)=>{const target=nodes[id],previous=target.value;target.value=value;if(value!==previous)await target.handlers.change?.();};
  const enter=()=>nodes['station-library-word-query'].handlers.keydown({key:'Enter',preventDefault(){}});
  return {nodes,calls,window,created,changeSelect,enter};
}
const searchReply=word=>({success:true,count:1,truncated:false,words:[{revisionId:'PUBLIC',sectionId:'LESSON',word,meaning:'가상 뜻'}]});

test('impatient learner repeating Enter during slow search shares one remote request',async()=>{
  const pending=[];
  const h=fixture(p=>{assert.equal(p.action,'searchVoca');return new Promise(resolve=>pending.push(resolve));});
  await h.window.StationLibrary.open();
  h.nodes['station-library-word-query'].value='word';h.nodes['station-library-word-scope'].value='all';
  h.enter();h.enter();await flush();
  const actual=h.calls.filter(p=>p.action==='searchVoca').length;
  for(const resolve of pending)resolve(searchReply('word'));
  await flush();
  assert.equal(actual,1,'Enter on a disabled button must not duplicate the underlying expensive read');
  assert.equal(h.nodes['station-library-word-search'].disabled,false);
  assert.match(h.nodes['station-library-search-result'].children[0].textContent,/1개/);
});

test('temporary scope failure retries the same selected lesson without selecting another lesson',async()=>{
  let attempts=0;
  const h=fixture(async p=>{assert.equal(p.action,'getVocaSection');if(++attempts===1)throw Error('SYNTHETIC_NETWORK_DROP');return {success:true,revisionId:'PUBLIC',words:[{vocabWordId:'W',sectionId:'LESSON',word:'word',meaning:'뜻'}]};});
  await h.window.StationLibrary.open();
  await h.changeSelect('station-library-book','PUBLIC');
  await h.changeSelect('station-library-scope','0');
  await h.changeSelect('station-library-scope','0');
  assert.equal(attempts,1,'same native select option does not dispatch a second change event');
  const retry=h.created.find(node=>node.tagName==='BUTTON'&&node.textContent==='같은 범위 다시 불러오기');
  assert.ok(retry,'the error must offer an explicit same-scope retry action');
  await (retry.handlers.click?.()??retry.onclick?.());await flush();
  assert.equal(attempts,2);
  assert.equal(h.nodes['station-library-book'].value,'PUBLIC');
  assert.equal(h.nodes['station-library-scope'].value,'0');
  assert.match(h.nodes['station-library-status'].textContent,/1개/);
});

test('rapid different search words preserve the newest response even when the old response arrives later',async()=>{
  const pending=new Map();
  const h=fixture(p=>new Promise(resolve=>pending.set(p.query,resolve)));
  await h.window.StationLibrary.open();h.nodes['station-library-word-scope'].value='all';
  h.nodes['station-library-word-query'].value='old';h.enter();
  h.nodes['station-library-word-query'].value='new';h.nodes['station-library-word-query'].handlers.input();h.enter();await flush();
  pending.get('new')(searchReply('new'));await flush();
  const latest=h.nodes['station-library-search-result'].children[1].children[0].children[0].textContent;
  assert.match(latest,/new/);
  pending.get('old')(searchReply('old'));await flush();
  assert.equal(h.nodes['station-library-search-result'].children[1].children[0].children[0].textContent,latest);
});


test('offline first catalogue load has an explicit retry without closing the panel or reloading the app',async()=>{
  let catalogAttempts=0;
  const h=fixture(()=>{throw Error('NO_BODY_EXPECTED');},book=>++catalogAttempts===1?{success:false}:{success:true,books:[book]});
  await h.window.StationLibrary.open();
  const retry=h.created.find(node=>node.tagName==='BUTTON'&&node.textContent==='교재 목록 다시 불러오기');
  assert.ok(retry,'catalogue failure should offer a visible retry in the same panel');
  assert.equal(h.nodes['station-library'].open,true);
  await retry.handlers.click();await flush();
  assert.equal(catalogAttempts,2);
  assert.equal(h.nodes['station-library-book'].disabled,false);
  assert.equal(h.nodes['station-library-book'].children[1].value,'PUBLIC');
});

test('a failed shared search unlocks retry and never caches the failure as an empty result',async()=>{
  let searchAttempts=0;
  const h=fixture(async()=>{if(++searchAttempts===1)throw Error('SYNTHETIC_OFFLINE');return searchReply('restored');});
  await h.window.StationLibrary.open();h.nodes['station-library-word-scope'].value='all';h.nodes['station-library-word-query'].value='restored';
  h.enter();await flush();
  assert.equal(h.nodes['station-library-word-search'].disabled,false);
  assert.match(h.nodes['station-library-search-result'].textContent,/검색하지 못/);
  h.enter();await flush();
  assert.equal(searchAttempts,2);
  assert.match(h.nodes['station-library-search-result'].children[1].children[0].children[0].textContent,/restored/);
});

test('logout during pending search cannot publish old results or remove a new session shared flight',async()=>{
  const pending=[];
  const h=fixture(()=>new Promise(resolve=>pending.push(resolve)));
  await h.window.StationLibrary.open();h.nodes['station-library-word-scope'].value='all';h.nodes['station-library-word-query'].value='same';h.enter();
  assert.equal(pending.length,1);
  h.window.StationLibrary.reset();await h.window.StationLibrary.open();
  h.nodes['station-library-word-scope'].value='all';h.nodes['station-library-word-query'].value='same';h.enter();
  assert.equal(pending.length,2);
  pending[0](searchReply('old-session-result'));await flush();
  assert.equal(h.nodes['station-library-search-result'].children.length,0);
  h.enter();await flush();
  assert.equal(pending.length,2,'old flight completion must not evict the new session same-query flight');
  pending[1](searchReply('new-session-result'));await flush();
  assert.match(h.nodes['station-library-search-result'].children[1].children[0].children[0].textContent,/new-session-result/);
});

test('metadata completion after reset cannot unlock or overwrite a newer pending metadata request',async()=>{
  const pending=[];
  const h=fixture(()=>{throw Error('NO_BODY_EXPECTED');},book=>new Promise(resolve=>pending.push({resolve,book})));
  const old=h.window.StationLibrary.open();assert.equal(pending.length,1);
  h.window.StationLibrary.reset();const current=h.window.StationLibrary.open();assert.equal(pending.length,2);
  pending[0].resolve({success:true,books:[{...pending[0].book,revisionId:'OLD'}]});await old;
  const shared=h.window.StationLibrary.open();assert.equal(pending.length,2);
  assert.equal(h.nodes['station-library-book'].children.length,1,'old catalog must not populate options');
  pending[1].resolve({success:true,books:[pending[1].book]});await Promise.all([current,shared]);
  assert.equal(h.nodes['station-library-book'].children[1].value,'PUBLIC');
});

test('a retained retry button from a previous login cannot start requests in the next login',async()=>{
  let attempts=0;
  const h=fixture(async()=>{if(++attempts===1)throw Error('SYNTHETIC_OFFLINE');return {success:true,revisionId:'PUBLIC',words:[{vocabWordId:'W',sectionId:'LESSON',word:'word',meaning:'뜻'}]};});
  await h.window.StationLibrary.open();await h.changeSelect('station-library-book','PUBLIC');await h.changeSelect('station-library-scope','0');
  const staleRetry=h.created.find(node=>node.tagName==='BUTTON'&&node.textContent==='같은 범위 다시 불러오기');assert.ok(staleRetry);
  h.window.StationLibrary.reset();await h.window.StationLibrary.open();
  await h.changeSelect('station-library-book','PUBLIC');await h.changeSelect('station-library-scope','0');
  assert.equal(attempts,2);const visible=h.nodes['station-library-words'].children[0];
  await staleRetry.handlers.click();await flush();
  assert.equal(attempts,2);assert.equal(h.nodes['station-library-words'].children[0],visible);
});
