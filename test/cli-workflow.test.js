// test/cli-workflow.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCAN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scan.js');

// 워크플로우 스토어 CLI 테스트는 HOME 을 빈 임시폴더로 격리한다 — 개발자의 실제
// ~/.claude/skills 에 의존하지 않게(그 의존이 "로컬 green·CI red" 함정의 원인이었다).
// SKILLS_MANAGER_HOME(워크플로우 파일)은 테스트마다 따로 주입한다.
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-fakehome-'));

function run(args, { input, home }) {
  return execFileSync(process.execPath, [SCAN, ...args], {
    input: input ?? '',
    encoding: 'utf8',
    env: { ...process.env, HOME: FAKE_HOME, USERPROFILE: FAKE_HOME, SKILLS_MANAGER_HOME: home },
  });
}

test('--save writes to the user home, --workflows --json lists it, --delete removes it', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const wf = JSON.stringify({ label: '내 배포점검', steps: [{ capability: 'ship', skill: 'gstack:ship', note: '' }] });

  const saveOut = run(['--save', 'my-release'], { input: wf, home });
  assert.match(saveOut, /저장|saved/i);
  assert.ok(fs.existsSync(path.join(home, 'skills-manager-workflows.json')));

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
  assert.ok(!fs.existsSync(path.join(home, 'skills-manager-workflows.json')), '예약 이름은 파일을 안 만든다');
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

test('--set-skill without --step shows usage (exit 1)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const wf = JSON.stringify({ label: 'm', steps: [{ capability: 'tdd', skill: null }] });
  run(['--save', 'mine'], { input: wf, home });
  let err;
  try { run(['--set-skill', 'mine', '--skill', 'a:b'], { home }); }
  catch (e) { err = e; }
  assert.ok(err);
  assert.strictEqual(err.status, 1);
  assert.match(err.stdout, /사용법/);
});

test('--json 은 version·counts·groups 구조를 유지한다 (재배선 안전망)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const out = JSON.parse(run(['--json'], { home }));
  assert.ok(typeof out.version === 'string', 'version 문자열');
  assert.ok(out.counts && typeof out.counts.total === 'number', 'counts.total 숫자');
  assert.ok(Array.isArray(out.skills), 'skills 배열');
  assert.ok(Array.isArray(out.groups), 'groups 배열');
  for (const g of out.groups) {
    assert.ok(typeof g.capability === 'string' && typeof g.label === 'string', 'group 은 capability·label');
    assert.ok(Array.isArray(g.skills) && Array.isArray(g.sources), 'group 은 skills·sources 배열');
  }
});

test('--workflows --json 은 각 단계에 resolved 를 붙인다(기존 source 필드 유지)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const listed = JSON.parse(run(['--workflows', '--json'], { home }));
  const appdev = listed.workflows.find((w) => w.name === 'app-dev');
  assert.ok(appdev, '내장 app-dev 존재');
  assert.strictEqual(appdev.source, 'builtin');
  for (const s of appdev.steps) {
    assert.ok(s.resolved, '각 단계에 resolved');
    assert.ok(['pinned', 'multi', 'single', 'none'].includes(s.resolved.kind), 'kind 는 4종 중 하나');
    assert.ok(typeof s.resolved.label === 'string' && s.resolved.label.length, 'label 존재');
  }
  // implement 단계는 전담 스킬 없음 → 어떤 인벤토리에서도 none
  const impl = appdev.steps.find((s) => s.capability === 'implement');
  assert.strictEqual(impl.resolved.kind, 'none');
});

test('--workflows(글자) 는 단계별 쓸 스킬 표를 찍는다', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const out = run(['--workflows'], { home });
  assert.match(out, /단계별 쓸 스킬/);
  assert.match(out, /기본 Claude로/);        // implement 단계
  assert.match(out, /app-dev/);
});

test('--workflows --json: 사용자 흐름 단계의 note/skill/source 가 보존된다(스프레드 회귀 잠금)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const wf = JSON.stringify({ label: '내 흐름', steps: [
    { capability: 'ship', skill: 'gstack:ship', note: '배포 전 마지막 점검' },
  ] });
  run(['--save', 'mine'], { input: wf, home });
  const j = JSON.parse(run(['--workflows', '--json'], { home }));
  const mine = j.workflows.find((w) => w.name === 'mine');
  assert.strictEqual(mine.source, 'user');
  assert.strictEqual(mine.steps[0].note, '배포 전 마지막 점검', 'note 보존');
  assert.strictEqual(mine.steps[0].skill, 'gstack:ship', 'skill(핀) 보존');
  assert.strictEqual(mine.steps[0].resolved.kind, 'pinned');
});

test('--workflows(글자): 스킬 폴더 없는 환경도 안 죽고, 단계 라벨이 한국어다(영어 cap 노출 금지)', () => {
  // USERPROFILE/HOME 를 빈 임시폴더로 → os.homedir() 가 그쪽을 보게 해 no-skills 경로 강제.
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-nohome-'));
  const smHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-sm-'));
  const out = execFileSync(process.execPath, [SCAN, '--workflows'], {
    input: '', encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome, SKILLS_MANAGER_HOME: smHome },
  });
  assert.match(out, /기본 Claude로/, 'no-skills 면 모든 단계가 none → 기본 Claude로');
  // 한국어 라벨이 인벤토리 없이도 떨어져야(정적 라벨표). 이게 없으면 영어 cap 으로 추락한 것.
  assert.match(out, /테스트 먼저 짜기/, 'tdd 라벨 한국어');
  assert.match(out, /스펙 작성/, 'spec 라벨 한국어');
  assert.match(out, /코드 리뷰/, 'review 라벨 한국어');
  // 단계 행(번호 + 라벨)에 영어 cap 토큰이 라벨로 새지 않아야(헤더 슬러그는 제외).
  assert.doesNotMatch(out, /\n\s*\d+\s+(brainstorm|spec|plan|tdd|review|debug|security|ship|simplify)\s/, '단계 라벨에 영어 cap 노출 금지');
});

test('--workflows: 구버전 파일에 박힌 제어문자(ANSI)도 출력 전 정화(심층방어)', () => {
  // saveWorkflow 입력검증을 우회해 직접 기록 = 이 fix 이전에 저장된 오염 파일을 모사.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-poison-'));
  const ESC = String.fromCharCode(27);
  const poisoned = { version: 1, workflows: [{
    name: 'legacy' + ESC + '[2K', label: 'Old' + ESC + '[2KFlow',
    steps: [
      { capability: 'review', skill: 'user:x' + ESC + '[31mSPOOF', note: '' },
      { capability: 'weird' + ESC + '[33m', skill: null, note: '' },
    ],
  }] };
  fs.writeFileSync(path.join(home, 'skills-manager-workflows.json'), JSON.stringify(poisoned));
  const out = run(['--workflows'], { home });
  assert.ok(!out.includes(ESC), '--workflows 사람 출력에 ESC 가 남지 않아야 함');
  assert.match(out, /legacy/, '워크플로우 자체는 보임');
});
