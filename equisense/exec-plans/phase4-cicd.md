# PHASE 4 — CI/CD 자동화 및 운영 배포 (Week 7~8)

> **원칙**: 모든 인프라 변경은 `serverless.yml` 코드로 관리합니다. GitHub Actions 파이프라인은
> 백엔드(pytest·ruff·bandit) 와 프론트엔드(eslint·jest) CI를 자동화합니다.
> EventBridge 스케줄러·WebSocket·Cognito 는 Serverless Framework 리소스로 정의합니다.

---

## 목표 (Definition of Done for Phase 4)

- **EventBridge Workers**: `MacroUpdateWorker`(매일 00:00 KST), `PriceUpdateWorker`(장중 5분마다),
  `NewsIngestionWorker`(매일 18:00 KST)가 Upstash Redis를 갱신합니다.
- **TechnicalScreener**: 저평가·단기 과열 스크리닝 로직이 Neon DB에 결과를 저장합니다.
- **WebSocket 트리오**: `WsConnectHandler`·`WsDisconnectHandler`·`WsNotifyHandler`가
  API Gateway WebSocket API에 연결됩니다.
- **Cognito Authorizer**: REST + WebSocket API 모두 Cognito JWT 검증을 통과한 요청만 허용합니다.
- **Vercel Edge Function**: Module 4 주가 데이터를 Upstash Redis 읽기 전용 토큰으로 서빙합니다.
- **CI/CD**: `main` 브랜치 병합 시 GitHub Actions가 pytest·ruff·eslint·bandit을 실행하고,
  Serverless Framework로 Lambda 무중단 배포를 자동화합니다.
- 신규 Lambda 핵심 비즈니스 로직 커버리지 **80% 이상** 유지.

---

## 태스크 분해

### Week 7: 스케줄러 Workers + TechnicalScreener + CI/CD

---

**Task 7-1: MacroUpdateWorker Lambda**

EventBridge `cron(0 15 * * ? *)` (UTC 15:00 = KST 00:00)로 트리거됩니다.
Alpha Vantage API에서 금리·CPI·실업률 등 거시 지표를 수집하여 Neon DB `macro_indicators` 테이블에 저장하고,
Upstash Redis에 `macro:{indicator}` 키로 TTL 24h 캐싱합니다.

파일:
- `backend/core/macro_updater.py` — 핵심 수집 로직
- `backend/lambdas/macro_update_worker/handler.py`
- `backend/tests/lambdas/macro_update_worker/test_handler.py`
- `backend/tests/core/test_macro_updater.py`

---

**Task 7-2: PriceUpdateWorker Lambda**

EventBridge `rate(5 minutes)` (장 중 갱신; 실제 운영 시 AWS EventBridge 시간대 조건 추가 가능)로 트리거됩니다.
Alpha Vantage Quote API에서 watchlist 종목의 최신 주가를 가져와 Upstash Redis에
`price:{ticker}` 키로 TTL 6분 캐싱합니다.

파일:
- `backend/core/price_updater.py`
- `backend/lambdas/price_update_worker/handler.py`
- `backend/tests/lambdas/price_update_worker/test_handler.py`
- `backend/tests/core/test_price_updater.py`

---

**Task 7-3: TechnicalScreener Lambda**

EventBridge `cron(0 16 * * ? *)` (장 마감 직후 UTC 16:00)로 트리거됩니다.
Neon DB에서 companies 목록을 조회하고, 각 종목의 캐싱된 주가와 52주 고저가를 이용해
저평가(현재가 < 52주 저가 × 1.2) / 단기 과열(현재가 > 52주 고가 × 0.9) 여부를 판단합니다.
결과를 Neon DB `screener_results` 테이블에 저장합니다.

파일:
- `backend/core/technical_screener.py`
- `backend/lambdas/technical_screener/handler.py`
- `backend/tests/lambdas/technical_screener/test_handler.py`
- `backend/tests/core/test_technical_screener.py`

---

**Task 7-4: GitHub Actions CI/CD 파이프라인**

`.github/workflows/ci.yml` — PR / 브랜치 push 시 실행:
  - Python: `ruff check`, `black --check`, `pytest --cov=80`, `bandit -r backend/`
  - TypeScript: `eslint`, `tsc --noEmit`, `next build`

