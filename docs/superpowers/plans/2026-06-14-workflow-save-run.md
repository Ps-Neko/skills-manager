# workflow save/run 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skills Manager에 "워크플로우 저장/목록/실행/삭제"를 추가해, 내가 좋아하는 단계 흐름(중복 단계는 한 스킬로 고정)을 이름 붙여 재사용한다.

**Architecture:** 데이터 I/O는 새 모듈 `workflow-store.mjs`(사용자 파일 읽기/쓰기·이름검증·고정스킬 실종 표시)가 담당하고, `scan.mjs`는 CLI 플래그(`--save`/`--delete`/`--get`, `--workflows` 확장)로 그 모듈을 호출한다. "실행(단계 안내)"은 코드가 아니라 `SKILL.md` 절차로 LLM이 대화로 walk-through 한다. 쓰기는 오직 사용자 파일 `~/.claude/skills-manager-workflows.json` 한 곳에만.

**Tech Stack:** Node.js ESM(.mjs), 런타임 의존성 0, 테스트 = 내장 `node:test`(`node --test`).

설계 근거: `docs/superpowers/specs/2026-06-14-workflow-save-run-design.md`

---

## File Structure

- **Create** `workflow-store.mjs` — 사용자 워크플로우 파일 I/O + 이름검증 + 병합 + 고정스킬 실종 표시. 순수 함수(스캔 안 함). 한 가지 책임: "저장된 워크플로우 데이터 관리".
- **Create** `test/workflow-store.test.mjs` — 위 모듈의 `node:test`. 임시 디렉터리로 격리(실제 `~/.claude` 안 건드림).
- **Create** `test/cli-workflow.test.mjs` — `scan.mjs` 새 플래그를 child_process로 돌려 통합 검증.
- **Modify** `scan.mjs` — 새 플래그 4개 배선(`--save`/`--delete`/`--get` 추가, `--workflows` 병합 확장).
- **Modify** `SKILL.md` — 워크플로우 모드에 `save`/`run`/`delete` 절차 + 실행 중 교체·에러 안내 추가.

---

## Task 1: 저장소 모듈 — 저장·불러오기 왕복

**Files:**
- Create: `workflow-store.mjs`
- Test: `test/workflow-store.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/workflow-store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveWorkflow, loadUser } from '../workflow-store.mjs';

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-'));
  return path.join(dir, 'skills-manager-workflows.json');
}

test('save then load round-trips a workflow', () => {
  const file = tmpFile();
  const wf = { label: '내 흐름', steps: [{ capability: 'tdd', skill: 'agent-skills:test-driven-development', note: '' }] };
  const res = saveWorkflow('my-flow', wf, file);
  assert.strictEqual(res.ok, true);
  const loaded = loadUser(file);
  assert.strictEqual(loaded.length, 1);
  assert.strictEqual(loaded[0].name, 'my-flow');
  assert.strictEqual(loaded[0].steps[0].skill, 'agent-skills:test-driven-development');
});

test('loadUser returns [] for a missing file', () => {
  assert.deepStrictEqual(loadUser(path.join(os.tmpdir(), 'sw-nope', 'none.json')), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/workflow-store.test.mjs`
Expected: FAIL — `Cannot find module '../workflow-store.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// workflow-store.mjs
// Skills Manager 워크플로우 저장소 — 내가 저장한 워크플로우의 파일 I/O.
// ⚠️ 쓰기는 오직 이 사용자 파일에만. settings·스킬 폴더·다른 스킬은 안 건드린다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 사용자 파일은 스킬 폴더 밖 — 재설치(폴더 덮어쓰기)에도 안 날아간다.
// 테스트는 SKILLS_MANAGER_HOME 으로 임시 디렉터리를 가리켜 실제 ~/.claude 를 안 건드린다.
export function defaultUserFile() {
  const home = process.env.SKILLS_MANAGER_HOME || path.join(os.homedir(), '.claude');
  return path.join(home, 'skills-manager-workflows.json');
}

export function loadUser(file = defaultUserFile()) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(j.workflows) ? j.workflows : [];
  } catch {
    return []; // 없거나 손상 → 빈 목록(안전).
  }
}

function writeUser(list, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, workflows: list }, null, 2));
}

export function saveWorkflow(name, workflow, file = defaultUserFile()) {
  const list = loadUser(file);
  const wf = { name, label: (workflow && workflow.label) || name, steps: (workflow && workflow.steps) || [] };
  const idx = list.findIndex((w) => w.name === name);
  const overwritten = idx >= 0;
  if (overwritten) list[idx] = wf;
  else list.push(wf);
  writeUser(list, file);
  return { ok: true, overwritten };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/workflow-store.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add workflow-store.mjs test/workflow-store.test.mjs
git commit -m "feat(store): 워크플로우 저장/불러오기 왕복"
```

