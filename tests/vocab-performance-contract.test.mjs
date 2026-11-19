// Functional limits that keep large-scope rendering and recall preparation bounded.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {virtualStudent} from './helpers/virtual-student.mjs';
const source=readFileSync(new URL('../station-library.js',import.meta.url),'utf8');
function largeLibrary(){
 const make=tag=>({tagName:String(tag).toUpperCase(),value:'',children:[],handlers:{},textContent:'',
  addEventListener(name,fn){this.handlers[name]=fn;},replaceChildren(...children){this.children=children;this.value='';},
  append(...children){this.children.push(...children);},add(child){this.children.push(child);}});
 const ids=['station-library','query','category','book','scope','status','words','word-query','word-scope','word-search','word-clear','search-result'];
 const nodes=Object.fromEntries(ids.map(id=>[id==='station-library'?id:'station-library-'+id,make('div')]));
 const sections=Array.from({length:25},(_,i)=>({sectionId:'S'+i,label:'3과 Part '+(i+1),wordCount:200}));
 const body=sections.flatMap((s,i)=>Array.from({length:200},(_,j)=>({vocabWordId:'W'+(i*200+j),sectionId:s.sectionId,word:'term'+(i*200+j),meaning:'가상 뜻'})));
 const calls=[],practices=[],window={startPublicVocaPractice:value=>practices.push(value)};
 runInNewContext(source,{window,Date,currentUser:{token:'SYNTHETIC',role:'student'},
  document:{getElementById:id=>nodes[id],createElement:make},Option:function(text,value){this.text=text;this.value=value;},
  apiGet:async params=>{calls.push(params);return params.action==='getVocaCatalog'?{success:true,books:[{revisionId:'R',displayName:'큰 교재',sections}]}:{success:true,revisionId:'R',words:body.filter(w=>JSON.parse(params.sectionIdsJson).includes(w.sectionId))};}});
 return {nodes,calls,practices,window,async open(){await window.StationLibrary.open();nodes['station-library-book'].value='R';nodes['station-library-book'].handlers.change();nodes['station-library-scope'].value='0';await nodes['station-library-scope'].handlers.change();}};
}
test('5000-word scope renders at most 100 words per page but keeps every word reachable and learnable',async()=>{
 const h=largeLibrary();await h.open();const host=h.nodes['station-library-words'];
 const list=host.children[0],practice=host.children[1],pager=host.children[2];
 assert.equal(list.children.length,100);assert.equal(list.children[0].children[0].textContent,'term0');
 for(let i=0;i<49;i++){list.scrollTop=300;pager.children[2].handlers.click();assert.equal(list.children.length,100);assert.equal(list.scrollTop,0);}
 assert.equal(list.start,4901);assert.equal(list.children.at(-1).children[0].textContent,'term4999');assert.equal(pager.children[2].disabled,true);
 practice.handlers.click();assert.equal(h.practices[0].words.length,5000,'pagination cannot truncate actual practice data');
 assert.equal(h.calls.filter(call=>call.action==='getVocaCatalog').length,1);
 const bodyCalls=h.calls.filter(call=>call.action==='getVocaSection');
 assert.equal(bodyCalls.length,13,'5000 words must be split into 13 responses capped at 500 words each');
 assert.ok(bodyCalls.every(call=>JSON.parse(call.sectionIdsJson).length<=20));
 assert.ok(bodyCalls.every(call=>JSON.parse(call.sectionIdsJson).length*200<=500));
 assert.equal(h.calls.length,14,'pagination and practice must never fetch extra data');
});
test('broad local search paginates all 5000 matches without remote search and stale paging cannot alter the next login',async()=>{
 const h=largeLibrary();await h.open();h.nodes['station-library-word-scope'].value='section';h.nodes['station-library-word-query'].value='가상';
 await h.nodes['station-library-word-search'].handlers.click();
 const result=h.nodes['station-library-search-result'],list=result.children[1],pager=result.children[2];
 assert.match(result.children[0].textContent,/5000개/);assert.equal(list.children.length,100);
 for(let i=0;i<49;i++)pager.children[2].handlers.click();assert.equal(list.children.at(-1).children[0].textContent.startsWith('term4999'),true);
 assert.equal(h.calls.length,14,'local search and pagination must not request more server data');
 const before=list.children;h.window.StationLibrary.reset();pager.children[0].handlers.click();assert.equal(list.children,before);
});
test('200-word recall normalizes each source once while preserving distinct and safe alternatives',async()=>{
 const v=virtualStudent();await v.boot();const words=Array.from({length:200},(_,i)=>({vocabWordId:'R'+i,word:'term'+i,meaning:'뜻'+i}));
 v.context.startPublicVocaPractice({revisionId:'R',words});
 const original=v.context.normalizeAnswer;let calls=0;v.context.normalizeAnswer=value=>{calls++;return original(value);};
 v.context.assignedPracticeChooseMode('recall');assert.ok(calls<=1000,'normalization must not grow quadratically for a 200-word batch');
 assert.equal(v.read('assignedPracticeState.study.choiceMap.size'),200);
 for(const [index,choices] of v.read('assignedPracticeState.study.choiceMap')){
  assert.equal(choices.length,4);assert.equal(new Set(choices).size,4);
  assert.equal(choices.filter(choice=>v.context.isAssignedPracticeSpellingCorrect(choice,v.read('assignedPracticeState.rows')[index])).length,1);
 }
});

