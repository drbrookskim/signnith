'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { login as doLogin, logout as doLogout } from '@/lib/auth'

const PUBLIC_PATHS = ['/login', '/']
const PROTECTED_PREFIXES = ['/companies']

interface AuthState {
  isLoggedIn: boolean
  isLoading: boolean
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  isLoggedIn: false,
  isLoading: true,
  user: null,
  login: async () => {},
  logout: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (isLoading) return
    const needsAuth = PROTECTED_PREFIXES.some(p => pathname.startsWith(p))
    if (!session && needsAuth) router.replace('/login')
    if (session && pathname === '/login') router.replace('/')
  }, [session, isLoading, pathname, router])

  const login = useCallback(async (email: string, password: string) => {
    await doLogin(email, password)
  }, [])

  const logout = useCallback(async () => {
    await doLogout()
    router.replace('/login')
  }, [router])

  return (
    <AuthContext.Provider value={{ isLoggedIn: !!session, isLoading, user: session?.user ?? null, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
