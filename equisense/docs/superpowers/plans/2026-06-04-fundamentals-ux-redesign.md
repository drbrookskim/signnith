# 기본적 분석 UX 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FundamentalsCharts를 SparklineCard 그리드에서 성장성·수익성·건전성 3섹션 스토리 카드로 재구성 — 핵심 지표가 헤더에 항상 표시되고 클릭 시 차트가 확장되는 구조

**Architecture:** 단일 파일 `FundamentalsCharts.tsx`를 전면 재작성. SparklineCard·MetricKey expanded state 제거, 3개 섹션 독립 toggle(`openSection`) 도입. ExpandedPanel·QuarterlyOverlay는 재사용.

**Tech Stack:** React 18, Next.js App Router, Recharts, Tailwind CSS

---

## 파일 변경 범위

| 파일 | 변경 |
|------|------|
| `frontend/components/charts/FundamentalsCharts.tsx` | 전면 재작성 (유일한 변경 파일) |

---

## Task 1: 헬퍼 함수 추가 + 상태 교체 + SparklineCard 제거

**Files:**
- Modify: `frontend/components/charts/FundamentalsCharts.tsx`

- [ ] **Step 1: 헬퍼 함수 3개를 `// ── 타입 ──` 블록 바로 위에 추가**

`METRIC_CONFIGS` 상수 정의 직전 (`// ── 지표 설정 ──` 위)에 다음을 삽입:

```typescript
// ── 섹션 헬퍼 ───────────────────────────────────

function calcCagr(data: { year: number; value: number | null }[]): number | null {
  const valid = data.filter((d): d is { year: number; value: number } => d.value != null)
  if (valid.length < 2) return null
  const first = valid[0].value
  const last  = valid.at(-1)!.value
  const years = valid.at(-1)!.year - valid[0].year
  if (years <= 0 || first <= 0) return null
  return (Math.pow(last / first, 1 / years) - 1) * 100
}

function healthSignal(
  latest: import('@/types').FundamentalMetrics | null,
): 'good' | 'warn' | 'danger' {
  if (!latest) return 'warn'
  const dr  = latest.debt_ratio ?? Infinity
  const fcf = latest.fcf        ?? -1
  const icr = latest.icr        ?? 0
  if (dr > 300 || fcf < 0 || icr < 1.5) return 'danger'
  if (dr > 200 || icr < 3)               return 'warn'
  return 'good'
}

function pillCls(status: 'pass' | 'warn' | 'fail' | 'na'): string {
  if (status === 'pass') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
  if (status === 'warn') return 'bg-amber-50  text-amber-700  dark:bg-amber-950/20  dark:text-amber-400'
  if (status === 'fail') return 'bg-red-50    text-red-700    dark:bg-red-950/20    dark:text-red-400'
  return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
}
```

- [ ] **Step 2: SparklineCard 컴포넌트 전체 삭제 (lines 123–198)**

`function SparklineCard({` 부터 닫는 `}` 까지 — 아래 문자열 블록을 파일에서 제거:

```
function SparklineCard({
  metricKey,
  ...
  clickable,
}: {
  ...
}) {
  ...
}
```

(현재 약 123~198번 줄에 해당하는 `SparklineCard` 함수 전체)

- [ ] **Step 3: 메인 컴포넌트의 `expanded` state → `openSection` 으로 교체**

```typescript
// 제거
const [expanded, setExpanded] = useState<MetricKey | null>(null)
function toggle(key: MetricKey) {
  setExpanded(prev => (prev === key ? null : key))
}

// 추가
const [openSection, setOpenSection] = useState<'growth' | 'profit' | 'health' | null>(null)
function toggleSection(key: 'growth' | 'profit' | 'health') {
  setOpenSection(prev => prev === key ? null : key)
}
```

