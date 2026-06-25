import { store } from '../store.js';
import { toSummary } from '../dto.js';
import { FIXTURE } from '../cli-runner.js';
export default [
  { method: 'GET', path: '/api/status', handler: async () => {
    let summary = null, connected = false, reason = '';
    try { summary = toSummary(await store.scan()); connected = FIXTURE || summary.hasSkillsFolder; if (!connected) reason = `${summary.skillsPath || '~/.claude/skills'} 폴더를 찾지 못했어요. Claude Code 스킬이 설치돼 있는지 확인해 주세요.`; }
    catch (e) { connected = false; reason = e.message || 'CLI 실행에 실패했어요.'; }
    return { cliConnected: connected, readOnly: true, fixture: FIXTURE, reason, lastScannedAt: store.lastScannedAt(), summary };
  } },
];
