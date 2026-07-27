# idea-position-lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 생성형 AI 없이 재사용 가능한 규칙기반 상품기획 위치진단 도구(`idea-position-lab` 스킬)를 만든다. 13개 마케팅 프레임워크를 분석군/전략군으로 나눠 자기완결형 HTML 아티팩트로 제공한다.

**Architecture:** 판정 로직은 순수 JS 함수(`engine.js`, DOM 의존 없음, Node로 유닛테스트)로 분리한다. `template.html`은 이 엔진을 인라인으로 품고 폼 입력→계산→결과 표시를 담당하는 자기완결형 UI다. `SKILL.md`는 두 파일을 읽어 하나의 HTML로 합친 뒤 Artifact로 발행하는 절차를 정의한다. `methodology.md`는 모든 판정규칙과 문구의 SSOT 문서다.

**Tech Stack:** 순수 JS(ES6, 프레임워크 없음), Node.js `node:assert` (테스트), HTML/CSS(인라인, 외부 리소스 없음)

## Global Constraints

- 런타임에 API/서버 호출 없음 — `template.html`은 브라우저에서 완전히 독립 동작해야 한다.
- 외부 라이브러리/CDN 금지 — 순수 JS/CSS만 사용한다.
- `engine.js`는 DOM을 참조하지 않는다 (Node에서 그대로 `require` 가능해야 함).
- 기존 PITL 하네스(3c-analysis, 4p-strategy, idea-to-strategy)와 파일/네이밍 독립 — 수정하지 않는다.
- 스펙 문서: `docs/superpowers/specs/2026-07-27-idea-position-lab-design.md`

---

### Task 1: 규칙 문서 (`methodology.md`)

**Files:**
- Create: `.claude/skills/idea-position-lab/references/methodology.md`

**Interfaces:**
- Consumes: 없음 (문서 작성)
- Produces: Task 2(`engine.js`)가 이 문서의 규칙/문구를 그대로 코드화한다. 이후 규칙 변경 시 이 문서를 1차로 수정한다.

- [ ] **Step 1: 문서 작성**

