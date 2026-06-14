---
name: skills-manager
description: Skills Manager — scans the skills installed in Claude Code/Cursor and maps which ones overlap (same job across multiple sources) as a read-only, plain-Korean report, then lets you save reusable step workflows. Triggers like "스킬 정리", "스킬 충돌", "겹치는 스킬", "스킬 너무 많아", "Skills Manager", "skills manager", "skill overlap", "duplicate skills".
---

# Skills Manager — 스킬 중복 지도 + 워크플로우

**[중요] 검사·추천·실행 안내는 읽기 전용 — 스킬을 끄거나 지우지 않는다.** 쓰기는 워크플로우 저장 파일(`~/.claude/skills-manager-workflows.json`) 한 곳뿐. **스킬 끄기 기능은 없다** — 겹친 스킬 대부분이 플러그인 안에 있고 플러그인은 통째로만 꺼지는 구조적 벽이라(개인 도구로 영구 미구현).

> 실행 경로: 이 스킬 폴더(base 디렉터리)에 `scan.mjs`가 동봉돼 있다. 아래 절차의 `scan.mjs`는 그 파일이다 — base 기준 절대경로로 실행하라: `node "{이 스킬 base 디렉터리}/scan.mjs"`.

## 절차

### 1단계 — 스캔 (기계가 함)
`node scan.mjs` 를 실행한다. 이 스크립트는 `~/.claude` 의 스킬·에이전트·플러그인을 읽기 전용으로 훑어:
- gstack가 9개 surface 폴더(.cursor 등)에 둔 **미러 사본을 접고**,
- 최상위 스킬을 "gstack가 깐 것 / 진짜 독립" 으로 나누고,
- 플러그인 4개를 `enabledPlugins`(settings.json + settings.local.json 병합)로 켜짐/꺼짐 판정하고,
- **시드 키워드 표(1단)** 로 같은 일 후보를 넓게 묶는다(거짓양성 허용 = 일부러 넓게).

기본 출력(`node scan.mjs`)은 **접힌 요약**이다 — 한 줄 결론 + 큰 겹침 최대 7개 + 다음 한 수만 나온다. 처음 실행 시(저장된 흐름이 없을 때) 환영 안내 한 단락이 앞에 붙고, 이후엔 사라진다. 묶음별 분포·기본 묶음 근거·끄기 설명 전체는 `node scan.mjs --all` 로 본다.

### 2단계 — 판정 (이 명령이 도는 LLM = 너가 함)
`node scan.mjs --judge` 를 실행해 **판정 패킷**(후보 무리 + 각 스킬 한 줄 설명)을 받는다.
패킷의 설명을 읽고, 아래 **판정 루브릭**으로 각 후보를 가린다. 키워드는 이걸 못 한다 — 그래서 네가 한다.

#### 판정 루브릭
1. **같은 일 = 진짜 중복** → 작업 흐름에선 하나만 쓸 후보(끄는 게 아니라 "겹쳤다"고 표시). (예: agent-skills `test-driven-development` ↔ superpowers `test-driven-development`)
2. **역할 분담 = 중복 아님, 보존** → 단어만 같고 일이 다르면 묶지 마라.
   - 예: `plan-ceo-review`(전략) ≠ `plan-eng-review`(아키텍처) ≠ `design-review`(시각). 전부 "review"지만 별개.
   - 예: `interview-me`(의도 캐기)는 brainstorming(아이디어 생성)과 다른 일 → 보존.
3. **같은 출처의 변종은 한 묶음** → `gstack-openclaw-*` 같은 prefix 변종은 같은 출처의 사본. 출처 카운트에 안 더한다.
4. **설정 도우미는 끄는 대상 아님** → 예: `setup-deploy`(land-and-deploy 의 *설정*). 기능 중복이 아니라 동반 도구. 제외.
5. **추천 근거는 우열이 아니라 일상어** → "이게 더 좋아요"(X) / "셋 다 같은 일이라, 보통 가장 최근 쓰신 걸 '기본'으로 쓰시면 돼요"(O). 비개발자는 기술 우열 판단 못 한다.
6. **생태계 단위로 격상** → 여러 family에 같은 출처들(gstack·agent-skills·superpowers)이 반복 등장하면, "스킬 한 개씩"이 아니라 **"같은 일 하는 도구 묶음 N개가 겹쳤다 → 메인 하나 정하기"** 로 올려 말한다.
7. **플러그인은 통째로만 꺼진다(실측)** → 같은 플러그인 안 스킬 하나만 끄기는 Claude Code 미지원. "이 플러그인엔 겹치는 것 + 고유한 것이 같이 있어, 끄면 고유한 것도 잃어요" 트레이드오프를 반드시 평한국어로 보여준다.

