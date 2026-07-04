# 분석 탭 병합 설계 스펙

**날짜:** 2026-06-04  
**범위:** 펀더멘털 탭 + 기술적 분석 탭 → "분석" 탭 하나로 통합  
**레이아웃:** 세로 스택 (펀더멘털 → 구분선 → 기술적 분석)

---

## 1. 목표

현재 5개 탭(펀더멘털·해자·정성적·기술적·스윙 판정)을 4개로 줄인다.  
펀더멘털과 기술적 분석을 "분석" 탭 하나로 통합하여 탭 수를 줄이고 연관 정보를 한 화면에서 볼 수 있게 한다.

---

## 2. 변경 범위

### 신규 파일 (2개)

| 파일 | 역할 |
|------|------|
| `frontend/app/companies/[ticker]/analysis/page.tsx` | Next.js 라우트 (`generateStaticParams` 포함) |
| `frontend/app/companies/[ticker]/analysis/AnalysisPage.tsx` | 기존 FundamentalsPage + TechnicalPage 순서 렌더링 |

### 수정 파일 (1개)

| 파일 | 변경 내용 |
|------|----------|
| `frontend/components/layout/TabNav.tsx` | `fundamentals` + `technical` 두 항목 제거, `analysis` 하나 추가 |

### 변경 없는 파일

- `frontend/app/companies/[ticker]/fundamentals/` — 유지 (직접 URL 접근 호환성)
- `frontend/app/companies/[ticker]/technical/` — 유지 (동일 이유)
- `FundamentalsPage.tsx`, `TechnicalPage.tsx` — 변경 없음
- 기타 모든 탭 — 변경 없음

---

## 3. 컴포넌트 설계

### page.tsx

```typescript
import AnalysisPage from './AnalysisPage'

export async function generateStaticParams() {
  return [{ ticker: '_' }]
}

export default async function Page() {
  return <AnalysisPage />
}
```

### AnalysisPage.tsx

```typescript
'use client'

import { Suspense } from 'react'
import FundamentalsPage from '@/app/companies/[ticker]/fundamentals/FundamentalsPage'
import TechnicalPage from '@/app/companies/[ticker]/technical/TechnicalPage'

export default function AnalysisPage() {
  return (
    <div className="space-y-12">
      {/* 펀더멘털 섹션 */}
      <section>
        <Suspense fallback={<div className="animate-pulse h-8 w-48 rounded bg-zinc-100 dark:bg-zinc-800" />}>
          <FundamentalsPage />
        </Suspense>
      </section>

      {/* 구분선 */}
      <div className="flex items-center gap-4">
        <div className="flex-1 border-t border-zinc-200 dark:border-zinc-800" />
        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">기술적 분석</span>
        <div className="flex-1 border-t border-zinc-200 dark:border-zinc-800" />
      </div>

      {/* 기술적 분석 섹션 */}
      <section>
        <Suspense fallback={<div className="animate-pulse h-60 rounded bg-zinc-100 dark:bg-zinc-800" />}>
          <TechnicalPage />
        </Suspense>
      </section>
    </div>
  )
}
```

### TabNav.tsx TABS 변경

```typescript
// 변경 전
const TABS = [
  { label: '펀더멘털',    href: 'fundamentals' },
  { label: '해자',        href: 'moat' },
  { label: '정성적 분석', href: 'qualitative' },
  { label: '기술적 분석', href: 'technical' },
  { label: '스윙 판정',   href: 'swing' },
]

// 변경 후
const TABS = [
  { label: '분석',        href: 'analysis' },
  { label: '해자',        href: 'moat' },
  { label: '정성적 분석', href: 'qualitative' },
  { label: '스윙 판정',   href: 'swing' },
]
```

---

## 4. 수용 기준

- [ ] 탭 바: "분석" 탭이 첫 번째로 표시된다
- [ ] `/companies/_/analysis` 라우트가 정상 렌더링된다
- [ ] 분석 탭 상단: 기존 FundamentalsPage 전체 표시 (SparklineCard, 스윙 스코어카드 포함)
- [ ] 구분선("기술적 분석" 레이블)이 두 섹션 사이에 표시된다
- [ ] 분석 탭 하단: 기존 TechnicalPage 전체 표시 (차트, MA/BB/RSI/MACD 토글 포함)
- [ ] 기존 `/companies/_/fundamentals`, `/companies/_/technical` URL 직접 접근 시 여전히 동작
- [ ] TypeScript 빌드 오류 없음
- [ ] 라이트/다크 모드 정상 표시
