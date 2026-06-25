// cli-runner.js — 허용된 CLI 액션만 실행하는 allowlist 러너 (execFile식, 셸 미사용, 명령 주입 불가).
// 타임아웃·비정상출력·stderr를 구조화된 에러로 돌려 프론트가 사용자 문구+raw 로그로 나눠 보여줄 수 있게.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
const SCAN = join(ROOT, 'scan.js');
const MANAGE = join(ROOT, 'manage-scan.js');
const BASELINE = join(ROOT, 'baseline');
export const FIXTURE = !!process.env.SMW_FIXTURE;
const TIMEOUT = Number(process.env.SMW_TIMEOUT || 30000); // 느린 스캔 방어
const MAX_OUTPUT = Number(process.env.SMW_MAX_OUTPUT || 16 * 1024 * 1024); // 16MB — 비정상 대량 출력 방어

// 폴더명 한 토막 검증(콜론 불가). 파괴적 remove 경로의 계약:
//   웹은 ~/.claude/skills 직속의 **standalone 폴더명만** 받는다.
//   플러그인 스킬('plugin:skill')은 웹에서 제거할 수 없다(네이티브 /plugin uninstall 전용) →
//   manage-scan.js 의 --remove 는 'plugin:skill' 을 받아도 split 한 뒤 'not-standalone/plugin'
//   으로 거부하므로, 애초에 콜론이 파괴적 경로로 새지 않도록 입구에서 막는다.
const SKILL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const validSkill = (n) => typeof n === 'string' && SKILL_RE.test(n) && !n.includes('..');

// 잔여물 탐지(--residue)는 **읽기 전용**이라 파괴적 영향이 없다. residue 는 'plugin:skill'
// 네임스페이스를 받아 플러그인 소속까지 탐지하도록 설계됐으므로(manage-scan.js findOwningPlugin),
// 이 경로에 한해 콜론 1개를 안전하게 허용한다(remove 경로는 위 validSkill 로 보수적 유지).
//   허용 형태: '폴더명' 또는 '플러그인:스킬'(양쪽 모두 SKILL_RE 토큰, 콜론은 정확히 1개).
const validResidueTarget = (n) => {
  if (typeof n !== 'string' || n.includes('..')) return false;
  const parts = n.split(':');
  return (parts.length === 1 || parts.length === 2) && parts.every((p) => SKILL_RE.test(p));
};

function run(script, args) {
  return new Promise((resolve, reject) => {
    let out = '', err = '', done = false;
    const child = spawn(process.execPath, [script, ...args], { cwd: ROOT });
    const fail = (msg, extra) => { if (done) return; done = true; clearTimeout(timer); reject(Object.assign(new Error(msg), extra)); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); fail('스캔이 너무 오래 걸려 중단했어요. 스킬이 매우 많거나 디스크가 느릴 수 있어요.', { code: 'timeout' }); }, TIMEOUT);
    const overflow = () => { child.kill('SIGKILL'); fail('CLI 출력이 너무 커서 중단했어요(비정상 출력 방어).', { code: 'output-too-large' }); };
    child.stdout.on('data', (d) => { out += d; if (out.length > MAX_OUTPUT) overflow(); });
    child.stderr.on('data', (d) => { err += d; if (err.length > MAX_OUTPUT) overflow(); });
    child.on('error', (e) => fail('CLI를 실행하지 못했어요: ' + e.message, { code: 'spawn-failed' }));
    child.on('close', (exit) => {
      if (done) return; done = true; clearTimeout(timer);
      try { resolve(JSON.parse(out)); }
      catch (e) { reject(Object.assign(new Error(err.trim() || ('CLI 출력을 읽지 못했어요: ' + e.message)), { code: 'bad-output', exit, stderr: err.trim().slice(0, 2000) })); }
    });
  });
}
const fx = async (name) => JSON.parse(await readFile(join(BASELINE, name), 'utf8'));
const demoResidue = (skill) => ({ target: skill, surfaces: [
  { surface: '워크플로우 사용자 핀', path: '~/.claude/skills-manager-workflows.json', detail: `${skill} 참조`, risk: '낮음' },
  { surface: '설치 폴더', path: `~/.claude/skills/${skill}`, detail: 'git 복제본', risk: '보통' },
] });
const demoRemove = (skill, token) => token
  ? { ok: true, mode: 'removed', target: skill, to: '~/.claude/.skills-trash/' + skill, logged: true }
  : { ok: true, mode: 'dry-run', target: skill, willMoveTo: '~/.claude/.skills-trash/', confirmToken: 'demo-' + Buffer.from(skill).toString('hex').slice(0, 10), residue: demoResidue(skill).surfaces };

export const cli = {
  scan: () => FIXTURE ? fx('scan.json') : run(SCAN, ['--json']),
  workflows: () => FIXTURE ? fx('workflows.json') : run(SCAN, ['--workflows', '--json']),
  manageStatus: () => FIXTURE ? fx('manage.json') : run(MANAGE, ['--update-status']),
  // 읽기 전용 — 'plugin:skill' 네임스페이스 허용(플러그인 소속 잔여물까지 탐지).
  residue: (skill) => { if (!validResidueTarget(skill)) throw new Error('bad-skill'); return FIXTURE ? Promise.resolve(demoResidue(skill)) : run(MANAGE, ['--residue', skill]); },
  // 파괴적 — standalone 폴더명만(콜론 불가). 플러그인 스킬은 웹에서 제거 불가 → 네이티브 /plugin uninstall.
  removePreview: (skill) => { if (!validSkill(skill)) throw new Error('bad-skill(폴더명만: 플러그인 스킬은 /plugin uninstall)'); return FIXTURE ? Promise.resolve(demoRemove(skill, null)) : run(MANAGE, ['--remove', skill]); },
  removeConfirm: (skill, token) => { if (!validSkill(skill)) throw new Error('bad-skill(폴더명만: 플러그인 스킬은 /plugin uninstall)'); if (typeof token !== 'string' || !token) throw new Error('bad-token'); return FIXTURE ? Promise.resolve(demoRemove(skill, token)) : run(MANAGE, ['--remove', skill, '--confirm', token]); },
};
