# workflow 표에 "쓸 스킬" 채우기 — 설계

작성: 2026-06-14 · 브랜치: `feat/workflow-list-skills`

## 문제

`/skills-manager workflow list`(= `scan.mjs --workflows`)는 각 단계의 capability 이름만
잇고(`brainstorm → spec → plan → ...`), 그 단계에 지금 깔린 **실제 스킬**이 무엇인지는
안 보여준다. 해소 로직 자체는 이미 `--json`의 `groups`(capability→스킬 매핑)에 있는데
`--workflows`가 인벤토리 스캔 전에 일찍 빠져나가 쓰지 못한다.

목표: `workflow list`(와 `workflow <name>`)가 단계마다 어떤 스킬이 걸리는지를
**단계별 표(펼침)**로 보여준다.

## 핵심 원칙 — 1단 기계 / 2단 LLM 판정 분리 유지

이 도구의 기존 구조를 그대로 따른다.

- **기계(scan.mjs) = 1단, 넓게·결정적**: 각 단계의 capability를 살아있는 인벤토리에
  대고 풀어 "몇 곳·어느 출처"를 뽑는다. 키워드 매칭이라 일부러 넓다(예: 아이디어 6곳).
- **LLM 표 제시 = 2단, 판정**: 표를 찍을 때 판정 루브릭을 적용해 "진짜 N곳"으로
  보정하고(아이디어 6→2, 코드 리뷰 4→2) 역할 다른 건 빼서 라벨링한다. 승인된
  미리보기의 "(진짜 N곳)"이 이 층의 산출.

이렇게 나누면 scan은 결정적·테스트 가능하게 유지되고, 판정 뉘앙스는 LLM이 맡아
인벤토리가 바뀌어도 굳지 않는다. (판정 뉘앙스를 scan에 하드코딩하지 않는다.)

## 컴포넌트

### 1. `resolveSteps()` — 새 순수 함수 (workflow-store.mjs)

입력: 워크플로우 1건 + `groupsByCap`(capability→`{label, skills:[id], sources:[src]}`).
출력: 각 단계에 `resolved` 부착.

```
resolved = {
  kind: 'pinned' | 'multi' | 'single' | 'none',
  skills: [id...],     // pinned면 [고정스킬], 없으면 []
  sources: [src...],
  count: number,
}
```

- 단계에 `skill`(사용자 고정핀)이 있으면 → `kind:'pinned'`, `skills:[s.skill]`,
  `sources:[s.skill 앞부분]`, `count:1`. (installed 여부는 기존 `annotateMissing` 책임.)
- 핀 없고 capability가 groupsByCap에 있으면 → 출처 ≥2면 `'multi'`, 1이면 `'single'`,
  `skills/sources/count`는 그룹 값.
- capability가 groupsByCap에 없거나 스킬 0 → `'none'` (표에선 "기본 Claude로").

순수 함수 → 가짜 `groupsByCap`로 환경 독립 단위 테스트.

### 2. scan.mjs 정리

- 인벤토리(gstack 이름·최상위 스킬·플러그인·agents·`uniq`)와 `groups` 빌드를
  함수로 추출해 `--workflows`도 쓰게 한다.
- 스킬 폴더(`~/.claude/skills`)가 없으면 빈 인벤토리/빈 groups를 돌려주고 **안 죽는다**
  (`--workflows`는 인벤토리가 비어도 워크플로우 목록은 보여줘야 함).
- `--save`·`--delete`는 인벤토리가 필요 없으니 지금처럼 일찍 처리(변경 없음).
- `--workflows` 처리 블록을 인벤토리 빌드 **뒤로** 옮긴다.

### 3. `--workflows` 글자 표 (text 모드)

워크플로우마다 표:

```
[새 기능 개발 · app-dev]
 #  일                     쓸 스킬
 1  아이디어/브레인스토밍  6곳 — .agents·gstack·agent-skills·superpowers 중 하나
 2  스펙 작성              2곳 — gstack·agent-skills 중 하나
 ...
 4  구현                   기본 Claude로 (전담 스킬 없음)
```

- "일" = capability 한국어 라벨. 있으면 groups의 label, 없는 capability(implement 등)는
  작은 라벨 표(implement→구현)로, 그래도 없으면 capability 원문. (단계 note는 verbose라
  표 라벨로 안 씀.)
- "쓸 스킬" = 넓은 값: `N곳 — 출처·출처 중 하나` / `기본 Claude로` / (내 흐름이면 고정 스킬).
- 여기엔 판정 보정("진짜 N곳")을 넣지 않는다 — 그건 LLM 제시 층.
- 영어 스킬 이름 대신 출처 브랜드명(gstack·agent-skills…, 이미 scan에서 쓰는 표기)과
  한국어 capability 라벨만. 평한국어 규칙 준수.

### 4. `--workflows --json`

각 단계에 `resolved`를 추가. 기존 `name/source/label/steps` 필드는 유지
(기존 `--workflows --json` 테스트가 `source==='user'`를 검사 → green 유지).
LLM이 판정 보정할 원본 데이터.

### 5. SKILL.md

workflow list / 실행(run) 절차 갱신:
- 표가 이제 단계별 스킬까지 보여준다고 명시.
- 제시할 때 각 단계의 `resolved.skills`에 **판정 루브릭**을 적용해 "진짜 N곳"으로
  보정하고(역할 다른 멤버 제외) 평한국어 규칙으로 찍으라고 안내.

## 경계 (안 하는 것)

- 판정 뉘앙스를 scan.mjs에 하드코딩하지 않음(2단은 LLM 몫 유지).
- recommend/run의 핵심 로직은 표 외엔 안 건드림.
- settings·스킬 폴더·다른 스킬 안 건드림(읽기 전용 경계 유지).
- 쓰기는 여전히 워크플로우 저장 파일 한 곳뿐.

## 테스트

1. `resolveSteps` 단위: 고정핀 / 여러곳 / 한곳 / 없음(미지 capability) 4종 — 가짜
   groupsByCap, 환경 독립.
2. `--workflows --json`에 각 단계 `resolved` 존재(구조 검증, 카운트는 환경 의존이라
   값 단정 안 함).
3. `--workflows` 글자 표에 표 머리/한국어 라벨 존재.
4. 리팩터 전: `--json` 구조 특성 테스트 1개 추가(version/counts/groups 키 존재) —
   리팩터가 조용히 깨지 않게.
5. 기존 33개 전부 green 유지.

테스트 러너: `node --test "test/*.test.mjs"`.

## 동기화

dev(`workspace/skillsweep`) 통과 후 전역 런타임 사본
(`~/.claude/skills/skills-manager`)에 변경 파일 수동 동기화(scan.mjs·workflow-store.mjs·
SKILL.md). 전역본은 구버전 복사라 자동 반영 안 됨.
