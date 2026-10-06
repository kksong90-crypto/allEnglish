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
test('request stage timings are allowlisted and never called selected-date timings',()=>{const text=render({serverTiming:{snapshotStageTiming:{scope:'REQUEST_UNCACHED_SNAPSHOTS',calls:3,milliseconds:{inputs:12,plans:23,studentName:'PRIVATE'},token:'SECRET'}}},50);assert.match(text,/비캐시 계산 3회 누적/);assert.match(text,/선택 날짜 단독 시간이 아닙니다/);assert.match(text,/기본 자료·계획 조회: 12 ms/);assert.doesNotMatch(text,/PRIVATE|SECRET/);});
test('unknown stage scope is ignored, malformed stage values are not echoed',()=>{assert.doesNotMatch(render({serverTiming:{snapshotStageTiming:{scope:'SECRET',calls:1}}},1),/계산 구간|SECRET/);const text=render({serverTiming:{snapshotStageTiming:{scope:'REQUEST_UNCACHED_SNAPSHOTS',calls:'SECRET',milliseconds:{inputs:Infinity,plans:-3,roster:'SECRET'}}}},1);assert.doesNotMatch(text,/SECRET|Infinity|-3/);assert.match(text,/미제공/);});
