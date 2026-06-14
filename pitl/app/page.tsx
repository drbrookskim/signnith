'use client'
import { useState, useEffect } from 'react'
import type { WizardStep, ProviderConfig, AppMode } from '@/types'
import ModeSelector from '@/components/ModeSelector'
import Step0Setup from '@/components/wizard/Step0Setup'
import Step1ThreeC from '@/components/wizard/Step1ThreeC'
import Step2FourP from '@/components/wizard/Step2FourP'
import Step3Plan from '@/components/wizard/Step3Plan'
import NewsWizard from '@/components/news/NewsWizard'

const SESSION_KEY = 'pitl_wizard'

interface SavedState {
  step: WizardStep
  config: ProviderConfig
  idea: string
  threeC: string
  fourP: string
}

function loadSession(): Partial<SavedState> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveSession(state: Partial<SavedState>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  } catch {}
}

export default function Home() {
  const [appMode, setAppMode] = useState<AppMode>('select')
  const [step, setStep] = useState<WizardStep>(0)
  const [config, setConfig] = useState<ProviderConfig | null>(null)
  const [idea, setIdea] = useState('')
  const [threeC, setThreeC] = useState('')
  const [fourP, setFourP] = useState('')

  useEffect(() => {
    const saved = loadSession()
    if (saved.step && saved.config) {
      setStep(saved.step)
      setConfig(saved.config)
      setIdea(saved.idea ?? '')
      setThreeC(saved.threeC ?? '')
      setFourP(saved.fourP ?? '')
      setAppMode('idea')
    }
  }, [])

  const handleSetup = (cfg: ProviderConfig) => {
    setConfig(cfg)
    setStep(1)
    saveSession({ step: 1, config: cfg, idea: '', threeC: '', fourP: '' })
  }

  const handleThreeCComplete = (newIdea: string, newThreeC: string) => {
    setIdea(newIdea)
    setThreeC(newThreeC)
    setStep(2)
    saveSession({ step: 2, config: config!, idea: newIdea, threeC: newThreeC, fourP: '' })
  }

  const handleFourPComplete = (newFourP: string) => {
    setFourP(newFourP)
    setStep(3)
    saveSession({ step: 3, config: config!, idea, threeC, fourP: newFourP })
  }

  const handleReset = () => {
    setAppMode('select')
    setStep(0)
    setConfig(null)
    setIdea('')
    setThreeC('')
    setFourP('')
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {}
  }

  const handleSelectIdea = () => {
    setAppMode('idea')
    setStep(config ? 1 : 0)
  }

  const handleSelectNews = () => {
    setAppMode('news')
  }

  const handleDeepAnalysis = (newsIdea: string) => {
    setIdea(newsIdea)
    setThreeC('')
    setFourP('')
    setAppMode('idea')
    setStep(config ? 1 : 0)
    if (config) {
      saveSession({ step: 1, config, idea: newsIdea, threeC: '', fourP: '' })
    }
  }

  const stepLabels = ['설정', '3C 분석', '4P 전략', '기획서']

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">PITL</h1>
          <p className="text-gray-500 mt-1">아이디어 → 기획서 자동 생성</p>
        </div>

        {appMode === 'select' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <ModeSelector onSelectIdea={handleSelectIdea} onSelectNews={handleSelectNews} />
          </div>
        )}

        {appMode === 'idea' && (
          <>
            <div className="flex items-center justify-center mb-8">
              {stepLabels.map((label, i) => (
                <div key={i} className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                      i < step
                        ? 'bg-green-500 text-white'
                        : i === step
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span
                    className={`ml-1 mr-1 text-xs hidden sm:block ${
                      i === step ? 'text-blue-600 font-medium' : 'text-gray-400'
                    }`}
                  >
                    {label}
                  </span>
                  {i < stepLabels.length - 1 && (
                    <div className={`w-8 h-0.5 ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              {step === 0 && <Step0Setup onComplete={handleSetup} />}
              {step === 1 && config && (
                <Step1ThreeC
                  config={config}
                  initialIdea={idea}
                  onComplete={handleThreeCComplete}
                />
              )}
              {step === 2 && config && (
                <Step2FourP
                  config={config}
                  threeC={threeC}
                  onComplete={handleFourPComplete}
                  onBack={() => setStep(1)}
                />
              )}
              {step === 3 && config && (
                <Step3Plan
                  config={config}
                  idea={idea}
                  threeC={threeC}
                  fourP={fourP}
                  onBack={() => setStep(2)}
                  onReset={handleReset}
                />
              )}
            </div>
          </>
        )}

        {appMode === 'news' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {!config ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">뉴스 기획서를 생성하려면 먼저 AI 제공자를 설정하세요.</p>
                <Step0Setup onComplete={(cfg) => {
                  setConfig(cfg)
                }} />
              </div>
            ) : (
              <NewsWizard
                config={config}
                onDeepAnalysis={handleDeepAnalysis}
                onReset={handleReset}
              />
            )}
          </div>
        )}
      </div>
    </main>
  )
}
