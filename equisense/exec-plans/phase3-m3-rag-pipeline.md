# PHASE 3 — Module 3 AI 정성적 분석기: 비동기 RAG 파이프라인 구현 (Week 5~6)

> **원칙**: 배포·환경 설정은 이 단계의 범위 밖입니다. 모든 외부 의존성(DART, OpenAI, Claude, Pinecone)은
> `unittest.mock`으로 격리하여 테스트합니다. Serverless Framework 리소스 정의(SQS, S3, Step Functions)는
> `serverless.yml`에 코드로 관리하며, 실 배포 없이 구현 완료로 간주합니다.

---

## 목표 (Definition of Done for Phase 3)

- `POST /companies/{ticker}/qualitative` 요청이 202와 `job_id`를 반환합니다.
- SQS Event Source Mapping → Step Functions 4단계(FetchDoc → ChunkDoc → EmbedChunks → LLMAnalyze)가
  문서 수집·청킹·임베딩·AI 분석을 순차 처리합니다.
- `GET /jobs/{job_id}`로 `PENDING → PROCESSING → COMPLETED | FAILED` 상태와 최종 분석 결과를 조회합니다.
- Module 3 프론트엔드에서 분석 요청 버튼 → 폴링 → 결과 카드가 렌더링됩니다
  (WebSocket push는 Phase 4로 이관, Phase 3에서는 클라이언트 폴링으로 결과 확인).
- 신규 Lambda 핵심 비즈니스 로직 커버리지 **80% 이상** 유지.

---

## 아키텍처 요약

```
POST /qualitative
      │
      ▼
AnalysisOrchestrator Lambda
  ├── Neon DB: analysis_jobs INSERT (status=PENDING)
  └── SQS: SendMessage(job_id)
      │ 202 반환 ──────────────────────────────── 클라이언트
      │
      ▼ (Event Source Mapping — AWS 런타임이 Lambda에 Push)
RAGTriggerLambda
  └── Step Functions: StartExecution(job_id)
        │
        ├── State 1: FetchDocLambda
        │     DART API / SEC EDGAR → PDF 다운로드 → S3(/raw/{job_id}.pdf)
        │
        ├── State 2: ChunkDocLambda
        │     S3 PDF → 512토큰 청킹(50토큰 오버랩) → S3(/chunks/{job_id}.json)
        │
        ├── State 3: EmbedChunksLambda
        │     S3 청크 → OpenAI text-embedding-3-small → Pinecone upsert
        │
        └── State 4: LLMAnalyzeLambda
              Pinecone 유사도 검색(top-10) → Claude Sonnet
              → qualitative_results INSERT
              → analysis_jobs UPDATE (status=COMPLETED)

GET /jobs/{job_id}
      │
      ▼
GetJobStatus Lambda → Neon DB 조회 → 상태 + 결과 반환
```

---

## Task 분해

### Week 5: 인프라 기반 + Orchestrator + Step 1

---

**Task 5-1: DB 마이그레이션 — Module 3 테이블**

`alembic/versions/002_module3_qualitative.py` 마이그레이션을 작성합니다.
`design-docs/module3-qualitative.md` 4절의 스키마를 그대로 구현합니다.

생성 테이블:
- `analysis_jobs`: `id(UUID PK)`, `ticker`, `market`, `doc_type`, `fiscal_year`,
  `status(VARCHAR 20)`, `retry_count(SMALLINT)`, `error_message(TEXT)`,
  `created_at`, `updated_at`
- `qualitative_results`: `id(UUID PK)`, `job_id(FK → analysis_jobs)`, `ticker`,
  `fiscal_period`, `integrity_score(SMALLINT)`, `summary_ko(TEXT)`,
  `risk_factors(JSONB)`, `growth_drivers(JSONB)`, `noise_filter(JSONB)`, `created_at`

관련 AC: 없음 (인프라)

---

**Task 5-2: serverless.yml — SQS, S3, Step Functions IAM 추가**

`serverless.yml`에 다음 리소스를 추가합니다.

```yaml
# SQS
resources:
  Resources:
    RagJobsQueue:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: equisense-rag-jobs-${sls:stage}
        VisibilityTimeout: 900
        RedrivePolicy:
          deadLetterTargetArn: !GetAtt RagDLQ.Arn
          maxReceiveCount: 3
    RagDLQ:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: equisense-rag-dlq-${sls:stage}
    RagDocsBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: equisense-rag-docs-${sls:stage}
```

