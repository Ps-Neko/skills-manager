# Skills Manager — Local CLI Web Console

기존 CLI(`scan.js` · `manage-scan.js`)를 웹에서 안전하게 조작하는 **로컬 콘솔**.

```
웹 UI(React) → 로컬 API 서버(server/) → 기존 CLI 실행 → ~/.claude/skills 실제 스캔
```

- `127.0.0.1` 전용 · **검사·추천은 읽기 전용**. 스킬 정리(휴지통 이동)만 직접 확인하실 때 실행되는 유일한 쓰기이고 되돌릴 수 있습니다. 스킬 정보는 클라우드로 보내지 않습니다.
- 프론트는 `command`가 아니라 **action**만 호출 — 서버가 allowlist로 고정 인자만 `execFile`식 실행(명령 주입 차단).

## 구조
```
web/
  server/                 로컬 API (의존성 0, node:http)
    index.js              127.0.0.1, /api/* + 빌드된 앱 서빙, allowlist 라우팅
    cli-runner.js         허용된 CLI 액션만 실행 + 스킬 이름 검증
    dto.js                CLI --json → UI DTO 정규화 (중복도·권장액션, 출처 기반)
    routes/{status,scan,workflows,manage}.js
  app/                    React + Vite + TypeScript + TanStack Query
    src/lib/              api.ts · queries.ts · types.ts
    src/components/       Shell · DuplicateTable · ui(Card/Badge/Skeleton/Error/Drawer)
    src/pages/            Dashboard · Duplicates · Recommend · Workflows · Cleanup · Settings
```

## 실행
처음 한 번:
```bash
cd web
npm run setup        # web/app 의존성 설치
npm run build        # React 앱 빌드 → app/dist
```
서버 켜기(빌드된 앱 + API 동시 서빙):
```bash
npm start            # http://127.0.0.1:5179
```
개발 모드(핫리로드 · 터미널 2개):
```bash
npm run dev:api      # API 5179
npm run dev:web      # Vite 5173 (/api → 5179 프록시) → http://localhost:5173
```
`~/.claude` 없이 화면만 보기(데모 · 스냅샷):
```bash
# macOS/Linux
SMW_FIXTURE=1 node server/index.js
# Windows PowerShell
$env:SMW_FIXTURE=1; node server/index.js
# Windows cmd
set SMW_FIXTURE=1 && node server/index.js
```

## API
| 액션 | 엔드포인트 | 내부 CLI |
|---|---|---|
| 상태 | `GET /api/status` | 요약 + 연결/읽기전용 |
| 스캔 | `GET /api/scan` | `scan.js --json` → {summary, duplicates} |
| 추천 | `GET /api/recommend` | scan 정규화 |
| 워크플로우 | `GET /api/workflows` | `scan.js --workflows --json` |
| 정리 상태 | `GET /api/manage/update-status` | `manage-scan.js --update-status` |
| 잔여물 | `GET /api/manage/residue/:skill` | `manage-scan.js --residue <skill>` |
| 제거 미리보기 | `POST /api/manage/remove-preview` | `manage-scan.js --remove <skill>` (dry-run) |
| 제거 확인 | `POST /api/manage/remove-confirm` | `manage-scan.js --remove <skill> --confirm <token>` |

제거는 항상 **미리보기 → 서버 발급 토큰 확인 → 되돌릴 수 있는 휴지통 이동** 순서. 영구 삭제 아님.

> 참고: 같은 폴더의 옛 `serve.js` + `web/index.html|css|js`는 이전 무빌드(정적) 버전입니다. 이 콘솔과 무관하며 지워도 됩니다.
