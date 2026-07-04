# 기본적 분석 UX 리디자인 스펙

**날짜:** 2026-06-04  
**대상 파일:** `frontend/components/charts/FundamentalsCharts.tsx`  
**접근법:** B — 3단계 스토리 카드 (섹션 헤더 항상 표시, 클릭 시 차트 확장)

---

## 1. 목표

현재 FundamentalsCharts의 정보 구조를 재편하여:
- 핵심 지표를 스크롤 없이 한눈에 파악
- 성장성 → 수익성 → 건전성 순서의 분석 내러티브 제공
- 스크롤 길이 약 40% 단축 (항상표시 ExpandedPanel 2개 제거)

---

## 2. 새 레이아웃 구조

```
FundamentalsCharts
├── [섹션 1] 🚀 성장성          ← 항상 표시
│   ├── 헤더: 제목 + CAGR 배지 + 미니 스파크라인
│   └── [확장 시] 손익추이 ComposedChart + 분기 모멘텀 스트립
│
├── [섹션 2] 💎 수익성           ← 항상 표시
│   ├── 헤더: 제목 + ROE 배지 + 3-grid (ROE / 영업이익률 / ROA 최신값)
│   └── [확장 시] 수익성 ComposedChart (ROE · ROA · 영업이익률 추이)
│
└── [섹션 3] 🛡️ 재무 건전성      ← 항상 표시
    ├── 헤더: 제목 + 종합 신호 배지 + 5개 지표 pill
    └── [확장 시] 부채비율 + FCF 추이 차트 (2개 단순 AreaChart)
```

---

## 3. 섹션별 상세 설계

### 3-1. 성장성 섹션

**헤더 (항상 표시):**
- 아이콘: 🚀, 제목: "성장성", 서브: "매출 · 영업이익 · 순이익"
- 배지: 매출 5년 CAGR 계산값 (예: `CAGR +12.3% ↑` — 초록, 하락 시 빨강)
- 미니 스파크라인: 매출액 5년 막대 (높이 20px, indigo 컬러)
- 섹션 테두리 색상: indigo (`border-indigo-500/30`)

**확장 시:**
- 기존 ExpandedPanel의 income 차트 그대로 사용 (매출·영업이익·순이익 ComposedChart, 높이 220px)
- 하단: 분기 모멘텀 스트립 (QuarterlyOverlay — 현재 영업이익률 insight 사용)

**CAGR 계산:**
```ts
function calcCagr(data: {year: number; value: number | null}[]): number | null {
  const valid = data.filter(d => d.value != null)
  if (valid.length < 2) return null
  const first = valid[0].value!, last = valid.at(-1)!.value!
  const years = valid.at(-1)!.year - valid[0].year
  if (years <= 0 || first <= 0) return null
  return (Math.pow(last / first, 1 / years) - 1) * 100
}
```

---

### 3-2. 수익성 섹션

**헤더 (항상 표시):**
- 아이콘: 💎, 제목: "수익성", 서브: "ROE · ROA · 영업이익률"
- 배지: 최신 ROE 값 (예: `ROE 18.3%` — indigo/violet 컬러)
- 3-grid: ROE / 영업이익률 / ROA 최신값 (각 컬럼, 수치 강조)
- 섹션 테두리 색상: emerald (`border-emerald-500/30`)

**확장 시:**
- 기존 ExpandedPanel의 margin 차트 그대로 사용 (ROE · ROA · 영업이익률 ComposedChart, 높이 220px)

---

### 3-3. 재무 건전성 섹션

**헤더 (항상 표시):**
- 아이콘: 🛡️, 제목: "재무 건전성", 서브: "부채비율 · FCF · 이자보상 · PER · PBR"
- 배지: 종합 신호
  - `양호` (emerald): 부채비율 ≤ 200% AND FCF > 0 AND ICR ≥ 3
  - `주의` (amber): 하나라도 경계값
  - `위험` (red): 부채비율 > 300% OR FCF < 0 OR ICR < 1.5
