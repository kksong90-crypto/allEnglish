import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const source=fs.readFileSync(new URL('../recording/app.js',import.meta.url),'utf8');

test('recording restores a server-confirmed screen before starting background refresh',()=>{
  const startup="if(ensureConnected()){restoreDashboardCache();void loadData(false);}";
  assert.ok(source.includes(startup));
  assert.ok(source.indexOf('restoreDashboardCache()')<source.lastIndexOf('void loadData(false)'));
  assert.match(source,/cached\.apiUrl!==apiUrl\(\)/);
  assert.match(source,/saveDashboardCache\(data\)/);
});

test('recording updates the selected student before awaiting the server write',()=>{
  const start=source.indexOf('async function saveOne(');
  const end=source.indexOf('async function acceptBeforeDeadline(',start);
  const body=source.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.ok(body.indexOf("state.textContent=desired?'제출 · 저장 중'")>=0);
  assert.ok(body.indexOf("state.textContent=desired?'제출 · 저장 중'")<body.indexOf("await api('opsSaveOne'"));
  assert.ok(body.includes("화면 반영 완료 · 서버 저장 중"));
});

test('a failed rapid write reverses only its own counters',()=>{
  const start=source.indexOf('async function saveOne(');
  const end=source.indexOf('async function acceptBeforeDeadline(',start);
  const body=source.slice(start,end);
  assert.ok(body.includes("APP.data.totalReceived=Math.max(0,Number(APP.data.totalReceived||0)+(desired?-1:1))"));
  assert.ok(body.includes("APP.data.notice.missing+(desired?1:-1)"));
  assert.ok(!body.includes('previous.totalReceived'));
  assert.ok(!body.includes('notice:previous.notice'));
});

test('secondary workspaces stay lazy and cannot block recording startup',()=>{
  const start=source.indexOf('function loadSelectedWorkspace()');
  const end=source.indexOf('function workspaceList(',start);
  const body=source.slice(start,end);
  assert.ok(body.includes("selectedWorkspace==='absence'"));
  assert.ok(body.includes("selectedWorkspace==='score'"));
  assert.ok(!body.includes("selectedWorkspace==='recording'"));
});
