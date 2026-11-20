// All public-library tests are synthetic and never write official test results.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../station-library.js',import.meta.url),'utf8');
function element(){
  return {value:'',textContent:'',children:[],handlers:{},hidden:false,disabled:false,checked:false,
    addEventListener(name,fn){this.handlers[name]=fn;},
    replaceChildren(...items){this.children=items;this.value='';},
    append(...items){this.children.push(...items);},
    add(item){this.children.push(item);},
    setAttribute(name,value){this[name]=value;}};
}
const section=(id,label,count=2)=>({sectionId:id,label,sectionType:'QUESTION',wordCount:count});
const baseCatalog=[
  {revisionId:'MOCK26',displayName:'고2 2026년 9월 모의고사',categoryCode:'MOCK_EXAM',schoolLevel:'고등학교',gradeNo:2,publicationYear:2026,publicationMonth:'09',
    sections:[section('Q18','18번'),section('Q20','20번'),section('Q21','21번')]},
  {revisionId:'MOCK25',displayName:'고2 2025년 6월 모의고사',categoryCode:'MOCK_EXAM',schoolLevel:'고등학교',gradeNo:2,publicationYear:2025,publicationMonth:6,
    sections:[section('P18','18번')]},
  {revisionId:'BOOK',displayName:'해커스보카 수능필수',categoryCode:'VOCAB_BOOK',publisher:'해커스',sections:[section('DAY1','Day 1'),section('DAY2','Day 2')]},
  {revisionId:'CUSTOM',displayName:'ALL VOCA',categoryCode:'CUSTOM',sections:[section('C1','Unit 1')]},
  {revisionId:'EBS',displayName:'EBS 올림포스',categoryCode:'EBS',publisher:'EBS',sections:[section('E1','1강')]},
  {revisionId:'HIDDEN',displayName:'학교 시험 비공개',categoryCode:'SCHOOL_EXAM',studentVisible:false,sections:[section('H1','1과')]}
];
const names=['station-library','query','category','school-level','grade','curriculum','subject','year','month','publisher','clear-filters',
  'book','scope','status','words','range-list','selection-summary','selection-items',
  'select-all','clear-selection','combined-practice','selection-status','span-from','span-to','span-add','word-query',
  'word-scope','word-search','search-result'];
function setup({catalog=baseCatalog,apiOverride,userId,storage}={}){
  const nodes=Object.fromEntries(names.map(name=>[name==='station-library'?name:'station-library-'+name,element()]));
  const calls=[],practices=[],user={token:'SYNTHETIC',role:'student',id:userId};
  const window={startPublicVocaPractice:payload=>practices.push(payload)};
  if(storage)window.localStorage=storage;
  const get=async params=>{
    calls.push(params);
    if(params.action==='getVocaCatalog')return{success:true,books:catalog};
    if(apiOverride)return apiOverride(params);
    if(params.action==='getVocaSection'){
      const ids=JSON.parse(params.sectionIdsJson),words=[];
      for(const id of ids){
        const book=catalog.find(x=>x.revisionId===params.revisionId);
        const count=book.sections.find(x=>x.sectionId===id).wordCount;
        for(let i=0;i<count;i++)words.push({vocabWordId:id+'-'+i,sectionId:id,
          word:id==='DAY1'&&i===0?'shared':'word-'+id+'-'+i,
          meaning:id==='DAY1'&&i===0?'공통':'뜻-'+id+'-'+i,allowedAnswers:[]});
      }
      return{success:true,revisionId:params.revisionId,words};
    }
    return{success:false};
  };
  runInNewContext(source,{window,currentUser:user,Date,
    document:{getElementById:id=>nodes[id]||null,createElement:element},
    Option:function(label,value){this.label=label;this.value=value;},
    apiGet:get});
  return{nodes,calls,practices,window,user};
}
const values=node=>node.children.map(child=>child.value);
function pickBook(n,id){n['station-library-book'].value=id;n['station-library-book'].handlers.change();}
function pickRange(n,index){const box=n['station-library-range-list'].children[index].children[0];box.checked=true;box.handlers.change();}
const open=async h=>{h.nodes['station-library'].open=true;await h.window.StationLibrary.open();};
const reads=h=>h.calls.filter(x=>x.action==='getVocaSection');

