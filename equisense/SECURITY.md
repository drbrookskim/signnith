# SECURITY.md — EquiSense 보안 규칙

> 이 문서는 EquiSense 플랫폼의 모든 보안 요구사항과 가이드라인을 정의합니다.
> 보안 규칙은 기능 요구사항보다 높은 우선순위를 가집니다.
> 이 파일에 정의된 규칙은 어떠한 비즈니스 이유로도 예외 없이 준수해야 합니다.

---

## 1. 시크릿 및 자격증명 관리

### 원칙: 코드에 시크릿은 없다 (Zero Secrets in Code)

모든 API 키, DB 접속 정보, JWT 서명 키, OAuth 클라이언트 시크릿은 소스 코드와 완전히 분리되어야 합니다. 이 원칙의 위반은 QUALITY_SCORE.md에서 즉시 배포 블로킹 사유에 해당합니다.

**의무 사항:**

프로덕션 환경의 모든 시크릿은 **AWS Secrets Manager**에 저장하고, Lambda 실행 시 `boto3`를 통해 동적으로 조회합니다. 로컬 개발 환경에서는 `.env` 파일을 사용하되, 해당 파일은 반드시 `.gitignore`에 등록되어야 하며 Git 히스토리에 포함되어서는 안 됩니다.

**금지 사항:**

아래 패턴은 PR 리뷰 시 자동 스캔 도구(`truffleHog`, `git-secrets`)로 감지되며, 탐지 즉시 해당 PR은 머지가 차단됩니다.

- `API_KEY = "sk-..."` 형태의 하드코딩
- Base64로 인코딩된 자격증명을 코드에 포함
- 주석으로 처리된(`#`) 이전 API 키 잔존
- 테스트 코드에서 실제 키 사용(모킹으로 대체해야 함)

**키 로테이션 정책:**

모든 외부 API 키는 90일마다 로테이션합니다. 시크릿 만료일은 AWS Secrets Manager의 자동 로테이션 기능 또는 EventBridge 알람으로 추적합니다. 키가 노출되었다고 판단되면 24시간 이내에 즉시 로테이션하고 보안 인시던트 리포트를 작성합니다.

---

## 2. IAM 최소 권한 원칙 (Least Privilege)

### 기본 원칙: 기능에 필요한 최소한의 권한만 부여

Lambda 함수의 IAM 역할은 해당 함수가 실제로 수행하는 작업에 필요한 권한만 포함합니다. "나중을 위해 미리 넓게 준다"는 접근은 허용되지 않습니다.

**모듈별 IAM 권한 매트릭스:**

`GetFundamentals` Lambda는 Neon DB(Secrets Manager를 통해 접근)와 Upstash Redis(환경 변수)만 접근하므로, IAM에는 `secretsmanager:GetSecretValue` 권한만 필요합니다. S3, SQS 등에 대한 권한을 부여해서는 안 됩니다.

`RAGAnalysisWorker` Lambda는 SQS 큐 소비(`sqs:ReceiveMessage`, `sqs:DeleteMessage`), S3 문서 저장(`s3:PutObject`, `s3:GetObject`), Secrets Manager 조회가 필요합니다. 다른 SQS 큐에 대한 접근이나 S3 DeleteObject 권한은 부여하지 않습니다.

**IAM 역할 생성 체크리스트:**

새로운 Lambda 함수를 생성할 때마다 다음 질문에 답변하여 IAM 역할을 설계합니다. 해당 함수가 실제로 읽는 AWS 서비스는 무엇인가? 실제로 쓰는 서비스는? 필요한 리소스의 ARN을 구체적으로 명시할 수 있는가? `*` 와일드카드를 사용하지 않고 표현할 수 있는가?

---

## 3. 입력 검증 및 인젝션 방지

### 원칙: 모든 외부 입력은 신뢰하지 않는다 (Trust No Input)

사용자 입력, 쿼리 파라미터, HTTP 헤더, 외부 API 응답까지 모두 검증 대상입니다.

**종목 코드(Ticker) 검증:**

한국 주식 종목 코드는 6자리 숫자, 미국 주식은 1~5자리 알파벳입니다. 이 외의 형식은 정규식으로 400 에러를 반환합니다.

