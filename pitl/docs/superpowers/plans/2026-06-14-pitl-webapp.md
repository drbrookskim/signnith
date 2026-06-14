# PITL 웹앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이디어 → 3C 분석 → 4P 전략 → HTML 기획서를 생성하는 4단계 마법사 웹앱 구현 (Claude/OpenAI/Gemini 멀티 프로바이더)

**Architecture:** Next.js App Router + API Routes가 AI SDK를 서버에서 호출해 스트리밍 응답 반환. 브라우저는 fetch ReadableStream으로 수신. 사용자 API 키는 요청 body에 담겨 서버에서만 사용, 저장 안 함.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, @anthropic-ai/sdk, openai, @google/generative-ai, Jest + React Testing Library

---

## File Structure

```
pitl/
├── app/
│   ├── layout.tsx                     ← 루트 레이아웃
│   ├── page.tsx                       ← 마법사 상태 오케스트레이터
│   ├── globals.css
│   └── api/generate/route.ts          ← 스트리밍 프록시 (POST)
├── components/
│   ├── wizard/
│   │   ├── Step0Setup.tsx             ← 프로바이더/API키/모델 선택
│   │   ├── Step1ThreeC.tsx            ← 아이디어 입력 + 3C 생성
│   │   ├── Step2FourP.tsx             ← 4P 전략 생성
│   │   └── Step3Plan.tsx              ← 최종 기획서 + 다운로드
│   └── ui/
│       └── StreamingText.tsx          ← SSE 스트림 → 텍스트 렌더러
├── lib/
│   ├── providers/
│   │   ├── index.ts                   ← generate() 팩토리 함수
│   │   ├── claude.ts                  ← Anthropic SDK 어댑터
│   │   ├── openai.ts                  ← OpenAI SDK 어댑터
│   │   └── gemini.ts                  ← Google Generative AI 어댑터
│   └── prompts.ts                     ← 3C / 4P / Plan 프롬프트 템플릿
├── types/index.ts                     ← 공유 타입
└── __tests__/
    ├── lib/prompts.test.ts
    ├── lib/providers/claude.test.ts
    ├── lib/providers/openai.test.ts
    ├── lib/providers/gemini.test.ts
    └── components/Step0Setup.test.tsx
```

---

### Task 1: Next.js 프로젝트 초기화

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`

- [ ] **Step 1: Next.js 초기화 (pitl/ 디렉토리 안에서 실행)**

```bash
cd /Users/nelcome/Codes/Claude_code_repository/pitl
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --no-git --yes
```

Expected: `package.json`, `next.config.ts`, `tsconfig.json` 등 생성됨

- [ ] **Step 2: AI SDK 패키지 설치**

```bash
npm install @anthropic-ai/sdk openai @google/generative-ai
```

Expected: `node_modules/` 안에 세 패키지 설치됨

- [ ] **Step 3: 불필요한 파일 삭제**

```bash
rm -rf app/fonts public/next.svg public/vercel.svg
```

- [ ] **Step 4: 개발 서버 정상 기동 확인**

```bash
npm run dev &
sleep 3 && curl -s http://localhost:3000 | head -5
kill %1
```

Expected: HTML 응답 확인

- [ ] **Step 5: Commit**

```bash
git add app/ public/ next.config.ts tsconfig.json tailwind.config.ts postcss.config.mjs package.json package-lock.json .gitignore .eslintrc.json
git commit -m "feat: Next.js 프로젝트 초기화"
```

---

### Task 2: Jest 테스트 환경 설정

**Files:**
- Create: `jest.config.ts`, `jest.setup.ts`
- Modify: `package.json`

- [ ] **Step 1: Jest 관련 패키지 설치**

```bash
npm install -D jest @types/jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: jest.config.ts 작성**

```typescript
// jest.config.ts
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
}

export default createJestConfig(config)
```

- [ ] **Step 3: jest.setup.ts 작성**