IAM에 SQS SendMessage, S3 GetObject/PutObject, Step Functions StartExecution 권한을 추가합니다.

관련 AC: 없음 (인프라)

---

**Task 5-3: AnalysisOrchestrator Lambda**

`POST /companies/{ticker}/qualitative` 엔드포인트를 구현합니다.

처리 흐름:
1. 입력 검증 (`TriggerQualitativeRequest` Pydantic 모델: ticker, market, fiscal_year, doc_type)
2. Neon DB `analysis_jobs` INSERT (`status=PENDING`)
3. SQS SendMessage (`{"job_id": "...", "ticker": "...", ...}`)
4. 202 + `{"job_id": "...", "status": "PENDING", "estimated_seconds": 120}` 반환

관련 AC: `AC-M3-001` (추후 작성)

---

**Task 5-4: GetJobStatus Lambda**

`GET /jobs/{job_id}` 엔드포인트를 구현합니다.

- `PENDING|PROCESSING`: `{"job_id": "...", "status": "...", "result": null}`
- `COMPLETED`: `{"job_id": "...", "status": "COMPLETED", "result": { qualitative_results 데이터 }}`
- `FAILED`: `{"job_id": "...", "status": "FAILED", "error": "..."}`
- `job_id` 없으면 404

관련 AC: `AC-M3-002` (추후 작성)

---

**Task 5-5: RAGTriggerLambda + FetchDocLambda (State 1)**

`RAGTriggerLambda`: SQS Event Source Mapping 트리거. `job_id`를 받아
Step Functions `StartExecution`을 호출합니다. `analysis_jobs` 상태를 `PROCESSING`으로 업데이트.

`FetchDocLambda` (Step Functions State 1):
- 입력: `{job_id, ticker, market, doc_type, fiscal_year}`
- KR: DART OpenAPI `get_document` → PDF URL 획득 → urllib 다운로드
- US: SEC EDGAR `submissions/{cik}.json` → 최신 10-K filing URL → 다운로드
- S3 PutObject: `raw/{job_id}/{ticker}_{fiscal_year}.pdf`
- 출력: `{...입력, s3_raw_key: "raw/..."}`

환경변수 추가: `DART_API_KEY`, `RAG_DOCS_BUCKET`, `STATE_MACHINE_ARN`

---

### Week 6: RAG 파이프라인 완성 + 프론트엔드

---

**Task 6-1: ChunkDocLambda (State 2)**

- 입력: `{s3_raw_key, ...}`
- S3 GetObject → `pypdf2` 또는 `pdfminer.six`로 텍스트 추출
- 512토큰 슬라이딩 윈도우(50토큰 오버랩) 청킹
  - 토큰 계산: `tiktoken` (cl100k_base)
- 청크 목록을 JSON으로 직렬화 → S3 PutObject: `chunks/{job_id}/chunks.json`
  - Step Functions 페이로드 256KB 제한 우회 목적
- 출력: `{...입력, s3_chunks_key: "chunks/..."}`

---

**Task 6-2: EmbedChunksLambda (State 3)**

- 입력: `{s3_chunks_key, ...}`
- S3 GetObject → 청크 목록 역직렬화
- OpenAI `text-embedding-3-small` (1,536차원)로 배치 임베딩 (100개/배치)
- Pinecone `upsert`: 메타데이터 `{ticker, doc_type, fiscal_year, chunk_index}`
- 출력: `{...입력, pinecone_namespace: "{ticker}_{fiscal_year}"}`

환경변수 추가: `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`

---

**Task 6-3: LLMAnalyzeLambda (State 4)**

- 입력: `{pinecone_namespace, ...}`
- 분석 쿼리 3개를 임베딩 → Pinecone 유사도 검색(top-10 청크/쿼리)
  1. "경영진이 이전 발표에서 한 약속을 지켰는가?"
  2. "가장 중요한 리스크 요인은 무엇인가?"
  3. "핵심 성장 동력은 무엇인가?"
- Claude `claude-sonnet-4-6` 호출 → 구조화된 JSON 응답
  ```json
  {
    "integrity_score": 75,
    "summary_ko": "...",
    "risk_factors": [...],
    "growth_drivers": [...],
    "noise_filter": [...]
  }
  ```