`.github/workflows/cd.yml` — `main` 브랜치 병합 시 실행:
  - 백엔드: `serverless deploy --stage prod`
  - 프론트엔드: Vercel CLI `vercel --prod`

---

### Week 8: WebSocket + Cognito + Vercel Edge

---

**Task 8-1: WebSocket Lambda 트리오**

API Gateway WebSocket API(`$connect`, `$disconnect`, `$default`)에 매핑되는 Lambda 3개를 구현합니다.

- `WsConnectHandler`: 연결 ID를 Neon DB `ws_connections` 테이블에 저장합니다.
- `WsDisconnectHandler`: 연결 ID를 `ws_connections`에서 삭제합니다.
- `WsNotifyHandler`: `analysis_jobs` 완료 이벤트를 받아 해당 사용자의 연결 ID를 조회하고,
  API Gateway Management API로 결과를 푸시합니다. EventBridge → `WsNotifyHandler` 직접 트리거 패턴.

파일:
- `backend/lambdas/ws_connect/handler.py`
- `backend/lambdas/ws_disconnect/handler.py`
- `backend/lambdas/ws_notify/handler.py`
- `backend/tests/lambdas/ws_*/test_handler.py`

---

**Task 8-2: Cognito User Pool + API Gateway Authorizer**

`serverless.yml`에 Cognito User Pool과 REST API / WebSocket API Authorizer를 정의합니다.
프론트엔드는 `amazon-cognito-identity-js` 또는 `@aws-amplify/auth`로 JWT 토큰을 획득합니다.
`Authorization: Bearer {jwt}` 헤더로 API를 호출합니다.
`/health` 엔드포인트는 Authorizer에서 제외합니다.

---

**Task 8-3: Vercel Edge Function (Module 4 주가 서빙)**

`frontend/app/api/prices/[ticker]/route.ts` — Vercel Edge Runtime.
Upstash Redis 읽기 전용 토큰으로 `price:{ticker}` 키를 조회하고 JSON 반환합니다.
캐시 미스 시 `{ data: null, cached: false }` 를 반환하고, 클라이언트가 재시도합니다.

---

## 완료 기준 (Acceptance Criteria)

| ID | 기준 |
|----|------|
| AC-P4-001 | `MacroUpdateWorker` 수동 트리거 시 Redis `macro:*` 키가 TTL 24h로 설정됩니다 |
| AC-P4-002 | `PriceUpdateWorker` 수동 트리거 시 Redis `price:{ticker}` 키가 TTL 6분으로 설정됩니다 |
| AC-P4-003 | `TechnicalScreener` 수동 트리거 시 `screener_results` 테이블에 행이 생성됩니다 |
| AC-P4-004 | GitHub Actions CI가 PR마다 자동 실행되어 커버리지 미달·린트 오류를 차단합니다 |
| AC-P4-005 | `main` 병합 시 CD가 Lambda와 Vercel 배포를 자동 완료합니다 |
| AC-P4-006 | WebSocket `$connect` 후 `ws_connections`에 연결 ID가 저장됩니다 |
| AC-P4-007 | 분석 완료 시 `WsNotifyHandler`가 클라이언트에 결과를 푸시합니다 |
| AC-P4-008 | Cognito 토큰 없이 보호된 엔드포인트 호출 시 401이 반환됩니다 |
| AC-P4-009 | Vercel Edge Function이 Redis 캐시 히트 시 주가 JSON을 반환합니다 |

---

## 위험 요소 및 대응

| 위험 | 대응 |
|------|------|
| Alpha Vantage 무료 티어 API 한도 (5 calls/min) | `PriceUpdateWorker`에서 종목 배치를 순차 처리 + 지수 백오프 |
| WebSocket 연결 관리 복잡도 | `ws_connections` 테이블 TTL 칼럼으로 stale 연결 자동 정리 |
| Cognito 설정 오류 시 전체 API 차단 | `/health` 엔드포인트는 Authorizer 예외 처리; 스테이지별 Authorizer 분리 |
| Vercel Edge Runtime 제약 (Node.js API 일부 미지원) | `@upstash/redis` 패키지 사용 (fetch 기반, Edge 호환) |

---

_Last updated: 2026-05-20 | Phase: 4 (Week 7~8)_
