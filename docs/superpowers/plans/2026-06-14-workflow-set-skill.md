# 워크플로우 단계 스킬 교체 (`--set-skill`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저장된 내 워크플로우에서 한 단계의 스킬 핀만 교체/비우는 결정적 조작(`setStepSkill` + `--set-skill` CLI)을 추가한다.

**Architecture:** 순수·결정적 저장모듈 함수(`setStepSkill`, 인벤토리 무관)를 토대로 깔고, 그 위에 인벤토리를 아는 CLI 핸들러(`--set-skill`, 안 깔린 스킬 경고)를 얹는다. 제거는 기존 `--delete` 재사용. 쓰기는 사용자 워크플로우 파일 한 곳뿐.

**Tech Stack:** Node.js ESM(.mjs), 런타임 의존성 0, 테스트 = 내장 `node:test`(`node --test test/<파일>`).

**참고 스펙:** `docs/superpowers/specs/2026-06-14-workflow-set-skill-design.md`

> ⚠️ **동시 세션 주의:** 이 레포는 여러 세션이 동시에 만질 수 있다. 매 커밋 직전 `git rev-parse HEAD`·`git status`로 HEAD·작업트리를 재확인한다.

---

## File Structure

- `workflow-store.mjs` — **수정**. 새 export `setStepSkill(name, stepIndex, skillId, file)`. 저장 파일 I/O만, 인벤토리 모름.
- `scan.mjs` — **수정**. `--set-skill` CLI 핸들러 추가(`--get` 블록 뒤, `GROUPS` 앞). 상단 import에 `setStepSkill` 추가. `--workflows` 푸터 안내줄에 set-skill 추가.
- `test/workflow-store.test.mjs` — **수정**. `setStepSkill` 단위 테스트.
- `test/cli-workflow.test.mjs` — **수정**. `--set-skill` 통합 테스트.
- `SKILL.md` — **수정**. "수정 (스킬 교체)" 절 신설.
- (변경 없음) `workflows.json` — 내장 템플릿 불변.

---

## Task 1: 저장모듈 `setStepSkill` (순수 함수, 단위 TDD)

**Files:**
- Modify: `workflow-store.mjs` (파일 끝에 export 추가)
- Test: `test/workflow-store.test.mjs`

- [ ] **Step 1: 실패 테스트 작성**

`test/workflow-store.test.mjs` 의 import 줄(7행)에 `setStepSkill` 을 추가:

```js
import { saveWorkflow, loadUser, validName, RESERVED, removeWorkflow, annotateMissing, listAll, validStep, setStepSkill } from '../workflow-store.mjs';
```

파일 끝에 테스트 추가:

```js
test('setStepSkill sets a step skill by 1-based index, preserving others', () => {
  const file = tmpFile();
  saveWorkflow('mine', { label: 'M', steps: [
    { capability: 'tdd', skill: null, note: 'a' },
    { capability: 'review', skill: null, note: 'b' },
  ] }, file);
  const res = setStepSkill('mine', 2, 'agent-skills:code-review-and-quality', file);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.capability, 'review');
  assert.strictEqual(res.skill, 'agent-skills:code-review-and-quality');
  const loaded = loadUser(file);
  assert.strictEqual(loaded[0].steps[1].skill, 'agent-skills:code-review-and-quality');
  assert.strictEqual(loaded[0].steps[0].skill, null);   // 다른 단계 보존
  assert.strictEqual(loaded[0].steps[1].note, 'b');      // note 보존
  assert.strictEqual(loaded[0].steps[1].capability, 'review'); // capability 보존
});

test('setStepSkill clears a pin with null', () => {
  const file = tmpFile();
  saveWorkflow('mine', { steps: [{ capability: 'tdd', skill: 'x:y' }] }, file);
  const res = setStepSkill('mine', 1, null, file);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.skill, null);
  assert.strictEqual(loadUser(file)[0].steps[0].skill, null);
});

test('setStepSkill rejects reserved built-in names', () => {
  const file = tmpFile();
  const res = setStepSkill('app-dev', 1, 'a:b', file);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'reserved');
});

test('setStepSkill reports not-found for an unknown workflow', () => {
  const file = tmpFile();
  const res = setStepSkill('ghost', 1, 'a:b', file);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'not-found');
});

test('setStepSkill rejects invalid names', () => {
  const file = tmpFile();
  assert.strictEqual(setStepSkill('../x', 1, 'a:b', file).reason, 'invalid-name');
});

test('setStepSkill rejects out-of-range or non-integer step and reports stepCount', () => {
  const file = tmpFile();
  saveWorkflow('mine', { steps: [{ capability: 'tdd' }, { capability: 'review' }] }, file);
  assert.strictEqual(setStepSkill('mine', 0, 'a:b', file).reason, 'bad-step');
  assert.strictEqual(setStepSkill('mine', 3, 'a:b', file).reason, 'bad-step');
  assert.strictEqual(setStepSkill('mine', 1.5, 'a:b', file).reason, 'bad-step');
  assert.strictEqual(setStepSkill('mine', 3, 'a:b', file).stepCount, 2);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/workflow-store.test.mjs`
