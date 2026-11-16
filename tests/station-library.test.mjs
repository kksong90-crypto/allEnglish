import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../station-library.js', import.meta.url), 'utf8');
function fakeNode() {
  return {
    value: '', children: [], handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn; },
    replaceChildren(...children) { this.children = children; this.value = ''; },
    add(child) { this.children.push(child); },
    append(...children) { this.children.push(...children); },
  };
}

test('searches 217 titles and fetches only the chosen lesson; stale responses are discarded', async () => {
  const nodes = Object.fromEntries(['station-library','query','book','scope','status','words']
    .map(name => [name === 'station-library' ? name : `station-library-${name}`, fakeNode()]));
  const panel = nodes['station-library'];
  const query = nodes['station-library-query'];
  const books = nodes['station-library-book'];
  const scope = nodes['station-library-scope'];
  const words = nodes['station-library-words'];
  const calls = [];
  let finish;
  const published = Array.from({length:217}, (_,i) => ({
    revisionId: `REV${i}`, displayName: i ? `단어장 ${i}` : '중1 동아(윤)', categoryCode:'TEXTBOOK',
    sections: [{sectionId:'L3a',label:'3과 Reading 1',wordCount:1},
      {sectionId:'L3b',label:'3과 Reading 2',wordCount:1},{sectionId:'L4',label:'4과',wordCount:1}],
  }));
  const window = {};
  runInNewContext(source, { window, currentUser: {token:'synthetic'},
    document: {getElementById:id => nodes[id], createElement:fakeNode},
    Option: function(label,value) { this.label=label; this.value=value; },
    apiGet: params => {
      calls.push(params);
      if (params.action === 'getVocaCatalog') return {success:true,books:published};
      return new Promise(resolve => { finish=resolve; });
    },
  });
  assert.equal(calls.length,0);
  panel.open=true;
  await panel.handlers.toggle();
  assert.equal(books.children.length,218);
  query.value='동아 윤';
  query.handlers.input();
  assert.equal(books.children.length,2);
  books.value='REV0';
  books.handlers.change();
  assert.equal(scope.children.length,3);
  assert.equal(calls.length,1);
  scope.value='0';
  const pending=scope.handlers.change();
  assert.deepEqual(JSON.parse(calls[1].sectionIdsJson),['L3a','L3b']);
  finish({success:true,revisionId:'REV0',words:[{sectionId:'L3a',word:'one',meaning:'하나'},{sectionId:'L3b',word:'two',meaning:'둘'}]});
  await pending;
  assert.equal(words.children[0].children.length,2);
  scope.value='1';
  const stale=scope.handlers.change();
  window.StationLibrary.reset();
  finish({success:true,revisionId:'REV0',words:[{sectionId:'L4',word:'stale'}]});
  await stale;
  assert.equal(words.children.length,0);
});

test('published textbook, mock exam and supplementary metadata remain searchable; internal and hidden revisions stay excluded', async () => {
  const nodes = Object.fromEntries(['station-library','query','book','scope','status','words']
    .map(name => [name === 'station-library' ? name : `station-library-${name}`, fakeNode()]));
  const rows = [
    {revisionId:'text',displayName:'영어 1',categoryCode:'TEXTBOOK',publisher:'동아',sections:[{sectionId:'lesson',sectionType:'LESSON',sectionNo:3,wordCount:1}]},
    {revisionId:'mock',displayName:'전국연합',categoryCode:'MOCK_EXAM',publicationYear:'2026',publicationMonth:'9',sections:[{sectionId:'q18',label:'18번',sectionType:'QUESTION',wordCount:1}]},
    {revisionId:'supp',displayName:'독해 기본',categoryCode:'SUPPLEMENT',sections:[]},
    {revisionId:'internal',displayName:'비공개',categoryCode:'TEXTBOOK',usageScope:'SCHOOL_EXAM',sections:[]},
    {revisionId:'hidden',displayName:'미게시',studentVisible:false,sections:[]},
    {revisionId:'points',displayName:'포인트',categoryCode:'POINT_SPECIAL',sections:[]},
  ];
  const calls=[];
  runInNewContext(source, {window:{},currentUser:{token:'synthetic'},
    document:{getElementById:id=>nodes[id],createElement:fakeNode},
    Option:function(label,value){this.label=label;this.value=value;},
    apiGet:params=>{calls.push(params);return params.action==='getVocaCatalog'?{success:true,books:rows}:{success:true,revisionId:params.revisionId,words:[{sectionId:'q18',word:'example',meaning:'예'}]};},
  });
  nodes['station-library'].open=true;
  await nodes['station-library'].handlers.toggle();
  const books=nodes['station-library-book'],query=nodes['station-library-query'],scope=nodes['station-library-scope'];
  assert.equal(books.children.length,4);
  query.value='모의고사 2026 9';query.handlers.input();
  assert.equal(books.children.length,2);assert.equal(books.children[1].value,'mock');
  books.value='mock';books.handlers.change();scope.value='0';await scope.handlers.change();
  assert.deepEqual(JSON.parse(calls[1].sectionIdsJson),['q18']);
  assert.equal(nodes['station-library-words'].children[0].children.length,1);
  query.value='교과서 동아';query.handlers.input();assert.equal(books.children.length,2);
  books.value='text';books.handlers.change();assert.match(scope.children[1].label,/범위 3/);assert.doesNotMatch(scope.children[1].label,/Day/);
  query.value='부교재';query.handlers.input();assert.equal(books.children[1].value,'supp');
});

