# design-docs/module3-qualitative.md — AI 기반 정성적 분석기

> 이 문서는 Module 3의 RAG 파이프라인 상세 설계를 정의합니다.
> 4개 모듈 중 가장 복잡한 비동기 아키텍처를 가지므로 구현 전 반드시 숙지하십시오.

---

## 1. 모듈 목적

경영진의 실적 발표 콘퍼런스 콜 스크립트와 공식 사업보고서를 AI로 분석하여 세 가지 질문에 답합니다. 첫째, 경영진은 이전 발표에서 한 약속을 지켰는가? (언행일치 점수) 둘째, 이 기업에 대한 시장의 루머와 소음 중 근거 있는 것은 무엇인가? (노이즈 필터링) 셋째, 사업보고서에서 가장 중요한 리스크 요인과 성장 동력은 무엇인가? (AI 요약)

---

## 2. 시스템 플로우 다이어그램

> **핵심 수정 사항:** Lambda는 SQS를 "Poll(폴링)"하지 않습니다. AWS 런타임이 SQS Event Source Mapping을 통해 Lambda를 직접 트리거하는 Push 모델입니다. 또한 문서 수집→청킹→임베딩→LLM 호출의 4단계는 단일 Lambda가 아닌 **AWS Step Functions**로 분리합니다. 이는 각 단계의 실행 시간이 불확실하고, 단계별 실패 후 해당 단계부터 재시도해야 하기 때문입니다.

```
User           API Gateway      Orchestrator Lambda    SQS Queue
 │                  │                  │                   │
 │ POST /qualitative │                  │                   │
 │──────────────────▶│                  │                   │
 │                   │─────────────────▶│                   │
 │                   │                  │ SendMessage        │
 │                   │                  │───────────────────▶│
 │◀──────────────────│◀─────────────────│                   │
 │  202 + {job_id}   │                  │                   │
 │                   │                  │                   │
 │                   │                  │    ← Event Source Mapping (Push) ─┐
 │                   │                  │                   │               │
 │                   │        Step Functions State Machine  │               │
 │                   │         ┌────────────────────────┐   │               │
 │                   │         │ State 1: FetchDoc       │◀──┘               │
 │                   │         │  DART/SEC 문서 다운로드  │                   │
 │                   │         │  → S3 저장 (/tmp 불사용)│                   │
 │                   │         ├────────────────────────┤                   │
 │                   │         │ State 2: ChunkDoc       │                   │
 │                   │         │  S3에서 읽어 청킹        │                   │
 │                   │         │  → S3에 청크 저장        │                   │
 │                   │         ├────────────────────────┤                   │
 │                   │         │ State 3: EmbedChunks    │                   │
 │                   │         │  청크 임베딩 생성        │                   │
 │                   │         │  → Pinecone 저장         │                   │
 │                   │         ├────────────────────────┤                   │
 │                   │         │ State 4: LLMAnalyze     │                   │
 │                   │         │  Claude API 호출         │                   │
 │                   │         │  → Neon DB 결과 저장     │                   │
 │                   │         │  → WsNotify Lambda 호출  │                   │
 │                   │         └────────────────────────┘                   │
 │  WebSocket 결과 푸시 또는 GET /jobs/{id} 폴링                             │
 │◀─────────────────────────────────────────────────────────────────────────│
```

---

## 3. RAG 파이프라인 단계별 상세 설계 (Step Functions 기반)

### 왜 Step Functions인가?

단일 Lambda에서 문서 수집→청킹→임베딩→LLM 호출을 순차 처리하면 세 가지 위험이 동시에 발생합니다. 첫째, 각 단계의 소요 시간 합계가 Lambda 최대 타임아웃(15분)을 초과할 수 있습니다(대형 사업보고서 PDF의 경우 임베딩 단계만 수 분 소요). 둘째, 3번 단계(임베딩)에서 실패하면 1~2번 단계 작업을 전부 재처리해야 합니다. 셋째, 어느 단계에서 실패했는지 파악하기 어렵습니다. Step Functions는 각 단계를 독립 Lambda로 분리하고, 각 Lambda의 성공/실패를 상태 머신이 추적하므로 이 세 문제를 모두 해결합니다.

