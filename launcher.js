// launcher.js — Skills Manager 시작 메뉴·모드 안내 화면(순수 함수). fs·process 안 씀.
// scan.js 가 --menu / --help <모드> 로 호출해 출력만 한다. 흐름(번호→실행)은 SKILL.md 가 지휘.
// 화면은 전부 고정 문구 → 매번 동일하게 출력되고 단위 테스트로 일관성 보장(엔진은 안 건듦).
// 시각 위계: 색·이모지·아이콘 금지(집안 제약) → 가로줄(─)로만 구역 구분.
// 한글 폭 정렬은 render.js 의 dispWidth/padW 재사용(중복 구현 금지).

import { dispWidth, padW } from './render.js';

const WIDTH = 54;
const RULE = '─'.repeat(WIDTH);
const LABEL_COL = 18; // 메뉴 라벨 칸 표시폭(최장 라벨 16 + 여유 2)

// 메뉴 한 줄: 번호 + 라벨(고정폭) + 설명.
const row = (num, label, desc) => `   ${num}  ${padW(label, LABEL_COL)}${desc}`;

// 구역 머리글: '── 제목 ' 뒤를 가로줄로 WIDTH 까지 채움(제목 길이와 무관하게 폭 일정).
const section = (title) => {
  const prefix = `── ${title} `;
  return prefix + '─'.repeat(Math.max(2, WIDTH - dispWidth(prefix)));
};

// 하단 길찾기 한 줄 — 모든 화면이 공유(같은 자리·같은 문구).
// back=true: 하위 화면(0=뒤로) · back=false: 시작 메뉴(0=종료)
export function navFooter({ back } = {}) {
  return back ? '   0  뒤로        ?  도움말' : '   ?  도움말        0  종료';
}

// 시작 메뉴 (--menu)
export function renderStartMenu() {
  return [
    RULE,
    ' Skills Manager — 시작 메뉴 (읽기 전용 · 아무것도 안 바꿈)',
    RULE,
    ' 무엇을 도와드릴까요? 번호를 말씀하세요.',
    '',
    row('1', '겹치는 스킬 찾기', '같은 일 하는 스킬이 어디에 겹쳤는지 지도로'),
    row('2', '이 작업 뭐 쓰지?', '할 일을 단계로 펴고, 단계마다 쓸 스킬 추천'),
    row('3', '내 워크플로우', '저장한 흐름 보기·실행·저장·수정·삭제'),
    row('4', '스킬 정리', '업데이트 점검 · 안 쓰는 스킬 안전 제거'),
    '',
    navFooter({ back: false }),
    RULE,
  ].join('\n');
}
