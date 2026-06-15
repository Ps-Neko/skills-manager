// classifier.js — capability 판정 + 충돌/그룹 생성 (순수). fs·process 안 씀.
// scan.js 가 모은 인벤토리(uniq = {name, source, desc}[])만 받아 분류 결과를 돌려준다 — 결정적이라 단위 테스트 가능.
// [1단] 시드 키워드로 후보를 넓게 묶는다(거짓양성 허용). 정밀 분리는 --judge 2단에서 LLM이.
//   주신호 = 스킬 이름(re). 보조신호 = 설명(descRe) — 이름이 키워드를 안 써도 잡되,
//   설명 매칭은 'deploy/launch' 같은 흔한 단어 대신 **특정 구절·한국어 라벨**만 골라 오탐을 억제한다.
import { CAP_LABEL } from './workflow-store.js';

// 시드 키워드 표 (1단 — 넓게). 라벨은 CAP_LABEL 단일 출처에서.
// re = 이름 매칭(주신호). descRe = 설명까지 본 보조 매칭(특정 구절만 — 정밀도 우선).
export const GROUPS = [
  { cap: 'tdd', label: CAP_LABEL.tdd, re: /(^|[-_])tdd($|[-_])|test-driven|red-green/i, descRe: /test[- ]driven|\btdd\b|red[- ]green|테스트 (주도|먼저)/i },
  { cap: 'review', label: CAP_LABEL.review, re: /code-review|requesting-code|receiving-code|review-and-quality|^review$/i, descRe: /code review|코드 (리뷰|검토)/i },
  { cap: 'plan', label: CAP_LABEL.plan, re: /writing-plans|planning-and-task|task-breakdown|^plan$|^planning$/i, descRe: /implementation plan|task breakdown|구현 계획|작업 분해|계획 수립/i },
  { cap: 'debug', label: CAP_LABEL.debug, re: /debug|diagnose|investigate|error-recovery/i, descRe: /디버깅|root[- ]cause|근본 원인|error recovery/i },
  { cap: 'brainstorm', label: CAP_LABEL.brainstorm, re: /brainstorm|idea-refine|ideate|office-hours|interview-me|grill/i, descRe: /brainstorm|ideation|브레인스토밍|아이디어 (발산|생성|도출)/i },
  { cap: 'spec', label: CAP_LABEL.spec, re: /(^|[-_])spec($|[-_])|spec-driven/i, descRe: /spec(ification)?[- ]driven|명세 작성|스펙 작성/i },
  { cap: 'ship', label: CAP_LABEL.ship, re: /(^|[-_])ship($|[-_])|deploy|launch|shipping/i, descRe: /release checklist|pre-?launch|배포 (점검|준비)|출시 (점검|준비)|롤아웃/i },
  { cap: 'security', label: CAP_LABEL.security, re: /security|hardening|(^|[-_])cso($|[-_])/i, descRe: /security (review|audit|hardening)|보안 (점검|검토)|취약점/i },
  { cap: 'simplify', label: CAP_LABEL.simplify, re: /simplif/i, descRe: /simplif|코드 단순화/i },
];

// 설정·도우미·내부 항목은 "기능 중복"이 아니다 → 후보에서 제외 (2단 루브릭 #4의 기계화)
export const NOT_DUP = /^setup-|^_|-config$|configure/i;

// 설명에서 인용된 예시(따옴표·홑낫표 안)는 매칭에서 뺀다 — 메타/별칭 스킬이 트리거 예시로
// 다른 capability 단어를 인용하는 흔한 패턴(예: flow 설명의 "코드 리뷰")이 오탐을 내는 걸 막는다.
const stripQuoted = (s) => s.replace(/"[^"]*"|「[^」]*」|『[^』]*』/g, ' ');

// 한 항목(이름+설명)이 그룹 g 에 드는지 — 이름(주) 또는 설명(보조). 설정성 이름은 제외.
const inGroup = (g, it) => !NOT_DUP.test(it.name) && (g.re.test(it.name) || (g.descRe && g.descRe.test(`${it.name}\n${stripQuoted(it.desc || '')}`)));

// 한 항목이 가진 capability 목록 (--json 의 skills[].capabilities). 이름+설명 둘 다 본다.
export const capsOfItem = (it) => GROUPS.filter((g) => inGroup(g, it)).map((g) => g.cap);
// 이름만으로 보는 하위호환 래퍼(설명이 없을 때와 동일).
export const capsOf = (name) => capsOfItem({ name, desc: '' });

// uniq(스킬 목록) → 분류 결과. conflicts(사람용/--judge)·groups(--json/--workflows)가 같은 hitsForGroup 식을 공유.
export function classify(uniq) {
  const hitsForGroup = (g) => uniq.filter((it) => inGroup(g, it));

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