Expected: FAIL — `setStepSkill is not a function` (또는 import 에러).

- [ ] **Step 3: 최소 구현**

`workflow-store.mjs` 파일 끝(마지막 export 뒤)에 추가:

```js
// 저장된 내 흐름에서 한 단계(1부터)의 스킬 핀만 교체/비우기.
// 인벤토리는 모름 — 저장 파일만 다루는 결정적 조작.
export function setStepSkill(name, stepIndex, skillId, file = defaultUserFile()) {
  if (!validName(name)) return { ok: false, reason: 'invalid-name' };
  if (RESERVED.has(name)) return { ok: false, reason: 'reserved' };
  const list = loadUser(file);
  const wf = list.find((w) => w.name === name);
  if (!wf) return { ok: false, reason: 'not-found' };
  const steps = Array.isArray(wf.steps) ? wf.steps : [];
  if (!Number.isInteger(stepIndex) || stepIndex < 1 || stepIndex > steps.length) {
    return { ok: false, reason: 'bad-step', stepCount: steps.length };
  }
  const step = steps[stepIndex - 1];
  step.skill = skillId == null ? null : String(skillId);
  writeUser(list, file);
  return { ok: true, capability: step.capability, skill: step.skill };
}
```

(`validName`·`RESERVED`·`loadUser`·`writeUser`·`defaultUserFile` 은 모두 같은 모듈에 이미 있음.)

- [ ] **Step 4: 통과 확인**

Run: `node --test test/workflow-store.test.mjs`
Expected: PASS (기존 + 신규 6 테스트 전부).

- [ ] **Step 5: 커밋**

```bash
git rev-parse HEAD   # 동시 세션 재확인
git add workflow-store.mjs test/workflow-store.test.mjs
git commit -m "feat(store): setStepSkill — 저장 흐름의 단계별 스킬 핀 교체/비우기"
```

---

## Task 2: `--set-skill` CLI 명령 (통합 TDD)

**Files:**
- Modify: `scan.mjs` (import 12행, `--get` 블록 뒤 핸들러, `--workflows` 푸터 42행)
- Test: `test/cli-workflow.test.mjs`

- [ ] **Step 1: 실패 테스트 작성**

