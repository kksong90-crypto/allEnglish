import fs from 'node:fs';import assert from 'node:assert/strict';import {test} from 'node:test';
const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');
test('temporary request timing code and call are removed together',()=>{assert.doesNotMatch(source,/renderCurrentRequestTiming|CURRENT_REQUEST_BEFORE_JSON|sessionVerificationMs/);assert.match(source,/function renderReadTiming\(/);assert.match(source,/renderReadTiming\(data,performance\.now\(\)-readStarted,false\)/);});
