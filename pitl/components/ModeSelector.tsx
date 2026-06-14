'use client'

interface ModeSelectorProps {
  onSelectIdea: () => void
  onSelectNews: () => void
}

export default function ModeSelector({ onSelectIdea, onSelectNews }: ModeSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <button
        onClick={onSelectIdea}
        className="group flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
      >
        <div className="text-4xl">💡</div>
        <div>
          <div className="font-semibold text-gray-900 text-lg">아이디어로 시작</div>
          <div className="text-sm text-gray-500 mt-1">아이디어 → 3C 분석 → 4P 전략 → 기획서</div>
        </div>
      </button>

      <button
        onClick={onSelectNews}
        className="group flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-gray-200 hover:border-green-400 hover:bg-green-50 transition-all text-left"
      >
        <div className="text-4xl">📰</div>
        <div>
          <div className="font-semibold text-gray-900 text-lg">뉴스로 시작</div>
          <div className="text-sm text-gray-500 mt-1">뉴스 검색 → 기사 선택 → 빠른 기획서</div>
        </div>
      </button>
    </div>
  )
}
