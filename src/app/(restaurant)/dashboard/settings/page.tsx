'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Palette, Check } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import {
  SettingsBadge, SETTINGS_ICON_STYLES, toIconStyle, type SettingsIconStyle,
} from '@/components/settings/SettingsBadge'
import { SettingsIcons, SettingsIconMeta } from '@/components/settings/SettingsIcons'
import type { TranslationKey } from '@/lib/i18n/translations'
import { usePermissions } from '@/lib/permissions/PermissionsContext'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'

// ── Tile data ──────────────────────────────────────────────────────────────────
// subtitles keyed by lang; 'en' is used as fallback for unsupported langs
type Subtitles = { en: string; ku: string; ar: string }
type IconKey   = keyof typeof SettingsIcons

// permKey/ownerOnly mirror settings/layout.tsx's NAV_GROUPS — kept in sync so
// a tile is only shown when the page behind it is actually reachable.
interface TileItem {
  id:         string
  labelKey:   TranslationKey
  icon:       IconKey
  href:       string
  span?:      2
  subtitles:  Subtitles
  permKey?:   string
  ownerOnly?: boolean
}

interface Section {
  groupKey: TranslationKey
  items:    TileItem[]
}

const SECTIONS: Section[] = [
  {
    groupKey: 'sg_general',
    items: [
      { id: 'restaurant_info', labelKey: 'si_restaurant_info', icon: 'home',    href: '/dashboard/settings/restaurant-info', permKey: 'settings.restaurant_info',
        subtitles: { en: 'Name, logo, contact',         ku: 'ناو، لۆگۆ، پەیوەندی',          ar: 'الاسم والشعار والتواصل' } },
      { id: 'appearance',       labelKey: 'si_appearance',       icon: 'palette', href: '/dashboard/settings/appearance', permKey: 'settings.appearance',
        subtitles: { en: 'Colors, style & table shapes',  ku: 'ڕەنگ، شێواز و مێز',             ar: 'الألوان والنمط وشكل الطاولات' } },
      { id: 'preference',      labelKey: 'si_preference',      icon: 'sliders', href: '/dashboard/settings/preference', permKey: 'settings.preference',
        subtitles: { en: 'Theme, language, regional',   ku: 'ڕووکار، زمان',                  ar: 'المظهر واللغة' } },
      { id: 'device',          labelKey: 'si_device',          icon: 'monitor', href: '/dashboard/settings/device', permKey: 'settings.device',
        subtitles: { en: 'Terminal & display setup',    ku: 'ئامادەکاری تێرمیناڵ',           ar: 'إعداد الطرفية والشاشة' } },
    ],
  },
  {
    groupKey: 'sg_operations',
    items: [
      { id: 'menu',        labelKey: 'si_menu',        icon: 'utensils', href: '/dashboard/settings/menu', permKey: 'menu',
        subtitles: { en: 'Categories, items, modifiers', ku: 'پۆلەکان و خواردنەکان',       ar: 'الأقسام والعناصر' } },
      { id: 'dine_in',     labelKey: 'si_dine_in',     icon: 'coffee',   href: '/dashboard/settings/dine-in', permKey: 'settings.dine_in',
        subtitles: { en: 'Tables & service flow',       ku: 'مێزەکان و خزمەت',             ar: 'الطاولات وتدفق الخدمة' } },
      { id: 'delivery',    labelKey: 'si_delivery',    icon: 'truck',    href: '/dashboard/settings/delivery', permKey: 'settings.delivery',
        subtitles: { en: 'Zones, drivers, fees',        ku: 'ناوچەکان و کرێ',               ar: 'المناطق والرسوم' } },
      { id: 'takeout',     labelKey: 'si_takeout',     icon: 'bag',      href: '/dashboard/settings/takeout', permKey: 'settings.takeout',
        subtitles: { en: 'Pickup workflow',             ku: 'ڕێبازی هەڵگرتن',               ar: 'سير عمل الاستلام' } },
      { id: 'coffee_bar',  labelKey: 'si_coffee_bar',  icon: 'wine',     href: '/dashboard/settings/bar', permKey: 'settings.bar',
        subtitles: { en: 'Drinks station rules',        ku: 'ڕێسای شوێنی قاوە',             ar: 'قواعد محطة المشروبات' } },
      { id: 'reservation', labelKey: 'si_reservation', icon: 'cal',      href: '/dashboard/settings/reservation', permKey: 'settings.reservation',
        subtitles: { en: 'Booking calendar',            ku: 'ڕۆژژمێری جێگیرکردن',            ar: 'تقويم الحجز' } },
      { id: 'kds',         labelKey: 'si_kds_monitor', icon: 'pulse',    href: '/dashboard/settings/kds-monitor', permKey: 'settings.kds_monitor',
        subtitles: { en: 'Kitchen display screens',     ku: 'شاشەکانی چێشتخانە',            ar: 'شاشات المطبخ' } },
      { id: 'inventory',   labelKey: 'si_inventory',   icon: 'box',      href: '/dashboard/settings/inventory', span: 2, permKey: 'settings.inventory',
        subtitles: { en: 'Stock & ingredients',         ku: 'کاڵا و پێکهاتەکان',             ar: 'المخزون والمكونات' } },
    ],
  },
  {
    groupKey: 'sg_finance',
    items: [
      { id: 'finance',    labelKey: 'si_finance',    icon: 'bars',    href: '/dashboard/settings/finance', permKey: 'finance.report',
        subtitles: { en: 'Tax, currency, ledgers',     ku: 'باج، دراو، دەفتەر',              ar: 'الضرائب والعملات' } },
      { id: 'expense',    labelKey: 'si_expense',    icon: 'dollar',  href: '/dashboard/settings/expense', permKey: 'finance.expense',
        subtitles: { en: 'Operational costs',          ku: 'تێچوونی کارکردن',               ar: 'التكاليف التشغيلية' } },
      { id: 'pay_later',  labelKey: 'si_pay_later',  icon: 'card',    href: '/dashboard/settings/pay-later', permKey: 'finance.pay_later',
        subtitles: { en: 'Customer credit & tabs',     ku: 'قەرز و حسابی کڕیار',            ar: 'ائتمان العملاء' } },
      { id: 'receipt',    labelKey: 'si_receipt',    icon: 'receipt', href: '/dashboard/settings/receipt', permKey: 'finance.receipt',
        subtitles: { en: 'Layout, footer, printers',   ku: 'ڕێکخستن و چاپکردن',            ar: 'التخطيط والطابعات' } },
      { id: 'void_items', labelKey: 'si_void_items', icon: 'ban',     href: '/dashboard/settings/void-items', permKey: 'settings.void_items',
        subtitles: { en: 'Authorization & reasons',    ku: 'ڕێگەپێدان و هۆکار',             ar: 'الصلاحيات والأسباب' } },
    ],
  },
  {
    groupKey: 'sg_people',
    items: [
      { id: 'users',    labelKey: 'si_users',    icon: 'users', href: '/dashboard/settings/users', permKey: 'settings.users',
        subtitles: { en: 'Staff accounts & PINs',   ku: 'حساب و وشەنهێنی',               ar: 'الحسابات وأرقام PIN' } },
      { id: 'member',   labelKey: 'si_member',   icon: 'star',  href: '/dashboard/settings/member', permKey: 'settings.member',
        subtitles: { en: 'Loyalty program',         ku: 'پڕۆگرامی دڵسۆزی',               ar: 'برنامج الولاء' } },
      { id: 'customer', labelKey: 'si_customer', icon: 'user',  href: '/dashboard/settings/customer', permKey: 'settings.customer',
        subtitles: { en: 'Customer database',       ku: 'داتابەیسی کڕیار',               ar: 'قاعدة بيانات العملاء' } },
    ],
  },
  {
    groupKey: 'sg_system',
    items: [
      { id: 'advanced',  labelKey: 'si_advanced',  icon: 'cog',   href: '/dashboard/settings/advanced',  span: 2, ownerOnly: true,
        subtitles: { en: 'Power-user tools',    ku: 'ئامرازی پسپۆڕان',      ar: 'أدوات متقدمة' } },
      { id: 'database',  labelKey: 'si_database',  icon: 'db',    href: '/dashboard/settings/database',  span: 2, ownerOnly: true,
        subtitles: { en: 'Backups & sync',      ku: 'پاشەکەوت و هاودەنگی',  ar: 'النسخ الاحتياطي' } },
      { id: 'audit_log', labelKey: 'si_audit_log', icon: 'audit', href: '/dashboard/settings/audit-log', span: 2, permKey: 'settings.audit_log',
        subtitles: { en: 'Staff activity trail', ku: 'چاودێری چالاکی ستاف',  ar: 'سجل نشاط الموظفين' } },
      { id: 'apps', labelKey: 'si_apps', icon: 'android', href: '/dashboard/settings/apps', span: 2, ownerOnly: true,
        subtitles: { en: 'Download Android apps', ku: 'داگرتنی ئەپەکانی ئەندرۆید', ar: 'تنزيل تطبيقات أندرويد' } },
    ],
  },
  {
    groupKey: 'sg_marketing',
    items: [
      { id: 'whatsapp', labelKey: 'si_whatsapp', icon: 'whatsapp', href: '/dashboard/settings/whatsapp', permKey: 'settings.whatsapp',
        subtitles: { en: 'Order notifications', ku: 'ئاگادارکردنەوەی داوا', ar: 'إشعارات الطلبات' } },
    ],
  },
]