function legacyJourney(){
 const v=virtualStudent();const base=v.backend.answer.bind(v.backend);let stats=0,score='1/2';
 v.backend.answer=p=>{
  if(p.action==='getStudentStats'){stats++;return {success:true,latestScore:score,testCount:1,wrongCount:1};}
  if(p.action==='saveVocabResult'){score='2/2';return {success:true};}
  return base(p);
 };
 function select(){v.read('vocabData=[["교재","Day","영어","뜻","순서"],["기존",1,"apple","사과",1],["기존",1,"banana","바나나",2]]');v.node('vocab-book-select').value='기존';v.node('vocab-day-select').value='1';}
 return {v,select,stats:()=>stats};
}
test('legacy meaning/back/hide reuses fresh progress; grading invalidates it rather than showing an old score',async()=>{
 const {v,select,stats}=legacyJourney();await v.boot();select();v.context.showVocabList();await v.flush();assert.equal(stats(),1);
 v.context.startMeaningCheck();v.context.returnToVocabList();v.context.toggleWordHide();await v.flush();assert.equal(stats(),1);
 v.context.startVocabTest('meaning','all');v.node('answer-0').value='apple';v.node('answer-1').value='banana';v.node('vocab-result').scrollIntoView=()=>{};
 v.context.gradeVocabTest();await v.flush();v.context.returnToVocabList();await v.flush();
 assert.equal(stats(),2);assert.match(v.node('vocab-progress').innerHTML,/2\/2/);
 v.context.resetUserScopedState();assert.equal(v.context.renderStudentProgress.cache.size,0);
});
test('legacy progress cache expires and an old scope error cannot erase a newer scope',async()=>{
 const {v,select,stats}=legacyJourney();await v.boot();select();await v.context.renderStudentProgress('기존','1');assert.equal(stats(),1);
 v.advance(120001);await v.context.renderStudentProgress('기존','1');assert.equal(stats(),2);
 v.backend.hold.add('getStudentStats');
 v.node('vocab-day-select').value='2';const old=v.context.renderStudentProgress('기존','2');await v.flush();
 v.node('vocab-day-select').value='3';const latest=v.context.renderStudentProgress('기존','3');await v.flush();
 const [a,b]=v.backend.waiting.splice(0);b.resolve({success:true,latestScore:'3/3'});await latest;assert.match(v.node('vocab-progress').innerHTML,/3\/3/);
 a.reject(Error('OLD_SCOPE'));await old;assert.match(v.node('vocab-progress').innerHTML,/3\/3/);
});
