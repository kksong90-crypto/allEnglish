// Opt-in anonymous timings; no production account, API, tokens or word bodies are recorded.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../station-library.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(role='admin',search='?vocabSpeed=1'){
 const created=[],copied=[];
 function node(tag='DIV'){
  const n={tagName:tag.toUpperCase(),children:[],style:{},value:'',textContent:'',handlers:{},
   addEventListener(e,fn){this.handlers[e]=fn;},replaceChildren(...c){this.children=c;this.value='';},add(c){this.children.push(c);},
   append(...c){for(const child of c){this.children.push(child);if(child&&typeof child==='object')child.parent=this;}},
   remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}};
  created.push(n);return n;
 }
 const ids=['station-library','query','category','book','scope','status','words','word-query','word-scope','word-search','word-clear','search-result'];
 const nodes=Object.fromEntries(ids.map(id=>[id==='station-library'?id:'station-library-'+id,node()]));
 const user={role,token:'SENSITIVE_AUTH_TOKEN'},window={location:{search},performance:{now:()=>Date.now()},requestAnimationFrame:fn=>fn(),navigator:{clipboard:{writeText:text=>copied.push(text)}}};
 runInNewContext(source,{window,currentUser:user,document:{getElementById:id=>nodes[id],createElement:node},
  Option:function(label,value){this.label=label;this.value=value;},apiGet:async p=>p.action==='getVocaCatalog'?{success:true,books:[{revisionId:'PRIVATE_REV',displayName:'PRIVATE_BOOK',sections:[{sectionId:'PRIVATE_SECTION',label:'Day 1',wordCount:1}]}]}:{success:true,revisionId:'PRIVATE_REV',words:[{vocabWordId:'PRIVATE_WORD_ID',sectionId:'PRIVATE_SECTION',word:'PRIVATE_WORD',meaning:'PRIVATE_MEANING'}]}});
 return {nodes,created,copied,user,window};
}
test('student or normal administrator URL never shows diagnostic output',async()=>{
 for(const [role,url]of [['student','?vocabSpeed=1'],['admin','']]){
  const h=fixture(role,url);await h.window.StationLibrary.open();await flush();assert.equal(h.created.some(n=>n.tagName==='PRE'),false);
 }
});
test('opt-in staff timings include elapsed/counts and exclude identities, token, query, words and revision',async()=>{
 const h=fixture();await h.window.StationLibrary.open();await flush();
 h.nodes['station-library-book'].value='PRIVATE_REV';h.nodes['station-library-book'].handlers.change();
 h.nodes['station-library-scope'].value='0';await h.nodes['station-library-scope'].handlers.change();await flush();
 h.nodes['station-library-word-scope'].value='section';h.nodes['station-library-word-query'].value='PRIVATE';await h.nodes['station-library-word-search'].handlers.click();await flush();
 const pre=h.created.find(n=>n.tagName==='PRE'),value=JSON.parse(pre.textContent);
 assert.deepEqual(value.results.map(r=>r.action),['catalog','scope','search']);
 assert.deepEqual(value.results.map(r=>r.remoteReads),[1,1,0]);
 assert.equal(value.results.every(r=>r.elapsedMs>=0&&r.success===true&&r.count===1),true);
 assert.doesNotMatch(pre.textContent,/PRIVATE|SENSITIVE|token|studentId|revisionId|query/);
 const copy=h.created.find(n=>n.textContent==='속도 결과 복사');await copy.handlers.click();assert.equal(h.copied.length,1);
 h.window.StationLibrary.reset();await copy.handlers.click();assert.equal(h.copied.length,1,'a button retained from the previous login cannot copy the next login report');
});
