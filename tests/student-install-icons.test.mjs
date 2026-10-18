import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inflateSync} from 'node:zlib';
const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root),'utf8'));
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
for(const size of [192,512])test('install icon '+size+' is a decodable square PNG at the existing manifest path',()=>{
 const entry=manifest.icons.find(x=>x.sizes===size+'x'+size);assert.ok(entry);assert.equal(entry.src,'icons/icon-'+size+'.png');assert.equal(entry.type,'image/png');
 const bytes=fs.readFileSync(new URL(entry.src,root));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const chunks=[];let pos=8;
 while(pos<bytes.length){const length=bytes.readUInt32BE(pos);assert.ok(pos+length+12<=bytes.length);const type=bytes.subarray(pos+4,pos+8).toString();const data=bytes.subarray(pos+8,pos+8+length);assert.equal(crc32(bytes.subarray(pos+4,pos+8+length)),bytes.readUInt32BE(pos+8+length),type+' CRC');chunks.push({type,data});pos+=length+12;}
 assert.equal(chunks[0].type,'IHDR');const h=chunks[0].data;assert.equal(h.readUInt32BE(0),size);assert.equal(h.readUInt32BE(4),size);assert.equal(h[8],8);assert.equal(h[9],6);assert.equal(h[12],0);assert.equal(chunks.at(-1).type,'IEND');
 const raw=inflateSync(Buffer.concat(chunks.filter(x=>x.type==='IDAT').map(x=>x.data)));assert.equal(raw.length,size*(1+size*4));assert.deepEqual(fs.readFileSync(new URL('icon-'+size+'.png',root)),bytes);
});
test('manifest identity, standalone mode, routes and original logo remain',()=>{assert.equal(manifest.start_url,'./');assert.equal(manifest.display,'standalone');const html=fs.readFileSync(new URL('index.html',root),'utf8');assert.match(html,/href="icons\/icon-192.png"/);assert.match(html,/assets\/Allbarun_Student_Logo_Mark.png/);assert.ok(fs.statSync(new URL('assets/Allbarun_Student_Logo_Mark.png',root)).size>1000);});
