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
import { saveWorkflow, removeWorkflow, loadUser, listAll, annotateMissing, setStepSkill, resolveSteps, CAP_LABEL } from './workflow-store.mjs';

const argAfter = (flag) => process.argv[process.argv.indexOf(flag) + 1];

// 한글/CJK 는 터미널 폭 2 → 표 칸 정렬용 표시폭 기준 우측 패딩.
const isWide = (cp) => (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) || (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFF00 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6);
const dispWidth = (s) => [...s].reduce((w, ch) => w + (isWide(ch.codePointAt(0)) ? 2 : 1), 0);
const padW = (s, w) => s + ' '.repeat(Math.max(1, w - dispWidth(s)));

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
  if (!raw.trim()) { console.log('저장 실패: stdin 이 비어 있어요. 워크플로우 JSON 을 파이프로 넘겨 주세요.'); process.exit(1); }
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

// gstack 가 9개 surface 폴더에 사본을 미러 → 접어서 안 센다
const SURFACE = new Set(['.cursor', '.factory', '.kiro', '.hermes', '.gbrain', '.slate', '.opencode', '.openclaw', '.agents']);
const IGNORE = new Set(['.git', '.github', 'node_modules', '.skill-janitor-archive', '.skills-manager-archive', 'dist', 'bin']);

let mirrorFiles = 0;

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } }; // statSync = 심링크 따라감

function readFM(file) {
  let t; try { t = fs.readFileSync(file, 'utf8'); } catch { return {}; }
  const m = t.match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = m[1];
  const grab = (k) => (fm.match(new RegExp('^' + k + ':\\s*(.+)$', 'm')) || [])[1];
  const clean = (s) => (s ? s.trim().replace(/^["']|["']$/g, '').trim() : '');
  return { name: clean(grab('name')), description: clean(grab('description')) };
}

function countSkillMd(dir) {
  let n = 0;
  (function w(d) { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.isDirectory()) w(path.join(d, e.name)); else if (e.name === 'SKILL.md') n++; } })(dir);
  return n;
}

// 심링크 대상 위치로 출처 라벨 추정
function sourceFromLink(target) {
  const t = target.replace(/\//g, '\\').toLowerCase();
  if (t.includes('\\.agents\\')) return '.agents';
  if (t.includes('\\skills\\gstack\\')) return 'gstack';
  if (t.includes('\\.claude\\')) return 'user';
  return '외부';
}

const items = []; // {name, source, desc}

// (1) gstack 깊이1 이름(= 최상위에 평평히 깐 것의 원본). 번들/중첩 사본은 안 센다. 미러는 카운트만.
const gstackDir = path.join(SKILLS, 'gstack');
const gstackNames = new Set();
if (fs.existsSync(gstackDir)) {
  for (const e of fs.readdirSync(gstackDir, { withFileTypes: true })) {
    if (!e.name.startsWith('.') && !IGNORE.has(e.name) && isDir(path.join(gstackDir, e.name)) && fs.existsSync(path.join(gstackDir, e.name, 'SKILL.md'))) gstackNames.add(e.name);
  }
  for (const s of SURFACE) { const d = path.join(gstackDir, s); if (fs.existsSync(d)) mirrorFiles += countSkillMd(d); }
}

// (2) 최상위 스킬 (심링크 포함). 출처: gstack 깐 것 / .agents 심링크 / 직접 독립
for (const e of (fs.existsSync(SKILLS) ? fs.readdirSync(SKILLS, { withFileTypes: true }) : [])) {
  if (e.name === 'gstack' || SURFACE.has(e.name) || IGNORE.has(e.name)) continue;
  const full = path.join(SKILLS, e.name);
  if (!isDir(full)) continue;                 // 심링크-디렉터리도 statSync로 true
  const sk = path.join(full, 'SKILL.md');
  if (!fs.existsSync(sk)) continue;
  const fm = readFM(sk);
  const nm = fm.name || e.name;
  let source;
  if (gstackNames.has(e.name)) source = 'gstack';
  else if (e.isSymbolicLink()) { try { source = sourceFromLink(fs.readlinkSync(full)); } catch { source = 'user'; } }
  else source = 'user';
  items.push({ name: nm, source, desc: fm.description });
}

// (3) 플러그인 (installed_plugins.json 의 installPath = 진실원)
const enabled = {};
for (const f of ['settings.json', 'settings.local.json']) {
  try { const j = JSON.parse(fs.readFileSync(path.join(CLAUDE, f), 'utf8')); Object.assign(enabled, j.enabledPlugins || {}); } catch {}
}
const plugins = [];
try {
  const ip = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'installed_plugins.json'), 'utf8'));
  for (const key of Object.keys(ip.plugins || {})) {
    const short = key.split('@')[0];
    const inst = ip.plugins[key]?.[0]?.installPath;
    const pmap = new Map();
    if (inst && fs.existsSync(inst)) {
      (function collect(d) { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.isDirectory()) { if (SURFACE.has(e.name) || IGNORE.has(e.name)) continue; collect(path.join(d, e.name)); } else if (e.name === 'SKILL.md') { const fm = readFM(path.join(d, 'SKILL.md')); const nm = fm.name || path.basename(d); if (!pmap.has(nm)) pmap.set(nm, fm.description || ''); } } })(inst);
    }
    plugins.push({ key, short, enabled: enabled[key], count: pmap.size });
    for (const [nm, d] of pmap) items.push({ name: nm, source: short, desc: d });
  }
} catch {}

