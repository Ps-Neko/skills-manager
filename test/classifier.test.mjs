// test/classifier.test.mjs — capability 판정·충돌/그룹 생성(순수)의 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert';
import { capsOf, classify } from '../classifier.mjs';

const S = (name, source) => ({ name, source, desc: '' });

test('capsOf: 이름이 그룹 정규식에 맞으면 cap, NOT_DUP 은 제외', () => {
  assert.deepStrictEqual(capsOf('test-driven-development'), ['tdd']);
  assert.deepStrictEqual(capsOf('systematic-debugging'), ['debug']);
  assert.deepStrictEqual(capsOf('setup-deploy'), [], 'setup- 접두는 후보 제외');
  assert.deepStrictEqual(capsOf('완전무관스킬'), []);
});

test('classify: 같은 그룹·서로 다른 출처 2개 이상이면 충돌', () => {
  const { conflicts } = classify([S('tdd', 'user'), S('test-driven-development', 'gstack')]);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].hits.length, 2);
});

test('classify: 같은 그룹이라도 출처가 하나면 충돌 아님', () => {
  const { conflicts } = classify([S('tdd', 'user'), S('test-driven-development', 'user')]);
  assert.strictEqual(conflicts.length, 0);
});

test('classify: groups 의 duplicateLevel — 출처 2+ 는 high, 1 은 none', () => {
  const { groups } = classify([S('tdd', 'user'), S('test-driven-development', 'gstack'), S('spec', 'user')]);
  const tdd = groups.find((g) => g.capability === 'tdd');
  const spec = groups.find((g) => g.capability === 'spec');
  assert.strictEqual(tdd.duplicateLevel, 'high');
  assert.strictEqual(spec.duplicateLevel, 'none');
});

test('classify: covSorted 는 겹친 영역 커버 수 내림차순', () => {
  const { covSorted } = classify([
    S('tdd', 'user'), S('test-driven-development', 'gstack'),
    S('review', 'user'), S('code-review-and-quality', 'gstack'),
  ]);
  assert.ok(covSorted.length >= 1);
  assert.ok(covSorted[0][1] >= covSorted[covSorted.length - 1][1], '내림차순');
});
