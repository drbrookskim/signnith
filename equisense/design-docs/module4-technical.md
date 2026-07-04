# design-docs/module4-technical.md — 기술적 분석 엔진

> 이 문서는 Module 4의 주가 데이터 조회 및 기술적 지표 상세 설계를 정의합니다.
> 동기형 Lambda(TTL 15분/24시간 캐싱)로 구현합니다.

---

## 1. 모듈 목적

사용자가 종목코드와 기간(1M/3M/6M/1Y/3Y)을 선택하면 해당 기간의 일별 주가
(시가·고가·저가·종가·거래량)와 기간 수익률, 구간 고/저가, 평균 거래량 등
요약 통계를 반환합니다.

---

## 2. 엔드포인트 설계

### GET /companies/{ticker}/technical

**경로 파라미터**

| 파라미터 | 형식 | 예시 |
|---------|------|------|
| `ticker` | string | `AAPL`, `005930` |

**쿼리 파라미터**

| 파라미터 | 필수 | 기본값 | 허용값 |
|---------|------|--------|--------|
| `market` | ✅ | — | `KR` \| `US` |
| `period` | ❌ | `1y` | `1m` \| `3m` \| `6m` \| `1y` \| `3y` |

**기간 정의**

| period | 조회 일수 |
|--------|----------|
| `1m` | 30 |
| `3m` | 90 |
| `6m` | 180 |
| `1y` | 365 |
| `3y` | 1,095 |

**성공 응답 200**

```json
{
  "ticker": "AAPL",
  "market": "US",
  "period": "1y",
  "data_points": [
    {
      "date": "2024-05-20",
      "open": 189.50,
      "high": 191.20,
      "low": 188.30,
      "close": 190.45,
      "volume": 52000000,
      "change_pct": 0.46
    }
  ],
  "summary": {
    "start_price": 165.30,
    "end_price": 190.45,
    "period_return_pct": 15.2,
    "high_period": 220.00,
    "low_period": 160.00,
    "avg_volume": 55000000
  }
}
```

> **참고:** `high_period`·`low_period`는 요청된 기간 내 일중 고/저가 기준입니다.
> 52주 고/저가와 다를 수 있으며, 이는 Phase 3에서 별도 쿼리로 보완합니다.

---

## 3. 외부 API: FMP Historical Price

```
GET https://financialmodelingprep.com/api/v3/historical-price-full/{fmp_ticker}
    ?from={YYYY-MM-DD}&to={YYYY-MM-DD}&apikey={key}
```

FMP 응답 형식:
```json
{
  "symbol": "AAPL",
  "historical": [
    {
      "date": "2025-05-19",
      "open": 213.24,
      "high": 213.73,
      "low": 209.82,
      "close": 211.16,
      "volume": 42847831,
      "changePercent": 0.46
    }
  ]
}
```

- FMP 응답은 **최신 날짜 순(내림차순)**이므로, 핸들러 내부에서 오름차순으로 정렬합니다.
- KR 종목은 `{ticker}.KS` 형식으로 요청합니다 (기존 `_to_fmp_ticker` 헬퍼 재사용).

---

## 4. 캐싱 전략

- 캐시 키: `technical:{market}:{ticker}:{period}`
- 장 중: TTL **900초 (15분)**
- 장 마감 후: TTL **86,400초 (24시간)**

**장 중 판단 기준 (UTC 기준)**

| 시장 | 요일 | UTC 범위 |
|------|------|---------|
| US | 월~금 | 13:30 ~ 20:00 |
| KR | 월~금 | 00:00 ~ 06:30 |

---

## 5. Lambda 처리 흐름

```
입력 검증 (ticker·market·period 형식) →
캐시 조회 (Redis) →
FMP historical-price-full 호출 (캐시 미스 시) →
날짜 오름차순 정렬 →
TechnicalDataPoint 목록 변환 →
TechnicalSummary 계산 (시작가·종가·수익률·고/저·평균거래량) →
캐시 저장 (장 중/마감 TTL 분기) →
200 응답
```

---

## 6. 에러 처리

| 조건 | HTTP | code |
|------|------|------|
| ticker·market·period 형식 오류 | 400 | `INVALID_PARAMS` |
| FMP에서 데이터 미반환 (알 수 없는 티커) | 404 | `TICKER_NOT_FOUND` |
| FMP API 재시도 3회 초과 | 503 | `EXTERNAL_API_ERROR` |

---

## 7. 구현 시 주의사항

**Period별 캐시 분리:** `1y`와 `3y` 응답을 별도 키로 캐싱합니다.
`3y` 데이터를 보유하더라도 `1y` 요청은 별도로 캐시합니다(데이터 슬라이싱 후
재캐싱하지 않음). 단순성을 위해 각 period를 독립적으로 조회·캐싱합니다.

**빈 응답 처리:** FMP가 `historical` 배열을 비어 있거나 키 자체를 반환하지 않으면
404 `TICKER_NOT_FOUND`를 반환합니다. 404 응답은 캐싱하지 않습니다.
