'use client'

import { useLocalStorage } from './useLocalStorage'

export interface Favorite {
  ticker: string
  name: string
  market: 'KR' | 'US'
}

const MAX = 20

export function useFavorites() {
  const [favorites, setFavorites] = useLocalStorage<Favorite[]>('eq-favorites', [])

  function isFavorite(ticker: string) {
    return favorites.some(f => f.ticker === ticker)
  }

  function toggle(f: Favorite) {
    if (favorites.some(x => x.ticker === f.ticker)) {
      setFavorites(favorites.filter(x => x.ticker !== f.ticker))
    } else {
      setFavorites([...favorites.slice(-(MAX - 1)), f])
    }
  }

  return { favorites, isFavorite, toggle }
}