---

## Task 2: 이름 검증 + 예약 이름 + 덮어쓰기 표시

**Files:**
- Modify: `workflow-store.mjs`
- Test: `test/workflow-store.test.mjs`

- [ ] **Step 1: Write the failing test** (기존 파일에 추가)

```js
import { validName, RESERVED } from '../workflow-store.mjs';

test('reserved built-in names cannot be saved', () => {
  const file = tmpFile();
  const res = saveWorkflow('app-dev', { steps: [] }, file);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'reserved');
  assert.deepStrictEqual(loadUser(file), []); // 안 써졌다
});

test('invalid names are rejected', () => {
  const file = tmpFile();
  assert.strictEqual(saveWorkflow('../escape', { steps: [] }, file).reason, 'invalid-name');
  assert.strictEqual(saveWorkflow('a/b', { steps: [] }, file).reason, 'invalid-name');
  assert.strictEqual(saveWorkflow('', { steps: [] }, file).reason, 'invalid-name');
});

test('validName accepts 한글·hyphen·underscore', () => {
  assert.strictEqual(validName('내-흐름_1'), true);
  assert.strictEqual(validName('a/b'), false);
});

test('saving an existing name overwrites and flags it', () => {
  const file = tmpFile();
  saveWorkflow('dup', { label: 'A', steps: [] }, file);
  const res = saveWorkflow('dup', { label: 'B', steps: [] }, file);
  assert.strictEqual(res.overwritten, true);
  const loaded = loadUser(file);
  assert.strictEqual(loaded.length, 1);
  assert.strictEqual(loaded[0].label, 'B');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/workflow-store.test.mjs`
Expected: FAIL — `validName`/`RESERVED` not exported; reserved/invalid not enforced.

- [ ] **Step 3: Write minimal implementation** (`workflow-store.mjs` 수정)

`import` 줄들 아래에 추가:

```js
// 내장 5개 템플릿 이름 = 예약(덮어쓰기 금지).
export const RESERVED = new Set(['app-dev', 'bugfix', 'release-check', 'code-review', 'refactor']);

// 이름: 영숫자·한글·하이픈·밑줄 1~40자, 경로 문자/`..` 금지.
export function validName(name) {
  return typeof name === 'string' && /^[\w가-힣-]{1,40}$/u.test(name) && !name.includes('..');
}
```

`saveWorkflow` 맨 앞(`const list =` 위)에 가드 추가:

```js
  if (!validName(name)) return { ok: false, reason: 'invalid-name' };
  if (RESERVED.has(name)) return { ok: false, reason: 'reserved' };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/workflow-store.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add workflow-store.mjs test/workflow-store.test.mjs
git commit -m "feat(store): 이름 검증·예약 이름·덮어쓰기 표시"
```

---

## Task 3: 삭제 + 손상 파일 안전

**Files:**
- Modify: `workflow-store.mjs`
- Test: `test/workflow-store.test.mjs`

- [ ] **Step 1: Write the failing test** (추가)

```js
import { removeWorkflow } from '../workflow-store.mjs';

test('remove deletes a saved workflow', () => {
  const file = tmpFile();
  saveWorkflow('gone', { steps: [] }, file);
  assert.strictEqual(removeWorkflow('gone', file).ok, true);
  assert.deepStrictEqual(loadUser(file), []);
});

test('removing a missing name reports not-found', () => {
  const file = tmpFile();
  const res = removeWorkflow('nope', file);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'not-found');
});

test('a corrupt user file loads as [] and does not crash on save', () => {
  const file = tmpFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ this is not json');
  assert.deepStrictEqual(loadUser(file), []);
  const res = saveWorkflow('after-corrupt', { steps: [] }, file);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(loadUser(file).length, 1); // 손상 내용 위에 안전하게 새로 씀
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/workflow-store.test.mjs`
Expected: FAIL — `removeWorkflow` not exported.

- [ ] **Step 3: Write minimal implementation** (`workflow-store.mjs`에 추가)

