# workflow 표에 "쓸 스킬" 채우기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `workflow list`(와 `workflow <name>`)가 각 단계에 지금 깔린 실제 스킬을 단계별 표로 보여준다.

**Architecture:** 1단 기계(scan.mjs)는 capability를 인벤토리에 대고 넓게·결정적으로 해소(몇 곳·어느 출처). 2단 LLM은 표 제시 때 판정 루브릭으로 "진짜 N곳" 보정. scan.mjs는 최소 재배선 — 기존 `--json`/`--judge`/기본 출력은 그대로 두고, 인벤토리 스캔 전에 일찍 빠져나가던 `--workflows`만 인벤토리·groups 뒤로 옮겨 해소를 붙인다.

**Tech Stack:** Node.js ESM, `node:test`. 의존성 0. 테스트: `node --test "test/*.test.mjs"`.

---

## File Structure

- `workflow-store.mjs` — `resolveSteps()` 순수 함수 + `CAP_LABEL` 표 추가. (단계 해소 = 데이터 변환이라 저장소 모듈에 둔다. 순수·환경 독립 → 단위 테스트.)
- `scan.mjs` — groups 계산을 공유 지점으로 올리고 `groupsByCap` 구성, `readdirSync(SKILLS)` 가드, `--workflows` 블록을 인벤토리 뒤로 이동 + 표 렌더.
- `SKILL.md` — workflow list/run 절차에 "표가 스킬까지 보여줌 + 제시 시 판정 보정" 안내.
- `test/workflow-store.test.mjs` — `resolveSteps` 단위 테스트.
- `test/cli-workflow.test.mjs` — `--workflows --json` resolved 존재 + `--workflows` 글자 표 + `--json` 구조 특성 테스트.

각 단계의 `resolved` 형태:
```
resolved = { kind: 'pinned'|'multi'|'single'|'none', label: string, skills: [id], sources: [src], count: number }
```

---

## Task 1: `--json` 구조 특성 테스트 (리팩터 전 안전망)

scan.mjs를 건드리기 전, `--json`의 핵심 구조를 고정해 재배선이 조용히 깨지 않게 한다.

**Files:**
- Test: `test/cli-workflow.test.mjs` (맨 아래에 추가)

- [ ] **Step 1: 특성 테스트 작성**

```js
test('--json 은 version·counts·groups 구조를 유지한다 (리팩터 안전망)', () => {
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
```

- [ ] **Step 2: 실행해 통과 확인 (현재 코드 기준)**

Run: `node --test "test/*.test.mjs"`
Expected: 34 pass, 0 fail. (지금 코드로도 통과 — 이게 안전망 기준선.)

- [ ] **Step 3: 커밋**

```bash
git add test/cli-workflow.test.mjs
git commit -m "test(cli): --json 구조 특성 테스트 (재배선 안전망)"
```

---

## Task 2: `resolveSteps()` 순수 함수 (workflow-store.mjs)

capability를 인벤토리 그룹 지도로 해소하는 결정적 변환. scan과 무관하게 단위 테스트.

**Files:**
- Modify: `workflow-store.mjs` (파일 끝에 추가)
- Test: `test/workflow-store.test.mjs` (파일 끝에 추가)

- [ ] **Step 1: 실패 테스트 작성**

`test/workflow-store.test.mjs` 상단 import 에 `resolveSteps, CAP_LABEL` 을 추가하고(기존 import 줄에 합치기), 파일 끝에:

