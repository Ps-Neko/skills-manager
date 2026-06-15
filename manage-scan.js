#!/usr/bin/env node
// Skills Manager — 관리 보조 (업데이트 점검 · 잔여물 탐지 · standalone 스킬 제거).
// 탐지·분류(--update-status, --residue)는 읽기 전용이다.
// 유일한 쓰기 = --remove --confirm: **확인된** standalone 스킬 폴더를 휴지통으로 옮긴다(영구삭제 아님).
//   안전장치: realpath 로 ~/.claude/skills 직속 하위만 허용(심링크 탈출·경로 주입 방어),
//   기본은 dry-run(미리보기), --confirm <토큰> 일 때만 실행, 모든 제거를 감사 로그에 남긴다.
//   플러그인 안 스킬은 개별 삭제 불가 → 네이티브 /plugin 안내만. 워크플로우 핀 정리는 scan.js --set-skill.
//
// 사용법:
//   node manage-scan.js --update-status              설치 스킬의 업데이트 경로 분류(JSON, 읽기 전용)
//   node manage-scan.js --residue <스킬이름>          그 스킬이 박힌 잔여물 자리 전부 탐지(JSON, 읽기 전용)
//   node manage-scan.js --remove <스킬이름>           삭제 미리보기(dry-run) — 무엇이 휴지통으로 갈지 + 확인 토큰
//   node manage-scan.js --remove <스킬이름> --confirm <토큰>   확인된 제거(휴지통으로 이동)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { readEnabledPlugins } from './claude-env.js';

const CLAUDE = path.join(os.homedir(), '.claude');
const SKILLS = path.join(CLAUDE, 'skills');
const TRASH = path.join(CLAUDE, '.skills-manager-trash');
const REMOVAL_LOG = path.join(TRASH, 'removals.log.jsonl');

const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

// 활성 standalone 스킬 폴더만 (보관/휴지통/하위그룹 제외)
function listSkillDirs() {
  if (!isDir(SKILLS)) return [];
  return fs.readdirSync(SKILLS).filter(
    (n) => isDir(path.join(SKILLS, n)) && !n.startsWith('_') && n !== 'learned' && n !== 'imported',
  );
}

function gitInfo(dir) {
  if (!isDir(path.join(dir, '.git'))) return { isGit: false, remote: '' };
  let remote = '';
  try { remote = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim(); } catch {}
  return { isGit: true, remote };
}

// 플러그인 캐시(cache/<마켓>/<플러그인>/<버전>/skills/<스킬>)에서 이 스킬의 소속 플러그인을 찾는다.
function findOwningPlugin(skillFolderName) {
  const cache = path.join(CLAUDE, 'plugins', 'cache');
  if (!isDir(cache)) return null;
  for (const mkt of fs.readdirSync(cache)) {
    const mktDir = path.join(cache, mkt);
    if (!isDir(mktDir)) continue;
    for (const plugin of fs.readdirSync(mktDir)) {
      const pluginDir = path.join(mktDir, plugin);
      if (!isDir(pluginDir)) continue;
      for (const version of fs.readdirSync(pluginDir)) {
        const skillsDir = path.join(pluginDir, version, 'skills');
        if (!isDir(skillsDir)) continue;
        const siblings = fs.readdirSync(skillsDir).filter((s) => isDir(path.join(skillsDir, s)));
        if (siblings.includes(skillFolderName)) {
          return {
            id: `${plugin}@${mkt}`,
            plugin,
            marketplace: mkt,
            version,
            skillFolder: path.join(skillsDir, skillFolderName),
            siblingCount: siblings.length,
            siblingsLost: siblings.filter((s) => s !== skillFolderName),
          };
        }
      }
    }
  }
  return null;
}

function updateStatus() {
  const standalone = listSkillDirs().map((name) => {
    const g = gitInfo(path.join(SKILLS, name));
    return {
      name,
      kind: g.isGit ? 'git' : 'copy',
      updatable: g.isGit ? 'git-pull' : 'no-update-path',
      remote: g.remote,
    };
  });
  // 일반 스캔(scanner.js)과 같은 규칙으로 settings.json + settings.local.json 을 병합해 읽는다.
  const enabledMap = readEnabledPlugins(CLAUDE);
  const plugins = Object.entries(enabledMap).map(([name, enabled]) => ({ name, enabled: !!enabled }));
  const gitCount = standalone.filter((s) => s.kind === 'git').length;
  return {
    standalone,
    plugins,
    summary: {
      standaloneTotal: standalone.length,
      gitUpdatable: gitCount,
      noUpdatePath: standalone.length - gitCount,
      pluginNote: '플러그인은 Claude Code 기본 기능으로 업데이트: /plugin marketplace update',
    },
  };
}