### 3단계 — verdict 출력 (평한국어, 비개발자용)
판정 결과를 데이브(AI로 빌드하는 비개발자)가 바로 읽게 찍는다. **반드시 지킬 규칙**:
- **영어 스킬/함수 이름 금지.** `test-driven-development`·`gstack:review` 같은 이름 대신 무슨 일인지 한국어 라벨로(scan 출력의 라벨 그대로). 단 **흔한 개발 용어(디버깅·스펙·TDD·리뷰)는 그대로 써도 됨** — 사용자는 안다.
- **내부 전문어 금지.** `capability`·`duplicateLevel`·"출처"는 빼고 "묶음"으로. 단 **숫자는 디지털 그대로(3곳·124개)** — 말로 풀지 마라("세 곳" X).
- **이모지·아이콘 금지.**
- **담백하게.** "쉬운 말로"·과한 안심 문구·유치한 풀어쓰기 금지. 정보는 충분히, 톤은 깔끔하게.
- **한 줄 결론 먼저.** 맨 위에 "끌 필요 없고, 자주 하는 작업을 흐름으로 저장하면 됨" 같은 한 줄.
- **역할 다른 것 가려주기.** 키워드로 묶였어도 일이 다르면(예: 아이디어/브레인스토밍 6곳 중 '캐묻기'·'상담'은 다른 일) "진짜 겹친 건 2곳"으로.
- **왜 겹치나 + 고유 역할 (진짜 겹친 묶음 1~2개만).** 가장 중요한 겹침 묶음 1~2개엔 두 가지를 덧붙인다 — (a) **겹치는 프롬프트 예시** 한 줄: "이 PR 리뷰해줘" 한마디에 리뷰 묶음이 같이 걸린다는 식으로 *왜* 겹치는지 보여준다. (b) 키워드로 같이 묶였지만 **역할이 다른 멤버는 각자 고유 역할 한 줄**(예: 머지 전 일반 리뷰 / 여러 기준 품질 리뷰 / 보안 중심). 이게 Skills Manager의 차별점 — "겹친다"만이 아니라 "왜 겹치고, 각자 뭐가 다른지"까지. 단 **담백하게: 모든 묶음에 달지 말고 핵심 1~2개만**(나머지는 'N곳' 카운트로 충분).

좋은 예시 — 이 틀·톤을 따르고, 라벨은 scan 출력과 일치시켜라:

> **한눈에**: 스킬 124개 중 같은 일이 8가지 겹침. 끌 필요 없고, 자주 하는 작업을 흐름으로 저장하면 됨.
> **겹친 일들**: 테스트 먼저 짜기 (TDD) 3곳 / 코드 리뷰 4곳(진짜 겹친 건 2곳 — 받기·요청은 다른 일) / 디버깅 4곳 / 계획 세우기·스펙 작성·보안 점검 각 2곳 / 아이디어/브레인스토밍 6곳(진짜 2곳 — 캐묻기·상담은 다른 일) / 배포/출시 3곳
> **왜 겹치나 (코드 리뷰)**: "이 PR 리뷰해줘" 한마디에 리뷰 묶음이 같이 걸림. 단 '리뷰 받아 반영'·'리뷰 요청'은 다른 일이라 빼면, 진짜 겹치는 둘은 — 하나는 머지 전 일반 리뷰, 하나는 여러 기준 품질 리뷰. 자주 쓰는 하나로 통일하면 됨.
> **그래서**: 끄는 건 거의 안 됨(묶음이 통째로만 꺼져서 고유한 것까지 잃음). 자주 하는 작업을 `/skills-manager workflow save 내흐름`으로 저장해 쓰면 됨.

---

## 추천 모드 (recommend) — v0.2

트리거: `/skills-manager recommend "<작업>"` 또는 "이 작업 뭐 쓰지?" / "기획부터 구현까지" / "배포 전 점검" 같은 자연어.

### 차별화 원칙 (꼭 지킬 것)
이건 **"스킬 하나 추천"이 아니다** — 그건 Claude Code가 이미 스킬 설명 읽고 한다. 그걸 또 하면 무의미.
Skills Manager recommend의 가치는 **호스트가 구조상 못 하는 것**:
> **네 작업을 [단계 흐름]으로 펴고, 단계마다 네가 실제로 깐 (중복 포함) 스킬 중 하나로 정리해준다.**
즉 "이 작업 = 5단계, 3단계엔 네가 깐 TDD 3개가 겹치니 그중 하나만" — **네 인벤토리 전체를 가로질러 중복까지 해소한 순서**. 단일 생태계는 자기 위에서 이걸 못 한다.

