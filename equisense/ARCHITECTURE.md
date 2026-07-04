# ARCHITECTURE.md — EquiSense 시스템 아키텍처

> 이 문서는 EquiSense 플랫폼의 최상위 구조와 데이터 흐름을 정의합니다.
> 모든 모듈 설계는 이 문서의 원칙에서 파생되어야 합니다.

---

## 1. 설계 철학

EquiSense는 세 가지 핵심 원칙 위에 세워집니다.

**Serverless-First**: 서버를 직접 관리하지 않습니다. 모든 컴퓨팅은 이벤트에 의해 트리거되며, 유휴 시 비용은 0에 수렴합니다. 이는 초기 인프라 비용 없이 수요에 따라 자동 스케일링되는 구조를 의미합니다.

**4-Stage Analysis Pipeline**: 펀더멘털 → 해자 → 정성적 → 기술적 분석이라는 투자 철학의 순서를 시스템 모듈 경계로 그대로 반영합니다. 각 모듈은 독립적으로 배포·확장 가능하지만, 분석 결과는 하나의 투자 판단으로 수렴합니다.

**Async by Default for Heavy Compute**: 3초를 초과하는 연산은 기본적으로 비동기로 처리합니다. 사용자는 즉각적인 UI 응답을 받고, 결과는 완료 시 푸시됩니다.

---

## 2. 전체 시스템 다이어그램

> **다이어그램 읽는 법:** 화살표는 요청/이벤트의 흐름 방향입니다. EventBridge는 Lambda를 직접 트리거하는 독립 스케줄러로 API Gateway와 병렬에 위치합니다. WebSocket 관리를 위한 connect/disconnect Lambda는 REST Lambda와 동일 계층에 존재합니다.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
│            Next.js 14 (App Router) — Vercel Edge Network             │
│   [ Module 1 UI ] [ Module 2 UI ] [ Module 3 UI ] [ Module 4 UI(*) ] │
│   (*) Module 4 주가 차트: Vercel Edge Function → Upstash Redis 직접 조회│
└───────────────────────────┬──────────────────────────────────────────┘
                            │ HTTPS                │ WebSocket
              ┌─────────────▼──────────┐  ┌────────▼─────────────────┐
              │  AWS API Gateway (REST) │  │ API Gateway (WebSocket)  │
              │  + Cognito Authorizer   │  │ + Cognito Authorizer      │
              │ /fundamentals /moat     │  │ $connect / $disconnect    │
              │ /qualitative /jobs/{id} │  │ $default (push 결과 전달)  │
              └────────┬───────────────┘  └──────────┬───────────────┘
                       │ Invoke                       │ Invoke
       ┌───────────────┼──────────────────────────────┤
       │               │                              │
┌──────▼──────────────────────────────────┐  ┌───────▼──────────────────┐
│         SYNC LAMBDA LAYER               │  │  WEBSOCKET LAMBDA LAYER   │
│  GetFundamentals   GetMoatScore         │  │  WsConnectHandler         │
│  GetTechnicalData  GetJobStatus         │  │  WsDisconnectHandler      │
│  AnalysisOrchestrator (→ SQS enqueue)  │  │  WsNotifyHandler          │
└───────────────────────┬─────────────────┘  └───────────────────────────┘
                        │ SendMessage (SQS)
              ┌─────────▼──────────────┐
              │      AWS SQS           │
              │  rag-jobs-queue        │
              │  (DLQ: rag-dlq)        │
              └─────────┬──────────────┘
                        │ Event Source Mapping (Push 트리거)
              ┌─────────▼──────────────────────────────────────────────┐
              │              ASYNC WORKER LAMBDA LAYER                 │
              │  RAGAnalysisWorker  (Step Functions로 분기 가능)        │
              │  MacroUpdateWorker  NewsIngestionWorker                │
              └──────────────────────────┬─────────────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────────────┐
│                          DATA LAYER                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  Neon PostgreSQL  │  │ Pinecone Server. │  │  Upstash Redis   │   │
│  │  (Serverless PG)  │  │  (Vector DB/RAG) │  │  (Cache Layer)   │   │
│  │  - users          │  │  - doc chunks    │  │  - 재무 TTL 24h  │   │
│  │  - companies      │  │  - embeddings    │  │  - 주가 TTL 15m  │   │
│  │  - analysis_jobs  │  │                  │  │  - 공시 TTL 1h   │   │
│  │  - moat_scores    │  └──────────────────┘  └──────────────────┘   │
│  └──────────────────┘                                                │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  S3 (문서 스토리지: 사업보고서 PDF, 실적발표 스크립트)           │    │
│  └──────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼────────────────────────────────┐
│                    EXTERNAL API LAYER                              │
│  Financial Modeling Prep │ Alpha Vantage │ DART API │ SEC EDGAR   │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│         SCHEDULER LAYER (API Gateway와 독립적으로 Lambda 직접 트리거)│
│  Amazon EventBridge                                                │
│    cron(0 15 * * ? *)  → MacroUpdateWorker    (매일 00:00 KST)     │
│    cron(0 9  * * ? *)  → NewsIngestionWorker  (매일 18:00 KST)     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. 4대 모듈 아키텍처

### Module 1: 펀더멘털 엔진 (Fundamental Engine)

목적: 3대 재무제표(손익계산서, 대차대조표, 현금흐름표)를 자동 수집·정규화하여 시각화합니다.

흐름: 사용자가 종목코드를 입력하면 API Gateway가 `GetFundamentals` Lambda를 동기 호출합니다. Lambda는 먼저 Upstash Redis에서 캐시를 조회하고, 캐시 미스(TTL 만료 또는 최초 요청)인 경우 FMP/Alpha Vantage API에서 데이터를 가져와 Neon DB에 저장한 뒤 Redis에 캐싱합니다. 재무 데이터는 변동이 느리므로 TTL을 24시간으로 설정합니다.

