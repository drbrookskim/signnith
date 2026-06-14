import { Anthropic } from '@anthropic-ai/sdk'

export async function generateWithClaude(
  prompt: string,
  apiKey: string,
  model: string
): Promise<ReadableStream<Uint8Array>> {
  const client = new Anthropic({ apiKey })
  const stream = client.messages.stream({
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(new TextEncoder().encode(chunk.delta.text))
        }
      }
      controller.close()
    },
    cancel() {
      stream.abort()
    },
  })
}