```js
export function removeWorkflow(name, file = defaultUserFile()) {
  const list = loadUser(file);
  const next = list.filter((w) => w.name !== name);
  if (next.length === list.length) return { ok: false, reason: 'not-found' };
  writeUser(next, file);
  return { ok: true };
}
```

(손상 파일 안전은 `loadUser`의 `catch { return []; }`로 이미 충족 — 테스트가 이를 고정한다.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/workflow-store.test.mjs`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add workflow-store.mjs test/workflow-store.test.mjs
git commit -m "feat(store): 삭제 + 손상 파일 안전"
```

---

## Task 4: 고정 스킬 실종 표시 + 내장/사용자 병합

**Files:**
- Modify: `workflow-store.mjs`
- Test: `test/workflow-store.test.mjs`

- [ ] **Step 1: Write the failing test** (추가)

```js
import { annotateMissing, listAll } from '../workflow-store.mjs';

test('annotateMissing flags installed vs missing vs null', () => {
  const wf = { name: 'w', steps: [
    { capability: 'tdd', skill: 'agent-skills:test-driven-development' },
    { capability: 'review', skill: 'gone:old-skill' },
    { capability: 'implement', skill: null },
  ] };
  const out = annotateMissing(wf, ['agent-skills:test-driven-development', 'gstack:review']);
  assert.strictEqual(out.steps[0].installed, true);
  assert.strictEqual(out.steps[1].installed, false);
  assert.strictEqual(out.steps[2].installed, null);
});

test('listAll merges builtin + user with source labels', () => {
  const merged = listAll([{ name: 'app-dev', steps: [] }], [{ name: 'mine', steps: [] }]);
  assert.strictEqual(merged.find((w) => w.name === 'app-dev').source, 'builtin');
  assert.strictEqual(merged.find((w) => w.name === 'mine').source, 'user');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/workflow-store.test.mjs`
Expected: FAIL — `annotateMissing`/`listAll` not exported.

- [ ] **Step 3: Write minimal implementation** (`workflow-store.mjs`에 추가)

```js
// 각 단계의 고정 스킬이 지금도 깔려 있나 표시(run/get 에서 사용).
export function annotateMissing(workflow, installedIds) {
  const set = new Set(installedIds);
  return {
    ...workflow,
    steps: (workflow.steps || []).map((s) => ({
      ...s,
      installed: s.skill == null ? null : set.has(s.skill),
    })),
  };
}

// 내장 + 사용자 목록 병합(출처 표시).
export function listAll(builtin, user) {
  return [
    ...builtin.map((w) => ({ ...w, source: 'builtin' })),
    ...user.map((w) => ({ ...w, source: 'user' })),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/workflow-store.test.mjs`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add workflow-store.mjs test/workflow-store.test.mjs
git commit -m "feat(store): 고정 스킬 실종 표시 + 내장/사용자 병합"
```

---

## Task 5: scan.mjs 배선 — `--save` / `--delete` / `--get` / `--workflows` 병합

**Files:**
- Modify: `scan.mjs`
- Test: `test/cli-workflow.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
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
    env: { ...process.env, SKILLS_MANAGER_HOME: home },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cli-workflow.test.mjs`
Expected: FAIL — `--save` not handled (no user file written; output lacks "저장").

- [ ] **Step 3: Write minimal implementation** (`scan.mjs` 수정)

(3a) `scan.mjs` 맨 위 import 블록(`import { fileURLToPath } ...` 줄 아래)에 추가:

```js
import { saveWorkflow, removeWorkflow, loadUser, listAll, annotateMissing } from './workflow-store.mjs';

const argAfter = (flag) => process.argv[process.argv.indexOf(flag) + 1];
```

(3b) 기존 `--workflows` 블록을 다음으로 **교체**(사용자 워크플로우 병합):

```js
// --workflows: 내장 템플릿 + 내가 저장한 워크플로우 목록 (스캔 없이 바로)
if (process.argv.includes('--workflows')) {
  let builtin = [];
  try { builtin = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'workflows.json'), 'utf8')).workflows || []; }
  catch (e) { console.log('workflows.json 못 읽음:', e.message); }
  const all = listAll(builtin, loadUser());
  if (process.argv.includes('--json')) console.log(JSON.stringify({ workflows: all }, null, 2));
  else {
    console.log('\n🧭 워크플로우:');
    for (const w of all) {
      const tag = w.source === 'user' ? '내 것 ' : '내장  ';
      console.log(`  · [${tag}] ${w.name.padEnd(14)} ${w.label}   [${w.steps.map(s => s.capability).join(' → ')}]`);
    }
    console.log('\n사용: /skills-manager workflow <name> (실행 안내) · workflow save <name> (저장) · workflow delete <name>\n');
  }
  process.exit(0);
}

