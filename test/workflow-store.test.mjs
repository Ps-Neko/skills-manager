// test/workflow-store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveWorkflow, loadUser, validName, RESERVED } from '../workflow-store.mjs';

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

test('saving an existing name overwrites and flags it', () => {
  const file = tmpFile();
  saveWorkflow('dup', { label: 'A', steps: [] }, file);
  const res = saveWorkflow('dup', { label: 'B', steps: [] }, file);
  assert.strictEqual(res.overwritten, true);
  const loaded = loadUser(file);
  assert.strictEqual(loaded.length, 1);
  assert.strictEqual(loaded[0].label, 'B');
});
