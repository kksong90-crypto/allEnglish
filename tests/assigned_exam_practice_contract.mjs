import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const files = ['index.html', 'v6-staging.html'];

function sourceFor(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

function inlineScripts(html) {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(Boolean);
}

for (const file of files) {
  test(`${file} inline JavaScript compiles`, () => {
    const scripts = inlineScripts(sourceFor(file));
    assert.ok(scripts.length > 0);
    scripts.forEach((script, index) => assert.doesNotThrow(() => new vm.Script(script, { filename: `${file}#${index + 1}` })));
  });

  test(`${file} shows practice only for a connected published plan payload`, () => {
    const source = sourceFor(file);
    assert.match(source, /item\?\.vocaScopeState === "CONNECTED"/);
    assert.match(source, /Array\.isArray\(item\?\.sourceRanges\) && item\.sourceRanges\.length > 0/);
    assert.match(source, /data-test-plan-id="\$\{escapeHtml\(planId\)\}"/);
  });

  test(`${file} sends only the plan ID and keeps practice out of official records`, () => {
    const source = sourceFor(file);
    assert.match(source, /action: "getAssignedVocaPracticeQuestions",\s*testPlanId: planId/);
    assert.doesNotMatch(source, /getAssignedVocaPracticeQuestions[\s\S]{0,300}(rangesJson|sourceRangesJson)/);
    assert.match(source, /skipSave: true/);
    assert.match(source, /if \(currentTestMeta\?\.skipSave\) testAlreadySaved = true;\s*else saveResultToServer/);
    assert.match(source, /skipSave: Boolean\(priorMeta\.skipSave\)/);
  });
}

test('STAGING login screen shows the current candidate version', () => {
  assert.match(sourceFor('v6-staging.html'), /v6\.3\.3 STAGING · 배정 시험범위 개인 연습/);
});
