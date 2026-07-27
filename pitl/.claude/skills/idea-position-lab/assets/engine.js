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