// (4) agents
let agentCount = 0;
try { agentCount = fs.readdirSync(AGENTS).filter(f => f.endsWith('.md')).length; } catch {}

// dedupe
const seen = new Set();
const uniq = items.filter(it => { const k = it.source + '|' + it.name; if (seen.has(k)) return false; seen.add(k); return true; });

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
    process.exit(1);
  }
  console.log(`고쳤어요: ${name}의 ${stepNum}단계(${res.capability}) 스킬을 '${res.skill ?? '비움'}'로 설정.`);
  process.exit(0);
}

// 시드 키워드 표 (1단 — 넓게. 정밀 분리는 --judge 2단). 라벨은 CAP_LABEL 단일 출처에서.
const GROUPS = [
  { cap: 'tdd', label: CAP_LABEL.tdd, re: /(^|[-_])tdd($|[-_])|test-driven|red-green/i },
  { cap: 'review', label: CAP_LABEL.review, re: /code-review|requesting-code|receiving-code|review-and-quality|^review$/i },
  { cap: 'plan', label: CAP_LABEL.plan, re: /writing-plans|planning-and-task|task-breakdown|^plan$|^planning$/i },
  { cap: 'debug', label: CAP_LABEL.debug, re: /debug|diagnose|investigate|error-recovery/i },
  { cap: 'brainstorm', label: CAP_LABEL.brainstorm, re: /brainstorm|idea-refine|ideate|office-hours|interview-me|grill/i },
  { cap: 'spec', label: CAP_LABEL.spec, re: /(^|[-_])spec($|[-_])|spec-driven/i },
  { cap: 'ship', label: CAP_LABEL.ship, re: /(^|[-_])ship($|[-_])|deploy|launch|shipping/i },
  { cap: 'security', label: CAP_LABEL.security, re: /security|hardening|(^|[-_])cso($|[-_])/i },
  { cap: 'simplify', label: CAP_LABEL.simplify, re: /simplif/i },
];

// 설정·도우미·내부 항목은 "기능 중복"이 아니다 → 후보에서 제외 (2단 루브릭 #4의 기계화)
const NOT_DUP = /^setup-|^_|-config$|configure/i;
// 한 그룹의 후보 스킬 — conflicts(사람용/--judge)와 groups(--json/--workflows) 가 같은 식을 쓰게 단일화.
const hitsForGroup = (g) => uniq.filter((it) => g.re.test(it.name) && !NOT_DUP.test(it.name));
const conflicts = [];
for (const g of GROUPS) {
  const hits = hitsForGroup(g);
  const sources = [...new Set(hits.map(h => h.source))];
  if (hits.length >= 2 && sources.length >= 2) conflicts.push({ label: g.label, hits, sources });
}
// 출처별 "겹친 영역 커버 수" — 어느 묶음을 기본으로 둘지 정하는 근거(측정 가능한 사실)
const cov = {};
for (const c of conflicts) for (const s of c.sources) cov[s] = (cov[s] || 0) + 1;
const covSorted = Object.entries(cov).sort((a, b) => b[1] - a[1]);

// groups: capability→스킬 묶음(=--json 의 groups). --json 과 --workflows 가 공유.
const groupsByCap = {};
const groups = GROUPS.map((g) => {
  const hits = hitsForGroup(g);
  if (!hits.length) return null;
  const sources = [...new Set(hits.map((h) => h.source))];
  const entry = { capability: g.cap, label: g.label, skills: hits.map((h) => h.source + ':' + h.name), sources, duplicateLevel: sources.length >= 2 ? 'high' : 'none' };
  groupsByCap[g.cap] = entry;
  return entry;
}).filter(Boolean);

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
  const capsOf = (name) => GROUPS.filter(g => g.re.test(name) && !NOT_DUP.test(name)).map(g => g.cap);
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

// ── 2단 판정 패킷 (LLM이 설명 읽고 진짜 중복 가려내기) ──
if (process.argv.includes('--judge') && conflicts.length) {
  const cut = (s) => (s || '(설명 없음)').replace(/\s+/g, ' ').slice(0, 90);
  console.log('────── 판정 패킷 (2단: 설명 읽고 진짜 중복 가려내기) ──────\n');
  for (const c of conflicts) {
    console.log(`[${c.label}]`);
    for (const h of c.hits) console.log(`  - ${h.name} (${SRC_KO[h.source] || h.source}): ${cut(h.desc)}`);
    console.log('');
  }
}
