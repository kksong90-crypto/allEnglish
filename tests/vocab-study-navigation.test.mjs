import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('meaning cards return to selected list and reveal can be reversed without changing words',()=>{
 const code=source.slice(source.indexOf('    function renderMeaningCheck('),source.indexOf('    async function loadMyWrongNote('));
 const target={innerHTML:''};
 runInNewContext(code+'\nrenderMeaningCheck([["Book",1,"one","하나"]],"vocab-view","카드");',{
  document:{getElementById:()=>target},escapeHtml:String
 });
 assert.match(target.innerHTML,/returnToVocabList\(\)/);
 const onclick=target.innerHTML.match(/onclick="(const box=[^"]+)"/)[1];
 const box={style:{display:'none'}},button={textContent:'뜻 보기'};
 const toggle=new Function('document',onclick);
 toggle.call(button,{getElementById:()=>box});assert.equal(box.style.display,'block');assert.equal(button.textContent,'뜻 가리기');
 toggle.call(button,{getElementById:()=>box});assert.equal(box.style.display,'none');assert.equal(button.textContent,'뜻 보기');
 let rendered=0;
 const fn=source.match(/function returnToVocabList\(\) \{[\s\S]*?\n\}/)[0];
 runInNewContext(fn+'\nreturnToVocabList();',{showVocabList:()=>rendered++});assert.equal(rendered,1);
});
