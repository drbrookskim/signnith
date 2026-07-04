# 03 — 외부 API 명세 및 Rate Limit 정리

> 이 문서는 EquiSense가 의존하는 모든 외부 API의 엔드포인트, 인증 방식, Rate Limit, 캐싱 전략을 정리합니다.
> Rate Limit 초과는 서비스 장애로 직결되므로, 각 제한값을 캐싱 TTL 설계에 반드시 반영하십시오.

---

## 1. Financial Modeling Prep (FMP)

**용도:** 재무제표(3대 재무제표), 기업 프로필, 주가 히스토리

**인증:** API Key (헤더 또는 쿼리 파라미터 `?apikey=`)

**Rate Limit:** 플랜에 따라 다르며, 기본 플랜 기준 분당 300 요청, 일 5,000 요청입니다.

**주요 엔드포인트:**
- 손익계산서: `GET /v3/income-statement/{ticker}?limit=5`
- 대차대조표: `GET /v3/balance-sheet-statement/{ticker}?limit=5`
- 현금흐름표: `GET /v3/cash-flow-statement/{ticker}?limit=5`
- 주가 히스토리: `GET /v3/historical-price-full/{ticker}`

**캐싱 전략:** 재무제표는 분기 단위로 갱신되므로 TTL 24시간. 주가 히스토리는 장 마감 후 TTL 24시간, 장 중 TTL 15분으로 분기 처리합니다.

---

## 2. Alpha Vantage

**용도:** 실시간 및 근실시간 주가, 기술적 지표(RSI, MACD, Bollinger Bands)

**인증:** API Key (쿼리 파라미터 `&apikey=`)

**Rate Limit:** 무료 플랜 기준 분당 5 요청, 일 500 요청. 이 제한은 매우 낮으므로 캐싱을 철저히 적용해야 합니다. 프리미엄 플랜(분당 75 요청) 사용 권장.

**주요 엔드포인트:**
- 시세 조회: `GET /query?function=GLOBAL_QUOTE&symbol={ticker}`
- RSI: `GET /query?function=RSI&symbol={ticker}&interval=daily`
- MACD: `GET /query?function=MACD&symbol={ticker}&interval=daily`

**캐싱 전략:** 모든 기술적 지표는 장 중 TTL 15분. Alpha Vantage의 Rate Limit이 낮으므로, 동일 종목의 중복 요청은 캐시에서만 서빙합니다.

---

## 3. DART (전자공시시스템) OpenAPI

**용도:** 한국 상장 기업의 공시 문서(사업보고서, 분기보고서, 실적 발표)

**인증:** API Key (쿼리 파라미터 `&crtfc_key=`)

**Rate Limit:** 일 10,000 건 (넉넉하지만 문서 다운로드 시 용량에 주의)

**주요 엔드포인트:**
- 공시 목록 조회: `GET /api/list.json?corp_code={corp_code}&bgn_de={yyyymmdd}`
- 사업보고서 원문: `GET /api/document.xml?rcept_no={rcept_no}`
- 기업 고유 코드 조회: `GET /api/company.json?stock_code={6자리 종목코드}`

**캐싱 전략:** 공시는 실시간성보다 정확성이 중요합니다. 공시 목록 TTL 1시간, 개별 문서 원문은 변경되지 않으므로 TTL 7일 또는 영구 캐싱합니다.

---

## 4. SEC EDGAR (미국 공시)

**용도:** 미국 상장 기업의 10-K, 10-Q, 8-K 등 공시 문서

**인증:** User-Agent 헤더 필수 (`User-Agent: EquiSense/1.0 contact@equisense.app`). API 키 불필요.

**Rate Limit:** 초당 10 요청 (요청 헤더에 User-Agent 없으면 차단됨)

**주요 엔드포인트:**
- 기업 제출 목록: `GET /submissions/CIK{10자리}.json`
- 파일 다운로드: `GET /Archives/edgar/data/{CIK}/{accession}/{filename}`
- XBRL 재무 데이터: `GET /api/xbrl/companyfacts/CIK{10자리}.json`

**캐싱 전략:** DART와 동일하게 공시 목록 TTL 1시간, 문서 원문 TTL 7일 적용.
