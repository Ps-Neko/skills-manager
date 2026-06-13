# skillsweep (스킬쓸이)

> Claude Code / Cursor에 깔린 스킬들이 **같은 일을 여러 개 중복**으로 하고 있는지 한 장의 평한국어 지도로 보여주는 **읽기 전용** 명령.
> *A read-only command that maps which of your installed Claude Code/Cursor skills overlap (same job, multiple sources).*

스킬 묶음을 여러 개(gstack · superpowers · agent-skills · 직접 설치 …) 깔다 보면, 같은 일을 하는 스킬이 출처마다 중복됩니다. skillsweep은 그걸 한눈에 보여줍니다 — **아무것도 끄거나 지우지 않고**, 읽기만 합니다.

## 무엇을 보여주나
- **총 스킬 수** (도구 호환용 미러 사본은 접어서 1로 셈 — 600개처럼 보이던 게 실은 ~100개)
- **출처별 분포** (어느 묶음에서 왔나) + 플러그인 켜짐/꺼짐
- **같은 일이 겹친 곳** (TDD·코드리뷰·디버깅·브레인스토밍·계획·스펙·배포·보안 …)
- **출처별 커버 점수** — "메인 하나 정하기"의 근거

판정은 2단계입니다: 키워드로 후보를 넓게 묶고(1단), 그 위에서 LLM이 설명을 읽어 **진짜 중복인지 / 역할만 다른지**(예: `plan-ceo-review` ≠ `plan-eng-review`)를 가립니다(2단).

## 안전
- **읽기 전용.** 스킬을 끄거나 지우거나 설정을 바꾸지 않습니다.
- 정리(끄기) 기능은 로드맵(아래)이며, 만들 때도 **백업 후 동의받고 되돌릴 수 있게** 합니다.

## 설치
이 폴더를 Claude Code 스킬 위치에 둡니다:
```
~/.claude/skills/skillsweep/
   ├─ SKILL.md
   └─ scan.mjs
```
또는 clone 후 복사:
```
git clone https://github.com/Ps-Neko/skillsweep.git
```

## 사용
- **Claude Code 안에서**: `/skillsweep` 또는 "스킬 정리해줘"
- **직접 실행**: `node scan.mjs` (충돌 정밀 판정 패킷까지: `node scan.mjs --judge`)

### 출력 예시 (요약)
```
🧹  스킬쓸이 — 검사 결과   (읽기 전용)
내 스킬: 의미 단위로 약 100개   (도구용 사본 480여 벌은 접음)
⚠️ 같은 일이 여러 출처에 겹침 — 8군데
  • 테스트 먼저(TDD) — agent-skills · superpowers …
✅ 정리하면(무리마다 1개): 약 18개를 끌 수 있어요
충돌영역 커버: agent-skills 8/8 · gstack 6/8 · superpowers 5/8 …
```

## 요구사항
- Node.js (의존성 0)

## 상태 / 로드맵
- ✅ **slice1 — 검사관**: 스캔 → 충돌 지도 → 2단 판정 (현재, 읽기 전용)
- ⬜ **slice2 — 정리**: 동의받고 한 번에 끄기 + 되돌리기 (백업 안전장치 먼저)
- ⬜ **slice3 — 통합 흐름**: 정리된 스킬로 기획→스펙→개발→검증→유지 안내

초기 단계입니다. 피드백 환영.

## 라이선스
MIT
