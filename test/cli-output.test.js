// test/cli-output.test.js — 사람용 기본 출력의 배선(접기/--all/첫 실행) 통합 테스트.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCAN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scan.js');

// 제어된 가짜 HOME 에 .claude/skills/<한 스킬> 을 깔아 결정적 스캔 환경을 만든다.
function fixtureHome(skillName = 'solo-skill') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-home-'));
  const skillDir = path.join(home, '.claude', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ${skillName}\ndescription: 테스트용 단일 스킬\n---\n`);
  return home;
}
// 충돌 1개(TDD 그룹)를 결정적으로 만든다: 최상위 tdd(출처 user) + gstack/test-driven-development(출처 gstack).
// gstack 출처로 인식되려면 gstack/<name> 원본 + 최상위 평면 사본이 둘 다 있어야 함(스캔의 평면화 모델).
function conflictHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-home-'));
  const mk = (rel, name) => {
    const d = path.join(home, '.claude', 'skills', ...rel);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'SKILL.md'), `---\nname: ${name}\ndescription: 테스트용 ${name}\n---\n`);
  };
  mk(['tdd'], 'tdd');                                                      // 출처 user
  mk(['gstack', 'test-driven-development'], 'test-driven-development');     // gstack 원본
  mk(['test-driven-development'], 'test-driven-development');               // 최상위 평면 사본 → 출처 gstack
  return home;
}
function run(args, { home, smHome }) {
  return execFileSync(process.execPath, [SCAN, ...args], {
    input: '', encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, SKILLS_MANAGER_HOME: smHome },
  });
}

test('기본 출력(겹침 0): 결론 한 줄 + 다음 한 수, 인벤토리 줄·상세 분포는 숨김(접힘)', () => {
  const home = fixtureHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-'));
  const out = run([], { home, smHome });
  assert.match(out, /스킬 1개, 같은 일이 겹친 곳 없음\. 깔끔함\./); // 결론이 스킬 수까지 안음
  assert.ok(!out.includes('한 줄:'), "'한 줄:' 라벨은 떼고 문장만");
  assert.match(out, /다음 한 수:/);
  assert.ok(!/깔린 스킬 약 1개\./.test(out), '인벤토리 줄은 접힘에서 안 보임(--all 로)');
  assert.ok(!/도구용 사본 \d+벌 접음/.test(out), '접힘은 상세 분포를 숨김');
});

test('기본 출력(겹침 있음): 세로 겹침 목록을 안 찍는다(띠는 LLM 몫) + 결론에 가짓수 + --all 안내', () => {
  const home = conflictHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-'));
  const out = run([], { home, smHome });
  assert.match(out, /같은 일이 1가지 겹침/);                   // 결론엔 가짓수
  assert.ok(!/같은 일이 겹친 곳 —/.test(out), '접힘은 세로 목록 머리글을 안 찍음');
  assert.ok(!/· 테스트 먼저 짜기 \(TDD\) — 2곳/.test(out), '세로 목록 줄도 없음');
  assert.match(out, /node scan\.js --all/);                   // 전체 진입점은 다음 한 수에
});

test('--all(겹침 있음): 세로 겹침 목록을 보여준다(전체 진단 보존)', () => {
  const home = conflictHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-'));
  const out = run(['--all'], { home, smHome });
  assert.match(out, /같은 일이 겹친 곳 —/);
  assert.match(out, /테스트 먼저 짜기 \(TDD\) — 2곳/);
});

test('--all: 묶음별 분포 상세를 보여준다', () => {
  const home = fixtureHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-'));
  const out = run(['--all'], { home, smHome });
  assert.match(out, /도구용 사본 \d+벌 접음/);  // full 상세
});

test('저장 흐름 0개: "저장한 흐름 없음" 안내가 분석 위에 한 번', () => {
  const home = fixtureHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-')); // 빈 SM_HOME → loadUser []=저장 흐름 0개
  const out = run([], { home, smHome });
  assert.match(out, /저장한 '내 흐름'이 없어요/);
  assert.ok(!out.includes('처음 오셨네요'), '"첫 실행" 문구는 부정확이라 안 씀');
});

test('흐름 저장 후: 안내 사라짐', () => {
  const home = fixtureHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-'));
  execFileSync(process.execPath, [SCAN, '--save', 'mine'], {
    input: JSON.stringify({ label: 'm', steps: [{ capability: 'tdd', skill: null, note: '' }] }),
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, SKILLS_MANAGER_HOME: smHome },
  });
  const out = run([], { home, smHome });
  assert.ok(!out.includes("저장한 '내 흐름'이 없어요"), '저장 후엔 안내 없음');
});

test('--save 빈 stdin: 사용법 + 예시 + 저장된 흐름 목록으로 안내', () => {
  const home = fixtureHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-'));
  let err;
  try { run(['--save', '내흐름'], { home, smHome }); }
  catch (e) { err = e; }
  assert.ok(err && err.status === 1, '빈 stdin 저장은 비0 종료');
  assert.match(err.stdout, /흐름을 저장하려면 단계가 필요/);
  assert.match(err.stdout, /이걸로 저장/);
  assert.match(err.stdout, /지금 저장된 내 흐름: \(없음\)/);
});

test('--set-skill 범위초과: 단계 라벨 목록을 회신해 회복을 돕는다', () => {
  const home = fixtureHome();
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-'));
  execFileSync(process.execPath, [SCAN, '--save', 'mine'], {
    input: JSON.stringify({ label: 'm', steps: [{ capability: 'debug', skill: null }, { capability: 'tdd', skill: null }] }),
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, SKILLS_MANAGER_HOME: smHome },
  });
  let err;
  try {
    execFileSync(process.execPath, [SCAN, '--set-skill', 'mine', '--step', '9', '--skill', 'a:b'], {
      input: '', encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, SKILLS_MANAGER_HOME: smHome },
    });
  } catch (e) { err = e; }
  assert.ok(err && err.status === 1);
  assert.match(err.stdout, /범위를 벗어났어요/);
  assert.match(err.stdout, /이 흐름의 단계:/);
  assert.match(err.stdout, /1 디버깅/);
  assert.match(err.stdout, /2 테스트 먼저 짜기/);
});

test('겹침 0개(단일 스킬): 한 줄 결론이 깔끔함을 말하므로 겹침 목록 줄은 중복 출력 안 함', () => {
  const home = fixtureHome();                 // 스킬 1개 → 겹침 0
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sm-'));
  const out = run([], { home, smHome });
  assert.match(out, /같은 일이 겹친 곳 없음\. 깔끔함\./);                 // 결론에 한 번
  assert.strictEqual((out.match(/깔끔함/g) || []).length, 1, "'깔끔함'은 정확히 한 번");
});