### 절차
1. `node scan.mjs --json` 실행 → 인벤토리(skills+capabilities, groups+duplicateLevel) 확보.
2. **작업 → capability 순서로 매핑** (네가 판단). 흔한 흐름 anchor (capability = scan의 cap):
   - 기능 개발: `brainstorm → spec → plan → (구현) → tdd → review`
   - 버그 수정: `debug → tdd(회귀) → review`
   - 배포 전 점검: `tdd → security → ship`
   - 리팩터링: `simplify → tdd → review`
   - 코드 리뷰: `review`
   (anchor일 뿐 — 작업에 맞게 유연하게. `(구현)`처럼 cap 없는 단계는 "기본 Claude로"라 표기.)
3. **단계별로 인벤토리에서 그 capability 가진 스킬을 찾는다**:
   - **1개** → 그걸 쓰면 됨.
   - **여러 개**(groups에서 duplicateLevel=high) → **하나만 고르고** "이 단계엔 이 N개가 겹치니 하나만(나머지 이 흐름선 불필요)". 고르는 근거 = 사용자가 메인 정했으면 그것 / 안 정했으면 후보 나열 + 일상어 한 줄 추천(우열 단정 금지).
   - **0개** → "이 단계 맡을 스킬이 없어요 — 기본 Claude로 진행하거나 그 묶음을 찾아보세요."
4. **평한국어로 단계 흐름 출력** (코드/플래그 나열 금지). 끝에: 겹쳐서 뺀 게 있으면 "이 흐름에선 N개는 안 써도 돼요" 한 줄.

### 경계 (추천 모드도)
읽기 전용 — **추천만**. 스킬을 끄거나 실행하거나 설정을 바꾸지 않는다.

---

## 워크플로우 모드 (workflow) — v0.3

트리거: `/skills-manager workflow <name>` 또는 `/skills-manager workflow list`.

추천 모드의 **이름 붙은 재사용 버전**이다. 자유 작업문 대신 미리 정의된 흐름(app-dev·bugfix·release-check·code-review·refactor)을 골라, 그 단계 시퀀스를 네 인벤토리로 해소한다.

### 절차
1. `node scan.mjs --workflows` → 워크플로우 목록 + **각 단계의 쓸 스킬**(인벤토리로 해소한 단계별 표; `--workflows --json`이면 각 step에 `resolved` 부착). `list`면 여기서 끝 — 단, 아래 '표 제시' 규칙대로 찍는다.
2. 고른 `<name>` 템플릿을 읽는다 (이 스킬 폴더의 `workflows.json`). 없는 이름이면 목록 보여주고 되묻기.
3. 템플릿의 각 step(capability)을 **추천 모드 절차와 똑같이** 해소: `scan.mjs --json` 인벤토리에서 그 capability 가진 스킬 찾기 → 1개면 그것 / 여러 개(중복)면 하나만+나머지 불필요 / 0개면 "기본 Claude로".
4. 평한국어로 이름 붙은 흐름 출력.

### 표 제시 (list/run 공통)
`--workflows`(또는 `--workflows --json`)의 각 단계 `resolved`를 **그대로 베끼지 말고 2단 판정**을 입혀 찍는다. scan의 `N곳`은 1단(넓게)이라 역할 다른 후보까지 센다.
- 단계의 `resolved.skills`에 **판정 루브릭**(역할 분담=보존)을 적용해 "진짜 N곳"으로 보정한다. 예: 아이디어 단계 6곳이어도 캐묻기·상담·의도 캐기를 빼면 진짜 2곳 → `6곳 매칭(진짜 2곳) — superpowers·agent-skills 중 하나`. 코드 리뷰 4곳 → 받기·요청 빼고 진짜 2곳.
- `kind:'none'`은 "기본 Claude로". `kind:'pinned'`은 사용자가 박은 고정 스킬 — **실종 여부는 `--workflows` 표/JSON엔 안 나온다**(그 경로는 installed를 안 따짐). 실행/제시 전 `--get <이름>`(워크플로우당 1회 호출)의 `installed:false`로 따로 확인해 실종 핀만 경고하라. `--workflows` 출력만 보고 "실종"을 단정하지 말 것.
- **평한국어 규칙**(영어 스킬 이름 금지·출처 브랜드명/한국어 라벨만·이모지 금지·담백)을 똑같이 지킨다. capability 라벨은 `resolved.label` 그대로.

### 커스텀
사용자가 `workflows.json`에 항목을 추가/수정하면 새 흐름이 생긴다. capability는 scan의 cap(tdd·review·plan·debug·brainstorm·spec·ship·security·simplify)이면 자동 해소, 그 외(implement 등)는 "기본 Claude로" 표기.

