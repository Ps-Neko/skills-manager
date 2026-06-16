// test/launcher.test.js — 시작 메뉴·모드 안내 화면(순수) 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert';
import { dispWidth } from '../render.js';
import { navFooter, renderStartMenu, renderModeHelp } from '../launcher.js';

test('navFooter: back=true 면 뒤로, back=false 면 종료 + 좌우 순서 고정', () => {
  const back = navFooter({ back: true });
  const start = navFooter({ back: false });
  assert.match(back, /뒤로/);
  assert.ok(!back.includes('종료'), '뒤로 화면엔 종료 없음');
  assert.match(start, /종료/);
  assert.match(start, /도움말/);
  assert.ok(back.indexOf('뒤로') < back.indexOf('도움말'), 'back: 0 뒤로가 도움말보다 먼저');
  assert.ok(start.indexOf('도움말') < start.indexOf('종료'), 'start: ? 도움말이 종료보다 먼저');
});

test('renderStartMenu: 4개 모드·번호·도움말·종료를 담는다', () => {
  const m = renderStartMenu();
  assert.match(m, /Skills Manager — 시작 메뉴/);
  for (const label of ['겹치는 스킬 찾기', '이 작업 뭐 쓰지?', '내 워크플로우', '스킬 정리']) {
    assert.ok(m.includes(label), `메뉴에 '${label}' 있어야 함`);
  }
  assert.match(m, /^ {3}1 {2}겹치는 스킬 찾기/m);
  assert.match(m, /^ {3}4 {2}스킬 정리/m);
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

test('renderModeHelp(workflow): 하위 동작 5개 + 0 뒤로', () => {
  const h = renderModeHelp('workflow');
  for (const label of ['목록 보기', '흐름 실행', '새로 저장', '단계 스킬 바꾸기', '삭제']) {
    assert.ok(h.includes(label), `워크플로우 안내에 '${label}' 있어야 함`);
  }
  assert.match(h, /내 워크플로우/);
  assert.match(h, /뒤로/);
});

test('renderModeHelp(manage): 제거 안전 안내 문구를 담는다', () => {
  const h = renderModeHelp('manage');
  assert.match(h, /업데이트 점검/);
  assert.match(h, /스킬 제거/);
  assert.match(h, /미리보기/);
  assert.match(h, /휴지통/);
  assert.match(h, /영구삭제 아님/);
  assert.match(h, /뒤로/);
});

test('renderModeHelp(scan): 읽기 전용·바로 실행 설명', () => {
  const h = renderModeHelp('scan');
  assert.match(h, /읽기 전용/);
  assert.match(h, /바로 실행/);
});

test('renderModeHelp(recommend): 단계로 펴고 바로 실행 설명', () => {
  const h = renderModeHelp('recommend');
  assert.match(h, /단계/);
  assert.match(h, /바로 실행/);
});

test('renderModeHelp(알 수 없는/빈 모드): 시작 메뉴로 폴백', () => {
  assert.strictEqual(renderModeHelp('zzz'), renderStartMenu());
  assert.strictEqual(renderModeHelp(undefined), renderStartMenu());
});
