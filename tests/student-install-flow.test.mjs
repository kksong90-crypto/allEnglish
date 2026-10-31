import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../student-install.js',import.meta.url),'utf8');
function fixture(ua='',extra={}){
 const events={},nodes={};
 function element(){return {textContent:'',hidden:true,value:'',disabled:false,children:[],events:{},addEventListener(k,f){this.events[k]=f;},replaceChildren(){this.children=[];},appendChild(n){this.children.push(n);},focus(){this.focused=true;},select(){this.selected=true;}};}
 const document={getElementById(id){return nodes[id]??=element();},createElement:element};
 const location={href:'https://example.test/allEnglish/install.html?tracking=one#test',assign(v){this.assigned=v;}};
 const window={addEventListener(k,f){events[k]=f;},matchMedia(){return {matches:!!extra.standalone};}};
 const navigator={userAgent:ua,platform:'',...extra};
 vm.runInNewContext(code,{document,location,window,navigator,URL});
 return {nodes,events,location,click:()=>nodes['install-action'].events.click()};
}
test('Android uses native prompt only after a tap, consumes it once, cancellation stays retryable',async()=>{
 const f=fixture('Android Chrome');let calls=0,prevented=false;
 f.events.beforeinstallprompt({preventDefault(){prevented=true;},async prompt(){calls++;},userChoice:Promise.resolve({outcome:'dismissed'})});
 assert.ok(prevented);assert.equal(calls,0);assert.match(f.nodes['install-action'].textContent,/학생앱 설치/);
 await f.click();assert.equal(calls,1);assert.match(f.nodes['install-message'].textContent,/취소/);assert.equal(f.nodes['install-action'].disabled,false);
 await f.click();assert.equal(calls,1);assert.ok(f.nodes['install-steps'].children.length);
});
test('iPhone explains sharing without claiming installation complete',async()=>{
 const f=fixture('iPhone Safari');await f.click();assert.match(f.nodes['install-steps'].children.map(x=>x.textContent).join(' '),/공유.*홈 화면에 추가/);assert.doesNotMatch(f.nodes['step-title'].textContent,/완료/);
});
test('Kakao takes precedence over native prompt; copies canonical install URL without tracking',async()=>{
 let copied='';const f=fixture('Android KAKAOTALK',{clipboard:{async writeText(v){copied=v;}}});let prompts=0;
 f.events.beforeinstallprompt({preventDefault(){},async prompt(){prompts++;}});await f.click();assert.equal(prompts,0);assert.equal(f.nodes['address-help'].hidden,false);
 await f.nodes['copy-address'].events.click();assert.equal(copied,'https://example.test/allEnglish/install.html');
});
test('clipboard failure offers manual selection',async()=>{
 const f=fixture('iPhone KAKAOTALK');await f.nodes['copy-address'].events.click();assert.ok(f.nodes['install-address'].selected);assert.match(f.nodes['install-message'].textContent,/길게/);
});
test('only standalone launches app directly; appinstalled confirms installation in current session',async()=>{
 const f=fixture('',{standalone:true});await f.click();assert.equal(f.location.assigned,'./');
 const g=fixture('Android');g.events.appinstalled();assert.match(g.nodes['step-title'].textContent,/완료/);await g.click();assert.equal(g.location.assigned,'./');
});
test('failed prompt restores usable button and never reports success',async()=>{
 const f=fixture('Android');f.events.beforeinstallprompt({preventDefault(){},async prompt(){throw Error('unavailable');}});await f.click();assert.equal(f.nodes['install-action'].disabled,false);assert.match(f.nodes['install-message'].textContent,/열지 못/);
});
test('iPad desktop UA still gets iPhone/iPad instructions',async()=>{
 const f=fixture('Safari',{platform:'MacIntel',maxTouchPoints:5});await f.click();assert.match(f.nodes['install-steps'].children.map(x=>x.textContent).join(' '),/Safari/);
});
