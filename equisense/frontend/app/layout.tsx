import type { Metadata } from 'next'
import { Geist_Mono, Noto_Serif_KR, Space_Grotesk } from 'next/font/google'
import AuthProvider from '@/components/layout/AuthProvider'
import SpaRedirectScript from '@/components/layout/SpaRedirectScript'
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

export const metadata: Metadata = {
  title: 'EquiSense — 4단계 주식 분석',
  description: '펀더멘털 · 해자 · 정성적 · 기술적 분석을 한 곳에서',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${spaceGrotesk.variable} ${notoSerifKR.variable} ${geistMono.variable} h-full`}>
      <head>
        {/* no-flash: JSON.parse handles both raw 'dark' and JSON-encoded '"dark"' */}
        <script dangerouslySetInnerHTML={{ __html: `try{var _t=localStorage.getItem('eq-theme');try{_t=JSON.parse(_t)}catch(e){}if(_t==='dark'){var r=document.documentElement;r.setAttribute('data-theme','dark');r.classList.add('dark');}}catch(e){}` }} />
        {/* Google Analytics */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-KJQ91WEN93" />
        <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-KJQ91WEN93');` }} />
      </head>
      <body style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
        <SpaRedirectScript />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