```markdown
# idea-position-lab 규칙북 (SSOT)

## 공통 입력 (1회만)
- 아이디어 한줄설명 (텍스트)
- 타겟고객 한줄 (텍스트)
- 주요경쟁사 한줄 (텍스트)
- 시장성장세 (체크: 성장/정체/축소)

## 분석군

### 3C — 자사 강점 점수
입력: 강점 다중선택(브랜드력/원가우위/기술력/유통망/자본력)
로직: 선택 개수 0~1=약함, 2~3=보통, 4~5=강함
문구:
- 약함: "자사 강점이 뚜렷하지 않다. 파트너십으로 부족한 역량을 메운다."
- 보통: "자사 강점이 일부 있다. 그 강점에 자원을 집중한다."
- 강함: "자사 강점이 다수다. 다수 강점을 조합한 차별화 포지셔닝이 가능하다."

### SWOT — 사분면 판정
입력: S/W/O/T 각 체크박스(자유 항목, 개수만 사용) + 한줄씩
로직: S개수>=W개수 & O개수>=T개수 → SO, S>=W & O<T → ST, S<W & O>=T → WO, 그외 → WT
문구:
- SO: "강점이 우세하고 기회도 많다. 공격적으로 시장을 선점하는 확장 전략을 우선한다."
- ST: "강점은 있으나 위협이 크다. 강점으로 위협을 방어하며 다각화를 검토한다."
- WO: "약점이 크지만 기회가 있다. 약점을 보완해 기회를 잡는 제휴·개선 전략을 우선한다."
- WT: "약점도 크고 위협도 크다. 방어적으로 축소하거나 철수를 검토한다."

### STP
입력: 세그먼트 크기(large/medium/small), 타겟팅(undifferentiated/differentiated/concentrated)
로직: 타겟팅별 기본문구 + 세그먼트크기별 부가문구를 이어붙임
문구(타겟팅):
- concentrated: "세그먼트 하나에 집중해 니치 시장 지배력을 확보하는 전략이다."
- differentiated: "세그먼트별 맞춤 포지셔닝으로 각 시장에서 차별화를 노리는 전략이다."
- undifferentiated: "전체 시장을 하나로 보고 규모의 경제로 접근하는 전략이다."
문구(세그먼트크기, 뒤에 붙임):
- large: " 세그먼트 규모가 커서 자원 분산 위험에 유의한다."
- medium: " 세그먼트 규모가 적정해 자원 배분이 비교적 용이하다."
- small: " 세그먼트 규모가 작아 초기 자원 집중이 유리하다."

### Five Forces
입력: 5요인(신규진입/공급자교섭력/구매자교섭력/대체재/경쟁강도) 각 낮음/중간/높음
로직: low=1,mid=2,high=3 평균. <=1.5 낮음, <=2.5 중간, 그외 높음
문구:
- 낮음: "산업 경쟁강도가 낮아 시장 매력도가 높다. 신규 진입에 유리한 시점이다."
- 중간: "산업 경쟁강도가 중간이다. 차별화 포인트 없이는 평균 수익성에 그칠 수 있다."
- 높음: "산업 경쟁강도가 높아 매력도가 낮다. 명확한 차별화나 틈새 없이는 진입 리스크가 크다."

### VRIO
입력: 가치/희소성/모방불가/조직화 각 예·아니오
로직(순서대로 판정): !가치 → 경쟁열위 / !희소성 → 경쟁등위 / !모방불가 → 일시적 경쟁우위 / !조직화 → 미활용 경쟁우위 / 모두 예 → 지속가능한 경쟁우위
문구:
- 경쟁열위: "가치가 없다. 이 자원/역량으로는 경쟁 자체가 어렵다."
- 경쟁등위: "가치는 있으나 흔하다. 남들과 비슷한 수준일 뿐이다."
- 일시적 경쟁우위: "가치있고 희소하지만 모방 가능하다. 우위가 오래가지 않는다."
- 미활용 경쟁우위: "가치·희소성·모방불가는 갖췄지만 조직이 이를 활용 못하고 있다. 조직 체계부터 정비한다."
- 지속가능한 경쟁우위: "네 조건을 모두 갖췄다. 이 역량을 핵심 전략 자산으로 밀어붙인다."

### Kano
입력: 기능 후보(고정 5개 행) 각 이름(텍스트) + 카테고리(attractive/must-be/performance/indifferent)
로직: 우선순위 must-be > performance > attractive > indifferent 순 정렬
라벨:
- must-be: "필수 기능(없으면 불만, 있어도 당연)"
- performance: "성과 기능(있을수록 만족 비례)"
- attractive: "매력적 기능(없어도 불만 없지만 있으면 감동)"
- indifferent: "무관심 기능(있으나 없으나 영향 없음, 우선순위 낮음)"

### 포지셔닝맵
입력: 자사 x/y(0~100 슬라이더), 경쟁사(고정 3행) 각 이름+x+y
로직: quadrant(x,y) = x>=50&y>=50 Q1(우상) / x<50&y>=50 Q2(좌상) / x<50&y<50 Q3(좌하) / 그외 Q4(우하). 경쟁사들이 점유한 사분면 집합을 구해 빈 사분면을 찾는다.
문구:
- 자사가 빈 사분면일 때: "자사가 위치한 {사분면}엔 경쟁자가 없다. 이 포지션을 명확히 하는 메시징에 집중한다."
- 자사 사분면에 경쟁자 있고 다른 빈 사분면 있을 때: "{자사사분면}엔 경쟁자가 몰려있다. 빈 사분면({목록})으로 재포지셔닝을 검토한다."
- 빈 사분면 없을 때: "네 사분면 모두 경쟁자가 있다. 포지셔닝만으로는 차별화가 어려워 다른 축을 고려해야 한다."

## 전략군

### 4P — SWOT 사분면 기반 자동 도출
입력 없음 (SWOT 결과 재사용)
문구(사분면별 product/price/place/promotion):
- SO: 신제품 확장 / 프리미엄 가격 / 신규 채널 확대 / 공격적 인지도 캠페인
- ST: 핵심 제품 방어+파생 라인 / 기존 가격 유지+원가효율 / 기존 채널 강화 / 기존 고객 락인
- WO: 최소기능 우선 개발 / 도입가·체험가 / 제휴로 채널 보완 / 저비용 마케팅
- WT: 핵심기능만 슬림화 / 저가·원가방어 / 채널 축소 / 최소예산 유지 마케팅
(정확한 전체 문구는 Task 2 `engine.js`의 `FOURP_BY_SWOT` 참고)

### Ansoff
입력: 시장(existing/new), 제품(existing/new)
문구:
- existing+existing: "시장침투: 기존 시장에서 기존 제품 점유율을 높이는 전략. 마케팅 강도와 재구매를 높이는 데 집중한다."
- existing+new: "제품개발: 기존 고객에게 새 제품/기능을 제공한다. 기존 고객 데이터를 활용한 확장이 유리하다."
- new+existing: "시장개발: 기존 제품을 새 시장(지역/세그먼트)으로 넓힌다. 신규 시장 진입장벽부터 점검한다."
- new+new: "다각화: 새 시장에 새 제품이다. 리스크가 가장 크므로 소규모 파일럿부터 검증한다."

### 블루오션 전략캔버스
입력: 고정 5요인(가격/품질/서비스범위/브랜드이미지/유통채널) 각 제거/감소/증가/창조
로직: create개수>=1 & (eliminate+reduce)>=2 → 블루오션형 / create>=1 → 차별화중심 / (eliminate+reduce)>=2 → 저비용중심 / 그외 → 기존업계와 유사

### 린 캔버스 / BMC
입력: 9블록 각 한줄 텍스트. 판정 로직 없음 — 입력값을 카드로 정리해 보여주기만 한다.

### AARRR
입력: 약점 단계 하나 선택(acquisition/activation/retention/referral/revenue)
문구:
- acquisition: "획득 단계가 약점이다. 채널별 유입 실험(SEO/광고/제휴)을 먼저 늘린다."
- activation: "활성화 단계가 약점이다. 첫 사용 경험(온보딩)을 단순화해 핵심 가치를 느끼는 시간을 줄인다."
- retention: "유지 단계가 약점이다. 재방문을 유도하는 알림/루틴 설계가 우선이다."
- referral: "추천 단계가 약점이다. 공유·초대에 대한 유인(리워드 등)을 설계한다."
- revenue: "수익화 단계가 약점이다. 가격정책/결제 전환 지점의 마찰을 점검한다."

## 범위 밖
- Kano/포지셔닝맵 행 개수는 고정(각 5행/3행)이며 동적 추가 UI는 만들지 않는다.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/idea-position-lab/references/methodology.md
git commit -m "docs: idea-position-lab 규칙북 추가"
```

---

### Task 2: 순수 판정 엔진 (`engine.js` + 테스트)

