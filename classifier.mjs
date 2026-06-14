// classifier.mjs — capability 판정 + 충돌/그룹 생성 (순수). fs·process 안 씀.
// scan.mjs 가 모은 인벤토리(uniq = {name, source, desc}[])만 받아 분류 결과를 돌려준다 — 결정적이라 단위 테스트 가능.
// [1단] 시드 키워드(스킬 이름 기반)로 후보를 넓게 묶는다(거짓양성 허용). 정밀 분리는 --judge 2단에서 LLM이.
import { CAP_LABEL } from './workflow-store.mjs';

// 시드 키워드 표 (1단 — 넓게). 라벨은 CAP_LABEL 단일 출처에서.
export const GROUPS = [
  { cap: 'tdd', label: CAP_LABEL.tdd, re: /(^|[-_])tdd($|[-_])|test-driven|red-green/i },
  { cap: 'review', label: CAP_LABEL.review, re: /code-review|requesting-code|receiving-code|review-and-quality|^review$/i },
  { cap: 'plan', label: CAP_LABEL.plan, re: /writing-plans|planning-and-task|task-breakdown|^plan$|^planning$/i },
  { cap: 'debug', label: CAP_LABEL.debug, re: /debug|diagnose|investigate|error-recovery/i },
  { cap: 'brainstorm', label: CAP_LABEL.brainstorm, re: /brainstorm|idea-refine|ideate|office-hours|interview-me|grill/i },
  { cap: 'spec', label: CAP_LABEL.spec, re: /(^|[-_])spec($|[-_])|spec-driven/i },
  { cap: 'ship', label: CAP_LABEL.ship, re: /(^|[-_])ship($|[-_])|deploy|launch|shipping/i },
  { cap: 'security', label: CAP_LABEL.security, re: /security|hardening|(^|[-_])cso($|[-_])/i },
  { cap: 'simplify', label: CAP_LABEL.simplify, re: /simplif/i },
];

// 설정·도우미·내부 항목은 "기능 중복"이 아니다 → 후보에서 제외 (2단 루브릭 #4의 기계화)
export const NOT_DUP = /^setup-|^_|-config$|configure/i;

// 한 스킬 이름이 가진 capability 목록 (--json 의 skills[].capabilities).
export const capsOf = (name) => GROUPS.filter((g) => g.re.test(name) && !NOT_DUP.test(name)).map((g) => g.cap);

// uniq(스킬 목록) → 분류 결과. conflicts(사람용/--judge)·groups(--json/--workflows)가 같은 hitsForGroup 식을 공유.
export function classify(uniq) {
  const hitsForGroup = (g) => uniq.filter((it) => g.re.test(it.name) && !NOT_DUP.test(it.name));

  const conflicts = [];
  for (const g of GROUPS) {
    const hits = hitsForGroup(g);
    const sources = [...new Set(hits.map((h) => h.source))];
    if (hits.length >= 2 && sources.length >= 2) conflicts.push({ label: g.label, hits, sources });
  }

  // 출처별 "겹친 영역 커버 수" — 어느 묶음을 기본으로 둘지 정하는 근거(측정 가능한 사실)
  const cov = {};
  for (const c of conflicts) for (const s of c.sources) cov[s] = (cov[s] || 0) + 1;
  const covSorted = Object.entries(cov).sort((a, b) => b[1] - a[1]);

  // groups: capability→스킬 묶음(=--json 의 groups). --json 과 --workflows 가 공유.
  const groupsByCap = {};
  const groups = GROUPS.map((g) => {
    const hits = hitsForGroup(g);
    if (!hits.length) return null;
    const sources = [...new Set(hits.map((h) => h.source))];
    const entry = { capability: g.cap, label: g.label, skills: hits.map((h) => h.source + ':' + h.name), sources, duplicateLevel: sources.length >= 2 ? 'high' : 'none' };
    groupsByCap[g.cap] = entry;
    return entry;
  }).filter(Boolean);

  return { conflicts, cov, covSorted, groups, groupsByCap };
}
