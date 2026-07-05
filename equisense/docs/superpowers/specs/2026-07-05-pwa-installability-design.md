# PWA 설치 가능성 추가 설계

## 개요

EquiSense에 PWA(홈 화면 설치, standalone 창 모드)를 추가한다. **오프라인 지원은 범위 밖** — 주식 데이터/인증은 항상 네트워크가 필요하므로 오프라인 캐싱은 오히려 혼란을 줄 수 있어 제외한다. 서비스워커도 추가하지 않는다: 현재 Chrome/Edge의 설치 가능 기준은 서비스워커를 요구하지 않고, iOS Safari의 "홈 화면에 추가"는 애초에 서비스워커 없이 동작한다.

범위: 아이콘 세트 생성, 정적 매니페스트 파일 1개, `app/layout.tsx`의 `<head>`/`viewport` 보강. 새 컴포넌트나 빌드 스크립트는 만들지 않는다.

---

## 1. 아이콘 (`frontend/public/icons/`)

기존 `app/favicon.ico`의 256×256 프레임(검은 원 + 흰 삼각형)을 소스로 삼되, 래스터 업스케일 대신 동일한 도형을 512px로 재렌더링해 선명하게 만든다.

- `icon-192.png`, `icon-512.png` — purpose `any`. 도형 그대로(투명 배경), 원이 캔버스 대부분을 채우는 현재 비율 유지
- `icon-512-maskable.png` — purpose `maskable`. OS가 원형/스퀴클 마스크를 씌워도 삼각형이 잘리지 않도록 도형을 안전영역(중앙 80%) 안으로 축소하고, 캔버스 전체를 검은 배경으로 채움
- `apple-touch-icon.png` (180×180) — iOS 홈 화면용. 검은 배경(투명 배경은 iOS가 임의로 채우므로 명시적으로 지정)

## 2. 매니페스트 (`frontend/public/manifest.webmanifest`)

정적 JSON 파일로 추가. `start_url`/`scope`는 `"."`, 아이콘 `src`는 `"icons/icon-192.png"`처럼 **상대경로**로 작성한다 — 매니페스트 자신의 URL을 기준으로 브라우저가 해석하므로, basePath가 `''`(로컬 dev)이든 `/equisense`(배포)든 코드 수정 없이 그대로 맞는다.

```json
{
  "name": "Equity-Sense (EquiSense)",
  "short_name": "EquiSense",
  "description": "펀더멘털 · 해자 · 정성적 · 기술적 분석을 한 곳에서",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "background_color": "#fbfaf7",
  "theme_color": "#1b1a15",
  "lang": "ko",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`background_color`/`theme_color`는 라이트 테마 기본값(`--bg #fbfaf7`, `--ink #1b1a15`) 기준 정적 값. 다크모드는 수동 토글(localStorage `eq-theme`)이라 실시간 동기화는 범위 밖.

## 3. `frontend/app/layout.tsx` 보강

기존 패턴(수동 `<head>` 태그, `next.config.ts`와 동일한 `const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''`)을 그대로 따른다.

- `<head>`에 추가:
  - `<link rel="manifest" href={`${basePath}/manifest.webmanifest`} />`
  - `<link rel="apple-touch-icon" href={`${basePath}/icons/apple-touch-icon.png`} />`
  - `<meta name="apple-mobile-web-app-capable" content="yes" />`
  - `<meta name="apple-mobile-web-app-title" content="EquiSense" />`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`
- 새 `viewport` export 추가 (Next 16에서 `metadata.themeColor`는 deprecated, `viewport` 설정 사용 필수):
  ```ts
  export const viewport: Viewport = { themeColor: '#1b1a15' }
  ```
  매니페스트의 `theme_color`와 동일한 값(잉크색)으로 맞춰 브라우저 주소창/설치된 앱 타이틀바 색상을 일관되게 유지한다.

## 4. 검증

- `next build` (basePath 없음 / `NEXT_PUBLIC_BASE_PATH=/equisense` 두 경우 모두)로 정적 export 후 `out/`에 `manifest.webmanifest`, `icons/*`가 나오는지 확인
- 로컬 정적 서버로 `out/`을 띄워 Chrome DevTools → Application → Manifest 탭에서 아이콘 404 없이 installable로 인식되는지 확인
- 별도 자동 테스트는 추가하지 않음 (정적 자산 + head 태그 변경, 로직 없음)
