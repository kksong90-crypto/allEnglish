// Shuffle policy contracts: synthetic state only, no DOM timing or production requests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const moduleSource=readFileSync(new URL('../practice-experience.js',import.meta.url),'utf8');
const shuffleSource=html.slice(html.indexOf('function shuffleAssignedPractice('),html.indexOf('async function startAssignedVocaPractice('));
const mockSource=html.slice(html.indexOf('function assignedPracticeChooseMode('),html.indexOf('function assignedPracticeCurrentIndex('));
function fixture(count=8,randomValues=null){
 const rows=Object.freeze(Array.from({length:count},(_,i)=>Object.freeze(['BOOK','Day 1','word'+i,'뜻'+i,i,'B','word'+i,'W'+i])));
 const handlers={},root={innerHTML:'',isConnected:false,insertAdjacentHTML(){},querySelector(){return null;}};
 let seed=9,draws=0;
 const math=Object.create(Math);math.random=()=>{const position=draws++;if(randomValues)return randomValues[position%randomValues.length];seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const state={rows:count>200?rows.slice(0,200):rows,sourceRows:rows,batchStart:0,planDate:'가상 범위',personal:true,token:'SYNTHETIC',epoch:1,mode:'',finished:true};
 const ctx={Math:math,Map,Set,console,assignedPracticeState:state,currentTestMeta:null,testAlreadySaved:true,
  escapeHtml:String,requestAnimationFrame:()=>0,isAssignedPracticeCurrent:()=>true,assignedPracticeBatchControls:()=>'',
  confirmAssignedPracticeExit:()=>true,isAssignedPracticeSpellingCorrect:(answer,row)=>answer===row[2],
  document:{getElementById:id=>id==='practice-view'?root:null,addEventListener:(type,fn)=>handlers[type]=fn,querySelector:()=>null},
  renderTest:(words,meta)=>{ctx.mockOrders.push({words,meta});ctx.currentVocabWords=words;ctx.currentTestMeta=meta;},mockOrders:[]};
 ctx.window=ctx;runInNewContext(shuffleSource+'\n'+mockSource+'\n'+moduleSource,ctx);ctx.PracticeExperience.render();
 const click=(pe,dataset={},detail=0)=>handlers.click({detail,target:{closest:()=>({disabled:false,dataset:{pe,...dataset}})}});
 return {ctx,state,rows,root,click,draws:()=>draws};
}
const sameMembers=(actual,expected)=>assert.deepEqual([...actual].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b));

test('Fisher–Yates uses a copy, preserves row identities, and permits a chance repeated ordering',()=>{
 const h=fixture(5,[0.999999]);const input=Object.freeze([0,1,2,3,4]);
 const first=h.ctx.shuffleAssignedPractice(input),second=h.ctx.shuffleAssignedPractice(input);
 assert.notEqual(first,input);assert.notEqual(first,second);sameMembers(first,input);sameMembers(second,input);
 assert.deepEqual([...first],[...second],'same ordering is valid when the random draws produce it');
 assert.deepEqual([...input],[0,1,2,3,4]);
 const rowCopy=h.ctx.shuffleAssignedPractice(h.rows);assert.equal(new Set(rowCopy).size,h.rows.length);assert.ok(rowCopy.every(row=>h.rows.includes(row)));
});

test('initial round shuffles all indices once; start, previous, stage, experience and resume preserve that order',()=>{
 const h=fixture(),initial=[...h.state.experience.queue],initialDraws=h.draws();
 sameMembers(initial,h.rows.map((_,i)=>i));assert.equal(new Set(initial).size,h.rows.length);assert.ok(initialDraws>=h.rows.length-1);
 h.click('start');h.click('known');h.click('next');h.click('prev');h.click('stage',{stage:'spell'});
 const w=h.state.experience,i=w.queue[w.positions.spell];w.drafts.set('spell:'+i,'saved-synthetic-draft');
 h.click('view',{view:'challenge'});h.click('stage',{stage:'spell'});h.click('overview');h.click('start');
 assert.deepEqual([...h.state.experience.queue],initial);assert.equal(h.draws(),initialDraws);
 assert.equal(h.state.experience.drafts.get('spell:'+i),'saved-synthetic-draft');
 assert.equal(h.state.experience.positions.card,0);assert.equal(h.state.experience.positions.spell,0);
});

