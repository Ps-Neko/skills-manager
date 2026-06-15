// claude-env.mjs — ~/.claude 설정을 읽는 공유 헬퍼 (읽기 전용, fs 만 씀).
// scanner.mjs(일반 스캔)와 manage-scan.mjs(관리 모드)가 같은 규칙으로 enabledPlugins 를
// 읽도록 단일 출처로 둔다. 둘이 settings.json / settings.local.json 병합을 다르게 하면
// '플러그인 켜짐' 판정이 서로 갈리는 버그가 나므로(예전 manage-scan 은 settings.json 만 읽었음).

import fs from 'node:fs';
import path from 'node:path';

const CANDIDATES = ['settings.json', 'settings.local.json'];

// settings.json → settings.local.json 순서로 enabledPlugins 를 병합한다.
// local 이 뒤에 와서 같은 키는 local 값이 이긴다(Claude Code 의 override 의미와 동일).
export function readEnabledPlugins(CLAUDE) {
  const enabled = {};
  for (const f of CANDIDATES) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(CLAUDE, f), 'utf8'));
      if (j && j.enabledPlugins) Object.assign(enabled, j.enabledPlugins);
    } catch {
      // 파일이 없거나(흔함) 손상 → 그 파일은 건너뛴다(안전). 나머지 파일로 계속.
    }
  }
  return enabled;
}