```python
# 올바른 예시
import re
KR_TICKER_PATTERN = re.compile(r'^\d{6}$')
US_TICKER_PATTERN = re.compile(r'^[A-Z]{1,5}$')

def validate_ticker(ticker: str, market: str) -> bool:
    if market == "KR":
        return bool(KR_TICKER_PATTERN.match(ticker))
    elif market == "US":
        return bool(US_TICKER_PATTERN.match(ticker.upper()))
    return False
```

**SQL 인젝션 방지:**

Neon PostgreSQL과의 모든 상호작용은 ORM(SQLAlchemy) 또는 파라미터화된 쿼리를 사용합니다. 문자열 포매팅(`f"SELECT * FROM {table_name}"`)으로 쿼리를 구성하는 것은 절대 금지입니다.

**프롬프트 인젝션 방지 (Module 3 AI 파이프라인):**

RAG 파이프라인에서 사용자 입력이 LLM 프롬프트에 포함될 때, 입력 길이를 제한(최대 2,000자)하고 시스템 프롬프트와 사용자 입력을 명확하게 구분하는 프롬프트 구조를 사용합니다. 사용자 입력이 시스템 지시를 덮어쓸 수 없도록 `Human:`/`Assistant:` 턴 구조를 엄격하게 유지합니다.

---

## 4. API 인증 및 인가

### 4-1. 인증(Authentication) 아키텍처

EquiSense의 모든 API 엔드포인트는 AWS API Gateway의 **Cognito Authorizer** 또는 **Lambda Authorizer**를 통해 보호됩니다. 인증 없이 접근 가능한 공개 엔드포인트는 별도로 명시된 경우(`GET /health`, `GET /public/market-status`)를 제외하고는 존재하지 않습니다.

JWT 토큰의 유효기간은 Access Token 1시간, Refresh Token 30일로 설정합니다. 토큰 갱신은 클라이언트 사이드에서 자동으로 처리하며, Refresh Token 만료 시 재로그인을 요구합니다.

### 4-2. 인가(Authorization) 규칙

분석 데이터는 해당 분석을 요청한 사용자(`user_id`)의 데이터만 조회할 수 있습니다. 다른 사용자의 `job_id`로 결과를 조회하는 것은 DB 쿼리 단계에서 차단합니다(`WHERE user_id = :current_user_id`). 이는 IDOR(Insecure Direct Object Reference) 취약점을 방지하는 핵심 메커니즘입니다.

관리자 전용 엔드포인트(`/admin/*`)는 별도의 IAM 기반 인증 레이어를 추가합니다.

---

## 5. 데이터 보호

### 5-1. 전송 중 데이터 암호화 (Encryption in Transit)

클라이언트-서버 간의 모든 통신은 TLS 1.2 이상을 사용합니다. HTTP로의 접근은 HTTPS로 자동 리디렉션됩니다. API Gateway의 최소 TLS 버전을 `TLS_1_2`로 설정합니다.

### 5-2. 저장 중 데이터 암호화 (Encryption at Rest)

Neon PostgreSQL은 AES-256 암호화를 기본 제공합니다. Pinecone Serverless도 저장 데이터 암호화를 기본 지원합니다. S3에 저장되는 문서(공시 파일, 실적 발표 스크립트)는 SSE-S3(Server-Side Encryption) 또는 SSE-KMS를 활성화합니다.

### 5-3. 개인정보 최소화

EquiSense는 투자 분석 서비스이므로, 사용자의 개인 금융 정보(계좌번호, 보유 주식 수량, 매수 단가)를 수집하거나 저장하지 않습니다. 수집하는 사용자 정보는 이메일(인증용), 분석 이력, 설정 값으로 제한합니다.

---

## 6. 네트워크 보안

### 6-1. CORS 설정

API Gateway의 CORS 설정은 허용 출처(Allow-Origin)를 `*`로 설정하지 않습니다. 허용 출처는 프로덕션 도메인(`https://equisense.app`)과 개발 도메인(`http://localhost:3000`)으로 명시적으로 제한합니다.

### 6-2. Rate Limiting

API Gateway의 사용 계획(Usage Plan)을 통해 IP 기반 및 API 키 기반 Rate Limiting을 적용합니다. 일반 사용자의 경우 분당 60 요청, 시간당 500 요청으로 제한합니다. RAG 분석 요청(계산 비용이 높음)은 사용자당 하루 10회로 추가 제한합니다.

