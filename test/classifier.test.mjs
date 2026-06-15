// test/classifier.test.mjs — capability 판정·충돌/그룹 생성(순수)의 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert';
import { capsOf, capsOfItem, classify } from '../classifier.mjs';

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

test('capsOfItem: 이름이 키워드를 안 써도 설명의 특정 구절로 잡는다', () => {
  // 한국어 이름이라 이름 regex 는 못 잡지만, 설명의 특정 구절로 보조 매칭.
  assert.deepStrictEqual(capsOfItem({ name: '내테스트도구', desc: '테스트 주도 개발을 강제' }), ['tdd']);
  assert.deepStrictEqual(capsOfItem({ name: '코드검사기', desc: '코드 리뷰를 5축으로' }), ['review']);
});

test('capsOfItem: 흔한 단어(deploy/launch)는 설명에 있어도 과매칭 안 함(정밀도)', () => {
  assert.deepStrictEqual(capsOfItem({ name: 'note', desc: 'how to deploy and launch your app quickly' }), []);
});

test('capsOf(이름만): 설명 없는 하위호환은 그대로', () => {
  assert.deepStrictEqual(capsOf('test-driven-development'), ['tdd']);
  assert.deepStrictEqual(capsOf('내테스트도구'), [], '이름만으로는 한국어 이름 못 잡음(기존 동작)');
});

test('classify: 설명 기반으로도 충돌을 잡는다(이름이 달라도)', () => {
  const { conflicts } = classify([
    { name: 'aaa', source: 'user', desc: '코드 리뷰 도우미' },
    { name: 'code-review', source: 'gstack', desc: '' },
  ]);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].hits.length, 2);
});

test('classify: 빈 desc 면 이름만으로 판정(기존 결과 불변)', () => {
  const { conflicts } = classify([S('tdd', 'user'), S('test-driven-development', 'gstack')]);
  assert.strictEqual(conflicts.length, 1);
});

test('capsOfItem: 설명에 인용된 예시(따옴표 안)는 매칭에서 뺀다(메타/별칭 오탐 방지)', () => {
  // flow 류: 설명이 자기 트리거를 설명하며 다른 capability 단어를 따옴표로 인용 → 매칭 제외.
  assert.deepStrictEqual(capsOfItem({ name: 'flow', desc: '워크플로우 별칭. 단순 "코드 리뷰"처럼 흐름 단어가 없으면 발동 안 함.' }), []);
  // 따옴표 밖의 진짜 신호는 그대로 잡힘.
  assert.deepStrictEqual(capsOfItem({ name: 'x', desc: '코드 리뷰를 5축으로 수행' }), ['review']);
});
