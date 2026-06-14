/**
 * @jest-environment node
 */
import { searchNaverNews, stripHtml } from '@/lib/news/naver'

describe('stripHtml', () => {
  it('HTML 태그를 제거한다', () => {
    expect(stripHtml('<b>삼성전자</b> 실적 발표')).toBe('삼성전자 실적 발표')
  })

  it('HTML 엔티티를 디코딩한다', () => {
    expect(stripHtml('AI &amp; 반도체')).toBe('AI & 반도체')
  })
})

describe('searchNaverNews', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, NAVER_CLIENT_ID: 'test-id', NAVER_CLIENT_SECRET: 'test-secret' }
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  it('API 키 미설정 시 NAVER_API_NOT_CONFIGURED 에러를 던진다', async () => {
    process.env = { ...originalEnv, NAVER_CLIENT_ID: '', NAVER_CLIENT_SECRET: '' }
    await expect(searchNaverNews('AI')).rejects.toThrow('NAVER_API_NOT_CONFIGURED')
  })

  it('검색 결과를 NewsArticle 배열로 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { title: '<b>AI</b> 반도체', description: '삼성이 <b>AI</b> 투자를 발표했다.', link: 'https://example.com/1' },
        ],
      }),
    }) as jest.Mock

    const articles = await searchNaverNews('AI 반도체')
    expect(articles).toHaveLength(1)
    expect(articles[0].title).toBe('AI 반도체')
    expect(articles[0].url).toBe('https://example.com/1')
  })
})
