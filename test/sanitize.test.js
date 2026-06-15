// test/sanitize.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { stripCtl, hasCtl } from '../sanitize.js';

const ESC = String.fromCharCode(27);
const ch = (c) => String.fromCharCode(c);

test('stripCtl: C0·ESC·DEL·C1 제어문자를 공백으로 치환', () => {
  for (let c = 0x00; c <= 0x1f; c++) {
    assert.ok(!stripCtl('a' + ch(c) + 'b').includes(ch(c)), `C0 0x${c.toString(16)} 제거`);
  }
  assert.ok(!stripCtl('x' + ESC + '[31m').includes(ESC), 'ESC(0x1b) 제거');
  assert.ok(!stripCtl('x' + ch(0x7f) + 'y').includes(ch(0x7f)), 'DEL(0x7f) 제거');
  for (let c = 0x80; c <= 0x9f; c++) {
    assert.ok(!stripCtl('a' + ch(c) + 'b').includes(ch(c)), `C1 0x${c.toString(16)} 제거`);
  }
});

test('stripCtl: 정상 콘텐츠 보존(한글·CJK·이모지·em-dash·중점·NBSP·악센트)', () => {
  const NBSP = ch(0xa0); // C1 경계 바로 위 — 보존돼야 함
  const keep = ['가나다', '中文漢字', '😀🎯', 'a—b', 'a·b', 'café Ångström naïve', 'a' + NBSP + 'b', 'agent-skills:tdd'];
  for (const s of keep) assert.strictEqual(stripCtl(s), s, `보존 실패: ${s}`);
});

test('stripCtl: null/undefined → 빈 문자열(크래시 없음)', () => {
  assert.strictEqual(stripCtl(null), '');
  assert.strictEqual(stripCtl(undefined), '');
});

test('hasCtl: 식별자의 제어문자 유무 판정(저장 거부용)', () => {
  assert.ok(hasCtl('a' + ESC + 'b'), 'ESC 검출');
  assert.ok(hasCtl('x' + ch(0x00)), 'NUL 검출');
  assert.ok(hasCtl('y' + ch(0x9f)), 'C1 검출');
  assert.ok(!hasCtl('agent-skills:tdd'), '정상 식별자');
  assert.ok(!hasCtl('가나-다_라'), '한글·하이픈·밑줄');
  assert.ok(!hasCtl('a' + ch(0xa0) + 'b'), 'NBSP 는 제어문자 아님');
  assert.ok(!hasCtl(null), '비문자열은 false');
  assert.ok(!hasCtl(42), '숫자는 false');
});