function residue(target) {
  const surfaces = [];
  const add = (surface, p, detail, risk) => surfaces.push({ surface, path: p, detail, risk });

  // 1. 사용자 워크플로우 핀
  const uwfPath = path.join(CLAUDE, 'skills-manager-workflows.json');
  const uwf = readJSON(uwfPath);
  if (uwf && Array.isArray(uwf.workflows)) {
    const hits = [];
    for (const w of uwf.workflows) {
      (w.steps || []).forEach((s, i) => {
        if (s && typeof s.skill === 'string' && s.skill.includes(target)) {
          hits.push(`${w.name} ${i + 1}단계: ${s.skill}`);
        }
      });
    }
    if (hits.length) add('워크플로우 사용자 핀', uwfPath, hits.join(' · ') + '  → scan.js --set-skill <흐름> --step <n> --skill none 으로 정리', '높음');
  }

  // 2. 내장 워크플로우 템플릿 (step.skill 핀만 정확히 — 짧은 이름의 부분일치 오탐 방지)
  const bwfPath = path.join(SKILLS, 'skills-manager', 'workflows.json');
  const bwf = readJSON(bwfPath);
  if (bwf) {
    const wfs = Array.isArray(bwf) ? bwf : (bwf.workflows || []);
    const bhits = [];
    for (const w of wfs) (w.steps || []).forEach((s, i) => {
      if (s && typeof s.skill === 'string' && s.skill.includes(target)) bhits.push(`${w.name} ${i + 1}단계: ${s.skill}`);
    });
    if (bhits.length) add('내장 워크플로우 템플릿', bwfPath, bhits.join(' · ') + ' — 직접 편집(내장)', '중간');
  }

  // 3. ECC 무결성 원장
  const manPath = path.join(CLAUDE, 'gsd-file-manifest.json');
  const man = readJSON(manPath);
  if (man) {
    const files = man.files || man || {};
    const keys = Object.keys(files).filter((k) => k.includes(`skills/${target}/`) || k.includes(`skills\\${target}\\`));
    if (keys.length) add('ECC 무결성 원장', manPath, `${keys.length}개 항목 — ECC 갱신 절차로 재생성 권장(수동 편집 비권장)`, '중간');
  }

  // 4. 전역 설정
  const setPath = path.join(CLAUDE, 'settings.json');
  const settings = readJSON(setPath);
  if (settings) {
    const ep = Object.keys(settings.enabledPlugins || {}).filter((k) => k.includes(target));
    if (ep.length) add('전역 설정 enabledPlugins', setPath, ep.join(' · ') + ' — 플러그인 통제거 시 이 줄도 삭제', '중간');
    const blob = JSON.stringify(settings.hooks || {}) + JSON.stringify(settings.statusLine || {});
    if (blob.includes(target)) add('전역 설정 hooks/statusLine', setPath, '스크립트 경로에 이름 참조 — 스크립트 삭제 시 이 블록도', '중간');
  }

  // 5. 플러그인 레코드
  for (const f of ['installed_plugins.json', 'known_marketplaces.json', 'blocklist.json']) {
    const p = path.join(CLAUDE, 'plugins', f);
    const j = readJSON(p);
    if (j && JSON.stringify(j).includes(target)) add(`플러그인 레코드 (${f})`, p, '플러그인/마켓 통제거 시 해당 항목 정리', '중간');
  }

  // 6. 프로젝트 메모리 평문 언급
  const projectsDir = path.join(CLAUDE, 'projects');
  if (isDir(projectsDir)) {
    for (const proj of fs.readdirSync(projectsDir)) {
      const memDir = path.join(projectsDir, proj, 'memory');
      if (!isDir(memDir)) continue;
      const hits = [];
      for (const f of fs.readdirSync(memDir)) {
        if (!f.endsWith('.md')) continue;
        let txt = ''; try { txt = fs.readFileSync(path.join(memDir, f), 'utf8'); } catch {}
        if (txt.includes(target)) hits.push(f);
      }
      if (hits.length) add('프로젝트 메모리(평문 언급)', memDir, hits.join(' · ') + ' — 기능 영향 없음, 서술만 갱신(낡은 사실 보정)', '낮음');
    }
  }

  // 7. 스킬 실행 로그
  const runs = path.join(CLAUDE, 'state', 'skill-runs.jsonl');
  if (exists(runs)) {
    let txt = ''; try { txt = fs.readFileSync(runs, 'utf8'); } catch {}
    if (txt.includes(target)) add('스킬 실행 로그', runs, '과거 실행 줄에 이름 — 줄 단위 정리(선택)', '낮음');
  }

  // 폴더 위치 분류 (네임스페이스 'plugin:skill' 형태면 뒤만 폴더명으로)
  const folderName = target.includes(':') ? target.split(':').pop() : target;
  const dir = path.join(SKILLS, folderName);

  // (1) standalone 스킬 — 폴더 삭제로 개별 제거 가능
  if (isDir(dir)) {
    const isGit = isDir(path.join(dir, '.git'));
    return {
      target,
      location: exists(path.join(dir, '.provenance.json')) ? 'standalone(learned/imported)' : 'standalone',
      folder: dir,
      folderIsGit: isGit,
      removalGuide: { possible: true, how: `폴더 삭제(확인 후): ${dir}` + (isGit ? ' — git repo라 .git 포함 통폴더' : '') },
      surfaces,
    };
  }

  // (2) 플러그인 소속 스킬 — 개별 제거 불가, 현실적 선택지 안내
  const owner = findOwningPlugin(folderName);
  if (owner) {
    const enabled = !!readEnabledPlugins(CLAUDE)[owner.id];
    return {
      target,
      location: 'plugin',
      folder: null,
      owner: owner.id,
      removalGuide: {
        possible: false,
        reason: '플러그인 안 스킬은 개별 제거 불가(구조적 벽)',
        owningPlugin: owner.id,
        version: owner.version,
        enabled,
        siblingCount: owner.siblingCount,
        siblingsLostIfWholeRemove: owner.siblingsLost,
        options: [
          `통째 제거(깔끔·네이티브): /plugin uninstall ${owner.id} → 이 플러그인 스킬 ${owner.siblingCount}개 전부 사라짐(다른 ${owner.siblingsLost.length}개도 같이 잃음)`,
          `통째 끄기(제거 아님·되돌리기 쉬움): settings.json enabledPlugins["${owner.id}"]=false (또는 /plugin disable ${owner.id}) → ${owner.siblingCount}개 모두 숨김, 디스크엔 남음`,
          `그 스킬 폴더만 물리 삭제(비공식·깨지기 쉬움): ${owner.skillFolder} 삭제 → 그 1개만 빠지나, 플러그인 업데이트 때 되돌아올 수 있음`,
        ],
      },
      surfaces,
    };
  }

  // (3) 어디에도 없음
  return {
    target,
    location: 'missing',
    folder: null,
    removalGuide: { possible: false, reason: '설치된 스킬에서 못 찾음 — 이름 확인 필요' },
    surfaces,
  };
}

