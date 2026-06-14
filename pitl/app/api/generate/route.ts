import { NextRequest, NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers'
import { buildPrompt } from '@/lib/prompts'
import type { GenerateRequest } from '@/types'

export async function POST(req: NextRequest) {
  let body: GenerateRequest

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { provider, apiKey, model, step, idea, threeC, fourP, newsContent } = body

  if (!provider || !apiKey || !model || !step) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (step === 'detailed-planning' && !newsContent) {
    return NextResponse.json({ error: 'Missing newsContent for detailed-planning' }, { status: 400 })
  }

  if (step !== 'detailed-planning' && idea === undefined) {
    return NextResponse.json({ error: 'Missing idea' }, { status: 400 })
  }

  const prompt = buildPrompt(step, { idea: idea ?? '', threeC, fourP, newsContent })

  try {
    const generate = getProvider(provider)
    const stream = await generate(prompt, apiKey, model)
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
