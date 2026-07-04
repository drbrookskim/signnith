'use client'

import { useLocalStorage } from './useLocalStorage'

export interface RecentSearch {
  ticker: string
  name: string
  market: 'KR' | 'US'
}

const MAX = 5

export function useRecentSearches() {
  const [recents, setRecents] = useLocalStorage<RecentSearch[]>('eq-recent', [])

  function add(s: RecentSearch) {
    const filtered = recents.filter(r => r.ticker !== s.ticker)
    setRecents([s, ...filtered].slice(0, MAX))
  }

  function remove(ticker: string) {
    setRecents(recents.filter(r => r.ticker !== ticker))
  }

  function clear() {
    setRecents([])
  }

  return { recents, add, remove, clear }
}
