# Skills Manager 출력 가독성(A) + 초심자·에러 받기(C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/skills-manager`의 기본 터미널 출력을 "결론 + 큰 겹침 + 다음 한 수"로 접고(상세는 `--all`), 첫 실행 안내와 관대한 에러를 더해, 비개발자·공개 초심자가 헤매지 않고 읽고 다음 행동으로 가게 한다.

**Architecture:** 사람용 출력 렌더링을 순수 모듈 `render.mjs`(fs·process 없음, 문자열만 반환)로 추출해 결정적 단위 테스트를 가능하게 한다. `scan.mjs`는 지금처럼 데이터를 계산한 뒤 `render.mjs`를 호출만 한다. 스캔·판정 엔진과 `--json`/`--workflows` 구조는 건드리지 않는다(회귀 잠금).

**Tech Stack:** Node.js v24 (의존성 0), `node:test` + `node:assert`, ES modules(.mjs). 테스트 실행: 전체 `node --test`, 단일 `node --test test/<파일>`.

**확정된 설계 결정 (Open Questions 해소):**
- 겹침 미리보기: 기본은 `topN=7`. 8가지 이하(=현재)는 다 보이고, 초과 시 큰 7개 + "나머지 N가지 — 전체 보기: node scan.mjs --all".
- 상세 플래그: `--all`(현재의 전체 벽). `--judge`는 LLM 판정 패킷 용도 그대로 두되 사람 요약은 full로 출력(과적재 안 함 = 새 정보 안 얹음, 단지 접지 않을 뿐).
- 정렬: 1단 `hits.length` 내림차순, 동순위는 입력 순서 보존(안정). 2단 '진짜 N곳' 보정은 LLM 제시 층(SKILL.md)의 일 — scan은 넓은 값만.

**범위 밖 (Not Doing):** B(도구가 먼저 묻기/진입 번호 메뉴) · 색·이모지·아이콘 · HTML/새 표면 · 스킬 끄기 · 겹침을 2단 '진짜 N곳'으로 자동 재정렬. (근거: `docs/ideas/ui-accessibility.md`)

---

## File Structure

- **Create `render.mjs`** — 순수 렌더링. 표시폭 헬퍼(`dispWidth`/`padW`, scan에서 이동)·`sortedConflicts`·`renderOverlaps`·`renderNextAction`·`renderInventoryLine`·`firstRunBanner`. 어떤 부수효과도 없음.
- **Modify `scan.mjs`** — (1) 표시폭 헬퍼를 `render.mjs`에서 import(로컬 정의 제거), (2) 사람용 출력부(312~342줄)를 `render.mjs` 호출로 교체 + `--all`/`full`/첫 실행 게이트, (3) `--save` 빈 stdin 안내 강화, (4) `--set-skill` 범위초과 에러에 단계 목록 첨부.
- **Modify `workflow-store.mjs`** — `setStepSkill` 의 `bad-step` 반환에 단계 라벨(`steps`) 추가(가산적 — `reason`·`stepCount` 유지).
- **Create `test/render.test.mjs`** — 순수 함수 단위 테스트.
- **Create `test/cli-output.test.mjs`** — `--all`/첫 실행 배너/관대한 에러의 통합 테스트(execFileSync + 제어된 HOME).
- **Modify `test/workflow-store.test.mjs`** — `bad-step` 의 새 `steps` 라벨 검증(기존 단언 유지, 추가만).
- **Modify `SKILL.md`, `README.md`** — 접힌 출력 예시·`--all`·recommend→save 제안 반영(코드 없음).

---

## Task 0: 베이스라인 + 작업 브랜치

**Files:** (없음 — git만)

- [ ] **Step 1: 동시 세션 충돌 방지 — HEAD·작업트리 재확인**

Run: `git -C C:/Users/Mun/workspace/skills-manager status --short && git -C C:/Users/Mun/workspace/skills-manager rev-parse --abbrev-ref HEAD`
Expected: 브랜치 `main`. `_tmp_ideas.mjs`·`docs/ideas/`·`docs/superpowers/plans/` 외 다른 변경이 새로 보이면 **멈추고 사용자에게 알린다**(다른 세션이 같은 파일을 만질 수 있음).

- [ ] **Step 2: 베이스라인 green 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test`
Expected: `pass 44`, `fail 0`.

- [ ] **Step 3: 작업 브랜치 생성**

Run: `git -C C:/Users/Mun/workspace/skills-manager checkout -b feat/output-readability`
Expected: `Switched to a new branch 'feat/output-readability'`

---

## Task 1: `render.mjs` — 표시폭 헬퍼 + 정렬 + 겹침 목록(접기)

**Files:**
- Create: `C:/Users/Mun/workspace/skills-manager/render.mjs`
- Modify: `C:/Users/Mun/workspace/skills-manager/scan.mjs:16-19` (로컬 폭 헬퍼 제거 → import)
- Test: `C:/Users/Mun/workspace/skills-manager/test/render.test.mjs`

- [ ] **Step 1: 실패 테스트 작성** — `test/render.test.mjs` 신규

```js
// test/render.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { dispWidth, padW, sortedConflicts, renderOverlaps } from '../render.mjs';