**Files:**
- Create: `.claude/skills/idea-position-lab/assets/engine.js`
- Create: `.claude/skills/idea-position-lab/assets/engine.test.js`

**Interfaces:**
- Consumes: Task 1의 `methodology.md` 규칙/문구
- Produces: `Engine` 객체 (브라우저에선 `window.Engine`, Node에선 `module.exports`), 함수 목록: `scoreThreeC(strengths: string[])`, `judgeSWOT(s,w,o,t: string[])`, `judgeSTP(segmentSize, targeting)`, `scoreFiveForces(forces: {[key]: 'low'|'mid'|'high'})`, `scoreVRIO({value,rarity,imitability,organization}: boolean 필드)`, `classifyKano(features: {name,category}[])`, `quadrantOf(x,y)`, `analyzePositioningMap(self:{x,y}, competitors:{name,x,y}[])`, `deriveFourP(swotQuadrant: 'SO'|'ST'|'WO'|'WT')`, `judgeAnsoff(market,product)`, `judgeBlueOcean(factors:{name,action}[])`, `summarizeAARRR(weakStage)`. Task 3(`template.html`)이 이 모든 함수를 그대로 호출한다.

- [ ] **Step 1: 테스트 먼저 작성**

```javascript
// .claude/skills/idea-position-lab/assets/engine.test.js
const assert = require('node:assert');
const E = require('./engine.js');

assert.strictEqual(E.scoreThreeC(['brand']).band, '약함');
assert.strictEqual(E.scoreThreeC(['brand', 'cost', 'tech']).band, '보통');
assert.strictEqual(E.scoreThreeC(['brand', 'cost', 'tech', 'channel', 'capital']).band, '강함');

assert.strictEqual(E.judgeSWOT(['a', 'b'], ['c'], ['d', 'e'], ['f']).quadrant, 'SO');
assert.strictEqual(E.judgeSWOT(['a'], ['c', 'd'], ['e'], ['f', 'g']).quadrant, 'WT');

assert.ok(E.judgeSTP('large', 'concentrated').text.includes('니치'));

assert.strictEqual(E.scoreFiveForces({ a: 'low', b: 'low', c: 'low', d: 'low', e: 'low' }).band, '낮음');
assert.strictEqual(E.scoreFiveForces({ a: 'high', b: 'high', c: 'high', d: 'high', e: 'high' }).band, '높음');

assert.strictEqual(E.scoreVRIO({ value: false, rarity: false, imitability: false, organization: false }).level, '경쟁열위');
assert.strictEqual(E.scoreVRIO({ value: true, rarity: true, imitability: true, organization: true }).level, '지속가능한 경쟁우위');
assert.strictEqual(E.scoreVRIO({ value: true, rarity: true, imitability: false, organization: true }).level, '일시적 경쟁우위');

const kano = E.classifyKano([{ name: 'x', category: 'indifferent' }, { name: 'y', category: 'must-be' }]);
assert.strictEqual(kano[0].category, 'must-be');

assert.strictEqual(E.quadrantOf(80, 80), 'Q1(우상)');
const posMap = E.analyzePositioningMap({ x: 80, y: 80 }, [{ name: 'c1', x: 20, y: 20 }]);
assert.ok(posMap.empty.includes('Q1(우상)'));

assert.strictEqual(E.deriveFourP('SO').price, '가치기반 프리미엄 가격 가능');

assert.ok(E.judgeAnsoff('existing', 'existing').text.startsWith('시장침투'));

assert.strictEqual(
  E.judgeBlueOcean([
    { name: '가격', action: 'reduce' },
    { name: '품질', action: 'eliminate' },
    { name: '서비스범위', action: 'create' },
  ]).profile,
  '블루오션형(차별화+저비용 동시 추구)'
);

assert.ok(E.summarizeAARRR('retention').text.includes('재방문'));

console.log('all engine tests passed');
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node .claude/skills/idea-position-lab/assets/engine.test.js`
Expected: FAIL — `Cannot find module './engine.js'`

- [ ] **Step 3: 엔진 구현**

