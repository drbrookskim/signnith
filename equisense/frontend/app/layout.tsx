import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Noto_Serif_KR, Space_Grotesk } from 'next/font/google'
import AuthProvider from '@/components/layout/AuthProvider'
import SpaRedirectScript from '@/components/layout/SpaRedirectScript'
import MouseGlow from '@/components/layout/MouseGlow'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})
const notoSerifKR = Noto_Serif_KR({
  variable: '--font-noto-serif-kr',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
})
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

// GitHub Pages 배포 시 NEXT_PUBLIC_BASE_PATH=/equisense 처럼 설정 (next.config.ts와 동일)
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const metadata: Metadata = {
  title: 'Equity-Sense (EquiSense) — 4단계 주식 분석',
  description: '펀더멘털 · 해자 · 정성적 · 기술적 분석을 한 곳에서',
}

export const viewport: Viewport = {
  themeColor: '#1b1a15',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${spaceGrotesk.variable} ${notoSerifKR.variable} ${geistMono.variable} h-full`}>
      <head>
        <link rel="manifest" href={`${basePath}/manifest.webmanifest`} />
        <link rel="apple-touch-icon" href={`${basePath}/icons/apple-touch-icon.png`} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="EquiSense" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* no-flash: JSON.parse handles both raw 'dark' and JSON-encoded '"dark"' */}
        <script dangerouslySetInnerHTML={{ __html: `try{var _t=localStorage.getItem('eq-theme');try{_t=JSON.parse(_t)}catch(e){}if(_t==='dark'){var r=document.documentElement;r.setAttribute('data-theme','dark');r.classList.add('dark');}}catch(e){}` }} />
        {/* Google Analytics */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-KJQ91WEN93" />
        <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-KJQ91WEN93');` }} />
      </head>
      <body style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
        <SpaRedirectScript />
        <MouseGlow />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