// ── standalone 스킬 제거(유일한 쓰기) ─────────────────────────────────────────
// 안전 검증: 대상은 반드시 ~/.claude/skills 의 **직속 하위 실제 디렉터리**여야 한다.
// realpath 로 심링크를 풀어 경계 밖(또는 심링크 대상)으로 새지 않는지 확인한다(경로 주입·심링크 탈출 방어).
// 제거 보호: 컨테이너 폴더(learned/imported)·관리 도구 자신·언더스코어(보관/비활성) 폴더는 통째 이동 금지.
// (learned/imported 의 개별 스킬은 한 단계 더 깊어 어차피 not-standalone 으로 거부되지만, 컨테이너 자체를 막아 대량 이동을 차단.)
const PROTECTED_REMOVE = new Set(['learned', 'imported', 'skills-manager']);

export function resolveStandaloneTarget(name) {
  const folderName = name.includes(':') ? name.split(':').pop() : name; // 'plugin:skill' 형태면 폴더명은 뒤쪽
  if (!folderName || folderName.includes('/') || folderName.includes('\\') || folderName.includes('..') || folderName.startsWith('.')) {
    return { ok: false, reason: 'bad-name' }; // 경로 문자·..·숨김(.) 이름 거부
  }
  if (folderName.startsWith('_') || PROTECTED_REMOVE.has(folderName)) {
    return { ok: false, reason: 'protected', folderName }; // 컨테이너·자기 자신·보관 폴더 보호
  }
  const dir = path.join(SKILLS, folderName);
  if (!isDir(dir)) return { ok: false, reason: 'not-standalone', folderName };
  let realSkills, realTarget;
  try { realSkills = fs.realpathSync(SKILLS); realTarget = fs.realpathSync(dir); }
  catch { return { ok: false, reason: 'resolve-failed', folderName }; }
  // 직속 하위만 허용: realpath 의 부모가 정확히 realSkills (심링크면 대상이 밖이라 여기서 걸림 → 거부).
  if (path.dirname(realTarget) !== realSkills || realTarget === realSkills) {
    return { ok: false, reason: 'outside-skills', folderName, realTarget, realSkills };
  }
  return { ok: true, folderName, dir, realTarget };
}