### 저장 (save) — `/skills-manager workflow save <이름>`
0. `recommend` 또는 `workflow <이름>` 결과를 보여준 뒤, **먼저 제안한다**: "이대로 자주 쓰면 '이걸로 저장'이라고 하세요." — 사용자가 명시적으로 요청하면 아래로 진행한다.
1. 저장할 흐름을 확보: (a) 직전 `recommend`/`workflow <name>` 결과를 쓰거나, (b) 사용자와 단계를 정한다.
2. 중복(여러 출처) 단계는 사용자에게 **하나를 고르게** 해 고정한다(`"출처:이름"`). 못 고르거나 없으면 `skill: null`.
3. 완성한 워크플로우 JSON을 `node scan.mjs --save "<이름>"` 의 stdin 으로 넘긴다(형식: `{ "label": "...", "steps": [{ "capability": "...", "skill": "출처:이름"|null, "note": "" }] }`). Windows 셸 이스케이프 문제로 직접 명령행 붙여넣기는 쓰지 않는다 — 항상 대화 경로(호스트가 stdin 구성)로 진행한다.
4. 결과 문구(저장/덮어씀/실패 사유)를 평한국어로 그대로 전한다.

### 수정 (스킬 교체) — `/skills-manager workflow set-skill <이름>`
저장한 내 흐름에서 **한 단계의 스킬 핀만** 바꾼다(단계 추가/삭제·이름변경은 안 함).
1. `node scan.mjs --get "<이름>"` 으로 현재 단계와 박힌 스킬을 읽는다.
2. 바꿀 단계의 capability에 겹침 후보가 여럿이면(`scan.mjs --json` groups) 후보를 보여주고 사용자가 하나 고르게 한다(우열 단정 금지).
3. `node scan.mjs --set-skill "<이름>" --step <번호(1부터)> --skill "<출처:스킬>"` 호출. 비우려면 `--skill none`.
   - 직접 CLI 예: `node scan.mjs --set-skill 내흐름 --step 3 --skill agent-skills:test-driven-development`
4. 결과 문구를 평한국어로 그대로 전한다. 안 깔린 스킬이면 "주의…" 경고가 함께 나오지만 그대로 박힌다(실행 때 '실종' 표시로 다시 잡힘).
- **내장 템플릿은 직접 못 고친다** — 먼저 `--get <내장>` 으로 받아 `--save <내이름>` 으로 내 흐름에 복제한 뒤 고친다.
- **제거는 이미 있다** → 아래 `### 삭제 (delete)` 참고. (수정·제거가 둘 다 된다.)

### 실행 (run) — `/skills-manager workflow <이름>` 또는 `workflow run <이름>`
1. `node scan.mjs --get "<이름>"` 으로 워크플로우(고정스킬 `installed` 표시 포함)를 읽는다. `not-found` 면 `--workflows` 목록을 보여주고 되묻는다.
2. 단계별로 안내한다: 각 단계의 capability + 고정 스킬을 "이 단계엔 이거 쓰세요"로. `skill:null`/cap 없음은 "기본 Claude로".
3. **이번엔 다른 거**: 사용자가 바꾸려 하면 그 capability의 중복 후보(`scan.mjs --json` groups)를 보여주고 **이번 실행만** 교체한다. 저장본은 사용자가 "이걸로 바꿔 저장"이라 해야 `save`로 갱신.
4. **고정 스킬 실종**(`installed:false`): "이 단계에 고정했던 X가 지금 안 보여요" + 그 capability의 현재 후보를 제시해 다시 고르게 한다. 절대 멈추지 말 것.
5. Skills Manager는 **조언만** 한다 — 실제 작업은 호스트가. 스킬을 자동 실행하지 않는다.

### 삭제 (delete) — `/skills-manager workflow delete <이름>`
`node scan.mjs --delete "<이름>"`. 내 워크플로우만 지워진다(내장 템플릿은 못 지움 — 그대로 안내). 지우기 전 한 번 확인.

### 경계
읽기 전용 — 흐름·추천·실행 안내만. **쓰기는 오직 내가 저장한 워크플로우 파일(`~/.claude/skills-manager-workflows.json`) 한 곳뿐** — settings.json·스킬 폴더·다른 스킬은 절대 안 건드린다(스킬 끄기 없음). 실제 작업 실행도 없음(조언자).

## 경계 (전체)
- 검사·추천·실행 안내 = 읽기 전용. settings.json·스킬 폴더·다른 스킬을 **건드리지 않는다**.
- 쓰기는 워크플로우 저장 파일(`~/.claude/skills-manager-workflows.json`) 한 곳뿐.
- **스킬 끄기는 없다** — 겹친 스킬 대부분이 플러그인 안이고 플러그인은 통째로만 꺼지는 구조적 벽(개인 도구로 영구 미구현).
- 자기 출력/아카이브 폴더(`.skill-janitor-archive`)는 스캔에서 영구 제외(자기오염 금지).
