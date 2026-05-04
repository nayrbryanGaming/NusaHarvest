'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Language = 'id' | 'en'

interface LanguageContextType {
  lang: Language
  toggle: () => void
  t: (id: string, en: string) => string
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'id',
  toggle: () => {},
  t: (id) => id,
})

const STORAGE_KEY = 'nusa_harvest_lang'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('id')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'id') setLang(stored)
  }, [])

  const toggle = useCallback(() => {
    setLang(prev => {
      const next: Language = prev === 'id' ? 'en' : 'id'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  const t = useCallback((id: string, en: string) => (lang === 'en' ? en : id), [lang])

  return (
    <LanguageContext.Provider value={{ lang, toggle, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
