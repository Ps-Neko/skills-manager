// render.mjs — Skills Manager 사람용 출력 렌더링(순수 함수). fs·process 안 씀.
// scan.mjs 가 계산한 데이터(conflicts·cov·by…)를 받아 문자열만 돌려준다 — 결정적이라 단위 테스트 가능.

// 한글/CJK 는 터미널 폭 2 → 표 정렬용 표시폭.
const isWide = (cp) => (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) || (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFF00 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6);
export const dispWidth = (s) => [...s].reduce((w, ch) => w + (isWide(ch.codePointAt(0)) ? 2 : 1), 0);
export const padW = (s, w) => s + ' '.repeat(Math.max(1, w - dispWidth(s)));
export const shortKo = (s) => ({ user: '직접', '.agents': '.agents' })[s] || s;

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

// '다음 한 수' 블록 — 검사 결과에서 곧장 다음 행동으로(접힌 사람 출력 끝에만).
export function renderNextAction(conflicts) {
  const lines = ['다음 한 수:'];
  lines.push('  · 지금 하려는 작업을 단계로 펴 보기 — /skills-manager recommend "할 일 한 줄"');
  if (conflicts.length) {
    const top = sortedConflicts(conflicts)[0];
    lines.push(`  · 가장 큰 겹침(${top.label} ${top.hits.length}곳)을 자주 쓰면 내 흐름으로 굳히기 — /skills-manager workflow save 내흐름`);
    lines.push('  · 겹침 전체·묶음별 분포 — node scan.mjs --all');
  } else {
    lines.push('  · 미리 짜인 흐름 구경 — /skills-manager workflow list');
    lines.push('  · 묶음별 분포 전체 — node scan.mjs --all');
  }
  return lines.join('\n');
}

// 깔린 스킬 분포. full=true 면 묶음별 상세, 아니면 한 줄.
export function renderInventoryLine(uniqCount, by, mirrorFiles, { full = false } = {}) {
  if (!full) return `깔린 스킬 약 ${uniqCount}개.`;
  const dist = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${shortKo(s)} ${n}`).join(' · ');
  return `깔린 스킬: 약 ${uniqCount}개 (도구용 사본 ${mirrorFiles}벌 접음)\n  ${dist}`;
}

// 저장된 '내 흐름'이 0개일 때 뜨는 안내. '첫 실행'이 아니라 '저장 흐름 없음' 상태다(흐름을 지우면 다시 뜸).
// 사실 진술만 — 과한 안심·유치체 금지.
export function noSavedWorkflowBanner() {
  return [
    "아직 저장한 '내 흐름'이 없어요. (워크플로우를 저장하면 이 안내는 사라집니다.)",
    '하는 일: 깔린 스킬이 많거나 같은 일이 여기저기 겹칠 때, 무엇이 겹쳤는지 지도로 보여주고',
    "         자주 하는 작업을 '내 흐름'으로 저장하게 해 줍니다. 스킬을 끄거나 지우진 않아요(읽기 전용).",
    "아래는 지금 깔린 것의 지도입니다. 끝에 '다음 한 수'가 있어요.",
  ].join('\n');
}
