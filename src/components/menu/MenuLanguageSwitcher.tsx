'use client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Lang } from '@/lib/i18n/translations'

// Kurdish leads — it is the default language for the public menus.
const LANG_ORDER: Lang[] = ['ku', 'ar', 'en']

/**
 * Inline segmented language picker for the public guest / delivery menus.
 * Kurdish is the app-wide default (see LanguageProvider); this lets the
 * customer switch to Arabic or English. Choice persists in localStorage
 * and flips text direction / font app-wide.
 *
 * The active pill uses the menu's `accent` colour; adapts to light / dark
 * templates via the `isDark` prop.
 */
export default function MenuLanguageSwitcher({
  isDark = false,
  accent = '#f59e0b',
}: { isDark?: boolean; accent?: string }) {
  const { lang, setLang, langMeta } = useLanguage()

  const containerBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
  const idleText    = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)'

  return (
    <div
      className="mt-3 inline-flex items-center gap-1 rounded-full p-1"
      style={{ background: containerBg }}
    >
      {LANG_ORDER.map(code => {
        const active = lang === code
        return (
          <button
            key={code}
            onClick={() => setLang(code)}
            aria-pressed={active}
            className="px-3.5 py-1.5 rounded-full text-[13px] font-bold transition-all active:scale-95"
            style={{
              background: active ? accent : 'transparent',
              color: active ? '#ffffff' : idleText,
              boxShadow: active ? `0 2px 8px ${accent}66` : undefined,
            }}
          >
            {langMeta[code].nativeLabel}
          </button>
        )
      })}
    </div>
  )
}
