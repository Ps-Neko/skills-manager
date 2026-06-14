// test/cli-workflow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCAN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scan.mjs');

function run(args, { input, home }) {
  return execFileSync(process.execPath, [SCAN, ...args], {
    input: input ?? '',
    encoding: 'utf8',
    env: { ...process.env, SKILLSWEEP_HOME: home },
  });
}

test('--save writes to the user home, --workflows --json lists it, --delete removes it', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const wf = JSON.stringify({ label: '내 배포점검', steps: [{ capability: 'ship', skill: 'gstack:ship', note: '' }] });

  const saveOut = run(['--save', 'my-release'], { input: wf, home });
  assert.match(saveOut, /저장|saved/i);
  assert.ok(fs.existsSync(path.join(home, 'skillsweep-workflows.json')));

  const listed = JSON.parse(run(['--workflows', '--json'], { home }));
  const mine = listed.workflows.find((w) => w.name === 'my-release');
  assert.ok(mine, 'saved workflow appears in --workflows --json');
  assert.strictEqual(mine.source, 'user');

  const delOut = run(['--delete', 'my-release'], { home });
  assert.match(delOut, /삭제|deleted/i);
  const after = JSON.parse(run(['--workflows', '--json'], { home }));
  assert.ok(!after.workflows.find((w) => w.name === 'my-release'));
});

test('--save rejects a reserved built-in name (non-zero exit + 안내 메시지)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const wf = JSON.stringify({ label: 'x', steps: [] });
  let err;
  try { run(['--save', 'release-check'], { input: wf, home }); }
  catch (e) { err = e; }
  assert.ok(err, '예약 이름 저장은 비0 종료로 throw 해야 함');
  assert.notStrictEqual(err.status, 0);
  assert.match(err.stdout, /내장 템플릿 이름/);
  assert.ok(!fs.existsSync(path.join(home, 'skillsweep-workflows.json')), '예약 이름은 파일을 안 만든다');
});

test('--get reports not-found as JSON with exit 1', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  let err;
  try { run(['--get', 'nope'], { home }); }
  catch (e) { err = e; }
  assert.ok(err, '없는 이름 --get 은 비0 종료로 throw 해야 함');
  assert.strictEqual(err.status, 1);
  const parsed = JSON.parse(err.stdout);
  assert.strictEqual(parsed.error, 'not-found');
  assert.strictEqual(parsed.name, 'nope');
});

test('--set-skill changes a saved step skill (exit 0 + 파일 반영)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const wf = JSON.stringify({ label: '내 흐름', steps: [
    { capability: 'tdd', skill: null, note: '' },
    { capability: 'review', skill: null, note: '' },
  ] });
  run(['--save', 'mine'], { input: wf, home });
  const out = run(['--set-skill', 'mine', '--step', '2', '--skill', 'agent-skills:code-review-and-quality'], { home });
  assert.match(out, /고쳤어요/);
  const got = JSON.parse(run(['--get', 'mine'], { home }));
  assert.strictEqual(got.steps[1].skill, 'agent-skills:code-review-and-quality');
  assert.strictEqual(got.steps[0].skill, null);
});

test('--set-skill --skill none clears the pin', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const wf = JSON.stringify({ label: 'm', steps: [{ capability: 'tdd', skill: 'x:y', note: '' }] });
  run(['--save', 'mine'], { input: wf, home });
  const out = run(['--set-skill', 'mine', '--step', '1', '--skill', 'none'], { home });
  assert.match(out, /비움/);
  const got = JSON.parse(run(['--get', 'mine'], { home }));
  assert.strictEqual(got.steps[0].skill, null);
});

test('--set-skill warns for an uninstalled skill but still sets it', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const wf = JSON.stringify({ label: 'm', steps: [{ capability: 'tdd', skill: null, note: '' }] });
  run(['--save', 'mine'], { input: wf, home });
  const out = run(['--set-skill', 'mine', '--step', '1', '--skill', '__nope__:__x__'], { home });
  assert.match(out, /주의/);
  assert.match(out, /고쳤어요/);
  const got = JSON.parse(run(['--get', 'mine'], { home }));
  assert.strictEqual(got.steps[0].skill, '__nope__:__x__');
});

test('--set-skill on a reserved built-in name fails (exit 1)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  let err;
  try { run(['--set-skill', 'app-dev', '--step', '1', '--skill', 'a:b'], { home }); }
  catch (e) { err = e; }
  assert.ok(err);
  assert.strictEqual(err.status, 1);
  assert.match(err.stdout, /내장 템플릿은 못 고쳐요/);
});

test('--set-skill on an unknown workflow fails (exit 1)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  let err;
  try { run(['--set-skill', 'ghost', '--step', '1', '--skill', 'a:b'], { home }); }
  catch (e) { err = e; }
  assert.ok(err);
  assert.strictEqual(err.status, 1);
  assert.match(err.stdout, /내 워크플로우에 없어요/);
});

test('--set-skill with out-of-range step fails (exit 1)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const wf = JSON.stringify({ label: 'm', steps: [{ capability: 'tdd', skill: null }] });
  run(['--save', 'mine'], { input: wf, home });
  let err;
  try { run(['--set-skill', 'mine', '--step', '9', '--skill', 'a:b'], { home }); }
  catch (e) { err = e; }
  assert.ok(err);
  assert.strictEqual(err.status, 1);
  assert.match(err.stdout, /범위를 벗어났어요/);
});

test('--set-skill without --skill shows usage (exit 1)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const wf = JSON.stringify({ label: 'm', steps: [{ capability: 'tdd', skill: null }] });
  run(['--save', 'mine'], { input: wf, home });
  let err;
  try { run(['--set-skill', 'mine', '--step', '1'], { home }); }
  catch (e) { err = e; }
  assert.ok(err);
  assert.strictEqual(err.status, 1);
  assert.match(err.stdout, /사용법/);
});
