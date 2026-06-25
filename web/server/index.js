// index.js — Skills Manager 로컬 콘솔 API 서버 (node:http, 의존성 0).
// 127.0.0.1 전용. /api/* 는 allowlist 액션만 실행(cli-runner), 그 외는 빌드된 React 앱(app/dist)을 서빙.
import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { FIXTURE } from './cli-runner.js';
import statusR from './routes/status.js';
import scanR from './routes/scan.js';
import wfR from './routes/workflows.js';
import manageR from './routes/manage.js';
import auditR from './routes/audit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'app', 'dist');
const PORT = Number(process.env.PORT || 5179);
const HOST = '127.0.0.1';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff2':'font/woff2', '.png':'image/png' };

const routes = [...statusR, ...scanR, ...wfR, ...manageR, ...auditR].map((r) => ({
  ...r, re: new RegExp('^' + r.path.replace(/:[^/]+/g, '([^/]+)') + '$'),
  keys: (r.path.match(/:[^/]+/g) || []).map((k) => k.slice(1)),
}));

function readBody(req) { return new Promise((resolve) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } }); }); }

async function handleApi(req, res, path) {
  const route = routes.find((r) => r.method === req.method && r.re.test(path));
  if (!route) { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'not-found' })); return; }
  const m = path.match(route.re); const params = {}; route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
  const body = req.method === 'POST' ? await readBody(req) : null;
  try { const data = await route.handler(params, body); res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
  catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
}

async function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]); if (rel === '/' || rel === '') rel = '/index.html';
  let full = normalize(join(DIST, rel));
  if (full !== DIST && !full.startsWith(DIST + sep)) { res.writeHead(403); res.end('forbidden'); return; }
  if (!existsSync(full)) full = join(DIST, 'index.html'); // SPA fallback
  const cache = rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'; // 해시 박힌 번들만 영구 캐시
  try { const buf = await readFile(full); res.writeHead(200, { 'content-type': MIME[extname(full).toLowerCase()] || 'application/octet-stream', 'cache-control': cache }); res.end(buf); }
  catch { res.writeHead(existsSync(DIST) ? 404 : 200, { 'content-type': 'text/html; charset=utf-8' }); res.end(existsSync(DIST) ? 'not found' : '<h1>Skills Manager API</h1><p>프론트(app/dist)가 아직 빌드되지 않았어요. <code>npm --prefix web/app run build</code> 후 새로고침하세요. API는 /api/status 에서 동작 중입니다.</p>'); }
}

export function buildServer() {
  return createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0];
    try { if (path.startsWith('/api/')) return await handleApi(req, res, path); await serveStatic(res, req.url || '/'); }
    catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
  });
}
function openBrowser(url) { const [c, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]; try { spawn(c, a, { detached: true, stdio: 'ignore' }).unref(); } catch {} }