const C = (label, n) => ({ label, hits: Array(n).fill(0), sources: [] });

test('dispWidth: 한글은 2, ASCII는 1', () => {
  assert.strictEqual(dispWidth('abc'), 3);
  assert.strictEqual(dispWidth('가나'), 4);
});

test('padW: 표시폭 기준 우측 패딩(최소 1칸)', () => {
  assert.strictEqual(dispWidth(padW('가', 6)), 6);
  assert.ok(padW('abc', 1).endsWith(' '), '이미 넘쳐도 최소 1칸');
});

test('sortedConflicts: 곳 수 내림차순, 동순위는 입력 순서 보존', () => {
  const out = sortedConflicts([C('a', 2), C('b', 4), C('c', 4), C('d', 1)]);
  assert.deepStrictEqual(out.map((c) => c.label), ['b', 'c', 'a', 'd']);
});

test('renderOverlaps: 빈 입력이면 깔끔함 문구', () => {
  assert.match(renderOverlaps([]), /겹친 곳 없음/);
});

test('renderOverlaps: 8가지(topN=7 초과) 접힘 — 큰 7 + 나머지 1 안내', () => {
  const conflicts = Array.from({ length: 8 }, (_, i) => C('겹침' + i, i + 1));
  const out = renderOverlaps(conflicts, { full: false, topN: 7 });
  assert.match(out, /큰 7개만/);
  assert.match(out, /나머지 1가지 — 전체 보기: node scan\.mjs --all/);
  assert.match(out, /겹침7 — 8곳/); // 가장 큰 게 맨 위
  assert.ok(!out.includes('겹침0'), '가장 작은 1곳은 접힘에 들어가 안 보임');
});

test('renderOverlaps: full=true 면 정렬만, 접지 않음', () => {
  const conflicts = Array.from({ length: 8 }, (_, i) => C('겹침' + i, i + 1));
  const out = renderOverlaps(conflicts, { full: true, topN: 7 });
  assert.ok(!out.includes('나머지'), 'full 은 접기 안내 없음');
  assert.match(out, /겹침0 — 1곳/); // 다 보임
});

test('renderOverlaps: 8개 이하·full=false 면 다 보이고 접기 안내 없음', () => {
  const conflicts = Array.from({ length: 7 }, (_, i) => C('x' + i, i + 1));
  const out = renderOverlaps(conflicts, { full: false, topN: 7 });
  assert.ok(!out.includes('나머지'));
  assert.ok(!out.includes('큰 7개만'));
});

