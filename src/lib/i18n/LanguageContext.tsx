'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  Lang, RTL_LANGS, Translations, TranslationKey,
  getTranslations, LANG_META,
} from './translations'

const LS_KEY = 'user_language'

interface LanguageContextValue {
  lang:     Lang
  t:        Translations
  setLang:  (l: Lang) => void
  isRTL:    boolean
  langMeta: typeof LANG_META
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  // Load from localStorage on mount (client only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY) as Lang | null
      if (stored && ['en', 'ku', 'ar'].includes(stored)) {
        setLangState(stored)
      }
    } catch { /* ignore */ }
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(LS_KEY, l) } catch { /* ignore */ }
  }, [])

  const isRTL = RTL_LANGS.includes(lang)
  const t     = getTranslations(lang)

  return (
    <LanguageContext.Provider value={{ lang, t, setLang, isRTL, langMeta: LANG_META }}>
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        style={lang === 'ku' ? { fontFamily: "'KurdishFont', 'Segoe UI', sans-serif" } : undefined}
      >
        {children}
      </div>
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>')
  return ctx
}

/** Convenience hook — returns just the translation function */
export function useT() {
  const { t } = useLanguage()
  return (key: TranslationKey) => t[key]
}
