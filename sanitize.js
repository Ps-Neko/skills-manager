// sanitize.js — 신뢰 불가 문자열 정화 유틸(순수 함수, 의존성 0).
// 제3자 스킬 frontmatter·플러그인 라벨·사용자 입력이 터미널(ANSI 이스케이프)이나 호스트 LLM
// 컨텍스트로 새지 않게 제어문자 C0(0x00-0x1F)·DEL(0x7F)·C1(0x80-0x9F)를 다룬다.

// 출력 인코딩: 제어문자를 공백으로 치환(정상 텍스트엔 없어 영향 0). 줄 잇기는 호출부 join 책임.
export const stripCtl = (s) => String(s ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');

// 입력 검증: 식별자(capability·skill 등)에 제어문자가 있으면 true → 저장 거부용.
export const hasCtl = (s) => typeof s === 'string' && /[\u0000-\u001F\u007F-\u009F]/.test(s);