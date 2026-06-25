// store.js — CLI 결과를 메모리에 캐시(요청마다 node를 새로 띄우지 않음) + 실제 스캔 시각 기록.
// '다시 스캔'은 invalidate 후 재실행. 라우트는 store를 거쳐 DTO로 정규화한다.
import { cli } from './cli-runner.js';
const cache = new Map();
const stamp = new Map();
async function memo(key, fn, fresh) {
  if (!fresh && cache.has(key)) return cache.get(key);
  const v = await fn();
  cache.set(key, v); stamp.set(key, Date.now());
  return v;
}
export const store = {
  scan: (fresh) => memo('scan', cli.scan, fresh),
  workflows: (fresh) => memo('workflows', cli.workflows, fresh),
  manage: (fresh) => memo('manage', cli.manageStatus, fresh),
  lastScannedAt: () => (stamp.has('scan') ? new Date(stamp.get('scan')).toISOString() : null),
  invalidate: (...keys) => { if (keys.length) { for (const k of keys) { cache.delete(k); stamp.delete(k); } } else { cache.clear(); stamp.clear(); } },
};
