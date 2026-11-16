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
    {revisionId:'supp',displayName:'독해 기본',categoryCode:'SUPPLEMENTARY',sections:[]},
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
