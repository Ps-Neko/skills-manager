// test/launcher.test.js — 시작 메뉴·모드 안내 화면(순수) 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert';
import { dispWidth } from '../render.js';
import { navFooter, renderStartMenu } from '../launcher.js';

test('navFooter: back=true 면 뒤로, back=false 면 종료', () => {
  assert.match(navFooter({ back: true }), /뒤로/);
  assert.ok(!navFooter({ back: true }).includes('종료'), '뒤로 화면엔 종료 없음');
  assert.match(navFooter({ back: false }), /종료/);
  assert.match(navFooter({ back: false }), /도움말/);
});

test('renderStartMenu: 4개 모드·번호·도움말·종료를 담는다', () => {
  const m = renderStartMenu();
  assert.match(m, /Skills Manager — 시작 메뉴/);
  for (const label of ['겹치는 스킬 찾기', '이 작업 뭐 쓰지?', '내 워크플로우', '스킬 정리']) {
    assert.ok(m.includes(label), `메뉴에 '${label}' 있어야 함`);
  }
  assert.match(m, /1 /); assert.match(m, /4 /);
  assert.match(m, /도움말/);
  assert.match(m, /종료/);
  assert.ok(!m.includes('뒤로'), '시작 메뉴 하단은 종료(뒤로 아님)');
});

test('renderStartMenu: 라벨 칸 고정폭 — 짧은/긴 라벨의 설명이 같은 표시열에서 시작', () => {
  const m = renderStartMenu();
  const lines = m.split('\n');
  const longLine = lines.find((l) => l.includes('겹치는 스킬 찾기'));
  const shortLine = lines.find((l) => l.includes('스킬 정리'));
  const colLong = dispWidth(longLine.slice(0, longLine.indexOf('같은 일 하는')));
  const colShort = dispWidth(shortLine.slice(0, shortLine.indexOf('업데이트 점검')));
  assert.strictEqual(colLong, colShort, '설명 시작 표시열이 같아야 정렬됨');
});
