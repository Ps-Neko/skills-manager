// workflow-store.mjs
// Skills Manager 워크플로우 저장소 — 내가 저장한 워크플로우의 파일 I/O.
// ⚠️ 쓰기는 오직 이 사용자 파일에만. settings·스킬 폴더·다른 스킬은 안 건드린다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 내장 5개 템플릿 이름 = 예약(덮어쓰기 금지).
export const RESERVED = new Set(['app-dev', 'bugfix', 'release-check', 'code-review', 'refactor']);

// 이름: 영숫자·한글·하이픈·밑줄 1~40자, 경로 문자/`..` 금지.
// 선두/말미 하이픈 금지(CLI 플래그 오인 방지) — 내부 하이픈은 허용.
export function validName(name) {
  return typeof name === 'string' && /^[\w가-힣](?:[\w가-힣-]{0,38}[\w가-힣])?$/u.test(name) && !name.includes('..');
}

// 단계 구조 검증 — 저장은 유일한 '쓰기'라 깨진 단계를 막는다.
// { capability: 문자열, skill: 문자열|null, note: 문자열|null }
export function validStep(s) {
  return !!s && typeof s === 'object'
    && typeof s.capability === 'string'
    && (s.skill == null || typeof s.skill === 'string')
    && (s.note == null || typeof s.note === 'string');
}

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

export function removeWorkflow(name, file = defaultUserFile()) {
  if (!validName(name)) return { ok: false, reason: 'invalid-name' };
  const list = loadUser(file);
  const next = list.filter((w) => w.name !== name);
  if (next.length === list.length) return { ok: false, reason: 'not-found' };
  writeUser(next, file);
  return { ok: true };
}

export function saveWorkflow(name, workflow, file = defaultUserFile()) {
  if (!validName(name)) return { ok: false, reason: 'invalid-name' };
  if (RESERVED.has(name)) return { ok: false, reason: 'reserved' };
  const steps = (workflow && workflow.steps) || [];
  if (!Array.isArray(steps) || !steps.every(validStep)) return { ok: false, reason: 'invalid-steps' };
  const list = loadUser(file);
  const wf = { name, label: (workflow && workflow.label) || name, steps };
  const idx = list.findIndex((w) => w.name === name);
  const overwritten = idx >= 0;
  if (overwritten) list[idx] = wf;
  else list.push(wf);
  writeUser(list, file);
  return { ok: true, overwritten };
}

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
