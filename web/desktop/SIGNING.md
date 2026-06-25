# 코드 서명 가이드 (Windows)

이 앱의 빌드는 **환경변수가 있을 때만 서명**한다. 환경변수 없이 `npm run dist:win`을 돌리면
무서명으로 빌드된다(빌드는 항상 성공 — 인증서 존재 여부에 묶이지 않음).

서명 방식은 **PFX 파일 + `CSC_LINK`** 하나로 통일돼 있다. 지금의 자체서명도, 나중에 살
유료 인증서도 **똑같은 명령**으로 들어간다. `package.json`은 건드릴 필요 없다.

---

## 1) 현재: 자체서명(self-signed) — 개발/내 PC용

- 인증서 위치: Windows 인증서 저장소 `Cert:\CurrentUser\My`, 주체 `CN=Ps-Neko`
- PFX 백업(레포 밖): `C:\Users\Mun\.local\codesign\skills-manager-selfsigned.pfx`
- PFX 비밀번호: `skillsmanager`
- 유효기간: 2029-06-17 까지

### 서명 빌드 명령 (Git Bash 기준)
```bash
cd web/desktop
export CSC_LINK="C:/Users/Mun/.local/codesign/skills-manager-selfsigned.pfx"
export CSC_KEY_PASSWORD="skillsmanager"
npm run dist:win
```
PowerShell이면:
```powershell
$env:CSC_LINK="C:\Users\Mun\.local\codesign\skills-manager-selfsigned.pfx"
$env:CSC_KEY_PASSWORD="skillsmanager"
npm run dist:win
```

### ⚠️ 자체서명의 한계
- 서명 자체는 유효하지만, **남에게 배포하면 받는 PC에서는 여전히 SmartScreen 경고**가 뜬다
  (루트가 신뢰되지 않음 → `Get-AuthenticodeSignature` 상태가 `UnknownError/NotTrusted`).
- **내 PC(또는 인증서를 신뢰 등록한 PC)** 에서만 "검증됨/게시자 Ps-Neko"로 보이게 하려면,
  아래처럼 인증서를 신뢰 저장소에 등록해야 한다(트러스트가 넓어지니 본인 키일 때만):
  ```powershell
  $pfx='C:\Users\Mun\.local\codesign\skills-manager-selfsigned.pfx'
  $pw=ConvertTo-SecureString 'skillsmanager' -Force -AsPlainText
  Import-PfxCertificate -FilePath $pfx -CertStoreLocation Cert:\CurrentUser\Root -Password $pw
  Import-PfxCertificate -FilePath $pfx -CertStoreLocation Cert:\CurrentUser\TrustedPublisher -Password $pw
  ```
  되돌리기: 두 저장소(`Root`, `TrustedPublisher`)에서 `CN=Ps-Neko` 인증서 삭제.

---

## 2) 나중: 유료 인증서로 실제 배포 (경고 제거)

받는 사람 PC에서 경고를 없애려면 **CA가 발급한 코드서명 인증서**가 필요하다.
- OV 인증서: 저렴(연 ~10만~40만원). 평판 쌓이며 경고 사라짐.
- EV 인증서 / Azure Trusted Signing: 즉시 경고 제거(EV는 토큰/하드웨어, Azure는 월 구독).

인증서를 사면 보통 `.pfx`(또는 토큰)로 받는다. 그러면 **위 명령에서 경로/비밀번호만 바꾸면 끝**:
```bash
export CSC_LINK="경로/내-진짜-인증서.pfx"
export CSC_KEY_PASSWORD="진짜-비밀번호"
npm run dist:win
```
빌드 설정 변경 불필요. 서명되면 `Get-AuthenticodeSignature` 상태가 `Valid`로 뜬다.

---

## 3) 자체서명 인증서 완전 삭제(원복)
```powershell
Get-ChildItem Cert:\CurrentUser\My | Where-Object Subject -eq 'CN=Ps-Neko' | Remove-Item
# (신뢰 등록했다면) Root / TrustedPublisher 에서도 동일하게 삭제
Remove-Item 'C:\Users\Mun\.local\codesign\skills-manager-selfsigned.pfx'
```

---

## 참고: 아이콘
앱 아이콘은 `build/icon.ico`(256~16px 멀티사이즈) + `build/icon.png`(512px).
원본 생성 스크립트는 `_gen_icon.py`(Pillow 필요) — 디자인 바꾸려면 그 스크립트 수정 후 재실행.
