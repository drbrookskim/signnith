# 분석 탭 병합 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 펀더멘털·기술적 분석 두 탭을 "분석" 탭 하나로 합쳐 탭 수를 5개→4개로 줄인다.

**Architecture:** 신규 `/analysis` 라우트에 기존 `FundamentalsPage`와 `TechnicalPage`를 세로 스택으로 렌더링하는 `AnalysisPage`를 만들고, TabNav에서 두 항목을 하나로 교체한다. 기존 두 라우트는 삭제하지 않아 직접 URL 접근 호환성을 유지한다.

**Tech Stack:** TypeScript, Next.js 14 App Router (static export), Tailwind CSS

---

## 파일 변경 맵

| 파일 | 역할 |
|------|------|
| `frontend/app/companies/[ticker]/analysis/page.tsx` | Next.js 라우트 엔트리 |
| `frontend/app/companies/[ticker]/analysis/AnalysisPage.tsx` | 세로 스택 오케스트레이터 |
| `frontend/components/layout/TabNav.tsx` | TABS 배열 교체 |

---

## Task 1: AnalysisPage + page.tsx 생성

**Files:**
- Create: `frontend/app/companies/[ticker]/analysis/page.tsx`
- Create: `frontend/app/companies/[ticker]/analysis/AnalysisPage.tsx`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p "frontend/app/companies/[ticker]/analysis"
```

- [ ] **Step 2: page.tsx 생성**

`frontend/app/companies/[ticker]/analysis/page.tsx`:

```typescript
import AnalysisPage from './AnalysisPage'

export async function generateStaticParams() {
  return [{ ticker: '_' }]
}

export default async function Page() {
  return <AnalysisPage />
}
```

- [ ] **Step 3: AnalysisPage.tsx 생성**

`frontend/app/companies/[ticker]/analysis/AnalysisPage.tsx`:

```typescript
import { Suspense } from 'react'
import FundamentalsPage from '@/app/companies/[ticker]/fundamentals/FundamentalsPage'
import TechnicalPage from '@/app/companies/[ticker]/technical/TechnicalPage'

function Skeleton({ height }: { height: string }) {
  return <div className={`animate-pulse rounded ${height} bg-zinc-100 dark:bg-zinc-800`} />
}

export default function AnalysisPage() {
  return (
    <div className="space-y-12">
      <section>
        <Suspense fallback={<Skeleton height="h-60" />}>
          <FundamentalsPage />
        </Suspense>
      </section>

      <div className="flex items-center gap-4">
        <div className="flex-1 border-t border-zinc-200 dark:border-zinc-800" />
        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">기술적 분석</span>
        <div className="flex-1 border-t border-zinc-200 dark:border-zinc-800" />
      </div>

      <section>
        <Suspense fallback={<Skeleton height="h-80" />}>
          <TechnicalPage />
        </Suspense>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: 빌드 확인**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
git add "frontend/app/companies/[ticker]/analysis/"
git commit -m "feat(analysis): 분석 탭 신규 라우트 추가 (FundamentalsPage + TechnicalPage 세로 스택)"
```

---

## Task 2: TabNav — 2탭 → 1탭 교체

**Files:**
- Modify: `frontend/components/layout/TabNav.tsx`

- [ ] **Step 1: TABS 배열 교체**

`frontend/components/layout/TabNav.tsx`의 `TABS` 상수를 다음으로 교체:

```typescript
const TABS = [
  { label: '분석',        href: 'analysis' },
  { label: '해자',        href: 'moat' },
  { label: '정성적 분석', href: 'qualitative' },
  { label: '스윙 판정',   href: 'swing' },
]
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: 오류 없음.

- [ ] **Step 3: 커밋**

```bash
git add frontend/components/layout/TabNav.tsx
git commit -m "feat(nav): 펀더멘털·기술적 분석 탭 → 분석 탭으로 통합"
```

---

## Task 3: 빌드 + 배포 + 검증

- [ ] **Step 1: Next.js 정적 빌드**

```bash
cd frontend && npm run build 2>&1 | tail -15
```

Expected: `/companies/_/analysis` 라우트 포함, Export successful.

- [ ] **Step 2: eq-deploy worktree 준비**

```bash
git worktree list | grep eq-deploy || \
  (git worktree prune && git worktree add --detach /private/tmp/eq-deploy equisense-origin/main)
```

- [ ] **Step 3: 변경 파일 복사**

```bash
mkdir -p "/private/tmp/eq-deploy/frontend/app/companies/[ticker]/analysis"
cp "frontend/app/companies/[ticker]/analysis/page.tsx"        "/private/tmp/eq-deploy/frontend/app/companies/[ticker]/analysis/page.tsx"
cp "frontend/app/companies/[ticker]/analysis/AnalysisPage.tsx" "/private/tmp/eq-deploy/frontend/app/companies/[ticker]/analysis/AnalysisPage.tsx"
cp frontend/components/layout/TabNav.tsx                       /private/tmp/eq-deploy/frontend/components/layout/TabNav.tsx
```

- [ ] **Step 4: eq-deploy 커밋 + push**

```bash
cd /private/tmp/eq-deploy && \
git add \
  "frontend/app/companies/[ticker]/analysis/page.tsx" \
  "frontend/app/companies/[ticker]/analysis/AnalysisPage.tsx" \
  frontend/components/layout/TabNav.tsx && \
git commit -m "feat: 분석 탭 병합 (펀더멘털 + 기술적 분석)" && \
git push equisense-origin HEAD:main
```

- [ ] **Step 5: GitHub Actions 확인**

```bash
gh run list --repo drbrookskim/equisense --limit 3
```

Expected: "Deploy to GitHub Pages" → success.

- [ ] **Step 6: 수용 기준 검증**

`https://drbrookskim.github.io/equisense/` 에서:
- [ ] 탭 바에 "분석" 탭이 첫 번째로 표시된다
- [ ] "펀더멘털", "기술적 분석" 탭이 사라졌다
- [ ] 분석 탭 클릭 → SparklineCard 그리드 + 스윙 스코어카드 표시
- [ ] 스크롤 → "기술적 분석" 구분선 → 차트·토글 표시
- [ ] `/companies/_/fundamentals?ticker=AAPL` 직접 접근 → 여전히 동작
- [ ] 라이트/다크 모드 정상

---

## 자체 검토

**스펙 커버리지:**
- [x] `analysis/page.tsx` 신규 → Task 1
- [x] `AnalysisPage.tsx` FundamentalsPage + 구분선 + TechnicalPage → Task 1
- [x] TabNav 교체 → Task 2
- [x] 기존 라우트 유지 → 삭제 없음 (명시적 처리 불필요)
- [x] 수용 기준 8개 → Task 3 Step 6
