# 뉴스 기반 기획 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 PITL 아이디어 마법사에 "뉴스로 시작" 모드를 추가 — Naver 검색/RSS/붙여넣기로 기사를 가져와 빠른 기획서(detailed-planning) 또는 심층 분석(3C→4P)으로 분기한다.

**Architecture:** page.tsx에 `appMode('select'|'idea'|'news')` 추가. config 설정 후 ModeSelector를 통해 분기. 뉴스 소스는 `/api/news` 라우트(서버)에서 처리. AI 생성은 기존 `/api/generate` 재사용에 `detailed-planning` 케이스 추가.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind, xml2js (RSS 파싱), 기존 @anthropic-ai/sdk / openai / @google/generative-ai

---

## File Structure

```
pitl/
├── app/
│   ├── page.tsx                             ← appMode 추가, ModeSelector 통합 (수정)
│   └── api/
│       ├── generate/route.ts                ← detailed-planning 케이스 추가 (수정)
│       └── news/route.ts                    ← 뉴스 검색/파싱 라우트 (신규)
├── components/
│   ├── ModeSelector.tsx                     ← 아이디어/뉴스 모드 선택 (신규)
│   └── news/
│       ├── NewsWizard.tsx                   ← 뉴스 마법사 오케스트레이터 (신규)
│       ├── NewsStep0Input.tsx               ← Naver/RSS/붙여넣기 3탭 (신규)
│       ├── NewsStep1Select.tsx              ← 기사 목록 선택 (신규)
│       ├── NewsStep2Mode.tsx                ← 빠른기획서/심층분석 선택 (신규)
│       └── NewsStep3Result.tsx              ← detailed-planning 결과 (신규)
├── lib/
│   ├── prompts.ts                           ← detailed-planning 케이스 추가 (수정)
│   └── news/
│       ├── naver.ts                         ← Naver 검색 API (신규)
│       ├── rss.ts                           ← RSS 파싱 (신규)
│       └── paste.ts                         ← URL/텍스트 파싱 (신규)
└── types/
    └── index.ts                             ← NewsArticle, NewsSource, NewsMode 추가 (수정)
```

---

### Task 1: xml2js 설치 + .env.local 설정

**Files:**
- Modify: `package.json`
- Create: `.env.local`

- [ ] **Step 1: xml2js 설치**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npm install xml2js
npm install -D @types/xml2js
```

Expected: `node_modules/xml2js` 존재

- [ ] **Step 2: .env.local 생성**

```bash
cat > /Users/nelcome/Codes/Claude_code_repository/pitl/.env.local << 'EOF'
# Naver Search API (https://developers.naver.com에서 발급)
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
EOF
```

- [ ] **Step 3: .gitignore에 .env.local 확인**

```bash
grep ".env.local" /Users/nelcome/Codes/Claude_code_repository/pitl/.gitignore || echo "MISSING"
```

Expected: `.env.local` 이 이미 .gitignore에 포함됨. MISSING이면 추가:
```bash
echo ".env.local" >> /Users/nelcome/Codes/Claude_code_repository/pitl/.gitignore
```

- [ ] **Step 4: Commit**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
git add package.json package-lock.json .gitignore
git commit -m "chore: xml2js 설치 + .env.local 셋업

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 타입 확장

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: types/index.ts 전체 교체**

```typescript
// types/index.ts
export type Provider = 'claude' | 'openai' | 'gemini'
export type WizardStep = 0 | 1 | 2 | 3
export type GenerateStep = '3c' | '4p' | 'plan' | 'detailed-planning'
export type AppMode = 'select' | 'idea' | 'news'
export type NewsSource = 'naver' | 'rss' | 'paste'
export type NewsMode = 'fast' | 'deep'

export interface ProviderConfig {
  provider: Provider
  apiKey: string
  model: string
}

export interface WizardState extends ProviderConfig {
  step: WizardStep
  idea: string
  threeC: string
  fourP: string
  plan: string
}

export const MODELS: Record<Provider, string[]> = {
  claude: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'],
}

export interface GenerateRequest {
  provider: Provider
  apiKey: string
  model: string
  step: GenerateStep
  idea: string
  threeC?: string
  fourP?: string
  newsContent?: string
}

export interface NewsArticle {
  title: string
  summary: string
  content: string
  url: string
}

export const RSS_CATEGORIES: Record<string, string> = {
  economy: '경제',
  it: 'IT/기술',
  politics: '정치',
  society: '사회',
}
```

- [ ] **Step 2: TypeScript 에러 없음 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음 (또는 기존 에러만)

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: 뉴스 기능 타입 추가 (NewsArticle, NewsSource, GenerateStep 확장)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: detailed-planning 프롬프트 + 테스트

**Files:**
- Modify: `lib/prompts.ts`
- Modify: `__tests__/lib/prompts.test.ts`

- [ ] **Step 1: 테스트에 detailed-planning 케이스 추가**

`__tests__/lib/prompts.test.ts` 파일 끝에 추가:

```typescript
  it('detailed-planning 프롬프트에 뉴스 내용을 포함한다', () => {
    const prompt = buildPrompt('detailed-planning', {
      idea: '',
      newsContent: '삼성전자 AI 반도체 투자 확대 발표',
    })
    expect(prompt).toContain('삼성전자 AI 반도체 투자 확대 발표')
    expect(prompt).toContain('Why')
    expect(prompt).toContain('HTML')
  })
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx jest __tests__/lib/prompts.test.ts --no-coverage
```

Expected: FAIL (buildPrompt does not handle 'detailed-planning')

- [ ] **Step 3: lib/prompts.ts에 케이스 추가**

`lib/prompts.ts`의 `PromptContext` 인터페이스 수정 및 케이스 추가:

```typescript
import type { GenerateStep } from '@/types'

