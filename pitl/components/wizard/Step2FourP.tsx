'use client'
import { useState, useRef, useEffect } from 'react'
import type { ProviderConfig } from '@/types'
import StreamingText from '@/components/ui/StreamingText'

interface Step2FourPProps {
  config: ProviderConfig
  threeC: string
  onComplete: (fourP: string) => void
  onBack: () => void
}

export default function Step2FourP({ config, threeC, onComplete, onBack }: Step2FourPProps) {
  const [fourP, setFourP] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
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
    setFourP('')
    setIsLoading(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, step: '4p', idea: '', threeC }),
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
        setFourP(result)
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
      <h2 className="text-xl font-semibold">Step 2: 3C → 4P 전략</h2>

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

      <div className="flex gap-2">
        {isLoading ? (
          <button
            onClick={handleStop}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            중단
          </button>
        ) : fourP ? (
          <button
            onClick={handleGenerate}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            다시 생성
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            4P 전략 (편집 가능)
          </label>
          {fourP && !isLoading && (
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
            value={fourP}
            onChange={(e) => setFourP(e.target.value)}
            rows={14}
            className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
          />
        ) : (
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 min-h-32">
            <StreamingText
              text={fourP}
              isLoading={isLoading}
              placeholder="4P 전략을 생성 중입니다..."
            />
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          ← 이전
        </button>
        {fourP && !isLoading && (
          <button
            onClick={() => onComplete(fourP)}
            className="flex-1 py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            다음: 기획서 생성 →
          </button>
        )}
      </div>
    </div>
  )
}
