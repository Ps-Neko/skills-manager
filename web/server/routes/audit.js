import { store } from '../store.js';
import { toAudit } from '../dto.js';
export default [ { method: 'GET', path: '/api/audit', handler: async () => toAudit(await store.scan(), await store.manage()) } ];
