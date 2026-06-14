import { buildPrompt } from '@/lib/prompts'

describe('buildPrompt', () => {
  it('3c 프롬프트에 아이디어를 포함한다', () => {
    const prompt = buildPrompt('3c', { idea: 'AI 식단 앱', threeC: '', fourP: '' })
    expect(prompt).toContain('AI 식단 앱')
    expect(prompt).toContain('3C')
  })

  it('4p 프롬프트에 3C 분석 결과를 포함한다', () => {
    const prompt = buildPrompt('4p', { idea: '', threeC: '고객: MZ세대', fourP: '' })
    expect(prompt).toContain('고객: MZ세대')
    expect(prompt).toContain('4P')
  })

  it('plan 프롬프트에 아이디어, 3C, 4P를 모두 포함한다', () => {
    const prompt = buildPrompt('plan', { idea: '앱', threeC: '3C결과', fourP: '4P결과' })
    expect(prompt).toContain('앱')
    expect(prompt).toContain('3C결과')
    expect(prompt).toContain('4P결과')
    expect(prompt).toContain('HTML')
  })
})
