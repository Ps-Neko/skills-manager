// test/cli-output.test.mjs — 사람용 기본 출력의 배선(접기/--all/첫 실행) 통합 테스트.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCAN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scan.mjs');

// 제어된 가짜 HOME 에 .claude/skills/<한 스킬> 을 깔아 결정적 스캔 환경을 만든다.
function fixtureHome(skillName = 'solo-skill') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-home-'));
  const skillDir = path.join(home, '.claude', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ${skillName}\ndescription: 테스트용 단일 스킬\n---\n`);
  return home;
}
function run(args, { home, smHome }) {
  return execFileSync(process.execPath, [SCAN, ...args], {
    input: '', encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, SKILLS_MANAGER_HOME: smHome },
  });
}

test('기본 출력: 한 줄 결론 + 다음 한 수, 묶음별 분포는 숨김(접힘)', () => {
  const home = fixtureHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-'));
  const out = run([], { home, smHome });
  assert.match(out, /한 줄:/);
  assert.match(out, /다음 한 수:/);
  assert.match(out, /깔린 스킬 약 1개\./);     // 접힌 한 줄
  assert.ok(!/도구용 사본 \d+벌 접음/.test(out), '접힘은 상세 분포를 숨김');
});

test('--all: 묶음별 분포 상세를 보여준다', () => {
  const home = fixtureHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-'));
  const out = run(['--all'], { home, smHome });
  assert.match(out, /도구용 사본 \d+벌 접음/);  // full 상세
});

test('첫 실행(저장된 흐름 0개): 환영 배너가 분석 위에 한 번', () => {
  const home = fixtureHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-')); // 빈 SM_HOME → loadUser []=첫 실행
  const out = run([], { home, smHome });
  assert.match(out, /처음 오셨네요/);
});

test('둘째 실행(흐름 저장됨): 환영 배너 사라짐', () => {
  const home = fixtureHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-'));
  execFileSync(process.execPath, [SCAN, '--save', 'mine'], {
    input: JSON.stringify({ label: 'm', steps: [{ capability: 'tdd', skill: null, note: '' }] }),
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, SKILLS_MANAGER_HOME: smHome },
  });
  const out = run([], { home, smHome });
  assert.ok(!out.includes('처음 오셨네요'), '저장 후엔 배너 없음');
});
