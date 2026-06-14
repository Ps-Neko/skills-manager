#!/usr/bin/env node
// Skills Manager — 스킬 중복 지도 + 워크플로우
// ~/.claude 의 스킬·에이전트·플러그인을 "읽기 전용"으로 훑어,
// 같은 일을 하는 스킬이 여러 출처에 겹쳐 깔린 걸 평한국어 지도로 보여준다.
// [경계] 검사·추천은 읽기 전용(안 끄고 안 바꿈). 쓰기는 워크플로우 저장 파일 한 곳만.
//   1단(키워드)으로 후보를 넓게 묶고, 2단 정밀 판정은 `--judge` 패킷을 LLM이 읽어서.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { saveWorkflow, removeWorkflow, loadUser, listAll, annotateMissing, setStepSkill, resolveSteps } from './workflow-store.mjs';
import { scanInventory } from './scanner.mjs';
import { capsOf, classify } from './classifier.mjs';
import { buildHumanReport, buildJudgePacket } from './view-model.mjs';
import { dispWidth, padW, renderReport, renderJudgePacket } from './render.mjs';

const argAfter = (flag) => process.argv[process.argv.indexOf(flag) + 1];

const requireArg = (flag) => {
  const v = argAfter(flag);
  if (!v || v.startsWith('--')) { console.log(`사용법: ${flag} <이름>`); process.exit(1); }
  return v;
};

const HOME = os.homedir();
const CLAUDE = path.join(HOME, '.claude');
const SKILLS = path.join(CLAUDE, 'skills');
const AGENTS = path.join(CLAUDE, 'agents');
const PLUGINS = path.join(CLAUDE, 'plugins');
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// --save <name>: stdin 으로 받은 워크플로우 JSON 을 사용자 파일에 저장(쓰기는 여기 한 곳만).
if (process.argv.includes('--save')) {
  const name = requireArg('--save');
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw.trim()) {
    console.log('흐름을 저장하려면 단계가 필요해요. 두 가지 방법:');
    console.log("  · 방금 본 recommend·workflow 결과를 저장: 그걸 띄운 뒤 '이걸로 저장'이라고 하세요");
    console.log('  · 빈 흐름부터 직접: /skills-manager workflow save <이름> 후 단계를 채웁니다');
    const mine = loadUser();
    console.log(`지금 저장된 내 흐름: ${mine.length ? mine.map((w) => w.name).join(' · ') : '(없음)'}`);
    process.exit(1);
  }
  let wf;
  try { wf = JSON.parse(raw); }
  catch { console.log('저장 실패: 워크플로우 JSON 을 못 읽었어요(유효하지 않은 JSON).'); process.exit(1); }
  const res = saveWorkflow(name, wf);
  if (!res.ok) {
    const why = { 'invalid-name': '이름이 올바르지 않아요(영숫자·한글·-·_ 1~40자).', 'reserved': '내장 템플릿 이름이라 다른 이름을 쓰세요.', 'invalid-steps': '워크플로우 단계 형식이 올바르지 않아요(각 단계에 capability가 있어야 해요).' }[res.reason] || res.reason;
    console.log(`저장 실패: ${why}`);
    process.exit(1);
  }
  console.log(res.overwritten ? `덮어써 저장했어요: ${name}` : `저장했어요: ${name}`);
  process.exit(0);
}

// --delete <name>: 사용자 파일에서만 삭제.
if (process.argv.includes('--delete')) {
  const name = requireArg('--delete');
  const res = removeWorkflow(name);
  if (!res.ok) {
    console.log(res.reason === 'invalid-name'
      ? '이름이 올바르지 않아요(영숫자·한글·-·_ 1~40자).'
      : `삭제할 게 없어요: ${name} (내 워크플로우에 없음 — 내장 템플릿은 못 지워요).`);
    process.exit(1);
  }
  console.log(`삭제했어요: ${name}`);
  process.exit(0);
}

// ~/.claude/skills 가 없으면 스캔할 게 없음 — 친절히 안내하고 끝(크래시 방지).
// 단 --workflows 는 인벤토리가 비어도 워크플로우 목록은 보여줘야 하므로 통과시킨다.
if (!fs.existsSync(SKILLS) && !process.argv.includes('--workflows')) {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      version: '0.2.0',
      environment: { hasClaude: false, skillsPath: SKILLS, mirrorsFolded: 0 },
      counts: { total: 0, plugins: 0, agents: 0 },
      plugins: [], skills: [], groups: [],
    }, null, 2));
  } else {
    console.log(`\nSkills Manager — ~/.claude/skills 폴더를 찾지 못했어요.\n   Claude Code 스킬이 아직 설치되지 않았거나 경로가 다릅니다.\n   (찾은 경로: ${SKILLS})\n`);
  }
  process.exit(0);
}

// FS 인벤토리 수집은 scanner.mjs 가 담당 — scan.mjs 는 경로만 넘기고 결과를 받는다.
const { uniq, plugins, agentCount, mirrorFiles } = scanInventory({ SKILLS, CLAUDE, PLUGINS, AGENTS });

