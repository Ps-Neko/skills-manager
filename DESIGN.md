---
name: Skills Manager
description: 설치된 스킬 중복을 한 장의 평한국어 지도로 보여주는 읽기 전용 콘솔
colors:
  guide-blue: "#2f6bed"
  guide-blue-deep: "#1d4fd0"
  guide-blue-soft: "#eaf1fe"
  ink: "#1c2333"
  ink-soft: "#44505f"
  ink-faint: "#6b7589"
  cool-bg: "#f5f7fb"
  panel: "#ffffff"
  panel-raised: "#fafbfe"
  line: "#e9ecf3"
  line-soft: "#f1f3f8"
  severity-high: "#ef4444"
  severity-high-bg: "#fdecec"
  severity-mid: "#f59e0b"
  severity-mid-bg: "#fef3e2"
  severity-low: "#10b981"
  severity-low-bg: "#e7f7f1"
  severity-high-text: "#991b1b"
  severity-mid-text: "#6b3f02"
  severity-low-text: "#045132"
typography:
  display:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, Segoe UI, sans-serif"
    fontSize: "29px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, Segoe UI, sans-serif"
    fontSize: "23px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Spline Sans Mono, ui-monospace, monospace"
    fontSize: "10.5px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.05em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.guide-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "9px 15px"
  button-primary-hover:
    backgroundColor: "{colors.guide-blue-deep}"
    textColor: "#ffffff"
  button-ghost:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 15px"
  button-danger:
    backgroundColor: "{colors.severity-high}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "9px 15px"
  nav-item-active:
    backgroundColor: "{colors.guide-blue-soft}"
    textColor: "{colors.guide-blue-deep}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  stat-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "18px 20px"
  badge-high:
    backgroundColor: "{colors.severity-high-bg}"
    textColor: "{colors.severity-high}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  badge-low:
    backgroundColor: "{colors.severity-low-bg}"
    textColor: "{colors.severity-low}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  search-input:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    rounded: "11px"
    height: "40px"
    padding: "0 12px"
---

# Design System: Skills Manager

## 1. Overview

**Creative North Star: "친절한 지도방 (The Plain-Language Map Room)"**

