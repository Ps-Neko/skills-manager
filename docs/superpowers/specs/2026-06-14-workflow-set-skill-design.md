# 워크플로우 단계 스킬 교체 (`--set-skill`) — 설계

- 날짜: 2026-06-14
- 상태: 승인됨 (브레인스토밍 → 설계 합의 완료)
- 범위: Skills Manager 워크플로우의 **저장된 흐름에서 단계별 스킬 핀만 교체**

## 배경 / 문제

Skills Manager 워크플로우는 "작업 순서표"다. 각 단계(step)는 `capability`(하는 일)와
선택적 `skill`(그 단계에 박아 둔 스킬 핀)을 가진다.

현재 가능한 쓰기 조작:
- **저장**(`--save`, stdin JSON) — 흐름 통째 생성/덮어쓰기
- **삭제**(`--delete`) — 내 흐름 통째 제거

빠진 것: **만들어 둔 흐름에서 한 단계의 스킬 핀만 콕 집어 바꾸기.**
지금은 흐름 전체를 다시 만들어 덮어쓰는 수밖에 없다. 또한 스킬을 박는 길이
stdin JSON 하나뿐이라, 사람이 직접 한 줄로 칠 수 있는 경로가 없다.

## 목표

저장된 **내** 워크플로우에서 **N단계의 스킬 핀을 설정/교체/비우기**를 하는
결정적 단일 조작을 추가한다. 두 경로로 쓴다:
- 채팅: 사용자가 "3단계 스킬 바꿔줘" → LLM이 같은 명령을 대신 호출
- 직접 CLI: 사용자가 한 줄로 직접 타이핑

## 비목표 (의도적 제외 — YAGNI)

- 단계 추가/삭제/순서변경
- 흐름 이름(`name`)·제목(`label`) 변경
- 단계 지정을 capability 이름으로 (번호만 지원 — 출력의 "N단계"와 일치)
- capability ↔ 스킬 종류 불일치 경고(엉뚱한 스킬 박기 방지) — 필요 시 후속

## 설계

### 1. 저장모듈 함수 `setStepSkill(name, stepIndex, skillId, file)`

`workflow-store.mjs`. **인벤토리를 모르는 순수·결정적 함수** — 저장 파일만 다룬다.

- 시그니처: `setStepSkill(name, stepIndex, skillId, file = defaultUserFile())`
- `stepIndex`: **1부터 시작**하는 정수.
- `skillId`: 문자열이면 그 단계 `skill`에 박고, `null`이면 핀을 비운다.
- 검증/반환:
  | 조건 | 반환 |
  |---|---|
  | 이름 형식 불량(`validName` 실패) | `{ ok:false, reason:'invalid-name' }` |
  | 내장 템플릿 이름(`RESERVED`) | `{ ok:false, reason:'reserved' }` |
  | 내 흐름에 없음 | `{ ok:false, reason:'not-found' }` |
  | `stepIndex`가 정수 아님 / `< 1` / `> 단계수` | `{ ok:false, reason:'bad-step', stepCount }` |
  | 성공 | `{ ok:true, capability, skill: skillId }` |
- 성공 시 해당 단계의 `skill`만 바꾸고 `capability`·`note`·다른 단계는 그대로 둔 채
  `writeUser`로 파일에 반영(쓰기는 여전히 이 사용자 파일 한 곳뿐).

### 2. CLI 명령 `--set-skill`

`scan.mjs`. **`--get`과 같은 위치(인벤토리 `uniq` 계산 뒤)에 배치** — 박을 스킬이
지금 깔려 있는지 알아야 경고할 수 있으므로. 처리 후 즉시 `process.exit`.

- 형식: `node scan.mjs --set-skill <흐름이름> --step <n> --skill <스킬id | none>`
  - 예: `node scan.mjs --set-skill 내흐름 --step 3 --skill agent-skills:test-driven-development`
  - 비우기: `--skill none` (또는 `null` 또는 빈 문자열) → `skillId = null`
