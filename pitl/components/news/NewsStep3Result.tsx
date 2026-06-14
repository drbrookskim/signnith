'use client'
import { useState, useEffect, useRef } from 'react'
import type { ProviderConfig } from '@/types'
import StreamingText from '@/components/ui/StreamingText'

interface NewsStep3ResultProps {
  config: ProviderConfig
  newsContent: string
  onBack: () => void
  onReset: () => void
}

export default function NewsStep3Result({ config, newsContent, onBack, onReset }: NewsStep3ResultProps) {
  const [plan, setPlan] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const hasFetched = useRef(false)

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true
    generate()
  }, [])

  async function generate() {
    setStreaming(true)
    setError('')
    setPlan('')
    setDone(false)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
          step: 'detailed-planning',
          idea: newsContent,
          newsContent,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '기획서 생성 실패')
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done: d, value } = await reader.read()
        if (d) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setPlan(accumulated)
      }
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성 중 오류가 발생했습니다')
    } finally {
      setStreaming(false)
    }
  }

  function downloadHtml() {
    const blob = new Blob([plan], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pitl-news-plan.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  const htmlContent = plan.match(/<!DOCTYPE html[\s\S]*/i)?.[0] ?? plan

  return (
    <div className="space-y-4">
      {streaming && !done && (
        <div className="space-y-2">
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 min-h-24">
            <StreamingText text={plan} isLoading={true} />
          </div>
        </div>
      )}

      {error && (
        <div className="space-y-3">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => { hasFetched.current = false; generate() }}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      )}

      {done && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setPreview(!preview)}
              className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              {preview ? '텍스트 보기' : '미리보기'}
            </button>
            <button
              onClick={downloadHtml}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              HTML 다운로드
            </button>
          </div>

          {preview ? (
            <iframe
              srcDoc={htmlContent}
              sandbox="allow-same-origin"
              className="w-full h-[600px] border border-gray-200 rounded-lg"
              title="기획서 미리보기"
            />
          ) : (
            <pre className="text-xs text-gray-600 bg-gray-50 p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
              {plan}
            </pre>
          )}

          <div className="flex gap-2">
            <button onClick={onBack} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
              ← 뒤로
            </button>
            <button onClick={onReset} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              처음으로
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
