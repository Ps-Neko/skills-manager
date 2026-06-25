// serve.js — Skills Manager 웹 UI 로컬 도우미 (의존성 0, ESM)
//
// 왜 필요한가: 브라우저는 보안상 ~/.claude 스킬 폴더를 직접 못 읽는다.
// 그래서 이 작은 서버가 기존 scan.js / manage-scan.js 를 돌려, 그 "결과(JSON)만" 웹 화면에 넘겨준다.
// 읽기 전용 — 아무것도 바꾸지 않는다. 127.0.0.1(이 PC) 에만 열려 외부 노출이 없다.
//
// 쓰는 법:  node serve.js          (서버 켜고 브라우저 자동 열기)
//          node serve.js --check  (스스로 점검하고 종료 — 스모크 테스트)
//          SM_FIXTURE=1 node serve.js  (테스트/데모용 — baseline/ 스냅샷을 대신 내보냄)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, 'web');
const SCAN = join(HERE, 'scan.js');
const MANAGE = join(HERE, 'manage-scan.js');
const PORT = 4178;
const HOST = '127.0.0.1'; // 로컬 전용 — 0.0.0.0 금지(외부에서 검사기 실행 = 위험)

// 테스트/데모 모드: ~/.claude 가 없는 곳에서도 화면을 확인할 수 있게 baseline/ 스냅샷을 내보낸다.
const FIXTURE = !!process.env.SM_FIXTURE;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// 기존 검사 스크립트를 자식 프로세스로 돌려 JSON 결과를 받는다(읽기 전용 호출만).
function runJson(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: HERE });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', () => {
      try { resolve(JSON.parse(out)); }
      catch (e) { reject(new Error('검사 결과를 읽지 못했어요: ' + (err.trim() || e.message))); }
    });
  });
}

// FIXTURE 모드에선 baseline/ 의 스냅샷 파일을 그대로 읽어 돌려준다.
async function fixture(name) {
  return JSON.parse(await readFile(join(HERE, 'baseline', name), 'utf8'));
}

// 허용된 검사 명령만 화이트리스트로 노출(임의 인자 주입 차단). 전부 읽기 전용.
const API = {
  '/api/scan':      () => FIXTURE ? fixture('scan.json')      : runJson(SCAN, ['--json']),
  '/api/workflows': () => FIXTURE ? fixture('workflows.json') : runJson(SCAN, ['--workflows', '--json']),
  '/api/manage':    () => FIXTURE ? fixture('manage.json')    : runJson(MANAGE, ['--update-status']),
};

async function serveStatic(url, res) {
  let rel = decodeURIComponent((url || '/').split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = normalize(join(WEB, rel));
  // 경로 탈출 방어: web 폴더 밖이면 거부
  if (full !== WEB && !full.startsWith(WEB + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }
  try {
    const buf = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(full).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

function buildServer() {
  return createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0];
    try {
      if (API[path]) {
        const data = await API[path]();
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }
      await serveStatic(req.url, res);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: String((e && e.message) || e) }));
    }
  });
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); }
  catch { /* 브라우저 자동 열기 실패는 치명적이지 않음 */ }
}

async function smokeCheck() {
  const server = buildServer();
  await new Promise((r) => server.listen(PORT, HOST, r));
  const base = `http://${HOST}:${PORT}`;
  let ok = true;
  try {
    const home = await fetch(base + '/');
    const homeOk = home.status === 200 && (await home.text()).includes('Skills Manager');
    console.log(`/              -> ${home.status} ${homeOk ? 'OK' : 'FAIL'}`);

    const scan = await fetch(base + '/api/scan');
    const j = await scan.json();
    const scanOk = scan.status === 200 && j && j.counts && Array.isArray(j.groups);
    console.log(`/api/scan      -> ${scan.status} ${scanOk ? `OK (skills ${j.counts.total} / groups ${j.groups.length})` : 'FAIL'}`);

    const wf = await fetch(base + '/api/workflows');
    const wj = await wf.json();
    const wfOk = wf.status === 200 && wj && Array.isArray(wj.workflows);
    console.log(`/api/workflows -> ${wf.status} ${wfOk ? `OK (flows ${wj.workflows.length})` : 'FAIL'}`);

    const mg = await fetch(base + '/api/manage');
    const mj = await mg.json();
    const mgOk = mg.status === 200 && mj && mj.summary && Array.isArray(mj.standalone);
    console.log(`/api/manage    -> ${mg.status} ${mgOk ? `OK (standalone ${mj.standalone.length} / git ${mj.summary.gitUpdatable})` : 'FAIL'}`);

    const trav = await fetch(base + '/%2e%2e%2fpackage.json'); // 경로탈출 시도
    const travOk = trav.status === 403 || trav.status === 404;
    console.log(`path-escape    -> ${trav.status} ${travOk ? 'OK' : 'FAIL'}`);

    ok = homeOk && scanOk && wfOk && mgOk && travOk;
  } catch (e) {
    console.log('check error:', e.message);
    ok = false;
  }
  await new Promise((r) => server.close(r));
  return ok;
}

if (process.argv.includes('--check')) {
  smokeCheck().then((ok) => process.exit(ok ? 0 : 1));
} else {
  const server = buildServer();
  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}/`;
    const mode = FIXTURE ? '  (스냅샷/데모 모드 — baseline/ 사용)' : '';
    console.log(`\n  Skills Manager 웹 UI 가 켜졌어요.${mode}\n  브라우저에서 열기: ${url}\n  끄기: 이 창에서 Ctrl+C\n`);
    openBrowser(url);
  });
}