```typescript
// jest.setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 4: package.json에 test 스크립트 추가**

`package.json`의 `"scripts"` 안에 추가:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 5: 빈 테스트로 Jest 동작 확인**

```bash
mkdir -p __tests__/lib/providers __tests__/components
echo 'test("setup", () => expect(1).toBe(1))' > __tests__/setup.test.ts
npx jest __tests__/setup.test.ts
```

Expected: `PASS __tests__/setup.test.ts`

```bash
rm __tests__/setup.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add jest.config.ts jest.setup.ts package.json package-lock.json
git commit -m "chore: Jest 테스트 환경 설정"
```

---

### Task 3: 공유 타입 정의

**Files:**
- Create: `types/index.ts`

- [ ] **Step 1: types/index.ts 작성**

```typescript
// types/index.ts
export type Provider = 'claude' | 'openai' | 'gemini'
export type WizardStep = 0 | 1 | 2 | 3
export type GenerateStep = '3c' | '4p' | 'plan'

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
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: 공유 타입 정의"
```

---

### Task 4: 프롬프트 템플릿

**Files:**
- Create: `lib/prompts.ts`, `__tests__/lib/prompts.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// __tests__/lib/prompts.test.ts
import { buildPrompt } from '@/lib/prompts'

describe('buildPrompt', () => {
  it('3c 프롬프트에 아이디어를 포함한다', () => {
    const prompt = buildPrompt('3c', { idea: 'AI 식단 앱', threeC: '', fourP: '' })
    expect(prompt).toContain('AI 식단 앱')
    expect(prompt).toContain('3C')
  })

  it('4p 프롬프트에 3C 분석 결과를 포함한다', () => {
    const prompt = buildPrompt('4p', { idea: '', threeC: '고객: MZ세대', fourP: '' })
    expect(prompt).toContain('고객: MZ세대')
    expect(prompt).toContain('4P')
  })

  it('plan 프롬프트에 아이디어, 3C, 4P를 모두 포함한다', () => {
    const prompt = buildPrompt('plan', { idea: '앱', threeC: '3C결과', fourP: '4P결과' })
    expect(prompt).toContain('앱')
    expect(prompt).toContain('3C결과')
    expect(prompt).toContain('4P결과')
    expect(prompt).toContain('HTML')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx jest __tests__/lib/prompts.test.ts
```

Expected: FAIL (Cannot find module '@/lib/prompts')

- [ ] **Step 3: lib/prompts.ts 구현**

```typescript
// lib/prompts.ts
import type { GenerateStep } from '@/types'

interface PromptContext {
  idea: string
  threeC?: string
  fourP?: string
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
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest __tests__/lib/prompts.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/prompts.ts __tests__/lib/prompts.test.ts
git commit -m "feat: 3C/4P/Plan 프롬프트 템플릿"
```

---

### Task 5: Provider 어댑터 — Claude

**Files:**
- Create: `lib/providers/claude.ts`, `__tests__/lib/providers/claude.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// __tests__/lib/providers/claude.test.ts
import { generateWithClaude } from '@/lib/providers/claude'

jest.mock('@anthropic-ai/sdk', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      messages: {
        stream: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } }
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'World' } }
          },
        }),
      },
    })),
  }
})

describe('generateWithClaude', () => {
  it('스트리밍 텍스트를 ReadableStream으로 반환한다', async () => {
    const stream = await generateWithClaude('test prompt', 'sk-test', 'claude-sonnet-4-6')
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let result = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value)
    }

    expect(result).toBe('Hello World')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx jest __tests__/lib/providers/claude.test.ts
```

Expected: FAIL

- [ ] **Step 3: lib/providers/claude.ts 구현**

```typescript
// lib/providers/claude.ts
import Anthropic from '@anthropic-ai/sdk'

export async function generateWithClaude(
  prompt: string,
  apiKey: string,
  model: string
): Promise<ReadableStream<Uint8Array>> {
  const client = new Anthropic({ apiKey })
  const stream = client.messages.stream({
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(new TextEncoder().encode(chunk.delta.text))
        }
      }
      controller.close()
    },
    cancel() {
      stream.abort()
    },
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest __tests__/lib/providers/claude.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/providers/claude.ts __tests__/lib/providers/claude.test.ts
git commit -m "feat: Claude provider 어댑터"
```

---

### Task 6: Provider 어댑터 — OpenAI

**Files:**
- Create: `lib/providers/openai.ts`, `__tests__/lib/providers/openai.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// __tests__/lib/providers/openai.test.ts
import { generateWithOpenAI } from '@/lib/providers/openai'

jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockReturnValue({
            [Symbol.asyncIterator]: async function* () {
              yield { choices: [{ delta: { content: 'Hello ' } }] }
              yield { choices: [{ delta: { content: 'World' } }] }
            },
          }),
        },
      },
    })),
  }
})

