'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import { SettingsBadge } from '@/components/settings/SettingsBadge'
import { SettingsIcons } from '@/components/settings/SettingsIcons'
import type { TranslationKey } from '@/lib/i18n/translations'

// ── Tile data ──────────────────────────────────────────────────────────────────
// subtitles keyed by lang; 'en' is used as fallback for unsupported langs
type Subtitles = { en: string; ku: string; ar: string }
type IconKey   = keyof typeof SettingsIcons

interface TileItem {
  id:         string
  labelKey:   TranslationKey
  icon:       IconKey
  href:       string
  span?:      2
  subtitles:  Subtitles
}

interface Section {
  groupKey: TranslationKey
  items:    TileItem[]
}

const SECTIONS: Section[] = [
  {
    groupKey: 'sg_general',
    items: [
      { id: 'restaurant_info', labelKey: 'si_restaurant_info', icon: 'home',    href: '/dashboard/settings/restaurant-info',
        subtitles: { en: 'Name, logo, contact',         ku: 'ناو، لۆگۆ، پەیوەندی',          ar: 'الاسم والشعار والتواصل' } },
      { id: 'preference',      labelKey: 'si_preference',      icon: 'sliders', href: '/dashboard/settings/preference',
        subtitles: { en: 'Theme, language, regional',   ku: 'ڕووکار، زمان',                  ar: 'المظهر واللغة' } },
      { id: 'device',          labelKey: 'si_device',          icon: 'monitor', href: '/dashboard/settings/device',
        subtitles: { en: 'Terminal & display setup',    ku: 'ئامادەکاری تێرمیناڵ',           ar: 'إعداد الطرفية والشاشة' } },
    ],
  },
  {
    groupKey: 'sg_operations',
    items: [
      { id: 'menu',        labelKey: 'si_menu',        icon: 'utensils', href: '/dashboard/settings/menu',
        subtitles: { en: 'Categories, items, modifiers', ku: 'پۆلەکان و خواردنەکان',       ar: 'الأقسام والعناصر' } },
      { id: 'dine_in',     labelKey: 'si_dine_in',     icon: 'coffee',   href: '/dashboard/settings/dine-in',
        subtitles: { en: 'Tables & service flow',       ku: 'مێزەکان و خزمەت',             ar: 'الطاولات وتدفق الخدمة' } },
      { id: 'delivery',    labelKey: 'si_delivery',    icon: 'truck',    href: '/dashboard/settings/delivery',
        subtitles: { en: 'Zones, drivers, fees',        ku: 'ناوچەکان و کرێ',               ar: 'المناطق والرسوم' } },
      { id: 'takeout',     labelKey: 'si_takeout',     icon: 'bag',      href: '/dashboard/settings/takeout',
        subtitles: { en: 'Pickup workflow',             ku: 'ڕێبازی هەڵگرتن',               ar: 'سير عمل الاستلام' } },
      { id: 'coffee_bar',  labelKey: 'si_coffee_bar',  icon: 'wine',     href: '/dashboard/settings/bar',
        subtitles: { en: 'Drinks station rules',        ku: 'ڕێسای شوێنی قاوە',             ar: 'قواعد محطة المشروبات' } },
      { id: 'reservation', labelKey: 'si_reservation', icon: 'cal',      href: '/dashboard/settings/reservation',
        subtitles: { en: 'Booking calendar',            ku: 'ڕۆژژمێری جێگیرکردن',            ar: 'تقويم الحجز' } },
      { id: 'kds',         labelKey: 'si_kds_monitor', icon: 'pulse',    href: '/dashboard/settings/kds-monitor',
        subtitles: { en: 'Kitchen display screens',     ku: 'شاشەکانی چێشتخانە',            ar: 'شاشات المطبخ' } },
      { id: 'inventory',   labelKey: 'si_inventory',   icon: 'box',      href: '/dashboard/settings/inventory', span: 2,
        subtitles: { en: 'Stock & ingredients',         ku: 'کاڵا و پێکهاتەکان',             ar: 'المخزون والمكونات' } },
    ],
  },
  {
    groupKey: 'sg_finance',
    items: [
      { id: 'finance',    labelKey: 'si_finance',    icon: 'bars',    href: '/dashboard/settings/finance',
        subtitles: { en: 'Tax, currency, ledgers',     ku: 'باج، دراو، دەفتەر',              ar: 'الضرائب والعملات' } },
      { id: 'expense',    labelKey: 'si_expense',    icon: 'dollar',  href: '/dashboard/settings/expense',
        subtitles: { en: 'Operational costs',          ku: 'تێچوونی کارکردن',               ar: 'التكاليف التشغيلية' } },
      { id: 'pay_later',  labelKey: 'si_pay_later',  icon: 'card',    href: '/dashboard/settings/pay-later',
        subtitles: { en: 'Customer credit & tabs',     ku: 'قەرز و حسابی کڕیار',            ar: 'ائتمان العملاء' } },
      { id: 'receipt',    labelKey: 'si_receipt',    icon: 'receipt', href: '/dashboard/settings/receipt',
        subtitles: { en: 'Layout, footer, printers',   ku: 'ڕێکخستن و چاپکردن',            ar: 'التخطيط والطابعات' } },
      { id: 'void_items', labelKey: 'si_void_items', icon: 'ban',     href: '/dashboard/settings/void-items',
        subtitles: { en: 'Authorization & reasons',    ku: 'ڕێگەپێدان و هۆکار',             ar: 'الصلاحيات والأسباب' } },
    ],
  },
  {
    groupKey: 'sg_people',
    items: [
      { id: 'users',    labelKey: 'si_users',    icon: 'users', href: '/dashboard/settings/users',
        subtitles: { en: 'Staff accounts & PINs',   ku: 'حساب و وشەنهێنی',               ar: 'الحسابات وأرقام PIN' } },
      { id: 'member',   labelKey: 'si_member',   icon: 'star',  href: '/dashboard/settings/member',
        subtitles: { en: 'Loyalty program',         ku: 'پڕۆگرامی دڵسۆزی',               ar: 'برنامج الولاء' } },
      { id: 'customer', labelKey: 'si_customer', icon: 'user',  href: '/dashboard/settings/customer',
        subtitles: { en: 'Customer database',       ku: 'داتابەیسی کڕیار',               ar: 'قاعدة بيانات العملاء' } },
    ],
  },
  {
    groupKey: 'sg_system',
    items: [
      { id: 'advanced', labelKey: 'si_advanced', icon: 'cog', href: '/dashboard/settings/advanced', span: 2,
        subtitles: { en: 'Power-user tools',    ku: 'ئامرازی پسپۆڕان',      ar: 'أدوات متقدمة' } },
      { id: 'database', labelKey: 'si_database', icon: 'db',  href: '/dashboard/settings/database', span: 2,
        subtitles: { en: 'Backups & sync',      ku: 'پاشەکەوت و هاودەنگی',  ar: 'النسخ الاحتياطي' } },
    ],
  },
  {
    groupKey: 'sg_marketing',
    items: [
      { id: 'whatsapp', labelKey: 'si_whatsapp', icon: 'whatsapp', href: '/dashboard/settings/whatsapp',
        subtitles: { en: 'Order notifications', ku: 'ئاگادارکردنەوەی داوا', ar: 'إشعارات الطلبات' } },
    ],
  },
]

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
  onClick: () => void
}

