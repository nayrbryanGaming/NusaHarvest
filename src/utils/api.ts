const rawApiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '').trim()

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '')

export function getApiUrl(path: string): string | null {
  if (!API_BASE_URL) return null
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}
