// test/manage-scan.test.js — 관리 보조의 standalone 제거(유일한 쓰기) 안전 동작 검증.
// 실제 ~/.claude 를 건드리지 않도록 가짜 HOME/USERPROFILE 로 CLI 를 자식 프로세스로 돌린다.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const MS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'manage-scan.js');

function homeWithSkill(name = 'victim') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-ms-'));
  const dir = path.join(home, '.claude', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: 테스트\n---\n`);
  return { home, dir };
}
function homeWithPluginSkill(skillName = 'pvictim') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-ms-'));
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });
  const inst = path.join(home, '.claude', 'plugins', 'cache', 'market', 'pack', '1', 'skills', skillName);
  fs.mkdirSync(inst, { recursive: true });
  fs.writeFileSync(path.join(inst, 'SKILL.md'), `---\nname: ${skillName}\ndescription: x\n---\n`);
  fs.writeFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({
    plugins: { 'pack@market': [{ installPath: path.join(home, '.claude', 'plugins', 'cache', 'market', 'pack', '1') }] },
  }));
  return { home, inst };
}
function run(args, home) {
  return execFileSync(process.execPath, [MS, ...args], {
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}
function runFail(args, home) {
  try { run(args, home); return null; } catch (e) { return e; }
}

test('--remove dry-run: 폴더를 안 옮기고 확인 토큰(폴더명 아님)을 돌려준다', () => {
  const { home, dir } = homeWithSkill();
  const out = JSON.parse(run(['--remove', 'victim'], home));
  assert.strictEqual(out.mode, 'dry-run');
  assert.match(out.confirmToken, /^[0-9a-f]{10}$/, '토큰은 내용 해시(폴더명 아님)');
  assert.notStrictEqual(out.confirmToken, 'victim', '공개 폴더명이 그대로 토큰이면 안 됨');
  assert.ok(fs.existsSync(dir), 'dry-run 은 폴더를 그대로 둠');
});

test('--remove 토큰은 결정적: 같은 상태면 두 dry-run 이 같은 토큰(상태 저장 없이 confirm 재계산)', () => {
  const { home } = homeWithSkill();
  const a = JSON.parse(run(['--remove', 'victim'], home)).confirmToken;
  const b = JSON.parse(run(['--remove', 'victim'], home)).confirmToken;
  assert.strictEqual(a, b);
});

test('--remove --confirm 틀린 토큰: 거부·폴더 보존·정답 토큰 비노출(자가구성 차단)', () => {
  const { home, dir } = homeWithSkill();
  const e = runFail(['--remove', 'victim', '--confirm', 'WRONG'], home);
  assert.ok(e && e.status === 1, '비0 종료');
  const out = JSON.parse(e.stdout);
  assert.strictEqual(out.reason, 'token-mismatch');
  assert.ok(!('expected' in out), '에러에 정답 토큰을 흘리지 않음');
  assert.ok(fs.existsSync(dir), '틀린 토큰엔 폴더 보존');
});

test('--remove --confirm 맞는 토큰(dry-run 으로 받은): 휴지통으로 이동 + 감사 로그', () => {
  const { home, dir } = homeWithSkill();
  const dry = JSON.parse(run(['--remove', 'victim'], home));   // 먼저 미리보기로 토큰 획득(강제)
  const out = JSON.parse(run(['--remove', 'victim', '--confirm', dry.confirmToken], home));
  assert.strictEqual(out.mode, 'removed');
  assert.ok(!fs.existsSync(dir), '원본 폴더는 사라짐(이동)');
  const trash = path.join(home, '.claude', '.skills-manager-trash');
  assert.ok(fs.readdirSync(trash).some((n) => n.endsWith('-victim')), '휴지통에 이동본 존재');
  assert.ok(fs.existsSync(path.join(trash, 'removals.log.jsonl')), '감사 로그 기록');
});

test('--remove 경로 탈출(..) 거부', () => {
  const { home } = homeWithSkill();
  const e = runFail(['--remove', '../../evil', '--confirm', 'x'], home);
  assert.ok(e && e.status === 1);
  assert.strictEqual(JSON.parse(e.stdout).reason, 'bad-name');
});

test('--remove 숨김(.)·구분자 이름 거부', () => {
  const { home } = homeWithSkill();
  assert.strictEqual(JSON.parse(runFail(['--remove', '.git', '--confirm', '.git'], home).stdout).reason, 'bad-name');
});

test('--remove 없는 스킬: not-standalone', () => {
  const { home } = homeWithSkill();
  const e = runFail(['--remove', 'nope', '--confirm', 'nope'], home);
  assert.ok(e && e.status === 1);
  assert.strictEqual(JSON.parse(e.stdout).reason, 'not-standalone');
});

test('--update-status: standalone 목록·요약을 JSON 으로(읽기 전용)', () => {
  const { home } = homeWithSkill();
  const out = JSON.parse(run(['--update-status'], home));
  assert.ok(Array.isArray(out.standalone));
  assert.ok(out.standalone.some((s) => s.name === 'victim'));
  assert.ok(out.summary && typeof out.summary.standaloneTotal === 'number');
});

test('--residue: 읽기 전용 탐지, 폴더 보존', () => {
  const { home, dir } = homeWithSkill();
  const out = JSON.parse(run(['--residue', 'victim'], home));
  assert.strictEqual(out.location, 'standalone');
  assert.ok(fs.existsSync(dir), 'residue 는 아무것도 안 지움');
});

test('--remove 플러그인 안 스킬: location:plugin 으로 거부, 캐시 폴더 보존', () => {
  const { home, inst } = homeWithPluginSkill();
  const e = runFail(['--remove', 'pvictim', '--confirm', 'pvictim'], home);
  assert.ok(e && e.status === 1, '비0 종료');
  assert.strictEqual(JSON.parse(e.stdout).location, 'plugin');
  assert.ok(fs.existsSync(inst), '플러그인 캐시 폴더는 그대로 보존');
});

test('--remove 보호 폴더(자기 자신·learned 컨테이너): protected 거부', () => {
  const { home } = homeWithSkill();
  fs.mkdirSync(path.join(home, '.claude', 'skills', 'skills-manager'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'skills', 'learned', 'lesson-a'), { recursive: true });
  const self = runFail(['--remove', 'skills-manager', '--confirm', 'skills-manager'], home);
  assert.strictEqual(JSON.parse(self.stdout).reason, 'protected', '자기 자신 보호');
  const learned = runFail(['--remove', 'learned', '--confirm', 'learned'], home);
  assert.strictEqual(JSON.parse(learned.stdout).reason, 'protected', 'learned 컨테이너 보호');
  assert.ok(fs.existsSync(path.join(home, '.claude', 'skills', 'learned', 'lesson-a')), '컨테이너 내용 보존');
});

test('--remove 심링크 탈출(skills 밖을 가리킴): outside-skills 거부, 대상 보존', (t) => {
  const { home } = homeWithSkill();
  const outside = path.join(home, 'precious');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'data');
  const link = path.join(home, '.claude', 'skills', 'evil');
  try { fs.symlinkSync(outside, link, 'junction'); }
  catch { t.skip('이 환경에서 디렉터리 심링크 생성 불가'); return; }
  const e = runFail(['--remove', 'evil', '--confirm', 'evil'], home);
  assert.ok(e && e.status === 1);
  assert.strictEqual(JSON.parse(e.stdout).reason, 'outside-skills');
  assert.ok(fs.existsSync(path.join(outside, 'keep.txt')), '심링크 대상 데이터 보존');
});
