// test/cli-json.test.mjs — scan.mjs --json 의 공개 스키마(추천기·워크플로우의 기반)와
// enabledPlugins 병합이 skills[].enabled 까지 전파되는지 end-to-end 로 잠근다.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = path.join(ROOT, 'scan.mjs');
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

function homeWithPlugin({ enabled }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-json-'));
  const CLAUDE = path.join(home, '.claude');
  fs.mkdirSync(path.join(CLAUDE, 'skills'), { recursive: true });
  const inst = path.join(CLAUDE, 'plugins', 'cache', 'market', 'mypack', '1', 'skills', 'tool-a');
  fs.mkdirSync(inst, { recursive: true });
  fs.writeFileSync(path.join(inst, 'SKILL.md'), '---\nname: tool-a\ndescription: x\n---\n');
  fs.writeFileSync(path.join(CLAUDE, 'plugins', 'installed_plugins.json'), JSON.stringify({
    plugins: { 'mypack@market': [{ installPath: path.join(CLAUDE, 'plugins', 'cache', 'market', 'mypack', '1') }] },
  }));
  fs.writeFileSync(path.join(CLAUDE, 'settings.json'), JSON.stringify({ enabledPlugins: { 'mypack@market': enabled } }));
  return home;
}
function json(home) {
  const out = execFileSync(process.execPath, [SCAN, '--json'], {
    input: '', encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, SKILLS_MANAGER_HOME: home },
  });
  return JSON.parse(out);
}

test('--json: _warning·version(package.json 단일 출처)·기본 스키마', () => {
  const j = json(homeWithPlugin({ enabled: true }));
  assert.strictEqual(typeof j._warning, 'string');
  assert.ok(j._warning.length > 0, '_warning 비어있지 않음');
  assert.strictEqual(j.version, PKG_VERSION, 'version 은 package.json 에서 읽음(하드코딩 아님)');
  assert.ok(Array.isArray(j.plugins) && Array.isArray(j.skills) && Array.isArray(j.groups));
});

test('--json: 플러그인 name=label·fullKey 동봉', () => {
  const j = json(homeWithPlugin({ enabled: true }));
  const p = j.plugins.find((x) => x.fullKey === 'mypack@market');
  assert.ok(p, 'fullKey 로 플러그인 식별');
  assert.strictEqual(p.name, 'mypack', '충돌 없으면 name=label=short');
});

test('--json: enabledPlugins=false 가 skills[].enabled 까지 전파', () => {
  const j = json(homeWithPlugin({ enabled: false }));
  const sk = j.skills.find((s) => s.name === 'tool-a');
  assert.ok(sk, 'tool-a 스킬 존재');
  assert.strictEqual(sk.enabled, false, '비활성 플러그인의 스킬은 enabled:false');
});

test('--json: settings.local override 가 병합되어 전파(local 이 이김)', () => {
  const home = homeWithPlugin({ enabled: false });
  fs.writeFileSync(path.join(home, '.claude', 'settings.local.json'), JSON.stringify({ enabledPlugins: { 'mypack@market': true } }));
  const sk = json(home).skills.find((s) => s.name === 'tool-a');
  assert.strictEqual(sk.enabled, true, 'local override(true)로 enabled:true');
});

test('--json: skills 폴더 부재 분기도 _warning·version 을 싣는다(스키마 드리프트 방지)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-json-empty-'));
  const j = json(home); // .claude/skills 없음
  assert.strictEqual(typeof j._warning, 'string');
  assert.strictEqual(j.version, PKG_VERSION);
});
