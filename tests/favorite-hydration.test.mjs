import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const once=html.slice(html.indexOf('async function loadVocabBooksOnce('),html.indexOf('async function loadRetestOnce('));
const load=html.slice(html.indexOf('    async function loadVocabBooks('),html.indexOf('    async function loadVocabDays('));
const getRows=html.slice(html.indexOf('    function getFavoriteRows('),html.indexOf('    function showFavorites('));
const guard=html.slice(html.indexOf('    // Default favorites hydrate'),html.indexOf('    // Read-only staged native browse.'));
assert.ok(guard.includes('vocabNativePilot'));
const rows=[['book','day','word','meaning','order'],['B',1,'one','하나',1],['B',1,'two','둘',2]];
function fixture(search=''){
 const nodes=new Map(),requests=[],calls=[];
 const ctx={URLSearchParams,window:{location:{search}},currentUser:{token:'FAKE_A'},studentSessionEpoch:1,currentFavoriteFolder:'기본',favoriteFolders:{기본:['B|1|one'],other:['B|1|two']},vocabLoadedOnce:false,vocabLoadPromise:null,vocabData:[],escapeHtml:String,sortWordsByOrder:a=>a,makeWordKey:r=>r.slice(0,3).map(String).join('|'),loadVocabDays(){},showVocabList(){},activeTab:'favorites',getActiveTabId:()=>ctx.activeTab,document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:''});return nodes.get(id);}},apiGet:p=>new Promise((resolve,reject)=>requests.push({p,resolve,reject}))};
 for(const[kind,name]of [['render','showFavorites'],['test','startFavoriteTest'],['meaning','startFavoriteMeaningCheck']])ctx[name]=()=>calls.push({kind,words:ctx.getFavoriteRows().map(r=>r[2])});
 vm.createContext(ctx);vm.runInContext(once+'\n'+load+'\n'+getRows+'\n'+guard,ctx);
 return {ctx,nodes,requests,calls,node:id=>ctx.document.getElementById(id)};
}
test('a known favorite loads rows before rendering; test and meaning actions never begin with incomplete data',async()=>{
 const h=fixture(),view=h.ctx.showFavorites(),start=h.ctx.startFavoriteTest();assert.equal(h.requests.length,1);assert.deepEqual(h.calls,[]);assert.match(h.node('favorites-view').innerHTML,/불러오는 중/);
 h.requests[0].resolve({success:true,values:rows});await view;await start;assert.equal(h.calls.length,1);assert.equal(h.calls[0].kind,'test');assert.equal(h.calls[0].words.join(','),'one');
 await h.ctx.startFavoriteMeaningCheck();assert.equal(h.calls[1].kind,'meaning');assert.equal(h.requests.length,1);
});
test('empty favorite folders do not download the full legacy corpus',async()=>{
 const h=fixture();h.ctx.favoriteFolders.기본=[];await h.ctx.showFavorites();assert.equal(h.requests.length,0);assert.equal(h.calls.length,1);assert.equal(h.calls[0].kind,'render');
});
test('failed favorite hydration is retryable and does not claim the saved folder is empty',async()=>{
 const h=fixture(),a=h.ctx.showFavorites();h.requests[0].resolve({success:true,values:[rows[0]]});await a;
 assert.equal(h.calls.length,0);assert.equal(h.ctx.vocabLoadedOnce,false);assert.match(h.node('favorites-view').innerHTML,/favorites-retry/);assert.doesNotMatch(h.node('favorites-view').innerHTML,/폴더에 저장된 중요 단어가 없습니다/);
 const b=h.ctx.showFavorites(true);h.requests[1].resolve({success:true,values:rows});await b;assert.equal(h.calls.length,1);assert.equal(h.calls[0].words.join(','),'one');
});
test('folder switch while a shared read is pending renders only the latest selected keys',async()=>{
 const h=fixture(),a=h.ctx.showFavorites();h.ctx.currentFavoriteFolder='other';const b=h.ctx.showFavorites();assert.equal(h.requests.length,1);h.requests[0].resolve({success:true,values:rows});await a;await b;
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].words.join(','),'two');
});
test('logout/session change and leaving the tab discard a late favorite result',async()=>{
 for(const change of ['session','tab']){const h=fixture(),a=h.ctx.showFavorites();if(change==='session'){h.ctx.studentSessionEpoch++;h.ctx.currentUser={token:'FAKE_B'};}else h.ctx.activeTab='home';h.node('favorites-view').innerHTML='NEW_VIEW';h.requests[0].resolve({success:true,values:rows});await a;assert.equal(h.calls.length,0);assert.equal(h.node('favorites-view').innerHTML,'NEW_VIEW');}
});
test('unresolved stored keys are retained and cannot silently launch a partial test',async()=>{
 const h=fixture();h.ctx.favoriteFolders.기본=['B|1|one','B|1|missing'];const a=h.ctx.startFavoriteTest();h.requests[0].resolve({success:true,values:rows});await a;
 assert.equal(h.calls.length,0);assert.equal(h.ctx.favoriteFolders.기본.length,2);assert.match(h.node('favorites-view').innerHTML,/모두 확인하지 못/);
});
test('explicit native pilot keeps its original favorite transports and renderer',async()=>{
 const h=fixture('?vocabNativePilot=1');h.ctx.showFavorites();assert.equal(h.requests.length,0);assert.equal(h.calls.length,1);assert.equal(h.calls[0].kind,'render');
});
