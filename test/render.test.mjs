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
