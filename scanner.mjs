// scanner.mjs — ~/.claude 의 스킬·플러그인·에이전트를 "읽기 전용"으로 훑어 인벤토리를 모은다.
// fs 만 쓰고 process·출력은 안 한다. 경로를 인자로 받아 테스트에서 제어 가능하게.

import fs from 'node:fs';
import path from 'node:path';

// gstack 가 9개 surface 폴더에 사본을 미러 → 접어서 안 센다
const SURFACE = new Set(['.cursor', '.factory', '.kiro', '.hermes', '.gbrain', '.slate', '.opencode', '.openclaw', '.agents']);
const IGNORE = new Set(['.git', '.github', 'node_modules', '.skill-janitor-archive', '.skills-manager-archive', 'dist', 'bin']);

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

// 인벤토리 수집 → { uniq, plugins, agentCount, mirrorFiles }. uniq = 중복 제거한 {name, source, desc}[].
export function scanInventory({ SKILLS, CLAUDE, PLUGINS, AGENTS }) {
  let mirrorFiles = 0;
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
  try { agentCount = fs.readdirSync(AGENTS).filter((f) => f.endsWith('.md')).length; } catch {}

  // dedupe
  const seen = new Set();
  const uniq = items.filter((it) => { const k = it.source + '|' + it.name; if (seen.has(k)) return false; seen.add(k); return true; });

  return { uniq, plugins, agentCount, mirrorFiles };
}