if (process.argv.includes('--check')) {
  if (!FIXTURE) {
    console.error('--check 는 데모 모드(SMW_FIXTURE)에서만 실행할 수 있어요.\n  실데이터에서 돌리면 remove-confirm 점검 단계가 실제 스킬 폴더를 휴지통으로 옮깁니다.\n  이렇게 실행하세요:  SMW_FIXTURE=1 node server/index.js --check');
    process.exit(2);
  }
  const srv = buildServer(); await new Promise((r) => srv.listen(PORT, HOST, r)); const base = `http://${HOST}:${PORT}`; let ok = true;
  // node:http(agent:false)로 호출 — 전역 fetch(undici)의 keep-alive 소켓이 종료 시 핸들 teardown과 경합해 Windows libuv 어서션을 일으킨다.
  const hit = (m, p, b) => new Promise((resolve) => {
    const payload = b ? JSON.stringify(b) : null;
    const headers = payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {};
    const r = httpRequest(base + p, { method: m, agent: false, headers }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch {} resolve({ s: res.statusCode, j }); }); });
    r.on('error', () => resolve({ s: 0, j: null }));
    if (payload) r.write(payload);
    r.end();
  });
  try {
    const st = await hit('GET', '/api/status'); const stOk = st.s === 200 && st.j && st.j.summary && st.j.summary.totalSkills > 0; console.log(`GET  /api/status            ${st.s} ${stOk ? 'OK total=' + st.j.summary.totalSkills + ' connected=' + st.j.cliConnected : 'FAIL'}`); ok &&= stOk;
    const sc = await hit('GET', '/api/scan'); const scOk = sc.s === 200 && sc.j && sc.j.summary && Array.isArray(sc.j.duplicates) && sc.j.duplicates[0] && sc.j.duplicates[0].severity; console.log(`GET  /api/scan              ${sc.s} ${scOk ? 'OK dups=' + sc.j.duplicates.length + ' sev=' + sc.j.duplicates[0].severity : 'FAIL'}`); ok &&= scOk;
    const wf = await hit('GET', '/api/workflows'); const wfOk = wf.s === 200 && Array.isArray(wf.j.workflows); console.log(`GET  /api/workflows         ${wf.s} ${wfOk ? 'OK flows=' + wf.j.workflows.length : 'FAIL'}`); ok &&= wfOk;
    const mg = await hit('GET', '/api/manage/update-status'); const mgOk = mg.s === 200 && mg.j.summary && Array.isArray(mg.j.standalone); console.log(`GET  /api/manage/update     ${mg.s} ${mgOk ? 'OK standalone=' + mg.j.standalone.length : 'FAIL'}`); ok &&= mgOk;
    const rsd = await hit('GET', '/api/manage/residue/autoplan'); const rsdOk = rsd.s === 200 && Array.isArray(rsd.j.surfaces); console.log(`GET  /api/manage/residue    ${rsd.s} ${rsdOk ? 'OK surfaces=' + rsd.j.surfaces.length : 'FAIL'}`); ok &&= rsdOk;
    const pv = await hit('POST', '/api/manage/remove-preview', { skill: 'autoplan' }); const pvOk = pv.s === 200 && pv.j.mode === 'dry-run' && pv.j.confirmToken; console.log(`POST /api/.../remove-preview ${pv.s} ${pvOk ? 'OK token=' + pv.j.confirmToken : 'FAIL'}`); ok &&= pvOk;
    const cf = await hit('POST', '/api/manage/remove-confirm', { skill: 'autoplan', token: pv.j && pv.j.confirmToken }); const cfOk = cf.s === 200 && cf.j.mode === 'removed'; console.log(`POST /api/.../remove-confirm ${cf.s} ${cfOk ? 'OK moved' : 'FAIL'}`); ok &&= cfOk;
    const bad = await hit('POST', '/api/manage/remove-preview', { skill: '../etc/passwd' }); const badOk = bad.s === 400; console.log(`POST bad skill (../)        ${bad.s} ${badOk ? 'OK rejected' : 'FAIL'}`); ok &&= badOk;
  } catch (e) { console.log('check error:', e.message); ok = false; }
  await new Promise((r) => srv.close(r)); process.exit(ok ? 0 : 1);
} else {
  const srv = buildServer();
  const url = `http://${HOST}:${PORT}/`;
  srv.on("error", (e) => {
    if (e && e.code === "EADDRINUSE") {
      console.log(`\n  Skills Manager 가 이미 켜져 있어요. 브라우저에서 여세요:\n  ${url}\n`);
      if (!process.env.NO_OPEN) openBrowser(url);
      process.exit(0);
    }
    console.error("서버 오류:", e && e.message); process.exit(1);
  });
  srv.listen(PORT, HOST, () => {
    console.log(`\n  Skills Manager 콘솔 API: ${url}${FIXTURE ? "  (fixture)" : ""}\n  끄기: 이 창을 닫으세요\n`);
    if (!process.env.NO_OPEN) openBrowser(url);
  });
}
