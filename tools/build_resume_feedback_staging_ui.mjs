import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
if(process.argv.length!==6)throw Error('Usage: OBSERVED_HTML BEFORE_APP CURRENT_APP OUTPUT_HTML');
const [observed,beforePath,afterPath,out]=process.argv.slice(2);
const old=fs.readFileSync(observed,'utf8'),before=fs.readFileSync(beforePath,'utf8').trim(),after=fs.readFileSync(afterPath,'utf8').trim();
assert.equal(old.split(before).length,2,'Use the exact observed app');
let next=old.replace(before,after);
for(const [a,b] of [['8.2.23-RESUME-READ','8.2.24-RESUME-FEEDBACK'],['<span>v8.2.23</span>','<span>v8.2.24</span>']]){
 assert.equal(next.split(a).length,2);next=next.replace(a,b);
}
const scripts=s=>[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts(old).length,scripts(next).length);
assert.equal(scripts(old)[0],scripts(next)[0],'Preserve API bootstrap');
scripts(next).forEach(s=>new vm.Script(s));
fs.writeFileSync(out,next);
console.log(JSON.stringify({characters:next.length,bootstrapPreserved:true,compiled:true}));
