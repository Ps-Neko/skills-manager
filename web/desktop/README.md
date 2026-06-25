# Skills Manager — 데스크톱 앱 (Electron)

더블클릭 → **창**이 뜹니다. 터미널·브라우저 없이 '앱'처럼.
앱이 켜질 때 내부적으로 기존 로컬 API 서버를 **Electron의 Node**로 띄우고(별도 Node 설치 불필요한 .exe), 그 화면을 보여줘요. 읽기 전용·이 PC 전용 그대로.

## 지금 바로 창으로 띄우기 (Node가 있는 경우)
```bash
# 1) 프론트가 빌드돼 있어야 함 (한 번)
cd web/app && npm install && npm run build
# 2) 데스크톱 앱 실행
cd ../desktop && npm install      # electron 다운로드(최초 1회)
npm start                          # 창이 열립니다
```

## 진짜 무설치 .exe 만들기 (비개발자 배포용 — 윈도우에서)
```bash
cd web/app && npm install && npm run build      # 프론트 빌드
cd ../desktop && npm install
npm run dist:win                                 # → dist/ 에 설치파일(.exe) + portable
```
- 받는 사람은 **Node 없이** .exe 더블클릭만 하면 됩니다.
- mac은 `npm run dist:mac`(.dmg), Linux는 `npm run dist`(AppImage).

## 동작 구조
```
[Electron 창]  ← 화면(React, web/app/dist)
   │  loadURL(127.0.0.1:5179)
[Electron-Node]  ← main.js 가 web/server/index.js 를 ELECTRON_RUN_AS_NODE 로 부팅
   │  allowlist action
[기존 CLI]  scan.js / manage-scan.js → ~/.claude/skills
```
- `main.js` : 서버 부팅 → 준비 대기 → 창이 로컬 URL 로드, 종료 시 서버 정리, 외부 링크는 시스템 브라우저로.
- `extraResources`(package.json build): 패키징 시 server·engine·baseline·app/dist 를 앱에 동봉.

> 참고: 이 앱은 **윈도우/맥에서 빌드·실행**해야 합니다(Electron 런타임이 OS별 바이너리). 헤드리스 서버 환경에선 창이 뜨지 않아요. 서버 부팅·데이터 경로는 이미 검증됐고, 창 렌더만 실기기에서 확인하면 됩니다.
