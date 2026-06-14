'use client'
import { useState, useRef } from 'react'
import type { ProviderConfig } from '@/types'
import StreamingText from '@/components/ui/StreamingText'

interface Step1ThreeCProps {
  config: ProviderConfig
  onComplete: (idea: string, threeC: string) => void
}

export default function Step1ThreeC({ config, onComplete }: Step1ThreeCProps) {
  const [idea, setIdea] = useState('')
  const [threeC, setThreeC] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const handleGenerate = async () => {
    if (!idea.trim()) {
      setError('아이디어를 입력해주세요')
      return
    }
    setError('')
    setThreeC('')
    setIsLoading(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, step: '3c', idea }),
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
        setThreeC(result)
      }
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

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Step 1: 아이디어 → 3C 분석</h2>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">아이디어</label>
        <textarea
          value={idea}
          onChange={(e) => {
            setIdea(e.target.value)
            setError('')
          }}
          placeholder="기획하고 싶은 서비스/제품 아이디어를 입력하세요"
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          3C 분석 시작
        </button>
        {isLoading && (
          <button
            onClick={handleStop}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            중단
          </button>
        )}
      </div>

      {(threeC || isLoading) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              3C 분석 결과 (편집 가능)
            </label>
            {threeC && !isLoading && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-sm text-blue-600 hover:underline"
              >
                {isEditing ? '완료' : '편집'}
              </button>
            )}
          </div>
          {isEditing ? (
            <textarea
              value={threeC}
              onChange={(e) => setThreeC(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
            />
          ) : (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 min-h-24">
              <StreamingText
                text={threeC}
                isLoading={isLoading}
                placeholder="분석 결과가 여기에 표시됩니다"
              />
            </div>
          )}
        </div>
      )}

      {threeC && !isLoading && (
        <button
          onClick={() => onComplete(idea, threeC)}
          className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          다음: 4P 전략 →
        </button>
      )}
    </div>
  )
}