// 제거 수행. confirm 없으면 dry-run(미리보기). confirm===토큰(=폴더명)일 때만 휴지통으로 이동.
export function removeStandalone(name, { confirm } = {}) {
  const t = resolveStandaloneTarget(name);
  if (!t.ok) return t;
  const token = t.folderName;                 // 확인 토큰 = 폴더명(이름을 그대로 다시 입력해 확인 — 결정적)
  const isGit = isDir(path.join(t.dir, '.git'));
  const res = residue(name);                  // 잔여물 미리보기(읽기 전용)
  if (confirm == null) {
    return { ok: true, mode: 'dry-run', target: name, folder: t.dir, isGit, willMoveTo: TRASH, confirmToken: token, residue: res.surfaces };
  }
  if (confirm !== token) return { ok: false, reason: 'token-mismatch', expected: token };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let dest;
  try {
    fs.mkdirSync(TRASH, { recursive: true });
    dest = path.join(TRASH, `${stamp}-${t.folderName}`);
    for (let n = 1; fs.existsSync(dest); n++) dest = path.join(TRASH, `${stamp}-${t.folderName}-${n}`); // 같은 ms 충돌 회피(덮어쓰기 금지)
    fs.renameSync(t.dir, dest);              // 영구삭제가 아니라 휴지통으로 이동(복구 가능)
  } catch (e) {
    return { ok: false, reason: 'move-failed', error: e.message };
  }
  let logged = true;
  try { fs.appendFileSync(REMOVAL_LOG, JSON.stringify({ ts: stamp, action: 'remove', skill: name, from: t.dir, to: dest }) + '\n'); } catch { logged = false; }
  return { ok: true, mode: 'removed', target: name, from: t.dir, to: dest, logged, residue: res.surfaces };
}

const argVal = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };

if (process.argv.includes('--update-status')) {
  console.log(JSON.stringify(updateStatus(), null, 2));
} else if (process.argv.includes('--residue')) {
  const name = argVal('--residue');
  if (!name) { console.log(JSON.stringify({ error: '스킬 이름이 필요해요: --residue <스킬이름>' })); process.exit(1); }
  console.log(JSON.stringify(residue(name), null, 2));
} else if (process.argv.includes('--remove')) {
  const name = argVal('--remove');
  if (!name) { console.log(JSON.stringify({ error: '스킬 이름이 필요해요: --remove <스킬이름> [--confirm <토큰>]' })); process.exit(1); }
  const where = residue(name);
  if (where.location === 'plugin') {          // 플러그인 안 스킬은 코드로 못 지움 — 네이티브 안내만
    console.log(JSON.stringify({ ok: false, location: 'plugin', reason: '플러그인 안 스킬은 개별 삭제 불가. /plugin uninstall 로 통째 제거하세요.', removalGuide: where.removalGuide }, null, 2));
    process.exit(1);
  }
  const confirm = process.argv.includes('--confirm') ? (argVal('--confirm') ?? '') : null;
  const out = removeStandalone(name, { confirm });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
} else {
  console.log('Skills Manager 관리 보조');
  console.log('  node manage-scan.js --update-status              업데이트 경로 분류 (읽기 전용)');
  console.log('  node manage-scan.js --residue <스킬이름>          제거 잔여물 자리 탐지 (읽기 전용)');
  console.log('  node manage-scan.js --remove <스킬이름>           삭제 미리보기(dry-run)');
  console.log('  node manage-scan.js --remove <스킬이름> --confirm <토큰>   확인된 제거(휴지통 이동)');
}
