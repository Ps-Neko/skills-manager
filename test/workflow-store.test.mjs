// test/workflow-store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveWorkflow, loadUser, validName, RESERVED, removeWorkflow, annotateMissing, listAll, validStep } from '../workflow-store.mjs';

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-'));
  return path.join(dir, 'skillsweep-workflows.json');
}

test('save then load round-trips a workflow', () => {
  const file = tmpFile();
  const wf = { label: '내 흐름', steps: [{ capability: 'tdd', skill: 'agent-skills:test-driven-development', note: '' }] };
  const res = saveWorkflow('my-flow', wf, file);
  assert.strictEqual(res.ok, true);
  const loaded = loadUser(file);
  assert.strictEqual(loaded.length, 1);
  assert.strictEqual(loaded[0].name, 'my-flow');
  assert.strictEqual(loaded[0].steps[0].skill, 'agent-skills:test-driven-development');
});

test('loadUser returns [] for a missing file', () => {
  assert.deepStrictEqual(loadUser(path.join(os.tmpdir(), 'sw-nope', 'none.json')), []);
});

test('loadUser returns [] for valid JSON without a workflows key', () => {
  const file = tmpFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{}');
  assert.deepStrictEqual(loadUser(file), []);
});

test('reserved built-in names cannot be saved', () => {
  const file = tmpFile();
  const res = saveWorkflow('app-dev', { steps: [] }, file);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'reserved');
  assert.deepStrictEqual(loadUser(file), []); // 안 써졌다
});

test('invalid names are rejected', () => {
  const file = tmpFile();
  assert.strictEqual(saveWorkflow('../escape', { steps: [] }, file).reason, 'invalid-name');
  assert.strictEqual(saveWorkflow('a/b', { steps: [] }, file).reason, 'invalid-name');
  assert.strictEqual(saveWorkflow('', { steps: [] }, file).reason, 'invalid-name');
});

test('validName accepts 한글·hyphen·underscore', () => {
  assert.strictEqual(validName('내-흐름_1'), true);
  assert.strictEqual(validName('a/b'), false);
});

test('validName rejects leading/trailing hyphens but keeps internal ones', () => {
  assert.strictEqual(validName('-start'), false);
  assert.strictEqual(validName('end-'), false);
  assert.strictEqual(validName('mid-dash'), true);
  assert.strictEqual(validName('a'), true);
});

test('saving an existing name overwrites and flags it', () => {
  const file = tmpFile();
  saveWorkflow('dup', { label: 'A', steps: [] }, file);
  const res = saveWorkflow('dup', { label: 'B', steps: [] }, file);
  assert.strictEqual(res.overwritten, true);
  const loaded = loadUser(file);
  assert.strictEqual(loaded.length, 1);
  assert.strictEqual(loaded[0].label, 'B');
});

test('remove deletes a saved workflow', () => {
  const file = tmpFile();
  saveWorkflow('gone', { steps: [] }, file);
  assert.strictEqual(removeWorkflow('gone', file).ok, true);
  assert.deepStrictEqual(loadUser(file), []);
});

test('removing a missing name reports not-found', () => {
  const file = tmpFile();
  const res = removeWorkflow('nope', file);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'not-found');
});

test('a corrupt user file loads as [] and does not crash on save', () => {
  const file = tmpFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ this is not json');
  assert.deepStrictEqual(loadUser(file), []);
  const res = saveWorkflow('after-corrupt', { steps: [] }, file);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(loadUser(file).length, 1); // 손상 내용 위에 안전하게 새로 씀
});

test('annotateMissing flags installed vs missing vs null', () => {
  const wf = { name: 'w', steps: [
    { capability: 'tdd', skill: 'agent-skills:test-driven-development' },
    { capability: 'review', skill: 'gone:old-skill' },
    { capability: 'implement', skill: null },
  ] };
  const out = annotateMissing(wf, ['agent-skills:test-driven-development', 'gstack:review']);
  assert.strictEqual(out.steps[0].installed, true);
  assert.strictEqual(out.steps[1].installed, false);
  assert.strictEqual(out.steps[2].installed, null);
});

test('annotateMissing returns steps:[] for a workflow without a steps key', () => {
  const out = annotateMissing({ name: 'x' }, []);
  assert.deepStrictEqual(out.steps, []);
  assert.strictEqual(out.name, 'x');
});

test('listAll merges builtin + user with source labels', () => {
  const merged = listAll([{ name: 'app-dev', steps: [] }], [{ name: 'mine', steps: [] }]);
  assert.strictEqual(merged.find((w) => w.name === 'app-dev').source, 'builtin');
  assert.strictEqual(merged.find((w) => w.name === 'mine').source, 'user');
});

test('saveWorkflow rejects malformed steps (invalid-steps)', () => {
  const file = tmpFile();
  assert.strictEqual(saveWorkflow('bad1', { steps: [{ skill: 'a:b' }] }, file).reason, 'invalid-steps'); // capability 없음
  assert.strictEqual(saveWorkflow('bad2', { steps: 'nope' }, file).reason, 'invalid-steps'); // steps 가 배열 아님
  assert.strictEqual(saveWorkflow('bad3', { steps: [{ capability: 'tdd', skill: 5 }] }, file).reason, 'invalid-steps'); // skill 타입 오류
  assert.deepStrictEqual(loadUser(file), []); // 아무것도 안 써짐
});

test('validStep accepts well-formed steps incl. null skill/note', () => {
  assert.strictEqual(validStep({ capability: 'tdd', skill: 'a:b', note: '' }), true);
  assert.strictEqual(validStep({ capability: 'implement', skill: null }), true);
  assert.strictEqual(validStep({ skill: 'a:b' }), false); // capability 없음
  assert.strictEqual(validStep(null), false);
});
