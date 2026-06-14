'use client'
import { useState } from 'react'
import type { Provider, ProviderConfig } from '@/types'
import { MODELS } from '@/types'

interface Step0SetupProps {
  onComplete: (config: ProviderConfig) => void
}

export default function Step0Setup({ onComplete }: Step0SetupProps) {
  const [provider, setProvider] = useState<Provider>('claude')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(MODELS.claude[0])
  const [error, setError] = useState('')

  const handleProviderChange = (p: Provider) => {
    setProvider(p)
    setModel(MODELS[p][0])
    setError('')
  }

  const handleSubmit = () => {
    if (!apiKey.trim()) {
      setError('API 키를 입력해주세요')
      return
    }
    onComplete({ provider, apiKey: apiKey.trim(), model })
  }

  const providerLabels: Record<Provider, string> = {
    claude: 'Claude',
    openai: 'ChatGPT',
    gemini: 'Gemini',
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h2 className="text-xl font-semibold">AI 프로바이더 설정</h2>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">프로바이더</label>
        <div className="flex gap-4">
          {(['claude', 'openai', 'gemini'] as Provider[]).map((p) => (
            <label key={p} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value={p}
                checked={provider === p}
                onChange={() => handleProviderChange(p)}
                aria-label={providerLabels[p]}
              />
              {providerLabels[p]}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">API 키</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value)
            setError('')
          }}
          placeholder={`${providerLabels[provider]} API 키를 입력하세요`}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">모델</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {MODELS[provider].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={handleSubmit}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        시작하기
      </button>
    </div>
  )
}