// ── Icon style ─────────────────────────────────────────────────────────────────
// Saved on the restaurant (settings.settings_icon_style) so every device shows
// the same look; changing it needs the Appearance permission.
const ICON_STYLE_DEFAULTS: { settings_icon_style: SettingsIconStyle } = { settings_icon_style: 'orb' }
const PREVIEW_ICONS: IconKey[] = ['utensils', 'truck', 'bars']

function Badge({ icon, variant, size }: { icon: IconKey; variant: SettingsIconStyle; size: number }) {
  const meta = SettingsIconMeta[icon]
  return (
    <SettingsBadge
      icon={SettingsIcons[icon]}
      lineIcon={meta?.line}
      accent={meta?.accent}
      variant={variant}
      size={size}
    />
  )
}

// ── Orb backdrop ───────────────────────────────────────────────────────────────
function Backdrop() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <motion.div
        className="absolute rounded-full"
        style={{ top: '-10%', left: '-5%', width: 520, height: 520,
          background: 'rgba(56,89,180,0.40)', filter: 'blur(80px)' }}
        animate={{ opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ bottom: '-15%', right: '-10%', width: 620, height: 620,
          background: 'rgba(99,102,241,0.30)', filter: 'blur(80px)' }}
        animate={{ opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ top: '40%', left: '40%', width: 480, height: 480,
          background: 'rgba(217,119,6,0.18)', filter: 'blur(80px)' }}
        animate={{ opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.5,
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
      />
    </div>
  )
}

