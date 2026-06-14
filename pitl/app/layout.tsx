import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PITL — 아이디어 기획서 생성기',
  description: '아이디어를 3C 분석 → 4P 전략 → HTML 기획서로 자동 변환',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  )
}
