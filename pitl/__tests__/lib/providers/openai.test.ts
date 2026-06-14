/**
 * @jest-environment node
 */
import { generateWithOpenAI } from '@/lib/providers/openai'

jest.mock('openai', () => {
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: 'Hello ' } }] }
            yield { choices: [{ delta: { content: 'World' } }] }
          },
          controller: { abort: jest.fn() },
        }),
      },
    },
  }))
  return {
    __esModule: true,
    default: MockOpenAI,
    OpenAI: MockOpenAI,
  }
})

describe('generateWithOpenAI', () => {
  it('스트리밍 텍스트를 ReadableStream으로 반환한다', async () => {
    const stream = await generateWithOpenAI('test prompt', 'sk-test', 'gpt-4o')
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
