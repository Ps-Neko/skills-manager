#!/usr/bin/env node
// skillsweep (스킬쓸이) — slice1 검사관
// ~/.claude 의 스킬·에이전트·플러그인을 "읽기 전용"으로 훑어,
// 같은 일을 하는 스킬이 여러 출처에 겹쳐 깔린 걸 평한국어 지도로 보여준다.
// ⚠️ 아무것도 끄거나 지우지 않는다. 읽기만.
//   1단(키워드)으로 후보를 넓게 묶고, 2단 정밀 판정은 `--judge` 패킷을 LLM이 읽어서.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { saveWorkflow, removeWorkflow, loadUser, listAll, annotateMissing } from './workflow-store.mjs';

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
    console.log('\n사용: /skillsweep workflow <name> (실행 안내) · workflow save <name> (저장) · workflow delete <name>\n');
  }
  process.exit(0);
}

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
    const why = { 'invalid-name': '이름이 올바르지 않아요(영숫자·한글·-·_ 1~40자).', 'reserved': '내장 템플릿 이름이라 다른 이름을 쓰세요.' }[res.reason] || res.reason;
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

// gstack 가 9개 surface 폴더에 사본을 미러 → 접어서 안 센다
const SURFACE = new Set(['.cursor', '.factory', '.kiro', '.hermes', '.gbrain', '.slate', '.opencode', '.openclaw', '.agents']);
const IGNORE = new Set(['.git', '.github', 'node_modules', '.skill-janitor-archive', 'dist', 'bin']);

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
for (const e of fs.readdirSync(SKILLS, { withFileTypes: true })) {
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

// 시드 키워드 표 (1단 — 넓게. 정밀 분리는 --judge 2단)
const GROUPS = [
  { cap: 'tdd', label: '테스트 먼저 짜기 (TDD)', re: /(^|[-_])tdd($|[-_])|test-driven|red-green/i },
  { cap: 'review', label: '코드 리뷰', re: /code-review|requesting-code|receiving-code|review-and-quality|^review$/i },
  { cap: 'plan', label: '계획 세우기', re: /writing-plans|planning-and-task|task-breakdown|^plan$|^planning$/i },
  { cap: 'debug', label: '디버깅', re: /debug|diagnose|investigate|error-recovery/i },
  { cap: 'brainstorm', label: '아이디어/브레인스토밍', re: /brainstorm|idea-refine|ideate|office-hours|interview-me|grill/i },
  { cap: 'spec', label: '스펙 작성', re: /(^|[-_])spec($|[-_])|spec-driven/i },
  { cap: 'ship', label: '배포/출시', re: /(^|[-_])ship($|[-_])|deploy|launch|shipping/i },
  { cap: 'security', label: '보안 점검', re: /security|hardening|(^|[-_])cso($|[-_])/i },
  { cap: 'simplify', label: '코드 단순화', re: /simplif/i },
];

// 설정·도우미·내부 항목은 "기능 중복"이 아니다 → 후보에서 제외 (2단 루브릭 #4의 기계화)
const NOT_DUP = /^setup-|^_|-config$|configure/i;
const conflicts = [];
for (const g of GROUPS) {
  const hits = uniq.filter(it => g.re.test(it.name) && !NOT_DUP.test(it.name));
  const sources = [...new Set(hits.map(h => h.source))];
  if (hits.length >= 2 && sources.length >= 2) conflicts.push({ label: g.label, hits, sources });
}
// 출처별 "겹친 영역 커버 수" — 어느 묶음을 기본으로 둘지 정하는 근거(측정 가능한 사실)
const cov = {};
for (const c of conflicts) for (const s of c.sources) cov[s] = (cov[s] || 0) + 1;
const covSorted = Object.entries(cov).sort((a, b) => b[1] - a[1]);

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
    groups: GROUPS.map(g => {
      const hits = uniq.filter(it => g.re.test(it.name) && !NOT_DUP.test(it.name));
      if (!hits.length) return null;
      const sources = [...new Set(hits.map(h => h.source))];
      return { capability: g.cap, label: g.label, skills: hits.map(h => h.source + ':' + h.name), sources, duplicateLevel: sources.length >= 2 ? 'high' : 'none' };
    }).filter(Boolean),
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// ---- 출력 ----
const SRC_KO = { gstack: 'gstack', '.agents': '.agents(심링크)', user: '직접 설치', 'agent-skills': 'agent-skills', superpowers: 'superpowers', codex: 'codex', harness: 'harness', '외부': '외부 링크' };
const by = {}; for (const it of uniq) by[it.source] = (by[it.source] || 0) + 1;
const line = '─'.repeat(54);
console.log('\n🧹  스킬쓸이 (skillsweep) — 검사 결과   (읽기 전용 · 아무것도 끄지 않았어요)');
console.log(line);
console.log(`내 Claude 안에 깔린 스킬: 의미 단위로 약 ${uniq.length}개`);
console.log(`  · gstack 묶음            : ${by.gstack || 0}개  (도구용 사본 ${mirrorFiles}벌은 정상이라 접었어요)`);
if (by['.agents']) console.log(`  · .agents 묶음(심링크)   : ${by['.agents']}개  (~/.agents/skills 에 있는 걸 끌어다 씀)`);
console.log(`  · 직접 설치(독립)        : ${by.user || 0}개`);
console.log(`  · 플러그인               : ${plugins.length}개`);
for (const p of plugins) console.log(`       - ${p.short.padEnd(14)} ${p.enabled === false ? '꺼짐' : '켜짐'} · 스킬 ${p.count}개`);
console.log(`  · 에이전트               : ${agentCount}개`);
console.log(line);

if (conflicts.length === 0) {
  console.log('\n✅ 같은 일을 하는 스킬이 여러 개 겹친 곳은 없어요. 깔끔합니다.');
} else {
  console.log(`\n⚠️  같은 일을 하는 스킬이 여러 묶음에 겹쳐 있어요 — ${conflicts.length}군데:\n`);
  for (const c of conflicts) {
    console.log(`  • ${c.label} — ${c.hits.length}곳 (${c.sources.length}개 출처)`);
    for (const h of c.hits) console.log(`       · ${h.name}  (${SRC_KO[h.source] || h.source})`);
    console.log(`     → 같은 일이 여러 묶음에 있어요. (작업할 땐 이 중 하나만 쓰면 됩니다.)\n`);
  }
  console.log(line);
  console.log(`✅ 겹친 곳 ${conflicts.length}군데 — 작업할 땐 무리마다 하나씩만 쓰면 됩니다.`);
  console.log(`   (진짜 같은 일인지·역할만 다른지는 설명을 읽고 가려요)`);
  console.log(`\n어느 묶음을 '기본'으로 쓸지 정해두면, 같은 일은 늘 거기서 고르면 됩니다.`);
  console.log(`겹친 영역(${conflicts.length}개) 커버 — 많이 커버할수록 기본 후보:`);
  for (const [s, n] of covSorted) console.log(`   · ${(SRC_KO[s] || s).padEnd(16)} ${n}/${conflicts.length} 영역`);
  console.log(`   → '${SRC_KO[covSorted[0][0]] || covSorted[0][0]}' 가 가장 많이 커버해요. 단, 묶음마다 겹치지 않는 고유 스킬도 있으니 선택은 본인 몫.`);
  console.log(`\n※ 단, '끄기'는 대부분 안 돼요 — 겹친 게 플러그인 안에 있고, 플러그인은 통째로만 꺼지거든요`);
  console.log(`   (하나 끄려다 고유한 것까지 잃어요). 그래서 이 도구는 '보여주는 지도'까지만 합니다.`);
}
console.log(`\n이렇게 쓰세요:`);
console.log(`  /skillsweep                   — 겹친 스킬 지도 (지금 이거)`);
console.log(`  /skillsweep recommend "작업"   — 이 작업엔 어떤 순서로 뭘 쓸지`);
console.log(`  /skillsweep workflow list      — 저장한 흐름 보기`);
console.log(`  /skillsweep workflow save 이름  — 지금 흐름을 이름 붙여 저장\n`);

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
