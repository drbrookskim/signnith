'use client'
import { useState, useRef, useEffect } from 'react'
import type { ProviderConfig } from '@/types'
import StreamingText from '@/components/ui/StreamingText'

interface Step3PlanProps {
  config: ProviderConfig
  idea: string
  threeC: string
  fourP: string
  onBack: () => void
  onReset: () => void
}

export default function Step3Plan({
  config,
  idea,
  threeC,
  fourP,
  onBack,
  onReset,
}: Step3PlanProps) {
  const [plan, setPlan] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const hasGenerated = useRef(false)

  useEffect(() => {
    if (!hasGenerated.current) {
      hasGenerated.current = true
      handleGenerate()
    }
  }, [])

  const handleGenerate = async () => {
    setError('')
    setPlan('')
    setShowPreview(false)
    setIsLoading(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, step: 'plan', idea, threeC, fourP }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'API 오류')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let result = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        result += decoder.decode(value, { stream: true })
        setPlan(result)
      }

      setShowPreview(true)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleDownload = () => {
    const htmlContent = extractHtml(plan)
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pitl-plan-${Date.now()}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const extractHtml = (text: string): string => {
    const match = text.match(/<!DOCTYPE html>[\s\S]*/i)
    return match ? match[0] : text
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Step 3: 최종 기획서</h2>

      {error && (
        <div className="flex gap-2 items-center">
          <p className="text-red-500 text-sm">{error}</p>
          <button
            onClick={handleGenerate}
            className="text-sm text-blue-600 hover:underline"
          >
            재시도
          </button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 min-h-24">
            <StreamingText text="" isLoading={true} />
          </div>
          <button
            onClick={handleStop}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            중단
          </button>
        </div>
      )}

      {plan && !isLoading && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showPreview ? '미리보기 닫기' : '브라우저 미리보기'}
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              HTML 다운로드
            </button>
            <button
              onClick={handleGenerate}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              다시 생성
            </button>
          </div>

          {showPreview && (
            <iframe
              srcDoc={extractHtml(plan)}
              className="w-full h-[600px] border border-gray-200 rounded-lg"
              sandbox="allow-same-origin"
              title="기획서 미리보기"
            />
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          ← 이전
        </button>
        <button
          onClick={onReset}
          className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
        >
          처음부터 다시
        </button>
      </div>
    </div>
  )
}