Skills Manager는 *지도방*이다 — 사용자가 자기 스킬 환경을 위에서 내려다보며 "무엇이 겹치고, 어디서 왔는지"를 한눈에 읽는 조용한 방. 도구이되 위협하지 않고, 정보가 빽빽하되 시끄럽지 않다. 차가운 중성 배경(`#f5f7fb`) 위에 흰 패널이 떠 있고, 단 하나의 **안내의 블루(Guide Blue, #2f6bed)** 가 "여기를 보라"는 길잡이로만 절제되어 쓰인다. 화면의 90%는 잉크와 중성색이고, 색은 의미가 있을 때만 등장한다.

이 시스템은 **읽기 전용이라는 사실이 화면에서 느껴지도록** 설계된다. 어떤 버튼도 "내 설정을 망가뜨릴 수 있을 것"처럼 보이지 않는다. 중복은 빨간 경고가 아니라 중립적인 표(table)와 막대로 제시되며, 기본 결론은 언제나 "끌 건 없음"이다. 심각도 색(빨강/주황/초록)은 *경보*가 아니라 *분류 라벨*로만 기능한다.

이 시스템이 명시적으로 거부하는 것: **장난감·과한 장식**(네온, 이모지 도배, 과한 애니메이션), **복잡한 SaaS 대시보드 클리셰**(거대 숫자 카드, 그라디언트 남발, 똑같은 카드 무한 반복), **경고장·위협적인 톤**(중복을 "문제"처럼 빨갛게 도배하는 것). 따뜻함은 장식이 아니라 평한국어 라벨과 명료한 정렬에서 나온다.

**Key Characteristics:**
- 차가운 중성 캔버스 + 단 하나의 절제된 블루 길잡이
- 평소 평평하고, 상호작용에만 살짝 들리는 elevation
- 표(table)·막대 중심의 데이터 우선, 카드 남발 거부
- 평한국어 라벨, 한눈에 결론 → 깊이는 선택
- WCAG AAA 지향: 색만으로 의미를 싣지 않음

## 2. Colors

차가운 회청색 중성 위에서 단 하나의 코발트 블루가 길잡이로만 쓰이고, 의미색 셋은 분류 라벨로만 등장하는 절제된 팔레트(Restrained 전략).

### Primary
- **안내의 블루 (Guide Blue, #2f6bed):** 활성 내비게이션, 주 버튼, 강조 링크, 진행 막대. "여기를 보라"는 단 하나의 길잡이. 한 화면에서 차지하는 면적은 작을수록 좋다 — 희소함이 곧 안내력이다.
- **블루 딥 (Guide Blue Deep, #1d4fd0):** 호버·강조 텍스트·활성 라벨. 블루가 한 단계 더 진지해지는 지점.
- **블루 소프트 (Guide Blue Soft, #eaf1fe):** 활성 칩·배지의 옅은 바탕. 색을 "켜되" 소리치지 않는다. (정보/안심 노트는 블루 풀필 블록이 주 CTA와 경합하지 않게 중성 panel-2 바탕 + **작은 블루 read-only 아이콘**으로 둔다 — One Guide Rule와 "안전이 보여야 한다"를 동시에. 경보형 `.warn` 노트만 mid-bg 색.)

### Neutral
- **잉크 (Ink, #1c2333):** 본문·제목의 기본 글자색. 거의 검정에 가까운 네이비.
- **잉크 소프트 (Ink Soft, #44505f):** 보조 설명·부제·표 헤더·숫자 단위. 본문보다 한 단계 물러나되 흰/패널 위에서 **AAA(≥7:1)** 가독. (구 #5a6477은 AA에 그쳐 AAA 목표 위해 어둡게 보정.)
- **잉크 페인트 (Ink Faint, #6b7589):** 순수 장식 메타(순번·작은 출처 코드·아이콘)에만. AA 하한(≥4.5:1)은 통과하되 **must-read 본문엔 쓰지 않는다** — 그건 잉크 소프트로 올린다.
- **쿨 배경 (Cool BG, #f5f7fb):** 앱 전체 바닥. 따뜻한 크림/베이지가 아닌, 의도된 차가운 회청색.
- **패널 (Panel, #ffffff):** 카드·사이드바·표가 떠 있는 흰 표면.
- **패널 레이즈드 (Panel Raised, #fafbfe):** 검색창·내부 칩·호버 행의 미묘한 톤 바닥.
- **라인 (Line, #e9ecf3) · 라인 소프트 (Line Soft, #f1f3f8):** 경계와 내부 구분선. 그림자 대신 선이 깊이를 만든다.

### Semantic (분류 라벨 전용 — 경보 아님)
- **하이 (High, #ef4444) / bg #fdecec / text #991b1b:** 심각도 '높음' 라벨. 위협이 아니라 분류.
- **미드 (Mid, #f59e0b) / bg #fef3e2 / text #6b3f02:** 심각도 '중간' 라벨, 경고형 노트박스.
- **로우 (Low, #10b981) / bg #e7f7f1 / text #045132:** 안전·완료·"끌 건 없음"의 색. 이 도구의 기본 정서.

### Named Rules
**The One Guide Rule.** 안내의 블루는 한 화면에서 "지금 가장 중요한 한 곳"에만 쓴다. 블루가 세 군데 넘게 보이면 길잡이가 아니라 소음이다 — 하나로 줄여라.

**The Label-Not-Alarm Rule.** 빨강·주황·초록은 *분류 라벨*로만 쓴다. 중복을 빨간 경고 블록으로 도배하는 것은 금지. 이 도구는 읽기 전용이고, 겹침은 결함이 아니다.

**The Legible-Badge Rule.** 배지·칩의 *글자*는 채도 높은 fill 색(#ef4444/#f59e0b/#10b981)이 아니라 **deep 텍스트 변형**(#991b1b/#6b3f02/#045132)을 써, soft 배경 위에서 **AAA(≥7:1)**를 지킨다. 점·막대·상태등의 *fill*은 채도를 유지한다. 색 독립 라벨(한글 텍스트)이 정작 안 읽히면 색 독립이 아니다.

## 3. Typography

**Display/Body Font:** Pretendard Variable (with Pretendard, -apple-system, Segoe UI, sans-serif)
**Label/Mono Font:** Spline Sans Mono (with ui-monospace, monospace)

**Character:** 단일 휴머니스트 산세(Pretendard)가 제목부터 본문까지 무게(weight)만으로 위계를 만들고, 숫자·식별자·표 헤더·CLI 명령에는 모노(Spline Sans Mono)가 끼어들어 "기계가 읽은 사실"이라는 신호를 준다. 두 패밀리는 산세 대 모노라는 명확한 대비축 위에 있다 — 비슷한 산세 둘을 섞지 않는다.

### Hierarchy
- **Display** (800, 29px, line-height 1, -0.03em): 통계 숫자(stat number). 데이터 그 자체가 주인공인 자리. tabular-nums.
- **Headline** (800, 23px, line-height 1.1, -0.02em): 페이지 제목 h1. 강조어는 기울임 없이 블루 딥 색으로.
- **Title** (700, 15px): 패널·카드·드로어 제목. 섹션을 여는 차분한 목소리.
- **Body** (400–600, 13.5px, line-height 1.5): 본문·설명·표 셀. 긴 산문은 65–75ch로 폭을 제한.
- **Label** (600, 10.5px, 0.05em, UPPERCASE, mono): 표 헤더·식별자·단위. 모노 + 넓은 자간으로 "메타데이터"임을 표시.

### Named Rules
**The Weight-Over-Size Rule.** 위계는 폰트를 바꾸지 말고 무게(600/700/800)로 만든다. 제목용 디스플레이 서체를 새로 들이지 않는다 — 한 산세의 무게 변주로 충분하다.

**The Mono-Means-Machine Rule.** 모노는 *사람이 읽는 산문*이 아니라 *기계가 센 사실*(숫자·경로·스킬 ID·명령)에만 쓴다. 감성 강조용으로 모노를 쓰지 않는다.

## 4. Elevation

평소에는 평평하고, 상호작용에만 반응하는 시스템. 깊이는 주로 **선(line)과 면 색**으로 만들고, 그림자는 아주 은은하게 깔리다가 호버·드로어·고정 액션바에서만 또렷이 들린다. 2014년식 앱처럼 짙고 좁은 그림자는 금지 — 그림자는 넓고 옅게, 차가운 잉크 색조로.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.05)`): 카드·패널의 기본. 거의 안 보일 만큼 은은하게 면을 띄운다.
- **Lift** (`box-shadow: 0 6px 22px rgba(16,24,40,.09)`): 호버한 카드, 드로어, 고정 액션바. "지금 이건 움직인다/위에 있다"는 신호.

### Named Rules
**The Flat-By-Default Rule.** 면은 기본적으로 평평하다. 그림자는 *상태에 대한 반응*(호버·드로어·고정)으로만 또렷해진다. 정적인 화면에 Lift를 깔지 않는다.

**The Line-Before-Shadow Rule.** 두 면을 가를 때 먼저 `--line`/`--line-soft` 선을 쓴다. 그림자는 떠야 할 때만.

## 5. Components

전반의 결: **정제되고 절제된**. 뚜렷한 모서리(8–16px), 차분한 색, 부담 없는 상호작용.

### Buttons
- **Shape:** 부드러운 모서리(10px, `--r`). 알약형(999px)은 칩·배지에만.
- **Primary:** 안내의 블루 바탕 + 흰 글자, padding 9px 15px, 700 weight. 화면당 주 버튼은 하나가 이상적.
- **Hover / Focus:** 호버 시 블루 딥(#1d4fd0)으로 어두워짐, transition .14s. 포커스는 2.5px 블루 아웃라인(offset 2px) — 항상 가시.
- **Ghost:** 흰 바탕 + 잉크 글자 + 라인 테두리. 호버 시 테두리만 진해짐(#d4dae6). 보조 동작용.
- **Danger:** 하이 레드(#ef4444) 바탕 + 흰 글자. 되돌릴 수 없는 동작에만, 드물게.

### Badges / Chips
- **Style:** 알약형(999px), 10.5px 700, padding 3px 9px. 의미색 bg + 같은 계열 진한 글자.
- **Severity:** high/medium/low가 각각 hi/mid/low 색쌍. **색만으로 구분하지 않고 라벨 텍스트를 항상 동반**(색맹 대비).
- **State:** on=블루 소프트+블루 딥, off=패널 레이즈드+라인 테두리+잉크 소프트.

### Cards / Panels
- **Corner Style:** 16px(`--r-lg`) 큰 모서리.
- **Background:** 흰 패널, 헤더는 패널 레이즈드(#fafbfe) 톤.
- **Shadow Strategy:** Rest가 기본, 인터랙티브 카드(cap-card 등)는 호버 시 Lift + translateY(-2px) + 블루 테두리.
- **Border:** 1px 라인. 내부 구분은 라인 소프트.
- **Internal Padding:** 16–20px.
- **The No-Nested-Card Rule.** 카드 안에 카드를 넣지 않는다. 내부 구조는 선과 표로 가른다.

### Inputs / Fields
- **Style:** 패널 레이즈드 바탕 + 1px 라인 + 11px 모서리, height 40px.
- **Focus:** 테두리가 블루로 바뀌고 바탕이 흰색으로(`:focus-within`). 글로 효과 없음 — 차분하게.

### Tables (Signature)
- 이 콘솔의 주인공은 카드가 아니라 **표**다. 중복 분석은 표가 먼저(table-first).
- 헤더: 모노 10.5px UPPERCASE 0.05em, 잉크 소프트. 셀: 13.5px, 라인 소프트 구분선.
- 클릭 가능한 행은 호버 시 패널 레이즈드 배경. 숫자 셀은 모노 + tabular-nums.

### Bar Chart (Signature)
- 겹침 분포는 색이 아니라 **부호(`■` 진짜 같음 / `·` 역할만 다름)** 로도 구분되는 막대. 색을 못 쓰는 환경에서도 읽히는 것이 원칙.

### Navigation
- 좌측 고정 사이드바(248px). 항목: 14px 600, 잉크 소프트. 호버=패널 레이즈드, **활성=블루 소프트 바탕 + 블루 딥 글자 + 블루 아이콘**.
- 모바일(≤760px)에서는 사이드바를 숨긴다.

## 6. Do's and Don'ts

### Do:
- **Do** 안내의 블루를 화면당 "가장 중요한 한 곳"에만 써라(The One Guide Rule). 나머지는 잉크와 중성색.
- **Do** 심각도를 색 + **라벨 텍스트/형태**로 함께 표시하라 — 색맹·저시력 사용자도 읽히게(AAA 지향).
- **Do** 본문 대비를 가능한 한 ≥7:1(AAA)로. 본문에 잉크 페인트(#6b7589)를 쓰지 말고 잉크/잉크 소프트로 — 잉크 페인트는 순수 장식 메타(순번·작은 코드·아이콘)에만.
- **Do** 깊이를 먼저 선(`--line`)으로, 그림자는 호버·드로어·고정에서만(The Flat-By-Default Rule).
- **Do** 데이터는 표·막대로 먼저 보여라. 막대엔 `■`/`·` 부호를 병행해 색 없이도 읽히게.
- **Do** 모든 모션에 `@media (prefers-reduced-motion: reduce)` 대안(크로스페이드/즉시)을 둬라.
- **Do** 위계는 무게(600/700/800)로, 숫자엔 tabular-nums.

### Don't:
- **Don't** 중복을 빨간 경고 블록으로 도배하지 마라 — 겹침은 결함이 아니라 정보다(경고장·위협적인 톤 금지).
- **Don't** 거대 숫자 카드 + 그라디언트 + 똑같은 카드 무한 반복(복잡한 SaaS 대시보드 클리셰) 금지.
- **Don't** 과한 애니메이션·이모지 도배·네온 같은 장난감·과한 장식 금지.
- **Don't** 카드 안에 카드를 중첩하지 마라.
- **Don't** 1px를 넘는 색 띠(border-left/right 스트라이프)를 카드·알림 강조로 쓰지 마라.
- **Don't** 그라디언트 글자(background-clip:text)·장식용 글래스모피즘을 쓰지 마라.
- **Don't** 본문/플레이스홀더에 옅은 회색을 "우아해 보이려고" 쓰지 마라 — 가독성이 먼저.
- **Don't** 따뜻한 크림/베이지 배경으로 바꾸지 마라 — 이 시스템의 바닥은 의도된 차가운 회청색이다.
