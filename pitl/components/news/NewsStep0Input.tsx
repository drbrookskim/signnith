'use client'
import { useState } from 'react'
import type { NewsSource, NewsArticle } from '@/types'
import { RSS_CATEGORIES } from '@/types'

interface NewsStep0InputProps {
  naverAvailable: boolean
  onComplete: (articles: NewsArticle[], source: NewsSource) => void
}

export default function NewsStep0Input({ naverAvailable, onComplete }: NewsStep0InputProps) {
  const [activeTab, setActiveTab] = useState<NewsSource>(naverAvailable ? 'naver' : 'rss')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('economy')
  const [pasteUrl, setPasteUrl] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function fetchNews() {
    setLoading(true)
    setError('')
    try {
      let body: object
      if (activeTab === 'naver') {
        if (!query.trim()) { setError('검색어를 입력해주세요'); setLoading(false); return }
        body = { source: 'naver', query }
      } else if (activeTab === 'rss') {
        body = { source: 'rss', category }
      } else {
        if (!pasteUrl.trim() && !pasteText.trim()) {
          setError('URL 또는 텍스트를 입력해주세요')
          setLoading(false)
          return
        }
        body = pasteUrl.trim()
          ? { source: 'paste', url: pasteUrl.trim() }
          : { source: 'paste', text: pasteText.trim() }
      }

      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '뉴스 검색 실패')
      onComplete(data.articles, activeTab)
    } catch (e) {
      setError(e instanceof Error ? e.message : '검색 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: NewsSource; label: string; disabled?: boolean }[] = [
    { id: 'naver', label: 'Naver 검색', disabled: !naverAvailable },
    { id: 'rss', label: 'RSS 피드' },
    { id: 'paste', label: '직접 입력' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : tab.disabled
                ? 'border-transparent text-gray-300 cursor-not-allowed'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.disabled && <span className="ml-1 text-xs">(서버 설정 필요)</span>}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {activeTab === 'naver' && (
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchNews()}
              placeholder="검색어를 입력하세요 (예: AI 반도체)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {activeTab === 'rss' && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(RSS_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}

        {activeTab === 'paste' && (
          <div className="space-y-3">
            <input
              type="url"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="URL 입력 (선택)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-center text-xs text-gray-400">또는</div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="기사 텍스트를 직접 붙여넣어 주세요"
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={fetchNews}
        disabled={loading}
        className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? '검색 중...' : '뉴스 검색'}
      </button>
    </div>
  )
}