interface PromptContext {
  idea: string
  threeC?: string
  fourP?: string
  newsContent?: string
}

export function buildPrompt(step: GenerateStep, ctx: PromptContext): string {
  switch (step) {
    case '3c':
      return `당신은 시장 분석 전문가입니다. 다음 아이디어를 3C 분석(Company, Customer, Competitor)해주세요.

아이디어: ${ctx.idea}

다음 형식으로 분석해주세요:

## Company (자사 분석)
- 핵심 역량:
- 보유 자원:
- 약점:

## Customer (고객 분석)
- 타겟 고객:
- 핵심 니즈:
- 페인포인트:

## Competitor (경쟁사 분석)
- 주요 경쟁사:
- 차별화 기회:
- 시장 포지셔닝:`

    case '4p':
      return `당신은 마케팅 전략 전문가입니다. 다음 3C 분석을 바탕으로 4P 전략을 수립해주세요.

3C 분석 결과:
${ctx.threeC}

다음 형식으로 전략을 수립해주세요:

## Product (제품/서비스)
- 핵심 제품/서비스:
- USP (Unique Selling Proposition):
- 기능 우선순위:

## Price (가격)
- 가격 전략:
- 수익 모델:
- 가격 근거 (3C 기반):

## Place (유통)
- 주요 채널:
- GTM 전략:
- 초기 진입 전략:

## Promotion (프로모션)
- 핵심 메시지:
- 마케팅 채널:
- 초기 캠페인:`

    case 'plan':
      return `당신은 서비스 기획 전문가입니다. 아래 분석을 바탕으로 전문적인 HTML 기획서를 작성해주세요.

원본 아이디어: ${ctx.idea}

3C 분석:
${ctx.threeC}

4P 전략:
${ctx.fourP}

완전한 HTML 파일로 작성해주세요. 다음 내용을 포함합니다:
1. 서비스 개요 및 Why (고객 페인포인트 × 자사 강점)
2. 서비스 개념 (Product USP, 핵심 메시지, 포지셔닝)
3. 사용 시나리오 (페르소나 기반 사용 흐름)
4. 핵심 기능 정의 (Must-have vs Nice-to-have)
5. 마케팅 전략 (Promotion 핵심 메시지 + 채널)
6. 실행 로드맵

CSS를 인라인으로 포함한 완전한 standalone HTML 파일로 작성해주세요. 시작은 반드시 <!DOCTYPE html>로 시작하세요.`

    case 'detailed-planning':
      return `당신은 서비스 기획 전문가입니다. 다음 뉴스 기사를 바탕으로 DHK 기획 방법론에 따라 완전한 HTML 기획서를 작성해주세요.

뉴스 기사:
${ctx.newsContent}

다음 5단계 파이프라인을 순서대로 실행하세요:

## 0. Why (왜) — 근본 니즈 도출
뉴스에서 드러나는 표면 문제를 5 Why로 파고들어 진짜 해결해야 할 니즈를 찾아내세요.

## 1. 개념 (Concept) — 이상적 서비스/제품 정의
- 핵심 가치 (User Value): 궁극적으로 전달하는 가치
- 사용자 이점 (User Benefit): 사용자가 얻는 구체적 혜택
- 핵심 메시지 (Message): 한 줄 본질 ("말 되네")
- 포지셔닝: 새로움/개선, 대체재/보완재, 보편성/차별성 중 선택

## 2. 시나리오 (Scenario) — 실제 사용 흐름
- 페르소나 + 상황 설정
- 단계별 사용 흐름
- Must-have vs Nice-to-have 기능 분류

## 3. 가지치기 (Pruning) — 핵심만 남기기
- 불필요한 기능 제거
- 가치 검증: "사용자에게 주려는 가치가 정말 이게 맞는가?"
- 핍진성 체크: 구체성·진정성·일관성

## 4. 스토리텔링 — 설득력 있는 기획 내러티브
만들기(What)와 전달하기(How) 모두 포함한 짧은 설득 내러티브.

CSS 인라인 포함 완전한 standalone HTML 파일로 작성해주세요. 반드시 <!DOCTYPE html>로 시작하세요. 각 단계를 섹션으로 구분하고 Must-have/Nice-to-have 토글을 포함하세요.`
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx jest __tests__/lib/prompts.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/prompts.ts __tests__/lib/prompts.test.ts
git commit -m "feat: detailed-planning 프롬프트 추가 (DHK 5단계 파이프라인)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Naver 뉴스 API 클라이언트

**Files:**
- Create: `lib/news/naver.ts`, `__tests__/lib/news/naver.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// __tests__/lib/news/naver.test.ts
/**
 * @jest-environment node
 */
import { searchNaverNews, stripHtml } from '@/lib/news/naver'

describe('stripHtml', () => {
  it('HTML 태그를 제거한다', () => {
    expect(stripHtml('<b>삼성전자</b> 실적 발표')).toBe('삼성전자 실적 발표')
  })

  it('HTML 엔티티를 디코딩한다', () => {
    expect(stripHtml('AI &amp; 반도체')).toBe('AI & 반도체')
  })
})

describe('searchNaverNews', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, NAVER_CLIENT_ID: 'test-id', NAVER_CLIENT_SECRET: 'test-secret' }
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  it('API 키 미설정 시 NAVER_API_NOT_CONFIGURED 에러를 던진다', async () => {
    process.env = { ...originalEnv, NAVER_CLIENT_ID: '', NAVER_CLIENT_SECRET: '' }
    await expect(searchNaverNews('AI')).rejects.toThrow('NAVER_API_NOT_CONFIGURED')
  })

  it('검색 결과를 NewsArticle 배열로 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { title: '<b>AI</b> 반도체', description: '삼성이 <b>AI</b> 투자를 발표했다.', link: 'https://example.com/1' },
        ],
      }),
    }) as jest.Mock

    const articles = await searchNaverNews('AI 반도체')
    expect(articles).toHaveLength(1)
    expect(articles[0].title).toBe('AI 반도체')
    expect(articles[0].url).toBe('https://example.com/1')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
mkdir -p __tests__/lib/news
npx jest __tests__/lib/news/naver.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: lib/news/naver.ts 구현**

```typescript
// lib/news/naver.ts
import type { NewsArticle } from '@/types'

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim()
}

export async function searchNaverNews(query: string): Promise<NewsArticle[]> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('NAVER_API_NOT_CONFIGURED')
  }

  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=10&sort=date`

  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })

  if (!res.ok) {
    throw new Error(`Naver API error: ${res.status}`)
  }

  const data = await res.json()

  return (data.items ?? []).map((item: { title: string; description: string; link: string }) => ({
    title: stripHtml(item.title),
    summary: stripHtml(item.description),
    content: stripHtml(item.description),
    url: item.link,
  }))
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx jest __tests__/lib/news/naver.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/news/naver.ts __tests__/lib/news/naver.test.ts
git commit -m "feat: Naver 뉴스 검색 API 클라이언트

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: RSS 파싱

**Files:**
- Create: `lib/news/rss.ts`, `__tests__/lib/news/rss.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// __tests__/lib/news/rss.test.ts
/**
 * @jest-environment node
 */