```javascript
// .claude/skills/idea-position-lab/assets/engine.js
// 순수 함수만 포함 — DOM 참조 없음. Node와 브라우저 양쪽에서 동작.

function scoreThreeC(strengths) {
  const n = strengths.length;
  if (n <= 1) return { band: '약함', text: '자사 강점이 뚜렷하지 않다. 파트너십으로 부족한 역량을 메운다.' };
  if (n <= 3) return { band: '보통', text: '자사 강점이 일부 있다. 그 강점에 자원을 집중한다.' };
  return { band: '강함', text: '자사 강점이 다수다. 다수 강점을 조합한 차별화 포지셔닝이 가능하다.' };
}

function judgeSWOT(s, w, o, t) {
  const sHi = s.length >= w.length;
  const oHi = o.length >= t.length;
  if (sHi && oHi) return { quadrant: 'SO', text: '강점이 우세하고 기회도 많다. 공격적으로 시장을 선점하는 확장 전략을 우선한다.' };
  if (sHi && !oHi) return { quadrant: 'ST', text: '강점은 있으나 위협이 크다. 강점으로 위협을 방어하며 다각화를 검토한다.' };
  if (!sHi && oHi) return { quadrant: 'WO', text: '약점이 크지만 기회가 있다. 약점을 보완해 기회를 잡는 제휴·개선 전략을 우선한다.' };
  return { quadrant: 'WT', text: '약점도 크고 위협도 크다. 방어적으로 축소하거나 철수를 검토한다.' };
}

function judgeSTP(segmentSize, targeting) {
  const base = {
    concentrated: '세그먼트 하나에 집중해 니치 시장 지배력을 확보하는 전략이다.',
    differentiated: '세그먼트별 맞춤 포지셔닝으로 각 시장에서 차별화를 노리는 전략이다.',
    undifferentiated: '전체 시장을 하나로 보고 규모의 경제로 접근하는 전략이다.',
  }[targeting];
  const note = {
    large: ' 세그먼트 규모가 커서 자원 분산 위험에 유의한다.',
    medium: ' 세그먼트 규모가 적정해 자원 배분이 비교적 용이하다.',
    small: ' 세그먼트 규모가 작아 초기 자원 집중이 유리하다.',
  }[segmentSize];
  return { text: base + note };
}

const FORCE_LEVEL = { low: 1, mid: 2, high: 3 };
function scoreFiveForces(forces) {
  const vals = Object.values(forces).map((v) => FORCE_LEVEL[v]);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg <= 1.5) return { band: '낮음', avg, text: '산업 경쟁강도가 낮아 시장 매력도가 높다. 신규 진입에 유리한 시점이다.' };
  if (avg <= 2.5) return { band: '중간', avg, text: '산업 경쟁강도가 중간이다. 차별화 포인트 없이는 평균 수익성에 그칠 수 있다.' };
  return { band: '높음', avg, text: '산업 경쟁강도가 높아 매력도가 낮다. 명확한 차별화나 틈새 없이는 진입 리스크가 크다.' };
}

function scoreVRIO({ value, rarity, imitability, organization }) {
  if (!value) return { level: '경쟁열위', text: '가치가 없다. 이 자원/역량으로는 경쟁 자체가 어렵다.' };
  if (!rarity) return { level: '경쟁등위', text: '가치는 있으나 흔하다. 남들과 비슷한 수준일 뿐이다.' };
  if (!imitability) return { level: '일시적 경쟁우위', text: '가치있고 희소하지만 모방 가능하다. 우위가 오래가지 않는다.' };
  if (!organization) return { level: '미활용 경쟁우위', text: '가치·희소성·모방불가는 갖췄지만 조직이 이를 활용 못하고 있다. 조직 체계부터 정비한다.' };
  return { level: '지속가능한 경쟁우위', text: '네 조건을 모두 갖췄다. 이 역량을 핵심 전략 자산으로 밀어붙인다.' };
}

const KANO_LABEL = {
  'must-be': '필수 기능(없으면 불만, 있어도 당연)',
  performance: '성과 기능(있을수록 만족 비례)',
  attractive: '매력적 기능(없어도 불만 없지만 있으면 감동)',
  indifferent: '무관심 기능(있으나 없으나 영향 없음, 우선순위 낮음)',
};
const KANO_PRIORITY = ['must-be', 'performance', 'attractive', 'indifferent'];
function classifyKano(features) {
  return [...features]
    .sort((a, b) => KANO_PRIORITY.indexOf(a.category) - KANO_PRIORITY.indexOf(b.category))
    .map((f) => ({ ...f, label: KANO_LABEL[f.category] }));
}

function quadrantOf(x, y) {
  if (x >= 50 && y >= 50) return 'Q1(우상)';
  if (x < 50 && y >= 50) return 'Q2(좌상)';
  if (x < 50 && y < 50) return 'Q3(좌하)';
  return 'Q4(우하)';
}
function analyzePositioningMap(self, competitors) {
  const selfQ = quadrantOf(self.x, self.y);
  const occupied = new Set(competitors.map((c) => quadrantOf(c.x, c.y)));
  const all = ['Q1(우상)', 'Q2(좌상)', 'Q3(좌하)', 'Q4(우하)'];
  const empty = all.filter((q) => !occupied.has(q));
  if (empty.includes(selfQ)) {
    return { selfQuadrant: selfQ, empty, text: `자사가 위치한 ${selfQ}엔 경쟁자가 없다. 이 포지션을 명확히 하는 메시징에 집중한다.` };
  }
  if (empty.length > 0) {
    return { selfQuadrant: selfQ, empty, text: `${selfQ}엔 경쟁자가 몰려있다. 빈 사분면(${empty.join(', ')})으로 재포지셔닝을 검토한다.` };
  }
  return { selfQuadrant: selfQ, empty, text: '네 사분면 모두 경쟁자가 있다. 포지셔닝만으로는 차별화가 어려워 다른 축을 고려해야 한다.' };
}

const FOURP_BY_SWOT = {
  SO: { product: '핵심 강점 기반 신제품/신기능 확장', price: '가치기반 프리미엄 가격 가능', place: '신규 채널 적극 확대', promotion: '공격적 인지도 확산 캠페인' },
  ST: { product: '핵심 제품 방어에 집중, 파생 라인으로 리스크 분산', price: '기존 가격 유지, 원가효율로 위협 흡수', place: '기존 채널 강화, 신규 확장은 보수적으로', promotion: '기존 고객 락인 강화 메시지' },
  WO: { product: '약점 보완할 최소기능 우선 개발', price: '진입장벽 낮추는 도입가/체험가', place: '제휴·파트너십으로 채널 약점 보완', promotion: '기회요인(트렌드) 편승한 저비용 마케팅' },
  WT: { product: '핵심 기능만 남기고 슬림화', price: '저가/원가방어 우선', place: '채널 축소, 저비용 채널만 유지', promotion: '최소 예산으로 기존고객 유지 중심' },
};
function deriveFourP(swotQuadrant) {
  return FOURP_BY_SWOT[swotQuadrant];
}

const ANSOFF_TEXT = {
  'existing-existing': '시장침투: 기존 시장에서 기존 제품 점유율을 높이는 전략. 마케팅 강도와 재구매를 높이는 데 집중한다.',
  'existing-new': '제품개발: 기존 고객에게 새 제품/기능을 제공한다. 기존 고객 데이터를 활용한 확장이 유리하다.',
  'new-existing': '시장개발: 기존 제품을 새 시장(지역/세그먼트)으로 넓힌다. 신규 시장 진입장벽부터 점검한다.',
  'new-new': '다각화: 새 시장에 새 제품이다. 리스크가 가장 크므로 소규모 파일럿부터 검증한다.',
};
function judgeAnsoff(market, product) {
  return { text: ANSOFF_TEXT[`${market}-${product}`] };
}

function judgeBlueOcean(factors) {
  const create = factors.filter((f) => f.action === 'create').length;
  const cut = factors.filter((f) => f.action === 'eliminate' || f.action === 'reduce').length;
  if (create >= 1 && cut >= 2) return { profile: '블루오션형(차별화+저비용 동시 추구)', text: '제거·감소로 원가를 낮추면서 창조 요인으로 새 가치를 만든다. 전형적인 블루오션 전략이다.' };
  if (create >= 1) return { profile: '차별화 중심', text: '새로운 가치 창조에 무게가 있다. 원가 구조 점검이 뒤따라야 한다.' };
  if (cut >= 2) return { profile: '저비용 중심', text: '비용 요인 제거·감소에 무게가 있다. 차별화 요소가 부족하지 않은지 점검한다.' };
  return { profile: '기존 업계와 유사', text: '업계 통념과 크게 다르지 않다. 제거/창조 축에서 다시 검토가 필요하다.' };
}

const AARRR_TEXT = {
  acquisition: '획득 단계가 약점이다. 채널별 유입 실험(SEO/광고/제휴)을 먼저 늘린다.',
  activation: '활성화 단계가 약점이다. 첫 사용 경험(온보딩)을 단순화해 핵심 가치를 느끼는 시간을 줄인다.',
  retention: '유지 단계가 약점이다. 재방문을 유도하는 알림/루틴 설계가 우선이다.',
  referral: '추천 단계가 약점이다. 공유·초대에 대한 유인(리워드 등)을 설계한다.',
  revenue: '수익화 단계가 약점이다. 가격정책/결제 전환 지점의 마찰을 점검한다.',
};
function summarizeAARRR(weakStage) {
  return { text: AARRR_TEXT[weakStage] };
}

const Engine = {
  scoreThreeC, judgeSWOT, judgeSTP, scoreFiveForces, scoreVRIO,
  classifyKano, quadrantOf, analyzePositioningMap, deriveFourP,
  judgeAnsoff, judgeBlueOcean, summarizeAARRR,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Engine;
} else {
  window.Engine = Engine;
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node .claude/skills/idea-position-lab/assets/engine.test.js`
Expected: `all engine tests passed` 출력, exit code 0

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/idea-position-lab/assets/engine.js .claude/skills/idea-position-lab/assets/engine.test.js
git commit -m "feat: idea-position-lab 규칙 판정 엔진 추가"
```

---

### Task 3: 자기완결형 HTML 템플릿 (`template.html`)

**Files:**
- Create: `.claude/skills/idea-position-lab/assets/template.html`

**Interfaces:**
- Consumes: Task 2의 `Engine` 전역 객체(브라우저에서 `<script>` 인라인으로 로드된 `window.Engine`)
- Produces: 완성된 자기완결형 HTML 파일. Task 4(`SKILL.md`)가 이 파일을 그대로 Artifact로 발행한다. `<!-- ENGINE_JS -->` 주석 자리에 `engine.js` 파일 내용을 그대로 인라인해야 한다(치환 지점).

- [ ] **Step 1: 템플릿 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>Idea Position Lab</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
  section { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  h2 { margin-top: 0; font-size: 1.1rem; }
  label { display: inline-block; margin-right: 1rem; }
  input[type=text], textarea, select { width: 100%; margin: 0.25rem 0 0.75rem; box-sizing: border-box; }
  .row { display: flex; gap: 0.5rem; }
  .row > * { flex: 1; }
  #results { white-space: pre-wrap; background: #f7f7f7; padding: 1rem; border-radius: 8px; }
  button { padding: 0.6rem 1.2rem; font-size: 1rem; cursor: pointer; }
</style>
</head>
<body>
<h1>Idea Position Lab</h1>

<section>
  <h2>공통 입력</h2>
  <label>아이디어 한줄설명</label><input type="text" id="c-idea">
  <label>타겟고객 한줄</label><input type="text" id="c-customer">
  <label>주요경쟁사 한줄</label><input type="text" id="c-competitor">
  <label>시장성장세</label>
  <select id="c-growth"><option value="growth">성장</option><option value="stable">정체</option><option value="decline">축소</option></select>
</section>

<section>
  <h2>3C — 자사 강점</h2>
  <label><input type="checkbox" class="threeC" value="브랜드력">브랜드력</label>
  <label><input type="checkbox" class="threeC" value="원가우위">원가우위</label>
  <label><input type="checkbox" class="threeC" value="기술력">기술력</label>
  <label><input type="checkbox" class="threeC" value="유통망">유통망</label>
  <label><input type="checkbox" class="threeC" value="자본력">자본력</label>
</section>

<section>
  <h2>SWOT</h2>
  <div class="row">
    <div><b>Strength</b><br><input type="text" id="swot-s1"><input type="text" id="swot-s2"></div>
    <div><b>Weakness</b><br><input type="text" id="swot-w1"><input type="text" id="swot-w2"></div>
  </div>
  <div class="row">
    <div><b>Opportunity</b><br><input type="text" id="swot-o1"><input type="text" id="swot-o2"></div>
    <div><b>Threat</b><br><input type="text" id="swot-t1"><input type="text" id="swot-t2"></div>
  </div>
</section>

<section>
  <h2>STP</h2>
  <label>세그먼트 크기</label>
  <select id="stp-size"><option value="large">대</option><option value="medium">중</option><option value="small">소</option></select>
  <label>타겟팅 유형</label>
  <select id="stp-targeting"><option value="undifferentiated">무차별</option><option value="differentiated">차별화</option><option value="concentrated">집중화</option></select>
</section>

<section>
  <h2>Five Forces</h2>
  <div id="five-forces">
    <label>신규진입위협</label><select class="ff" data-key="entrants"><option value="low">낮음</option><option value="mid">중간</option><option value="high">높음</option></select>
    <label>공급자교섭력</label><select class="ff" data-key="supplier"><option value="low">낮음</option><option value="mid">중간</option><option value="high">높음</option></select>
    <label>구매자교섭력</label><select class="ff" data-key="buyer"><option value="low">낮음</option><option value="mid">중간</option><option value="high">높음</option></select>
    <label>대체재위협</label><select class="ff" data-key="substitutes"><option value="low">낮음</option><option value="mid">중간</option><option value="high">높음</option></select>
    <label>경쟁강도</label><select class="ff" data-key="rivalry"><option value="low">낮음</option><option value="mid">중간</option><option value="high">높음</option></select>
  </div>
</section>

<section>
  <h2>VRIO</h2>
  <label><input type="checkbox" class="vrio" data-key="value">가치(Value)</label>
  <label><input type="checkbox" class="vrio" data-key="rarity">희소성(Rarity)</label>
  <label><input type="checkbox" class="vrio" data-key="imitability">모방불가(Imitability)</label>
  <label><input type="checkbox" class="vrio" data-key="organization">조직화(Organization)</label>
</section>

<section>
  <h2>Kano</h2>
  <div id="kano">
    <div class="row"><input type="text" class="kano-name" placeholder="기능명 1"><select class="kano-cat"><option value="must-be">필수</option><option value="performance">성과</option><option value="attractive">매력적</option><option value="indifferent">무관심</option></select></div>
    <div class="row"><input type="text" class="kano-name" placeholder="기능명 2"><select class="kano-cat"><option value="must-be">필수</option><option value="performance">성과</option><option value="attractive">매력적</option><option value="indifferent">무관심</option></select></div>
    <div class="row"><input type="text" class="kano-name" placeholder="기능명 3"><select class="kano-cat"><option value="must-be">필수</option><option value="performance">성과</option><option value="attractive">매력적</option><option value="indifferent">무관심</option></select></div>
  </div>
</section>

<section>
  <h2>포지셔닝맵</h2>
  <label>자사 X(0~100)</label><input type="range" id="pm-self-x" min="0" max="100" value="50">
  <label>자사 Y(0~100)</label><input type="range" id="pm-self-y" min="0" max="100" value="50">
  <div id="pm-competitors">
    <div class="row"><input type="text" class="pm-name" placeholder="경쟁사1"><input type="range" class="pm-x" min="0" max="100" value="50"><input type="range" class="pm-y" min="0" max="100" value="50"></div>
    <div class="row"><input type="text" class="pm-name" placeholder="경쟁사2"><input type="range" class="pm-x" min="0" max="100" value="50"><input type="range" class="pm-y" min="0" max="100" value="50"></div>
    <div class="row"><input type="text" class="pm-name" placeholder="경쟁사3"><input type="range" class="pm-x" min="0" max="100" value="50"><input type="range" class="pm-y" min="0" max="100" value="50"></div>
  </div>
</section>

<section>
  <h2>Ansoff</h2>
  <label>시장</label><select id="ansoff-market"><option value="existing">기존</option><option value="new">신규</option></select>
  <label>제품</label><select id="ansoff-product"><option value="existing">기존</option><option value="new">신규</option></select>
</section>

<section>
  <h2>블루오션 전략캔버스</h2>
  <div id="blue-ocean">
    <label>가격</label><select class="bo" data-key="가격"><option value="eliminate">제거</option><option value="reduce">감소</option><option value="raise">증가</option><option value="create">창조</option></select>
    <label>품질</label><select class="bo" data-key="품질"><option value="eliminate">제거</option><option value="reduce">감소</option><option value="raise">증가</option><option value="create">창조</option></select>
    <label>서비스범위</label><select class="bo" data-key="서비스범위"><option value="eliminate">제거</option><option value="reduce">감소</option><option value="raise">증가</option><option value="create">창조</option></select>
    <label>브랜드이미지</label><select class="bo" data-key="브랜드이미지"><option value="eliminate">제거</option><option value="reduce">감소</option><option value="raise">증가</option><option value="create">창조</option></select>
    <label>유통채널</label><select class="bo" data-key="유통채널"><option value="eliminate">제거</option><option value="reduce">감소</option><option value="raise">증가</option><option value="create">창조</option></select>
  </div>
</section>

<section>
  <h2>린 캔버스</h2>
  <div id="lean-canvas">
    <label>문제</label><textarea class="lc"></textarea>
    <label>솔루션</label><textarea class="lc"></textarea>
    <label>핵심지표</label><textarea class="lc"></textarea>
    <label>고유가치제안</label><textarea class="lc"></textarea>
    <label>경쟁우위</label><textarea class="lc"></textarea>
    <label>채널</label><textarea class="lc"></textarea>
    <label>고객군</label><textarea class="lc"></textarea>
    <label>비용구조</label><textarea class="lc"></textarea>
    <label>수익원</label><textarea class="lc"></textarea>
  </div>
</section>

<section>
  <h2>BMC</h2>
  <div id="bmc">
    <label>핵심파트너</label><textarea class="bmc"></textarea>
    <label>핵심활동</label><textarea class="bmc"></textarea>
    <label>핵심자원</label><textarea class="bmc"></textarea>
    <label>가치제안</label><textarea class="bmc"></textarea>
    <label>고객관계</label><textarea class="bmc"></textarea>
    <label>채널</label><textarea class="bmc"></textarea>
    <label>고객세그먼트</label><textarea class="bmc"></textarea>
    <label>비용구조</label><textarea class="bmc"></textarea>
    <label>수익원</label><textarea class="bmc"></textarea>
  </div>
</section>

<section>
  <h2>AARRR — 약점 단계</h2>
  <select id="aarrr-weak">
    <option value="acquisition">획득</option>
    <option value="activation">활성화</option>
    <option value="retention">유지</option>
    <option value="referral">추천</option>
    <option value="revenue">수익화</option>
  </select>
</section>

<button id="calc-btn">전체 계산하기</button>
<button id="export-btn">마크다운으로 내보내기</button>

<h2>결과</h2>
<div id="results">아직 계산 전이다. "전체 계산하기"를 눌러라.</div>

<script>
/* ENGINE_JS: 이 자리에 engine.js 파일 내용을 그대로 붙여넣는다. */
</script>

<script>
function readChecklist(selector) {
  return [...document.querySelectorAll(selector + ':checked')].map((el) => el.value);
}
function readVRIO() {
  const out = {};
  document.querySelectorAll('.vrio').forEach((el) => { out[el.dataset.key] = el.checked; });
  return out;
}
function readFiveForces() {
  const out = {};
  document.querySelectorAll('.ff').forEach((el) => { out[el.dataset.key] = el.value; });
  return out;
}
function readBlueOcean() {
  return [...document.querySelectorAll('.bo')].map((el) => ({ name: el.dataset.key, action: el.value }));
}
function readKano() {
  const names = [...document.querySelectorAll('.kano-name')].map((el) => el.value);
  const cats = [...document.querySelectorAll('.kano-cat')].map((el) => el.value);
  return names.map((name, i) => ({ name, category: cats[i] })).filter((f) => f.name);
}
function readPositioningMap() {
  const self = { x: Number(document.getElementById('pm-self-x').value), y: Number(document.getElementById('pm-self-y').value) };
  const names = [...document.querySelectorAll('.pm-name')].map((el) => el.value);
  const xs = [...document.querySelectorAll('.pm-x')].map((el) => Number(el.value));
  const ys = [...document.querySelectorAll('.pm-y')].map((el) => Number(el.value));
  const competitors = names.map((name, i) => ({ name, x: xs[i], y: ys[i] })).filter((c) => c.name);
  return { self, competitors };
}
function readTextGroup(selector) {
  return [...document.querySelectorAll(selector)].map((el) => el.value);
}

let lastResults = null;

function calculateAll() {
  const threeC = window.Engine.scoreThreeC(readChecklist('.threeC'));
  const swot = window.Engine.judgeSWOT(
    [document.getElementById('swot-s1').value, document.getElementById('swot-s2').value].filter(Boolean),
    [document.getElementById('swot-w1').value, document.getElementById('swot-w2').value].filter(Boolean),
    [document.getElementById('swot-o1').value, document.getElementById('swot-o2').value].filter(Boolean),
    [document.getElementById('swot-t1').value, document.getElementById('swot-t2').value].filter(Boolean)
  );
  const stp = window.Engine.judgeSTP(document.getElementById('stp-size').value, document.getElementById('stp-targeting').value);
  const fiveForces = window.Engine.scoreFiveForces(readFiveForces());
  const vrio = window.Engine.scoreVRIO(readVRIO());
  const kano = window.Engine.classifyKano(readKano());
  const pm = readPositioningMap();
  const positioningMap = window.Engine.analyzePositioningMap(pm.self, pm.competitors);
  const fourP = window.Engine.deriveFourP(swot.quadrant);
  const ansoff = window.Engine.judgeAnsoff(document.getElementById('ansoff-market').value, document.getElementById('ansoff-product').value);
  const blueOcean = window.Engine.judgeBlueOcean(readBlueOcean());
  const aarrr = window.Engine.summarizeAARRR(document.getElementById('aarrr-weak').value);

  lastResults = { threeC, swot, stp, fiveForces, vrio, kano, positioningMap, fourP, ansoff, blueOcean, aarrr };
  renderResults(lastResults);
}

function renderResults(r) {
  const lines = [
    `[분석군]`,
    `3C: ${r.threeC.band} — ${r.threeC.text}`,
    `SWOT: ${r.swot.quadrant} — ${r.swot.text}`,
    `STP: ${r.stp.text}`,
    `Five Forces: ${r.fiveForces.band} — ${r.fiveForces.text}`,
    `VRIO: ${r.vrio.level} — ${r.vrio.text}`,
    `Kano: ${r.kano.map((k) => `${k.name}(${k.label})`).join(', ')}`,
    `포지셔닝맵: ${r.positioningMap.text}`,
    ``,
    `[전략군]`,
    `4P: 제품-${r.fourP.product} / 가격-${r.fourP.price} / 유통-${r.fourP.place} / 프로모션-${r.fourP.promotion}`,
    `Ansoff: ${r.ansoff.text}`,
    `블루오션: ${r.blueOcean.profile} — ${r.blueOcean.text}`,
    `AARRR: ${r.aarrr.text}`,
  ];
  document.getElementById('results').textContent = lines.join('\n');
}

function exportMarkdown() {
  if (!lastResults) { alert('먼저 "전체 계산하기"를 눌러라.'); return; }
  const r = lastResults;
  const md = `# Idea Position Lab 결과

