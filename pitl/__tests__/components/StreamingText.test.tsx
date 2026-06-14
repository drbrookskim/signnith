import { render, screen } from '@testing-library/react'
import StreamingText from '@/components/ui/StreamingText'

describe('StreamingText', () => {
  it('텍스트를 렌더링한다', () => {
    render(<StreamingText text="안녕하세요" />)
    expect(screen.getByText('안녕하세요')).toBeInTheDocument()
  })

  it('로딩 중이고 텍스트 없을 때 스피너를 표시한다', () => {
    render(<StreamingText text="" isLoading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('텍스트 없고 플레이스홀더 있으면 플레이스홀더를 표시한다', () => {
    render(<StreamingText text="" placeholder="분석 결과가 여기에 표시됩니다" />)
    expect(screen.getByText('분석 결과가 여기에 표시됩니다')).toBeInTheDocument()
  })
})