import { fetchRssNews } from '@/lib/news/rss'

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>AI 반도체 투자 급증</title>
      <link>https://example.com/1</link>
      <description>국내 기업들이 AI 반도체에 대규모 투자를 시작했다.</description>
    </item>
    <item>
      <title>경제 성장률 발표</title>
      <link>https://example.com/2</link>
      <description>2분기 GDP 성장률이 예상을 상회했다.</description>
    </item>
  </channel>
</rss>`

describe('fetchRssNews', () => {
  afterEach(() => jest.restoreAllMocks())

  it('RSS XML을 파싱해 NewsArticle 배열을 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_RSS,
    }) as jest.Mock

    const articles = await fetchRssNews('economy')
    expect(articles).toHaveLength(2)
    expect(articles[0].title).toBe('AI 반도체 투자 급증')
    expect(articles[0].url).toBe('https://example.com/1')
    expect(articles[0].content).toBe('국내 기업들이 AI 반도체에 대규모 투자를 시작했다.')
  })

  it('알 수 없는 카테고리 시 에러를 던진다', async () => {
    await expect(fetchRssNews('unknown')).rejects.toThrow('Unknown category')
  })

  it('fetch 실패 시 에러를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as jest.Mock
    await expect(fetchRssNews('economy')).rejects.toThrow('RSS fetch failed')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx jest __tests__/lib/news/rss.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: lib/news/rss.ts 구현**

```typescript
// lib/news/rss.ts
import { parseStringPromise } from 'xml2js'
import type { NewsArticle } from '@/types'

const RSS_FEEDS: Record<string, string> = {
  economy: 'https://www.yonhapnews.co.kr/rss/economy.xml',
  it: 'https://www.yonhapnews.co.kr/rss/it.xml',
  politics: 'https://www.yonhapnews.co.kr/rss/politics.xml',
  society: 'https://www.yonhapnews.co.kr/rss/society.xml',
}

