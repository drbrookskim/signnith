# PITL 뉴스 기반 기획 기능 설계 문서

**날짜:** 2026-06-14  
**상태:** 승인됨

---

## 개요

기존 PITL 아이디어 마법사에 "뉴스로 시작" 모드를 추가한다. 사용자는 홈에서 모드를 선택하고, 뉴스 기사를 검색·선택한 뒤 빠른 기획서(detailed-planning) 또는 심층 분석(3C→4P→기획서) 중 하나로 결과를 생성한다.

---

## 아키텍처

```
홈 (app/page.tsx) — 모드 선택
  ├── 아이디어로 시작 → 기존 IdeaWizard (변경 없음)
  └── 뉴스로 시작    → NewsWizard (신규)

POST /api/news        ← 뉴스 검색/파싱 라우트 (신규)
POST /api/generate    ← 기존 재사용 (detailed-planning 프롬프트 추가)
```

**Naver API 키:** 서버 환경변수 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 관리. 미설정 시 Naver 탭 비활성화.

---

## NewsWizard 흐름

### News Step 0 — 뉴스 입력 (3탭)

| 탭 | 설명 | API 키 필요 |
|----|------|------------|
| Naver 검색 | 키워드 입력 → 결과 목록 | ✅ (서버 env) |
| RSS 피드 | 카테고리 선택 → 최신 기사 | ❌ |
| 직접 입력 | URL 또는 텍스트 붙여넣기 | ❌ |

### News Step 1 — 기사 선택 + 내용 확인

- 검색/파싱 결과 목록에서 기사 선택
- 선택된 기사 제목 + 내용 표시 (편집 가능)

### News Step 2 — 분석 모드 선택

- **빠른 기획서:** detailed-planning 5단계 → News Step 3로 진행
- **심층 분석:** `NewsWizard`가 `onDeepAnalysis(idea: string)` 콜백으로 `page.tsx`에 알림 → `page.tsx`가 IdeaWizard로 전환하고 `idea` 필드에 기사 내용 주입 → 기존 3C→4P→기획서 흐름 진행

### News Step 3 — 결과 (빠른 기획서 모드만)

- 기존 `Step3Plan` 컴포넌트 재사용 (iframe 미리보기 + HTML 다운로드)
- 심층 분석 모드는 이 단계에 도달하지 않음 (IdeaWizard로 전환됨)

---

## 파일 구조 (변경/신규)

```
pitl/
├── app/
│   ├── page.tsx                        ← 모드 선택 UI 추가
│   └── api/
│       └── news/
│           └── route.ts                ← 뉴스 검색/파싱 라우트 (신규)
├── components/
│   ├── ModeSelector.tsx                ← 아이디어/뉴스 모드 선택 (신규)
│   └── news/
│       ├── NewsWizard.tsx              ← 뉴스 마법사 오케스트레이터 (신규)
│       ├── NewsStep0Input.tsx          ← 3탭 뉴스 입력 (신규)
│       ├── NewsStep1Select.tsx         ← 기사 선택 (신규)
│       ├── NewsStep2Mode.tsx           ← 분석 모드 선택 (신규)
│       └── NewsStep3Result.tsx         ← Step3Plan 래퍼 (신규)
├── lib/
│   ├── prompts.ts                      ← detailed-planning 케이스 추가
│   ├── news/
│   │   ├── naver.ts                    ← Naver 검색 API (신규)
│   │   ├── rss.ts                      ← RSS 파싱 (신규)
│   │   └── paste.ts                    ← URL/텍스트 파싱 (신규)
└── types/
    └── index.ts                        ← NewsArticle, NewsSource 타입 추가
```

---

## API 라우트: POST /api/news

**Request:**
```json
{
  "source": "naver" | "rss" | "paste",
  "query": "키워드",           // naver
  "category": "economy",       // rss: politics|economy|it|society
  "url": "https://...",        // paste (URL)
  "text": "기사 본문..."       // paste (텍스트 직접)
}
```

**Response:**
```json
{
  "articles": [
    { "title": "...", "summary": "...", "content": "...", "url": "..." }
  ]
}
```

---

## 프롬프트 추가: detailed-planning

`lib/prompts.ts`의 `buildPrompt`에 `'detailed-planning'` 케이스 추가:

```
당신은 서비스 기획 전문가입니다. 다음 뉴스 기사를 바탕으로
DHK 기획 방법론(Why→개념→시나리오→가지치기→스토리텔링)에 따라
완전한 HTML 기획서를 작성해주세요.

뉴스 기사:
{newsContent}

[5단계 파이프라인 상세 지시]
0. Why: 뉴스에서 드러나는 근본 니즈를 5 Why로 도출
1. 개념: 핵심가치·사용자이점·핵심메시지·포지셔닝
2. 시나리오: 페르소나 사용 흐름 + Must-have/Nice-to-have
3. 가지치기: 핵심만 남기는 가치 검증
4. 스토리텔링: 설득력 있는 기획 내러티브

CSS 인라인 포함 standalone HTML, <!DOCTYPE html>로 시작.
```

---

## RSS 피드 소스

| 카테고리 | RSS URL |
|---------|---------|
| 정치 | https://www.yonhapnews.co.kr/rss/politics.xml |
| 경제 | https://www.yonhapnews.co.kr/rss/economy.xml |
| IT/기술 | https://www.yonhapnews.co.kr/rss/it.xml |
| 사회 | https://www.yonhapnews.co.kr/rss/society.xml |

서버에서 fetch → `xml2js`로 파싱 → `{ title, link, description }` 추출

---

## 에러 처리

| 상황 | 처리 |
|------|------|
| NAVER_CLIENT_ID 미설정 | Naver 탭 비활성화 + "서버 설정 필요" 안내 |
| RSS fetch 실패 | 재시도 버튼 표시 |
| paste URL fetch 실패 | "텍스트를 직접 붙여넣어 주세요" 안내 |
| 기사 내용 없음 | "내용을 직접 입력해주세요" 안내 |

---

## 신규 타입

```typescript
export type NewsSource = 'naver' | 'rss' | 'paste'

export interface NewsArticle {
  title: string
  summary: string
  content: string
  url: string
}

export type NewsMode = 'detailed-planning' | 'deep-analysis'
export type GenerateStep = '3c' | '4p' | 'plan' | 'detailed-planning'  // 확장
```

---

## 범위 외

- 뉴스 북마크/저장
- 여러 기사 동시 분석
- 영문 뉴스 소스