## 분석군
- 3C: ${r.threeC.band} — ${r.threeC.text}
- SWOT: ${r.swot.quadrant} — ${r.swot.text}
- STP: ${r.stp.text}
- Five Forces: ${r.fiveForces.band} — ${r.fiveForces.text}
- VRIO: ${r.vrio.level} — ${r.vrio.text}
- Kano: ${r.kano.map((k) => `${k.name}(${k.label})`).join(', ')}
- 포지셔닝맵: ${r.positioningMap.text}

## 전략군
- 4P: 제품-${r.fourP.product} / 가격-${r.fourP.price} / 유통-${r.fourP.place} / 프로모션-${r.fourP.promotion}
- Ansoff: ${r.ansoff.text}
- 블루오션: ${r.blueOcean.profile} — ${r.blueOcean.text}
- AARRR: ${r.aarrr.text}
`;
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'idea-position-lab-result.md';
  a.click();
}

document.getElementById('calc-btn').addEventListener('click', calculateAll);
document.getElementById('export-btn').addEventListener('click', exportMarkdown);
</script>
</body>
</html>
```

- [ ] **Step 2: 인라인 치환 후 수동 검증**

`engine.js` 내용을 복사해 `<!-- ENGINE_JS -->` 주석 자리(스크립트 태그 안)에 붙여넣은 사본을 만들고, 브라우저에서 직접 열어 다음을 확인한다:
1. VRIO 4개 체크박스 모두 체크 후 "전체 계산하기" → 결과에 "지속가능한 경쟁우위" 표시되는지
2. SWOT S란에 2개, W란에 0개, O란에 1개, T란에 0개 입력 후 계산 → "SO" 표시되는지
3. "마크다운으로 내보내기" 클릭 → `.md` 파일 다운로드되는지

