import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const recording = fs.readFileSync('recording/app.js', 'utf8');
const quick = fs.readFileSync('quick/app.js', 'utf8');
new vm.Script(recording, { filename: 'recording/app.js' });
new vm.Script(quick, { filename: 'quick/app.js' });

assert.match(recording, /version:'8\.2\.9'/);
assert.match(recording, /readOnly:true,readOnlyCandidateCache:true/);
assert.match(recording, /timeoutMs=Number\(override\.timeoutMs\|\|\(write\?45000:45000\)\)/);
assert.match(recording, /verifyUncertainSave/);
assert.match(recording, /if\(APP\.data\)\{setSync\('조회 지연 · 기존 화면 유지'/);

assert.match(quick, /version:'7\.3\.1'/);
assert.match(quick, /inFlight:new Map\(\)/);
assert.match(quick, /requestId:item\.id/);
assert.match(quick, /\.\.\.item\.payload,requestId:item\.id/);
assert.match(quick, /q\.some\(row=>row\.id===item\.id\)/, 'queue must de-duplicate stable request IDs');
assert.match(quick, /setTimeout\(\(\)=>flushQueue\(false\),15000\)/, 'uncertain online writes must be rechecked after the original request has time to finish');
assert.match(quick, /if\(!APP\.data\.home\)target\.innerHTML=/, 'cached home must survive a delayed refresh');
console.log('staff runtime stability contract: PASS');
