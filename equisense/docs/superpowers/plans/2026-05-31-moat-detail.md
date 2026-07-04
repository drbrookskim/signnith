# 해자 탭 상세 설명 강화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 해자 탭에 개념 소개 섹션·지표별 상세 설명·Analyst Note 자동 생성을 추가한다.

**Architecture:** 순수 프론트엔드 변경 3파일. `moat.ts`에 `generateAnalystNote()` 헬퍼를 추가하고, `MoatCharts.tsx` 카드 UI를 강화하며, `MoatPage.tsx`에 개념 소개 섹션과 스타일링된 Analyst Note 블록을 추가한다. 외부 API·새 의존성 없음.

**Tech Stack:** Next.js 14 App Router (output: export), TypeScript, Tailwind CSS, Recharts

---

## 파일 맵

| 파일 | 역할 | 변경 유형 |
|------|------|-----------|
| `frontend/lib/adapters/moat.ts` | Analyst Note 자동 생성 로직 | 수정 |
| `frontend/components/charts/MoatCharts.tsx` | 점수 바 + 차원 상세 설명 | 수정 |
| `frontend/app/companies/[ticker]/moat/MoatPage.tsx` | 개념 소개 섹션 + Analyst Note 블록 | 수정 |

---

## Task 1: moat.ts — Analyst Note 자동 생성

**Files:**
- Modify: `frontend/lib/adapters/moat.ts`

- [ ] **Step 1: 파일 열고 현재 내용 확인**

`moat.ts` 상단에 다음 상수를 추가한다 (기존 import 바로 아래):

```typescript
const DIMENSION_NAME_KO: Record<string, string> = {
  cost_advantage: '비용 우위',
  intangible_assets: '무형 자산',
  switching_costs: '전환 비용',
  network_effects: '네트워크 효과',
}

const GRADE_TEXT: Record<string, string> = {
  wide: '강력한 경제적 해자를 보유합니다',
  narrow: '일부 구조적 우위가 확인됩니다',
  none: '뚜렷한 해자가 확인되지 않습니다',
}
```

- [ ] **Step 2: generateAnalystNote() 함수 추가**

`score()` 함수 아래, `calculateMoat()` 위에 추가한다:

```typescript
function subjectParticle(word: string): string {
  const last = word[word.length - 1]
  const code = last.charCodeAt(0)
  // 한글 완성형: 받침 없으면(0) '는', 있으면 '은'
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? '는' : '은'
  return '은'
}

function generateAnalystNote(
  displayName: string,
  grade: MoatGrade,
  dimension_scores: DimensionScore[],
): string {
  const sorted = [...dimension_scores].sort((a, b) => b.score - a.score)
  const strongest = sorted[0]
  const weakest = sorted[sorted.length - 1]

  const strongName = DIMENSION_NAME_KO[strongest.dimension] ?? strongest.dimension
  const weakName = DIMENSION_NAME_KO[weakest.dimension] ?? weakest.dimension

  const para1 =
    `${displayName}${subjectParticle(displayName)} ${GRADE_TEXT[grade]}. ` +
    `${strongName}(${strongest.score.toFixed(1)}점)이 가장 강한 경쟁 기반으로` +
    (strongest.rationale ? `, ${strongest.rationale}` : '') +
    `. ${weakName}(${weakest.score.toFixed(1)}점)은 상대적으로 약합니다.`

  const strengths = dimension_scores.filter((d) => d.score >= 6.0)
  const weaknesses = dimension_scores.filter((d) => d.score < 5.0)

  const lines: string[] = [para1]

  if (strengths.length > 0) {
    lines.push(
      '✅ 강점: ' +
        strengths
          .map((d) => d.rationale ?? `${DIMENSION_NAME_KO[d.dimension] ?? d.dimension} ${d.score.toFixed(1)}점`)
          .join(' · '),
    )
  }
  if (weaknesses.length > 0) {
    lines.push(
      '⚠️ 개선 필요: ' +
        weaknesses
          .map((d) => d.rationale ?? `${DIMENSION_NAME_KO[d.dimension] ?? d.dimension} ${d.score.toFixed(1)}점`)
          .join(' · '),
    )
  }

  return lines.join('\n')
}
```

- [ ] **Step 3: calculateMoat() 안에서 호출**

`calculateMoat()` 함수 안에서 `return` 직전의 `analyst_note: null` 줄을 다음으로 교체한다:

```typescript
    analyst_note: generateAnalystNote(
      fundamentals.name ?? fundamentals.ticker,
      grade,
      dimension_scores,
    ),
```

- [ ] **Step 4: 빌드로 타입 검증**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend
npm run build 2>&1 | tail -15
```

Expected: `✓ Generating static pages` — 에러 없음.

- [ ] **Step 5: 커밋**

```bash
cd /Users/nelcome/Codes/Claude_code_repository
git add equisense/frontend/lib/adapters/moat.ts
git commit -m "feat(moat): analyst note 자동 생성 (템플릿+강점·약점 구조)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: MoatCharts.tsx — 점수 바 + 차원 상세 설명

