/**
 * @jest-environment node
 */
import { generateWithClaude } from '@/lib/providers/claude'

jest.mock('@anthropic-ai/sdk', () => {
  const mockStream = {
    [Symbol.asyncIterator]: async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } }
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'World' } }
    },
    abort: jest.fn(),
  }
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: {
      stream: jest.fn().mockReturnValue(mockStream),
    },
  }))
  return {
    default: MockAnthropic,
    Anthropic: MockAnthropic,
  }
})

describe('generateWithClaude', () => {
  it('스트리밍 텍스트를 ReadableStream으로 반환한다', async () => {
    const stream = await generateWithClaude('test prompt', 'sk-test', 'claude-sonnet-4-6')
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let result = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value)
    }

    expect(result).toBe('Hello World')
  })
})
