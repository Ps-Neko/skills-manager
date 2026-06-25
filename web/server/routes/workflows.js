import { store } from '../store.js';
import { toWorkflows } from '../dto.js';
export default [ { method: 'GET', path: '/api/workflows', handler: async () => ({ workflows: toWorkflows(await store.workflows()) }) } ];
