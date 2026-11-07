import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../station-library.js', import.meta.url), 'utf8');
function fakeNode() {
  return {
    value: '', children: [], handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn; },
    replaceChildren(...children) { this.children = children; this.value = ''; },
    add(child) { this.children.push(child); },
    append(...children) { this.children.push(...children); },
  };
}

test('searches 217 titles and fetches only the chosen lesson; stale responses are discarded', async () => {
  const nodes = Object.fromEntries(['station-library','query','book','scope','status','words']
    .map(name => [name === 'station-library' ? name : `station-library-${name}`, fakeNode()]));
  const panel = nodes['station-library'];
  const query = nodes['station-library-query'];
  const books = nodes['station-library-book'];
  const scope = nodes['station-library-scope'];
  const words = nodes['station-library-words'];
  const calls = [];
  let finish;
  const published = Array.from({length:217}, (_,i) => ({
    revisionId: `REV${i}`, displayName: i ? `단어장 ${i}` : '중1 동아(윤)', categoryCode:'TEXTBOOK',
    sections: [{sectionId:'L3a',label:'3과 Reading 1',wordCount:1},
      {sectionId:'L3b',label:'3과 Reading 2',wordCount:1},{sectionId:'L4',label:'4과',wordCount:1}],
  }));
  const window = {};
  runInNewContext(source, { window, currentUser: {token:'synthetic'},
    document: {getElementById:id => nodes[id], createElement:fakeNode},
    Option: function(label,value) { this.label=label; this.value=value; },
    apiGet: params => {
      calls.push(params);
      if (params.action === 'getVocaCatalog') return {success:true,books:published};
      return new Promise(resolve => { finish=resolve; });
    },
  });
  assert.equal(calls.length,0);
  panel.open=true;
  await panel.handlers.toggle();
  assert.equal(books.children.length,218);
  query.value='동아 윤';
  query.handlers.input();
  assert.equal(books.children.length,2);
  books.value='REV0';
  books.handlers.change();
  assert.equal(scope.children.length,3);
  assert.equal(calls.length,1);
  scope.value='0';
  const pending=scope.handlers.change();
  assert.deepEqual(JSON.parse(calls[1].sectionIdsJson),['L3a','L3b']);
  finish({success:true,revisionId:'REV0',words:[{sectionId:'L3a',word:'one',meaning:'하나'},{sectionId:'L3b',word:'two',meaning:'둘'}]});
  await pending;
  assert.equal(words.children[0].children.length,2);
  scope.value='1';
  const stale=scope.handlers.change();
  window.StationLibrary.reset();
  finish({success:true,revisionId:'REV0',words:[{sectionId:'L4',word:'stale'}]});
  await stale;
  assert.equal(words.children.length,0);
});
