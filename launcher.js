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

// 모드별 안내 (--help <모드>). 하위 동작이 여럿인 모드만 번호 목록, 나머진 짧은 설명.
// 알 수 없거나 빈 mode → 시작 메뉴로 폴백(안전 기본값).
export function renderModeHelp(mode) {
  if (mode === 'workflow') {
    return [
      section('3. 내 워크플로우'),
      row('1', '목록 보기', '저장된 흐름 + 미리 짜인 흐름 전부'),
      row('2', '흐름 실행', '고른 흐름을 단계별로 안내'),
      row('3', '새로 저장', "지금 작업을 '내 흐름'으로 굳히기"),
      row('4', '단계 스킬 바꾸기', '흐름의 한 단계에 쓸 스킬 교체'),
      row('5', '삭제', '내가 만든 흐름 지우기'),
      navFooter({ back: true }),
      RULE,
    ].join('\n');
  }
  if (mode === 'manage') {
    return [
      section('4. 스킬 정리'),
      row('1', '업데이트 점검', 'git로 받은 스킬의 갱신 여부 확인'),
      row('2', '스킬 제거', '안 쓰는 스킬을 휴지통으로 (미리보기 → 확인)'),
      '',
      '   * 제거는 항상 미리보기를 먼저 보여주고, 직접 확인하셔야만 휴지통으로',
      '     옮깁니다. 영구삭제 아님 · 되돌리기 가능 · 엔진/설정은 안 건듦.',
      navFooter({ back: true }),
      RULE,
    ].join('\n');
  }
  if (mode === 'scan') {
    return [
      section('1. 겹치는 스킬 찾기'),
      ' 깔린 스킬을 훑어 같은 일 하는 스킬이 어디에 겹쳤는지 지도로 보여줍니다.',
      ' 읽기 전용 — 아무것도 안 끄고 안 바꿉니다. 바로 실행됩니다.',
      navFooter({ back: true }),
      RULE,
    ].join('\n');
  }
  if (mode === 'recommend') {
    return [
      section('2. 이 작업 뭐 쓰지?'),
      ' 하려는 작업을 단계로 펴고, 단계마다 깔린 스킬 중 무엇을 쓸지 골라 줍니다.',
      ' 겹치는 단계는 하나만 추리고 나머진 "이 흐름선 불필요"로 안내합니다.',
      ' 작업을 한 줄로 알려주시면 바로 실행됩니다.',
      navFooter({ back: true }),
      RULE,
    ].join('\n');
  }
  return renderStartMenu();
}
