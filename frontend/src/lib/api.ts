import { keysToCamel, keysToSnake } from '@/lib/case'

const BASE_URL = (import.meta.env.VITE_API_URL as string) || ''

function getToken(): string | null {
  return localStorage.getItem('token')
}

function buildHeaders(extra?: HeadersInit): HeadersInit {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    localStorage.removeItem('token')
    if (!window.location.pathname.startsWith('/auth')) {
      window.location.href = '/auth'
    }
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const text = await res.text()
    try {
      const parsed = JSON.parse(text) as { detail?: string | { msg?: string }[] }
      if (typeof parsed.detail === 'string') throw new Error(parsed.detail)
    } catch (err) {
      if (err instanceof Error && err.message !== text) throw err
    }
    throw new Error(text || res.statusText)
  }
  const contentType = res.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    const data = await res.json()
    return keysToCamel(data) as T
  }
  return null as unknown as T
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: buildHeaders(),
  })
  return handleResponse<T>(res)
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: body !== undefined ? JSON.stringify(keysToSnake(body)) : undefined,
  })
  return handleResponse<T>(res)
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: buildHeaders(),
    body: body !== undefined ? JSON.stringify(keysToSnake(body)) : undefined,
  })
  return handleResponse<T>(res)
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  })
  return handleResponse<T>(res)
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: body !== undefined ? JSON.stringify(keysToSnake(body)) : undefined,
  })
  return handleResponse<T>(res)
}
