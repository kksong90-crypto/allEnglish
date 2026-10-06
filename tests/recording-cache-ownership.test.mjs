import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {test} from 'node:test';
test('recording app, metadata, displayed version and cache pin agree',()=>{
 const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8'),app=read('../recording/app.js'),html=read('../recording/index.html'),sw=read('../recording/sw.js'),version=/version:'([^']+)'/.exec(app)[1];
 assert.match(html,new RegExp('content="'+version.replaceAll('.','\\.')+'-'));assert.ok(html.includes('<span>v'+version+'</span>'));assert.ok(sw.includes('allbarun-recording-v'+version.replaceAll('.','')+'-'));
});
test('recording activation preserves caches belonging to other apps on the same origin',async()=>{
 const deleted=[],handlers={},keys=['allbarun-recording-v8211-incremental-save','allbarun-student-v1','unrelated-cache'];
 const source=fs.readFileSync(new URL('../recording/sw.js',import.meta.url),'utf8');const current=/const CACHE='([^']+)'/.exec(source)[1];keys.push(current);
 const ctx={self:{addEventListener:(n,f)=>handlers[n]=f,clients:{claim:async()=>{}},skipWaiting:async()=>{}},caches:{keys:async()=>keys,delete:async k=>deleted.push(k)}};
 vm.createContext(ctx);vm.runInContext(source,ctx);let done;handlers.activate({waitUntil:p=>done=p});await done;
 assert.ok(!deleted.includes('allbarun-student-v1'));assert.ok(!deleted.includes('unrelated-cache'));assert.ok(!deleted.includes(current));
 if(current!=='allbarun-recording-v8211-incremental-save')assert.ok(deleted.includes('allbarun-recording-v8211-incremental-save'));
});
test('quick activation preserves recording caches on the shared origin',async()=>{
 const deleted=[],handlers={},source=fs.readFileSync(new URL('../quick/sw.js',import.meta.url),'utf8'),current=/const CACHE='([^']+)'/.exec(source)[1];
 const ctx={self:{addEventListener:(n,f)=>handlers[n]=f,clients:{claim:async()=>{}},skipWaiting:async()=>{}},caches:{keys:async()=>['allbarun-recording-v8211-incremental-save','allbarun-quick-old',current,'unrelated-cache'],delete:async k=>deleted.push(k)}};
 vm.createContext(ctx);vm.runInContext(source,ctx);let done;handlers.activate({waitUntil:p=>done=p});await done;assert.deepEqual(deleted,['allbarun-quick-old']);
});