핵심 지표: PER, PBR, ROE, ROA, 부채비율, 영업이익률, FCF(잉여현금흐름).

### Module 2: 해자 및 거시 동향 트래커 (Moat & Macro Tracker)

목적: 비용 우위, 무형 자산, 전환 비용, 네트워크 효과의 4가지 경제적 해자를 0~10점으로 점수화하고, 금리·섹터 ETF 등 거시 지표를 시각화합니다.

흐름: 해자 점수는 분석가가 `MoatScore` 테이블에 직접 입력하거나 AI 보조로 산출하며, API Gateway → `GetMoatScore` Lambda → Neon DB 조회로 서빙됩니다. 거시 지표는 **EventBridge 스케줄러**가 매일 자정에 `MacroUpdateWorker` Lambda를 트리거하여 수집·저장하는 Pull 방식입니다.

### Module 3: AI 기반 정성적 분석기 (Qualitative AI Analyzer)

목적: RAG 파이프라인으로 실적 발표 스크립트와 공식 사업보고서를 분석하여 경영진의 언행일치 점수와 노이즈 필터링 결과를 제공합니다.

흐름(비동기): 사용자가 분석을 요청하면 `AnalysisOrchestrator` Lambda가 SQS 큐에 작업 메시지를 등록하고, API Gateway는 즉시 `202 Accepted`와 `job_id`를 반환합니다. SQS는 **Event Source Mapping** 방식으로 `RAGAnalysisWorker` Lambda를 트리거합니다(Lambda가 SQS를 폴링하는 것이 아니라, AWS 런타임이 배치 메시지를 Lambda에 푸시합니다). 분석 작업이 단계별로 복잡하고 각 단계에서 실패가 발생할 수 있으므로, 문서 수집 → 청킹 → 임베딩 → LLM 분석의 4단계는 **AWS Step Functions**로 분리합니다. 각 단계가 독립 Lambda로 실행되어 단계별 재시도와 상태 추적이 가능합니다. 완료 시 `WsNotifyHandler` Lambda가 연결된 WebSocket 클라이언트에 결과를 푸시합니다. 프론트엔드는 WebSocket 연결이 없는 경우 `GET /jobs/{job_id}` 폴링으로 대체합니다.

### Module 4: 기술적 분석 대시보드 (Technical Analysis Dashboard)

목적: 인터랙티브 캔들스틱 차트, 지지/저항선, 저평가·단기 과열 스크리닝 로직을 제공합니다.

흐름: TradingView Lightweight Charts 라이브러리를 프론트엔드에서 직접 렌더링합니다. 주가 및 거래량 데이터는 Vercel Edge Function이 서빙합니다. 이 때 Edge Function은 외부 주가 API를 직접 호출하지 않고, **Upstash Redis에서만 캐싱된 데이터를 조회**합니다. Redis 캐시를 채우는(Write) 주체는 EventBridge 스케줄러가 트리거하는 `PriceUpdateWorker` Lambda이며, 이 Lambda만 외부 API 키를 보유합니다. Edge Function은 Redis 읽기 전용 토큰(read-only token)만 사용하여 캐시 미스 시 빈 응답을 반환하고, 클라이언트가 재시도하도록 설계합니다. 스크리닝 결과(저평가/과열 판단)는 `TechnicalScreener` Lambda가 계산하여 Neon DB에 저장합니다.

---

## 4. 비동기 작업 상태 흐름

```
[User Request]
      │
      ▼
[202 Accepted + job_id 반환]
      │
      ▼
   PENDING ──→ PROCESSING ──→ COMPLETED
                                  │
              실패 시              ├── 성공: results 저장
                 └──────────────▶ FAILED (retry_count, error_message 기록)
```

작업 상태는 Neon DB의 `analysis_jobs` 테이블에서 관리합니다. 최대 재시도 횟수는 3회이며, 이후 `FAILED` 상태로 전환하고 알림을 발송합니다.

---

## 5. CI/CD 파이프라인

```
GitHub Push (feature branch)
      │
      ▼
GitHub Actions (CI)
  ├── Python: pytest + ruff + black check
  ├── TypeScript: eslint + jest
  └── 보안 스캔: Bandit (Python), npm audit
      │
      ▼ (main 브랜치 병합 시)
GitHub Actions (CD)
  ├── 프론트엔드: Vercel 자동 배포
  └── 백엔드: Serverless Framework → AWS Lambda 무중단 배포
```

---

## 6. 기술 스택 요약표

| 계층 | 기술 | 역할 |
|------|------|------|
| 프론트엔드 | Next.js 14 + TypeScript | UI 렌더링, 사용자 인터랙션 |
| 호스팅 | Vercel | Edge 배포, Edge Functions |
| API 게이트웨이 | AWS API Gateway | REST + WebSocket 라우팅 |
| 동기 연산 | AWS Lambda (Python 3.11) | 재무·차트 데이터 서빙 |
| 비동기 연산 | AWS SQS + Lambda | RAG 분석, 뉴스 수집 |
| 스케줄링 | Amazon EventBridge | 일별 데이터 갱신 크론잡 |
| 관계형 DB | Neon (Serverless PostgreSQL) | 영구 데이터 저장 |
| 벡터 DB | Pinecone Serverless | RAG 임베딩 검색 |
| 캐시 | Upstash Redis | API 응답 캐싱 |
| IaC | Serverless Framework / AWS SAM | 인프라 코드 관리 |
| CI/CD | GitHub Actions | 자동 테스트 및 배포 |

---

_Last updated: 2026-05-17 | Version: 1.0.0_
