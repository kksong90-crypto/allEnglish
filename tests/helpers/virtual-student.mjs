// Minimal DOM/transport simulator for executing the complete production scripts.
// No browser layout engine, real credentials, external fetch, or operational writes.
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
export const html=fs.readFileSync(new URL('index.html',root),'utf8');
const updater=fs.readFileSync(new URL('app-auto-update.js',root),'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!m[1].includes('src=')).map(m=>m[2]);
export function storage(){const data=new Map();return{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
function attributes(text){const out={};for(const m of text.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))out[m[1]]=m[2]??m[3]??m[4]??'';return out;}
class Element {
 constructor(doc,tag,attrs={}){this.doc=doc;this.tagName=tag.toUpperCase();this.attrs={...attrs};this.id=attrs.id||'';this.dataset={};for(const[k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;this.value=attrs.value||'';this.defaultValue=this.value;this.type=attrs.type||'';this.checked=false;this.defaultChecked=false;this.hidden='hidden'in attrs;this.disabled=false;this.style={};this.children=[];this.parentNode=null;this._html='';this.textContent='';this.listeners={};const classes=new Set((attrs.class||'').split(/\s+/).filter(Boolean));this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>{if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);return on;}};}
 get isConnected(){return this.doc.elements.includes(this);}
 set innerHTML(value){this._html=String(value);for(const n of this.children)this.doc.remove(n);this.children=[];this.doc.parse(this._html,this);}
 get innerHTML(){return this._html;}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='aria-hidden')return;if(k==='id')this.id=String(v);}
 getAttribute(k){return this.attrs[k]??null;}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
 async emit(k){for(const fn of this.listeners[k]||[])await fn({target:this,preventDefault(){}});}
 querySelectorAll(selector){return this.doc.querySelectorAll(selector).filter(n=>n.parentNode===this);}
 insertAdjacentHTML(where,text){this._html=where==='afterbegin'?text+this._html:this._html+text;this.doc.parse(text,this);}
 appendChild(n){n.parentNode=this;this.children.push(n);if(!this.doc.elements.includes(n))this.doc.elements.push(n);}
 remove(){this.doc.remove(this);}
 focus(){this.doc.activeElement=this;}
 closest(selector){for(let n=this;n;n=n.parentNode)if(n.matches(selector))return n;return null;}
 matches(selector){return selector.split(',').some(s=>{s=s.trim();if(s==='[data-tab]')return 'data-tab'in this.attrs;const id=s.match(/^#([\w-]+)$/);if(id)return this.id===id[1];if(s==='section.active')return this.tagName==='SECTION'&&this.classList.contains('active');const tagged=s.match(/^([\w-]+)?((?:\[[^\]]+\])+)$/);if(tagged){if(tagged[1]&&this.tagName!==tagged[1].toUpperCase())return false;return [...tagged[2].matchAll(/\[([\w-]+)(\^=|=)?["']?([^\]"']*)["']?\]/g)].every(m=>{const value=this.getAttribute(m[1]);return m[2]==='^='?String(value||'').startsWith(m[3]):m[2]==='='?value===m[3]:value!==null;});}return this.tagName===s.toUpperCase();});}
}
class Document {
 constructor(markup){this.elements=[];this.listeners={};this.visibilityState='visible';this.baseURI='https://virtual.example/allEnglish/';this.lastModified='10/19/2026 03:22:00';this.parse(markup.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi,'$1</script>'));this.body=this.querySelector('body');this.activeElement=this.body;}
 parse(markup,parent=null){for(const m of markup.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)){const n=new Element(this,m[1],attributes(m[2]));if(n.id&&this.getElementById(n.id))continue;n.parentNode=parent;parent?.children.push(n);this.elements.push(n);}}
 remove(n){for(const c of n.children)this.remove(c);this.elements=this.elements.filter(x=>x!==n);}
 getElementById(id){return this.elements.find(n=>n.id===id)||null;}
 createElement(tag){return new Element(this,tag);}
 querySelectorAll(selector){const ancestor=selector.match(/^(#[\w-]+) (.+)$/);if(ancestor){const parent=this.querySelector(ancestor[1]);if(!parent)return[];if(ancestor[2]==='button[onclick="checkLogin()"]')return this.elements.filter(n=>n.tagName==='BUTTON'&&n.attrs.onclick==='checkLogin()');return this.querySelectorAll(ancestor[2]).filter(n=>n.parentNode===parent);}if(selector.startsWith('meta[name="allbarun-app"]'))return this.elements.filter(n=>n.tagName==='META'&&n.attrs.name==='allbarun-app'&&n.attrs.content==='student-v1');return this.elements.filter(n=>n.matches(selector));}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
 async emit(k){for(const fn of this.listeners[k]||[])await fn({});}
}
export function makeDay(scope='Day 30',extra={}){return{date:'2026-10-19',displayDate:'10월 19일 월요일',classId:'VIRTUAL_CLASS',className:'가상 반',hasPlan:true,scheduled:true,vocab:[{bookName:'가상 단어장',regularText:scope,displayText:scope}],listening:{homework:'4',type:'LISTENING_DICTATION'},quiz:{scope:'관계대명사 Quiz'},homework:{text:'교재 24~27쪽',public:true},...extra};}
export function server(){return{day:makeDay(),content:{success:true,home:{heroTitle:'All바른 학습 습관이\nAll바른 결과를 만듭니다.'},notices:[{date:'2026-10-19',title:'가상 공지',body:'수업 준비 안내'}],homeNotices:[]},release:'old',hold:new Set(),fail:new Set(),waiting:[],requests:[],answer(p){switch(p.action){case'login':return{success:true,id:p.id,name:'가상 학생 '+p.id,role:'student',token:'virtual-'+p.id};case'logout':return{success:true};case'getStudentContent':return structuredClone(this.content);case'getMyLearningSchedule':{const day={...structuredClone(this.day),date:p.fromDate};return{success:true,range:p.range,days:[day],visibleDays:[day],nextPlan:day};}case'getMyPointSummary':return{success:true,totalPoints:this.points||3};case'submitPointTest':this.points=4;return{success:true,totalPoints:4,awarded:true,scoreText:'100점',message:'가상 제출 확인',wrongItems:[]};case'getFavoriteState':return{success:true,folders:{기본:[]}};case'getRetestList':return{success:true,rows:[]};case'getPointRanking':return{success:true,currentTop10:[],totalTop10:[]};case'getPointTestInfo':return{success:true,canTake:true,testId:'VIRTUAL_TEST',bookName:'가상 단어장',timeLimitSeconds:480,totalPoints:3,questions:[{qid:'Q1',meaning:'사과'}]};case'getVocabData':return{success:true,values:[['단어장','Day','영어','뜻','순서'],['가상 단어장',1,'apple','사과',1]]};case'getMyScoreReport':return{success:true,published:false};default:throw Error('VIRTUAL_ACTION_NOT_ALLOWED:'+p.action);}}};}
export function virtualStudent({local=storage(),session=storage(),backend=server(),saved=true,autoUpdate=false}={}){
 if(saved&&!local.getItem('allbarun-user'))local.setItem('allbarun-user',JSON.stringify({id:'A',name:'가상 학생 A',role:'student',token:'virtual-A'}));
 const doc=new Document(html),timers=new Map(),windowEvents={},errors=[],navigations=[],requests=backend.requests;let now=Date.parse('2026-10-19T03:22:00Z'),timer=0;
 const headers=(type='text/html')=>({get:k=>k==='content-type'?type:k==='last-modified'?'Mon, 19 Oct 2026 03:22:00 GMT':null});
 const context={document:doc,URL,URLSearchParams,AbortController,structuredClone,Uint8Array,TextEncoder,Math,JSON,Map,Set,console:{error:e=>errors.push(String(e)),warn(){}},localStorage:local,sessionStorage:session,navigator:{onLine:true},location:{href:doc.baseURI,search:'',replace:u=>navigations.push(u)},history:{replaceState(){},pushState(){}},Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms,at:now+ms,interval:false});return timer;},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>{timers.set(++timer,{fn,ms,at:now+ms,interval:true});return timer;},clearInterval:id=>timers.delete(id),addEventListener:(name,fn)=>(windowEvents[name]??=[]).push(fn),scrollTo(){},alert(){},confirm:()=>true,open:()=>{throw Error('VIRTUAL_POPUP_BLOCKED');},DOMParser:class{parseFromString(text){return new Document(text);}},fetch:async(url,options={})=>{
  const u=new URL(String(url));
  if(u.origin==='https://virtual.example'){requests.push({asset:u.pathname,method:options.method||'GET',cache:options.cache});const markup=backend.release==='old'?html:html.replace('student-shell.css?v=20261018.1','student-shell.css?v=virtual-new');return{ok:true,headers:headers(u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.js')?'text/javascript':'text/html'),text:async()=>markup,arrayBuffer:async()=>new ArrayBuffer(1)};}
  if(u.origin!=='https://script.google.com')throw Error('EXTERNAL_NETWORK_BLOCKED');
  const params=Object.fromEntries(options.body instanceof URLSearchParams?options.body:u.searchParams);requests.push({...params,method:options.method||'GET'});
  if(backend.fail.has(params.action))throw Error('VIRTUAL_NETWORK_FAILURE');
  if(backend.hold.has(params.action))return await new Promise((resolve,reject)=>backend.waiting.push({params,resolve:value=>resolve({ok:true,json:async()=>value}),reject}));
  return{ok:true,json:async()=>backend.answer(params)};
 }};
 context.window=context;context.globalThis=context;vm.createContext(context);for(const script of scripts)vm.runInContext(script,context,{filename:'production-index-inline.js'});if(autoUpdate)vm.runInContext(updater,context,{filename:'production-app-auto-update.js'});
 const read=expression=>vm.runInContext(expression,context);
 const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
 return{context,doc,backend,errors,requests,navigations,local,session,read,flush,node:id=>doc.getElementById(id),async boot(){context.onload();await flush();},async event(name){for(const fn of windowEvents[name]||[])await fn({});await flush();},advance:ms=>{now+=ms;},async runShortTimers(max=600){for(const[id,t]of [...timers])if(!t.interval&&t.ms<=max){timers.delete(id);t.fn();}await flush();}};
}