```js
import { resolveSteps } from '../workflow-store.mjs';

const GBC = {
  tdd: { label: '테스트 먼저 짜기 (TDD)', skills: ['.agents:tdd', 'agent-skills:test-driven-development', 'superpowers:test-driven-development'], sources: ['.agents', 'agent-skills', 'superpowers'] },
  spec: { label: '스펙 작성', skills: ['gstack:spec', 'agent-skills:spec-driven-development'], sources: ['gstack', 'agent-skills'] },
  simplify: { label: '코드 단순화', skills: ['agent-skills:code-simplification'], sources: ['agent-skills'] },
};

test('resolveSteps: 여러 출처면 multi (개수·출처 보존)', () => {
  const wf = { steps: [{ capability: 'tdd', skill: null }] };
  const [s] = resolveSteps(wf, GBC);
  assert.strictEqual(s.resolved.kind, 'multi');
  assert.strictEqual(s.resolved.count, 3);
  assert.deepStrictEqual(s.resolved.sources, ['.agents', 'agent-skills', 'superpowers']);
  assert.strictEqual(s.resolved.label, '테스트 먼저 짜기 (TDD)');
});

test('resolveSteps: 한 출처면 single', () => {
  const [s] = resolveSteps({ steps: [{ capability: 'simplify', skill: null }] }, GBC);
  assert.strictEqual(s.resolved.kind, 'single');
  assert.strictEqual(s.resolved.count, 1);
});

test('resolveSteps: 고정핀 있으면 pinned (그 스킬 하나)', () => {
  const [s] = resolveSteps({ steps: [{ capability: 'tdd', skill: 'superpowers:test-driven-development' }] }, GBC);
  assert.strictEqual(s.resolved.kind, 'pinned');
  assert.deepStrictEqual(s.resolved.skills, ['superpowers:test-driven-development']);
  assert.deepStrictEqual(s.resolved.sources, ['superpowers']);
});

test('resolveSteps: 모르는 capability(implement)면 none + 라벨표/원문', () => {
  const [s] = resolveSteps({ steps: [{ capability: 'implement', skill: null }] }, GBC);
  assert.strictEqual(s.resolved.kind, 'none');
  assert.strictEqual(s.resolved.count, 0);
  assert.strictEqual(s.resolved.label, '구현'); // CAP_LABEL.implement
});

test('resolveSteps: groupsByCap 비어도 안 죽고 none', () => {
  const [s] = resolveSteps({ steps: [{ capability: 'tdd', skill: null }] }, {});
  assert.strictEqual(s.resolved.kind, 'none');
  assert.strictEqual(s.resolved.label, '테스트 먼저 짜기 (TDD)' === s.resolved.label ? s.resolved.label : 'tdd');
});
```

마지막 테스트의 마지막 assert 는 헷갈리니 단순화한다 — 아래로 교체:

```js
test('resolveSteps: groupsByCap 비어도 안 죽고 none(라벨=원문)', () => {
  const [s] = resolveSteps({ steps: [{ capability: 'tdd', skill: null }] }, {});
  assert.strictEqual(s.resolved.kind, 'none');
  assert.strictEqual(s.resolved.label, 'tdd');
});
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `node --test "test/*.test.mjs"`
Expected: FAIL — `resolveSteps is not a function` (아직 export 안 함).

- [ ] **Step 3: 최소 구현**

`workflow-store.mjs` 파일 끝에 추가:

```js
// 비-그룹 capability(implement·clarify 등)의 표 라벨. 그룹 cap 은 groups 의 label 을 쓴다.
export const CAP_LABEL = {
  implement: '구현',
  clarify: '요구 확인',
};

