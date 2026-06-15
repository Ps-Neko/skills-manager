// view-model.js — "무엇을 어떤 순서로 보여줄지"(출력 정책)를 정하는 순수 모듈. fs·process 안 씀.
// 예전엔 scan.js 가 직접 결정하던 부분을 여기로 모은다. render.js 는 이 모델을 문자열로 바꾸기만 한다(무엇을 보여줄지 판단 안 함).

// 사람용 검사 결과 모델 — 섹션 목록(어떤 블록을 어떤 순서로). 데이터만 담고 문자열은 render 가 만든다.
export function buildHumanReport({ uniqCount, conflicts, by, mirrorFiles, covSorted, full, noSavedFlows }) {
  const conflictCount = conflicts.length;
  const sections = [];
  if (noSavedFlows) sections.push({ kind: 'banner' });                 // 저장 흐름 0개일 때만 안내
  sections.push({ kind: 'title' });
  sections.push({ kind: 'conclusion', uniqCount, conflictCount });     // 항상 — 한 줄 결론(스킬 수·겹침 가짓수)
  if (full && conflictCount) sections.push({ kind: 'overlaps', conflicts });        // 세로 목록은 --all/--judge 에서만(접힘은 LLM 띠가 대신)
  if (full) {
    sections.push({ kind: 'inventory', uniqCount, by, mirrorFiles });               // 묶음별 분포 상세
    if (conflictCount) sections.push({ kind: 'coverage', conflictCount, covSorted }); // 기본 둘 묶음 + 끄기 설명
  }
  sections.push({ kind: 'nextAction', conflicts });                    // 항상 — 다음 한 수
  return { sections };
}

// --judge 판정 패킷 모델 — isJudge 이고 충돌이 있을 때만. 없으면 null(=안 찍음).
export function buildJudgePacket({ conflicts, isJudge }) {
  if (!isJudge || !conflicts.length) return null;
  return { conflicts };
}