test('renderOverlaps: 영어 스킬명·이모지 없음(평한국어 제약)', () => {
  const out = renderOverlaps([C('코드 리뷰', 4)], { full: false });
  assert.doesNotMatch(out, /[\u{1F000}-\u{1FAFF}☀-➿]/u);
  assert.match(out, /코드 리뷰 +4곳/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test test/render.test.mjs`
Expected: FAIL — `Cannot find module '../render.mjs'`.

- [ ] **Step 3: 최소 구현** — `render.mjs` 신규

```js
// render.mjs — Skills Manager 사람용 출력 렌더링(순수 함수). fs·process 안 씀.
// scan.mjs 가 계산한 데이터(conflicts·cov·by…)를 받아 문자열만 돌려준다 — 결정적이라 단위 테스트 가능.

// 한글/CJK 는 터미널 폭 2 → 표 정렬용 표시폭.
const isWide = (cp) => (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) || (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFF00 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6);
export const dispWidth = (s) => [...s].reduce((w, ch) => w + (isWide(ch.codePointAt(0)) ? 2 : 1), 0);
export const padW = (s, w) => s + ' '.repeat(Math.max(1, w - dispWidth(s)));

// 겹침을 '곳 수' 내림차순(동순위는 입력 순서 보존 = 안정). 원본 비변형.
export function sortedConflicts(conflicts) {
  return conflicts
    .map((c, i) => [c, i])
    .sort((a, b) => (b[0].hits.length - a[0].hits.length) || (a[1] - b[1]))
    .map(([c]) => c);
}

// 겹침 목록 블록. full=true 면 전부, 아니면 topN 개 + 나머지 접기.
export function renderOverlaps(conflicts, { full = false, topN = 7 } = {}) {
  if (!conflicts.length) return '같은 일이 겹친 곳 없음. 깔끔함.';
  const sorted = sortedConflicts(conflicts);
  const shown = full ? sorted : sorted.slice(0, topN);
  const rest = sorted.length - shown.length;
  const LW = Math.max(2, ...shown.map((c) => dispWidth(c.label))) + 2;
  const head = (!full && rest > 0)
    ? `같은 일이 겹친 곳 — ${conflicts.length}가지 (큰 ${topN}개만):`
    : `같은 일이 겹친 곳 — ${conflicts.length}가지:`;
  const lines = shown.map((c) => `  · ${padW(c.label, LW)}${c.hits.length}곳`);
  if (!full && rest > 0) lines.push(`  · 나머지 ${rest}가지 — 전체 보기: node scan.mjs --all`);
  return [head, ...lines].join('\n');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test test/render.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: scan.mjs 폭 헬퍼를 render.mjs import 로 교체**

`scan.mjs:12` 의 import 줄 바로 아래에 추가하고, `scan.mjs:16-19` 의 로컬 `isWide`/`dispWidth`/`padW` 정의를 삭제한다.

교체 전 (`scan.mjs:16-19`):
```js
// 한글/CJK 는 터미널 폭 2 → 표 칸 정렬용 표시폭 기준 우측 패딩.
const isWide = (cp) => (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) || (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFF00 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6);
const dispWidth = (s) => [...s].reduce((w, ch) => w + (isWide(ch.codePointAt(0)) ? 2 : 1), 0);
const padW = (s, w) => s + ' '.repeat(Math.max(1, w - dispWidth(s)));
```
교체 후:
```js
import { dispWidth, padW, sortedConflicts, renderOverlaps, renderNextAction, renderInventoryLine, firstRunBanner } from './render.mjs';
```
(이 줄을 `scan.mjs:12` 의 `workflow-store.mjs` import 바로 아래에 둔다. `sortedConflicts`·`renderNextAction`·`renderInventoryLine`·`firstRunBanner` 는 Task 2~3 에서 쓰이므로 미리 import 해 둔다 — 미사용이어도 에러 아님.)

- [ ] **Step 6: 전체 테스트 — `--workflows` 표 정렬 회귀 없음 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test`
Expected: `pass 52`, `fail 0` (기존 44 + render 8). 특히 `--workflows(글자) 는 단계별 쓸 스킬 표를 찍는다` 와 정렬 테스트가 여전히 통과.

- [ ] **Step 7: 커밋**

```bash
git -C C:/Users/Mun/workspace/skills-manager add render.mjs scan.mjs test/render.test.mjs
git -C C:/Users/Mun/workspace/skills-manager commit -m "$(cat <<'EOF'
refactor+feat(render): 출력 렌더링 순수 모듈 추출 + 겹침 정렬·접기

- render.mjs 신규: dispWidth/padW(scan에서 이동)·sortedConflicts·renderOverlaps
- 겹침 1단 hits 내림차순(동순위 안정), topN=7 초과 시 접기
- scan.mjs 폭 헬퍼를 render.mjs import 로 단일화

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `render.mjs` — 다음 한 수 · 분포 한 줄 · 첫 실행 배너

**Files:**
- Modify: `C:/Users/Mun/workspace/skills-manager/render.mjs` (함수 3개 추가)
- Test: `C:/Users/Mun/workspace/skills-manager/test/render.test.mjs` (테스트 추가)

- [ ] **Step 1: 실패 테스트 추가** — `test/render.test.mjs` 끝에 append

```js
import { renderNextAction, renderInventoryLine, firstRunBanner } from '../render.mjs';

test('renderNextAction: 겹침 있으면 가장 큰 겹침을 저장 후보로 지목 + recommend 줄', () => {
  const out = renderNextAction([{ label: '디버깅', hits: Array(4).fill(0), sources: [] }, { label: '코드 리뷰', hits: Array(2).fill(0), sources: [] }]);
  assert.match(out, /다음 한 수:/);
  assert.match(out, /recommend/);
  assert.match(out, /가장 큰 겹침\(디버깅 4곳\)/); // 큰 것을 지목
  assert.match(out, /workflow save/);
});

test('renderNextAction: 겹침 없으면 recommend + workflow list 안내', () => {
  const out = renderNextAction([]);
  assert.match(out, /recommend/);
  assert.match(out, /workflow list/);
  assert.ok(!out.includes('가장 큰 겹침'));
});

test('renderInventoryLine: 접힘은 한 줄, full 은 묶음별 분포', () => {
  const by = { 'agent-skills': 23, gstack: 53, user: 3 };
  const collapsed = renderInventoryLine(124, by, 486, { full: false });
  assert.match(collapsed, /깔린 스킬 약 124개\./);
  assert.ok(!collapsed.includes('gstack 53'), '접힘은 묶음별 카운트 숨김');
  const full = renderInventoryLine(124, by, 486, { full: true });
  assert.match(full, /사본 486벌 접음/);
  assert.match(full, /gstack 53/);
  assert.match(full, /직접 3/); // user → '직접'
});

test('firstRunBanner: 읽기 전용 사실 진술, 유치체·이모지 없음', () => {
  const b = firstRunBanner();
  assert.match(b, /처음 오셨네요/);
  assert.match(b, /읽기 전용/);
  assert.doesNotMatch(b, /[\u{1F000}-\u{1FAFF}☀-➿]/u);
  assert.doesNotMatch(b, /걱정 마세요|쉽게 말하면/); // 과한 안심·유치 풀어쓰기 금지
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test test/render.test.mjs`
Expected: FAIL — `renderNextAction`/`renderInventoryLine`/`firstRunBanner` is not a function (export 없음).

- [ ] **Step 3: 구현** — `render.mjs` 끝에 append

```js
// '다음 한 수' 블록 — 검사 결과에서 곧장 다음 행동으로(접힌 사람 출력 끝에만).
export function renderNextAction(conflicts) {
  const lines = ['다음 한 수:'];
  lines.push('  · 지금 하려는 작업을 단계로 펴 보기 — /skills-manager recommend "할 일 한 줄"');
  if (conflicts.length) {
    const top = sortedConflicts(conflicts)[0];
    lines.push(`  · 가장 큰 겹침(${top.label} ${top.hits.length}곳)을 자주 쓰면 내 흐름으로 굳히기 — /skills-manager workflow save 내흐름`);
  } else {
    lines.push('  · 미리 짜인 흐름 구경 — /skills-manager workflow list');
  }
  return lines.join('\n');
}

// 깔린 스킬 분포. full=true 면 묶음별 상세, 아니면 한 줄.
export function renderInventoryLine(uniqCount, by, mirrorFiles, { full = false } = {}) {
  if (!full) return `깔린 스킬 약 ${uniqCount}개.`;
  const shortKo = (s) => ({ user: '직접', '.agents': '.agents' })[s] || s;
  const dist = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${shortKo(s)} ${n}`).join(' · ');
  return `깔린 스킬: 약 ${uniqCount}개 (도구용 사본 ${mirrorFiles}벌 접음)\n  ${dist}`;
}

// 첫 실행(저장된 흐름 0개) 일회성 안내. 사실 진술만 — 과한 안심·유치체 금지.
export function firstRunBanner() {
  return [
    'Skills Manager에 처음 오셨네요.',
    '하는 일: 깔린 스킬이 많거나 같은 일이 여기저기 겹칠 때, 무엇이 겹쳤는지 지도로 보여주고',
    "         자주 하는 작업을 '내 흐름'으로 저장하게 해 줍니다. 스킬을 끄거나 지우진 않아요(읽기 전용).",
    "아래는 지금 깔린 것의 첫 지도입니다. 끝에 '다음 한 수'가 있어요.",
  ].join('\n');
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test test/render.test.mjs`
Expected: PASS (12 tests).

- [ ] **Step 5: 커밋**

```bash
git -C C:/Users/Mun/workspace/skills-manager add render.mjs test/render.test.mjs
git -C C:/Users/Mun/workspace/skills-manager commit -m "$(cat <<'EOF'
feat(render): 다음 한 수·분포 한 줄·첫 실행 배너 순수 함수

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `scan.mjs` 사람용 출력 배선 — `--all`/full/첫 실행 게이트

**Files:**
- Modify: `C:/Users/Mun/workspace/skills-manager/scan.mjs:312-342` (사람용 출력부 전체 교체)
- Test: `C:/Users/Mun/workspace/skills-manager/test/cli-output.test.mjs` (신규)

- [ ] **Step 1: 실패 테스트 작성** — `test/cli-output.test.mjs` 신규

```js
// test/cli-output.test.mjs — 사람용 기본 출력의 배선(접기/--all/첫 실행/관대한 에러) 통합 테스트.
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
  // 흐름 하나 저장 → 첫 실행 아님
  execFileSync(process.execPath, [SCAN, '--save', 'mine'], {
    input: JSON.stringify({ label: 'm', steps: [{ capability: 'tdd', skill: null, note: '' }] }),
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, SKILLS_MANAGER_HOME: smHome },
  });
  const out = run([], { home, smHome });
  assert.ok(!out.includes('처음 오셨네요'), '저장 후엔 배너 없음');
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test test/cli-output.test.mjs`
Expected: FAIL — 현재 기본 출력엔 `다음 한 수:`·`처음 오셨네요`·`--all` 분기가 없어 단언 불일치.

- [ ] **Step 3: 구현** — `scan.mjs:312-342` 전체 교체

교체 전 (현재 `scan.mjs:312-342`):
```js
// ---- 출력 (기본 = 사람용 / 상세·영어 이름은 --judge·--json = 기계·개발자용) ----
const SRC_KO = { gstack: 'gstack', '.agents': '.agents(심링크)', user: '직접 설치', 'agent-skills': 'agent-skills', superpowers: 'superpowers', codex: 'codex', harness: 'harness', '외부': '외부 링크' };
const isJudge = process.argv.includes('--judge');
const by = {}; for (const it of uniq) by[it.source] = (by[it.source] || 0) + 1;
const line = '─'.repeat(54);
console.log('\nSkills Manager — 검사 결과 (읽기 전용 · 아무것도 안 바꿈)');
if (conflicts.length) {
  console.log(`한 줄: 스킬 ${uniq.length}개 중 같은 일이 ${conflicts.length}가지 겹침. 끌 필요 없고,`);
  console.log(`       자주 하는 작업을 '내 흐름'으로 저장해 쓰면 됨.`);
}
console.log(line);
const shortKo = (s) => ({ user: '직접', '.agents': '.agents' })[s] || s;
console.log(`깔린 스킬: 약 ${uniq.length}개 (도구용 사본 ${mirrorFiles}벌 접음)`);
console.log(`  ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${shortKo(s)} ${n}`).join(' · ')}`);
console.log(line);

if (conflicts.length === 0) {
  console.log('같은 일이 겹친 곳 없음. 깔끔함.');
} else {
  console.log(`같은 일이 겹친 곳 — ${conflicts.length}가지:`);
  for (const c of conflicts) console.log(`  · ${c.label} — ${c.hits.length}곳`);
  console.log(line);
  console.log(`기본으로 둘 묶음 (겹친 ${conflicts.length}가지 중 몇에 끼나):`);
  console.log(`  ${covSorted.map(([s, n]) => `${shortKo(s)} ${n}`).join(' · ')}`);
  console.log(`  → ${shortKo(covSorted[0][0])}가 가장 많음. 기본으로 두면 편함 (단, 묶음마다 고유 스킬도 있으니 본인 몫).`);
  console.log(`\n끄기는 거의 안 됨 — 겹친 게 플러그인 안이고, 플러그인은 통째로만 꺼져서 하나 빼려다`);
  console.log(`고유한 것까지 잃음. 그래서 보여주는 데까지만.`);
}
console.log(`\n쓰는 법: /skills-manager recommend "작업"  ·  workflow list  ·  workflow save 이름`);
if (!isJudge) console.log(`자세히(영어 이름·각 스킬 설명): node scan.mjs --judge`);
console.log('');
```
교체 후:
```js
// ---- 출력 (기본 = 사람용 접힘 / --all·--judge = 전체 / --judge 는 판정 패킷도) ----
const SRC_KO = { gstack: 'gstack', '.agents': '.agents(심링크)', user: '직접 설치', 'agent-skills': 'agent-skills', superpowers: 'superpowers', codex: 'codex', harness: 'harness', '외부': '외부 링크' };
const isJudge = process.argv.includes('--judge');
const full = process.argv.includes('--all') || isJudge;          // 전체 벽(상세) 표시 여부
const by = {}; for (const it of uniq) by[it.source] = (by[it.source] || 0) + 1;
const shortKo = (s) => ({ user: '직접', '.agents': '.agents' })[s] || s;
const firstRun = !full && loadUser().length === 0;               // 저장된 흐름 0개 = 처음 쓰는 사람(읽기 전용 추정)

if (firstRun) console.log('\n' + firstRunBanner());
console.log('\nSkills Manager — 검사 결과 (읽기 전용 · 아무것도 안 바꿈)');

// 한 줄 결론 — 항상(겹침 유무 무관). 여백으로 격리해 첫 시선이 여기 걸리게.
const conclusion = conflicts.length
  ? `한 줄: 스킬 ${uniq.length}개 중 같은 일이 ${conflicts.length}가지 겹침. 끌 건 없고, 자주 하는 작업을 '내 흐름'으로 저장하면 됨.`
  : `한 줄: 스킬 ${uniq.length}개, 같은 일이 겹친 곳 없음. 깔끔함.`;
console.log('\n  ' + conclusion + '\n');

console.log(renderOverlaps(conflicts, { full }));

if (full) {
  console.log('\n' + renderInventoryLine(uniq.length, by, mirrorFiles, { full: true }));
  if (conflicts.length) {
    console.log(`\n기본으로 둘 묶음 (겹친 ${conflicts.length}가지 중 몇에 끼나):`);
    console.log(`  ${covSorted.map(([s, n]) => `${shortKo(s)} ${n}`).join(' · ')}`);
    console.log(`  → ${shortKo(covSorted[0][0])}가 가장 많음. 기본으로 두면 편함 (단, 묶음마다 고유 스킬도 있으니 본인 몫).`);
    console.log(`\n끄기는 거의 안 됨 — 겹친 게 플러그인 안이고, 플러그인은 통째로만 꺼져서 하나 빼려다 고유한 것까지 잃음. 그래서 보여주는 데까지만.`);
  }
} else {
  console.log('\n' + renderInventoryLine(uniq.length, by, mirrorFiles, { full: false }) + ' 끌 건 없음 — 전체 보기: node scan.mjs --all');
}

console.log('\n' + renderNextAction(conflicts));
console.log('');
```
(주의: `loadUser` 는 `scan.mjs:12` 에서 이미 import 됨. `firstRunBanner`/`renderOverlaps`/`renderInventoryLine`/`renderNextAction` 은 Task 1 Step 5 에서 import 추가됨. `line`/`SRC_KO` 중 `line` 은 더 안 쓰이니 제거됨 — `SRC_KO` 는 아래 판정 패킷(344줄~)에서 계속 쓰므로 유지.)

- [ ] **Step 4: 통과 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test test/cli-output.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: 전체 회귀 — --json/--workflows/--judge 구조 유지**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test`
Expected: `pass 56`, `fail 0`. (기존 52 + cli-output 4)

- [ ] **Step 6: 수동 스모크 — 실제 환경 기본 출력 눈으로 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node scan.mjs && echo "=== --all ===" && node scan.mjs --all`
Expected: 기본은 결론+큰 겹침+다음 한 수로 짧고, `--all` 은 분포·기본묶음·끄기 설명까지 전체. 이모지·영어 스킬명 없음.

- [ ] **Step 7: 커밋**

```bash
git -C C:/Users/Mun/workspace/skills-manager add scan.mjs test/cli-output.test.mjs
git -C C:/Users/Mun/workspace/skills-manager commit -m "$(cat <<'EOF'
feat(scan): 기본 출력 접기 + --all 전체 + 첫 실행 배너 + 다음 한 수

- 기본은 결론+큰 겹침+다음 한 수, 상세 분포/기본묶음/끄기설명은 --all로
- --judge 는 full 로 전체 출력 + 판정 패킷(과적재 없음)
- 첫 실행(저장 흐름 0개)에 일회성 환영 배너

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 관대한 `--set-skill` 에러 — 범위초과 시 단계 목록 보여주기

**Files:**
- Modify: `C:/Users/Mun/workspace/skills-manager/workflow-store.mjs:100-102` (`bad-step` 반환에 `steps` 라벨 추가)
- Modify: `C:/Users/Mun/workspace/skills-manager/scan.mjs:202-213` (`bad-step` 메시지에 단계 목록 첨부)
- Test: `C:/Users/Mun/workspace/skills-manager/test/workflow-store.test.mjs` (추가) · `test/cli-output.test.mjs` (추가)

- [ ] **Step 1: 실패 테스트(단위) 추가** — `test/workflow-store.test.mjs` 끝에 append

```js
test('setStepSkill bad-step 은 단계 라벨 목록을 함께 돌려준다(관대한 에러용)', () => {
  const file = tmpFile();
  saveWorkflow('mine', { steps: [{ capability: 'debug' }, { capability: 'tdd' }, { capability: 'review' }] }, file);
  const res = setStepSkill('mine', 9, 'a:b', file);
  assert.strictEqual(res.reason, 'bad-step');
  assert.strictEqual(res.stepCount, 3);              // 기존 계약 유지
  assert.deepStrictEqual(res.steps.map((s) => s.n), [1, 2, 3]);
  assert.strictEqual(res.steps[0].label, '디버깅');   // CAP_LABEL 적용
  assert.strictEqual(res.steps[1].label, '테스트 먼저 짜기 (TDD)');
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test test/workflow-store.test.mjs`
Expected: FAIL — `res.steps` is undefined.

- [ ] **Step 3: 구현(workflow-store)** — `workflow-store.mjs:100-102` 교체

교체 전:
```js
  if (!Number.isInteger(stepIndex) || stepIndex < 1 || stepIndex > steps.length) {
    return { ok: false, reason: 'bad-step', stepCount: steps.length };
  }
```
교체 후:
```js
  if (!Number.isInteger(stepIndex) || stepIndex < 1 || stepIndex > steps.length) {
    return {
      ok: false, reason: 'bad-step', stepCount: steps.length,
      steps: steps.map((s, i) => ({ n: i + 1, capability: s.capability, label: CAP_LABEL[s.capability] || s.capability })),
    };
  }
```
(`CAP_LABEL` 은 같은 파일 `:111` 에 선언 — 함수는 호출 시점에 평가되므로 참조 안전.)

- [ ] **Step 4: 단위 통과 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test test/workflow-store.test.mjs`
Expected: PASS (기존 + 1). 특히 기존 `setStepSkill rejects out-of-range...reports stepCount` 도 여전히 통과.

- [ ] **Step 5: 실패 테스트(통합) 추가** — `test/cli-output.test.mjs` 끝에 append

```js
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
```

- [ ] **Step 6: 실패 확인 → 구현(scan)** 

먼저 실패 확인:
Run: `cd C:/Users/Mun/workspace/skills-manager && node --test test/cli-output.test.mjs`
Expected: FAIL — `이 흐름의 단계:` 없음.

그 다음 `scan.mjs:202-213` 의 `--set-skill` 실패 처리 블록 교체.

교체 전 (`scan.mjs:202-213`):
```js
  const res = setStepSkill(name, stepNum, skillId);
  if (!res.ok) {
    const why = {
      'invalid-name': '이름이 올바르지 않아요(영숫자·한글·-·_ 1~40자).',
      'reserved': "내장 템플릿은 못 고쳐요. 먼저 'save'로 내 흐름으로 복제한 뒤 고치세요.",
      'not-found': `내 워크플로우에 없어요: ${name} (내장은 'workflow list'에서 확인 — 고치려면 먼저 복제).`,
      'bad-step': `단계 번호가 범위를 벗어났어요: ${stepNum} (이 흐름은 1~${res.stepCount}단계).`,
    }[res.reason] || res.reason;
    console.log(`수정 실패: ${why}`);
    process.exit(1);
  }
```
교체 후:
```js
  const res = setStepSkill(name, stepNum, skillId);
  if (!res.ok) {
    const why = {
      'invalid-name': '이름이 올바르지 않아요(영숫자·한글·-·_ 1~40자).',
      'reserved': "내장 템플릿은 못 고쳐요. 먼저 'save'로 내 흐름으로 복제한 뒤 고치세요.",
      'not-found': `내 워크플로우에 없어요: ${name} (내장은 'workflow list'에서 확인 — 고치려면 먼저 복제).`,
      'bad-step': `단계 번호가 범위를 벗어났어요: ${stepNum} (이 흐름은 1~${res.stepCount}단계).`,
    }[res.reason] || res.reason;
    console.log(`수정 실패: ${why}`);
    if (res.reason === 'bad-step' && res.steps && res.steps.length) {
      console.log(`  이 흐름의 단계: ${res.steps.map((s) => `${s.n} ${s.label}`).join(' · ')}`);
    }
    process.exit(1);
  }
```

- [ ] **Step 7: 통과 + 전체 회귀**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test`
Expected: `pass 58`, `fail 0`.

- [ ] **Step 8: 커밋**

```bash
git -C C:/Users/Mun/workspace/skills-manager add workflow-store.mjs scan.mjs test/workflow-store.test.mjs test/cli-output.test.mjs
git -C C:/Users/Mun/workspace/skills-manager commit -m "$(cat <<'EOF'
feat(set-skill): 범위초과 에러에 단계 라벨 목록 회신(관대한 회복)

- workflow-store bad-step 반환에 steps(라벨) 추가(reason·stepCount 유지)
- scan --set-skill 에러에 '이 흐름의 단계: 1 디버깅 · 2 …' 첨부

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 관대한 `--save` 빈 stdin 안내

**Files:**
- Modify: `C:/Users/Mun/workspace/skills-manager/scan.mjs:38` (빈 stdin 메시지 강화)
- Test: `C:/Users/Mun/workspace/skills-manager/test/cli-output.test.mjs` (추가)

- [ ] **Step 1: 실패 테스트 추가** — `test/cli-output.test.mjs` 끝에 append

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test test/cli-output.test.mjs`
Expected: FAIL — 현재 메시지는 `저장 실패: stdin 이 비어 있어요...` 라 단언 불일치.

- [ ] **Step 3: 구현** — `scan.mjs:38` 교체

교체 전 (`scan.mjs:38`):
```js
  if (!raw.trim()) { console.log('저장 실패: stdin 이 비어 있어요. 워크플로우 JSON 을 파이프로 넘겨 주세요.'); process.exit(1); }
```
교체 후:
```js
  if (!raw.trim()) {
    console.log('흐름을 저장하려면 단계가 필요해요. 두 가지 방법:');
    console.log("  · 방금 본 recommend·workflow 결과를 저장: 그걸 띄운 뒤 '이걸로 저장'이라고 하세요");
    console.log('  · 빈 흐름부터 직접: /skills-manager workflow save <이름> 후 단계를 채웁니다');
    const mine = loadUser();
    console.log(`지금 저장된 내 흐름: ${mine.length ? mine.map((w) => w.name).join(' · ') : '(없음)'}`);
    process.exit(1);
  }
```
(`loadUser` 는 이미 import. 이 분기는 `--save` 핸들러 안이라 `fs.readFileSync(0,...)` 직후.)

- [ ] **Step 4: 통과 + 전체 회귀**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test`
Expected: `pass 59`, `fail 0`.

- [ ] **Step 5: 커밋**

```bash
git -C C:/Users/Mun/workspace/skills-manager add scan.mjs test/cli-output.test.mjs
git -C C:/Users/Mun/workspace/skills-manager commit -m "$(cat <<'EOF'
feat(save): 빈 stdin 에 사용법·예시·저장 목록 안내(관대한 에러)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 문서 정합 — SKILL.md · README.md (코드 없음)

**Files:**
- Modify: `C:/Users/Mun/workspace/skills-manager/SKILL.md`
- Modify: `C:/Users/Mun/workspace/skills-manager/README.md`

- [ ] **Step 1: SKILL.md — 접힌 출력·`--all`·recommend→save 제안 반영**

`SKILL.md` 의 "좋은 예시"(46~51줄 부근)와 절차 문구를 새 동작에 맞춘다:
- 기본 `node scan.mjs` 출력이 **접힘**(결론 + 큰 겹침 + 다음 한 수)이고 전체는 `node scan.mjs --all` 임을 절차 1단계에 한 줄 명시.
- 첫 실행(저장 흐름 0개) 시 일회성 환영 배너가 붙는다는 점을 한 줄 명시(둘째 실행부터 사라짐).
- 워크플로우 "저장(save)" 절차 끝에: recommend/workflow 결과를 보여준 직후 호스트가 **먼저** "이대로 자주 쓰면 '이걸로 저장'이라고 하세요"를 제안하도록 한 줄 추가(복붙 명령은 Windows 이스케이프 미검증이라 대화형 경로 우선 — 호스트가 단계 JSON 을 구성해 `--save` stdin 으로 넘긴다, 기존 절차 그대로).
- 평한국어·이모지 금지·영어 스킬명 금지 규칙은 그대로(변경 없음).

- [ ] **Step 2: README.md — 출력 예시 블록 교체**

`README.md` 의 "### 출력 예시 (요약)"(50~64줄) 코드블록을 접힌 기본 출력 + `--all` 한 줄 안내로 교체. 예:
```
Skills Manager — 검사 결과 (읽기 전용 · 아무것도 안 바꿈)

  한 줄: 스킬 124개 중 같은 일이 8가지 겹침. 끌 건 없고, 자주 하는 작업을 '내 흐름'으로 저장하면 됨.

같은 일이 겹친 곳 — 8가지 (큰 7개만):
  · 디버깅        4곳
  · 코드 리뷰      4곳
  · …
  · 나머지 1가지 — 전체 보기: node scan.mjs --all

깔린 스킬 약 124개. 끌 건 없음 — 전체 보기: node scan.mjs --all

다음 한 수:
  · 지금 하려는 작업을 단계로 펴 보기 — /skills-manager recommend "할 일 한 줄"
  · 가장 큰 겹침(디버깅 4곳)을 자주 쓰면 내 흐름으로 굳히기 — /skills-manager workflow save 내흐름
```
또한 "## 사용" 목록에 `--all`(전체 상세) 한 줄 추가.

- [ ] **Step 3: 문서-출력 정합 수동 확인**

Run: `cd C:/Users/Mun/workspace/skills-manager && node scan.mjs --all | head -5 && node scan.mjs | head -8`
Expected: README/SKILL.md 예시가 실제 출력 틀과 일치(라벨·문구). 다르면 문서를 출력에 맞춘다.

- [ ] **Step 4: 커밋**

```bash
git -C C:/Users/Mun/workspace/skills-manager add SKILL.md README.md
git -C C:/Users/Mun/workspace/skills-manager commit -m "$(cat <<'EOF'
docs: 접힌 출력·--all·recommend→save 제안 반영(SKILL.md·README)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 최종 검증

**Files:** (없음)

- [ ] **Step 1: 전체 테스트 green**

Run: `cd C:/Users/Mun/workspace/skills-manager && node --test`
Expected: `fail 0`, 총 ~59 tests pass(44 기존 + render 12 + cli-output 6 + workflow-store 1, 합산은 실제 결과로 확인).

- [ ] **Step 2: 평한국어 제약 수동 점검** — 사람용 출력에 영어 스킬명·이모지 없음

Run: `cd C:/Users/Mun/workspace/skills-manager && node scan.mjs && node scan.mjs --all`
확인: 출력 라벨이 전부 한국어(명령 토큰 `recommend`/`workflow save`/`--all` 만 예외), 이모지·아이콘 0, 한 줄 결론이 맨 위 여백에 격리, 다음 한 수가 끝에.

- [ ] **Step 3: 기계 경로 비오염 확인** — `--json`/`--workflows --json` 은 배너·다음 한 수 안 섞임

Run: `cd C:/Users/Mun/workspace/skills-manager && node scan.mjs --json | head -3 && node scan.mjs --workflows --json | head -3`
Expected: 순수 JSON(첫 줄부터 `{`), 배너/다음 한 수 텍스트 없음.

- [ ] **Step 4: 완료 보고** — `superpowers:finishing-a-development-branch` 로 병합/PR/정리 옵션 제시.

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지:** A1(접기)=Task3 · A2(다음 한 수)=Task2+3 · A3(숫자 열 정렬)=Task1 renderOverlaps · A4(`--all`/`--judge` 유지)=Task3 · C5(첫 실행 배너)=Task2+3 · C6(관대한 에러: bad-step 라벨=Task4, save 빈 stdin=Task5) · C7(recommend→save 제안)=Task6 문서. 누락 없음.
- **플레이스홀더 스캔:** 모든 코드 단계에 실제 코드·정확한 교체 전/후·실행 명령·기대 출력 포함. TODO/유사처리 없음.
- **타입 일관성:** render.mjs export 명(`dispWidth`·`padW`·`sortedConflicts`·`renderOverlaps`·`renderNextAction`·`renderInventoryLine`·`firstRunBanner`)이 Task1 import 줄과 일치. conflict 객체 형태 `{label, hits[], sources[]}` 는 scan.mjs:233-237 과 일치. `bad-step` 반환 `{reason, stepCount, steps[{n,capability,label}]}` 가 Task4 단위·통합·scan 사용처에서 동일.
- **범위 경계:** `workflow list` 표 자체 개편·복붙 저장 줄(Windows 이스케이프)·B(대화형 입구)는 의도적으로 제외(Not Doing). recommend→save 는 문서 제안까지만.
