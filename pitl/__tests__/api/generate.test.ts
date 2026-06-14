/**
 * @jest-environment node
 */
import { POST } from '@/app/api/generate/route'
import { NextRequest } from 'next/server'

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/generate', () => {
  it('필수 필드 누락 시 400 반환', async () => {
    const res = await POST(makeRequest({ provider: 'claude' }))
    expect(res.status).toBe(400)
  })

  it('detailed-planning: newsContent 없으면 400', async () => {
    const res = await POST(makeRequest({
      provider: 'claude',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6',
      step: 'detailed-planning',
      // newsContent 없음
    }))
    expect(res.status).toBe(400)
  })

  it('detailed-planning: idea 없어도 newsContent 있으면 validation 통과 (200 또는 502)', async () => {
    const res = await POST(makeRequest({
      provider: 'claude',
      apiKey: 'invalid-key',
      model: 'claude-sonnet-4-6',
      step: 'detailed-planning',
      newsContent: '삼성전자 AI 투자 발표',
    }))
    // newsContent 있으면 validation 통과 (400이 아님), streaming 구조상 200 또는 API 에러 시 502
    expect(res.status).not.toBe(400)
    expect([200, 502]).toContain(res.status)
  })

  it('일반 step: idea 없으면 400', async () => {
    const res = await POST(makeRequest({
      provider: 'claude',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6',
      step: '3c',
      // idea 없음
    }))
    expect(res.status).toBe(400)
  })
})