- 인자 검증(사용법 출력 후 exit 1):
  - `--set-skill` 값 = 흐름 이름(`requireArg`)
  - `--step` 값이 양의 정수가 아니면 사용법
  - `--skill` 플래그 자체가 없으면 사용법(비울 때도 `none`을 명시)
- **깔림 경고**: `skillId`가 `null`이 아니고 현재 설치 목록(`installedIds`)에 없으면
  `주의: '<id>'는 지금 안 깔린 스킬이에요. 그래도 박았어요(실행 때 '실종'으로 보일 수 있음).`
  를 찍고 **그대로 진행**(차단 아님). 실행 시점의 기존 `annotateMissing` '실종' 표시와 한 쌍.
- 결과/실패 문구(평한국어):
  | 사유 | 문구 |
  |---|---|
  | 성공 | `고쳤어요: <흐름>의 <n>단계(<capability>) 스킬을 '<id 또는 비움>'로 설정.` |
  | `reserved` | `내장 템플릿은 못 고쳐요. 먼저 'save'로 내 흐름으로 복제한 뒤 고치세요.` |
  | `not-found` | `내 워크플로우에 없어요: <흐름> (내장은 'workflow list'에서 확인 — 고치려면 먼저 복제).` |
  | `bad-step` | `단계 번호가 범위를 벗어났어요: <n> (이 흐름은 1~<stepCount>단계).` |
  | `invalid-name` | `이름이 올바르지 않아요(영숫자·한글·-·_ 1~40자).` |

> 알려진 사소한 엣지: `~/.claude/skills`가 아예 없으면 상위 가드(80행)가 먼저
> 종료하므로 `--set-skill`이 동작하지 않는다. Skills Manager은 스킬이 깔려 있어야 의미가
> 있으므로 실사용에서 문제 없음(문서에 명시).

### 3. SKILL.md 문서

워크플로우 모드에 **"수정 (스킬 교체) — `/skills-manager workflow set-skill`"** 절 신설:
- 채팅 흐름: 현재 박힌 스킬 + 그 단계 capability의 겹침 후보(`--json` groups)를 보여주고
  → 사용자가 고르면 → `--set-skill` 호출.
- 직접 CLI 형식 명시(위 2의 예시).
- 내장 템플릿 수정 = "먼저 복제(save) 후" 안내(`--get <내장>` → `--save <내이름>`).
- 제거는 **이미 있음**(`delete`)임을 분명히 적기(사용자 혼동 해소).

### 4. 테스트

- `test/workflow-store.test.mjs` — `setStepSkill` 단위:
  - 정상 설정(1부터 인덱스), 정상 비우기(`null`)
  - 예약 이름 거부, 없음 거부, 이름불량 거부
  - 범위밖 거부: `0`, `단계수+1`, 비정수
  - 파일 round-trip(`loadUser`로 재확인)
  - `capability`·`note`·다른 단계 보존
- `test/cli-workflow.test.mjs` — `--set-skill` 통합(임시 `SKILLS_MANAGER_HOME`):
  - 정상 exit 0 + 문구
  - `none`으로 비우기 exit 0
  - 예약·없음·범위밖 → exit 1 + 사유 문구
  - `--skill` 누락 → 사용법 exit 1
  - **확실히 없는 가짜 id**(예: `__nope__:__x__`)로 깔림경고 출력 + 여전히 exit 0 (결정적)

## 배포 주의

전역 설치본(`~/.claude/skills/skills-manager`)은 dev 레포의 구버전 복사다.
구현 후 변경 파일(`scan.mjs`·`workflow-store.mjs`·`SKILL.md` + 테스트)을
전역본에 수동 동기화해야 실제 `/skills-manager`에서 새 명령이 동작한다.

## 경계 재확인

쓰기는 오직 사용자 워크플로우 파일(`~/.claude/skills-manager-workflows.json`) 한 곳.
settings·스킬 폴더·다른 스킬은 건드리지 않는다. 스킬 끄기 없음.