// ── Tile ───────────────────────────────────────────────────────────────────────
interface TileProps {
  item:    TileItem
  label:   string
  sub:     string
  variant: SettingsIconStyle
  onClick: () => void
}

function Tile({ item, label, sub, variant, onClick }: TileProps) {
  const tileWidth = item.span === 2 ? 372 : 180

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn(
        'group relative text-left rounded-2xl p-4 border backdrop-blur-xl',
        'flex flex-col items-center justify-center gap-3 min-h-[130px]',
        'bg-white/[0.035] border-white/10',
        'hover:bg-white/[0.06] hover:border-white/18',
        'overflow-hidden',
      )}
      style={{ width: tileWidth, maxWidth: '100%' }}
    >
      {/* Sheen overlay */}
      <span className="absolute inset-0 pointer-events-none bg-[radial-gradient(140%_90%_at_50%_-10%,rgba(255,255,255,0.05),transparent_60%)]" />

      <Badge icon={item.icon} variant={variant} size={item.span === 2 ? 84 : 72} />
      <div className="relative text-center px-1">
        <div className="text-[13px] font-semibold text-white leading-tight">{label}</div>
        <div className="text-[11px] text-white/40 mt-0.5 leading-tight line-clamp-2">{sub}</div>
      </div>
    </motion.button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SettingsHomePage() {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const { isOwner, canAny, loading: permsLoading } = usePermissions()
  const { settings: iconCfg, autoSave } = useRestaurantSettings(ICON_STYLE_DEFAULTS, 'settings.appearance')
  const iconStyle = toIconStyle(iconCfg.settings_icon_style)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Wait for permissions to resolve before deciding what to show — otherwise
  // a staff member briefly sees (and can click into) tiles their role can't
  // actually open.
  if (permsLoading) return null
  const canEditStyle = isOwner || canAny('settings.appearance')

  return (
    <div className="relative min-h-full">
      <Backdrop />

      <div className="relative z-10 px-5 md:px-10 py-8 max-w-[1400px] mx-auto">

        {/* Search + icon-style toggle */}
        <motion.div
          className="flex justify-center mb-10"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="flex gap-2 w-full max-w-lg">
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 flex-1 min-w-0 focus-within:border-amber-500/40 transition-colors">
              <Search className="w-4 h-4 text-white/40 shrink-0" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t.sh_search}
                className="bg-transparent flex-1 min-w-0 outline-none text-sm text-white placeholder-white/30"
              />
            </div>
            {canEditStyle && (
              <button
                onClick={() => setPickerOpen(o => !o)}
                aria-expanded={pickerOpen}
                title={t.sh_icon_style}
                className={cn(
                  'flex items-center gap-2 px-3.5 rounded-xl border text-sm font-medium shrink-0 transition-colors active:scale-95',
                  pickerOpen
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10',
                )}
              >
                <Palette className="w-4 h-4" />
                <span className="hidden sm:inline">{t.sh_icon_style}</span>
              </button>
            )}
          </div>
        </motion.div>

        {/* Icon-style picker — applies instantly and saves to the restaurant */}
        <AnimatePresence initial={false}>
          {pickerOpen && canEditStyle && (
            <motion.div
              key="icon-style-picker"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="mx-auto max-w-3xl mb-10 rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-4">
                <p className="text-xs text-white/45 text-center mb-4">{t.sh_icon_style_d}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {SETTINGS_ICON_STYLES.map(style => {
                    const active = style === iconStyle
                    return (
                      <button
                        key={style}
                        onClick={() => { if (!active) autoSave({ settings_icon_style: style }) }}
                        className={cn(
                          'relative flex flex-col items-center gap-3 pt-5 pb-3 px-2 rounded-xl border transition-all active:scale-[0.97]',
                          active ? 'border-amber-500/50 bg-amber-500/10' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.07]',
                        )}
                      >
                        <div className="flex items-center justify-center gap-2.5 h-10">
                          {PREVIEW_ICONS.map(k => <Badge key={k} icon={k} variant={style} size={34} />)}
                        </div>
                        <span className={cn('text-xs font-semibold', active ? 'text-amber-300' : 'text-white/70')}>
                          {t[`sh_icon_${style}` as TranslationKey]}
                        </span>
                        {active && (
                          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Section grid — flat tile counter for top-to-bottom stagger */}
        {(() => {
          let tileIdx = 0
          return (
            <div className="space-y-10">
              {SECTIONS.map((section, si) => {
                const visibleItems = section.items.filter(item => {
                  if (!isOwner && (item.ownerOnly || (item.permKey && !canAny(item.permKey)))) return false
                  if (!q) return true
                  const label = t[item.labelKey] || ''
                  const sub   = item.subtitles[lang as keyof Subtitles] ?? item.subtitles.en
                  return label.toLowerCase().includes(q) || sub.toLowerCase().includes(q)
                })
                if (!visibleItems.length) return null
                return (
                  <section key={section.groupKey} className="mx-auto" style={{ maxWidth: 1200 }}>
                    <motion.p
                      className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45 text-center mb-4"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut', delay: 0.02 + si * 0.02 }}
                    >
                      {t[section.groupKey]}
                    </motion.p>
                    <div className="flex flex-wrap gap-3 justify-center">
                      {visibleItems.map(item => {
                        const delay = 0.04 + tileIdx++ * 0.012
                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18, ease: 'easeOut', delay }}
                          >
                            <Tile
                              item={item}
                              label={t[item.labelKey] || item.id}
                              sub={item.subtitles[lang as keyof Subtitles] ?? item.subtitles.en}
                              variant={iconStyle}
                              onClick={() => router.push(item.href)}
                            />
                          </motion.div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )
        })()}

        <p className="mt-16 mb-4 text-center text-[11px] tracking-wider text-white/25">
          ClickGroup POS · Multi-tenant Restaurant Management Platform
        </p>
      </div>
    </div>
  )
}