- Neon DB `qualitative_results` INSERT
- `analysis_jobs` UPDATE (`status=COMPLETED`)

환경변수 추가: `ANTHROPIC_API_KEY`

---

**Task 6-4: Step Functions State Machine 정의**

`serverless.yml`에 Express Workflow를 정의합니다 (최대 5분, 비용 효율적).

```yaml
stepFunctions:
  stateMachines:
    RagPipeline:
      name: equisense-rag-${sls:stage}
      type: EXPRESS
      definition:
        StartAt: FetchDoc
        States:
          FetchDoc:
            Type: Task
            Resource: !GetAtt FetchDocLambdaFunction.Arn
            Next: ChunkDoc
            Catch:
              - ErrorEquals: ["States.ALL"]
                Next: HandleFailure
          ChunkDoc:
            Type: Task
            Resource: !GetAtt ChunkDocLambdaFunction.Arn
            Next: EmbedChunks
            Catch: ...
          EmbedChunks:
            Type: Task
            Resource: !GetAtt EmbedChunksLambdaFunction.Arn
            Next: LLMAnalyze
            Catch: ...
          LLMAnalyze:
            Type: Task
            Resource: !GetAtt LLMAnalyzeLambdaFunction.Arn
            End: true
            Catch: ...
          HandleFailure:
            Type: Task
            Resource: !GetAtt HandleFailureLambdaFunction.Arn
            End: true
```

`HandleFailureLambda`: `analysis_jobs` `status=FAILED` 업데이트.

---

**Task 6-5: Module 3 프론트엔드 UI**

`/companies/{ticker}/qualitative` 페이지를 구현합니다.

컴포넌트:
- `QualitativeAnalysisView` (클라이언트 컴포넌트)
  - 분석 요청 버튼 (`POST /qualitative`)
  - 진행 상태 표시 (PENDING → PROCESSING → COMPLETED)
  - 폴링: 3초 간격으로 `GET /jobs/{job_id}` 호출, COMPLETED/FAILED에서 중단
  - 결과 카드:
    - 언행일치 점수 (0~100 게이지)
    - 한국어 요약
    - 리스크 요인 목록
    - 성장 동력 목록

`lib/api.ts`에 `triggerQualitativeAnalysis`, `getJobStatus` 추가.
`types/index.ts`에 `QualitativeResult`, `AnalysisJob` 타입 추가.

---

## 위험 요소 및 대응

| 위험 | 대응 |
|------|------|
| DART API 문서 URL 구조 변경 | mock 데이터로 대체 후 주석 처리 (`# TODO: real DART URL`) |
| SEC EDGAR rate limit (10 req/s) | 지수 백오프 + `time.sleep(0.1)` 사전 적용 |
| Pinecone 인덱스 미생성 | 환경변수 미설정 시 EmbedChunks mock 모드로 fallback |
| Step Functions 5분 제한 초과 | 대형 PDF(100페이지+)는 청킹 단계에서 최대 500청크로 제한 |
| Claude API 비용 | 사용자당 일일 5회 제한 (analysis_jobs COUNT 쿼리로 검증) |

---

## 환경변수 추가 목록 (SSM 등록 필요)

| 변수명 | 용도 |
|--------|------|
| `DART_API_KEY` | 한국 DART OpenAPI 인증 |
| `OPENAI_API_KEY` | 임베딩 모델 (text-embedding-3-small) |
| `PINECONE_API_KEY` | 벡터 DB 인증 |
| `PINECONE_INDEX_NAME` | Pinecone 인덱스명 (예: `equisense-rag`) |
| `ANTHROPIC_API_KEY` | Claude API 인증 |
| `RAG_DOCS_BUCKET` | S3 버킷명 |
| `STATE_MACHINE_ARN` | Step Functions ARN |

---

## Phase 4 이관 항목

- WebSocket 실시간 푸시 (WsConnect / WsDisconnect / WsNotify Lambda)
- Cognito 사용자 인증 연동 (API Gateway Authorizer)
- 실환경 배포 (AWS Lambda + Vercel)
- Module 4 PriceUpdateWorker EventBridge 스케줄러
- TechnicalScreener Lambda (저평가·과열 스크리닝)