function Tile({ item, label, sub, onClick }: TileProps) {
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

      <SettingsBadge
        icon={SettingsIcons[item.icon]}
        size={item.span === 2 ? 56 : 48}
      />
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

  return (
    <div className="relative min-h-full">
      <Backdrop />

      <div className="relative z-10 px-5 md:px-10 py-8 max-w-[1400px] mx-auto">

        {/* Header */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">{t.nav_settings}</h1>
          <p className="text-sm text-white/45 mt-1.5 max-w-lg mx-auto">{t.sh_subtitle}</p>
        </motion.div>

        {/* Search */}
        <motion.div
          className="flex justify-center mb-10"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.06, ease: 'easeOut' }}
        >
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 w-full max-w-md focus-within:border-amber-500/40 transition-colors">
            <Search className="w-4 h-4 text-white/40 shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t.sh_search}
              className="bg-transparent flex-1 outline-none text-sm text-white placeholder-white/30"
            />
          </div>
        </motion.div>

        {/* Section grid */}
        <div className="space-y-10">
          {SECTIONS.map((section, si) => {
            const visibleItems = section.items.filter(item => {
              if (!q) return true
              const label = t[item.labelKey] || ''
              const sub   = item.subtitles[lang as keyof Subtitles] ?? item.subtitles.en
              return label.toLowerCase().includes(q) || sub.toLowerCase().includes(q)
            })
            if (!visibleItems.length) return null
            return (
              <motion.section
                key={section.groupKey}
                className="mx-auto"
                style={{ maxWidth: 1200 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.1 + si * 0.04, ease: 'easeOut' }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45 text-center mb-4">
                  {t[section.groupKey]}
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  {visibleItems.map(item => (
                    <Tile
                      key={item.id}
                      item={item}
                      label={t[item.labelKey] || item.id}
                      sub={item.subtitles[lang as keyof Subtitles] ?? item.subtitles.en}
                      onClick={() => router.push(item.href)}
                    />
                  ))}
                </div>
              </motion.section>
            )
          })}
        </div>

        <p className="mt-16 mb-4 text-center text-[11px] tracking-wider text-white/25">
          ClickGroup POS · Multi-tenant Restaurant Management Platform
        </p>
      </div>
    </div>
  )
}