test('administrator can open public catalog and launch selected scope preview; stale button cannot launch', async()=>{
 const nodes=Object.fromEntries(['station-library','query','book','scope','status','words'].map(name=>[name==='station-library'?name:`station-library-${name}`,fakeNode()]));
 const calls=[],previews=[],window={startPublicVocaPreview:payload=>previews.push(payload)};
 const rows=[{revisionId:'R',displayName:'공개 교과서',categoryCode:'TEXTBOOK',sections:[{sectionId:'L1',label:'1과',wordCount:1}]}];
 runInNewContext(source,{window,currentUser:{token:'synthetic-admin',role:'admin'},document:{getElementById:id=>nodes[id],createElement:fakeNode},Option:function(label,value){this.label=label;this.value=value;},apiGet:params=>{calls.push(params);return params.action==='getVocaCatalog'?{success:true,books:rows}:{success:true,revisionId:'R',words:[{vocabWordId:'W1',sectionId:'L1',word:'one',meaning:'하나'}]};}});
 nodes['station-library'].open=true;await nodes['station-library'].handlers.toggle();assert.equal(calls.length,1);
 nodes['station-library-book'].value='R';nodes['station-library-book'].handlers.change();nodes['station-library-scope'].value='0';await nodes['station-library-scope'].handlers.change();
 const button=nodes['station-library-words'].children[1];assert.match(button.textContent,/학생 연습 미리보기/);button.handlers.click();assert.equal(previews.length,1);assert.equal(previews[0].revisionId,'R');assert.equal(calls.length,2);
 window.StationLibrary.reset();button.handlers.click();assert.equal(previews.length,1);
});

test('category filtering, verified range cache and student practice preserve scope and reset on logout', async () => {
  const nodes = Object.fromEntries(['station-library','query','category','book','scope','status','words']
    .map(name => [name === 'station-library' ? name : `station-library-${name}`, fakeNode()]));
  const calls = [], practices = [];
  const window = {startPublicVocaPractice:value => practices.push(value)};
  runInNewContext(source, {window, currentUser:{token:'student',role:'student'},
    document:{getElementById:id=>nodes[id],createElement:fakeNode},
    Option:function(label,value){this.label=label;this.value=value;},
    apiGet:async params=>{
      calls.push(params);
      return params.action === 'getVocaCatalog' ? {success:true,books:[
        {revisionId:'text',displayName:'교과서',categoryCode:'TEXTBOOK',sections:[]},
        {revisionId:'book',displayName:'어휘',categoryCode:'WORD_BOOK',sections:[{sectionId:'D1',label:'Day 1',wordCount:1}]}
      ]} : {success:true,revisionId:'book',words:[{sectionId:'D1',word:'one',meaning:'하나'}]};
    }});
  nodes['station-library'].open=true;await nodes['station-library'].handlers.toggle();
  nodes['station-library-category'].value='VOCAB';nodes['station-library-category'].handlers.change();
  const book=nodes['station-library-book'],scope=nodes['station-library-scope'];
  assert.equal(book.children.length,2);assert.equal(book.children[1].value,'book');
  book.value='book';book.handlers.change();scope.value='0';await scope.handlers.change();
  const first=nodes['station-library-words'].children[1];
  first.handlers.click();assert.equal(practices.length,1);assert.equal(practices[0].revisionId,'book');
  scope.value='0';await scope.handlers.change();assert.equal(calls.length,2);
  window.StationLibrary.reset();first.handlers.click();assert.equal(practices.length,1);
  nodes['station-library'].open=true;await nodes['station-library'].handlers.toggle();
  book.value='book';book.handlers.change();scope.value='0';await scope.handlers.change();
  assert.equal(calls.length,4);
});