Expected: 세 가지 모두 통과. 실패 시 Step 1의 해당 wiring 코드를 고친다.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/idea-position-lab/assets/template.html
git commit -m "feat: idea-position-lab 자기완결형 HTML 템플릿 추가"
```

---

### Task 4: 스킬 정의 (`SKILL.md`)

**Files:**
- Create: `.claude/skills/idea-position-lab/SKILL.md`

**Interfaces:**
- Consumes: Task 2 `assets/engine.js`, Task 3 `assets/template.html`
- Produces: 없음 (사용자 트리거 문서)

- [ ] **Step 1: 작성**

```markdown
---
name: idea-position-lab
description: >
  생성형 AI 없이도 재사용 가능한 규칙기반 상품기획 위치진단 도구. 13개 마케팅 프레임워크
  (3C, SWOT, STP, Five Forces, VRIO, Kano, 포지셔닝맵, 4P, Ansoff, 블루오션 전략캔버스,
  린 캔버스, BMC, AARRR)로 아이디어의 현재 위치를 진단하고 1차 전략을 제시한다.
  "위치 진단해줘", "포지션 분석기 만들어줘", "idea position lab" 요청 시 사용.
  기존 PITL 하네스(3c-analysis/4p-strategy/idea-to-strategy)와 독립적으로 동작한다.
