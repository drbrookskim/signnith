'use client'

import { useEffect } from 'react'

/**
 * 이전 세션의 spa_redirect 잔여값을 정리합니다.
 * app/not-found.tsx가 window.location으로 루트 리다이렉트를 처리하므로
 * 이 컴포넌트는 stale sessionStorage만 제거합니다.
 */
export default function SpaRedirectScript() {
  useEffect(() => {
    sessionStorage.removeItem('spa_redirect')
  }, [])

  return null
}
