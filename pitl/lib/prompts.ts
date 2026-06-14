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
