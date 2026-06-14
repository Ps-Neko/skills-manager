// render.mjs — Skills Manager 사람용 출력 렌더링(순수 함수). fs·process 안 씀.
// scan.mjs 가 계산한 데이터(conflicts·cov·by…)를 받아 문자열만 돌려준다 — 결정적이라 단위 테스트 가능.

// 한글/CJK 는 터미널 폭 2 → 표 정렬용 표시폭.
const isWide = (cp) => (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) || (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFF00 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6);
export const dispWidth = (s) => [...s].reduce((w, ch) => w + (isWide(ch.codePointAt(0)) ? 2 : 1), 0);
export const padW = (s, w) => s + ' '.repeat(Math.max(1, w - dispWidth(s)));

// 겹침을 '곳 수' 내림차순(동순위는 입력 순서 보존 = 안정). 원본 비변형.
export function sortedConflicts(conflicts) {
  return conflicts
    .map((c, i) => [c, i])
    .sort((a, b) => (b[0].hits.length - a[0].hits.length) || (a[1] - b[1]))
    .map(([c]) => c);
}

// 겹침 목록 블록. full=true 면 전부, 아니면 topN 개 + 나머지 접기.
export function renderOverlaps(conflicts, { full = false, topN = 7 } = {}) {
  if (!conflicts.length) return '같은 일이 겹친 곳 없음. 깔끔함.';
  const sorted = sortedConflicts(conflicts);
  const shown = full ? sorted : sorted.slice(0, topN);
  const rest = sorted.length - shown.length;
  const LW = Math.max(2, ...shown.map((c) => dispWidth(c.label))) + 1;
  const head = (!full && rest > 0)
    ? `같은 일이 겹친 곳 — ${conflicts.length}가지 (큰 ${topN}개만):`
    : `같은 일이 겹친 곳 — ${conflicts.length}가지:`;
  const lines = shown.map((c) => `  · ${padW(c.label, LW)}— ${c.hits.length}곳`);
  if (!full && rest > 0) lines.push(`  · 나머지 ${rest}가지 — 전체 보기: node scan.mjs --all`);
  return [head, ...lines].join('\n');
}

// Task 2~3 에서 구현 예정 — scan.mjs import 바인딩을 미리 확보해 둠.
export function renderNextAction() { throw new Error('미구현: Task 2'); }
export function renderInventoryLine() { throw new Error('미구현: Task 3'); }
export function firstRunBanner() { throw new Error('미구현: Task 3'); }