test('verified publisher aliases are one filter value, but different publishers stay distinct',async()=>{
  const catalog=[
    {revisionId:'NE1',displayName:'공통영어1 능률',categoryCode:'TEXTBOOK',schoolLevel:'고',gradeNo:'1',publisher:'능률',sections:[section('L1','1과')]},
    {revisionId:'NE2',displayName:'공통영어2 NE능률',categoryCode:'TEXTBOOK',schoolLevel:'HIGH',gradeNo:'1',publisher:'NE능률',sections:[section('L2','2과')]},
    {revisionId:'C1',displayName:'영어2 천재',categoryCode:'TEXTBOOK',schoolLevel:'고',gradeNo:'2',publisher:'천재',sections:[section('L3','3과')]},
    {revisionId:'C2',displayName:'공통영어1 천재교과서',categoryCode:'TEXTBOOK',schoolLevel:'고',gradeNo:'1',publisher:'천재교과서',sections:[section('L4','4과')]},
    {revisionId:'H1',displayName:'해커스보카 수능필수',categoryCode:'VOCAB_BOOK',publisher:'해커스어학연구소',sections:[section('D1','Day 1')]},
    {revisionId:'H2',displayName:'해커스 보카 중학 기초',categoryCode:'VOCAB_BOOK',publisher:'해커스',sections:[section('D2','Day 2')]}
  ];
  const h=setup({catalog}),n=h.nodes;await open(h);
  n['station-library-category'].value='TEXTBOOK';n['station-library-category'].handlers.change();
  const publisherOptions=n['station-library-publisher'].children.map(x=>[x.value,x.label]);
  assert.deepEqual(publisherOptions[0],['','전체']);
  assert.deepEqual(publisherOptions.slice(1).map(([value])=>value).sort(),
    ['NE능률','천재','천재교과서'].sort());
  assert.equal(publisherOptions.length,4,'known equivalent labels must produce just one option');
  n['station-library-publisher'].value='NE능률';n['station-library-publisher'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','NE1','NE2']);
  n['station-library-category'].value='VOCAB';n['station-library-category'].handlers.change();
  assert.deepEqual(values(n['station-library-publisher']),['','해커스']);
  n['station-library-publisher'].value='해커스';n['station-library-publisher'].handlers.change();
  assert.deepEqual(values(n['station-library-book']).slice(1).sort(),['H1','H2']);
  n['station-library-query'].value='해커스';n['station-library-query'].handlers.input();
  assert.deepEqual(values(n['station-library-book']).slice(1).sort(),['H1','H2']);
  assert.equal(h.calls.length,1,'publisher facets are derived locally, not another server request');
});

test('supplement and EBS can be found together but keep their true source type',async()=>{
  const catalog=[
    {revisionId:'S1',displayName:'기본 독해 부교재',categoryCode:'SUPPLEMENT',schoolLevel:'HIGH',publisher:'',sections:[section('S1','Unit 1')]},
    {revisionId:'E1',displayName:'올림포스 독해',categoryCode:'EBS',schoolLevel:'HIGH',publisher:'EBS',sections:[section('E1','1강')]},
    {revisionId:'X1',displayName:'학원 내부',categoryCode:'CUSTOM',usageScope:'SCHOOL_EXAM',sections:[section('X1','1단원')]}
  ];
  const h=setup({catalog}),n=h.nodes;await open(h);
  n['station-library-category'].value='SUPPORT';n['station-library-category'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','S1','E1']);
  assert.match(n['station-library-book'].children[1].label,/부교재/);
  assert.match(n['station-library-book'].children[2].label,/EBS 교재/);
  n['station-library-category'].value='CUSTOM';n['station-library-category'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),[''],'private academy materials are never promoted to public');
  assert.equal(h.calls.length,1);
});

test('all registered school-level aliases collapse to one meaningful Korean option',async()=>{
  const sections=[section('ONE','단원 1',1)];
  const catalog=[
    {revisionId:'H-CODE',displayName:'고등 자료 A',categoryCode:'TEXTBOOK',schoolLevel:'HIGH',gradeNo:'1',sections},
    {revisionId:'H-SHORT',displayName:'고등 자료 B',categoryCode:'TEXTBOOK',schoolLevel:'고',gradeNo:'1',sections},
    {revisionId:'H-FULL',displayName:'고등 자료 C',categoryCode:'TEXTBOOK',schoolLevel:'고등학교',gradeNo:'2',sections},
    {revisionId:'M-CODE',displayName:'중등 자료 A',categoryCode:'TEXTBOOK',schoolLevel:'MIDDLE',gradeNo:'1',sections},
    {revisionId:'M-SHORT',displayName:'중등 자료 B',categoryCode:'TEXTBOOK',schoolLevel:'중',gradeNo:'2',sections},
    {revisionId:'E-CODE',displayName:'초등 자료 A',categoryCode:'TEXTBOOK',schoolLevel:'ELEMENTARY',sections},
    {revisionId:'E-SHORT',displayName:'초등 자료 B',categoryCode:'TEXTBOOK',schoolLevel:'초',sections}
  ];
  const h=setup({catalog}),n=h.nodes;await open(h);
  const options=n['station-library-school-level'].children.map(option=>[option.value,option.label]);
  assert.deepEqual(options,[['','전체'],['ELEMENTARY','초등학교'],['HIGH','고등학교'],['MIDDLE','중학교']]);
  n['station-library-school-level'].value='HIGH';n['station-library-school-level'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','H-CODE','H-SHORT','H-FULL']);
  n['station-library-school-level'].value='MIDDLE';n['station-library-school-level'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','M-CODE','M-SHORT']);
  n['station-library-school-level'].value='ELEMENTARY';n['station-library-school-level'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','E-CODE','E-SHORT']);
  assert.equal(h.calls.length,1,'alias normalization is local only');
});

test('mock exams use exactly 고1·고2·고3·수능, not duplicate 고/high-school controls',async()=>{
  const catalog=[
    {revisionId:'MOCK1',displayName:'고1 2026년 10월 모의고사',categoryCode:'MOCK_EXAM',
      schoolLevel:'고',gradeNo:'1',publicationYear:2026,publicationMonth:10,sections:[section('A','18번')]},
    {revisionId:'MOCK2',displayName:'고2 2026년 10월 모의고사',categoryCode:'MOCK_EXAM',
      schoolLevel:'HIGH',gradeNo:'2',publicationYear:'2026',publicationMonth:'10',sections:[section('B','18번')]},
    {revisionId:'MOCK3',displayName:'고3 2026년 10월 모의고사',categoryCode:'MOCK_EXAM',
      schoolLevel:'고등학교',gradeNo:'고3',publicationYear:'2026',publicationMonth:'10',sections:[section('C','18번')]},
    {revisionId:'CSAT',displayName:'2026년 대학수학능력시험',categoryCode:'MOCK_EXAM',
      schoolLevel:'',gradeNo:'',publicationYear:'',publicationMonth:'',sections:[section('D','18번')]}
  ];
  const h=setup({catalog}),n=h.nodes;await open(h);
  n['station-library-category'].value='MOCK_EXAM';n['station-library-category'].handlers.change();
  assert.equal(n['station-library-school-level'].disabled,true);
  assert.deepEqual(n['station-library-grade'].children.map(option=>[option.value,option.label]),
    [['','전체'],['1','고1'],['2','고2'],['3','고3'],['CSAT','수능']]);
  for(const [value,expected] of [['1','MOCK1'],['2','MOCK2'],['3','MOCK3'],['CSAT','CSAT']]){
    n['station-library-grade'].value=value;n['station-library-grade'].handlers.change();
    assert.deepEqual(values(n['station-library-book']),['',expected]);
  }
  assert.equal(h.calls.length,1,'category and grade filtering must be instantaneous without network calls');
});

test('category-specific dependent facets use actual catalog metadata, never title guesses',async()=>{
  const h=setup(),n=h.nodes;await open(h);
  n['station-library-category'].value='MOCK_EXAM';n['station-library-category'].handlers.change();
  assert.deepEqual(values(n['station-library-year']),['','2025','2026']);
  assert.deepEqual(values(n['station-library-month']),['','6','9']);
  assert.equal(n['station-library-publisher'].value,'');
  n['station-library-year'].value='2026';n['station-library-year'].handlers.change();
  assert.deepEqual(values(n['station-library-month']),['','9']);
  assert.deepEqual(values(n['station-library-book']),['','MOCK26']);
  n['station-library-category'].value='VOCAB';n['station-library-category'].handlers.change();
  assert.equal(n['station-library-year'].value,'','old mock year must be cleared');
  assert.equal(n['station-library-month'].value,'');
  assert.deepEqual(values(n['station-library-publisher']),['','해커스']);
  assert.deepEqual(values(n['station-library-book']),['','BOOK']);
  n['station-library-category'].value='CUSTOM';n['station-library-category'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','CUSTOM']);
  assert.equal(values(n['station-library-book']).includes('HIDDEN'),false);
  assert.equal(h.calls.length,1,'all metadata filters must be local');
});

test('changing a mock-exam year resets only incompatible downstream month, not the chosen year',async()=>{
  const h=setup(),n=h.nodes;await open(h);
  n['station-library-category'].value='MOCK_EXAM';n['station-library-category'].handlers.change();
  n['station-library-year'].value='2025';n['station-library-year'].handlers.change();
  n['station-library-month'].value='6';n['station-library-month'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','MOCK25']);
  n['station-library-year'].value='2026';n['station-library-year'].handlers.change();
  assert.equal(n['station-library-year'].value,'2026','year is the parent of month');
  assert.equal(n['station-library-month'].value,'','old June must clear when the year changes');
  assert.deepEqual(values(n['station-library-month']),['','9']);
  assert.deepEqual(values(n['station-library-book']),['','MOCK26']);
});

test('real-data-shaped CSAT with missing metadata is searchable without leaking the 수능 term into mock exams',async()=>{
  const catalog=[
    {revisionId:'MOCK',displayName:'고2 2026년 9월 모의고사',categoryCode:'MOCK_EXAM',
      schoolLevel:'HIGH',gradeNo:'2',publicationYear:'2026',publicationMonth:'9',sections:[section('M18','18번')]},
    {revisionId:'CSAT',displayName:'2026년 대학수학능력시험',categoryCode:'MOCK_EXAM',
      schoolLevel:'',gradeNo:'',publicationYear:'',publicationMonth:'',sections:[section('C18','18번')]},
    {revisionId:'OTHER',displayName:'해커스보카 수능필수',categoryCode:'VOCAB_BOOK',
      publisher:'해커스',sections:[section('D1','Day 1')]}
  ];
  const h=setup({catalog}),n=h.nodes;await open(h);
  n['station-library-query'].value='수능';n['station-library-query'].handlers.input();
  assert.deepEqual(values(n['station-library-book']),['','CSAT','OTHER'],
    '수능 검색은 일반 모의고사를 포함하면 안 된다');
  n['station-library-query'].value='';n['station-library-query'].handlers.input();
  n['station-library-category'].value='MOCK_EXAM';n['station-library-category'].handlers.change();
  // Historical CSAT metadata stays untouched, but the year literally printed
  // in its title is a usable display facet.
  assert.deepEqual(values(n['station-library-year']),['','2026']);
  n['station-library-grade'].value='CSAT';n['station-library-grade'].handlers.change();
  assert.deepEqual(values(n['station-library-year']),['','2026']);
  n['station-library-year'].value='2026';n['station-library-year'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','CSAT'],'CSAT title year should be selectable');
  assert.equal(n['station-library-book'].children[1].label.includes('대학수학능력시험'),true);
  assert.equal(h.calls.length,1,'filtering and searching catalog metadata must not read word bodies');
});

test('CSAT title-year facet does not invent administration dates or classify untitled years',async()=>{
  const catalog=[
    {revisionId:'CSAT18',displayName:'2018년 대학수학능력시험',categoryCode:'MOCK_EXAM',
      publicationYear:'',publicationMonth:'',gradeNo:'',sections:[section('A','18번')]},
    {revisionId:'CSAT_UNKNOWN',displayName:'대학수학능력시험 자료명 미확인',categoryCode:'MOCK_EXAM',
      publicationYear:'',publicationMonth:'',gradeNo:'',sections:[section('B','18번')]},
    {revisionId:'MOCK26',displayName:'고3 2026년 9월 모의고사',categoryCode:'MOCK_EXAM',
      gradeNo:'3',publicationYear:'2026',publicationMonth:'9',sections:[section('C','18번')]}
  ];
  const h=setup({catalog}),n=h.nodes;await open(h);
  n['station-library-category'].value='MOCK_EXAM';n['station-library-category'].handlers.change();
  assert.deepEqual(values(n['station-library-year']),['','2018','2026','__METADATA_NOT_REGISTERED__']);
  n['station-library-grade'].value='CSAT';n['station-library-grade'].handlers.change();
  n['station-library-year'].value='2018';n['station-library-year'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','CSAT18']);
  assert.equal(n['station-library-month'].disabled,true,'the title year must not guess the actual exam month');
  n['station-library-year'].value='__METADATA_NOT_REGISTERED__';n['station-library-year'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','CSAT_UNKNOWN']);
});

test('private and SCHOOL_EXAM scoped materials stay hidden despite public-looking category labels',async()=>{
  const catalog=[
    {revisionId:'PUBLIC',displayName:'고1 모의고사',categoryCode:'MOCK_EXAM',sections:[section('P18','18번')]},
    {revisionId:'PRIVATE',displayName:'비공개 학교시험',categoryCode:'TEXTBOOK',usageScope:'SCHOOL_EXAM',sections:[section('X1','1과')]},
    {revisionId:'CUSTOM',displayName:'비공개 자체자료',categoryCode:'CUSTOM',usageScope:'SCHOOL_EXAM',sections:[section('X2','단원')]}
  ];
  const h=setup({catalog}),n=h.nodes;await open(h);
  assert.deepEqual(values(n['station-library-book']),['','PUBLIC']);
  n['station-library-category'].value='CUSTOM';n['station-library-category'].handlers.change();
  assert.deepEqual(values(n['station-library-book']),['']);
  assert.equal(h.calls.length,1);
});

test('multiple mock questions and commercial Day combine without checkbox reads and keep scope on book switch',async()=>{
  const h=setup(),n=h.nodes;await open(h);
  pickBook(n,'MOCK26');pickRange(n,0);pickRange(n,1);
  assert.equal(reads(h).length,0);
  pickBook(n,'BOOK');pickRange(n,0);
  assert.match(n['station-library-selection-summary'].textContent,/3개/);
  assert.equal(n['station-library-selection-items'].children.length,3);
  assert.equal(reads(h).length,0);
  await n['station-library-combined-practice'].handlers.click();
  assert.equal(reads(h).length,2,'one verified batch per selected revision');
  assert.deepEqual(JSON.parse(reads(h)[0].sectionIdsJson),['Q18','Q20']);
  assert.deepEqual(JSON.parse(reads(h)[1].sectionIdsJson),['DAY1']);
  assert.equal(h.practices.length,1);
  assert.equal(h.practices[0].words.length,6);
  assert.ok(h.practices[0].words.every(word=>word.vocabWordId.includes(':')));
  pickBook(n,'MOCK26');
  assert.equal(n['station-library-range-list'].children[0].children[0].checked,true);
  assert.equal(n['station-library-range-list'].children[1].children[0].checked,true);
  h.window.StationLibrary.reset();
  assert.equal(n['station-library-selection-items'].children.length,0);
  assert.equal(n['station-library-combined-practice'].disabled,true);
});


test('contiguous selection includes both endpoints, keeps other books, and makes no checkbox API calls',async()=>{
  const h=setup(),n=h.nodes;await open(h);
  pickBook(n,'MOCK26');
  const from=n['station-library-span-from'],to=n['station-library-span-to'],add=n['station-library-span-add'];
  assert.deepEqual(values(from),['','0','1','2']);
  assert.equal(add.disabled,true,'both range endpoints must be explicitly selected');
  from.value='2';from.handlers.change();
  to.value='0';to.handlers.change();
  assert.equal(add.disabled,false);
  add.handlers.click();
  assert.match(n['station-library-selection-summary'].textContent,/3개/);
  assert.equal(n['station-library-select-all']['aria-checked'],'true');
  assert.equal(reads(h).length,0,'range selection must never request words');
  pickBook(n,'BOOK');
  assert.equal(from.value,'','the previous book must not leak its chosen start into the next book');
  assert.equal(to.value,'');
  assert.equal(add.disabled,true);
  from.value='0';from.handlers.change();to.value='1';to.handlers.change();add.handlers.click();
  assert.match(n['station-library-selection-summary'].textContent,/5개/);
  assert.equal(reads(h).length,0);
  await n['station-library-combined-practice'].handlers.click();
  assert.equal(h.practices.length,1);
  assert.equal(h.practices[0].words.length,10);
  assert.equal(reads(h).length,2);
  pickBook(n,'MOCK26');
  assert.ok(n['station-library-range-list'].children.every(x=>x.children[0].checked));
});

test('whole-book parent correctly announces none, partial, full and recovers after deselection',async()=>{
  const h=setup(),n=h.nodes;await open(h);pickBook(n,'MOCK26');
  const control=n['station-library-select-all'];
  assert.equal(control['aria-checked'],'false');
  pickRange(n,0);
  assert.equal(control['aria-checked'],'mixed');
  assert.match(control.textContent,/1\/3/);
  control.handlers.click();
  assert.equal(control['aria-checked'],'true');
  assert.match(control.textContent,/전체 해제/);
  control.handlers.click();
  assert.equal(control['aria-checked'],'false');
  assert.match(n['station-library-selection-summary'].textContent,/0개/);
  assert.equal(reads(h).length,0);
});

test('overlarge contiguous selection is atomic: no half-selected range and no remote calls',async()=>{
  const huge={revisionId:'HUGE',displayName:'대용량 교재',categoryCode:'VOCAB_BOOK',
    sections:Array.from({length:160},(_,i)=>section('D'+i,'Day '+(i+1),40))};
  const h=setup({catalog:[huge]}),n=h.nodes;await open(h);pickBook(n,'HUGE');
  const from=n['station-library-span-from'],to=n['station-library-span-to'];
  from.value='0';from.handlers.change();
  to.value='150';to.handlers.change();
  n['station-library-span-add'].handlers.click();
  assert.match(n['station-library-selection-summary'].textContent,/0개/);
  assert.match(n['station-library-selection-status'].textContent,/최대 선택량/);
  assert.equal(n['station-library-select-all']['aria-checked'],'false');
  assert.equal(reads(h).length,0);
  to.value='1';to.handlers.change();n['station-library-span-add'].handlers.click();
  assert.match(n['station-library-selection-summary'].textContent,/2개/);
  const before=n['station-library-selection-summary'].textContent;
  to.value='150';to.handlers.change();n['station-library-span-add'].handlers.click();
  assert.equal(n['station-library-selection-summary'].textContent,before,
    'a rejected bulk add must preserve the earlier basket intact');
  assert.equal(reads(h).length,0);
});


test('41 and 43 old mock labels are shared passages, never absent questions',async()=>{
  const book={revisionId:'EXAM',displayName:'고2 2026년 9월 모의고사',categoryCode:'MOCK_EXAM',
    sections:[section('Q18','18번',2),section('Q41','41번',4),section('Q43','43번',3)]};
  const h=setup({catalog:[book]}),n=h.nodes;
  await open(h);pickBook(n,'EXAM');
  const labels=n['station-library-range-list'].children.map(x=>x.children[1].textContent);
  assert.ok(labels.some(x=>x.includes('41~42번')),'41 and 42 share one real Section');
  assert.ok(labels.some(x=>x.includes('43~45번')),'43 through 45 share one real Section');
  assert.equal(labels.length,3,'no synthetic Section may be created for 42/44/45');
  const from=n['station-library-span-from'],to=n['station-library-span-to'];
  from.value='1';from.handlers.change();to.value='2';to.handlers.change();
  n['station-library-span-add'].handlers.click();
  assert.match(n['station-library-selection-summary'].textContent,/2개/);
  assert.equal(reads(h).length,0);
  await n['station-library-combined-practice'].handlers.click();
  assert.deepEqual(JSON.parse(reads(h)[0].sectionIdsJson),['Q41','Q43']);
  assert.equal(h.practices[0].words.length,7);
  const other=setup({catalog:[{...book,sections:[section('Q41','41번'),section('Q42','42번'),section('Q43','43번')]}]}),n2=other.nodes;
  await open(other);pickBook(n2,'EXAM');
  assert.equal(n2['station-library-range-list'].children[0].children[1].textContent.includes('41~42번'),false,
    'do not relabel a genuinely separate 42 Section');
});

test('verified curriculum/subject filters stay optional and missing metadata remains searchable',async()=>{
  const catalog=[
    {revisionId:'KNOWN',displayName:'공통영어1 NE능률(오선영)',editionLabel:'2022 개정',publicationYear:2022,categoryCode:'TEXTBOOK',
     schoolLevel:'고',gradeNo:'1',publisher:'능률',sections:[section('L1','1과')]},
    {revisionId:'UNKNOWN',displayName:'독해와작문 능률(민병천)',editionLabel:'',publicationYear:2022,categoryCode:'TEXTBOOK',
     schoolLevel:'고',gradeNo:'2',publisher:'능률',sections:[section('L2','2과')]},
    {revisionId:'MIDDLE',displayName:'중1 동아(윤)',editionLabel:'2022',publicationYear:2024,categoryCode:'TEXTBOOK',
     schoolLevel:'중',gradeNo:'1',publisher:'동아출판',sections:[section('L3','3과')]}
  ];
  const h=setup({catalog}),n=h.nodes;await open(h);
  n['station-library-category'].value='TEXTBOOK';n['station-library-category'].handlers.change();
  const curr=n['station-library-curriculum'];
  assert.deepEqual(values(curr),['','2022','__METADATA_NOT_REGISTERED__']);
  assert.match(curr.children[1].label,/2022 개정 교육과정/);
  assert.equal(n['station-library-subject'].children.some(x=>x.value==='독해와 작문'),true);
  curr.value='2022';curr.handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','KNOWN']);
  curr.value='__METADATA_NOT_REGISTERED__';curr.handlers.change();
  assert.deepEqual(values(n['station-library-book']),['','UNKNOWN','MIDDLE'],
    'blank edition is not inferred from publication year');
  assert.equal(h.calls.length,1,'all facets derive from one authorized public catalog');
  n['station-library-clear-filters'].handlers.click();
  assert.equal(n['station-library-category'].value,'');
  assert.deepEqual(values(n['station-library-book']).slice(1).sort(),['KNOWN','MIDDLE','UNKNOWN']);
});

test('textbook Lesson allows child Reading selections and mixed-state parent without duplicates',async()=>{
  const book={revisionId:'TEXT',displayName:'독해와작문 능률',categoryCode:'TEXTBOOK',sections:[
    section('R31','3과 Reading 1'),section('R32','3과 Reading 2'),section('R41','4과 Reading 1')
  ]};
  const h=setup({catalog:[book]}),n=h.nodes;await open(h);pickBook(n,'TEXT');
  const group=()=>n['station-library-range-list'].children[0];
  assert.equal(n['station-library-range-list'].children.length,2);
  const children=group().children[1].children[1].children;
  assert.equal(children.length,2);
  children[0].children[0].checked=true;children[0].children[0].handlers.change();
  assert.equal(group().children[0].children[0].indeterminate,true);
  assert.equal(group().children[0].children[0]['aria-checked'],'mixed');
  assert.match(n['station-library-selection-summary'].textContent,/1개/);
  const parent=group().children[0].children[0];parent.checked=true;parent.handlers.change();
  assert.equal(group().children[0].children[0].checked,true);
  assert.match(n['station-library-selection-summary'].textContent,/2개/);
  const sub2=group().children[1].children[1].children[1].children[0];
  sub2.checked=false;sub2.handlers.change();
  assert.equal(group().children[0].children[0].indeterminate,true);
  await n['station-library-combined-practice'].handlers.click();
  assert.deepEqual(JSON.parse(reads(h)[0].sectionIdsJson),['R31']);
  assert.equal(reads(h).length,1);
  assert.equal(h.practices[0].words.length,2);
});

test('saved selection list is device/account-scoped, content-free and rejected after revision drift',async()=>{
  const store=new Map();
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  const catalog=baseCatalog.map(b=>({...b,recordVersion:3}));
  const one=setup({catalog,userId:'STUDENT_A',storage});
  await open(one);pickBook(one.nodes,'MOCK26');pickRange(one.nodes,0);pickRange(one.nodes,1);
  assert.equal(store.size,1);
  const serialized=[...store.values()][0];
  assert.match(serialized,/MOCK26/);
  assert.doesNotMatch(serialized,/meaning|correct|word:|allowedAnswers|SYNTHETIC/,
    'never keep word bodies, exam results or session tokens');
  const newLogin=setup({catalog,userId:'STUDENT_A',storage});
  await open(newLogin);
  assert.match(newLogin.nodes['station-library-selection-summary'].textContent,/2개/);
  pickBook(newLogin.nodes,'MOCK26');
  assert.equal(newLogin.nodes['station-library-range-list'].children[0].children[0].checked,true);
  const otherLogin=setup({catalog,userId:'STUDENT_B',storage});
  await open(otherLogin);
  assert.match(otherLogin.nodes['station-library-selection-summary'].textContent,/0개/);
  const revised=catalog.map(b=>b.revisionId==='MOCK26'?{...b,recordVersion:4}:b);
  const stale=setup({catalog:revised,userId:'STUDENT_A',storage});
  await open(stale);
  assert.match(stale.nodes['station-library-selection-summary'].textContent,/0개/,
    'a changed revision must never silently reuse the saved selection');
  assert.equal(stale.calls.length,1);
});

test('exact same word and meaning is collapsed, different meaning remains as a separate card',async()=>{
  const h=setup({apiOverride:params=>{
    const words=JSON.parse(params.sectionIdsJson).map(id=>({vocabWordId:id,sectionId:id,
      word:'issue',meaning:id==='DAY2'?'발행하다':'문제',allowedAnswers:[]}));
    return{success:true,revisionId:params.revisionId,words};
  },catalog:[{revisionId:'BOOK',displayName:'책',categoryCode:'VOCAB_BOOK',
    sections:[section('DAY1','Day 1',1),section('DAY2','Day 2',1),section('DAY3','Day 3',1)]}]});
  await open(h);pickBook(h.nodes,'BOOK');h.nodes['station-library-select-all'].handlers.click();
  await h.nodes['station-library-combined-practice'].handlers.click();
  assert.equal(h.practices.length,1);
  assert.equal(h.practices[0].words.length,2);
  assert.match(h.nodes['station-library-selection-status'].textContent,/중복 1개/);
});

test('partial failure never launches a study, and repeat request can recover',async()=>{
  let fail=true;const h=setup({apiOverride:params=>{
    if(fail&&params.revisionId==='BOOK')return{success:false};
    const ids=JSON.parse(params.sectionIdsJson);
    return{success:true,revisionId:params.revisionId,words:ids.flatMap(id=>
      Array.from({length:2},(_,i)=>({vocabWordId:id+i,sectionId:id,word:id+i,meaning:'뜻'})))};
  }});await open(h);pickBook(h.nodes,'MOCK26');pickRange(h.nodes,0);pickBook(h.nodes,'BOOK');pickRange(h.nodes,0);
  await h.nodes['station-library-combined-practice'].handlers.click();
  assert.equal(h.practices.length,0);assert.match(h.nodes['station-library-selection-status'].textContent,/중단/);
  fail=false;await h.nodes['station-library-combined-practice'].handlers.click();
  assert.equal(h.practices.length,1,'retry does not require re-selection');
});

test('selected scope is loaded in batches of at most twenty IDs and five hundred words',async()=>{
  const book={revisionId:'BIG',displayName:'대형 교재',categoryCode:'VOCAB_BOOK',
    sections:Array.from({length:21},(_,i)=>section('S'+i,'Day '+(i+1),30))};
  const h=setup({catalog:[book]});await open(h);pickBook(h.nodes,'BIG');
  h.nodes['station-library-select-all'].handlers.click();
  await h.nodes['station-library-combined-practice'].handlers.click();
  assert.equal(h.practices.length,1);assert.equal(h.practices[0].words.length,630);
  assert.ok(reads(h).every(request=>JSON.parse(request.sectionIdsJson).length<=20));
  assert.ok(reads(h).every(request=>JSON.parse(request.sectionIdsJson).length*30<=500));
  assert.equal(reads(h).length,2);
});

test('a basket change during a delayed load invalidates the late response',async()=>{
  let finish;
  const h=setup({apiOverride:params=>new Promise(resolve=>{finish=resolve;})});
  await open(h);pickBook(h.nodes,'BOOK');pickRange(h.nodes,0);
  const pending=h.nodes['station-library-combined-practice'].handlers.click();
  h.nodes['station-library-clear-selection'].handlers.click();
  finish({success:true,revisionId:'BOOK',words:[
    {sectionId:'DAY1',vocabWordId:'A',word:'a',meaning:'가'},
    {sectionId:'DAY1',vocabWordId:'B',word:'b',meaning:'나'}]});
  await pending;assert.equal(h.practices.length,0);
});

test('one section larger than the published API cap fails closed without sending a truncated request',async()=>{
  const book={revisionId:'B',displayName:'과대 범위',categoryCode:'TEXTBOOK',
    sections:[section('BIG','3과 Reading',501)]};
  const h=setup({catalog:[book]});await open(h);pickBook(h.nodes,'B');pickRange(h.nodes,0);
  await h.nodes['station-library-combined-practice'].handlers.click();
  assert.equal(reads(h).length,0);assert.equal(h.practices.length,0);
  assert.match(h.nodes['station-library-selection-status'].textContent,/중단/);
});
