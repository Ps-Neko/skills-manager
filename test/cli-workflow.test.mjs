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