// --get <name>: 워크플로우 1건(내장+사용자)을 고정스킬 실종 표시와 함께 JSON 으로 — run 안내용.
if (process.argv.includes('--get')) {
  const name = requireArg('--get');
  let builtin = [];
  try { builtin = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, 'workflows.json'), 'utf8')).workflows || []; } catch {}
  const found = [...builtin, ...loadUser()].find((w) => w.name === name);
  if (!found) { console.log(JSON.stringify({ error: 'not-found', name })); process.exit(1); }
  const installedIds = uniq.map((it) => it.source + ':' + it.name);
  console.log(JSON.stringify(annotateMissing(found, installedIds), null, 2));
  process.exit(0);
}

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
    if (res.reason === 'bad-step' && res.steps && res.steps.length) {
      console.log(`  이 흐름의 단계: ${res.steps.map((s) => `${s.n} ${s.label}`).join(' · ')}`);
    }
    process.exit(1);
  }
  console.log(`고쳤어요: ${name}의 ${stepNum}단계(${res.capability}) 스킬을 '${res.skill ?? '비움'}'로 설정.`);
  process.exit(0);
}

// 분류(capability 판정 + 충돌/그룹)는 classifier.mjs(순수)가 담당 — scan.mjs 는 인벤토리만 넘긴다.
const { conflicts, cov, covSorted, groups, groupsByCap } = classify(uniq);

// --workflows: 워크플로우 목록 + 각 단계의 쓸 스킬(인벤토리로 해소). 인벤토리·groups 뒤라야 함.
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
    // 라벨 열 폭은 실제 라벨들의 최대 표시폭+2 로 — 라벨이 길어져도 'N곳' 열이 들쭉날쭉하지 않게.
    const resolved = all.map((w) => ({ w, steps: resolveSteps(w, groupsByCap) }));
    const LW = Math.max(2, ...resolved.flatMap((r) => r.steps.map((s) => dispWidth(s.resolved.label)))) + 2;
    for (const { w, steps } of resolved) {
      const tag = w.source === 'user' ? '내 것' : '내장';
      console.log(`\n[${w.label} · ${w.name}]  (${tag})`);
      steps.forEach((s, i) => {
        const r = s.resolved;
        let col;
        if (r.kind === 'pinned') col = `고정: ${r.skills[0]}`;
        else if (r.kind === 'none') col = '기본 Claude로 (전담 스킬 없음)';
        else if (r.count === 1) col = `1곳 — ${r.sources[0]}`;
        else col = `${r.count}곳 겹침 — ${r.sources.join('·')}`;
        console.log(`  ${String(i + 1).padStart(2)}  ${padW(r.label, LW)}${col}`);
      });
    }
    console.log('\n표의 "N곳"은 넓게 잡은 수예요 — 역할이 다른 건 추천·실행 때 추려 드려요.');
    console.log('자주 쓰는 하나로 굳히려면: workflow save <이름> · set-skill <이름> · <이름>(실행)\n');
  }
  process.exit(0);
}

// ── --json: 구조화된 스킬 인벤토리 (추천기·워크플로우의 기반) ──
if (process.argv.includes('--json')) {
  const penabled = Object.fromEntries(plugins.map(p => [p.short, p.enabled !== false]));
  const bySrc = {}; for (const it of uniq) bySrc[it.source] = (bySrc[it.source] || 0) + 1;
  const out = {
    version: '0.2.0',
    environment: { hasClaude: fs.existsSync(SKILLS), skillsPath: SKILLS, mirrorsFolded: mirrorFiles },
    counts: { total: uniq.length, ...bySrc, plugins: plugins.length, agents: agentCount },
    plugins: plugins.map(p => ({ name: p.short, enabled: p.enabled !== false, skillCount: p.count })),
    skills: uniq.map(it => ({
      id: it.source + ':' + it.name,
      name: it.name,
      source: it.source,
      description: it.desc || '',
      enabled: it.source in penabled ? penabled[it.source] : true,
      capabilities: capsOf(it.name),
    })),
    groups,
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// ---- 출력 ---- 출력 정책(무엇을 보여줄지)은 view-model 이, 문자열 변환은 render 가. scan 은 조립·출력만.
const isJudge = process.argv.includes('--judge');
const full = process.argv.includes('--all') || isJudge;          // 전체 벽(상세) 표시 여부
const by = {}; for (const it of uniq) by[it.source] = (by[it.source] || 0) + 1;
const noSavedFlows = !full && loadUser().length === 0;           // 저장된 '내 흐름' 0개 ('첫 실행'이 아니라 이 상태일 때 안내)

const report = buildHumanReport({ uniqCount: uniq.length, conflicts, by, mirrorFiles, covSorted, full, noSavedFlows });
console.log('\n' + renderReport(report) + '\n');

const packet = buildJudgePacket({ conflicts, isJudge });
if (packet) console.log(renderJudgePacket(packet));
