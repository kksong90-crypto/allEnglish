import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const begin=html.indexOf('    const studentReadonlyFlights ='),end=html.indexOf('    async function apiGet(',begin);
assert.ok(begin>=0&&end>begin);
function harness(){let calls=0,settle=[];const ctx={Map,JSON,URLSearchParams,SHEET_URL:'https://example.invalid',fetchJsonWithTimeout:url=>{calls++;return new Promise((resolve,reject)=>settle.push({url,resolve,reject}))}};vm.createContext(ctx);vm.runInContext(html.slice(begin,end),ctx);return{ctx,settle,get calls(){return calls}}}
const query=(token='SyntheticA',action='getFavoriteState')=>new URLSearchParams({action,token});
test('three overlapping identical reads use one request and independent responses',async()=>{const h=harness(),reads=[1,2,3].map(()=>h.ctx.studentReadonlyFetch(query()));assert.equal(h.calls,1);h.settle[0].resolve({success:true,items:[{value:1}]});const data=await Promise.all(reads);data[0].items[0].value=9;assert.equal(data[1].items[0].value,1);assert.equal(data[2].items[0].value,1)});
test('new user, changed payload and post boundary never share previous flight',async()=>{const h=harness();const a=h.ctx.studentReadonlyFetch(query()),b=h.ctx.studentReadonlyFetch(query('SyntheticB'));h.ctx.invalidateStudentReadonlyFlights();const c=h.ctx.studentReadonlyFetch(query());assert.equal(h.calls,3);h.settle.forEach(x=>x.resolve({success:true}));await Promise.all([a,b,c])});
test('settled responses are never reused and failed reads can retry once explicitly',async()=>{const h=harness(),a=h.ctx.studentReadonlyFetch(query());h.settle[0].reject(Error('synthetic'));await assert.rejects(a,/synthetic/);const b=h.ctx.studentReadonlyFetch(query());assert.equal(h.calls,2);h.settle[1].resolve({success:true});await b;const c=h.ctx.studentReadonlyFetch(query());assert.equal(h.calls,3);h.settle[2].resolve({success:true});await c});
test('exam/point/unknown routes are not deduplicated',async()=>{const h=harness();const reads=['getPointTestInfo','getMyPointSummary','submitExam','unknown'].flatMap(action=>[h.ctx.studentReadonlyFetch(query('SyntheticA',action)),h.ctx.studentReadonlyFetch(query('SyntheticA',action))]);assert.equal(h.calls,8);h.settle.forEach(x=>x.resolve({success:true}));await Promise.all(reads)});
test('post invalidation and authentication handler remain in API adapters',()=>{assert.match(html,/async function apiPost[\s\S]*?invalidateStudentReadonlyFlights\(\)/);assert.match(html,/const result = await studentReadonlyFetch\(query\);\s*return handleApiAuthFailure\(result\)/)});
