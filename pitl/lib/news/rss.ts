import { parseStringPromise } from 'xml2js'
import type { NewsArticle } from '@/types'

const RSS_FEEDS: Record<string, string> = {
  economy: 'https://www.yonhapnews.co.kr/rss/economy.xml',
  it: 'https://www.yonhapnews.co.kr/rss/it.xml',
  politics: 'https://www.yonhapnews.co.kr/rss/politics.xml',
  society: 'https://www.yonhapnews.co.kr/rss/society.xml',
}

export async function fetchRssNews(category: string): Promise<NewsArticle[]> {
  const feedUrl = RSS_FEEDS[category]
  if (!feedUrl) throw new Error(`Unknown category: ${category}`)

  const res = await fetch(feedUrl)
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`)

  const xml = await res.text()
  const parsed = await parseStringPromise(xml)

  const items: Array<{ title?: string[]; link?: string[]; description?: string[] }> =
    parsed?.rss?.channel?.[0]?.item ?? []

  return items.slice(0, 10).map((item) => {
    const title = item.title?.[0] ?? ''
    const description = item.description?.[0] ?? ''
    const url = item.link?.[0] ?? ''
    return { title, summary: description.slice(0, 200), content: description, url }
  })
}