test('each weak round shuffles exactly the weak membership and restore preserves its parent order and completion evidence',()=>{
 const h=fixture(),w=h.state.experience,parent=[...w.queue];
 for(const i of [1,4,6])w.cards.set(i,false);
 w.positions.card=2;w.round.add('card:'+w.queue[2]);
 const before=h.draws();h.click('weak');sameMembers(w.queue,[1,4,6]);assert.equal(new Set(w.queue).size,3);assert.ok(h.draws()>=before+2);
 const secondBefore=h.draws();h.click('overview');h.click('weak');sameMembers(w.queue,[1,4,6]);assert.ok(h.draws()>=secondBefore+2);
 h.click('restore');assert.deepEqual([...w.queue],parent);assert.equal(w.positions.card,2);assert.equal(w.round.has('card:'+parent[2]),true);
});

test('new whole-range practice reshuffles a copied full source and clears progress without losing any member',()=>{
 const h=fixture(),canonical=[...h.rows],before=h.draws();
 h.state.experience.cards.set(2,true);h.click('all');
 assert.ok(h.draws()>before);assert.equal(h.state.sourceRows.length,canonical.length);
 assert.equal(new Set(h.state.sourceRows).size,canonical.length);assert.ok(h.state.sourceRows.every(row=>canonical.includes(row)));
 assert.deepEqual([...h.rows],canonical);assert.equal(h.state.experience.cards.size,0);
 sameMembers(h.state.experience.queue,canonical.map((_,i)=>i));
});

test('inspect respects the exact selected canonical word and does not trigger a shuffle',()=>{
 const h=fixture(),before=h.draws();h.click('view',{view:'studio'});h.click('inspect',{index:'3'});
 const w=h.state.experience;assert.equal(w.queue[w.positions[w.stage]],3);assert.equal(h.draws(),before);
 sameMembers(w.queue,h.rows.map((_,i)=>i));
});

test('each new mock uses the actual host shuffle and official-write-free metadata without mutating source rows',()=>{
 const h=fixture(),before=h.draws(),canonical=[...h.rows];h.click('mock');h.click('mock');
 assert.equal(h.ctx.mockOrders.length,2);assert.ok(h.draws()>=before+2*(h.rows.length-1));
 for(const {words,meta} of h.ctx.mockOrders){assert.equal(meta.skipSave,true);assert.equal(meta.targetId,'practice-view');assert.equal(words.length,canonical.length);assert.equal(new Set(words).size,canonical.length);assert.ok(words.every(row=>canonical.includes(row)));}
 assert.deepEqual([...h.rows],canonical);
});


test('whole-range restart from a later 401-word batch preserves all 401 identities and returns to batch zero',()=>{
 const h=fixture(401),canonical=[...h.rows];
 h.state.batchStart=200;h.state.rows=h.rows.slice(200,400);h.state.experience=null;h.ctx.PracticeExperience.render();
 h.click('all');assert.equal(h.state.batchStart,0);assert.equal(h.state.sourceRows.length,401);assert.equal(h.state.rows.length,200);
 assert.equal(new Set(h.state.sourceRows).size,401);assert.ok(h.state.sourceRows.every(row=>canonical.includes(row)));
 assert.deepEqual([...h.rows],canonical);sameMembers(h.state.experience.queue,Array.from({length:200},(_,i)=>i));
});


test('opening a Studio card preserves another stage word and shuffled order',()=>{
 const h=fixture(),w=h.state.experience,order=[...w.queue];
 w.positions.spell=2;const pending=order[2];
 h.click('view',{view:'studio'});h.click('inspect',{index:'3'});
 assert.deepEqual([...w.queue],order);assert.equal(w.queue[w.positions.spell],pending);
 assert.equal(w.queue[w.positions.card],3);
});
test('inspecting outside a weak subset preserves other-stage identity and parent return',()=>{
 const h=fixture(),w=h.state.experience,parent=[...w.queue];
 w.cards.set(1,false);w.cards.set(4,false);w.positions.card=2;
 h.click('weak');w.positions.spell=1;const pending=w.queue[1];
 h.click('inspect',{index:'6'});
 assert.equal(w.queue[w.positions.card],6);assert.equal(w.queue[w.positions.spell],pending);
 h.click('restore');assert.deepEqual([...w.queue],parent);assert.equal(w.positions.card,2);
});
test('second pointer activation is ignored while keyboard activation works',()=>{
 const h=fixture(),w=h.state.experience;h.click('start');
 h.click('overview',{},2);assert.equal(w.screen,'study');
 h.click('overview',{},0);assert.equal(w.screen,'overview');
});