**Files:**
- Modify: `frontend/components/charts/MoatCharts.tsx`

- [ ] **Step 1: DIMENSION_DESCRIPTION 상수 추가**

파일 상단 `DIMENSION_LABEL` 상수 바로 아래에 추가:

```typescript
const DIMENSION_DESCRIPTION: Record<string, string> = {
  cost_advantage: '높은 영업이익률과 낮은 부채는 경쟁사 대비 지속적 원가 우위를 시사합니다.',
  intangible_assets: 'ROE는 브랜드·특허가 만들어내는 초과수익률의 대리 지표입니다.',
  switching_costs: '안정적·성장하는 매출은 고객이 이탈하기 어려운 구조를 반영합니다.',
  network_effects: 'FCF 마진이 높을수록 규모 확장 시 수익성이 자기강화됩니다.',
}
```

- [ ] **Step 2: 지표 카드 UI 교체**

현재 카드 블록 (line 52–65):
```tsx
{data.dimension_scores.map((d) => (
  <div key={d.dimension} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium">
        {DIMENSION_LABEL[d.dimension] ?? d.dimension}
      </span>
      <span className="text-sm font-bold">{d.score.toFixed(1)}</span>
    </div>
    {d.rationale && (
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{d.rationale}</p>
    )}
  </div>
))}
```

를 다음으로 교체한다:

```tsx
{data.dimension_scores.map((d) => {
  const barColor =
    d.score >= 7.5
      ? 'bg-indigo-500'
      : d.score >= 5
        ? 'bg-violet-400'
        : 'bg-zinc-400'
  return (
    <div key={d.dimension} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          {DIMENSION_LABEL[d.dimension] ?? d.dimension}
        </span>
        <span className="text-sm font-bold">{d.score.toFixed(1)}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-1.5 rounded-full transition-all ${barColor}`}
          style={{ width: `${d.score * 10}%` }}
        />
      </div>
      {d.rationale && (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{d.rationale}</p>
      )}
      {DIMENSION_DESCRIPTION[d.dimension] && (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 italic">
          {DIMENSION_DESCRIPTION[d.dimension]}
        </p>
      )}
    </div>
  )
})}
```

- [ ] **Step 3: 빌드 검증**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend
npm run build 2>&1 | tail -15
```

Expected: `✓ Generating static pages` — 에러 없음.

- [ ] **Step 4: 커밋**

```bash
cd /Users/nelcome/Codes/Claude_code_repository
git add equisense/frontend/components/charts/MoatCharts.tsx
git commit -m "feat(moat): 지표 카드 점수 바 + 차원별 상세 설명 추가

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: MoatPage.tsx — 개념 소개 섹션 + Analyst Note 블록

**Files:**
- Modify: `frontend/app/companies/[ticker]/moat/MoatPage.tsx`

- [ ] **Step 1: 파일 상단에 개념 소개 데이터 상수 추가**

`'use client'` 아래 import 블록 다음에 추가:

```typescript
const MOAT_DIMENSIONS = [
  {
    key: 'cost_advantage',
    emoji: '🏭',
    name: '비용 우위',
    definition: '경쟁사보다 낮은 원가로 생산하는 능력',
    method: '영업이익률 + 부채비율로 측정',
    benchmark: '영업이익률 30%↑ → 만점',
  },
  {
    key: 'intangible_assets',
    emoji: '💎',
    name: '무형 자산',
    definition: '브랜드·특허 등 모방하기 어려운 자산',
    method: 'ROE를 브랜드 가치의 대리 지표로 활용',
    benchmark: 'ROE 25%↑ → 만점',
  },
  {
    key: 'switching_costs',
    emoji: '🔒',
    name: '전환 비용',
    definition: '고객이 다른 제품으로 옮기기 어려운 마찰',
    method: '매출 CAGR + 성장 방향성 보정',
    benchmark: 'CAGR 12%↑ → 만점',
  },
  {
    key: 'network_effects',
    emoji: '🌐',
    name: '네트워크 효과',
    definition: '사용자 증가가 가치를 키우는 선순환',
    method: 'FCF 마진으로 수익 창출력 측정',
    benchmark: 'FCF 마진 15%↑ → 만점',
  },
]
```

- [ ] **Step 2: MoatConceptIntro 컴포넌트 추가 (파일 하단)**

`MoatPage` 함수 위에 추가:

```tsx
function MoatConceptIntro() {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
        💡 경제적 해자란?
      </p>
      <p className="mb-4 text-sm text-indigo-900 dark:text-indigo-200">
        워런 버핏이 제시한 개념으로, 경쟁자가 쉽게 침범할 수 없는{' '}
        <strong>구조적 경쟁 우위</strong>를 뜻합니다.
        해자가 넓을수록 기업은 장기간 초과수익을 유지할 수 있습니다.
        EquiSense는 아래 4가지 원천을 재무 데이터로 정량화합니다.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MOAT_DIMENSIONS.map((d) => (
          <div
            key={d.key}
            className="rounded-md bg-white p-3 dark:bg-indigo-950/50"
          >
            <p className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {d.emoji} {d.name}
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{d.definition}</p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              측정: {d.method}
            </p>
            <p className="text-xs text-indigo-500 dark:text-indigo-400">{d.benchmark}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: MoatContent 내 레이아웃 수정**

`MoatContent` 함수의 `return` 블록에서 기존 `<div className="space-y-8">` 안 내용을 교체한다.

현재:
```tsx
return (
  <div className="space-y-8">
    <div className="flex flex-wrap items-baseline gap-2">
      <h2 className="text-2xl font-bold">{name ?? data.ticker}</h2>
      {name && <span className="font-mono text-sm text-zinc-500">{data.ticker}</span>}
      <span className="text-sm text-zinc-400">({data.market})</span>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${GRADE_COLOR[data.grade]}`}>
        {GRADE_LABEL[data.grade]}
      </span>
      <span className="text-sm text-zinc-500">
        종합 {data.composite_score.toFixed(1)}점 / 10점
      </span>
    </div>
    {data.analyst_note && (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{data.analyst_note}</p>
    )}
    <MoatCharts data={data} />
  </div>
)
```

교체 후:
```tsx
return (
  <div className="space-y-8">
    {/* 헤더 */}
    <div className="flex flex-wrap items-baseline gap-2">
      <h2 className="text-2xl font-bold">{name ?? data.ticker}</h2>
      {name && <span className="font-mono text-sm text-zinc-500">{data.ticker}</span>}
      <span className="text-sm text-zinc-400">({data.market})</span>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${GRADE_COLOR[data.grade]}`}>
        {GRADE_LABEL[data.grade]}
      </span>
      <span className="text-sm text-zinc-500">
        종합 {data.composite_score.toFixed(1)}점 / 10점
      </span>
    </div>

    {/* 해자 개념 소개 */}
    <MoatConceptIntro />

    {/* 차원별 차트 */}
    <MoatCharts data={data} />

    {/* Analyst Note */}
    {data.analyst_note && (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          📝 Analyst Note
        </p>
        <div className="space-y-2">
          {data.analyst_note.split('\n').map((line, i) => (
            <p
              key={i}
              className={`text-sm ${
                line.startsWith('✅')
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : line.startsWith('⚠️')
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {line}
            </p>
          ))}
        </div>
      </div>
    )}
  </div>
)
```

- [ ] **Step 4: 빌드 검증**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/equisense/frontend
npm run build 2>&1 | tail -15
```

