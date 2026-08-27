import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(source, /6\.3\.[12]-(?:POINT-START-KEY-HOTFIX|PUBLISHED-SCORE-REPORT)/);
assert.equal((source.match(/function pointStartKeyStorageKey\(/g) || []).length, 1);
assert.equal((source.match(/function getOrCreatePointStartKey\(/g) || []).length, 1);
assert.equal((source.match(/function clearPointStartKey\(/g) || []).length, 1);
assert.match(source, /POINTSTART_/);
assert.match(source, /getPointTestInfo", startKey: getOrCreatePointStartKey\(\)/);
assert.match(source, /includes\("시험시작요청키"\)\) clearPointStartKey\(\)/);
assert.match(source, /if \(completed\) \{\s*clearPointStartKey\(\);\s*currentPointTest = null;/);
assert.doesNotMatch(source, /apiPost\(\{ action: "getPointTestInfo" \}\)/);

const inlineScripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(script => script.includes('async function startPointTest'));
assert.equal(inlineScripts.length, 1, 'expected exactly one main inline application script');
new vm.Script(inlineScripts[0], { filename: 'index-inline.js' });
console.log('student point start key hotfix contract: PASS');
