// main.js — Skills Manager 데스크톱(Electron). 더블클릭 → 창이 뜨고, 내부적으로 기존 로컬 API 서버를
// 부팅해 그 화면을 보여준다. 터미널·브라우저 없이 '앱'처럼. 서버는 Electron의 Node로 실행(별도 Node 불필요).
const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const PORT = Number(process.env.PORT || 5179);
const SERVER = app.isPackaged
  ? path.join(process.resourcesPath, 'app', 'web', 'server', 'index.js')   // 패키징 시 동봉 위치
  : path.join(__dirname, '..', 'server', 'index.js');                       // 개발 시
let serverProc = null;
let win = null;

function startServer() {
  serverProc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NO_OPEN: '1', PORT: String(PORT) },
    stdio: 'inherit',
  });
  serverProc.on('error', (e) => console.error('server spawn error:', e.message));
}
function ping() {
  return new Promise((resolve) => {
    const r = http.get(`http://127.0.0.1:${PORT}/api/status`, (res) => { res.resume(); resolve(res.statusCode === 200); });
    r.on('error', () => resolve(false));
    r.setTimeout(800, () => { r.destroy(); resolve(false); });
  });
}
async function waitForServer(tries = 80) {
  for (let i = 0; i < tries; i++) { if (await ping()) return true; await new Promise((r) => setTimeout(r, 200)); }
  return false;
}
function createWindow() {
  win = new BrowserWindow({
    width: 1240, height: 840, minWidth: 920, minHeight: 600,
    title: 'Skills Manager', backgroundColor: '#f5f7fb', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') },
  });
  if (win.removeMenu) win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; }); // 외부 링크는 시스템 브라우저
  win.loadFile(path.join(__dirname, 'loading.html'));
}
app.whenReady().then(async () => {
  startServer();
  createWindow();
  const ok = await waitForServer();
  if (!win) return;
  if (ok) win.loadURL(`http://127.0.0.1:${PORT}/`);
  else {
    await dialog.showMessageBox(win, { type: 'error', title: '시작 실패', message: '로컬 검사 서버를 켜지 못했어요.', detail: 'Node 실행 환경이나 스킬 폴더 접근을 확인해 주세요.' });
    win.loadFile(path.join(__dirname, 'loading.html'));
  }
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('quit', () => { if (serverProc) try { serverProc.kill(); } catch {} });
