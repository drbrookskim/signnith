/**
 * @jest-environment node
 */
import { parseFromText, parseFromUrl } from '@/lib/news/paste'

describe('parseFromText', () => {
  it('첫 줄을 title로, 전체를 content로 반환한다', () => {
    const text = '삼성전자 AI 투자 발표\n삼성전자가 AI 반도체에 10조원을 투자한다고 밝혔다.'
    const article = parseFromText(text)
    expect(article.title).toBe('삼성전자 AI 투자 발표')
    expect(article.content).toBe(text)
    expect(article.url).toBe('')
  })

  it('긴 title은 100자로 잘린다', () => {
    const longTitle = 'a'.repeat(150)
    const article = parseFromText(longTitle)
    expect(article.title.length).toBe(100)
  })
})

describe('parseFromUrl', () => {
  afterEach(() => jest.restoreAllMocks())

  it('URL에서 title과 텍스트를 추출한다', async () => {
    const html = '<html><head><title>AI 반도체 뉴스</title></head><body><p>삼성이 투자를 발표했다.</p></body></html>'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => html,
    }) as jest.Mock

    const article = await parseFromUrl('https://example.com/news/1')
    expect(article.title).toBe('AI 반도체 뉴스')
    expect(article.url).toBe('https://example.com/news/1')
    expect(article.content).toContain('삼성이 투자를 발표했다')
  })

  it('fetch 실패 시 에러를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as jest.Mock
    await expect(parseFromUrl('https://example.com/404')).rejects.toThrow('URL fetch failed')
  })
})
