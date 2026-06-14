/**
 * @jest-environment node
 */
import { fetchRssNews } from '@/lib/news/rss'

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>AI 반도체 투자 급증</title>
      <link>https://example.com/1</link>
      <description>국내 기업들이 AI 반도체에 대규모 투자를 시작했다.</description>
    </item>
    <item>
      <title>경제 성장률 발표</title>
      <link>https://example.com/2</link>
      <description>2분기 GDP 성장률이 예상을 상회했다.</description>
    </item>
  </channel>
</rss>`

describe('fetchRssNews', () => {
  afterEach(() => jest.restoreAllMocks())

  it('RSS XML을 파싱해 NewsArticle 배열을 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_RSS,
    }) as jest.Mock

    const articles = await fetchRssNews('economy')
    expect(articles).toHaveLength(2)
    expect(articles[0].title).toBe('AI 반도체 투자 급증')
    expect(articles[0].url).toBe('https://example.com/1')
    expect(articles[0].content).toBe('국내 기업들이 AI 반도체에 대규모 투자를 시작했다.')
  })

  it('알 수 없는 카테고리 시 에러를 던진다', async () => {
    await expect(fetchRssNews('unknown')).rejects.toThrow('Unknown category')
  })

  it('fetch 실패 시 에러를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as jest.Mock
    await expect(fetchRssNews('economy')).rejects.toThrow('RSS fetch failed')
  })
})
