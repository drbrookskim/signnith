import OpenAI from 'openai'

export async function generateWithOpenAI(
  prompt: string,
  apiKey: string,
  model: string
): Promise<ReadableStream<Uint8Array>> {
  const client = new OpenAI({ apiKey })
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    max_tokens: 8192,
  })

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? ''
        if (text) {
          controller.enqueue(new TextEncoder().encode(text))
        }
      }
      controller.close()
    },
    async cancel() {
      await stream.controller.abort()
    },
  })
}
