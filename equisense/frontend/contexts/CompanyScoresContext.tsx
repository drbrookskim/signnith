'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type TabHref = 'analysis' | 'moat' | 'qualitative' | 'swing'
export type BadgeTone = 'strong' | 'neutral' | 'weak'

export interface TabBadge {
  label: string
  tone: BadgeTone
  score?: number  // 0–100 numeric for composite calculation
}

interface CompanyScores {
  badges: Partial<Record<TabHref, TabBadge>>
  compositeScore: number | null
  setTabBadge: (tab: TabHref, badge: TabBadge) => void
}

const CompanyScoresContext = createContext<CompanyScores>({
  badges: {},
  compositeScore: null,
  setTabBadge: () => {},
})

const TAB_WEIGHT: Record<TabHref, number> = {
  analysis: 0.30,
  moat: 0.30,
  qualitative: 0.20,
  swing: 0.20,
}

export function CompanyScoresProvider({ children }: { children: React.ReactNode }) {
  const [badges, setBadges] = useState<Partial<Record<TabHref, TabBadge>>>({})

  const setTabBadge = useCallback((tab: TabHref, badge: TabBadge) => {
    setBadges(prev => {
      const cur = prev[tab]
      if (cur?.label === badge.label && cur?.tone === badge.tone && cur?.score === badge.score) return prev
      return { ...prev, [tab]: badge }
    })
  }, [])

  const compositeScore = useMemo(() => {
    const tabs = (Object.keys(TAB_WEIGHT) as TabHref[]).filter(t => badges[t]?.score != null)
    if (tabs.length === 0) return null
    const totalWeight = tabs.reduce((s, t) => s + TAB_WEIGHT[t], 0)
    const weighted = tabs.reduce((s, t) => s + (badges[t]!.score! * TAB_WEIGHT[t]), 0)
    return Math.round(weighted / totalWeight)
  }, [badges])

  const value = useMemo(() => ({ badges, compositeScore, setTabBadge }), [badges, compositeScore, setTabBadge])

  return (
    <CompanyScoresContext.Provider value={value}>
      {children}
    </CompanyScoresContext.Provider>
  )
}

export function useCompanyScores() {
  return useContext(CompanyScoresContext)
}
