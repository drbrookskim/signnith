import { GoogleGenerativeAI } from '@google/generative-ai'

export async function generateWithGemini(
  prompt: string,
  apiKey: string,
  model: string
): Promise<ReadableStream<Uint8Array>> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model })
  const result = await geminiModel.generateContentStream(prompt)

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) {
          controller.enqueue(new TextEncoder().encode(text))
        }
      }
      controller.close()
    },
  })
}
