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
