import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {test} from 'node:test';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
const line=name=>source.split(/\r?\n/).find(l=>l.startsWith('async function '+name+'('));
function harness({loading=false,saving=[]}={}){
 const calls=[],APP={loading,saving:new Set(saving),targetDate:'2026-10-06',data:{targetDate:'2026-10-06',classes:[]}},student={name:'Synthetic',received:false,canCheck:true};
 let resolve;const response=new Promise(r=>resolve=r);const state={textContent:''},row={querySelector:()=>state,classList:{add(){},remove(){},toggle(){}}},input={checked:true,isConnected:true,closest:()=>row};
 const ctx={APP,Date,Error,navigator:{onLine:true},ensureConnected:()=>true,setSync(){},toast(){},render(){},renderError(){},updateNetwork(){},confirm:()=>true,requestId:()=> 'SYNTHETIC',findStudent:()=>student,applySummary(){},api:async(action,payload)=>{calls.push({action,payload});return response;}};
 vm.createContext(ctx);vm.runInContext(['loadData','selectDate','saveOne','verifyUncertainSave','acceptBeforeDeadline'].map(line).join('\n'),ctx);
 return {ctx,APP,calls,input,resolve,event:{preventDefault(){},stopPropagation(){},currentTarget:{disabled:false}}};
}
test('a date read in progress cannot accept a student write',async()=>{const h=harness({loading:true});const p=h.ctx.saveOne(h.input,'C','S');h.resolve({summary:{}});await p;assert.equal(h.calls.length,0);assert.equal(h.input.checked,false);});
test('background read cannot recreate rows while a student write is pending',async()=>{const h=harness({saving:['C|S']});const p=h.ctx.loadData(true);h.resolve({targetDate:'2026-10-06',classes:[]});await p;assert.equal(h.calls.length,0);});
test('exception acknowledgement prevents date switches and duplicate writes',async()=>{const h=harness();const p=h.ctx.acceptBeforeDeadline(h.event,'C','S','Synthetic'),d=h.ctx.selectDate('2026-10-07'),s=h.ctx.saveOne(h.input,'C','S');const early=h.calls.slice();h.resolve({targetDate:'2026-10-06',summary:{}});await Promise.all([p,d,s]);assert.equal(early.length,1);assert.equal(early[0].action,'opsAcceptBeforeDeadline');assert.equal(h.APP.targetDate,'2026-10-06');assert.equal(h.APP.saving.size,0);});
test('exception acknowledgement cannot start while another date is loading',async()=>{const h=harness({loading:true});const p=h.ctx.acceptBeforeDeadline(h.event,'C','S','Synthetic');h.resolve({targetDate:'2026-10-06',summary:{}});await p;assert.equal(h.calls.length,0);});
test('uncertain single write retains an explicit read-back route',async()=>{const h=harness({saving:['C|S']});const p=h.ctx.verifyUncertainSave('C','S',false,'Synthetic');assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'opsDashboard');h.resolve({targetDate:'2026-10-06',classes:[]});assert.equal(await p,true);});
