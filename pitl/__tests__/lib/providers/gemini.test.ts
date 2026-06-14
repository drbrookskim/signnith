/**
 * @jest-environment node
 */
import { generateWithGemini } from '@/lib/providers/gemini'

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContentStream: jest.fn().mockResolvedValue({
        stream: (async function* () {
          yield { text: () => 'Hello ' }
          yield { text: () => 'World' }
        })(),
      }),
    }),
  })),
}))

describe('generateWithGemini', () => {
  it('스트리밍 텍스트를 ReadableStream으로 반환한다', async () => {
    const stream = await generateWithGemini('test prompt', 'ai-test', 'gemini-2.0-flash')
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
