import { NextRequest, NextResponse } from 'next/server'
import { searchNaverNews } from '@/lib/news/naver'
import { fetchRssNews } from '@/lib/news/rss'
import { parseFromUrl, parseFromText } from '@/lib/news/paste'
import type { NewsSource } from '@/types'

export async function POST(req: NextRequest) {
  let body: { source?: NewsSource; query?: string; category?: string; url?: string; text?: string }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { source, query, category, url, text } = body

  if (!source) {
    return NextResponse.json({ error: 'Missing source' }, { status: 400 })
  }

  try {
    if (source === 'naver') {
      if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 })
      const articles = await searchNaverNews(query)
      return NextResponse.json({ articles })
    }

    if (source === 'rss') {
      if (!category) return NextResponse.json({ error: 'Missing category' }, { status: 400 })
      const articles = await fetchRssNews(category)
      return NextResponse.json({ articles })
    }

    if (source === 'paste') {
      if (url) {
        const article = await parseFromUrl(url)
        return NextResponse.json({ articles: [article] })
      }
      if (text) {
        const article = parseFromText(text)
        return NextResponse.json({ articles: [article] })
      }
      return NextResponse.json({ error: 'Missing url or text' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Unknown source' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed'
    if (message === 'NAVER_API_NOT_CONFIGURED') {
      return NextResponse.json({ error: message }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
