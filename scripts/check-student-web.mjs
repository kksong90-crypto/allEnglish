// Portable synthetic regression only: no credentials, live API or student writes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const excluded=new Map([
 ['recording-ui-fixture.mjs','Fixture helper, exercised by importing recording tests.'],
 ['student_score_report_visual.mjs','Separate historical Windows/Chrome visual script; not executed in portable CI.']
]);
const files=fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.mjs')&&!excluded.has(name)).sort().map(name=>'tests/'+name);
files.push('test_recording_session_relogin.mjs','test_staff_runtime_stability.mjs');
function run(args){const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
for(const file of ['app-auto-update.js','admin-class-schedule.js','staff-schedule-preview.js','recording/app.js','recording/sw.js','quick/app.js','quick/sw.js'])run(['--check',file]);
console.log(`Portable synthetic regression: ${files.length} modules. All tests must pass; no known-failure exemption.`);
for(const [name,reason] of excluded)console.log(`Outside this command: ${name} — ${reason}`);
run(['--test',...files]);
