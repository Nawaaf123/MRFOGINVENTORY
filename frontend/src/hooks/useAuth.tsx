import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiGet, apiPost } from '@/lib/api'

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
    apiGet<User>('/api/auth/me')
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('token')
      })
      .finally(() => setLoading(false))
  }, [])

  const signIn = async (email: string, password: string) => {
    const data = await apiPost<{ access_token: string; user: User }>('/api/auth/login', {
      email,
      password,
    })
    localStorage.setItem('token', data.access_token)
    setUser(data.user)
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
