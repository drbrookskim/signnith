# AC-M2 — Module 2: 해자 트래커 수용 기준

> 각 AC 항목은 PR 머지 전에 검토자가 직접 확인해야 합니다.
> ✅는 자동 테스트로 검증 가능, 👁️는 수동 확인이 필요한 항목입니다.

---

## AC-M2-001: 해자 점수 API 엔드포인트 ✅

`GET /companies/{ticker}/moat?market={KR|US}` 엔드포인트가 존재하고, DB에 해당 종목의 해자 점수가 있을 때 200 OK와 함께 4개 차원 점수(비용우위·무형자산·전환비용·네트워크효과), 종합 점수, 등급(wide/narrow/none)을 JSON으로 반환해야 합니다. 잘못된 ticker 형식에는 400 Bad Request를 반환해야 합니다.

## AC-M2-002: 해자 등급 산출 정확도 ✅

종합 점수(composite_score)는 4개 차원 점수의 단순 평균으로 계산되어야 합니다. 등급 기준: `wide` ≥ 7.0, `narrow` 4.0~6.9, `none` < 4.0. 테스트 케이스: 4개 차원이 [9.0, 8.5, 7.0, 5.5]일 때 composite_score는 7.5, grade는 `wide`이어야 합니다.

## AC-M2-003: DB 미입력 종목 처리 ✅

해자 점수가 DB에 없는 종목에 대해 404와 `MOAT_SCORE_NOT_FOUND` 코드를 반환해야 합니다. 응답 메시지에 "analyst must submit scores first" 내용이 포함되어야 합니다.

## AC-M2-004: 캐싱 동작 검증 ✅

동일한 ticker에 대해 두 번째 요청이 들어왔을 때 Neon DB 쿼리가 발생하지 않고 Upstash Redis에서 응답이 반환되어야 합니다. Redis TTL은 3,600초(1시간)이어야 합니다.

## AC-M2-005: 차원 검증 ✅

해자 점수 저장 시 4개 차원(cost_advantage, intangible_assets, switching_costs, network_effects)이 모두 존재해야 합니다. 하나라도 누락되거나 중복되면 400 오류가 발생해야 합니다. 각 차원의 점수는 0.0~10.0 범위여야 합니다.

## AC-M2-006: 오류 처리 ✅

Neon DB 연결이 실패한 경우 503 Service Unavailable과 `DB_ERROR` 코드를 반환해야 합니다. 클라이언트에 DB 접속 정보나 내부 스택 트레이스가 노출되어서는 안 됩니다.

## AC-M2-007: 프론트엔드 해자 시각화 👁️

해자 분석 페이지에서 4개 차원 점수가 레이더 차트(spider chart)로 시각화되어야 합니다. 종합 등급(WIDE/NARROW/NONE)이 배지(badge) 형태로 상단에 표시되어야 합니다. 모바일(375px), 태블릿(768px), 데스크톱(1280px) 해상도에서 모두 정상 렌더링되어야 합니다.
