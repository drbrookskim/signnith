import { render, screen, fireEvent } from '@testing-library/react'
import Step0Setup from '@/components/wizard/Step0Setup'

const mockOnComplete = jest.fn()

describe('Step0Setup', () => {
  beforeEach(() => mockOnComplete.mockClear())

  it('세 가지 프로바이더 옵션을 렌더링한다', () => {
    render(<Step0Setup onComplete={mockOnComplete} />)
    expect(screen.getByLabelText('Claude')).toBeInTheDocument()
    expect(screen.getByLabelText('ChatGPT')).toBeInTheDocument()
    expect(screen.getByLabelText('Gemini')).toBeInTheDocument()
  })

  it('API 키 없이 시작하기 클릭 시 에러를 표시한다', () => {
    render(<Step0Setup onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByText('시작하기'))
    expect(screen.getByText('API 키를 입력해주세요')).toBeInTheDocument()
    expect(mockOnComplete).not.toHaveBeenCalled()
  })

  it('API 키 입력 후 시작하기 클릭 시 onComplete를 호출한다', () => {
    render(<Step0Setup onComplete={mockOnComplete} />)
    fireEvent.change(screen.getByPlaceholderText(/API 키/), {
      target: { value: 'sk-test-key' },
    })
    fireEvent.click(screen.getByText('시작하기'))
    expect(mockOnComplete).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-test-key', provider: 'claude' })
    )
  })
})
