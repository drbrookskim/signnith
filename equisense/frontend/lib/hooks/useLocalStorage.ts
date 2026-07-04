'use client'

import { useCallback, useEffect, useState } from 'react'

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (val: T) => void] {
  const [value, setValue] = useState<T>(defaultValue)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) setValue(JSON.parse(stored) as T)
    } catch { /* ignore */ }
  }, [key])

  const set = useCallback((val: T) => {
    setValue(val)
    try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ }
  }, [key])

  return [value, set]
}
