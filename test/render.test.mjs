// test/render.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { dispWidth, padW, sortedConflicts, renderOverlaps } from '../render.mjs';

const C = (label, n) => ({ label, hits: Array(n).fill(0), sources: [] });

test('dispWidth: 한글은 2, ASCII는 1', () => {
  assert.strictEqual(dispWidth('abc'), 3);
  assert.strictEqual(dispWidth('가나'), 4);
});

test('padW: 표시폭 기준 우측 패딩(최소 1칸)', () => {
  assert.strictEqual(dispWidth(padW('가', 6)), 6);
  assert.ok(padW('abc', 1).endsWith(' '), '이미 넘쳐도 최소 1칸');
});

test('sortedConflicts: 곳 수 내림차순, 동순위는 입력 순서 보존', () => {
  const out = sortedConflicts([C('a', 2), C('b', 4), C('c', 4), C('d', 1)]);
  assert.deepStrictEqual(out.map((c) => c.label), ['b', 'c', 'a', 'd']);
});

test('renderOverlaps: 빈 입력이면 깔끔함 문구', () => {
  assert.match(renderOverlaps([]), /겹친 곳 없음/);
});

test('renderOverlaps: 8가지(topN=7 초과) 접힘 — 큰 7 + 나머지 1 안내', () => {
  const conflicts = Array.from({ length: 8 }, (_, i) => C('겹침' + i, i + 1));
  const out = renderOverlaps(conflicts, { full: false, topN: 7 });
  assert.match(out, /큰 7개만/);
  assert.match(out, /나머지 1가지 — 전체 보기: node scan\.mjs --all/);
  assert.match(out, /겹침7 — 8곳/); // 가장 큰 게 맨 위
  assert.ok(!out.includes('겹침0'), '가장 작은 1곳은 접힘에 들어가 안 보임');
});

test('renderOverlaps: full=true 면 정렬만, 접지 않음', () => {
  const conflicts = Array.from({ length: 8 }, (_, i) => C('겹침' + i, i + 1));
  const out = renderOverlaps(conflicts, { full: true, topN: 7 });
  assert.ok(!out.includes('나머지'), 'full 은 접기 안내 없음');
  assert.match(out, /겹침0 — 1곳/); // 다 보임
});

test('renderOverlaps: 8개 이하·full=false 면 다 보이고 접기 안내 없음', () => {
  const conflicts = Array.from({ length: 7 }, (_, i) => C('x' + i, i + 1));
  const out = renderOverlaps(conflicts, { full: false, topN: 7 });
  assert.ok(!out.includes('나머지'));
  assert.ok(!out.includes('큰 7개만'));
});

test('renderOverlaps: 영어 스킬명·이모지 없음(평한국어 제약)', () => {
  const out = renderOverlaps([C('코드 리뷰', 4)], { full: false });
  assert.doesNotMatch(out, /[\u{1F000}-\u{1FAFF}☀-➿]/u);
  assert.match(out, /코드 리뷰 — 4곳/);
});

test('renderOverlaps: em-dash 열 위치가 폭이 다른 행에서도 동일(정렬 잠금)', () => {
  const out = renderOverlaps([
    { label: '디버깅', hits: Array(4).fill(0), sources: [] },
    { label: '아이디어/브레인스토밍', hits: Array(2).fill(0), sources: [] },
  ], { full: true });
  const cols = out.split('\n').filter((l) => l.startsWith('  · ')).map((l) => dispWidth(l.slice(0, l.indexOf('—'))));
  assert.ok(cols.length >= 2, '겹침 행이 2개 이상');
  assert.strictEqual(new Set(cols).size, 1, '모든 행에서 em-dash 앞 표시폭이 같아야 정렬');
});

import { renderNextAction, renderInventoryLine, firstRunBanner } from '../render.mjs';

test('renderNextAction: 겹침 있으면 가장 큰 겹침을 저장 후보로 지목 + recommend 줄', () => {
  const out = renderNextAction([{ label: '디버깅', hits: Array(4).fill(0), sources: [] }, { label: '코드 리뷰', hits: Array(2).fill(0), sources: [] }]);
  assert.match(out, /다음 한 수:/);
  assert.match(out, /recommend/);
  assert.match(out, /가장 큰 겹침\(디버깅 4곳\)/); // 큰 것을 지목
  assert.match(out, /workflow save/);
});

test('renderNextAction: 겹침 없으면 recommend + workflow list 안내', () => {
  const out = renderNextAction([]);
  assert.match(out, /recommend/);
  assert.match(out, /workflow list/);
  assert.ok(!out.includes('가장 큰 겹침'));
});

test('renderInventoryLine: 접힘은 한 줄, full 은 묶음별 분포', () => {
  const by = { 'agent-skills': 23, gstack: 53, user: 3 };
  const collapsed = renderInventoryLine(124, by, 486, { full: false });
  assert.match(collapsed, /깔린 스킬 약 124개\./);
  assert.ok(!collapsed.includes('gstack 53'), '접힘은 묶음별 카운트 숨김');
  const full = renderInventoryLine(124, by, 486, { full: true });
  assert.match(full, /사본 486벌 접음/);
  assert.match(full, /gstack 53/);
  assert.match(full, /직접 3/); // user → '직접'
});

test('firstRunBanner: 읽기 전용 사실 진술, 유치체·이모지 없음', () => {
  const b = firstRunBanner();
  assert.match(b, /처음 오셨네요/);
  assert.match(b, /읽기 전용/);
  assert.doesNotMatch(b, /[\u{1F000}-\u{1FAFF}☀-➿]/u);
  assert.doesNotMatch(b, /걱정 마세요|쉽게 말하면/); // 과한 안심·유치 풀어쓰기 금지
});