Rate Limit 초과 시 `429 Too Many Requests`와 `Retry-After` 헤더를 반환합니다.

### 6-3. 의존성 취약점 관리

Python 의존성은 `pip-audit` 또는 `safety`를 사용하여 주간 단위로 CVE 스캔을 수행합니다. Node.js 의존성은 `npm audit`을 CI 파이프라인에 포함시켜 PR마다 검사합니다. Critical 또는 High 등급의 CVE가 발견되면 배포를 블로킹하고 48시간 이내에 패치합니다.

---

## 7. 서버리스 환경 특화 보안

### 7-1. Lambda 환경변수 암호화 (KMS)

Lambda 함수의 환경변수는 AWS가 기본 암호화를 제공하지만, 이는 AWS 관리형 키를 사용합니다. EquiSense는 **고객 관리형 KMS 키(CMK)**를 생성하고, Lambda 함수의 환경변수 암호화에 이 키를 지정합니다. 이를 통해 키 사용 이력이 CloudTrail에 기록되고, 필요 시 키 비활성화로 모든 Lambda 함수의 환경변수 접근을 즉시 차단할 수 있습니다. Secrets Manager에 저장한 시크릿도 동일한 CMK로 암호화하여 키 관리를 일원화합니다.

### 7-2. Lambda VPC 설정 및 Neon DB 접근 제어

Neon PostgreSQL은 IP 허용목록(allowlist) 기능을 제공합니다. 그러나 Lambda는 기본적으로 VPC 외부에서 실행되며 요청마다 출발지 IP가 달라지므로, IP 허용목록 방식으로는 Lambda의 Neon 접근을 제어할 수 없습니다. EquiSense는 다음 두 가지 중 하나를 선택합니다.

첫 번째 방법은 Neon 연결에 DB 자격증명(사용자명+비밀번호)만으로 인증하고 IP 허용목록을 사용하지 않는 것입니다. 이 경우 자격증명이 Secrets Manager에 안전하게 보관되고 정기적으로 로테이션되는 것이 보안의 핵심입니다.

두 번째 방법은 Neon DB에 접근하는 Lambda 함수를 **VPC에 배치**하고, VPC 내 NAT Gateway를 통해 고정 Elastic IP로 외부 인터넷에 접근하게 하는 것입니다. 이렇게 하면 Neon의 IP 허용목록에 NAT Gateway의 Elastic IP만 등록하여 네트워크 레벨 제어를 추가할 수 있습니다. 단, VPC 내 Lambda는 콜드 스타트가 더 길고 NAT Gateway 비용이 발생하는 트레이드오프가 있으므로, 초기에는 첫 번째 방법으로 시작하고 보안 요구사항이 높아질 때 두 번째로 전환합니다.

보안 취약점이나 인시던트가 발생했을 때 취해야 할 단계는 다음과 같습니다.

**1단계 — 즉시 격리:** 영향을 받는 Lambda 함수 또는 API 엔드포인트를 비활성화하거나, 해당 IAM 역할의 정책을 빈 정책으로 교체하여 접근을 차단합니다.

**2단계 — 영향 범위 파악:** CloudWatch Logs와 API Gateway 접근 로그를 분석하여 인시던트 발생 시간대, 영향받은 사용자 범위, 유출 가능성이 있는 데이터를 파악합니다.

**3단계 — 자격증명 로테이션:** 노출된 것으로 의심되는 모든 API 키와 DB 비밀번호를 즉시 로테이션합니다. AWS Secrets Manager의 즉시 로테이션(Immediate Rotation) 기능을 활용합니다.

**4단계 — 패치 및 복구:** 취약점 원인을 수정한 코드를 작성하고, QUALITY_SCORE.md의 보안 영역 기준을 통과한 후 재배포합니다.

**5단계 — 사후 분석(Post-mortem):** 인시던트 종료 후 72시간 이내에 타임라인, 근본 원인, 재발 방지 대책을 포함한 보안 인시던트 리포트를 `docs/incident-reports/` 디렉토리에 작성합니다.

---

_Last updated: 2026-05-17 | Version: 1.0.0 | 보안 담당: EquiSense Security Team_