---

# Idea Position Lab

주식 기술적 분석처럼, 정해진 규칙으로 아이디어의 시장 위치를 판정하고 정형화된 1차 전략을 매칭하는 계산기를 만든다. 판정 로직과 문구는 전부 `assets/engine.js`에 고정되어 있으며, 이 스킬의 역할은 그 로직을 담은 자기완결형 HTML을 만들어 Artifact로 발행하는 것뿐이다.

## 실행 절차

1. `assets/engine.js` 파일 내용을 읽는다.
2. `assets/template.html` 파일 내용을 읽는다.
3. `template.html`의 `<!-- ENGINE_JS: 이 자리에 engine.js 파일 내용을 그대로 붙여넣는다. -->` 주석을, 1번에서 읽은 `engine.js` 전체 내용으로 치환한다.
4. 치환된 HTML을 Artifact 도구로 발행한다 (title: `idea_position_lab`, favicon 지정).
5. 사용자에게: 폼을 채우고 "전체 계산하기"를 누르면 결과가 나오며, "마크다운으로 내보내기"로 리포트를 저장할 수 있다고 안내한다.

## 규칙 변경 시

판정 로직이나 문구를 바꾸고 싶으면 `references/methodology.md`를 먼저 수정하고, 그 내용을 반영해 `assets/engine.js`와 `assets/engine.test.js`를 함께 고친 뒤 테스트를 다시 통과시킨다. 그 다음에만 이 스킬을 재실행해 아티팩트를 재발행한다.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/idea-position-lab/SKILL.md
git commit -m "feat: idea-position-lab 스킬 정의 추가"
```
