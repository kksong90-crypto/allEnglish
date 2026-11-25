const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const format=require('../scope-display.js').format;
const section=(n,type='QUESTION')=>({sectionId:'S'+n,sectionNo:String(n),sectionType:type,label:type==='DAY'?'Day '+n:n+'번',sortOrder:n});
const book={bookId:'B',revisionId:'R',displayName:'2026년 10월 고2 모의고사',sections:Array.from({length:40},(_,i)=>section(i+1))};
const range=nums=>({vocabBookId:'B',revisionId:'R',sectionIds:nums.map(n=>'S'+n)});
test('exact requested example, union of same revision, sorted gaps, no regular-count prefix',()=>{
 const a=range([24,18,19,20,21,22,23]),b=range(Array.from({length:12},(_,i)=>i+29));
 const before=JSON.stringify([a,b,book]);assert.equal(format([a,b],[book]),'2026년 10월 고2 모의고사 18-24, 29-40');assert.equal(JSON.stringify([a,b,book]),before);
});
for(const [type,expected] of [['DAY','Day 1-3, 5'],['QUESTION','1-3, 5'],['LESSON','1-3, 5과'],['UNIT','1-3, 5강'],['ROUND','1-3, 5회']])test(type+' keeps native unit once',()=>{
 assert.equal(format([range([5,2,3,1])],[{...book,displayName:'교재',sections:[1,2,3,5].map(n=>section(n,type))}]),'교재 '+expected);
});
test('separate books and revisions retain names on separate lines',()=>{
 const second={...book,bookId:'B2',revisionId:'R2',displayName:'능률 중등 기본',sections:[section(1,'DAY')]};
 assert.equal(format([range([18]),{vocabBookId:'B2',revisionId:'R2',sectionIds:['S1']}],[book,second]),'2026년 10월 고2 모의고사 18\n능률 중등 기본 Day 1');
});
test('same visible book name with different editions never merges',()=>{
 const second={...book,revisionId:'R2',editionLabel:'2027 개정'};
 const first={...book,editionLabel:'2026 개정'};
 assert.equal(format([range([18]),{...range([19]),revisionId:'R2'}],[first,second]),'2026년 10월 고2 모의고사 (2026 개정) 18\n2026년 10월 고2 모의고사 (2027 개정) 19');
});
for(const [label,mutate]of [
 ['missing book',b=>[]],['duplicate revision',b=>[b,b]],
 ['missing section',b=>[{...b,sections:[]}]],['duplicate section',b=>[{...b,sections:[section(18),section(18)]}]]
])test(label+' never guesses identities',()=>assert.equal(format([range([18])],mutate(book)),''));
test('empty input never creates a range',()=>assert.equal(format([],[book]),''));
test('duplicate selected section is displayed once',()=>assert.equal(format([range([18,18,19])],[book]),'2026년 10월 고2 모의고사 18-19'));
test('custom named sections preserve their exact names without interpreting years as ranges',()=>{
 const sections=[{...section(1,'CUSTOM'),label:'2026 A'},{...section(2,'CUSTOM'),label:'2027 B'}];
 assert.equal(format([range([1,2])],[{...book,sections}]),'2026년 10월 고2 모의고사 2026 A, 2027 B');
});
test('custom lesson/item labels compact within actual lesson',()=>{
 const sections=[{...section(1,'CUSTOM'),label:'1회 · 14강 9번'},{...section(2,'CUSTOM'),label:'1회 · 14강 10번'},{...section(3,'CUSTOM'),label:'1회 · 15강 2번'}];
 assert.equal(format([range([1,2,3])],[{...book,sections}]),'2026년 10월 고2 모의고사 14강 9-10번, 15강 2번');
});
test('catalog hydration is read-only and shared once per session',async()=>{
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../scope-display.js'),'utf8')+fs.readFileSync(require('node:path').join(__dirname,'../plan-scope-display.js'),'utf8'),ctx);
 const item={regularText:'18',displayText:'정규 8 · 18',sourceRanges:[range([18,19])],vocaScopeState:'CONNECTED'};
 const payload={days:[{vocab:[item]}]},user={token:'synthetic'},original=JSON.stringify(item.sourceRanges);let reads=0;
 const read=async()=>{reads++;return{success:true,books:[book]};};
 await Promise.all([ctx.PlanScopePresentation.enrich(payload,user,read),ctx.PlanScopePresentation.enrich(payload,user,read)]);
 assert.equal(reads,1);assert.equal(item.scopeDisplayText,'2026년 10월 고2 모의고사 18-19');assert.equal(JSON.stringify(item.sourceRanges),original);
 ctx.PlanScopePresentation.reset();await ctx.PlanScopePresentation.enrich(payload,user,read);assert.equal(reads,2);
});
test('catalog failure preserves original display instead of inventing a book or range',async()=>{
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../scope-display.js'),'utf8')+fs.readFileSync(require('node:path').join(__dirname,'../plan-scope-display.js'),'utf8'),ctx);
 const item={displayText:'기존 확인 범위',sourceRanges:[range([18])]},payload={days:[{vocab:[item]}]};
 await ctx.PlanScopePresentation.enrich(payload,{token:'synthetic'},async()=>{throw Error('offline');});
 assert.equal(ctx.PlanScopePresentation.display(item),'기존 확인 범위');assert.equal(item.scopeDisplayText,undefined);
});
test('empty or duplicate plans do not download catalog metadata',async()=>{
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../scope-display.js'),'utf8')+fs.readFileSync(require('node:path').join(__dirname,'../plan-scope-display.js'),'utf8'),ctx);
 await ctx.PlanScopePresentation.enrich({days:[{vocab:[{sourceRanges:[range([18])],vocaScopeState:'DUPLICATE'}]}]},{token:'synthetic'},()=>{throw Error('must not read');});
});
test('managed school range never hides the separately published regular range',async()=>{
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../scope-display.js'),'utf8')+fs.readFileSync(require('node:path').join(__dirname,'../plan-scope-display.js'),'utf8'),ctx);
 const item={regularText:'Day 8',bookName:'능률 중등 기본',schoolVocabText:'18-19',schoolScopePlanId:'SCHOOL',sourceRanges:[range([18,19])]};
 await ctx.PlanScopePresentation.enrich({days:[{vocab:[item]}]},{token:'synthetic'},async()=>({success:true,books:[book]}));
 assert.equal(item.scopeDisplayText,'능률 중등 기본 Day 8\n2026년 10월 고2 모의고사 18-19');
});
test('logout during metadata lookup never attaches a stale label',async()=>{
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../scope-display.js'),'utf8')+fs.readFileSync(require('node:path').join(__dirname,'../plan-scope-display.js'),'utf8'),ctx);
 let resolve;const item={sourceRanges:[range([18])]},payload={days:[{vocab:[item]}]};
 const task=ctx.PlanScopePresentation.enrich(payload,{token:'synthetic'},()=>new Promise(r=>{resolve=r;}));
 await Promise.resolve();ctx.PlanScopePresentation.reset();resolve({success:true,books:[book]});await task;
 assert.equal(item.scopeDisplayText,undefined);
});
test('actual web home and schedule render canonical title and compact range with HTML escaping',()=>{
 const ctx=vm.createContext({currentUser:{role:'student'},escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),scheduleHasValue:v=>!!v,formatMultilineHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\n','<br>')});
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../plan-scope-display.js'),'utf8'),ctx);
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 for(const name of ['renderHomeVocabTask','scheduleVocabItem']) {
   const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+10);
   vm.runInContext(html.slice(start,end),ctx);
 }
 const item={scopeDisplayText:'2026년 10월 고2 모의고사 18-24, 29-40\n능률 <기본> Day 8',regularText:'8',displayText:'정규8',testPlanId:'P',vocaScopeState:'CONNECTED',sourceRanges:[range([18])]};
 for(const text of [ctx.renderHomeVocabTask(item),ctx.scheduleVocabItem([item])]) {
   assert.match(text,/2026년 10월 고2 모의고사 18-24, 29-40/);assert.match(text,/&lt;기본&gt;/);assert.doesNotMatch(text,/정규8|<기본>/);
 }
});
