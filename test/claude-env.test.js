// test/claude-env.test.js — settings.json + settings.local.json 병합 리더(읽기 전용).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readEnabledPlugins } from '../claude-env.js';

function tmpClaude(settings, local) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-env-'));
  if (settings) fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify(settings));
  if (local) fs.writeFileSync(path.join(d, 'settings.local.json'), JSON.stringify(local));
  return d;
}

test('readEnabledPlugins: settings.json + settings.local.json 병합', () => {
  const d = tmpClaude({ enabledPlugins: { 'a@m': true } }, { enabledPlugins: { 'b@m': true } });
  assert.deepStrictEqual(readEnabledPlugins(d), { 'a@m': true, 'b@m': true });
});

test('readEnabledPlugins: 같은 키는 local 이 override', () => {
  const d = tmpClaude({ enabledPlugins: { 'a@m': true } }, { enabledPlugins: { 'a@m': false } });
  assert.strictEqual(readEnabledPlugins(d)['a@m'], false);
});

test('readEnabledPlugins: 파일 없거나 손상이어도 안 죽고 {}', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-env-'));
  assert.deepStrictEqual(readEnabledPlugins(d), {});
  fs.writeFileSync(path.join(d, 'settings.json'), '{broken');
  assert.deepStrictEqual(readEnabledPlugins(d), {});
});

test('readEnabledPlugins: 한쪽만 있어도 그쪽만 반영', () => {
  const d = tmpClaude({ enabledPlugins: { 'only@m': true } }, null);
  assert.deepStrictEqual(readEnabledPlugins(d), { 'only@m': true });
});
