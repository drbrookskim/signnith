# PHASE 1 — 서버리스 환경 설정 및 API 연동 (Week 1~2)

> 이 단계의 목표는 "아무것도 없는 상태에서 Hello World API가 AWS Lambda에서 실행되고,
> Neon DB와 Pinecone에 연결되는 것"을 확인하는 것입니다.
> 화려한 기능보다 올바른 뼈대 구축이 최우선입니다.

---

## 목표 (Definition of Done for Phase 1)

이 단계가 완료되었다고 볼 수 있는 조건은 다음과 같습니다. Serverless Framework로 정의된 Lambda 함수가 AWS에 배포되고 API Gateway를 통해 호출 가능해야 합니다. Neon(PostgreSQL) 연결이 Lambda 내에서 정상 작동하고, Pinecone 인덱스가 생성되어 테스트 임베딩의 삽입과 조회가 가능해야 합니다. 또한 GitHub Actions의 기본 CI 파이프라인(린트 + 단위 테스트)이 PR마다 실행되어야 합니다.

---

## 태스크 분해

### Week 1: 인프라 프로비저닝

**Task 1-1: AWS 계정 및 IAM 설정**
Serverless Framework가 사용할 배포 전용 IAM 사용자를 생성합니다. 이 사용자에게는 Lambda, API Gateway, CloudFormation, S3(배포 아티팩트용), SQS, EventBridge에 대한 권한만 부여합니다. `AdministratorAccess`를 부여하는 빠른 방법을 선택하지 않습니다. SECURITY.md의 IAM 최소 권한 원칙이 배포 계정부터 적용됩니다.

관련 AC: `AC-INFRA-001`

**Task 1-2: Serverless Framework 프로젝트 초기화**
`serverless.yml` 기반의 프로젝트 구조를 생성합니다. 서비스명, 프로바이더(aws), 런타임(python3.11), 리전(ap-northeast-2, 서울)을 정의합니다. `serverless-python-requirements` 플러그인을 추가하여 Python 의존성을 Lambda Layer로 자동 패키징되도록 설정합니다.

**Task 1-3: Neon PostgreSQL 프로비저닝**

Neon 콘솔에서 프로젝트를 생성하고, `equisense-prod`와 `equisense-dev` 두 개의 브랜치(DB)를 만듭니다. 연결 문자열은 AWS Secrets Manager에 저장합니다.

**Python Lambda의 DB 드라이버 선택:** `@neondatabase/serverless`는 Node.js 및 Vercel Edge Function 전용 드라이버이므로 Python Lambda에서는 사용할 수 없습니다. Python Lambda에서는 `psycopg2` 또는 `asyncpg`를 사용합니다.

**서버리스 환경의 DB 연결 풀 고갈 문제:** Lambda는 요청마다 새로운 실행 컨텍스트(인스턴스)를 생성할 수 있으며, 동시 호출이 많을 경우 각 인스턴스가 독립적인 DB 연결을 맺어 PostgreSQL의 `max_connections` 한도를 초과할 수 있습니다. 이를 방지하기 위해 Neon의 내장 연결 풀러(**PgBouncer** 모드, 포트 6432)를 활성화하여 사용합니다. 연결 문자열을 직접 포트 5432로 연결하지 않고, Neon 대시보드에서 제공하는 풀링 연결 문자열을 사용합니다. 또한 Lambda 핸들러 함수 외부(모듈 레벨)에서 연결 객체를 초기화하면, 동일 인스턴스의 재사용 시 연결을 재활용할 수 있습니다.

**Task 1-4: Pinecone 인덱스 생성**
Pinecone 콘솔에서 서버리스 인덱스를 생성합니다. 차원(dimension)은 사용할 임베딩 모델의 벡터 크기와 일치해야 합니다(`text-embedding-3-small`의 경우 1,536). 메트릭은 코사인 유사도(cosine)로 설정합니다.

### Week 2: 기본 연결 검증 및 CI 설정

**Task 2-1: Health Check Lambda 작성 및 배포**
`GET /health` 엔드포인트를 반환하는 Lambda 함수를 작성하고 배포합니다. 이 함수는 Neon DB 연결 가능 여부와 Pinecone 인덱스 상태를 확인하고 결과를 JSON으로 반환합니다. 이것이 프로젝트의 첫 번째 프로덕션 배포입니다.

**Task 2-2: GitHub Actions CI 파이프라인 구성**
`.github/workflows/ci.yml` 파일을 작성합니다. PR이 열릴 때마다 Python 코드에 대한 `ruff` 린트, `black` 포매팅 검사, `pytest` 단위 테스트가 실행되도록 합니다. 이 단계에서는 CD(실제 배포) 파이프라인은 포함하지 않습니다.

**Task 2-3: 기본 DB 스키마 마이그레이션**
`alembic`을 사용하여 초기 마이그레이션 스크립트를 작성합니다. `users`, `companies`, `analysis_jobs`, `qualitative_results` 테이블의 초기 스키마를 `design-docs/db-schema.md`를 참고하여 작성합니다.

---

## 위험 요소 및 대응 방안

**위험 1: Lambda 콜드 스타트와 Neon 연결 지연**

Neon의 서버리스 특성상 비활성 상태에서 첫 연결 시 수백 밀리초의 웨이크업 시간이 발생할 수 있습니다. 이를 완화하기 위해 Lambda의 Provisioned Concurrency를 최소 1 인스턴스로 설정하거나, Neon의 연결 풀러(PgBouncer)를 활성화하는 방안을 검토합니다. Phase 1에서 실측 후 Phase 2에서 대응합니다.

**위험 2: 외부 API 키 발급 지연**

FMP, Alpha Vantage, DART API 키 신청이 지연될 경우 Phase 2 개발에 영향을 미칩니다. Week 1 시작과 동시에 모든 외부 API 키 신청을 병행합니다. 대기 기간에는 모킹 데이터로 개발을 진행합니다.
