'use client'
import type { NewsMode } from '@/types'

interface NewsStep2ModeProps {
  onSelect: (mode: NewsMode) => void
  onBack: () => void
}

export default function NewsStep2Mode({ onSelect, onBack }: NewsStep2ModeProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">분석 방식을 선택하세요</p>

      <div className="grid grid-cols-1 gap-3">
        <button
          onClick={() => onSelect('fast')}
          className="flex items-start gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
        >
          <div className="text-3xl">⚡</div>
          <div>
            <div className="font-semibold text-gray-900">빠른 기획서</div>
            <div className="text-sm text-gray-500 mt-1">
              DHK 방법론으로 바로 HTML 기획서 생성<br />
              Why → 개념 → 시나리오 → 가지치기 → 스토리텔링
            </div>
          </div>
        </button>

        <button
          onClick={() => onSelect('deep')}
          className="flex items-start gap-4 p-5 rounded-xl border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50 transition-all text-left"
        >
          <div className="text-3xl">🔬</div>
          <div>
            <div className="font-semibold text-gray-900">심층 분석</div>
            <div className="text-sm text-gray-500 mt-1">
              3C 분석 → 4P 전략 → 기획서 단계별 진행<br />
              API 설정이 필요합니다
            </div>
          </div>
        </button>
      </div>

      <button onClick={onBack} className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
        ← 뒤로
      </button>
    </div>
  )
}
