'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { motion, type Variants } from 'framer-motion'
import { Smartphone, Download, AlertCircle, ExternalLink } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  ANDROID_APPS, APK_RELEASE_TAG, fetchAndroidManifest, type AndroidManifest,
} from '@/lib/appUpdate'

// ── Animation ────────────────────────────────────────────────────
const CONTAINER: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
}
const ITEM: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'circOut' as const } },
}

const RELEASE_URL = `https://github.com/miraann/clickgroupsystem/releases/tag/${APK_RELEASE_TAG}`

export default function AppsPage() {
  const { t } = useLanguage()
  const [manifest, setManifest] = useState<AndroidManifest | null>(null)

  // Best-effort: pull the published android-latest.json for live version labels.
  useEffect(() => { fetchAndroidManifest().then(setManifest) }, [])

  return (
    <motion.div variants={CONTAINER} initial="hidden" animate="show" className="max-w-2xl space-y-6 pb-10">

      {/* Header */}
      <motion.div variants={ITEM} className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{t.apk_title}</h1>
          <p className="text-sm text-white/40 mt-1">{t.apk_subtitle}</p>
        </div>
      </motion.div>

      <motion.div variants={ITEM} className="h-px bg-white/8" />

      {/* Install note */}
      <motion.div variants={ITEM}>
        <div className="flex items-start gap-2 p-3 rounded-xl bg-sky-500/8 border border-sky-500/15">
          <AlertCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <p className="text-xs text-sky-400/80 leading-relaxed">{t.apk_install_note}</p>
        </div>
      </motion.div>

      {/* App list */}
      <motion.div variants={ITEM} className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden divide-y divide-white/8">
        {ANDROID_APPS.map(app => {
          const entry = manifest?.flavors?.[app.pkg]
          return (
            <div key={app.id} className="flex items-center gap-4 px-4 py-4 sm:px-5">
              <Image
                src={app.icon}
                alt=""
                width={48}
                height={48}
                className="w-12 h-12 rounded-xl shrink-0 bg-white/5 border border-white/10"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white leading-tight">{t[app.nameKey]}</p>
                  {entry?.versionName && (
                    <span className="text-[10px] font-medium text-white/45 bg-white/8 border border-white/10 px-1.5 py-0.5 rounded-md">
                      {t.apk_version.replace('{v}', entry.versionName)}
                    </span>
                  )}
                </div>
                {app.descKey && (
                  <p className="text-xs text-white/45 mt-0.5 leading-snug">{t[app.descKey]}</p>
                )}
                <p className="text-[11px] font-mono text-white/25 mt-1 truncate">{app.pkg}</p>
              </div>

              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-sm font-medium hover:bg-emerald-500/25 transition-all shrink-0"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">{t.apk_download}</span>
              </a>
            </div>
          )
        })}
      </motion.div>

      {/* Release link */}
      <motion.div variants={ITEM} className="flex items-center justify-between text-xs text-white/30 px-1">
        <span>{t.apk_latest_release}</span>
        <a
          href={RELEASE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-white/45 hover:text-white/70 transition-colors"
        >
          {APK_RELEASE_TAG}
          <ExternalLink className="w-3 h-3" />
        </a>
      </motion.div>

    </motion.div>
  )
}