describe('generateWithOpenAI', () => {
  it('스트리밍 텍스트를 ReadableStream으로 반환한다', async () => {
    const stream = await generateWithOpenAI('test prompt', 'sk-test', 'gpt-4o')
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let result = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value)
    }

    expect(result).toBe('Hello World')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx jest __tests__/lib/providers/openai.test.ts
```

Expected: FAIL

- [ ] **Step 3: lib/providers/openai.ts 구현**

```typescript
// lib/providers/openai.ts
import OpenAI from 'openai'

export async function generateWithOpenAI(
  prompt: string,
  apiKey: string,
  model: string
): Promise<ReadableStream<Uint8Array>> {
  const client = new OpenAI({ apiKey })
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    max_tokens: 8192,
  })

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? ''
        if (text) {
          controller.enqueue(new TextEncoder().encode(text))
        }
      }
      controller.close()
    },
    async cancel() {
      await stream.controller.abort()
    },
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest __tests__/lib/providers/openai.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/providers/openai.ts __tests__/lib/providers/openai.test.ts
git commit -m "feat: OpenAI provider 어댑터"
```

---

### Task 7: Provider 어댑터 — Gemini

**Files:**
- Create: `lib/providers/gemini.ts`, `__tests__/lib/providers/gemini.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// __tests__/lib/providers/gemini.test.ts
import { generateWithGemini } from '@/lib/providers/gemini'

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContentStream: jest.fn().mockResolvedValue({
        stream: (async function* () {
          yield { text: () => 'Hello ' }
          yield { text: () => 'World' }
        })(),
      }),
    }),
  })),
}))

describe('generateWithGemini', () => {
  it('스트리밍 텍스트를 ReadableStream으로 반환한다', async () => {
    const stream = await generateWithGemini('test prompt', 'ai-test', 'gemini-2.0-flash')
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let result = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value)
    }

    expect(result).toBe('Hello World')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx jest __tests__/lib/providers/gemini.test.ts
```

Expected: FAIL

- [ ] **Step 3: lib/providers/gemini.ts 구현**

```typescript
// lib/providers/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function generateWithGemini(
  prompt: string,
  apiKey: string,
  model: string
): Promise<ReadableStream<Uint8Array>> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model })
  const result = await geminiModel.generateContentStream(prompt)

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) {
          controller.enqueue(new TextEncoder().encode(text))
        }
      }
      controller.close()
    },
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest __tests__/lib/providers/gemini.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/providers/gemini.ts __tests__/lib/providers/gemini.test.ts
git commit -m "feat: Gemini provider 어댑터"
```

---

### Task 8: Provider 팩토리 + API Route

**Files:**
- Create: `lib/providers/index.ts`, `app/api/generate/route.ts`

- [ ] **Step 1: lib/providers/index.ts 작성**

```typescript
// lib/providers/index.ts
import type { Provider } from '@/types'
import { generateWithClaude } from './claude'
import { generateWithOpenAI } from './openai'
import { generateWithGemini } from './gemini'

export function getProvider(
  provider: Provider
): (prompt: string, apiKey: string, model: string) => Promise<ReadableStream<Uint8Array>> {
  switch (provider) {
    case 'claude': return generateWithClaude
    case 'openai': return generateWithOpenAI
    case 'gemini': return generateWithGemini
  }
}
```

- [ ] **Step 2: app/api/generate/route.ts 작성**

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

  const { provider, apiKey, model, step, idea, threeC, fourP } = body

  if (!provider || !apiKey || !model || !step || !idea) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const prompt = buildPrompt(step, { idea, threeC, fourP })

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

- [ ] **Step 3: 개발 서버에서 API 라우트 수동 확인**

```bash
npm run dev &
sleep 3
curl -s -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"provider":"claude","apiKey":"invalid","model":"claude-sonnet-4-6","step":"3c","idea":"test"}' \
  | head -c 200