// 각 단계의 capability 를 인벤토리 그룹 지도로 해소(1단, 넓게·결정적).
// groupsByCap: { [capability]: { label, skills:[id], sources:[src] } } — scan --json 의 groups 에서 구성.
// 반환: 각 step + resolved {kind, label, skills, sources, count}. 판정 보정(진짜 N곳)은 LLM 제시 층의 일.
export function resolveSteps(workflow, groupsByCap = {}) {
  return (workflow.steps || []).map((s) => {
    const cap = s.capability;
    const g = groupsByCap[cap];
    const label = (g && g.label) || CAP_LABEL[cap] || cap;
    if (s.skill) {
      const src = String(s.skill).split(':')[0];
      return { ...s, resolved: { kind: 'pinned', label, skills: [s.skill], sources: [src], count: 1 } };
    }
    if (!g || !Array.isArray(g.skills) || g.skills.length === 0) {
      return { ...s, resolved: { kind: 'none', label, skills: [], sources: [], count: 0 } };
    }
    const sources = g.sources || [...new Set(g.skills.map((id) => id.split(':')[0]))];
    const kind = sources.length >= 2 ? 'multi' : 'single';
    return { ...s, resolved: { kind, label, skills: g.skills, sources, count: g.skills.length } };
  });
}
```

- [ ] **Step 4: 실행해 통과 확인**

Run: `node --test "test/*.test.mjs"`
Expected: 39 pass (34 + 5 신규), 0 fail.

- [ ] **Step 5: 커밋**

```bash
git add workflow-store.mjs test/workflow-store.test.mjs
git commit -m "feat(store): resolveSteps — 단계 capability 를 인벤토리 스킬로 해소(순수)"
```

---

## Task 3: scan.mjs 재배선 — groups 공유 + `--workflows` 해소

`--workflows` 를 인벤토리·groups 뒤로 옮기고, 단계별 스킬 표를 찍는다. 기존 `--json`/`--judge`/기본 출력은 그대로(스킬 폴더 있는 환경에서 바이트 동일).

**Files:**
- Modify: `scan.mjs`

### 3a. import 에 resolveSteps 추가

- [ ] **Step 1:** `scan.mjs` 의 import 줄(현재 12행) 끝에 `resolveSteps` 추가:

```js
import { saveWorkflow, removeWorkflow, loadUser, listAll, annotateMissing, setStepSkill, resolveSteps } from './workflow-store.mjs';
```

### 3b. 일찍 빠져나가던 `--workflows` 블록 제거

- [ ] **Step 2:** 현재 29–45행의 `--workflows` 블록 전체를 삭제한다(아래 3e 에서 인벤토리 뒤에 다시 둔다). 삭제 대상:

```js
// --workflows: 내장 템플릿 + 내가 저장한 워크플로우 목록 (스캔 없이 바로)
if (process.argv.includes('--workflows')) {
  ... (이 블록 전체) ...
  process.exit(0);
}
```

`--save`·`--delete` 블록은 그대로 둔다(인벤토리 불필요).

### 3c. no-skills 가드가 `--workflows` 를 막지 않게

- [ ] **Step 3:** 현재 79–80행 가드의 조건에 `--workflows` 예외를 추가한다.

찾기:
```js
// ~/.claude/skills 가 없으면 스캔할 게 없음 — 친절히 안내하고 끝(크래시 방지).
if (!fs.existsSync(SKILLS)) {
```
교체:
```js
// ~/.claude/skills 가 없으면 스캔할 게 없음 — 친절히 안내하고 끝(크래시 방지).
// 단 --workflows 는 인벤토리가 비어도 워크플로우 목록은 보여줘야 하므로 통과시킨다.
if (!fs.existsSync(SKILLS) && !process.argv.includes('--workflows')) {
```

### 3d. `readdirSync(SKILLS)` 가드 (no-skills 통과 시 크래시 방지)

- [ ] **Step 4:** 최상위 스킬 루프(현재 140행)를 존재 가드로 감싼다. 폴더가 있으면 동작 무변(기존 환경 바이트 동일).

찾기:
```js
// (2) 최상위 스킬 (심링크 포함). 출처: gstack 깐 것 / .agents 심링크 / 직접 독립
for (const e of fs.readdirSync(SKILLS, { withFileTypes: true })) {
```
교체:
```js
// (2) 최상위 스킬 (심링크 포함). 출처: gstack 깐 것 / .agents 심링크 / 직접 독립
for (const e of (fs.existsSync(SKILLS) ? fs.readdirSync(SKILLS, { withFileTypes: true }) : [])) {
```

### 3e. groups 계산을 공유 지점으로 올리고 groupsByCap 구성

- [ ] **Step 5:** `covSorted` 정의(현재 252행) 바로 **뒤**에 groups/groupsByCap 계산을 추가한다(지금은 `--json` 블록 안에만 있음):

```js
// groups: capability→스킬 묶음(=--json 의 groups). --json 과 --workflows 가 공유.
const groupsByCap = {};
const groups = GROUPS.map((g) => {
  const hits = uniq.filter((it) => g.re.test(it.name) && !NOT_DUP.test(it.name));
  if (!hits.length) return null;
  const sources = [...new Set(hits.map((h) => h.source))];
  const entry = { capability: g.cap, label: g.label, skills: hits.map((h) => h.source + ':' + h.name), sources, duplicateLevel: sources.length >= 2 ? 'high' : 'none' };
  groupsByCap[g.cap] = entry;
  return entry;
}).filter(Boolean);
```

- [ ] **Step 6:** `--json` 블록 안의 인라인 groups 계산(현재 272–277행)을 위에서 만든 `groups` 재사용으로 교체.

찾기:
```js
    groups: GROUPS.map(g => {
      const hits = uniq.filter(it => g.re.test(it.name) && !NOT_DUP.test(it.name));
      if (!hits.length) return null;
      const sources = [...new Set(hits.map(h => h.source))];
      return { capability: g.cap, label: g.label, skills: hits.map(h => h.source + ':' + h.name), sources, duplicateLevel: sources.length >= 2 ? 'high' : 'none' };
    }).filter(Boolean),
```
교체:
```js
    groups,
```

### 3f. 이동한 `--workflows` 블록 + 표 렌더

- [ ] **Step 7:** Step 5 에서 추가한 groups/groupsByCap 블록 **바로 뒤**에 이동·확장한 `--workflows` 블록을 둔다:

```js
// --workflows: 워크플로우 목록 + 각 단계의 쓸 스킬(인벤토리로 해소). 인벤토리 뒤라야 함.
if (process.argv.includes('--workflows')) {
  let builtin = [];
  try { builtin = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'workflows.json'), 'utf8')).workflows || []; }
  catch (e) { console.log('workflows.json 못 읽음:', e.message); }
  const all = listAll(builtin, loadUser());
  if (process.argv.includes('--json')) {
    const enriched = all.map((w) => ({ ...w, steps: resolveSteps(w, groupsByCap) }));
    console.log(JSON.stringify({ workflows: enriched }, null, 2));
  } else {
    console.log('\n워크플로우 목록 (단계별 쓸 스킬):');
    for (const w of all) {
      const tag = w.source === 'user' ? '내 것' : '내장';
      console.log(`\n[${w.label} · ${w.name}]  (${tag})`);
      const steps = resolveSteps(w, groupsByCap);
      steps.forEach((s, i) => {
        const r = s.resolved;
        let col;
        if (r.kind === 'pinned') col = `고정: ${r.skills[0]}`;
        else if (r.kind === 'none') col = '기본 Claude로 (전담 스킬 없음)';
        else col = `${r.count}곳 — ${r.sources.join('·')} 중 하나`;
        console.log(`  ${String(i + 1).padStart(2)}  ${padW(r.label, 22)}${col}`);
      });
    }
    console.log('\n표의 "N곳"은 넓게 잡은 수예요(역할 다른 건 제시 때 가려드림).');
    console.log('자주 쓰는 하나로 흐름 저장: workflow save <이름> · set-skill <이름> · <이름>(실행)\n');
  }
  process.exit(0);
}
```

- [ ] **Step 8:** 표 정렬용 표시폭 패딩 헬퍼 `padW` 를 추가한다. 파일 상단의 `argAfter` 정의(현재 14행) 바로 뒤에 둔다(한글·CJK 는 폭 2로 계산):

```js
// 한글/CJK 는 터미널 폭 2 → 표 칸 정렬용 표시폭 기준 우측 패딩.
const isWide = (cp) => (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) || (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFF00 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6);
const dispWidth = (s) => [...s].reduce((w, ch) => w + (isWide(ch.codePointAt(0)) ? 2 : 1), 0);
const padW = (s, w) => s + ' '.repeat(Math.max(1, w - dispWidth(s)));
```

- [ ] **Step 9: 기존 출력 무변 확인 (재배선 안전망)**

Run: `node --test "test/*.test.mjs"`
Expected: 39 pass, 0 fail. (Task 1 의 `--json` 특성 테스트 포함 통과 = `--json` 구조 무변.)

- [ ] **Step 10: 수동 스모크 — 표가 스킬을 보여주나**

Run: `node scan.mjs --workflows`
Expected: 각 워크플로우 아래 `# / 라벨 / 쓸 스킬` 줄. 예) `app-dev` 의 `tdd` 단계가 `3곳 — .agents·agent-skills·superpowers 중 하나`, `implement` 가 `기본 Claude로`.

Run: `node scan.mjs --json` 와 `node scan.mjs --judge` 를 각각 실행해 출력이 종전과 동일한 모양인지 눈으로 확인.

- [ ] **Step 11: 커밋**

```bash
git add scan.mjs
git commit -m "feat(cli): --workflows 가 단계별 쓸 스킬을 인벤토리로 해소해 표로 표시"
```

---

## Task 4: CLI 통합 테스트 — `--workflows` 해소

**Files:**
- Test: `test/cli-workflow.test.mjs` (끝에 추가)

- [ ] **Step 1: 실패 테스트 작성**

```js
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
  // implement 단계는 전담 스킬 없음 → none
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
```

- [ ] **Step 2: 실행해 통과 확인**

Run: `node --test "test/*.test.mjs"`
Expected: 41 pass, 0 fail.
참고: 이 테스트들은 실제 `~/.claude/skills` 를 스캔하므로 `resolved.kind` 의 정확한 값(개수)은 단정하지 않고 구조만 검증한다(환경 독립). `implement→none` 은 어떤 인벤토리에서도 참(GROUPS cap 아님).

- [ ] **Step 3: 커밋**

```bash
git add test/cli-workflow.test.mjs
git commit -m "test(cli): --workflows 해소 — resolved 구조 + 글자 표"
```

---

## Task 5: SKILL.md 안내 갱신

표가 스킬까지 보여준다고 알리고, 제시 시 판정 보정·평한국어 규칙을 명시.

**Files:**
- Modify: `SKILL.md` (워크플로우 모드 절)

- [ ] **Step 1:** 워크플로우 모드 `### 절차` 의 1번 항목을 갱신.

찾기:
```
1. `node scan.mjs --workflows` → 템플릿 목록(이름·라벨·capability 시퀀스). `list`면 여기서 끝.
```
교체:
```
1. `node scan.mjs --workflows` → 워크플로우 목록 + **각 단계의 쓸 스킬**(인벤토리로 해소한 단계별 표). `list`면 여기서 끝 — 단, 아래 '표 제시' 규칙대로 찍는다.
```

- [ ] **Step 2:** `### 절차` 블록 끝에 '표 제시' 규칙을 추가한다(워크플로우 모드 절차 4번 뒤):

```
### 표 제시 (list/run 공통)
`--workflows`(또는 `--workflows --json`)의 각 단계 `resolved` 를 그대로 베끼지 말고 **2단 판정**을 입혀 찍는다:
- 단계의 `resolved.skills` 에 **판정 루브릭**(역할 분담=보존)을 적용해 "진짜 N곳"으로 보정한다. 예: 아이디어 단계 6곳이어도 캐묻기·상담·의도 캐기를 빼면 진짜 2곳 → `6곳 매칭(진짜 2곳) — superpowers·agent-skills 중 하나`. 코드 리뷰 4곳 → 받기·요청 빼고 진짜 2곳.
- `kind:'none'` 은 "기본 Claude로", `kind:'pinned'` 은 고정 스킬(실종이면 `--get` 의 installed 표시로 경고).
- **평한국어 규칙**(영어 스킬 이름 금지·출처 브랜드명/한국어 라벨만·이모지 금지·담백)을 똑같이 지킨다. capability 라벨은 `resolved.label` 그대로.
```

- [ ] **Step 3: 커밋**

```bash
git add SKILL.md
git commit -m "docs(skill): workflow 표가 스킬 표시 + 제시 시 판정 보정 안내"
```

---

## Task 6: 전체 검증 + 전역 동기화

- [ ] **Step 1: 전체 테스트**

Run: `node --test "test/*.test.mjs"`
Expected: 41 pass, 0 fail.

- [ ] **Step 2: 라이브 스모크 (제시 형태)**

Run: `node scan.mjs --workflows --json` 으로 resolved 가 채워졌는지 확인. 사용자 흐름(`--save` 로 임시 흐름 저장 후 `--workflows` 표에 고정 스킬이 `고정:` 으로 뜨는지)도 1회 확인 후 정리.

- [ ] **Step 3: 전역 런타임 사본 동기화**

전역본(`~/.claude/skills/skills-manager`)은 구버전 복사라 자동 반영 안 됨. 변경된 3개 파일을 복사:
- `scan.mjs`, `workflow-store.mjs`, `SKILL.md` → `~/.claude/skills/skills-manager/`

복사 후 `node "C:/Users/Mun/.claude/skills/skills-manager/scan.mjs" --workflows` 로 전역본에서도 표가 뜨는지 확인.

- [ ] **Step 4: finishing-a-development-branch**

테스트 green·스모크 통과 후 superpowers:finishing-a-development-branch 로 병합/PR 선택.

---

## Self-Review (작성자 점검)

**Spec coverage:** 스펙의 5개 컴포넌트 모두 태스크로 매핑됨 — resolveSteps(T2)·scan 정리(T3)·글자 표(T3f)·--json 해소(T3f)·SKILL.md(T5). 테스트 5종(T1 안전망·T2 단위 4종·T4 CLI 2종) + 동기화(T6) 포함.

**Placeholder scan:** TBD/TODO 없음. 모든 코드 단계에 실제 코드.

**Type consistency:** `resolveSteps(workflow, groupsByCap)` 시그니처·`resolved {kind,label,skills,sources,count}` 형태가 T2 정의 ↔ T3 사용 ↔ T4 검증에서 일치. `groupsByCap` 은 T3e 에서 `{cap: {label,skills,sources,...}}` 로 구성 → resolveSteps 가 기대하는 형태와 일치. `padW`/`dispWidth`/`isWide` 는 T3 Step 8 에서 정의 후 Step 7 에서 사용(파일 상단에 둬 호이스트 문제 없음 — const 정의가 사용보다 위).

**주의:** spec 의 resolved 에 `label` 을 추가함(렌더가 라벨을 필요로 해 resolveSteps 가 함께 산출 — 렌더 로직을 얇게 유지). 스펙 의도와 합치.

---

## Round 2 — 적대 리뷰(4축+검증) 반영

다중 에이전트 적대 리뷰 후 진짜 결함만 선별 반영. 적대 검증이 HIGH 2건 중 1건을 기각.

- **HIGH(확증·`58cdd73`)**: no-skills 환경에서 단계 라벨이 영어 cap(brainstorm·tdd…)으로 추락 — 한국어 라벨이 GROUPS 상수에 이미 있는데 런타임 `groups` 에서만 끌어와 빈 인벤토리 때 폴백. → `CAP_LABEL` 을 9개 그룹 cap 까지 채워 **단일 출처**화하고 GROUPS 가 `label: CAP_LABEL[cap]` 로 참조(라벨 문자열 동일 → --judge/--json 불변). no-skills 텍스트 경로 회귀 테스트 추가(USERPROFILE/HOME 오버라이드로 강제).
- **M·정렬(`bba9ff5`)**: 폭 22 라벨(TDD)이 `padW` 바닥값 탓에 한 칸 밀림 → 라벨 열 폭을 실제 최대 표시폭+2 로 동적 계산.
- **M·문구(`bba9ff5`)**: `count(스킬수)` vs `sources(출처수)` 비대칭으로 "4곳 — 3개 나열 중 하나" 모순 + "1곳 중 하나" 어색 → `count===1`은 `1곳 — <출처>`, 그 외는 `N곳 겹침 — <출처들>`. "중 하나" 제거(역할 동등 오해 방지).
- **L·드리프트(`a772405`)**: 후보 필터식이 conflicts·groups 두 곳에 복붙(같은 'N곳'을 두 표면이 따로 계산) → `hitsForGroup(g)` 단일 헬퍼로 통합.
- **M·테스트(`a772405`)**: 사용자 흐름 note/skill/source 보존 회귀 잠금 테스트.
- **L·문서(`a772405`)**: SKILL.md 핀-실종 경고를 `--workflows` 표가 아니라 `--get` 으로 확인한다고 명확화(2단 LLM 오단정 방지).

**기각(적대 검증 근거)**:
- HIGH·pinned `installed` 필드 부재 → **설계상 의도된 분리**(실종 판정은 `annotateMissing`/`--get` 책임, resolveSteps 순수성 유지, SKILL.md 가 --get 으로 라우팅). 스킵 검증 통과(isReal=false).
- M·pinned 영어 id 노출 → 설계가 명시 허용(run-mode 와 일관·사용자 자신이 박은 핀·정밀성). 평한국어 리뷰어도 "의도된 허용"으로 동의.

**보류(YAGNI·백로그)**: 픽스처 기반 완전 hermetic 테스트 하네스(가짜 ~/.claude 스킬 트리) — 현재 no-skills 테스트로 핵심 경로는 환경 독립 확보. 더 넓은 스냅샷은 수요 시.

최종: 44 테스트 green, --json/--judge/기본 출력 불변(라벨 동일·total 124·groups 9).
