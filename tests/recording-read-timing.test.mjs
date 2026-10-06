import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
const fn=source.split(/\r?\n/).find(line=>line.startsWith('function renderReadTiming('));
function render(data,elapsed,error=false){const node={textContent:''};const ctx={$:()=>node};vm.createContext(ctx);vm.runInContext(fn,ctx);ctx.renderReadTiming(data,elapsed,error);return node.textContent;}
test('only allowlisted numeric timing and cache state are shown',()=>{const text=render({token:'SECRET',classes:[{name:'PRIVATE'}],serverTiming:{totalMs:42,candidateMs:12,candidateCacheHit:true,token:'SECRET'}},123);assert.match(text,/123 ms/);assert.match(text,/42 ms/);assert.match(text,/캐시 응답이면 이번 요청 처리 시간이 아닙니다/);assert.doesNotMatch(text,/SECRET|PRIVATE/);});
test('failure never presents stale server phases as current evidence',()=>{const text=render({serverTiming:{totalMs:999}},45000,true);assert.match(text,/조회 실패/);assert.match(text,/45000 ms/);assert.doesNotMatch(text,/999|서버 합계/);});
test('old servers and malformed timings are compatible',()=>{assert.match(render({},10),/조회 성공/);const text=render({serverTiming:{totalMs:'SECRET',checksMs:-1,candidateMs:Infinity}},NaN);assert.doesNotMatch(text,/SECRET|Infinity|NaN|-1/);assert.match(text,/미제공/);});
test('diagnostic does not issue requests or mutate payloads',()=>{const data={serverTiming:{totalMs:1},classes:[]};const original=JSON.stringify(data);render(data,2);assert.equal(JSON.stringify(data),original);assert.doesNotMatch(fn,/api\(|fetch\(|localStorage|innerHTML/);});
