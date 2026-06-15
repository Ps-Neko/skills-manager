// scanner.js — ~/.claude 의 스킬·플러그인·에이전트를 "읽기 전용"으로 훑어 인벤토리를 모은다.
// fs 만 쓰고 process·출력은 안 한다. 경로를 인자로 받아 테스트에서 제어 가능하게.

import fs from 'node:fs';
import path from 'node:path';
import { readEnabledPlugins } from './claude-env.js';

// gstack 가 9개 surface 폴더에 사본을 미러 → 접어서 안 센다
const SURFACE = new Set(['.cursor', '.factory', '.kiro', '.hermes', '.gbrain', '.slate', '.opencode', '.openclaw', '.agents']);
const IGNORE = new Set(['.git', '.github', 'node_modules', '.skill-janitor-archive', '.skills-manager-archive', 'dist', 'bin']);

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } }; // statSync = 심링크 따라감

// frontmatter 에서 name·description 을 읽는다(의존성 0 최소 파서).
// 단일행 값은 물론, 흔한 여러 줄 description — YAML block scalar(>, |)와 값이 빈 채
// 다음 줄들이 들여써진 경우 — 까지 잇는다. 따옴표 안 콜론("foo: bar")도 안전.
export function readFM(file) {
  let t; try { t = fs.readFileSync(file, 'utf8'); } catch { return {}; }
  const m = t.match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const lines = m[1].split(/\r?\n/);
  const indented = (l) => /^\s+\S/.test(l);
  const grab = (key) => {
    for (let i = 0; i < lines.length; i++) {
      const mm = lines[i].match(new RegExp('^' + key + ':[ \\t]*(.*)$'));
      if (!mm) continue;
      const val = mm[1];
      // block scalar(>, | + 선택적 chomping)면 뒤따르는 들여쓴 줄들을 모아 한 문장으로.
      if (/^[|>][+-]?\s*$/.test(val.trim())) {
        const block = [];
        for (let j = i + 1; j < lines.length && (indented(lines[j]) || lines[j].trim() === ''); j++) block.push(lines[j].trim());
        return block.join(' ').replace(/\s+/g, ' ').trim();
      }
      // 값이 비고 다음 줄들이 들여써 있으면(드묾) 그 줄들을 잇는다.
      if (val.trim() === '') {
        const block = [];
        for (let j = i + 1; j < lines.length && indented(lines[j]); j++) block.push(lines[j].trim());
        if (block.length) return block.join(' ').replace(/\s+/g, ' ').trim();
      }
      return val;
    }
    return undefined;
  };
  const clean = (s) => (s ? String(s).trim().replace(/^["']|["']$/g, '').trim() : '');
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
  // enabledPlugins 는 claude-env 의 공유 리더로 — manage-scan 과 같은 규칙(settings + local 병합).
  const enabled = readEnabledPlugins(CLAUDE);
  const plugins = [];
  try {
    const ip = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'installed_plugins.json'), 'utf8'));
    const keys = Object.keys(ip.plugins || {});
    // 출처 라벨은 보통 short(키의 @앞)지만, 같은 short 가 다른 마켓에서 둘 이상 들어오면
    // 합쳐져 보이는 버그가 난다 → 그 경우에만 마켓을 붙여 구분(충돌 없으면 깔끔한 short 그대로).
    const shortCount = {};
    for (const key of keys) { const s = key.split('@')[0]; shortCount[s] = (shortCount[s] || 0) + 1; }
    const labelOf = (key) => { const [short, market] = key.split('@'); return shortCount[short] > 1 && market ? `${short}@${market}` : short; };
    for (const key of keys) {
      const short = key.split('@')[0];
      const label = labelOf(key);
      const inst = ip.plugins[key]?.[0]?.installPath;
      const pmap = new Map();
      if (inst && fs.existsSync(inst)) {
        (function collect(d) { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.isDirectory()) { if (SURFACE.has(e.name) || IGNORE.has(e.name)) continue; collect(path.join(d, e.name)); } else if (e.name === 'SKILL.md') { const fm = readFM(path.join(d, 'SKILL.md')); const nm = fm.name || path.basename(d); if (!pmap.has(nm)) pmap.set(nm, fm.description || ''); } } })(inst);
      }
      plugins.push({ key, short, label, enabled: enabled[key], count: pmap.size });
      for (const [nm, d] of pmap) items.push({ name: nm, source: label, desc: d });
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