kill %1
```

Expected: 에러 메시지 (invalid key) 또는 스트리밍 시작

- [ ] **Step 4: Commit**

```bash
git add lib/providers/index.ts app/api/generate/route.ts
git commit -m "feat: provider 팩토리 + /api/generate 라우트"
```

---

### Task 9: StreamingText 컴포넌트

**Files:**
- Create: `components/ui/StreamingText.tsx`, `__tests__/components/StreamingText.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// __tests__/components/StreamingText.test.tsx
import { render, screen } from '@testing-library/react'
import StreamingText from '@/components/ui/StreamingText'

describe('StreamingText', () => {
  it('텍스트를 렌더링한다', () => {
    render(<StreamingText text="안녕하세요" />)
    expect(screen.getByText('안녕하세요')).toBeInTheDocument()
  })

  it('로딩 중일 때 스피너를 표시한다', () => {
    render(<StreamingText text="" isLoading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('빈 텍스트에 플레이스홀더를 표시한다', () => {
    render(<StreamingText text="" placeholder="분석 결과가 여기에 표시됩니다" />)
    expect(screen.getByText('분석 결과가 여기에 표시됩니다')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx jest __tests__/components/StreamingText.test.tsx
```

Expected: FAIL

- [ ] **Step 3: components/ui/StreamingText.tsx 구현**

```tsx
// components/ui/StreamingText.tsx
interface StreamingTextProps {
  text: string
  isLoading?: boolean
  placeholder?: string
  className?: string
}

export default function StreamingText({
  text,
  isLoading = false,
  placeholder,
  className = '',
}: StreamingTextProps) {
  if (isLoading && !text) {
    return (
      <div className={`flex items-center gap-2 text-gray-400 ${className}`}>
        <span role="status" className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        <span>생성 중...</span>
      </div>
    )
  }

  if (!text && placeholder) {
    return <p className={`text-gray-400 italic ${className}`}>{placeholder}</p>
  }

  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {text}
      {isLoading && <span className="inline-block w-1 h-4 ml-0.5 bg-gray-700 animate-pulse" />}
    </div>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest __tests__/components/StreamingText.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/StreamingText.tsx __tests__/components/StreamingText.test.tsx
git commit -m "feat: StreamingText 컴포넌트"
```

---

### Task 10: Step0Setup 컴포넌트

**Files:**
- Create: `components/wizard/Step0Setup.tsx`, `__tests__/components/Step0Setup.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// __tests__/components/Step0Setup.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import Step0Setup from '@/components/wizard/Step0Setup'

const mockOnComplete = jest.fn()

describe('Step0Setup', () => {
  beforeEach(() => mockOnComplete.mockClear())

  it('세 가지 프로바이더 옵션을 렌더링한다', () => {
    render(<Step0Setup onComplete={mockOnComplete} />)
    expect(screen.getByLabelText('Claude')).toBeInTheDocument()
    expect(screen.getByLabelText('ChatGPT')).toBeInTheDocument()
    expect(screen.getByLabelText('Gemini')).toBeInTheDocument()
  })

  it('API 키 없이 시작하기 클릭 시 에러를 표시한다', () => {
    render(<Step0Setup onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByText('시작하기'))
    expect(screen.getByText('API 키를 입력해주세요')).toBeInTheDocument()
    expect(mockOnComplete).not.toHaveBeenCalled()
  })

  it('API 키 입력 후 시작하기 클릭 시 onComplete를 호출한다', () => {
    render(<Step0Setup onComplete={mockOnComplete} />)
    fireEvent.change(screen.getByPlaceholderText(/API 키/), { target: { value: 'sk-test-key' } })
    fireEvent.click(screen.getByText('시작하기'))
    expect(mockOnComplete).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-test-key', provider: 'claude' })
    )
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx jest __tests__/components/Step0Setup.test.tsx
```

Expected: FAIL

- [ ] **Step 3: components/wizard/Step0Setup.tsx 구현**

```tsx
// components/wizard/Step0Setup.tsx
'use client'
import { useState } from 'react'
import type { Provider, ProviderConfig } from '@/types'
import { MODELS } from '@/types'

interface Step0SetupProps {
  onComplete: (config: ProviderConfig) => void
}

export default function Step0Setup({ onComplete }: Step0SetupProps) {
  const [provider, setProvider] = useState<Provider>('claude')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(MODELS.claude[0])
  const [error, setError] = useState('')

  const handleProviderChange = (p: Provider) => {
    setProvider(p)
    setModel(MODELS[p][0])
    setError('')
  }

  const handleSubmit = () => {
    if (!apiKey.trim()) {
      setError('API 키를 입력해주세요')
      return
    }
    onComplete({ provider, apiKey: apiKey.trim(), model })
  }

  const providerLabels: Record<Provider, string> = {
    claude: 'Claude',
    openai: 'ChatGPT',
    gemini: 'Gemini',
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h2 className="text-xl font-semibold">AI 프로바이더 설정</h2>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">프로바이더</label>
        <div className="flex gap-4">
          {(['claude', 'openai', 'gemini'] as Provider[]).map((p) => (
            <label key={p} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value={p}
                checked={provider === p}
                onChange={() => handleProviderChange(p)}
                aria-label={providerLabels[p]}
              />
              {providerLabels[p]}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">API 키</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => { setApiKey(e.target.value); setError('') }}
          placeholder={`${providerLabels[provider]} API 키를 입력하세요`}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">모델</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {MODELS[provider].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={handleSubmit}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        시작하기
      </button>
    </div>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx jest __tests__/components/Step0Setup.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/wizard/Step0Setup.tsx __tests__/components/Step0Setup.test.tsx
git commit -m "feat: Step0Setup — 프로바이더/API키/모델 선택"
```

---

### Task 11: Step1ThreeC 컴포넌트

**Files:**
- Create: `components/wizard/Step1ThreeC.tsx`

- [ ] **Step 1: components/wizard/Step1ThreeC.tsx 작성**

```tsx
// components/wizard/Step1ThreeC.tsx
'use client'
import { useState, useRef } from 'react'
import type { ProviderConfig } from '@/types'
import StreamingText from '@/components/ui/StreamingText'

interface Step1ThreeCProps {
  config: ProviderConfig
  onComplete: (idea: string, threeC: string) => void
}

export default function Step1ThreeC({ config, onComplete }: Step1ThreeCProps) {
  const [idea, setIdea] = useState('')
  const [threeC, setThreeC] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const handleGenerate = async () => {
    if (!idea.trim()) { setError('아이디어를 입력해주세요'); return }
    setError('')
    setThreeC('')
    setIsLoading(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, step: '3c', idea }),
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
        setThreeC(result)
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleStop = () => { abortRef.current?.abort() }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Step 1: 아이디어 → 3C 분석</h2>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">아이디어</label>
        <textarea
          value={idea}
          onChange={(e) => { setIdea(e.target.value); setError('') }}
          placeholder="기획하고 싶은 서비스/제품 아이디어를 입력하세요"
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          3C 분석 시작
        </button>
        {isLoading && (
          <button onClick={handleStop} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            중단
          </button>
        )}
      </div>

      {(threeC || isLoading) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">3C 분석 결과 (편집 가능)</label>
            {threeC && !isLoading && (
              <button onClick={() => setIsEditing(!isEditing)} className="text-sm text-blue-600 hover:underline">
                {isEditing ? '완료' : '편집'}
              </button>
            )}
          </div>
          {isEditing ? (
            <textarea
              value={threeC}
              onChange={(e) => setThreeC(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
            />
          ) : (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 min-h-24">
              <StreamingText text={threeC} isLoading={isLoading} placeholder="분석 결과가 여기에 표시됩니다" />
            </div>
          )}
        </div>
      )}

      {threeC && !isLoading && (
        <button
          onClick={() => onComplete(idea, threeC)}
          className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          다음: 4P 전략 →
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/wizard/Step1ThreeC.tsx
git commit -m "feat: Step1ThreeC — 아이디어 입력 + 3C 분석"
```

---

### Task 12: Step2FourP 컴포넌트

**Files:**
- Create: `components/wizard/Step2FourP.tsx`

- [ ] **Step 1: components/wizard/Step2FourP.tsx 작성**

```tsx
// components/wizard/Step2FourP.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import type { ProviderConfig } from '@/types'
import StreamingText from '@/components/ui/StreamingText'

interface Step2FourPProps {
  config: ProviderConfig
  threeC: string
  onComplete: (fourP: string) => void
  onBack: () => void
}

export default function Step2FourP({ config, threeC, onComplete, onBack }: Step2FourPProps) {
  const [fourP, setFourP] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { handleGenerate() }, [])

  const handleGenerate = async () => {
    setError('')
    setFourP('')
    setIsLoading(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, step: '4p', idea: '', threeC }),
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
        setFourP(result)
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleStop = () => { abortRef.current?.abort() }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Step 2: 3C → 4P 전략</h2>

      {error && (
        <div className="flex gap-2 items-center">
          <p className="text-red-500 text-sm">{error}</p>
          <button onClick={handleGenerate} className="text-sm text-blue-600 hover:underline">재시도</button>
        </div>
      )}

      <div className="flex gap-2">
        {isLoading ? (
          <button onClick={handleStop} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            중단
          </button>
        ) : fourP && (
          <button onClick={handleGenerate} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            다시 생성
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">4P 전략 (편집 가능)</label>
          {fourP && !isLoading && (
            <button onClick={() => setIsEditing(!isEditing)} className="text-sm text-blue-600 hover:underline">
              {isEditing ? '완료' : '편집'}
            </button>
          )}
        </div>
        {isEditing ? (
          <textarea
            value={fourP}
            onChange={(e) => setFourP(e.target.value)}
            rows={14}
            className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
          />
        ) : (
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 min-h-32">
            <StreamingText text={fourP} isLoading={isLoading} placeholder="4P 전략을 생성 중입니다..." />
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          ← 이전
        </button>
        {fourP && !isLoading && (
          <button
            onClick={() => onComplete(fourP)}
            className="flex-1 py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            다음: 기획서 생성 →
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/wizard/Step2FourP.tsx
git commit -m "feat: Step2FourP — 4P 전략 생성"
```

---

### Task 13: Step3Plan 컴포넌트

**Files:**
- Create: `components/wizard/Step3Plan.tsx`

- [ ] **Step 1: components/wizard/Step3Plan.tsx 작성**

```tsx
// components/wizard/Step3Plan.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import type { ProviderConfig } from '@/types'
import StreamingText from '@/components/ui/StreamingText'

interface Step3PlanProps {
  config: ProviderConfig
  idea: string
  threeC: string
  fourP: string
  onBack: () => void
  onReset: () => void
}

export default function Step3Plan({ config, idea, threeC, fourP, onBack, onReset }: Step3PlanProps) {
  const [plan, setPlan] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { handleGenerate() }, [])

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
        body: JSON.stringify({ ...config, step: 'plan', idea, threeC, fourP }),
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
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleStop = () => { abortRef.current?.abort() }

  const handleDownload = () => {
    const blob = new Blob([plan], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pitl-plan-${Date.now()}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const extractHtml = (text: string) => {
    const match = text.match(/<!DOCTYPE html>[\s\S]*/i)
    return match ? match[0] : text
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Step 3: 최종 기획서</h2>

      {error && (
        <div className="flex gap-2 items-center">
          <p className="text-red-500 text-sm">{error}</p>
          <button onClick={handleGenerate} className="text-sm text-blue-600 hover:underline">재시도</button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 min-h-24">
            <StreamingText text="" isLoading={true} />
          </div>
          <button onClick={handleStop} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            중단
          </button>
        </div>
      )}

      {plan && !isLoading && (
        <div className="space-y-4">
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

- [ ] **Step 2: Commit**

```bash
git add components/wizard/Step3Plan.tsx
git commit -m "feat: Step3Plan — 기획서 생성 + iframe 미리보기 + 다운로드"
```

---

### Task 14: page.tsx 마법사 오케스트레이터 + 레이아웃

**Files:**
- Modify: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`

- [ ] **Step 1: app/page.tsx 작성**

```tsx
// app/page.tsx
'use client'
import { useState, useEffect } from 'react'
import type { WizardStep, ProviderConfig } from '@/types'
import Step0Setup from '@/components/wizard/Step0Setup'
import Step1ThreeC from '@/components/wizard/Step1ThreeC'
import Step2FourP from '@/components/wizard/Step2FourP'
import Step3Plan from '@/components/wizard/Step3Plan'

const SESSION_KEY = 'pitl_wizard'

interface SavedState {
  step: WizardStep
  config: ProviderConfig
  idea: string
  threeC: string
  fourP: string
}

function loadSession(): Partial<SavedState> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveSession(state: Partial<SavedState>) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)) } catch {}
}

export default function Home() {
  const [step, setStep] = useState<WizardStep>(0)
  const [config, setConfig] = useState<ProviderConfig | null>(null)
  const [idea, setIdea] = useState('')
  const [threeC, setThreeC] = useState('')
  const [fourP, setFourP] = useState('')

  useEffect(() => {
    const saved = loadSession()
    if (saved.step && saved.config) {
      setStep(saved.step)
      setConfig(saved.config)
      setIdea(saved.idea ?? '')
      setThreeC(saved.threeC ?? '')
      setFourP(saved.fourP ?? '')
    }
  }, [])

  const handleSetup = (cfg: ProviderConfig) => {
    setConfig(cfg)
    setStep(1)
    saveSession({ step: 1, config: cfg, idea: '', threeC: '', fourP: '' })
  }

  const handleThreeCComplete = (newIdea: string, newThreeC: string) => {
    setIdea(newIdea)
    setThreeC(newThreeC)
    setStep(2)
    saveSession({ step: 2, config: config!, idea: newIdea, threeC: newThreeC, fourP: '' })
  }

  const handleFourPComplete = (newFourP: string) => {
    setFourP(newFourP)
    setStep(3)
    saveSession({ step: 3, config: config!, idea, threeC, fourP: newFourP })
  }

  const handleReset = () => {
    setStep(0)
    setConfig(null)
    setIdea('')
    setThreeC('')
    setFourP('')
    try { sessionStorage.removeItem(SESSION_KEY) } catch {}
  }

  const steps = ['설정', '3C 분석', '4P 전략', '기획서']

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">PITL</h1>
          <p className="text-gray-500 mt-1">아이디어 → 기획서 자동 생성</p>
        </div>

        <div className="flex items-center justify-center mb-8 gap-0">
          {steps.map((label, i) => (
            <div key={i} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
                ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`ml-1 mr-1 text-xs hidden sm:block ${i === step ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {step === 0 && <Step0Setup onComplete={handleSetup} />}
          {step === 1 && config && (
            <Step1ThreeC config={config} onComplete={handleThreeCComplete} />
          )}
          {step === 2 && config && (
            <Step2FourP
              config={config}
              threeC={threeC}
              onComplete={handleFourPComplete}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && config && (
            <Step3Plan
              config={config}
              idea={idea}
              threeC={threeC}
              fourP={fourP}
              onBack={() => setStep(2)}
              onReset={handleReset}
            />
          )}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: app/layout.tsx 수정**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PITL — 아이디어 기획서 생성기',
  description: '아이디어를 3C 분석 → 4P 전략 → HTML 기획서로 자동 변환',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: 전체 테스트 실행**

```bash
npx jest
```

Expected: 모든 테스트 PASS

- [ ] **Step 4: 개발 서버에서 마법사 동작 확인**

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속 → Step 0~3 수동 흐름 확인

- [ ] **Step 5: 빌드 확인**

```bash
npm run build
```

Expected: 에러 없이 빌드 성공

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/layout.tsx app/globals.css
git commit -m "feat: 마법사 오케스트레이터 + 레이아웃 완성"
```

---

## 셀프 리뷰

**Spec 커버리지:**
- ✅ 4단계 마법사 (Step 0~3)
- ✅ Claude / OpenAI / Gemini 멀티 프로바이더
- ✅ 사용자 API 키 직접 입력 (저장 안 함)
- ✅ 스트리밍 응답
- ✅ 각 단계 결과 편집 가능
- ✅ 브라우저 미리보기 (iframe srcdoc)
- ✅ HTML 다운로드
- ✅ sessionStorage 복원

**타입 일관성:**
- `ProviderConfig` 타입이 Task 3 → Task 10 → Task 14까지 동일하게 사용됨
- `GenerateRequest`가 route.ts와 fetch body 형식 일치

**Placeholder:** 없음
