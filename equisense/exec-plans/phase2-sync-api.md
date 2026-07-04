# PHASE 2 — 동기형 API 완성 및 프론트엔드 연동 (Week 3~4)

> 이 단계의 목표는 "브라우저에서 종목코드를 입력하면 재무 차트와 해자 점수가 실제로 렌더링되는 것"을 확인하는 것입니다.
> M1·M2 백엔드는 Phase 1에서 완성되었으므로, 이 단계는 프론트엔드 연동과 Module 4 기술적 분석에 집중합니다.

---

## 목표 (Definition of Done for Phase 2)

- Next.js 14 App Router 기반 프론트엔드가 Vercel에 배포되고 도메인으로 접근 가능해야 합니다.
- Module 1: 종목코드 입력 → 5개년 매출/영업이익/순이익 막대 차트가 렌더링되어야 합니다 (AC-M1-004).
- Module 2: 해자 분석 페이지에서 4개 차원 레이더 차트와 WIDE/NARROW/NONE 배지가 표시되어야 합니다 (AC-M2-007).
- Module 4: `GET /companies/{ticker}/technical` 엔드포인트가 배포되고 주가 차트가 프론트엔드에 표시되어야 합니다.
- 프론트엔드에서 모든 API 호출은 서버 컴포넌트(Server Component) 또는 Route Handler를 경유하며, API 키가 클라이언트에 노출되지 않아야 합니다.

---

## 태스크 분해

### Week 3: 프론트엔드 기반 구축

**Task 3-1: Next.js 14 프로젝트 초기화**

`frontend/` 디렉토리에 Next.js 14 App Router 프로젝트를 생성합니다. TypeScript, ESLint, Prettier, Tailwind CSS를 설정합니다. Vercel 프로젝트를 생성하고 `main` 브랜치와 자동 배포를 연결합니다.

관련 AC: 없음 (인프라 설정)

**Task 3-2: 공통 레이아웃 및 종목 검색 UI**

글로벌 레이아웃 컴포넌트(헤더, 사이드바)와 종목코드 검색 인풋을 구현합니다. 검색 결과는 `/companies/{ticker}` 라우트로 이동합니다. 다크 모드를 지원합니다.

**Task 3-3: Module 1 재무 차트 UI (AC-M1-004)**

`/companies/{ticker}/fundamentals` 페이지를 구현합니다. 매출액·영업이익·순이익 5개년 추이를 막대 차트(Recharts 또는 Chart.js)로 시각화합니다. 차트는 모바일/태블릿/데스크톱 모두 반응형으로 렌더링되어야 합니다. 서버 컴포넌트에서 `GET /companies/{ticker}/fundamentals`를 호출하고 결과를 클라이언트 차트 컴포넌트에 props로 전달합니다.

관련 AC: `AC-M1-004`

**Task 3-4: Module 2 해자 차트 UI (AC-M2-007)**

`/companies/{ticker}/moat` 페이지를 구현합니다. 4개 차원 점수를 레이더 차트로 시각화합니다. 종합 등급(WIDE/NARROW/NONE)을 색상 배지로 상단에 표시합니다. 404(해자 점수 미입력) 시 "아직 분석가가 점수를 입력하지 않았습니다" 안내 메시지를 표시합니다.

관련 AC: `AC-M2-007`

### Week 4: Module 4 기술적 분석

**Task 4-1: Module 4 설계 문서 및 수용 기준 작성**

`design-docs/module4-technical.md`와 `product-specs/AC-M4-technical.md`를 작성합니다. Module 4는 동기 Lambda(TTL 15분 캐싱)로 구현합니다.

**Task 4-2: GetTechnicalData Lambda 구현**

`GET /companies/{ticker}/technical?market={KR|US}&period={1m|3m|6m|1y|3y}` 엔드포인트를 구현합니다. Alpha Vantage 또는 FMP에서 주가 데이터를 조회합니다. 캐시 TTL: 장 중 900초(15분), 장 마감 후 86,400초(24시간). 단위 테스트 커버리지 80% 이상.

관련 AC: `AC-M4-001` ~ `AC-M4-003`

**Task 4-3: Module 4 프론트엔드 차트 UI**

`/companies/{ticker}/technical` 페이지를 구현합니다. 주가 캔들스틱 차트(또는 라인 차트)와 거래량 차트를 렌더링합니다. 기간 선택 버튼(1M / 3M / 6M / 1Y / 3Y)을 구현합니다. Vercel Edge Function에서 Upstash Redis를 직접 조회하는 최적 경로를 사용합니다(ARCHITECTURE.md 참조).

관련 AC: `AC-M4-004`

---

## 위험 요소 및 대응 방안

**위험 1: CORS 설정 누락**

프론트엔드(Vercel)와 백엔드(API Gateway)의 도메인이 다르므로 API Gateway에서 CORS 헤더를 명시적으로 설정해야 합니다. `serverless.yml`의 `cors: true` 옵션으로 처리하며, 프리플라이트(OPTIONS) 요청에도 올바른 헤더가 반환되는지 확인합니다.

**위험 2: Cognito 인증 연동 복잡도**

Phase 2에서는 Cognito 연동을 완전히 구현하기보다, API Gateway의 인증 요구사항을 임시로 우회(개발 전용 API Key)하여 UI 개발을 먼저 진행합니다. 인증 연동은 Phase 4에서 완성합니다.

**위험 3: Alpha Vantage Rate Limit**

Alpha Vantage 무료 티어는 분당 5회, 일 500회 제한이 있습니다. Module 4 개발 중 Rate Limit에 도달하면 모킹 데이터로 전환합니다.