`test/cli-workflow.test.mjs` 파일 끝에 추가:

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/cli-workflow.test.mjs`
Expected: FAIL — `--set-skill` 미구현이라 명령이 인식 안 됨(기본 검사 출력이 나와 `고쳤어요`/`exit 1` 단언이 깨짐).

- [ ] **Step 3: scan.mjs import 갱신**

`scan.mjs` 12행을 교체:

```js
import { saveWorkflow, removeWorkflow, loadUser, listAll, annotateMissing, setStepSkill } from './workflow-store.mjs';
```

- [ ] **Step 4: `--set-skill` 핸들러 추가**

`scan.mjs` 의 `--get` 블록 바로 뒤(`GROUPS` 선언 앞)에 삽입. 이 지점은 `uniq`(설치 목록)가 이미 계산돼 있어 깔림 경고가 가능하다:

```js
// --set-skill <name> --step <n> --skill <id|none>: 내 흐름의 한 단계 스킬 핀만 교체/비우기.
if (process.argv.includes('--set-skill')) {
  const name = requireArg('--set-skill');
  const usage = '사용법: --set-skill <흐름이름> --step <번호(1부터)> --skill <스킬id | none>  (비우려면 --skill none)';
  const stepRaw = process.argv.includes('--step') ? argAfter('--step') : undefined;
  const stepNum = Number(stepRaw);
  if (stepRaw === undefined || stepRaw.startsWith('--') || !Number.isInteger(stepNum) || stepNum < 1) {
    console.log(usage); process.exit(1);
  }
  const skillRaw = process.argv.includes('--skill') ? argAfter('--skill') : undefined;
  if (skillRaw === undefined || skillRaw.startsWith('--')) {
    console.log(usage); process.exit(1);
  }
  const skillId = (skillRaw === 'none' || skillRaw === 'null' || skillRaw === '') ? null : skillRaw;
  const installedIds = uniq.map((it) => it.source + ':' + it.name);
  if (skillId !== null && !installedIds.includes(skillId)) {
    console.log(`주의: '${skillId}'는 지금 안 깔린 스킬이에요. 그래도 박았어요(실행 때 '실종'으로 보일 수 있음).`);
  }
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
  console.log(`고쳤어요: ${name}의 ${stepNum}단계(${res.capability}) 스킬을 '${res.skill ?? '비움'}'로 설정.`);
  process.exit(0);
}
```

- [ ] **Step 5: `--workflows` 푸터 안내줄 갱신 (발견성)**

`scan.mjs` 42행을 교체:

```js
    console.log('\n사용: /skills-manager workflow <name> (실행) · save <name> · set-skill <name> --step N --skill <id|none> · delete <name>\n');
```

- [ ] **Step 6: 통과 확인**

Run: `node --test test/cli-workflow.test.mjs`
Expected: PASS (기존 3 + 신규 7 테스트).

전체 회귀: `node --test test/`
Expected: PASS (전체). 기본 검사 출력 육안 확인: `node scan.mjs` 가 기존과 동일하게 나오는지.

- [ ] **Step 7: 커밋**

```bash
git rev-parse HEAD   # 동시 세션 재확인
git add scan.mjs test/cli-workflow.test.mjs
git commit -m "feat(cli): --set-skill — 저장 흐름의 단계 스킬 교체(채팅+직접 CLI), 안 깔린 스킬 경고"
```

---

## Task 3: SKILL.md 문서 — "수정 (스킬 교체)" 절

**Files:**
- Modify: `SKILL.md`

- [ ] **Step 1: SKILL.md 읽고 삽입 위치 확인**

Run: 워크플로우 모드의 `### 저장 (save)` 와 `### 실행 (run)` 절을 찾는다. 새 절은 `### 저장 (save)` 절 **바로 뒤**에 넣는다(만들기 → 수정 → 실행 → 삭제 순서).

- [ ] **Step 2: 새 절 추가**

`### 저장 (save)` 절이 끝나는 지점 뒤에 삽입:

