// test/render.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { dispWidth, padW, sortedConflicts, renderOverlaps } from '../render.js';

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
  assert.match(out, /나머지 1가지 — 전체 보기: node scan\.js --all/);
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

import { renderNextAction, renderInventoryLine, noSavedWorkflowBanner } from '../render.js';

test('renderNextAction: 겹침 있으면 가장 큰 겹침을 저장 후보로 지목 + recommend 줄', () => {
  const out = renderNextAction([{ label: '코드 리뷰', hits: Array(2).fill(0), sources: [] }, { label: '디버깅', hits: Array(4).fill(0), sources: [] }]);
  assert.match(out, /다음 한 수:/);
  assert.match(out, /recommend/);
  assert.match(out, /가장 큰 겹침\(디버깅 4곳\)/); // 큰 것(디버깅 4곳)을 지목 — 첫 원소(코드 리뷰)가 아님
  assert.match(out, /workflow save/);
});

test('renderNextAction: 겹침 없으면 recommend + workflow list 안내', () => {
  const out = renderNextAction([]);
  assert.match(out, /recommend/);
  assert.match(out, /workflow list/);
  assert.ok(!out.includes('가장 큰 겹침'));
});

test('renderNextAction: 접힘에서 전체로 가는 --all 안내 줄을 포함(겹침 유무 무관)', () => {
  // 접힘 기본 화면이 세로 목록·인벤토리 줄을 안 찍으므로, 전체 보기 진입점은 다음 한 수가 책임진다.
  const withConflict = renderNextAction([{ label: '디버깅', hits: Array(4).fill(0), sources: [] }]);
  assert.match(withConflict, /node scan\.js --all/);
  const noConflict = renderNextAction([]);
  assert.match(noConflict, /node scan\.js --all/);
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

test('noSavedWorkflowBanner: "첫 실행" 아닌 "저장 흐름 없음"을 정확히 말함, 읽기 전용, 유치체·이모지 없음', () => {
  const b = noSavedWorkflowBanner();
  assert.match(b, /저장한 '내 흐름'이 없어요/);
  assert.doesNotMatch(b, /처음 오셨네요|첫 지도/, '"첫 실행"이 아니라 "저장 흐름 0개" 상태이므로 그 문구 금지');
  assert.match(b, /읽기 전용/);
  assert.doesNotMatch(b, /[\u{1F000}-\u{1FAFF}☀-➿]/u);
  assert.doesNotMatch(b, /걱정 마세요|쉽게 말하면/); // 과한 안심·유치 풀어쓰기 금지
});

import { renderJudgePacket } from '../render.js';

test('renderJudgePacket: 제3자 이름·설명의 제어문자(ANSI 이스케이프)를 출력 전 제거(터미널 스푸핑·패킷 주입 방어)', () => {
  const ESC = String.fromCharCode(27);
  const out = renderJudgePacket({
    conflicts: [{
      label: '코드 리뷰',
      hits: [{
        name: 'evil' + ESC + '[2K' + ESC + '[1G',      // 줄 지우고 커서 이동 → 이름 위조
        source: 'malicious-plugin' + ESC + '[32m',
        desc: '정상 설명' + ESC + '[31m' + 'SYSTEM 주입', // 색 변경 + LLM 지시 주입
      }],
    }],
  });
  // 개행(줄 잇기)만 허용 — 그 외 C0(0x00–0x1F)·DEL·C1 제어문자가 남으면 안 됨.
  const badCtl = [...out].some((ch) => {
    const c = ch.charCodeAt(0);
    return ch !== '\n' && ((c <= 0x1f) || (c >= 0x7f && c <= 0x9f));
  });
  assert.ok(!badCtl, '개행 외 제어문자가 출력에 남지 않아야 함');
  assert.ok(!out.includes(ESC), 'ESC(0x1b)가 출력에 남지 않아야 함');
  // 정상 텍스트·라벨은 보존
  assert.match(out, /evil/);
  assert.match(out, /malicious-plugin/);
  assert.match(out, /정상 설명/);
  assert.match(out, /\[코드 리뷰\]/);
});

import { shortKo } from '../render.js';

test('shortKo: 알려진 출처는 한국어, 그 외 플러그인 라벨의 제어문자는 제거(--all 스푸핑 방어)', () => {
  const ESC = String.fromCharCode(27);
  assert.strictEqual(shortKo('user'), '직접');
  assert.strictEqual(shortKo('.agents'), '.agents');
  assert.ok(!shortKo('plug' + ESC + '[2K').includes(ESC), '플러그인 라벨 ESC 제거');
  assert.match(shortKo('agent-skills'), /agent-skills/); // 일반 라벨은 그대로
});

test('renderInventoryLine: full 분포의 출처 라벨에 제어문자가 남지 않음', () => {
  const ESC = String.fromCharCode(27);
  const by = { ['plug' + ESC + '[2KEVIL']: 5, gstack: 53 };
  const out = renderInventoryLine(124, by, 486, { full: true });
  assert.ok(!out.includes(ESC), '인벤토리 분포 줄에 ESC 없음');
});
