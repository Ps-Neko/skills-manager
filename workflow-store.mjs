// workflow-store.mjs
// skillsweep 워크플로우 저장소 — 내가 저장한 워크플로우의 파일 I/O.
// ⚠️ 쓰기는 오직 이 사용자 파일에만. settings·스킬 폴더·다른 스킬은 안 건드린다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 사용자 파일은 스킬 폴더 밖 — 재설치(폴더 덮어쓰기)에도 안 날아간다.
// 테스트는 SKILLSWEEP_HOME 으로 임시 디렉터리를 가리켜 실제 ~/.claude 를 안 건드린다.
export function defaultUserFile() {
  const home = process.env.SKILLSWEEP_HOME || path.join(os.homedir(), '.claude');
  return path.join(home, 'skillsweep-workflows.json');
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