// --save <name>: stdin 으로 받은 워크플로우 JSON 을 사용자 파일에 저장(쓰기는 여기 한 곳만).
if (process.argv.includes('--save')) {
  const name = argAfter('--save');
  let wf;
  try { wf = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); }
  catch { console.log('저장 실패: 워크플로우 JSON 을 못 읽었어요(stdin).'); process.exit(1); }
  const res = saveWorkflow(name, wf);
  if (!res.ok) {
    const why = { 'invalid-name': '이름이 올바르지 않아요(영숫자·한글·-·_ 1~40자).', 'reserved': '내장 템플릿 이름이라 다른 이름을 쓰세요.' }[res.reason] || res.reason;
    console.log(`저장 실패: ${why}`);
    process.exit(1);
  }
  console.log(res.overwritten ? `덮어써 저장했어요: ${name}` : `저장했어요: ${name}`);
  process.exit(0);
}

// --delete <name>: 사용자 파일에서만 삭제.
if (process.argv.includes('--delete')) {
  const name = argAfter('--delete');
  const res = removeWorkflow(name);
  console.log(res.ok ? `삭제했어요: ${name}` : `삭제할 게 없어요: ${name}(내 워크플로우에 없음 — 내장 템플릿은 못 지워요).`);
  process.exit(res.ok ? 0 : 1);
}
```

(3c) `--get <name>`: 인벤토리(`uniq`) 계산 **뒤**에 두어야 고정스킬 실종을 표시할 수 있다. `const uniq = items.filter(...)` (dedupe) 줄 **바로 아래**에 삽입:

```js
// --get <name>: 워크플로우 1건(내장+사용자)을 고정스킬 실종 표시와 함께 JSON 으로 — run 안내용.
if (process.argv.includes('--get')) {
  const name = argAfter('--get');
  let builtin = [];
  try { builtin = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'workflows.json'), 'utf8')).workflows || []; } catch {}
  const found = [...builtin, ...loadUser()].find((w) => w.name === name);
  if (!found) { console.log(JSON.stringify({ error: 'not-found', name })); process.exit(1); }
  const installedIds = uniq.map((it) => it.source + ':' + it.name);
  console.log(JSON.stringify(annotateMissing(found, installedIds), null, 2));
  process.exit(0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cli-workflow.test.mjs`
Expected: PASS (1 test). 그리고 전체: `node --test test/` → 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scan.mjs test/cli-workflow.test.mjs
git commit -m "feat(cli): scan.mjs 에 --save/--delete/--get + --workflows 병합 배선"
```

---

## Task 6: SKILL.md — save / run / delete 절차

**Files:**
- Modify: `SKILL.md`

테스트 없음(LLM 절차 문서). 수동 검증으로 마무리.

- [ ] **Step 1: SKILL.md "워크플로우 모드" 절에 아래 하위절 추가** (기존 "### 경계" 위)

```markdown
### 저장 (save) — `/skills-manager workflow save <이름>`
1. 저장할 흐름을 확보: (a) 직전 `recommend`/`workflow <name>` 결과를 쓰거나, (b) 사용자와 단계를 정한다.
2. 중복(여러 출처) 단계는 사용자에게 **하나를 고르게** 해 고정한다(`"출처:이름"`). 못 고르거나 없으면 `skill: null`.
3. 완성한 워크플로우 JSON을 `node scan.mjs --save "<이름>"` 의 stdin 으로 넘긴다(형식: `{ "label": "...", "steps": [{ "capability": "...", "skill": "출처:이름"|null, "note": "" }] }`).
4. 결과 문구(저장/덮어씀/실패 사유)를 평한국어로 그대로 전한다.

### 실행 (run) — `/skills-manager workflow <이름>` 또는 `workflow run <이름>`
1. `node scan.mjs --get "<이름>"` 으로 워크플로우(고정스킬 `installed` 표시 포함)를 읽는다. `not-found` 면 `--workflows` 목록을 보여주고 되묻는다.
2. 단계별로 안내한다: 각 단계의 capability + 고정 스킬을 "이 단계엔 이거 쓰세요"로. `skill:null`/cap 없음은 "기본 Claude로".
3. **이번엔 다른 거**: 사용자가 바꾸려 하면 그 capability의 중복 후보(`scan.mjs --json` groups)를 보여주고 **이번 실행만** 교체한다. 저장본은 사용자가 "이걸로 바꿔 저장"이라 해야 `save`로 갱신.
4. **고정 스킬 실종**(`installed:false`): "이 단계에 고정했던 X가 지금 안 보여요" + 그 capability의 현재 후보를 제시해 다시 고르게 한다. 절대 멈추지 말 것.
5. Skills Manager는 **조언만** 한다 — 실제 작업은 호스트가. 스킬을 자동 실행하지 않는다.

### 삭제 (delete) — `/skills-manager workflow delete <이름>`
`node scan.mjs --delete "<이름>"`. 내 워크플로우만 지워진다(내장 템플릿은 못 지움 — 그대로 안내). 지우기 전 한 번 확인.
```

- [ ] **Step 2: 경계 절에 쓰기 경계 한 줄 추가** (기존 "읽기 전용 — 흐름·추천만. 실행·끄기 없음." 을 아래로 교체)

```markdown
### 경계
읽기 전용 — 흐름·추천·실행 안내만. **쓰기는 오직 내가 저장한 워크플로우 파일(`~/.claude/skills-manager-workflows.json`) 한 곳뿐** — settings.json·스킬 폴더·다른 스킬은 절대 안 건드린다(스킬 끄기 없음). 실제 작업 실행도 없음(조언자).
```

- [ ] **Step 3: 수동 검증 (실제 ~/.claude)**

```bash
# 저장
echo '{"label":"내 앱개발","steps":[{"capability":"tdd","skill":"agent-skills:test-driven-development","note":""}]}' | node scan.mjs --save "내앱"
# 목록에 뜨나
node scan.mjs --workflows | grep "내앱"
# 단건 조회(installed 표시)
node scan.mjs --get "내앱"
# 삭제
node scan.mjs --delete "내앱"
```
Expected: 저장 문구 → 목록에 `[내 것]` 표시 → `--get` JSON에 `"installed": true` → 삭제 문구. `~/.claude/skills-manager-workflows.json` 이 생겼다가 비워진다.

- [ ] **Step 4: 전체 테스트 + 검사/추천 무변경 확인**

Run: `node --test test/` → 12 PASS. `node scan.mjs` (기본 검사) 출력이 기존과 동일한지 육안 확인.

- [ ] **Step 5: Commit**

```bash
git add SKILL.md
git commit -m "docs(skill): 워크플로우 save/run/delete 절차 + 쓰기 경계"
```

---

## Self-Review (작성자 점검)

**1. Spec coverage** — 설계 §6 명령 4개(save/list/run/delete) = Task 5(save/delete/get/list)+Task 6(run/save/delete 절차). §5 저장 위치(스킬 폴더 밖·재설치 생존) = `defaultUserFile`(Task 1). §2 쓰기 경계 = Task 6 Step 2 + 모듈 주석. §7 override·§8 에러처리 = Task 6 run 3·4. §9 테스트(왕복·덮어쓰기·실종·손상·임시격리) = Task 1~5. §10 범위 밖(끄기/프로필/실행) = 어디에도 task 없음(의도적). ✅ 갭 없음.

**2. Placeholder scan** — 모든 코드 단계에 실제 코드 있음, "적절히 처리" 류 없음. ✅

**3. Type consistency** — `saveWorkflow(name, workflow, file)`·`loadUser(file)`·`removeWorkflow(name, file)`·`annotateMissing(workflow, installedIds)`·`listAll(builtin, user)` 시그니처가 Task 1~5와 scan.mjs 호출부(Task 5)에서 일치. 워크플로우 객체 형태 `{name,label,steps:[{capability,skill,note}]}` 전 task 동일. 결과 객체 `{ok,reason,overwritten}` 일치. ✅

---

## Notes

- Skills Manager는 비공개 개인 도구. 이 작업은 `feat/workflow-save-run` 브랜치. 완료 후 머지 방식(직접/PR)은 사용자 결정.
- 런타임 의존성 0 유지(테스트도 `node:test` 내장).
- 검사·추천 경로(기존 손검증)는 무변경 — 회귀 없음 확인만.