- 5개 pill (color-coded): 부채비율 / FCF / 이자보상배율 / PER / PBR
  - 각 pill: `{label} {값}` 형식, 통과 시 emerald / 경계 amber / 실패 red / 데이터없음 zinc

**확장 시:**
- 2컬럼 그리드: 부채비율 추이 AreaChart + FCF 추이 AreaChart (각 높이 160px)
- 이자보상배율, PER, PBR은 수치 카드 row로 표시 (차트 없음)

---

## 4. 상태 관리

```ts
// 기존 expanded: MetricKey | null 제거
// 새 state: 각 섹션 독립 토글
const [openSection, setOpenSection] = useState<'growth' | 'profit' | 'health' | null>(null)
function toggleSection(key: 'growth' | 'profit' | 'health') {
  setOpenSection(prev => prev === key ? null : key)
}
```

---

## 5. 제거되는 코드

| 제거 대상 | 이유 |
|-----------|------|
| `SparklineCard` 컴포넌트 (income/margin 용도) | 새 섹션 헤더로 대체 |
| `ExpandedPanel` 인라인 2개 (항상 표시) | 섹션 확장으로 대체 |
| `expanded: MetricKey \| null` state | `openSection` state로 교체 |
| `toggle(key: MetricKey)` 함수 | `toggleSection` 으로 교체 |
| 7개 핵심지표 SparklineCard 그리드 | 건전성 섹션 pill + 수익성 섹션 3-grid 로 흡수 |

**유지되는 코드:**
- `ExpandedPanel` 컴포넌트 함수 자체 (섹션 확장 시 재사용)
- `QuarterlyOverlay` 컴포넌트 (성장성 섹션 확장에 재사용)
- `computeAnnualInsight`, `effectiveInsight` 함수
- `incomeData`, `marginData`, `sparkDataByKey` 데이터 준비 로직

**7개 핵심지표 카드 흡수 매핑:**

| 기존 SparklineCard | 새 위치 |
|---|---|
| ROE | 수익성 섹션 3-grid |
| ROA | 수익성 섹션 3-grid |
| 영업이익률 | 수익성 섹션 3-grid |
| 부채비율 | 건전성 섹션 pill + 확장 차트 |
| FCF | 건전성 섹션 pill + 확장 차트 |
| PER | 건전성 섹션 pill |
| PBR | 건전성 섹션 pill |

---

## 6. 시각 스타일 규칙

| 요소 | 스타일 |
|------|--------|
| 섹션 카드 | `rounded-lg border bg-zinc-50 dark:bg-zinc-900/50` |
| 섹션 헤더 | `flex items-center justify-between px-4 py-3 cursor-pointer` |
| 배지 — 양호/pass | `bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400` |
| 배지 — 주의/warn | `bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400` |
| 배지 — 위험/fail | `bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400` |
| 확장 테두리 | 섹션 활성화 시 `border-indigo-500` / `border-emerald-500` / `border-amber-500` |
| 미니 스파크라인 | 높이 20px, 막대, 클릭 불가 |

---

## 7. 데이터 요구사항

기존 `FundamentalsCharts` props 변경 없음:
```ts
{
  data: FundamentalAnalysis
  quarterlyInsights: QuarterlyInsightMap | null
  quarterlyLoading: boolean
}
```

추가로 필요한 계산:
- CAGR (매출 5년) — 컴포넌트 내부 계산
- 건전성 종합 신호 — `latest.debt_ratio`, `latest.fcf`, `latest.icr` 기반

---

## 8. 범위 외 (이번 구현 제외)

- `SparklineCard` 컴포넌트를 다른 탭에서 재사용하는 경우 없음 → 삭제 가능
- `ExpandedPanel`의 핵심지표(ROE 개별 등) 확장 기능 제거 — 수익성/건전성 섹션이 대체
- 모바일 레이아웃 별도 최적화 없음 (기존 반응형 그대로)
