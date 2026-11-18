import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
if(process.argv.length!==6)throw Error('Usage: node tools/build_resume_staging_ui.mjs OBSERVED_HTML BASELINE_APP CURRENT_APP OUTPUT_HTML');
const [observed,beforePath,afterPath,out]=process.argv.slice(2),old=fs.readFileSync(observed,'utf8'),before=fs.readFileSync(beforePath,'utf8').trim(),after=fs.readFileSync(afterPath,'utf8').trim();
assert.equal(old.split(before).length,2,'Exact verified app must occur once');let next=old.replace(before,after);
for(const [a,b] of [['8.2.22-PENDING-FEEDBACK','8.2.23-RESUME-READ'],['<span>v8.2.22</span>','<span>v8.2.23</span>']]){assert.equal(next.split(a).length,2);next=next.replace(a,b);}
const scripts=s=>[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);assert.equal(scripts(old).length,scripts(next).length);assert.equal(scripts(old)[0],scripts(next)[0],'Preserve API bootstrap');scripts(next).forEach(s=>new vm.Script(s));fs.writeFileSync(out,next);console.log(JSON.stringify({characters:next.length,bootstrapPreserved:true,compiled:true}));