function searchLibrary(handler, role='student') {
  const nodes = Object.fromEntries(['station-library','query','category','book','scope','status','words','word-query','word-scope','word-search','word-clear','search-result','legacy-vocab-library']
    .map(name => [name === 'station-library' || name === 'legacy-vocab-library' ? name : `station-library-${name}`, fakeNode()]));
  const calls=[], practices=[], window={startPublicVocaPractice:value=>practices.push(value)};
  const catalog=[{revisionId:'R',displayName:'고2 전국연합',publicationYear:2026,publicationMonth:10,categoryCode:'MOCK_EXAM',
    sections:[{sectionId:'S',label:'18번',wordCount:1}]}];
  runInNewContext(source,{window,Date,currentUser:{token:'student',role},
    document:{getElementById:id=>nodes[id],createElement:fakeNode},
    Option:function(label,value){this.label=label;this.value=value;},loadVocabBooksOnce:()=>calls.push({action:'LEGACY_FULL'}),
    apiGet:async params=>{calls.push(params);return handler ? handler(params,catalog) : params.action==='getVocaCatalog'?{success:true,books:catalog}:params.action==='searchVoca'?{success:true,count:1,words:[{revisionId:'R',sectionId:'S',word:'evaluate',meaning:'평가하다'}]}:{success:true,revisionId:'R',words:[{sectionId:'S',word:'evaluate',meaning:'평가하다'}]};}
  });
  return {nodes,calls,window,practices,catalog};
}
test('default vocabulary entry reads metadata only; whole-word search is bounded and cached; Korean month matches',async()=>{
 const {nodes,calls,window}=searchLibrary();
 await window.StationLibrary.open();assert.deepEqual(calls.map(p=>p.action),['getVocaCatalog']);
 nodes['station-library-query'].value='고2 10월';nodes['station-library-query'].handlers.input();
 assert.equal(nodes['station-library-book'].children.length,2);
 nodes['station-library-word-query'].value='evaluate';nodes['station-library-word-scope'].value='all';
 await nodes['station-library-word-search'].handlers.click();
 assert.equal(calls[1].action,'searchVoca');assert.equal(calls[1].revisionId,'');
 assert.match(nodes['station-library-search-result'].children[0].textContent,/1개/);
 await nodes['station-library-word-search'].handlers.click();assert.equal(calls.length,2);
 assert.equal(calls.some(p=>p.action==='getVocabData'||p.action==='LEGACY_FULL'),false);
});
test('selected-range search reuses the verified body without remote search; clearing or logout invalidates pending search',async()=>{
 let finish;
 const {nodes,calls,window}=searchLibrary((p,catalog)=>p.action==='getVocaCatalog'?{success:true,books:catalog}:p.action==='searchVoca'?new Promise(resolve=>finish=resolve):{success:true,revisionId:'R',words:[{sectionId:'S',word:'evaluate',meaning:'평가하다'}]});
 await window.StationLibrary.open();nodes['station-library-book'].value='R';nodes['station-library-book'].handlers.change();nodes['station-library-scope'].value='0';await nodes['station-library-scope'].handlers.change();
 nodes['station-library-word-scope'].value='section';nodes['station-library-word-query'].value='평가';
 await nodes['station-library-word-search'].handlers.click();assert.equal(calls.length,2);
 assert.match(nodes['station-library-search-result'].children[0].textContent,/1개/);
 nodes['station-library-word-scope'].value='all';const pending=nodes['station-library-word-search'].handlers.click();
 window.StationLibrary.reset();finish({success:true,words:[{revisionId:'R',sectionId:'S',word:'old',meaning:'old'}]});await pending;
 assert.equal(nodes['station-library-search-result'].children.length,0);
 assert.equal(nodes['station-library-word-search'].disabled,false);
});
test('a lesson with more than twenty sections is fetched in bounded batches without dropping words',async()=>{
 const {nodes,calls,window,catalog}=searchLibrary((p,books)=>p.action==='getVocaCatalog'?{success:true,books}: {success:true,revisionId:'R',words:JSON.parse(p.sectionIdsJson).map(id=>({vocabWordId:id,sectionId:id,word:id,meaning:'뜻'}))});
 catalog[0].sections=Array.from({length:41},(_,i)=>({sectionId:'S'+i,label:'3과 Reading '+i,wordCount:1}));
 await window.StationLibrary.open();nodes['station-library-book'].value='R';nodes['station-library-book'].handlers.change();nodes['station-library-scope'].value='0';await nodes['station-library-scope'].handlers.change();
 assert.equal(calls.length,4);assert.deepEqual(calls.slice(1).map(p=>JSON.parse(p.sectionIdsJson).length),[20,20,1]);
 assert.equal(nodes['station-library-words'].children[0].children.length,41);
 assert.match(nodes['station-library-status'].textContent,/41개/);
});
test('server search cannot display unpublished or unlisted revisions, and failures can retry',async()=>{
 let bad=true;
 const {nodes,calls,window}=searchLibrary((p,catalog)=>p.action==='getVocaCatalog'?{success:true,books:catalog}:{success:true,count:1,words:[{revisionId:bad?'PRIVATE':'R',sectionId:'S',word:'secret',meaning:'뜻'}]});
 await window.StationLibrary.open();nodes['station-library-word-query'].value='secret';nodes['station-library-word-scope'].value='all';
 await nodes['station-library-word-search'].handlers.click();assert.match(nodes['station-library-search-result'].textContent,/검색하지 못/);
 assert.equal(nodes['station-library-search-result'].children.length,0);
 bad=false;await nodes['station-library-word-search'].handlers.click();assert.equal(calls.length,3);
 assert.equal(nodes['station-library-search-result'].children[1].children.length,1);
});
