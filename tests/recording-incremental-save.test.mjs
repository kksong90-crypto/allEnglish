import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
function extract(name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\n',start);assert.ok(start>=0);return source.slice(start,end);}
test('saving one row never recreates the class/student grid or loses another pending input',()=>{
 let fullRenders=0,summaryRenders=0;
 const classes=Array.from({length:12},(_,i)=>({classId:'C'+i,students:Array.from({length:25},(_,j)=>({studentId:'S'+j,status:j===0?'RECEIVED':'UNKNOWN'}))}));
 const cards=classes.map(cls=>({dataset:{classId:cls.classId},count:{textContent:''},querySelector(){return this.count}}));
 const pending={checked:true,disabled:true,connected:true};
 const ctx={APP:{data:{classes,deadlinePassed:false}},Map,document:{querySelectorAll:()=>cards},renderSummary:()=>summaryRenders++,renderClasses:()=>{fullRenders++;pending.connected=false;}};
 vm.createContext(ctx);vm.runInContext(['recalcLocalClasses','renderClassCounts','applySummary'].map(extract).join('\n'),ctx);
 ctx.applySummary({total:300,received:12,missing:288},{complete:false});
 assert.equal(fullRenders,0);assert.equal(summaryRenders,1);assert.ok(cards.every(c=>c.count.textContent==='1/25'));assert.equal(pending.connected,true);assert.equal(pending.checked,true);assert.equal(pending.disabled,true);
 assert.equal(ctx.APP.data.totalReceived,12);assert.equal(ctx.APP.data.totalUnknown,288);
});
test('server authoritative summary and deadline semantics are unchanged',()=>{
 const ctx={APP:{data:{classes:[],deadlinePassed:true}},Map,document:{querySelectorAll:()=>[]},renderSummary:()=>{}};vm.createContext(ctx);
 vm.runInContext(['recalcLocalClasses','renderClassCounts','applySummary'].map(extract).join('\n'),ctx);
 ctx.applySummary({total:5,received:4,missing:1,notice:{active:true}});
 assert.equal(ctx.APP.data.totalMissing,1);assert.equal(ctx.APP.data.notice.active,true);
});
test('save request identity, server write, uncertain-result verification and authentication remain present',()=>{
 assert.match(source,/APP\.saving\.has\(key\)/);assert.match(source,/api\('opsSaveOne'/);assert.match(source,/await verifyUncertainSave/);
 assert.match(source,/function requireSessionLogin/);assert.match(source,/localStorage\.removeItem\(APP\.tokenKey\)/);
 assert.match(source,/data-class-id="\$\{esc\(cls\.classId\)\}"/);
 assert.ok(!extract('applySummary').includes('innerHTML'));assert.ok(!extract('renderClassCounts').includes('fetch('));
});
