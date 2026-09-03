import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { mapUser } from '@/lib/mappers'

interface User {
  id: string
  email: string
  name: string
  role: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }
    apiGet<Record<string, unknown>>('/api/auth/me')
      .then((raw) => setUser(mapUser(raw)))
      .catch(() => {
        localStorage.removeItem('token')
      })
      .finally(() => setLoading(false))
  }, [])

  const signIn = async (email: string, password: string) => {
    const data = await apiPost<{ accessToken: string; user?: Record<string, unknown> }>('/api/auth/login', {
      email,
      password,
    })
    localStorage.setItem('token', data.accessToken)
    if (data.user) {
      setUser(mapUser(data.user))
    } else {
      const me = await apiGet<Record<string, unknown>>('/api/auth/me')
      setUser(mapUser(me))
    }
  }

  const signOut = () => {
    localStorage.removeItem('token')
    setUser(null)
    window.location.href = '/auth'
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
