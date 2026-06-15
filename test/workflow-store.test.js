// test/workflow-store.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveWorkflow, loadUser, validName, RESERVED, removeWorkflow, annotateMissing, listAll, validStep, setStepSkill, resolveSteps } from '../workflow-store.js';

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

test('loadUser returns [] for valid JSON without a workflows key', () => {
  const file = tmpFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{}');
  assert.deepStrictEqual(loadUser(file), []);
});

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

test('validName rejects leading/trailing hyphens but keeps internal ones', () => {
  assert.strictEqual(validName('-start'), false);
  assert.strictEqual(validName('end-'), false);
  assert.strictEqual(validName('mid-dash'), true);
  assert.strictEqual(validName('a'), true);
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

test('annotateMissing returns steps:[] for a workflow without a steps key', () => {
  const out = annotateMissing({ name: 'x' }, []);
  assert.deepStrictEqual(out.steps, []);
  assert.strictEqual(out.name, 'x');
});

test('listAll merges builtin + user with source labels', () => {
  const merged = listAll([{ name: 'app-dev', steps: [] }], [{ name: 'mine', steps: [] }]);
  assert.strictEqual(merged.find((w) => w.name === 'app-dev').source, 'builtin');
  assert.strictEqual(merged.find((w) => w.name === 'mine').source, 'user');
});

test('saveWorkflow rejects malformed steps (invalid-steps)', () => {
  const file = tmpFile();
  assert.strictEqual(saveWorkflow('bad1', { steps: [{ skill: 'a:b' }] }, file).reason, 'invalid-steps'); // capability 없음
  assert.strictEqual(saveWorkflow('bad2', { steps: 'nope' }, file).reason, 'invalid-steps'); // steps 가 배열 아님
  assert.strictEqual(saveWorkflow('bad3', { steps: [{ capability: 'tdd', skill: 5 }] }, file).reason, 'invalid-steps'); // skill 타입 오류
  assert.deepStrictEqual(loadUser(file), []); // 아무것도 안 써짐
});

test('validStep accepts well-formed steps incl. null skill/note', () => {
  assert.strictEqual(validStep({ capability: 'tdd', skill: 'a:b', note: '' }), true);
  assert.strictEqual(validStep({ capability: 'implement', skill: null }), true);
  assert.strictEqual(validStep({ skill: 'a:b' }), false); // capability 없음
  assert.strictEqual(validStep(null), false);
});

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

// ── resolveSteps: 단계 capability 를 인벤토리 그룹 지도로 해소(순수·환경 독립) ──
const GBC = {
  tdd: { label: '테스트 먼저 짜기 (TDD)', skills: ['.agents:tdd', 'agent-skills:test-driven-development', 'superpowers:test-driven-development'], sources: ['.agents', 'agent-skills', 'superpowers'] },
  spec: { label: '스펙 작성', skills: ['gstack:spec', 'agent-skills:spec-driven-development'], sources: ['gstack', 'agent-skills'] },
  simplify: { label: '코드 단순화', skills: ['agent-skills:code-simplification'], sources: ['agent-skills'] },
};

test('resolveSteps: 여러 출처면 multi (개수·출처·라벨 보존)', () => {
  const [s] = resolveSteps({ steps: [{ capability: 'tdd', skill: null }] }, GBC);
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

test('resolveSteps: 모르는 capability(implement)면 none + CAP_LABEL', () => {
  const [s] = resolveSteps({ steps: [{ capability: 'implement', skill: null }] }, GBC);
  assert.strictEqual(s.resolved.kind, 'none');
  assert.strictEqual(s.resolved.count, 0);
  assert.strictEqual(s.resolved.label, '구현');
});

test('resolveSteps: groupsByCap 비어도 안 죽고 none — 알려진 cap 은 정적 한국어 라벨', () => {
  // 인벤토리 없음(빈 groups)이라도 알려진 cap 은 CAP_LABEL 로 한국어 라벨 보장(영어 추락 금지).
  const [s] = resolveSteps({ steps: [{ capability: 'tdd', skill: null }] }, {});
  assert.strictEqual(s.resolved.kind, 'none');
  assert.strictEqual(s.resolved.label, '테스트 먼저 짜기 (TDD)');
});

test('resolveSteps: 정적 라벨도 없는 미지 cap 은 원문으로 폴백', () => {
  const [s] = resolveSteps({ steps: [{ capability: 'zzz-unknown', skill: null }] }, {});
  assert.strictEqual(s.resolved.kind, 'none');
  assert.strictEqual(s.resolved.label, 'zzz-unknown');
});

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

// ── 입력 경계 정화: 제어문자(ANSI 이스케이프) 거부/제거 — 저장된 값이 나중에 터미널/LLM 으로 새는 걸 차단 ──
const ESC2 = String.fromCharCode(27);

test('validStep: capability·skill·note 의 제어문자를 거부(ANSI 주입 차단)', () => {
  assert.strictEqual(validStep({ capability: 'review' + ESC2 + '[2K' }), false, 'capability 제어문자');
  assert.strictEqual(validStep({ capability: 'review', skill: 'a:b' + ESC2 + '[31m' }), false, 'skill 제어문자');
  assert.strictEqual(validStep({ capability: 'review', skill: null, note: 'n' + ESC2 }), false, 'note 제어문자');
  assert.strictEqual(validStep({ capability: 'review', skill: 'a:b', note: '정상' }), true, '정상 단계는 통과');
});

test('saveWorkflow: 제어문자 섞인 step.skill 은 invalid-steps 로 거부', () => {
  const file = tmpFile();
  const res = saveWorkflow('inj', { steps: [{ capability: 'review', skill: 'user:x' + ESC2 + '[2J' }] }, file);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'invalid-steps');
  assert.deepStrictEqual(loadUser(file), []); // 안 써짐
});

test('saveWorkflow: label 의 제어문자는 떼어 저장(터미널 스푸핑 방지)', () => {
  const file = tmpFile();
  const res = saveWorkflow('lbl', { label: 'My' + ESC2 + '[2KFlow', steps: [{ capability: 'review' }] }, file);
  assert.strictEqual(res.ok, true);
  const loaded = loadUser(file);
  assert.ok(!loaded[0].label.includes(ESC2), 'label 에 ESC 가 남지 않음');
  assert.match(loaded[0].label, /My.*Flow/);
});

test('setStepSkill: 제어문자 섞인 skill 은 invalid-skill 로 거부(파일 불변)', () => {
  const file = tmpFile();
  saveWorkflow('mine', { steps: [{ capability: 'review' }] }, file);
  const res = setStepSkill('mine', 1, 'user:x' + ESC2 + '[5m', file);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'invalid-skill');
  assert.strictEqual(loadUser(file)[0].steps[0].skill, undefined); // 안 박힘
});
