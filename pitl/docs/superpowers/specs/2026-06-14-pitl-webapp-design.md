# PITL 웹앱 설계 문서

**날짜:** 2026-06-14  
**상태:** 승인됨

---

## 개요

아이디어 하나를 입력받아 3C 분석 → 4P 전략 → HTML 기획서를 단계별 마법사 UI로 생성하는 웹앱. Claude / ChatGPT / Gemini 세 가지 AI 프로바이더를 지원하며, 사용자가 자신의 API 키를 직접 입력해 사용한다.

**대상 사용자:** 비개발자 포함 누구나 (로그인 불필요)  
**기술 스택:** Next.js (App Router) + API Routes  
**배포:** Vercel

---

## 아키텍처

```
브라우저 (Next.js 클라이언트)
  └── 마법사 UI (4단계)

Next.js API Routes (서버 사이드 프록시)
  └── /api/generate  ← provider, apiKey, step, context → 스트리밍 응답

Provider Adapter Layer
  ├── claude.ts   → Anthropic SDK
  ├── openai.ts   → OpenAI SDK
  └── gemini.ts   → Google Generative AI SDK
```

**보안 원칙:**
- API 키는 요청 헤더로 서버에 전달, 서버에서만 AI 호출에 사용
- 서버에 저장하지 않음
- 클라이언트 `sessionStorage`에 보관 (탭 닫으면 삭제)

---

## 마법사 단계

### Step 0 — 설정
- 프로바이더 선택: Claude / ChatGPT / Gemini (라디오 버튼)
- API 키 입력 (password input)
- 모델 선택 (프로바이더별 드롭다운)
  - Claude: claude-sonnet-4-6, claude-opus-4-8
  - ChatGPT: gpt-4o, gpt-4o-mini
  - Gemini: gemini-2.0-flash, gemini-2.5-pro
- "시작하기" → 키 유효성 테스트 호출 후 Step 1 진입

### Step 1 — 아이디어 → 3C 분석
- 아이디어 텍스트 입력 (textarea)
- "3C 분석 시작" → 스트리밍 결과 표시
- 결과 편집 가능
- "다음: 4P 전략 →" 버튼

### Step 2 — 3C → 4P 전략
- 3C 결과를 컨텍스트로 포함해 4P 생성
- 스트리밍 표시 + 편집 가능
- "다음: 기획서 생성 →" 버튼

### Step 3 — 최종 기획서
- 3C + 4P 통합해 HTML 기획서 생성
- 브라우저 내 미리보기 (iframe with `srcdoc` 속성 — XSS 방지)
- "HTML 다운로드" 버튼
- "처음부터 다시" 버튼

---

## 파일 구조

```
pitl/
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   └── api/
│       └── generate/
│           └── route.ts       ← 스트리밍 API 프록시 (POST)
├── components/
│   ├── wizard/
│   │   ├── Step0Setup.tsx
│   │   ├── Step1ThreeC.tsx
│   │   ├── Step2FourP.tsx
│   │   └── Step3Plan.tsx
│   └── ui/
│       └── StreamingText.tsx  ← ReadableStream → 텍스트 렌더러
├── lib/
│   ├── providers/
│   │   ├── index.ts           ← ProviderAdapter 인터페이스
│   │   ├── claude.ts
│   │   ├── openai.ts
│   │   └── gemini.ts
│   └── prompts.ts             ← 3C / 4P / Plan 프롬프트 템플릿
└── types/
    └── index.ts
```

---

## Provider Adapter 인터페이스

```typescript
interface ProviderAdapter {
  generate(
    prompt: string,
    apiKey: string,
    model: string
  ): Promise<ReadableStream<string>>
}
```

세 provider 모두 동일 인터페이스 구현. `route.ts`는 provider 타입에 따라 어댑터를 선택해 스트리밍 응답을 클라이언트에 전달.

---

## API Route

**POST /api/generate**

Request body:
```json
{
  "provider": "claude" | "openai" | "gemini",
  "apiKey": "sk-...",
  "model": "claude-sonnet-4-6",
  "step": "3c" | "4p" | "plan",
  "idea": "...",
  "threeC": "...",   // step이 4p, plan일 때
  "fourP": "..."     // step이 plan일 때
}
```

Response: `text/event-stream` (SSE 스트리밍)

---

## 에러 처리

| 상황 | 처리 |
|------|------|
| 잘못된 API 키 | Step 0에서 인라인 에러 표시 |
| Rate limit | "잠시 후 다시 시도해주세요" 안내 |
| 스트리밍 중단 | 사용자가 "중단" 버튼으로 취소, 부분 결과 유지 |
| 네트워크 오류 | 재시도 버튼 표시 |

---

## 세션 관리

- 각 단계 결과를 `sessionStorage`에 저장
- 새로고침 시 마지막 완료 단계로 복원
- API 키는 `sessionStorage`에만 보관 (탭 닫으면 삭제, localStorage 사용 안 함)

---

## 범위 외 (이번 구현에서 제외)

- 로그인 / 회원가입
- 기획서 히스토리 저장
- EquiSense와의 통합
- 다국어 지원
