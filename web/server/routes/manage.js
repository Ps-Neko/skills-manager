import { cli } from '../cli-runner.js';
import { store } from '../store.js';
import { toManage } from '../dto.js';
export default [
  { method: 'GET', path: '/api/manage/update-status', handler: async () => toManage(await store.manage()) },
  { method: 'GET', path: '/api/manage/residue/:skill', handler: async (p) => await cli.residue(p.skill) },
  { method: 'POST', path: '/api/manage/remove-preview', handler: async (_p, body) => await cli.removePreview(body && body.skill) },
  { method: 'POST', path: '/api/manage/remove-confirm', handler: async (_p, body) => { const r = await cli.removeConfirm(body && body.skill, body && body.token); if (r && r.ok) store.invalidate('manage', 'scan'); return r; } },
];
