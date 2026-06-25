// preload.js — contextIsolation 유지. 화면은 /api fetch로 동작하므로 노출 API는 없다(공격면 최소화).
// 필요해지면 contextBridge.exposeInMainWorld 로 화이트리스트만 노출할 것.
