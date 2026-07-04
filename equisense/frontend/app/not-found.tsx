'use client'

import { useEffect } from 'react'

/**
 * GitHub Pages SPA 라우팅용 not-found 페이지.
 * Next.js가 out/404.html을 이 파일에서 생성하므로,
 * 미존재 경로 접근 시 루트(/)로 리다이렉트합니다.
 */
export default function NotFound() {
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
    window.location.replace(base + '/')
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="text-sm text-zinc-400">페이지를 찾는 중…</span>
    </div>
  )
}
