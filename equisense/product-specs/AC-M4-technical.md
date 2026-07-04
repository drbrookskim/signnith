# AC-M4 — Module 4: 기술적 분석 엔진 수용 기준

> 각 AC 항목은 PR 머지 전에 검토자가 직접 확인해야 합니다.
> ✅는 자동 테스트로 검증 가능, 👁️는 수동 확인이 필요한 항목입니다.

---

## AC-M4-001: 주가 데이터 API 엔드포인트 ✅

`GET /companies/{ticker}/technical?market={KR|US}&period={1m|3m|6m|1y|3y}` 엔드포인트가
존재하고, 올바른 파라미터를 전달하면 200 OK와 함께 해당 기간의 일별 주가
(date·open·high·low·close·volume·change_pct) 목록과 요약 통계(start_price·end_price·
period_return_pct·high_period·low_period·avg_volume)를 JSON으로 반환해야 합니다.

## AC-M4-002: 캐싱 동작 검증 ✅

장 중(US: UTC 13:30~20:00, KR: UTC 00:00~06:30) 요청 시 TTL 900초,
장 마감 후 요청 시 TTL 86,400초로 Redis 캐시를 저장해야 합니다. 동일 ticker·period
두 번째 요청은 FMP API 호출 없이 Redis에서 응답해야 합니다.

## AC-M4-003: 입력 검증 ✅

잘못된 ticker 형식(KR: 비6자리, US: 비1~5자리 대문자), 잘못된 market, 잘못된 period에
대해 400 Bad Request와 `INVALID_PARAMS` 코드를 반환해야 합니다.
`period` 파라미터가 없을 때는 기본값 `1y`로 처리해야 합니다.

## AC-M4-004: 프론트엔드 주가 차트 렌더링 👁️

기술적 분석 페이지에서 종가 라인(또는 에어리어) 차트와 거래량 막대 차트가 렌더링되어야
합니다. 기간 선택 버튼(1M·3M·6M·1Y·3Y)을 클릭하면 해당 기간의 데이터로 차트가
갱신되어야 합니다. 모바일(375px)·태블릿(768px)·데스크톱(1280px)에서 모두 정상 렌더링
되어야 합니다.

## AC-M4-005: 오류 처리 ✅

FMP API가 응답하지 않으면 503과 `EXTERNAL_API_ERROR`를 반환합니다. FMP에 데이터가
없는 종목은 404와 `TICKER_NOT_FOUND`를 반환합니다. 클라이언트에 FMP API 키나
내부 스택 트레이스가 노출되어서는 안 됩니다.
