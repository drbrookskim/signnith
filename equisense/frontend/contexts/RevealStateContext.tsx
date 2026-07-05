'use client'

import { createContext, useCallback, useContext, useRef } from 'react'

interface RevealStateContextValue {
  getOpen: (key: string, fallback: boolean) => boolean
  setOpen: (key: string, value: boolean) => void
}

const RevealStateContext = createContext<RevealStateContextValue | null>(null)

/**
 * 탭(라우트)을 오가도 펼침/닫힘 상태를 기억하기 위한 저장소.
 * app/companies/[ticker]/layout.tsx처럼 탭 전환 시에도 언마운트되지 않는
 * 위치에서 Provider를 감싸야 유지된다. ref 기반이라 상태 변경이 다른
 * Reveal의 리렌더를 유발하지 않는다.
 */
export function RevealStateProvider({ children }: { children: React.ReactNode }) {
  const stateRef = useRef<Record<string, boolean>>({})

  const getOpen = useCallback((key: string, fallback: boolean) => (
    key in stateRef.current ? stateRef.current[key] : fallback
  ), [])

  const setOpen = useCallback((key: string, value: boolean) => {
    stateRef.current[key] = value
  }, [])

  return (
    <RevealStateContext.Provider value={{ getOpen, setOpen }}>
      {children}
    </RevealStateContext.Provider>
  )
}

export function useRevealState() {
  return useContext(RevealStateContext)
}
