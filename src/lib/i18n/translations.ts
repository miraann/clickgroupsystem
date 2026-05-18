import en from './en'
import ku from './ku'
import ar from './ar'

export type Lang = 'en' | 'ku' | 'ar'

export const RTL_LANGS: Lang[] = ['ku', 'ar']

export const LANG_META: Record<Lang, { label: string; nativeLabel: string; flag: string }> = {
  en: { label: 'English',  nativeLabel: 'English',  flag: '🇬🇧' },
  ku: { label: 'Kurdish',  nativeLabel: 'کوردی',    flag: '🏔️' },
  ar: { label: 'Arabic',   nativeLabel: 'العربية',  flag: '🇸🇦' },
}

const translations = { en, ku, ar } as const

export type TranslationKey = keyof typeof en
export type Translations = typeof en

export function getTranslations(lang: Lang): Translations {
  return translations[lang] as Translations
}
