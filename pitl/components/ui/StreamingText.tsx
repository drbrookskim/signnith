interface StreamingTextProps {
  text: string
  isLoading?: boolean
  placeholder?: string
  className?: string
}

export default function StreamingText({
  text,
  isLoading = false,
  placeholder,
  className = '',
}: StreamingTextProps) {
  if (isLoading && !text) {
    return (
      <div className={`flex items-center gap-2 text-gray-400 ${className}`}>
        <span
          role="status"
          className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"
        />
        <span>생성 중...</span>
      </div>
    )
  }

  if (!text && placeholder) {
    return <p className={`text-gray-400 italic ${className}`}>{placeholder}</p>
  }

  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {text}
      {isLoading && (
        <span className="inline-block w-1 h-4 ml-0.5 bg-gray-700 animate-pulse" />
      )}
    </div>
  )
}
