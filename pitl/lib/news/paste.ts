import type { NewsArticle } from '@/types'

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function parseFromUrl(url: string): Promise<NewsArticle> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PITL/1.0)' },
  })
  if (!res.ok) throw new Error(`URL fetch failed: ${res.status}`)

  const html = await res.text()
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : url
  const text = stripHtmlTags(html).slice(0, 3000)

  return {
    title: title.slice(0, 100),
    summary: text.slice(0, 200),
    content: text,
    url,
  }
}

export function parseFromText(text: string): NewsArticle {
  const lines = text.trim().split('\n')
  const title = (lines[0] ?? '직접 입력한 기사').slice(0, 100)
  return {
    title,
    summary: text.slice(0, 200),
    content: text,
    url: '',
  }
}
