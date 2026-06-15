#!/usr/bin/env node
// Skills Manager — 관리 보조 (업데이트 점검 · 제거 잔여물 점검). **읽기 전용**.
// 이 스크립트는 탐지·분류만 한다. 어떤 파일도 쓰거나 지우지 않는다.
// 실제 정리(워크플로우 핀 제거)·폴더 삭제·플러그인 제거는 호출자(LLM)가
// 사용자 확인을 받은 뒤 기존 도구(scan.mjs --set-skill, 확인된 삭제, /plugin)로 수행한다.
//
// 사용법:
//   node manage-scan.mjs --update-status        설치 스킬의 업데이트 경로 분류(JSON)
//   node manage-scan.mjs --residue <스킬이름>    그 스킬이 박힌 잔여물 자리 전부 탐지(JSON)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const CLAUDE = path.join(os.homedir(), '.claude');
const SKILLS = path.join(CLAUDE, 'skills');

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
  const settings = readJSON(path.join(CLAUDE, 'settings.json')) || {};
  const plugins = Object.entries(settings.enabledPlugins || {}).map(([name, enabled]) => ({ name, enabled: !!enabled }));
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
    if (hits.length) add('워크플로우 사용자 핀', uwfPath, hits.join(' · ') + '  → scan.mjs --set-skill <흐름> --step <n> --skill none 으로 정리', '높음');
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
    const enabled = !!((settings && settings.enabledPlugins) || {})[owner.id];
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

const argVal = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };

if (process.argv.includes('--update-status')) {
  console.log(JSON.stringify(updateStatus(), null, 2));
} else if (process.argv.includes('--residue')) {
  const name = argVal('--residue');
  if (!name) { console.log(JSON.stringify({ error: '스킬 이름이 필요해요: --residue <스킬이름>' })); process.exit(1); }
  console.log(JSON.stringify(residue(name), null, 2));
} else {
  console.log('Skills Manager 관리 보조 (읽기 전용)');
  console.log('  node manage-scan.mjs --update-status        업데이트 경로 분류');
  console.log('  node manage-scan.mjs --residue <스킬이름>    제거 잔여물 자리 탐지');
}
