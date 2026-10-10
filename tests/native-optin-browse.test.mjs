import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('    // Read-only staged native browse. Default route remains byte-preserved.');
const end=html.indexOf('    window.onload = async () => {',start);
assert.ok(start>=0&&end>start);const injected=html.slice(start,end);
test('native pilot is explicitly opt-in; normal URLs preserve original functions',()=>{
 for(const search of ['', '?other=1', '?vocabNativePilot=0']){
  const original=()=>{};const c=vm.createContext({URLSearchParams,window:{location:{search}},loadVocabBooks:original});
  vm.runInContext(injected,c);assert.equal(c.loadVocabBooks,original);
 }
});
function fixture(){
 const elements=Object.fromEntries(['vocab-view','vocab-book-select','vocab-day-select','vocab-progress','vocab-search-result','vocab-search-scope','favorites-view'].map(id=>[id,{value:'',innerHTML:''}]));
 const calls=[],renders=[];const row=['Book',1,'false','0',1,'B','["true"]'];
 const c={URLSearchParams,window:{location:{search:'?vocabNativePilot=1'}},structuredClone,studentSessionEpoch:1,vocabData:[],document:{getElementById:id=>elements[id]},escapeHtml:String,currentFavoriteFolder:'default',favoriteFolders:{default:[]},sortWordsByOrder:x=>x,makeWordKey:()=>'',loadVocabBooks(){},loadVocabDays(){},showVocabList:()=>renders.push('body'),searchVocab:()=>renders.push('search'),showFavorites(){},startFavoriteTest(){},startFavoriteMeaningCheck(){},getFavoriteRows(){},apiGet:async p=>{
  calls.push(p.action);
  if(p.action==='getLegacyNativeBrowseCatalog')return {success:true,schema:'STUDENT_LEGACY_NATIVE_BROWSE_V1',books:[{name:'Book',bookId:'B',revisionId:'LEGACYDTO-H',sourceFacet:'LEGACY_STUDENT_BOOK_DAY',sections:[{sectionId:'S',day:1,wordCount:1}]}]};
  if(p.action==='getLegacyNativeBrowseSection')return {success:true,schema:'STUDENT_LEGACY_NATIVE_BROWSE_V1',bookId:'B',revisionId:'LEGACYDTO-H',sectionId:'S',rows:[row]};
  throw Error('UNEXPECTED_FULL_READ');
 }};
 vm.createContext(c);vm.runInContext(injected,c);return {c,elements,calls,renders,row};
}
test('actual embedded pilot requests metadata then selected body, reuses body for Day search',async()=>{
 const {c,elements,calls,renders,row}=fixture();assert.equal(await c.loadVocabBooks(),true);
 assert.deepEqual(calls,['getLegacyNativeBrowseCatalog']);elements['vocab-book-select'].value='Book';await c.loadVocabDays();elements['vocab-day-select'].value='1';await c.showVocabList();
 assert.deepEqual(JSON.parse(JSON.stringify(c.vocabData[1])),row);elements['vocab-search-scope'].value='current-day';await c.searchVocab();
 assert.deepEqual(calls,['getLegacyNativeBrowseCatalog','getLegacyNativeBrowseSection']);assert.deepEqual(renders,['body','search']);
});
test('failed selected integrity does not download the legacy full table',async()=>{
 const {c,elements,calls}=fixture();await c.loadVocabBooks();elements['vocab-book-select'].value='Book';await c.loadVocabDays();elements['vocab-day-select'].value='1';
 c.apiGet=async p=>{calls.push(p.action);throw Error('BODY_INTEGRITY');};await c.showVocabList();assert.match(elements['vocab-view'].innerHTML,/BODY_INTEGRITY/);assert.equal(calls.includes('getVocabData'),false);
});
test('read timing observations contain only numeric counts and action, never scope or credentials',async()=>{
 const {c,elements,calls}=fixture();let saved;
 elements['vocab-view'].setAttribute=(name,value)=>{assert.equal(name,'data-native-read-observations');saved=JSON.parse(value);};
 await c.loadVocabBooks();elements['vocab-book-select'].value='Book';await c.loadVocabDays();elements['vocab-day-select'].value='1';await c.showVocabList();
 assert.equal(calls.length,2);assert.equal(saved.length,2);
 for(const item of saved){assert.deepEqual(Object.keys(item).sort(),['action','apiSuccess','booksReturned','clientElapsedMs','rowsReturned'].sort());assert.equal(item.apiSuccess,true);assert.ok(item.clientElapsedMs>=0);}
 assert.equal(saved[0].booksReturned,1);assert.equal(saved[1].rowsReturned,1);
 assert.equal(JSON.stringify(saved).includes('LEGACYDTO-H'),false);
});
