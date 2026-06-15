// render.js — Skills Manager 사람용 출력 렌더링(순수 함수). fs·process 안 씀.
// scan.js 가 계산한 데이터(conflicts·cov·by…)를 받아 문자열만 돌려준다 — 결정적이라 단위 테스트 가능.

// 한글/CJK 는 터미널 폭 2 → 표 정렬용 표시폭.
const isWide = (cp) => (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0xA4CF) || (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFF00 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6);
export const dispWidth = (s) => [...s].reduce((w, ch) => w + (isWide(ch.codePointAt(0)) ? 2 : 1), 0);
export const padW = (s, w) => s + ' '.repeat(Math.max(1, w - dispWidth(s)));
// 출처 라벨: 알려진 키는 한국어로, 그 외(플러그인 라벨=제3자 입력)는 제어문자를 떼어 반환(ANSI 스푸핑 방지).
export const shortKo = (s) => ({ user: '직접', '.agents': '.agents' })[s] || stripCtl(s);

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
  if (!full && rest > 0) lines.push(`  · 나머지 ${rest}가지 — 전체 보기: node scan.js --all`);
  return [head, ...lines].join('\n');
}

// '다음 한 수' 블록 — 검사 결과에서 곧장 다음 행동으로(접힌 사람 출력 끝에만).
export function renderNextAction(conflicts) {
  const lines = ['다음 한 수:'];
  lines.push('  · 지금 하려는 작업을 단계로 펴 보기 — /skills-manager recommend "할 일 한 줄"');
  if (conflicts.length) {
    const top = sortedConflicts(conflicts)[0];
    lines.push(`  · 가장 큰 겹침(${top.label} ${top.hits.length}곳)을 자주 쓰면 내 흐름으로 굳히기 — /skills-manager workflow save 내흐름`);
    lines.push('  · 겹침 전체·묶음별 분포 — node scan.js --all');
  } else {
    lines.push('  · 미리 짜인 흐름 구경 — /skills-manager workflow list');
    lines.push('  · 묶음별 분포 전체 — node scan.js --all');
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

// 한 줄 결론 — 항상. 스킬 수도 여기 담아 인벤토리 줄과 중복 없앰.
export function renderConclusion(uniqCount, conflictCount) {
  return conflictCount
    ? `스킬 ${uniqCount}개 중 같은 일이 ${conflictCount}가지 겹침. 끌 건 없고, 자주 하는 작업을 '내 흐름'으로 저장하면 됨.`
    : `스킬 ${uniqCount}개, 같은 일이 겹친 곳 없음. 깔끔함.`;
}

// '기본으로 둘 묶음' + 끄기 설명 (--all/--judge 의 full 블록에서만).
function renderCoverage(conflictCount, covSorted) {
  return [
    `기본으로 둘 묶음 (겹친 ${conflictCount}가지 중 몇에 끼나):`,
    `  ${covSorted.map(([s, n]) => `${shortKo(s)} ${n}`).join(' · ')}`,
    `  → ${shortKo(covSorted[0][0])}가 가장 많음. 기본으로 두면 편함 (단, 묶음마다 고유 스킬도 있으니 본인 몫).`,
    `\n끄기는 거의 안 됨 — 겹친 게 플러그인 안이고, 플러그인은 통째로만 꺼져서 하나 빼려다 고유한 것까지 잃음. 그래서 보여주는 데까지만.`,
  ].join('\n');
}

// 출처 → 사람용 라벨(판정 패킷용).
const SRC_KO = { gstack: 'gstack', '.agents': '.agents(심링크)', user: '직접 설치', 'agent-skills': 'agent-skills', superpowers: 'superpowers', codex: 'codex', harness: 'harness', '외부': '외부 링크' };

// 사람용 검사 결과 조립 — view-model 이 정한 sections 모델을 문자열로 변환만 한다(무엇을 보여줄지 판단은 view-model).
// 시각 위계: 색·이모지·아이콘은 SKILL.md 절대 제약 → 가로 구분선(─)으로만 띠를 나눠 결론·섹션을 도드라지게.
//   배너(있으면)=분석 위 안내라 빈 줄로만 분리, 그 아래 제목·결론·상세·다음 한 수는 구분선으로 띠 구분.
//   결론은 제목 줄과 다음 띠 사이에 끼어 헤드라인처럼 읽힌다(접힘에선 결론↔다음 한 수만 남아 더 또렷).
export function renderReport({ sections }) {
  const TITLE = 'Skills Manager — 검사 결과 (읽기 전용 · 아무것도 안 바꿈)';
  const RULE = '─'.repeat(54);                 // 섹션을 가르는 얇은 가로줄(도구 본래 idiom)
  const intro = [];                            // 배너: 본문과 빈 줄로 분리
  const core = [];                             // 제목·결론·상세·다음 한 수: 구분선으로 띠 분리
  for (const s of sections) {
    if (s.kind === 'banner') intro.push(noSavedWorkflowBanner());
    else if (s.kind === 'title') core.push(TITLE);
    else if (s.kind === 'conclusion') core.push('  ' + renderConclusion(s.uniqCount, s.conflictCount));
    else if (s.kind === 'overlaps') core.push(renderOverlaps(s.conflicts, { full: true }));
    else if (s.kind === 'inventory') core.push(renderInventoryLine(s.uniqCount, s.by, s.mirrorFiles, { full: true }));
    else if (s.kind === 'coverage') core.push(renderCoverage(s.conflictCount, s.covSorted));
    else if (s.kind === 'nextAction') core.push(renderNextAction(s.conflicts));
  }
  const body = core.join('\n' + RULE + '\n');
  return intro.length ? intro.join('\n\n') + '\n\n' + body : body;
}

// 제3자 스킬 frontmatter(이름·설명)와 출처 라벨은 신뢰 불가 입력 — 터미널에 생짜로 찍기 전 제어문자를 떼어낸다.
// ANSI 이스케이프(ESC=0x1B)로 출력을 위조(악성 스킬이 판정 패킷에서 자기를 숨김)하거나, 이 패킷을
// 읽는 호스트 LLM 컨텍스트를 흔드는 걸 막는 출력 인코딩. C0(0x00–0x1F)·DEL(0x7F)·C1(0x80–0x9F)을
// 공백으로 치환(정상 텍스트엔 제어문자가 없어 영향 0). 개행 잇기는 join 이 따로 하므로 여기서 다 떼도 안전.
const stripCtl = (s) => String(s ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');

// 2단 판정 패킷 — buildJudgePacket 이 준 모델을 문자열로.
export function renderJudgePacket({ conflicts }) {
  const cut = (s) => stripCtl(s || '(설명 없음)').replace(/\s+/g, ' ').trim().slice(0, 90);
  const sourceLabel = (s) => SRC_KO[s] || stripCtl(s).replace(/\s+/g, ' ').trim();
  const out = ['────── 판정 패킷 (2단: 설명 읽고 진짜 중복 가려내기) ──────', ''];
  for (const c of conflicts) {
    out.push(`[${c.label}]`);
    for (const h of c.hits) out.push(`  - ${stripCtl(h.name)} (${sourceLabel(h.source)}): ${cut(h.desc)}`);
    out.push('');
  }
  return out.join('\n');
}
