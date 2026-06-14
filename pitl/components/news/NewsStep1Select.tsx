'use client'
import { useState } from 'react'
import type { NewsArticle } from '@/types'

interface NewsStep1SelectProps {
  articles: NewsArticle[]
  onComplete: (article: NewsArticle) => void
  onBack: () => void
}

export default function NewsStep1Select({ articles, onComplete, onBack }: NewsStep1SelectProps) {
  const [selected, setSelected] = useState<NewsArticle | null>(null)
  const [editedContent, setEditedContent] = useState('')

  function handleSelect(article: NewsArticle) {
    setSelected(article)
    setEditedContent(article.content)
  }

  function handleConfirm() {
    if (!selected) return
    onComplete({ ...selected, content: editedContent })
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelected(null)} className="text-sm text-gray-500 hover:text-gray-700">
            ← 목록으로
          </button>
        </div>
        <h3 className="font-medium text-gray-900">{selected.title}</h3>
        {selected.url && (
          <a href={selected.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline break-all">
            {selected.url}
          </a>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">기사 내용 (편집 가능)</label>
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
            처음으로
          </button>
          <button
            onClick={handleConfirm}
            disabled={!editedContent.trim()}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            이 기사로 기획하기 →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">기획서를 작성할 기사를 선택하세요</p>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {articles.map((article, i) => (
          <button
            key={i}
            onClick={() => handleSelect(article)}
            className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <div className="font-medium text-sm text-gray-900 line-clamp-2">{article.title}</div>
            {article.summary && (
              <div className="text-xs text-gray-500 mt-1 line-clamp-2">{article.summary}</div>
            )}
          </button>
        ))}
      </div>
      <button onClick={onBack} className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
        ← 뒤로
      </button>
    </div>
  )
}
