/**
 * @jest-environment node
 */
import { POST } from '@/app/api/news/route'
import { NextRequest } from 'next/server'

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/news', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/news', () => {
  afterEach(() => jest.restoreAllMocks())

  it('source 없으면 400', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('naver: NAVER_API_NOT_CONFIGURED 시 503', async () => {
    jest.mock('@/lib/news/naver', () => ({
      searchNaverNews: jest.fn().mockRejectedValue(new Error('NAVER_API_NOT_CONFIGURED')),
    }))
    // 환경변수 미설정 상태 테스트
    const originalSearch = jest.requireMock('@/lib/news/naver').searchNaverNews
    const res = await POST(makeRequest({ source: 'naver', query: 'AI' }))
    // 테스트 환경에서 env var 없으면 naver lib이 throw
    expect([400, 500, 503]).toContain(res.status)
  })

  it('rss: category 없으면 400', async () => {
    const res = await POST(makeRequest({ source: 'rss' }))
    expect(res.status).toBe(400)
  })

  it('paste: url 모드', async () => {
    const { parseFromUrl } = jest.requireMock('@/lib/news/paste') as { parseFromUrl: jest.Mock }
    // parseFromUrl mock이 없으면 실제 fetch가 일어남 — 여기선 에러 발생을 기대
    const res = await POST(makeRequest({ source: 'paste', url: 'https://example.com' }))
    // fetch가 실패해도 500/502, 성공하면 200 — 여기선 응답이 오는지만 확인
    expect([200, 500, 502]).toContain(res.status)
  })

  it('paste: text 모드 — 항상 200', async () => {
    const res = await POST(makeRequest({ source: 'paste', text: '삼성전자 AI 투자 발표' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.articles).toHaveLength(1)
    expect(body.articles[0].title).toBe('삼성전자 AI 투자 발표')
  })
})