export async function fetchRssNews(category: string): Promise<NewsArticle[]> {
  const feedUrl = RSS_FEEDS[category]
  if (!feedUrl) throw new Error(`Unknown category: ${category}`)

  const res = await fetch(feedUrl)
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`)

  const xml = await res.text()
  const parsed = await parseStringPromise(xml)

  const items: Array<{ title?: string[]; link?: string[]; description?: string[] }> =
    parsed?.rss?.channel?.[0]?.item ?? []

  return items.slice(0, 10).map((item) => {
    const title = item.title?.[0] ?? ''
    const description = item.description?.[0] ?? ''
    const url = item.link?.[0] ?? ''
    return { title, summary: description.slice(0, 200), content: description, url }
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx jest __tests__/lib/news/rss.test.ts --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/news/rss.ts __tests__/lib/news/rss.test.ts
git commit -m "feat: RSS 피드 파싱 (연합뉴스 4개 카테고리)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: URL/텍스트 파싱

**Files:**
- Create: `lib/news/paste.ts`, `__tests__/lib/news/paste.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// __tests__/lib/news/paste.test.ts
/**
 * @jest-environment node
 */
import { parseFromText, parseFromUrl } from '@/lib/news/paste'

describe('parseFromText', () => {
  it('첫 줄을 title로, 전체를 content로 반환한다', () => {
    const text = '삼성전자 AI 투자 발표\n삼성전자가 AI 반도체에 10조원을 투자한다고 밝혔다.'
    const article = parseFromText(text)
    expect(article.title).toBe('삼성전자 AI 투자 발표')
    expect(article.content).toBe(text)
    expect(article.url).toBe('')
  })

  it('긴 title은 100자로 잘린다', () => {
    const longTitle = 'a'.repeat(150)
    const article = parseFromText(longTitle)
    expect(article.title.length).toBe(100)
  })
})

describe('parseFromUrl', () => {
  afterEach(() => jest.restoreAllMocks())

  it('URL에서 title과 텍스트를 추출한다', async () => {
    const html = '<html><head><title>AI 반도체 뉴스</title></head><body><p>삼성이 투자를 발표했다.</p></body></html>'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => html,
    }) as jest.Mock

    const article = await parseFromUrl('https://example.com/news/1')
    expect(article.title).toBe('AI 반도체 뉴스')
    expect(article.url).toBe('https://example.com/news/1')
    expect(article.content).toContain('삼성이 투자를 발표했다')
  })

  it('fetch 실패 시 에러를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as jest.Mock
    await expect(parseFromUrl('https://example.com/404')).rejects.toThrow('URL fetch failed')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx jest __tests__/lib/news/paste.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: lib/news/paste.ts 구현**

```typescript
// lib/news/paste.ts
import type { NewsArticle } from '@/types'

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function parseFromUrl(url: string): Promise<NewsArticle> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PITL/1.0)' },
  })
  if (!res.ok) throw new Error(`URL fetch failed: ${res.status}`)

  const html = await res.text()
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : url
  const text = stripHtmlTags(html).slice(0, 3000)

  return {
    title: title.slice(0, 100),
    summary: text.slice(0, 200),
    content: text,
    url,
  }
}

export function parseFromText(text: string): NewsArticle {
  const lines = text.trim().split('\n')
  const title = (lines[0] ?? '직접 입력한 기사').slice(0, 100)
  return {
    title,
    summary: text.slice(0, 200),
    content: text,
    url: '',
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx jest __tests__/lib/news/paste.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/news/paste.ts __tests__/lib/news/paste.test.ts
git commit -m "feat: URL/텍스트 붙여넣기 파싱

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: /api/news 라우트

**Files:**
- Create: `app/api/news/route.ts`

- [ ] **Step 1: app/api/news/route.ts 작성**

```typescript
// app/api/news/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { searchNaverNews } from '@/lib/news/naver'
import { fetchRssNews } from '@/lib/news/rss'
import { parseFromUrl, parseFromText } from '@/lib/news/paste'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const { source, query, category, url, text } = body

  try {
    switch (source) {
      case 'naver': {
        if (!query?.trim()) {
          return NextResponse.json({ error: '검색어를 입력해주세요' }, { status: 400 })
        }
        const articles = await searchNaverNews(query)
        return NextResponse.json({ articles })
      }
      case 'rss': {
        if (!category) {
          return NextResponse.json({ error: '카테고리를 선택해주세요' }, { status: 400 })
        }
        const articles = await fetchRssNews(category)
        return NextResponse.json({ articles })
      }
      case 'paste': {
        if (url?.trim()) {
          const article = await parseFromUrl(url.trim())
          return NextResponse.json({ articles: [article] })
        }
        if (text?.trim()) {
          const article = parseFromText(text.trim())
          return NextResponse.json({ articles: [article] })
        }
        return NextResponse.json({ error: 'URL 또는 텍스트를 입력해주세요' }, { status: 400 })
      }
      default:
        return NextResponse.json({ error: `Unknown source: ${source}` }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed'
    if (message === 'NAVER_API_NOT_CONFIGURED') {
      return NextResponse.json({ error: 'NAVER_API_NOT_CONFIGURED' }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add app/api/news/route.ts
git commit -m "feat: /api/news 라우트 (Naver/RSS/paste 통합)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: /api/generate 라우트 업데이트

**Files:**
- Modify: `app/api/generate/route.ts`

- [ ] **Step 1: route.ts 수정 — newsContent 지원**

```typescript
// app/api/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers'
import { buildPrompt } from '@/lib/prompts'
import type { GenerateRequest } from '@/types'

export async function POST(req: NextRequest) {
  let body: GenerateRequest

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { provider, apiKey, model, step, idea, threeC, fourP, newsContent } = body

  if (!provider || !apiKey || !model || !step) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (step === 'detailed-planning' && !newsContent) {
    return NextResponse.json({ error: 'newsContent required for detailed-planning' }, { status: 400 })
  }

  if (step !== 'detailed-planning' && idea === undefined) {
    return NextResponse.json({ error: 'idea required' }, { status: 400 })
  }

  const prompt = buildPrompt(step, { idea: idea ?? '', threeC, fourP, newsContent })

  try {
    const generate = getProvider(provider)
    const stream = await generate(prompt, apiKey, model)
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
```

- [ ] **Step 2: 타입 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/route.ts
git commit -m "feat: /api/generate에 detailed-planning + newsContent 지원

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: ModeSelector 컴포넌트

**Files:**
- Create: `components/ModeSelector.tsx`, `__tests__/components/ModeSelector.test.tsx`

- [ ] **Step 1: 테스트 작성**

```typescript
// __tests__/components/ModeSelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import ModeSelector from '@/components/ModeSelector'

describe('ModeSelector', () => {
  it('두 가지 모드 버튼을 렌더링한다', () => {
    render(<ModeSelector onSelect={jest.fn()} />)
    expect(screen.getByText(/아이디어로 시작/)).toBeInTheDocument()
    expect(screen.getByText(/뉴스로 시작/)).toBeInTheDocument()
  })

  it('아이디어 버튼 클릭 시 onSelect("idea")를 호출한다', () => {
    const onSelect = jest.fn()
    render(<ModeSelector onSelect={onSelect} />)
    fireEvent.click(screen.getByText(/아이디어로 시작/))
    expect(onSelect).toHaveBeenCalledWith('idea')
  })

  it('뉴스 버튼 클릭 시 onSelect("news")를 호출한다', () => {
    const onSelect = jest.fn()
    render(<ModeSelector onSelect={onSelect} />)
    fireEvent.click(screen.getByText(/뉴스로 시작/))
    expect(onSelect).toHaveBeenCalledWith('news')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx jest __tests__/components/ModeSelector.test.tsx --no-coverage
```

Expected: FAIL

- [ ] **Step 3: components/ModeSelector.tsx 작성**

```tsx
// components/ModeSelector.tsx
import type { AppMode } from '@/types'

interface ModeSelectorProps {
  onSelect: (mode: Exclude<AppMode, 'select'>) => void
}

export default function ModeSelector({ onSelect }: ModeSelectorProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-center">시작 방법을 선택하세요</h2>
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onSelect('idea')}
          className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all"
        >
          <span className="text-4xl">💡</span>
          <div className="text-center">
            <div className="font-semibold text-gray-900">아이디어로 시작</div>
            <div className="text-sm text-gray-500 mt-1">3C 분석 → 4P 전략 → 기획서</div>
          </div>
        </button>
        <button
          onClick={() => onSelect('news')}
          className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all"
        >
          <span className="text-4xl">📰</span>
          <div className="text-center">
            <div className="font-semibold text-gray-900">뉴스로 시작</div>
            <div className="text-sm text-gray-500 mt-1">뉴스 검색 → 기획서 자동 생성</div>
          </div>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx jest __tests__/components/ModeSelector.test.tsx --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ModeSelector.tsx __tests__/components/ModeSelector.test.tsx
git commit -m "feat: ModeSelector 컴포넌트 (아이디어/뉴스 모드 선택)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 10: NewsStep0Input 컴포넌트 (3탭)

**Files:**
- Create: `components/news/NewsStep0Input.tsx`

- [ ] **Step 1: components/news/NewsStep0Input.tsx 작성**

```tsx
// components/news/NewsStep0Input.tsx
'use client'
import { useState } from 'react'
import type { NewsSource, NewsArticle, RSS_CATEGORIES } from '@/types'
import { RSS_CATEGORIES as CATEGORIES } from '@/types'

interface NewsStep0InputProps {
  naverAvailable: boolean
  onArticlesFound: (articles: NewsArticle[]) => void
}

export default function NewsStep0Input({ naverAvailable, onArticlesFound }: NewsStep0InputProps) {
  const [tab, setTab] = useState<NewsSource>(naverAvailable ? 'naver' : 'rss')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('economy')
  const [pasteUrl, setPasteUrl] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [pasteMode, setPasteMode] = useState<'url' | 'text'>('url')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const tabs: { id: NewsSource; label: string; disabled?: boolean }[] = [
    { id: 'naver', label: 'Naver 검색', disabled: !naverAvailable },
    { id: 'rss', label: 'RSS 피드' },
    { id: 'paste', label: '직접 입력' },
  ]

  const handleSearch = async () => {
    setError('')
    setIsLoading(true)

    let body: Record<string, string> = { source: tab }
    if (tab === 'naver') {
      if (!query.trim()) { setError('검색어를 입력해주세요'); setIsLoading(false); return }
      body.query = query
    } else if (tab === 'rss') {
      body.category = category
    } else {
      if (pasteMode === 'url') {
        if (!pasteUrl.trim()) { setError('URL을 입력해주세요'); setIsLoading(false); return }
        body.url = pasteUrl
      } else {
        if (!pasteText.trim()) { setError('텍스트를 입력해주세요'); setIsLoading(false); return }
        body.text = pasteText
      }
    }

    try {
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '검색 실패')
      onArticlesFound(data.articles)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Step 1: 뉴스 검색</h2>

      <div className="flex border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => !t.disabled && setTab(t.id)}
            disabled={t.disabled}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : t.disabled
                ? 'border-transparent text-gray-300 cursor-not-allowed'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.disabled && <span className="ml-1 text-xs">(키 미설정)</span>}
          </button>
        ))}
      </div>

      {tab === 'naver' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="검색 키워드를 입력하세요"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {tab === 'rss' && (
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.entries(CATEGORIES).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      )}

      {tab === 'paste' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(['url', 'text'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPasteMode(m)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  pasteMode === m ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'
                }`}
              >
                {m === 'url' ? 'URL 입력' : '텍스트 붙여넣기'}
              </button>
            ))}
          </div>
          {pasteMode === 'url' ? (
            <input
              type="url"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="https://news.example.com/article/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="기사 내용을 직접 붙여넣으세요..."
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          )}
        </div>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={handleSearch}
        disabled={isLoading}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isLoading ? '검색 중...' : tab === 'rss' ? '최신 뉴스 가져오기' : '검색'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
git add components/news/NewsStep0Input.tsx
git commit -m "feat: NewsStep0Input — Naver/RSS/붙여넣기 3탭 뉴스 입력

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 11: NewsStep1Select 컴포넌트

**Files:**
- Create: `components/news/NewsStep1Select.tsx`, `__tests__/components/news/NewsStep1Select.test.tsx`

- [ ] **Step 1: 테스트 작성**

```typescript
// __tests__/components/news/NewsStep1Select.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import NewsStep1Select from '@/components/news/NewsStep1Select'
import type { NewsArticle } from '@/types'

const articles: NewsArticle[] = [
  { title: '삼성전자 AI 투자', summary: '삼성이 AI에 투자한다.', content: '전체 내용', url: 'https://ex.com/1' },
  { title: 'SK하이닉스 실적', summary: 'SK가 실적을 발표했다.', content: '전체 내용2', url: 'https://ex.com/2' },
]

describe('NewsStep1Select', () => {
  it('기사 목록을 렌더링한다', () => {
    render(<NewsStep1Select articles={articles} onSelect={jest.fn()} onBack={jest.fn()} />)
    expect(screen.getByText('삼성전자 AI 투자')).toBeInTheDocument()
    expect(screen.getByText('SK하이닉스 실적')).toBeInTheDocument()
  })

  it('기사 클릭 시 onSelect를 호출한다', () => {
    const onSelect = jest.fn()
    render(<NewsStep1Select articles={articles} onSelect={onSelect} onBack={jest.fn()} />)
    fireEvent.click(screen.getByText('삼성전자 AI 투자'))
    expect(onSelect).toHaveBeenCalledWith(articles[0])
  })

  it('이전 버튼 클릭 시 onBack을 호출한다', () => {
    const onBack = jest.fn()
    render(<NewsStep1Select articles={articles} onSelect={jest.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByText('← 다시 검색'))
    expect(onBack).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
mkdir -p __tests__/components/news
npx jest __tests__/components/news/NewsStep1Select.test.tsx --no-coverage
```

Expected: FAIL

- [ ] **Step 3: components/news/NewsStep1Select.tsx 작성**

```tsx
// components/news/NewsStep1Select.tsx
import type { NewsArticle } from '@/types'

interface NewsStep1SelectProps {
  articles: NewsArticle[]
  onSelect: (article: NewsArticle) => void
  onBack: () => void
}

export default function NewsStep1Select({ articles, onSelect, onBack }: NewsStep1SelectProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Step 2: 기사 선택</h2>
      <p className="text-sm text-gray-500">분석할 기사를 클릭해서 선택하세요.</p>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {articles.map((article, i) => (
          <button
            key={i}
            onClick={() => onSelect(article)}
            className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all"
          >
            <div className="font-medium text-gray-900 mb-1">{article.title}</div>
            <div className="text-sm text-gray-500 line-clamp-2">{article.summary}</div>
            {article.url && (
              <div className="text-xs text-blue-400 mt-1 truncate">{article.url}</div>
            )}
          </button>
        ))}
      </div>

      <button
        onClick={onBack}
        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
      >
        ← 다시 검색
      </button>
    </div>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx jest __tests__/components/news/NewsStep1Select.test.tsx --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/news/NewsStep1Select.tsx __tests__/components/news/NewsStep1Select.test.tsx
git commit -m "feat: NewsStep1Select — 기사 목록 선택

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 12: NewsStep2Mode + NewsStep3Result

**Files:**
- Create: `components/news/NewsStep2Mode.tsx`, `components/news/NewsStep3Result.tsx`

- [ ] **Step 1: components/news/NewsStep2Mode.tsx 작성**

```tsx
// components/news/NewsStep2Mode.tsx
import type { NewsArticle, NewsMode } from '@/types'

interface NewsStep2ModeProps {
  article: NewsArticle
  onSelect: (mode: NewsMode) => void
  onBack: () => void
}

export default function NewsStep2Mode({ article, onSelect, onBack }: NewsStep2ModeProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Step 3: 분석 방식 선택</h2>

      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="font-medium text-gray-900">{article.title}</div>
        <div className="text-sm text-gray-500 mt-1 line-clamp-3">{article.summary}</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onSelect('fast')}
          className="flex flex-col gap-2 p-5 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
        >
          <span className="text-2xl">⚡</span>
          <div>
            <div className="font-semibold">빠른 기획서</div>
            <div className="text-sm text-gray-500 mt-1">DHK 5단계 기획 방법론으로 바로 HTML 기획서 생성</div>
          </div>
        </button>
        <button
          onClick={() => onSelect('deep')}
          className="flex flex-col gap-2 p-5 border-2 border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
        >
          <span className="text-2xl">🔍</span>
          <div>
            <div className="font-semibold">심층 분석</div>
            <div className="text-sm text-gray-500 mt-1">3C 분석 → 4P 전략 → 기획서 (전체 마법사)</div>
          </div>
        </button>
      </div>

      <button
        onClick={onBack}
        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
      >
        ← 기사 다시 선택
      </button>
    </div>
  )
}
```

- [ ] **Step 2: components/news/NewsStep3Result.tsx 작성**

```tsx
// components/news/NewsStep3Result.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import type { ProviderConfig, NewsArticle } from '@/types'
import StreamingText from '@/components/ui/StreamingText'

interface NewsStep3ResultProps {
  config: ProviderConfig
  article: NewsArticle
  onBack: () => void
  onReset: () => void
}

export default function NewsStep3Result({
  config,
  article,
  onBack,
  onReset,
}: NewsStep3ResultProps) {
  const [plan, setPlan] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const hasGenerated = useRef(false)

  useEffect(() => {
    if (!hasGenerated.current) {
      hasGenerated.current = true
      handleGenerate()
    }
  }, [])

  const handleGenerate = async () => {
    setError('')
    setPlan('')
    setShowPreview(false)
    setIsLoading(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          step: 'detailed-planning',
          idea: '',
          newsContent: `제목: ${article.title}\n\n${article.content}`,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'API 오류')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let result = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        result += decoder.decode(value, { stream: true })
        setPlan(result)
      }

      setShowPreview(true)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  const extractHtml = (text: string): string => {
    const match = text.match(/<!DOCTYPE html>[\s\S]*/i)
    return match ? match[0] : text
  }

  const handleDownload = () => {
    const blob = new Blob([extractHtml(plan)], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pitl-news-plan-${Date.now()}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Step 4: 기획서 생성 중</h2>
      <div className="text-sm text-gray-500">기사: {article.title}</div>

      {error && (
        <div className="flex gap-2 items-center">
          <p className="text-red-500 text-sm">{error}</p>
          <button onClick={handleGenerate} className="text-sm text-blue-600 hover:underline">재시도</button>
        </div>
      )}

      {isLoading && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 min-h-24">
          <StreamingText text="" isLoading={true} />
        </div>
      )}

      {plan && !isLoading && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showPreview ? '미리보기 닫기' : '브라우저 미리보기'}
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              HTML 다운로드
            </button>
            <button onClick={handleGenerate} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              다시 생성
            </button>
          </div>
          {showPreview && (
            <iframe
              srcDoc={extractHtml(plan)}
              className="w-full h-[600px] border border-gray-200 rounded-lg"
              sandbox="allow-same-origin"
              title="기획서 미리보기"
            />
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          ← 이전
        </button>
        <button onClick={onReset} className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
          처음부터 다시
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
git add components/news/NewsStep2Mode.tsx components/news/NewsStep3Result.tsx
git commit -m "feat: NewsStep2Mode (분석 방식 선택) + NewsStep3Result (기획서 생성)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 13: NewsWizard 오케스트레이터

**Files:**
- Create: `components/news/NewsWizard.tsx`

- [ ] **Step 1: components/news/NewsWizard.tsx 작성**

```tsx
// components/news/NewsWizard.tsx
'use client'
import { useState } from 'react'
import type { ProviderConfig, NewsArticle, NewsMode } from '@/types'
import NewsStep0Input from './NewsStep0Input'
import NewsStep1Select from './NewsStep1Select'
import NewsStep2Mode from './NewsStep2Mode'
import NewsStep3Result from './NewsStep3Result'

type NewsStep = 0 | 1 | 2 | 3

interface NewsWizardProps {
  config: ProviderConfig
  naverAvailable: boolean
  onDeepAnalysis: (idea: string) => void
  onReset: () => void
}

export default function NewsWizard({
  config,
  naverAvailable,
  onDeepAnalysis,
  onReset,
}: NewsWizardProps) {
  const [step, setStep] = useState<NewsStep>(0)
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null)

  const handleArticlesFound = (found: NewsArticle[]) => {
    setArticles(found)
    setStep(1)
  }

  const handleArticleSelect = (article: NewsArticle) => {
    setSelectedArticle(article)
    setStep(2)
  }

  const handleModeSelect = (mode: NewsMode) => {
    if (mode === 'deep') {
      const idea = `${selectedArticle!.title}\n\n${selectedArticle!.content}`
      onDeepAnalysis(idea)
    } else {
      setStep(3)
    }
  }

  const stepLabels = ['검색', '기사 선택', '분석 방식', '기획서']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center mb-2">
        {stepLabels.map((label, i) => (
          <div key={i} className="flex items-center">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                i < step ? 'bg-green-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`ml-1 mr-1 text-xs hidden sm:block ${i === step ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
              {label}
            </span>
            {i < stepLabels.length - 1 && (
              <div className={`w-6 h-0.5 ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {step === 0 && (
        <NewsStep0Input naverAvailable={naverAvailable} onArticlesFound={handleArticlesFound} />
      )}
      {step === 1 && (
        <NewsStep1Select
          articles={articles}
          onSelect={handleArticleSelect}
          onBack={() => setStep(0)}
        />
      )}
      {step === 2 && selectedArticle && (
        <NewsStep2Mode
          article={selectedArticle}
          onSelect={handleModeSelect}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && selectedArticle && (
        <NewsStep3Result
          config={config}
          article={selectedArticle}
          onBack={() => setStep(2)}
          onReset={onReset}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
git add components/news/NewsWizard.tsx
git commit -m "feat: NewsWizard 오케스트레이터 (4단계 뉴스 마법사)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 14: page.tsx 통합 + 최종 빌드

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: app/page.tsx 전체 교체**

```tsx
// app/page.tsx
'use client'
import { useState, useEffect } from 'react'
import type { WizardStep, ProviderConfig, AppMode } from '@/types'
import Step0Setup from '@/components/wizard/Step0Setup'
import Step1ThreeC from '@/components/wizard/Step1ThreeC'
import Step2FourP from '@/components/wizard/Step2FourP'
import Step3Plan from '@/components/wizard/Step3Plan'
import ModeSelector from '@/components/ModeSelector'
import NewsWizard from '@/components/news/NewsWizard'

const SESSION_KEY = 'pitl_wizard'

interface SavedState {
  ideaStep: WizardStep
  config: ProviderConfig
  appMode: AppMode
  idea: string
  threeC: string
  fourP: string
}

function loadSession(): Partial<SavedState> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveSession(state: Partial<SavedState>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  } catch {}
}

export default function Home() {
  const [appMode, setAppMode] = useState<AppMode>('select')
  const [config, setConfig] = useState<ProviderConfig | null>(null)
  const [ideaStep, setIdeaStep] = useState<WizardStep>(0)
  const [idea, setIdea] = useState('')
  const [threeC, setThreeC] = useState('')
  const [fourP, setFourP] = useState('')
  const [naverAvailable, setNaverAvailable] = useState(false)

  useEffect(() => {
    const saved = loadSession()
    if (saved.config) {
      setConfig(saved.config)
      setAppMode(saved.appMode ?? 'select')
      setIdeaStep(saved.ideaStep ?? 1)
      setIdea(saved.idea ?? '')
      setThreeC(saved.threeC ?? '')
      setFourP(saved.fourP ?? '')
    }
    // Naver 가용 여부 확인
    fetch('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'naver', query: 'test' }),
    }).then((res) => {
      if (res.status !== 503) setNaverAvailable(true)
    }).catch(() => {})
  }, [])

  const handleSetup = (cfg: ProviderConfig) => {
    setConfig(cfg)
    setIdeaStep(0)
    setAppMode('select')
    saveSession({ config: cfg, appMode: 'select', ideaStep: 0, idea: '', threeC: '', fourP: '' })
  }

  const handleModeSelect = (mode: Exclude<AppMode, 'select'>) => {
    setAppMode(mode)
    if (mode === 'idea') setIdeaStep(1)
    saveSession({ config: config!, appMode: mode, ideaStep: mode === 'idea' ? 1 : 0, idea: '', threeC: '', fourP: '' })
  }

  const handleThreeCComplete = (newIdea: string, newThreeC: string) => {
    setIdea(newIdea); setThreeC(newThreeC); setIdeaStep(2)
    saveSession({ config: config!, appMode: 'idea', ideaStep: 2, idea: newIdea, threeC: newThreeC, fourP: '' })
  }

  const handleFourPComplete = (newFourP: string) => {
    setFourP(newFourP); setIdeaStep(3)
    saveSession({ config: config!, appMode: 'idea', ideaStep: 3, idea, threeC, fourP: newFourP })
  }

  const handleDeepAnalysis = (newsIdea: string) => {
    setIdea(newsIdea); setIdeaStep(1); setAppMode('idea')
    saveSession({ config: config!, appMode: 'idea', ideaStep: 1, idea: newsIdea, threeC: '', fourP: '' })
  }

  const handleReset = () => {
    setAppMode('select'); setConfig(null); setIdeaStep(0)
    setIdea(''); setThreeC(''); setFourP('')
    try { sessionStorage.removeItem(SESSION_KEY) } catch {}
  }

  const ideaStepLabels = ['설정', '3C 분석', '4P 전략', '기획서']

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">PITL</h1>
          <p className="text-gray-500 mt-1">아이디어 → 기획서 자동 생성</p>
        </div>

        {/* 아이디어 모드 스텝 인디케이터 */}
        {appMode === 'idea' && (
          <div className="flex items-center justify-center mb-8">
            {ideaStepLabels.map((label, i) => (
              <div key={i} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  i < ideaStep ? 'bg-green-500 text-white' : i === ideaStep ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {i < ideaStep ? '✓' : i + 1}
                </div>
                <span className={`ml-1 mr-1 text-xs hidden sm:block ${i === ideaStep ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                  {label}
                </span>
                {i < ideaStepLabels.length - 1 && (
                  <div className={`w-8 h-0.5 ${i < ideaStep ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {/* 설정 (공통) */}
          {!config && <Step0Setup onComplete={handleSetup} />}

          {/* 모드 선택 */}
          {config && appMode === 'select' && (
            <ModeSelector onSelect={handleModeSelect} />
          )}

          {/* 아이디어 모드 */}
          {config && appMode === 'idea' && ideaStep === 1 && (
            <Step1ThreeC config={config} onComplete={handleThreeCComplete} />
          )}
          {config && appMode === 'idea' && ideaStep === 2 && (
            <Step2FourP config={config} threeC={threeC} onComplete={handleFourPComplete} onBack={() => setIdeaStep(1)} />
          )}
          {config && appMode === 'idea' && ideaStep === 3 && (
            <Step3Plan config={config} idea={idea} threeC={threeC} fourP={fourP} onBack={() => setIdeaStep(2)} onReset={handleReset} />
          )}

          {/* 뉴스 모드 */}
          {config && appMode === 'news' && (
            <NewsWizard
              config={config}
              naverAvailable={naverAvailable}
              onDeepAnalysis={handleDeepAnalysis}
              onReset={handleReset}
            />
          )}
        </div>

        {/* 모드 전환 버튼 */}
        {config && appMode !== 'select' && (
          <div className="mt-4 text-center">
            <button
              onClick={() => { setAppMode('select'); setIdeaStep(0) }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              ← 모드 선택으로
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: 전체 테스트 실행**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx jest --no-coverage 2>&1 | tail -10
```

Expected: 모든 테스트 PASS

- [ ] **Step 3: 빌드 확인**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npm run build 2>&1 | tail -15
```

Expected: 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: page.tsx — 아이디어/뉴스 모드 분기 + NewsWizard 통합

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 셀프 리뷰

**Spec 커버리지:**
- ✅ Naver 뉴스 검색 (Task 4, 7)
- ✅ RSS 피드 4개 카테고리 (Task 5, 7)
- ✅ URL/텍스트 붙여넣기 (Task 6, 7)
- ✅ 기사 선택 (Task 11)
- ✅ 빠른 기획서 (detailed-planning) (Task 3, 12)
- ✅ 심층 분석 핸드오프 (Task 13, 14)
- ✅ 모드 선택 UI (Task 9, 14)
- ✅ Naver 키 미설정 시 탭 비활성화 (Task 10, 14)
- ✅ HTML 미리보기 + 다운로드 (Task 12)

**타입 일관성:**
- `NewsArticle` → Task 2 정의, Task 4-6 반환, Task 10-13 사용 — 일치
- `NewsMode = 'fast' | 'deep'` → Task 2 정의, Task 12-13 사용 — 일치
- `GenerateStep` → `'detailed-planning'` 추가, Task 3 프롬프트, Task 8 route, Task 12 fetch body — 일치
- `naverAvailable: boolean` → Task 10 prop, Task 13 prop, Task 14 상태 — 일치

**Placeholder:** 없음