```markdown
### 수정 (스킬 교체) — `/skills-manager workflow set-skill <이름>`
저장한 내 흐름에서 **한 단계의 스킬 핀만** 바꾼다(단계 추가/삭제·이름변경은 안 함).
1. `node scan.mjs --get "<이름>"` 으로 현재 단계와 박힌 스킬을 읽는다.
2. 바꿀 단계의 capability에 겹침 후보가 여럿이면(`scan.mjs --json` groups) 후보를 보여주고 사용자가 하나 고르게 한다(우열 단정 금지).
3. `node scan.mjs --set-skill "<이름>" --step <번호(1부터)> --skill "<출처:스킬>"` 호출. 비우려면 `--skill none`.
   - 직접 CLI 예: `node scan.mjs --set-skill 내흐름 --step 3 --skill agent-skills:test-driven-development`
4. 결과 문구를 평한국어로 그대로 전한다. 안 깔린 스킬이면 "주의…" 경고가 함께 나오지만 그대로 박힌다(실행 때 '실종' 표시로 다시 잡힘).
- **내장 템플릿은 직접 못 고친다** — 먼저 `--get <내장>` 으로 받아 `--save <내이름>` 으로 내 흐름에 복제한 뒤 고친다.
- **제거는 이미 있다** → 아래 `### 삭제 (delete)` 참고. (수정·제거가 둘 다 된다.)
```

- [ ] **Step 3: 육안 검토**

SKILL.md 를 다시 읽어 절 순서·마크다운이 깨지지 않았는지 확인. 영어 함수명은 절차(개발자가 호출하는 명령)에만 쓰고, 사용자 대면 문구는 평한국어인지 확인.

- [ ] **Step 4: 커밋**

```bash
git rev-parse HEAD   # 동시 세션 재확인
git add SKILL.md
git commit -m "docs(skill): 워크플로우 '수정(스킬 교체)' 절 추가 + 제거 이미 있음 명시"
```

---

## Task 4: 전역 설치본 동기화 + 라이브 스모크 (권한 게이트)

> 전역 설치본(`~/.claude/skills/skills-manager`)은 dev 레포의 구버전 복사다. 사용자의 실제 `/skills-manager` 가 새 명령을 쓰려면 변경 파일을 복사해야 한다. **`~/.claude` 쓰기는 CLAUDE.md상 명시 허가 필요 — 이 태스크 시작 전 사용자에게 허가를 받는다.**

- [ ] **Step 1: 사용자 허가 요청**

다음 형식으로 묻는다:
- 🔧 무슨 작업: dev 레포의 3파일을 전역 설치본에 복사(동기화)
- 📁 대상: `~/.claude/skills/skills-manager/{scan.mjs, workflow-store.mjs, SKILL.md}`
- ⚠️ 왜: 전역본이 구버전 복사라 안 하면 실제 `/skills-manager` 에서 `set-skill` 이 안 보임
- ✅ 허가해도 되나요?: 권장 (읽기전용 도구 + 워크플로우 파일 외엔 안 건드림)

- [ ] **Step 2: 허가 시 복사**

```bash
cp workflow-store.mjs scan.mjs SKILL.md "$HOME/.claude/skills/skills-manager/"
```

- [ ] **Step 3: 라이브 스모크 (전역본으로 end-to-end)**

```bash
GLOBAL="$HOME/.claude/skills/skills-manager"
TMP=$(mktemp -d)
printf '%s' '{"label":"스모크","steps":[{"capability":"tdd","skill":null,"note":""}]}' | SKILLS_MANAGER_HOME="$TMP" node "$GLOBAL/scan.mjs" --save smoke-set
SKILLS_MANAGER_HOME="$TMP" node "$GLOBAL/scan.mjs" --set-skill smoke-set --step 1 --skill agent-skills:test-driven-development
SKILLS_MANAGER_HOME="$TMP" node "$GLOBAL/scan.mjs" --get smoke-set
SKILLS_MANAGER_HOME="$TMP" node "$GLOBAL/scan.mjs" --delete smoke-set
```

Expected: `--set-skill` 가 `고쳤어요: smoke-set의 1단계(tdd) 스킬을 'agent-skills:test-driven-development'로 설정.` 출력, `--get` JSON의 `steps[0].skill` 이 그 id, `--delete` 가 삭제 확인. (임시 `SKILLS_MANAGER_HOME` 이라 사용자 실제 워크플로우 파일은 안 건드림.)

- [ ] **Step 4: 결과 보고**

테스트 전체 green + 라이브 스모크 통과를 사용자에게 보고. 미푸시 상태(로컬 커밋만)임을 명시하고, 푸시 원하면 별도 허가받기.

---

## Self-Review

**1. Spec coverage:**
- 스펙 §1 `setStepSkill` → Task 1 ✓ (검증 표의 모든 reason: invalid-name/reserved/not-found/bad-step+stepCount/성공)
- 스펙 §2 `--set-skill` CLI(인자검증·깔림경고·문구 표) → Task 2 ✓
- 스펙 §3 SKILL.md(수정 절·복제 안내·제거 명시) → Task 3 ✓
- 스펙 §4 테스트(store 단위 + CLI 통합, 가짜 id 결정적 경고) → Task 1·2 ✓
- 스펙 배포주의(전역 동기화) → Task 4 ✓

**2. Placeholder scan:** TODO/TBD/"적절히 처리" 없음. 모든 코드 스텝에 실제 코드 포함. ✓

**3. Type consistency:** `setStepSkill(name, stepIndex, skillId, file)` 시그니처가 store 구현·store 테스트·CLI 호출에서 동일. 반환 필드 `{ok, reason, capability, skill, stepCount}` 가 CLI 핸들러의 분기·문구와 일치. CLI 문구가 스펙 §2 표와 일치. ✓
