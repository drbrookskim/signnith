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