- [ ] **Step 4: 타입 체크 통과 확인 (JSX는 아직 깨진 상태여도 무관)**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend
npx tsc --noEmit 2>&1 | head -20
```

SparklineCard 참조 에러 외에 새 헬퍼 관련 에러가 없으면 진행.

---

## Task 2: JSX 전면 교체 — 3섹션 렌더링

**Files:**
- Modify: `frontend/components/charts/FundamentalsCharts.tsx` (메인 컴포넌트 return 블록)

- [ ] **Step 1: 메인 컴포넌트 return 직전에 파생 변수 삽입**

`return (` 바로 위에 추가:

```typescript
  // ── 파생 값 ──────────────────────────────────────

  // CAGR (매출)
  const cagr = calcCagr(incomeSpark)
  const validIncomeSpark = incomeSpark.filter(
    (d): d is { year: number; value: number } => d.value != null,
  )
  const maxRevenue = validIncomeSpark.reduce((m, d) => Math.max(m, d.value), 0)

  // 건전성 신호
  const signal = healthSignal(latestMetrics)
  const healthBadgeCls =
    signal === 'good'   ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' :
    signal === 'warn'   ? 'bg-amber-50  text-amber-700  dark:bg-amber-950/20  dark:text-amber-400'  :
                          'bg-red-50    text-red-700    dark:bg-red-950/20    dark:text-red-400'
  const healthBorderCls =
    signal === 'good'   ? 'border-emerald-500/50 dark:border-emerald-500/40' :
    signal === 'warn'   ? 'border-amber-500/50   dark:border-amber-500/40'   :
                          'border-red-500/50     dark:border-red-500/40'

  // Pill 상태
  type PillStatus = 'pass' | 'warn' | 'fail' | 'na'
  const debtStatus: PillStatus = latestMetrics?.debt_ratio == null ? 'na'
    : latestMetrics.debt_ratio <= 200 ? 'pass'
    : latestMetrics.debt_ratio <= 300 ? 'warn' : 'fail'
  const fcfStatus: PillStatus  = latestMetrics?.fcf == null ? 'na'
    : latestMetrics.fcf > 0 ? 'pass' : 'fail'
  const icrStatus: PillStatus  = latestMetrics?.icr == null ? 'na'
    : latestMetrics.icr >= 3 ? 'pass' : latestMetrics.icr >= 1.5 ? 'warn' : 'fail'
  const perStatus: PillStatus  = latestMetrics?.per == null ? 'na'
    : latestMetrics.per < 15 ? 'pass' : latestMetrics.per < 30 ? 'warn' : 'fail'
  const pbrStatus: PillStatus  = latestMetrics?.pbr == null ? 'na'
    : latestMetrics.pbr < 1 ? 'pass' : latestMetrics.pbr < 3 ? 'warn' : 'fail'

  // 분기 인사이트 (성장성)
  const growthInsight = effectiveInsight('income', incomeSpark)
```

- [ ] **Step 2: return 블록 전체를 3섹션 JSX로 교체**

```tsx
  return (
    <div className="space-y-3">

      {/* ── 1. 성장성 ── */}
      <section className={[
        'rounded-lg border transition-colors bg-zinc-50 dark:bg-zinc-900/50',
        openSection === 'growth'
          ? 'border-indigo-500/50 dark:border-indigo-500/40'
          : 'border-zinc-200 dark:border-zinc-800',
      ].join(' ')}>
        <div
          className="flex cursor-pointer select-none items-start justify-between px-4 py-3"
          onClick={() => toggleSection('growth')}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg leading-none">🚀</span>
            <div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">성장성</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">매출 · 영업이익 · 순이익</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {cagr != null && (
              <span className={[
                'rounded-full px-2.5 py-0.5 text-xs font-bold',
                cagr >= 0
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
                  : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400',
              ].join(' ')}>
                CAGR {cagr >= 0 ? '+' : ''}{cagr.toFixed(1)}%
              </span>
            )}
            <span className="text-xs text-zinc-400">{openSection === 'growth' ? '▲' : '▼'}</span>
          </div>
        </div>

        {validIncomeSpark.length >= 2 && (
          <div className="flex h-5 items-end gap-0.5 px-4 pb-2">
            {validIncomeSpark.map((d, i) => {
              const h = maxRevenue > 0 ? Math.max(3, Math.round((d.value / maxRevenue) * 18)) : 3
              return (
                <div
                  key={i}
                  style={{ height: `${h}px` }}
                  className="flex-1 rounded-sm bg-indigo-400 opacity-70 dark:bg-indigo-500"
                />
              )
            })}
          </div>
        )}

        {openSection === 'growth' && (
          <div className="space-y-4 border-t border-zinc-200 p-4 dark:border-zinc-800">
            <ExpandedPanel
              expandedKey="income"
              sparkDataByKey={sparkDataByKey}
              incomeData={incomeData}
              marginData={marginData}
              uid={uid}
              onClose={() => {}}
              showClose={false}
            />
            <QuarterlyOverlay
              insight={growthInsight.insight}
              loading={quarterlyLoading}
              isAnnual={growthInsight.isAnnual}
            />
          </div>
        )}
      </section>

      {/* ── 2. 수익성 ── */}
      <section className={[
        'rounded-lg border transition-colors bg-zinc-50 dark:bg-zinc-900/50',
        openSection === 'profit'
          ? 'border-emerald-500/50 dark:border-emerald-500/40'
          : 'border-zinc-200 dark:border-zinc-800',
      ].join(' ')}>
        <div
          className="flex cursor-pointer select-none items-start justify-between px-4 py-3"
          onClick={() => toggleSection('profit')}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg leading-none">💎</span>
            <div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">수익성</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">ROE · ROA · 영업이익률</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {latestROE != null && (
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400">
                ROE {formatPercent(latestROE)}
              </span>
            )}
            <span className="text-xs text-zinc-400">{openSection === 'profit' ? '▲' : '▼'}</span>
          </div>
        </div>

        {latestMetrics && (
          <div className="grid grid-cols-3 gap-px border-t border-zinc-200 dark:border-zinc-800">
            {(
              [
                { label: 'ROE',      value: latestMetrics.roe,              format: 'percent' },
                { label: '영업이익률', value: latestMetrics.operating_margin, format: 'percent' },
                { label: 'ROA',      value: latestMetrics.roa,              format: 'percent' },
              ] as { label: string; value: number | null; format: MetricFormat }[]
            ).map(({ label, value, format }) => (
              <div key={label} className="px-4 py-2.5 text-center">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</p>
                <p className="mt-0.5 text-base font-bold text-zinc-800 dark:text-zinc-200">
                  {formatValue(value, format)}
                </p>
              </div>
            ))}
          </div>
        )}

        {openSection === 'profit' && (
          <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
            <ExpandedPanel
              expandedKey="margin"
              sparkDataByKey={sparkDataByKey}
              incomeData={incomeData}
              marginData={marginData}
              uid={uid}
              onClose={() => {}}
              showClose={false}
            />
          </div>
        )}
      </section>

      {/* ── 3. 재무 건전성 ── */}
      <section className={[
        'rounded-lg border transition-colors bg-zinc-50 dark:bg-zinc-900/50',
        openSection === 'health' ? healthBorderCls : 'border-zinc-200 dark:border-zinc-800',
      ].join(' ')}>
        <div
          className="flex cursor-pointer select-none items-start justify-between px-4 py-3"
          onClick={() => toggleSection('health')}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg leading-none">🛡️</span>
            <div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">재무 건전성</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">부채비율 · FCF · 이자보상 · PER · PBR</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <span className={['rounded-full px-2.5 py-0.5 text-xs font-bold', healthBadgeCls].join(' ')}>
              {signal === 'good' ? '✓ 양호' : signal === 'warn' ? '⚠ 주의' : '✗ 위험'}
            </span>
            <span className="text-xs text-zinc-400">{openSection === 'health' ? '▲' : '▼'}</span>
          </div>
        </div>

        {latestMetrics && (
          <div className="flex flex-wrap gap-1.5 border-t border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
            <span className={['rounded px-2 py-0.5 text-xs font-medium', pillCls(debtStatus)].join(' ')}>
              부채 {formatValue(latestMetrics.debt_ratio, 'percent')}
            </span>
            <span className={['rounded px-2 py-0.5 text-xs font-medium', pillCls(fcfStatus)].join(' ')}>
              FCF {latestMetrics.fcf != null ? formatLargeNumber(latestMetrics.fcf) : '—'}
            </span>
            <span className={['rounded px-2 py-0.5 text-xs font-medium', pillCls(icrStatus)].join(' ')}>
              이자보상 {latestMetrics.icr != null ? `${latestMetrics.icr.toFixed(1)}x` : '—'}
            </span>
            <span className={['rounded px-2 py-0.5 text-xs font-medium', pillCls(perStatus)].join(' ')}>
              PER {formatValue(latestMetrics.per, 'ratio')}
            </span>
            <span className={['rounded px-2 py-0.5 text-xs font-medium', pillCls(pbrStatus)].join(' ')}>
              PBR {formatValue(latestMetrics.pbr, 'ratio')}
            </span>
          </div>
        )}

        {openSection === 'health' && latestMetrics && (
          <div className="space-y-4 border-t border-zinc-200 p-4 dark:border-zinc-800">
            <div className="grid grid-cols-2 gap-4">
              <ExpandedPanel
                expandedKey="debt_ratio"
                sparkDataByKey={sparkDataByKey}
                incomeData={incomeData}
                marginData={marginData}
                uid={uid}
                onClose={() => {}}
                showClose={false}
              />
              <ExpandedPanel
                expandedKey="fcf"
                sparkDataByKey={sparkDataByKey}
                incomeData={incomeData}
                marginData={marginData}
                uid={uid}
                onClose={() => {}}
                showClose={false}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { label: '이자보상배율', value: latestMetrics.icr, format: 'ratio' },
                  { label: 'PER',         value: latestMetrics.per, format: 'ratio' },
                  { label: 'PBR',         value: latestMetrics.pbr, format: 'ratio' },
                ] as { label: string; value: number | null; format: MetricFormat }[]
              ).map(({ label, value, format }) => (
                <div key={label} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                  <p className="mt-1 text-lg font-bold text-zinc-800 dark:text-zinc-200">
                    {formatValue(value, format)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

    </div>
  )
```

---

## Task 3: 죽은 코드 정리 + 타입 체크 + 커밋 + 배포

**Files:**
- Modify: `frontend/components/charts/FundamentalsCharts.tsx`

- [ ] **Step 1: 더 이상 사용하지 않는 변수/타입 제거**

다음을 파일에서 삭제:
- `const METRIC_KEYS = [...]` 상수 (7개 지표 키 배열 — SparklineCard 그리드에서 사용했음)
- `type MetricKey = ...` (더 이상 state 타입으로 사용 안 함)
- `type ExpandedKey = MetricKey | 'income' | 'margin'` (ExpandedPanel에서 내부 타입으로만 필요 → ExpandedPanel 파라미터 타입을 `'income' | 'margin' | string`으로 변경해도 되지만, ExpandedPanel 자체는 그대로 두고 `ExpandedKey` 타입 선언만 유지)
- `const METRIC_CONFIGS` 상수 — ExpandedPanel 내부에서 `METRIC_CONFIGS[expandedKey]`로 사용 중이므로 **유지**
- `latestRevenue` 변수 — 더 이상 SparklineCard에 안 넘기지만 `incomeSpark.at(-1)?.value` 참조 → **유지**
- `formatRatio`, `formatPercent`, `yAxisFormatter` 함수 — ExpandedPanel에서 사용 중이므로 **유지**

실제로 삭제 가능한 것:
```typescript
// 삭제
const METRIC_KEYS = ['roe', 'roa', 'debt_ratio', 'operating_margin', 'per', 'pbr', 'fcf'] as const
type MetricKey = typeof METRIC_KEYS[number]
```

`ExpandedKey`는 `ExpandedPanel` props 타입에 여전히 필요하므로 유지. `MetricKey`가 `ExpandedKey` 정의에 사용되므로 둘 다 삭제하면 오류 발생 — 대신 아래처럼 인라인:

```typescript
// 기존
type MetricKey = typeof METRIC_KEYS[number]
type ExpandedKey = MetricKey | 'income' | 'margin'

// 교체 (METRIC_KEYS 배열 삭제 후)
type ExpandedKey = 'roe' | 'roa' | 'debt_ratio' | 'operating_margin' | 'per' | 'pbr' | 'fcf' | 'income' | 'margin'
```

- [ ] **Step 2: 타입 체크 통과 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend
npx tsc --noEmit 2>&1
```

Expected: 출력 없음 (에러 없음)

- [ ] **Step 3: 커밋**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense
git add frontend/components/charts/FundamentalsCharts.tsx
git commit -m "feat(fundamentals): 3섹션 스토리 카드 UX — 성장성·수익성·건전성 (클릭 확장)"
```

- [ ] **Step 4: eq-deploy worktree를 통해 배포**

```bash
# worktree 재생성
git worktree remove /private/tmp/eq-deploy --force
git worktree add --detach /private/tmp/eq-deploy equisense-origin/main

# 파일 복사
cp frontend/components/charts/FundamentalsCharts.tsx \
   /private/tmp/eq-deploy/frontend/components/charts/FundamentalsCharts.tsx

# 확인
git -C /private/tmp/eq-deploy status --short
```

Expected: `M frontend/components/charts/FundamentalsCharts.tsx`

- [ ] **Step 5: eq-deploy 커밋 + push**

```bash
git -C /private/tmp/eq-deploy add frontend/components/charts/FundamentalsCharts.tsx
git -C /private/tmp/eq-deploy commit -m "feat(fundamentals): 3섹션 스토리 카드 UX"
git -C /private/tmp/eq-deploy push equisense-origin HEAD:main
```

- [ ] **Step 6: GitHub Actions 배포 확인**

```bash
gh run watch \
  $(gh run list --repo drbrookskim/equisense \
    --workflow "Deploy to GitHub Pages" \
    --limit 1 --json databaseId --jq '.[0].databaseId') \
  --repo drbrookskim/equisense 2>&1 | tail -3
```

Expected: `✓ Deploy to GitHub Pages` + `✓ Complete job`
