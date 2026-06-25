import { store } from '../store.js';
import { toSummary, toDuplicates, toRecommendations } from '../dto.js';
export default [
  { method: 'GET', path: '/api/scan', handler: async () => { const s = await store.scan(); return { summary: toSummary(s), duplicates: toDuplicates(s) }; } },
  { method: 'GET', path: '/api/recommend', handler: async () => ({ items: toRecommendations(await store.scan()) }) },
  { method: 'POST', path: '/api/rescan', handler: async () => { store.invalidate(); const s = await store.scan(true); return { ok: true, lastScannedAt: store.lastScannedAt(), totalSkills: toSummary(s).totalSkills }; } },
];
