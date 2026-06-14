'use client'
import { useState, useEffect } from 'react'
import type { NewsArticle, NewsMode, NewsSource, ProviderConfig } from '@/types'
import NewsStep0Input from './NewsStep0Input'
import NewsStep1Select from './NewsStep1Select'
import NewsStep2Mode from './NewsStep2Mode'
import NewsStep3Result from './NewsStep3Result'

type NewsStep = 0 | 1 | 2 | 3

interface NewsWizardProps {
  config: ProviderConfig
  onDeepAnalysis: (idea: string) => void
  onReset: () => void
}

export default function NewsWizard({ config, onDeepAnalysis, onReset }: NewsWizardProps) {
  const [step, setStep] = useState<NewsStep>(0)
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null)
  const [naverAvailable, setNaverAvailable] = useState(false)

  useEffect(() => {
    fetch('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'naver', query: 'test' }),
    }).then((res) => {
      setNaverAvailable(res.status !== 503)
    }).catch(() => {
      setNaverAvailable(false)
    })
  }, [])

  const stepLabels = ['뉴스 검색', '기사 선택', '분석 방식', '기획서']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-1 mb-2">
        {stepLabels.map((label, i) => (
          <div key={i} className="flex items-center">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                i < step ? 'bg-green-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`ml-1 mr-1 text-xs hidden sm:block ${i === step ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
              {label}
            </span>
            {i < stepLabels.length - 1 && (
              <div className={`w-6 h-0.5 ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {step === 0 && (
        <NewsStep0Input
          naverAvailable={naverAvailable}
          onComplete={(arts, _source) => {
            setArticles(arts)
            setStep(1)
          }}
        />
      )}

      {step === 1 && (
        <NewsStep1Select
          articles={articles}
          onComplete={(article) => {
            setSelectedArticle(article)
            setStep(2)
          }}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && (
        <NewsStep2Mode
          onSelect={(mode: NewsMode) => {
            if (mode === 'deep') {
              onDeepAnalysis(selectedArticle?.content ?? '')
            } else {
              setStep(3)
            }
          }}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && selectedArticle && (
        <NewsStep3Result
          config={config}
          newsContent={selectedArticle.content}
          onBack={() => setStep(2)}
          onReset={onReset}
        />
      )}
    </div>
  )
}
