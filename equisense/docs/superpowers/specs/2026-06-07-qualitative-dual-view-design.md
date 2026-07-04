# 정성 분석 통합 뷰 설계 — 장기 구조 / 단기 모멘텀 나란히 표시

## 배경

현재 `QualitativeAnalysisView`는 select로 `사업보고서` / `실적발표`를 전환하는 구조.
두 분석이 동일한 Yahoo Finance 재무 데이터를 입력으로 쓰기 때문에 출력이 99% 유사.
전환 방식은 대비(contrast)를 보여주지 못해 UX상 가치가 낮음.

## 결정

두 결과를 한 화면에 나란히 표시.  
탭명: `사업보고서 / 실적발표` → `장기 구조 / 단기 모멘텀` (실제 시간 축 명칭으로 정직하게 표현).

## API 변경

### `api-client.ts`
- `triggerDualQualitativeAnalysis(ticker, market, fiscal_year)` 추가
  - `getFundamentals` 한 번 호출 후 `calculateQualitative`를 `annual_report` / `earnings_call` 두 번 실행
  - 반환: `{ annual: QualitativeResult; earnings: QualitativeResult }`
- 기존 `triggerQualitativeAnalysis` 유지 (다른 곳에서 쓰일 경우 대비)

## 컴포넌트 변경

### `QualitativeAnalysisView.tsx`
- `docType` state 제거
- `job: AnalysisJob | null` → `dualResult: { annual, earnings } | null`
- 분석 폼에서 "문서 유형" select 제거
- `handleSubmit` → `triggerDualQualitativeAnalysis` 호출
- `ResultCard` → `DualResultCard`로 교체

### `DualResultCard` 레이아웃

```
┌─ 언행일치 점수 ──────────────────────────────────────────┐
│  장기 구조          단기 모멘텀                           │
│  78 / 100  ████░   62 / 100  ████░                       │
└──────────────────────────────────────────────────────────┘

┌─ AI 요약 ────────────────────────────────────────────────┐
│  [장기 구조]  3년 CAGR ... 부채비율 ...                  │
│  [단기 모멘텀] 최근 YoY ... FCF ...                      │
└──────────────────────────────────────────────────────────┘

┌─ 리스크 요인 ─────────────────┬──────────────────────────┐
│ 장기 구조                     │ 단기 모멘텀               │
│ • 장기 부채 구조 부담 [높음]  │ • 가이던스 신뢰성 [중간]  │
└───────────────────────────────┴──────────────────────────┘

┌─ 성장 동력 ────────────────────┬─────────────────────────┐
│ 장기 구조                      │ 단기 모멘텀              │
└────────────────────────────────┴─────────────────────────┘

┌─ 노이즈 필터 ──────────────────┬─────────────────────────┐
│ 장기 구조                      │ 단기 모멘텀              │
└────────────────────────────────┴─────────────────────────┘
```

- 모바일: 두 열이 단일 열로 stacking (gridTemplateColumns auto-fill or media query)
- 헤더 레이블: `장기 구조` (#1c6e4a accent) / `단기 모멘텀` (#b45309 amber)

## 파일 범위

1. `frontend/lib/api-client.ts` — `triggerDualQualitativeAnalysis` 추가
2. `frontend/components/qualitative/QualitativeAnalysisView.tsx` — 전체 재구성
3. `frontend/types/index.ts` — `DualQualitativeResult` 타입 추가 (필요 시)
