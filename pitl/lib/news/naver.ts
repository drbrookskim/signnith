// lib/news/naver.ts
import type { NewsArticle } from '@/types'

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim()
}

export async function searchNaverNews(query: string): Promise<NewsArticle[]> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('NAVER_API_NOT_CONFIGURED')
  }

  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=10&sort=date`

  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })

  if (!res.ok) throw new Error(`Naver API error: ${res.status}`)

  const data = await res.json()
  return (data.items ?? []).map((item: { title: string; description: string; link: string }) => ({
    title: stripHtml(item.title),
    summary: stripHtml(item.description),
    content: stripHtml(item.description),
    url: item.link,
  }))
}