Expected: `✓ Generating static pages` — 에러 없음.

- [ ] **Step 5: 커밋**

```bash
cd /Users/nelcome/Codes/Claude_code_repository
git add equisense/frontend/app/companies/\[ticker\]/moat/MoatPage.tsx
git commit -m "feat(moat): 해자 개념 소개 섹션 + Analyst Note 블록 추가

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: 배포

**Files:** eq-deploy worktree

- [ ] **Step 1: eq-deploy worktree 확인 및 소스 업데이트**

```bash
ls /private/tmp/eq-deploy 2>/dev/null && echo "존재" || echo "없음"
```

없으면:
```bash
cd /Users/nelcome/Codes/Claude_code_repository
git worktree prune
git worktree add --detach /private/tmp/eq-deploy equisense-origin/main
```

있으면:
```bash
git -C /private/tmp/eq-deploy pull equisense-origin main 2>/dev/null || true
```

- [ ] **Step 2: eq-deploy에 변경 사항 반영**

```bash
# eq-deploy는 소스 코드 브랜치 — 변경된 3개 파일만 복사
cp /Users/nelcome/Codes/Claude_code_repository/equisense/frontend/lib/adapters/moat.ts \
   /private/tmp/eq-deploy/frontend/lib/adapters/moat.ts

cp /Users/nelcome/Codes/Claude_code_repository/equisense/frontend/components/charts/MoatCharts.tsx \
   /private/tmp/eq-deploy/frontend/components/charts/MoatCharts.tsx

cp /Users/nelcome/Codes/Claude_code_repository/equisense/frontend/app/companies/\[ticker\]/moat/MoatPage.tsx \
   "/private/tmp/eq-deploy/frontend/app/companies/[ticker]/moat/MoatPage.tsx"
```

- [ ] **Step 3: 커밋 + 푸시**

```bash
cd /private/tmp/eq-deploy
git add frontend/lib/adapters/moat.ts \
        frontend/components/charts/MoatCharts.tsx \
        "frontend/app/companies/[ticker]/moat/MoatPage.tsx"

git commit -m "feat(moat): 해자 개념 소개·지표 상세설명·Analyst Note 자동 생성

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git push equisense-origin HEAD:main
```

- [ ] **Step 4: GitHub Actions 완료 확인**

```bash
until gh run list --repo drbrookskim/equisense --limit 1 2>&1 | grep -q "completed"; do sleep 5; done
gh run list --repo drbrookskim/equisense --limit 2
```

Expected: `Deploy to GitHub Pages` → `success`