### State 1: FetchDocLambda — 문서 수집

SQS Event Source Mapping으로 트리거된 첫 번째 Lambda입니다. DART API 또는 SEC EDGAR에서 PDF를 다운로드하여 **Lambda /tmp가 아닌 S3에 저장**합니다. Lambda의 /tmp는 기본 512MB이며, 개별 사업보고서 PDF가 수십 MB에 달할 수 있고, 동시 실행 인스턴스가 각자 /tmp를 사용하므로 대용량 파일 처리에는 S3를 중간 저장소로 사용하는 것이 필수입니다. 저장 후 S3 키(경로)를 State Machine의 다음 단계 입력으로 전달합니다.

### State 2: ChunkDocLambda — 문서 청킹

S3에서 원본 문서를 읽어 의미 단위(문단 기반) 청킹을 수행합니다. 청킹 크기는 최대 512토큰, 인접 청크 간 50토큰 오버랩입니다. 청크 목록을 JSON으로 직렬화하여 다시 S3에 저장하고, 청크 S3 키를 다음 단계로 전달합니다. S3 중간 저장 패턴은 Step Functions의 입력/출력 페이로드 크기 제한(256KB)을 우회하는 표준 방법이기도 합니다.

### State 3: EmbedChunksLambda — 임베딩 생성 및 벡터 저장

S3에서 청크를 읽어 `text-embedding-3-small` (OpenAI, 차원 1,536) 또는 동급 모델로 임베딩 벡터를 생성합니다. 생성된 벡터는 Pinecone Serverless 인덱스에 저장하며, 메타데이터로 `ticker`, `doc_type`, `fiscal_year`, `chunk_index`를 포함합니다. 청크 수가 많은 경우 배치(batch) 처리로 Pinecone API 호출 횟수를 줄입니다(최대 100개 벡터/배치).

### State 4: LLMAnalyzeLambda — LLM 분석 및 결과 저장

분석 쿼리를 임베딩하여 Pinecone에서 유사도 상위 10개 청크를 검색합니다. 청크를 컨텍스트로 Claude Sonnet에 전달하여 언행일치 점수, 리스크 요인, 성장 동력, 노이즈 필터링 결과를 구조화된 JSON으로 생성합니다. 결과를 Neon DB의 `qualitative_results` 테이블에 저장하고, `analysis_jobs` 상태를 `COMPLETED`로 업데이트한 뒤 WebSocket 클라이언트에 알림을 푸시합니다.

---

## 4. 데이터베이스 스키마 (Module 3 관련)

```sql
-- 분석 작업 상태 추적
CREATE TABLE analysis_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL,
    ticker        VARCHAR(10) NOT NULL,
    market        VARCHAR(5) NOT NULL,  -- 'KR' | 'US'
    status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
    retry_count   SMALLINT DEFAULT 0,
    error_message TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 분석 결과 저장
CREATE TABLE qualitative_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES analysis_jobs(id),
    ticker          VARCHAR(10) NOT NULL,
    fiscal_period   VARCHAR(10) NOT NULL,  -- '2024Q4', '2024A'
    integrity_score SMALLINT,              -- 0~100 언행일치 점수
    summary_ko      TEXT,                  -- 한국어 요약
    risk_factors    JSONB,                 -- 리스크 요인 배열
    growth_drivers  JSONB,                 -- 성장 동력 배열
    noise_filter    JSONB,                 -- 루머별 근거 유무
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. 구현 시 주의사항

**토큰 비용 관리:** RAG 파이프라인은 LLM API 비용이 발생하는 유일한 모듈입니다. 사용자당 일일 분석 횟수를 10회로 제한하는 Rate Limiting을 적용합니다(SECURITY.md 6-2 참조). 캐싱된 결과를 우선 반환하여 동일 종목·동일 분기에 대한 중복 LLM 호출을 방지합니다.

**프롬프트 인젝션 방어:** 사용자 입력이 LLM 프롬프트에 포함되는 경우, 시스템 프롬프트와 사용자 인풋을 XML 태그로 명확하게 구분합니다. SECURITY.md 3절의 프롬프트 인젝션 방지 가이드라인을 준수합니다.
