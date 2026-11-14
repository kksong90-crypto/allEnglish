import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
if(process.argv.length!==6)throw Error('Usage: node tools/build_recording_staging_ui.mjs OBSERVED_HTML BASELINE_APP CURRENT_APP OUTPUT_HTML');
const [observedPath,baselinePath,currentPath,outputPath]=process.argv.slice(2),old=fs.readFileSync(observedPath,'utf8'),before=fs.readFileSync(baselinePath,'utf8').trim(),after=fs.readFileSync(currentPath,'utf8').trim();
assert.ok(old.includes('https://script.google.com/macros/s/AKfycbz5m2VgIPcI8ltqSqpL74YS7vX8iD9pgYFOYZRBglkpd-mCQsevvrZHo9T6RPRd9B4G2A/exec'),'Expected isolated UI');
assert.equal(old.split(before).length,2,'Observed UI must include the exact reviewed baseline app once');
let html=old.replace(before,after);
for(const [a,b] of [['8.2.21-QUICK-ROSTER','8.2.22-PENDING-FEEDBACK'],['<span>v8.2.21</span>','<span>v8.2.22</span>'],['<span>제출</span><b id="m-received">','<span id="m-received-label">제출</span><b id="m-received">']]){assert.equal(html.split(a).length,2,a);html=html.replace(a,b);}
const css=fs.readFileSync(new URL('../recording/styles.css',import.meta.url),'utf8'),rules=['.notice-banner.saving{','.recording-progress[data-saving="true"]{'].map(prefix=>{const rule=css.split('\n').find(line=>line.startsWith(prefix));assert.ok(rule,prefix);return rule;}).join('\n');
assert.equal((old.match(/<style>/g)||[]).length,1);html=html.replace('</style>','\n'+rules+'\n</style>');
const scripts=s=>[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts(html).length,scripts(old).length);assert.equal(scripts(html)[0],scripts(old)[0],'Preserve endpoint bootstrap');
scripts(html).forEach(script=>new vm.Script(script));fs.writeFileSync(outputPath,html);console.log(JSON.stringify({characters:html.length,endpointBootstrapUnchanged:true,scriptsCompile:true}));
