# design-docs/api-contract.md — API Gateway 엔드포인트 계약서

> 이 문서는 EquiSense의 모든 REST API 엔드포인트의 계약을 정의합니다.
> 프론트엔드와 백엔드 간의 유일한 인터페이스 명세이므로, 변경 시 반드시 이 문서를 먼저 업데이트합니다.

---

## 공통 규칙

### 인증
모든 엔드포인트(GET /health 제외)는 `Authorization: Bearer <Cognito JWT>` 헤더를 요구합니다.

### 에러 응답 스키마
모든 에러 응답은 아래 스키마를 따릅니다.

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "사람이 읽을 수 있는 설명",
    "request_id": "uuid-v4"
  }
}
```

### 공통 에러 코드

| HTTP | code | 발생 조건 |
|------|------|----------|
| 400 | `INVALID_PARAMS` | ticker 형식 오류, market 값 오류 |
| 404 | `TICKER_NOT_FOUND` | 해당 종목의 데이터 없음 |
| 503 | `EXTERNAL_API_ERROR` | FMP 등 외부 API 재시도 초과 |
| 503 | `DB_ERROR` | Neon DB 연결 실패 |

---

## Module 1 — 펀더멘털 엔진

### GET /companies/{ticker}/fundamentals

재무제표 기반 핵심 지표와 다년도 추세를 반환합니다.

**경로 파라미터**

| 파라미터 | 형식 | 예시 | 설명 |
|---------|------|------|------|
| `ticker` | string | `005930`, `AAPL` | KR: 6자리 숫자, US: 1~5자리 대문자 |

**쿼리 파라미터**

| 파라미터 | 필수 | 값 | 설명 |
|---------|------|----|------|
| `market` | ✅ | `KR` \| `US` | 시장 구분 |

**성공 응답 200**

```json
{
  "ticker": "AAPL",
  "market": "US",
  "metrics_by_year": [
    {
      "fiscal_year": 2022,
      "roe": 175.46,
      "roa": 28.31,
      "debt_ratio": 261.45,
      "operating_margin": 30.29,
      "fcf": 111443000000.0,
      "per": null,
      "pbr": null
    }
  ],
  "trends": {
    "revenue": {
      "metric_name": "revenue",
      "values": [[2020, 274515000000.0], [2021, 365817000000.0]],
      "cagr": 15.4,
      "direction": "improving",
      "yoy_changes": [[2021, 33.3], [2022, 7.8]]
    }
  }
}
```

**캐싱:** Redis TTL 86,400초 (24시간)

**에러 코드**

| HTTP | code | 조건 |
|------|------|------|
| 400 | `INVALID_PARAMS` | ticker/market 형식 오류 |
| 404 | `TICKER_NOT_FOUND` | FMP에서 해당 종목 데이터 없음 |
| 503 | `EXTERNAL_API_ERROR` | FMP API 재시도 3회 초과 |

---

## Module 2 — 해자 트래커

### GET /companies/{ticker}/moat

분석가가 입력한 경제적 해자 점수(차원별 + 종합 등급)를 반환합니다.

**경로 파라미터**

| 파라미터 | 형식 | 예시 |
|---------|------|------|
| `ticker` | string | `005930`, `AAPL` |

**쿼리 파라미터**

| 파라미터 | 필수 | 값 |
|---------|------|----|
| `market` | ✅ | `KR` \| `US` |

**성공 응답 200**

```json
{
  "ticker": "AAPL",
  "market": "US",
  "fiscal_year": 2024,
  "dimension_scores": [
    {"dimension": "intangible_assets", "score": 9.0, "rationale": "애플 브랜드 가치 세계 1위"},
    {"dimension": "switching_costs",   "score": 8.5, "rationale": "iOS 생태계 락인"},
    {"dimension": "network_effects",   "score": 7.0, "rationale": "앱스토어 플랫폼 효과"},
    {"dimension": "cost_advantage",    "score": 5.5, "rationale": "TSMC 의존으로 비용 우위 제한적"}
  ],
  "composite_score": 7.5,
  "grade": "wide",
  "analyst_note": "브랜드와 전환비용이 핵심 해자",
  "scored_at": "2026-05-17T00:00:00Z"
}
```

**캐싱:** Redis TTL 3,600초 (1시간)

**에러 코드**

| HTTP | code | 조건 |
|------|------|------|
| 400 | `INVALID_PARAMS` | ticker/market 형식 오류 |
| 404 | `MOAT_SCORE_NOT_FOUND` | DB에 해당 종목의 해자 점수 없음 |
| 503 | `DB_ERROR` | Neon DB 연결 실패 |

---

## Module 3 — AI 정성적 분석기 (예정)

### POST /companies/{ticker}/qualitative

비동기 RAG 분석 작업을 시작합니다. 즉시 202를 반환하고 분석은 백그라운드에서 처리됩니다.

**요청 바디**

```json
{
  "market": "KR",
  "fiscal_year": 2024,
  "doc_type": "annual_report"
}
```

**성공 응답 202**

```json
{
  "job_id": "uuid-v4",
  "status": "PENDING",
  "estimated_seconds": 120
}
```

### GET /jobs/{job_id}

비동기 작업 상태와 완료 시 결과를 반환합니다.

**성공 응답 200 (COMPLETED)**

```json
{
  "job_id": "uuid-v4",
  "status": "COMPLETED",
  "result": {
    "integrity_score": 82,
    "summary_ko": "경영진은 전년도 약속한 영업이익률 30% 달성에 성공...",
    "risk_factors": [],
    "growth_drivers": [],
    "noise_filter": []
  }
}
```

---

## Module 4 — 기술적 분석 (예정)

### GET /companies/{ticker}/technical

주가 데이터 및 기술적 지표를 반환합니다.

**쿼리 파라미터**

| 파라미터 | 필수 | 값 | 기본값 |
|---------|------|----|--------|
| `market` | ✅ | `KR` \| `US` | — |
| `period` | — | `1m` \| `3m` \| `6m` \| `1y` \| `3y` | `1y` |

**캐싱:** 장 중 TTL 900초 (15분) / 장 마감 후 TTL 86,400초 (24시간)

---

## 공통 인프라

### GET /health

Lambda, Neon DB, Upstash Redis 연결 상태를 확인합니다. 인증 불필요.

**성공 응답 200**

```json
{
  "status": "ok",
  "checks": {
    "redis":    {"status": "ok"},
    "database": {"status": "ok"}
  },
  "request_id": "uuid-v4"
}
```

**장애 응답 503**

```json
{
  "status": "degraded",
  "checks": {
    "redis":    {"status": "degraded", "error": "redis unreachable"},
    "database": {"status": "ok"}
  },
  "request_id": "uuid-v4"
}
```
