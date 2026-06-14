// test/view-model.test.mjs — 출력 정책(어떤 섹션을 어떤 순서로)의 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert';
import { buildHumanReport, buildJudgePacket } from '../view-model.mjs';

const conf = (n) => Array.from({ length: n }, (_, i) => ({ label: '겹침' + i, hits: [0, 0], sources: ['a', 'b'] }));
const kindsOf = (args) => buildHumanReport(args).sections.map((s) => s.kind);

test('접힘·충돌 있음: 세로 목록·인벤토리·커버리지 없이 결론+다음 한 수만', () => {
  const kinds = kindsOf({ uniqCount: 124, conflicts: conf(8), by: {}, mirrorFiles: 0, covSorted: [], full: false, noSavedFlows: false });
  assert.deepStrictEqual(kinds, ['title', 'conclusion', 'nextAction']);
});

test('--all·충돌 있음: 세로 목록·인벤토리·커버리지까지 전부', () => {
  const kinds = kindsOf({ uniqCount: 124, conflicts: conf(8), by: {}, mirrorFiles: 0, covSorted: [['a', 1]], full: true, noSavedFlows: false });
  assert.deepStrictEqual(kinds, ['title', 'conclusion', 'overlaps', 'inventory', 'coverage', 'nextAction']);
});

test('저장 흐름 0개: 맨 앞에 banner', () => {
  const kinds = kindsOf({ uniqCount: 5, conflicts: [], by: {}, mirrorFiles: 0, covSorted: [], full: false, noSavedFlows: true });
  assert.strictEqual(kinds[0], 'banner');
});

test('충돌 0·--all: 세로 목록·커버리지는 없고 인벤토리는 있음', () => {
  const kinds = kindsOf({ uniqCount: 5, conflicts: [], by: {}, mirrorFiles: 0, covSorted: [], full: true, noSavedFlows: false });
  assert.ok(!kinds.includes('overlaps'));
  assert.ok(!kinds.includes('coverage'));
  assert.ok(kinds.includes('inventory'));
});

test('buildJudgePacket: isJudge+충돌이면 패킷, 아니면 null', () => {
  assert.ok(buildJudgePacket({ conflicts: conf(1), isJudge: true }));
  assert.strictEqual(buildJudgePacket({ conflicts: conf(1), isJudge: false }), null);
  assert.strictEqual(buildJudgePacket({ conflicts: [], isJudge: true }), null);
});
