'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { Store, Camera, Mail, Phone, MapPin, Globe, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/logAudit'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SaveButton } from '@/components/ui/SaveButton'
import type { SaveState } from '@/hooks/useRestaurantSettings'

// ── Social icons ────────────────────────────────────────────
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  )
}
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
    </svg>
  )
}
function TwitterXIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}
function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.6C5.12 20.06 12 20.06 12 20.06s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/>
    </svg>
  )
}
function SnapchatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.166 3C9.492 3 7.13 4.41 6.02 6.604l-.042.092c-.168.38-.261.794-.261 1.23v.351c0 .06-.003.12-.008.18a3.52 3.52 0 01-.454.07c-.213.02-.435.03-.659.03-.176 0-.35-.006-.516-.02l-.098-.008a.62.62 0 00-.65.588.614.614 0 00.513.612c.028.005.748.147 1.747.277.082.01.15.066.175.144.268.847.82 1.578 1.56 2.079-.07.04-.14.082-.21.127-.49.31-1.245.787-1.245 1.597 0 .657.503 1.17 1.151 1.17.194 0 .396-.046.607-.138.481-.21 1.04-.455 1.636-.455.124 0 .248.01.37.032-.085.31-.13.64-.13.98 0 1.84 1.265 3.333 2.82 3.333 1.553 0 2.818-1.494 2.818-3.334 0-.338-.045-.667-.129-.977.123-.02.247-.032.371-.032.596 0 1.155.246 1.636.456.211.092.413.138.607.138.648 0 1.151-.514 1.151-1.17 0-.81-.754-1.287-1.245-1.598a3.48 3.48 0 00-.21-.127c.74-.5 1.292-1.232 1.56-2.079a.194.194 0 01.175-.144c.999-.13 1.719-.272 1.747-.277a.614.614 0 00.513-.612.62.62 0 00-.648-.588l-.1.008c-.165.014-.34.02-.515.02-.224 0-.446-.01-.659-.03a3.528 3.528 0 01-.454-.07 1.765 1.765 0 00-.008-.18v-.35c0-.437-.093-.851-.261-1.231L17.98 6.604C16.87 4.41 14.508 3 11.834 3h.332z" />
    </svg>
  )
}
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.84a8.23 8.23 0 004.83 1.55V6.93a4.85 4.85 0 01-1.06-.24z" />
    </svg>
  )
}

// ── Animation variants ───────────────────────────────────────
const PAGE: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'circOut' as const } },
}
const FIELDS: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.28 } },
}
const FIELD_ITEM: Variants = {
  hidden: { opacity: 0, y: -10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'circOut' as const } },
}

// ── Skeleton helpers ─────────────────────────────────────────
function Skel({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-white/8', className)} />
}
function SkeletonField() {
  return (
    <div className="space-y-1.5">
      <Skel className="h-3.5 w-28 rounded-md" />
      <Skel className="h-11 w-full" />
    </div>
  )
}
function FadeSwitch({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

// ── Types ────────────────────────────────────────────────────
interface FormData {
  name: string; email: string; phone: string; phone2: string
  location: string; website: string; instagram: string
  facebook: string; twitter: string; whatsapp: string
  tiktok: string; youtube: string; snapchat: string; maps_url: string
}

const EMPTY_FORM: FormData = {
  name: '', email: '', phone: '', phone2: '', location: '',
  website: '', instagram: '', facebook: '', twitter: '',
  whatsapp: '', tiktok: '', youtube: '', snapchat: '', maps_url: '',
}

// ── Page ─────────────────────────────────────────────────────
export default function RestaurantInfoPage() {
  const supabase = createClient()
  const { t } = useLanguage()
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Load restaurant ──────────────────────────────────────
  const loadRestaurant = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', typeof window !== 'undefined' ? (localStorage.getItem('restaurant_id') ?? '') : '')
      .maybeSingle()

    if (error) {
      setLoadError(`Supabase error: ${error.code} — ${error.message}`)
      setLoading(false)
      return
    }
    if (!data) {
      setLoadError('No restaurant found. The seed insert in supabase-dev-policy.sql may not have run. Check the SQL editor for errors.')
      setLoading(false)
      return
    }

    const s = (data.settings as Record<string, string>) ?? {}
    setRestaurantId(data.id)
    setForm({
      name:      data.name        ?? '',
      email:     data.email       ?? '',
      phone:     data.phone       ?? '',
      phone2:    s.phone2         ?? '',
      location:  data.address     ?? '',
      website:   s.website        ?? '',
      instagram: s.instagram      ?? '',
      facebook:  s.facebook       ?? '',
      twitter:   s.twitter        ?? '',
      whatsapp:  s.whatsapp       ?? '',
      tiktok:    s.tiktok         ?? '',
      youtube:   s.youtube        ?? '',
      snapchat:  s.snapchat       ?? '',
      maps_url:  s.maps_url       ?? '',
    })
    if (data.logo_url) setLogoPreview(data.logo_url)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadRestaurant() }, [loadRestaurant])

  // ── Logo file pick ───────────────────────────────────────
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  // ── Save ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!restaurantId) return
    setSaveState('saving')

    let logo_url: string | undefined

    // Upload logo if a new file was selected
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `${restaurantId}/logo.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type })

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('logos').getPublicUrl(path)
        logo_url = urlData.publicUrl
      }
    }

    const { error } = await supabase
      .from('restaurants')
      .update({
        name:     form.name,
        email:    form.email,
        phone:    form.phone,
        address:  form.location,
        ...(logo_url ? { logo_url } : {}),
        settings: {
          phone2:    form.phone2,
          website:   form.website,
          instagram: form.instagram,
          facebook:  form.facebook,
          twitter:   form.twitter,
          whatsapp:  form.whatsapp,
          tiktok:    form.tiktok,
          youtube:   form.youtube,
          snapchat:  form.snapchat,
          maps_url:  form.maps_url,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', restaurantId)

    if (error) {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    } else {
      logAudit(restaurantId, 'update_settings', { entity: 'restaurant_info', name: form.name })
      setLogoFile(null)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    }
  }

  const set = (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))

  const logoInitials = form.name
    ? form.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '??'

  // ── Load error ───────────────────────────────────────────
  if (loadError) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-start gap-3 p-5 rounded-2xl bg-rose-500/10 border border-rose-500/25">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-rose-400 mb-1">Database error</p>
            <p className="text-xs text-white/60 font-mono bg-white/5 px-2 py-1.5 rounded-lg mt-1">{loadError}</p>
            <p className="text-xs text-white/35 mt-2">
              Check your Supabase project → <strong className="text-white/50">Table Editor</strong> → confirm <code className="px-1 rounded bg-white/8 text-amber-400 font-mono">restaurants</code> table exists and has a row.
            </p>
            <button onClick={loadRestaurant} className="mt-3 px-3 py-1.5 rounded-lg bg-white/8 text-xs text-white/60 hover:bg-white/12 transition-all active:scale-95">
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────
  return (
    <motion.div
      className="space-y-6 pb-10"
      variants={PAGE}
      initial="hidden"
      animate="show"
    >

      {/* Header — shell is instant, only save button crossfades */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <Store className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{t.ri_title}</h1>
            <p className="text-xs text-white/35 mt-0.5">{t.changes_saved_to_db}</p>
          </div>
        </div>
        <FadeSwitch id={loading ? 'skel-btn' : 'real-btn'}>
          {loading
            ? <Skel className="h-10 w-32 rounded-xl" />
            : <SaveButton state={saveState} onClick={handleSave} />}
        </FadeSwitch>
      </div>

      {/* Logo — card background is instant, content crossfades */}
      <Section title={t.ri_logo}>
        <FadeSwitch id={loading ? 'skel-logo' : 'real-logo'}>
          {loading ? (
            <div className="flex items-center gap-5">
              <Skel className="w-24 h-24 rounded-2xl shrink-0" />
              <div className="space-y-2 flex-1">
                <Skel className="h-4 w-32" />
                <Skel className="h-3 w-48" />
                <Skel className="h-8 w-24 mt-1" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <div className="w-24 h-24 rounded-2xl border-2 border-white/15 bg-gradient-to-br from-amber-400/20 to-orange-500/10 flex items-center justify-center text-3xl font-bold text-white overflow-hidden">
                  {logoPreview
                    ? <img src={logoPreview} alt="logo" className="w-full h-full object-cover" />
                    : <span>{logoInitials}</span>}
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-600 border-2 border-[#022658] flex items-center justify-center transition-all active:scale-95 shadow-lg"
                >
                  <Camera className="w-3.5 h-3.5 text-white" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/70">{t.ri_logo_label}</p>
                <p className="text-xs text-white/30">{t.ri_logo_hint}</p>
                {logoFile && <p className="text-xs text-amber-400">{t.ri_logo_new}</p>}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/50 hover:bg-white/10 hover:text-white/70 transition-all active:scale-95"
                >
                  {t.upload_photo}
                </button>
              </div>
            </div>
          )}
        </FadeSwitch>
      </Section>

      {/* Basic Info */}
      <Section title={t.ri_basic_info}>
        <FadeSwitch id={loading ? 'skel-basic' : 'real-basic'}>
          {loading ? (
            <div className="space-y-4">
              {[0, 1, 2].map(i => <SkeletonField key={i} />)}
            </div>
          ) : (
            <motion.div className="space-y-4" variants={FIELDS} initial="hidden" animate="show">
              <motion.div variants={FIELD_ITEM}>
                <Field label={t.ri_name} required>
                  <Input icon={<Store className="w-4 h-4" />} value={form.name} onChange={set('name')} placeholder="e.g. Spice Garden" />
                </Field>
              </motion.div>
              <motion.div variants={FIELD_ITEM}>
                <Field label={t.ri_email}>
                  <Input icon={<Mail className="w-4 h-4" />} value={form.email} onChange={set('email')} placeholder="info@restaurant.com" type="email" />
                </Field>
              </motion.div>
              <motion.div variants={FIELD_ITEM}>
                <Field label={t.ri_location}>
                  <Input icon={<MapPin className="w-4 h-4" />} value={form.location} onChange={set('location')} placeholder="Street, City, Country" />
                </Field>
              </motion.div>
            </motion.div>
          )}
        </FadeSwitch>
      </Section>

      {/* Contact */}
      <Section title={t.ri_contact}>
        <FadeSwitch id={loading ? 'skel-contact' : 'real-contact'}>
          {loading ? (
            <div className="space-y-4">
              {[0, 1].map(i => <SkeletonField key={i} />)}
            </div>
          ) : (
            <motion.div className="space-y-4" variants={FIELDS} initial="hidden" animate="show">
              <motion.div variants={FIELD_ITEM}>
                <Field label={t.ri_phone_primary}>
                  <Input icon={<Phone className="w-4 h-4" />} value={form.phone} onChange={set('phone')} placeholder="+964 XXX XXX XXXX" type="tel" />
                </Field>
              </motion.div>
              <motion.div variants={FIELD_ITEM}>
                <Field label={t.ri_phone_secondary} hint={t.optional}>
                  <Input icon={<Phone className="w-4 h-4" />} value={form.phone2} onChange={set('phone2')} placeholder="+964 XXX XXX XXXX" type="tel" />
                </Field>
              </motion.div>
            </motion.div>
          )}
        </FadeSwitch>
      </Section>

      {/* Social */}
      <Section title={t.ri_social}>
        <FadeSwitch id={loading ? 'skel-social' : 'real-social'}>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map(i => <Skel key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : (
            <motion.div className="space-y-3" variants={FIELDS} initial="hidden" animate="show">
              <motion.div variants={FIELD_ITEM}><SocialField icon={<Globe className="w-4 h-4 text-white/40" />}           label={t.ri_website}       value={form.website}   onChange={set('website')}   placeholder="https://www.yourrestaurant.com" /></motion.div>
              <motion.div variants={FIELD_ITEM}><SocialField icon={<InstagramIcon className="w-4 h-4 text-pink-400" />}   label="Instagram"          value={form.instagram} onChange={set('instagram')} placeholder="https://instagram.com/yourhandle" /></motion.div>
              <motion.div variants={FIELD_ITEM}><SocialField icon={<FacebookIcon className="w-4 h-4 text-blue-400" />}    label="Facebook"           value={form.facebook}  onChange={set('facebook')}  placeholder="https://facebook.com/YourPage" /></motion.div>
              <motion.div variants={FIELD_ITEM}><SocialField icon={<TwitterXIcon className="w-4 h-4 text-sky-400" />}     label="X (Twitter)"        value={form.twitter}   onChange={set('twitter')}   placeholder="https://x.com/yourhandle" /></motion.div>
              <motion.div variants={FIELD_ITEM}><SocialField icon={<WhatsAppIcon className="w-4 h-4 text-emerald-400" />} label="WhatsApp"           value={form.whatsapp}  onChange={set('whatsapp')}  placeholder="+964 XXX XXX XXXX" /></motion.div>
              <motion.div variants={FIELD_ITEM}><SocialField icon={<TikTokIcon className="w-4 h-4 text-white/60" />}      label="TikTok"             value={form.tiktok}    onChange={set('tiktok')}    placeholder="https://tiktok.com/@yourhandle" /></motion.div>
              <motion.div variants={FIELD_ITEM}><SocialField icon={<YoutubeIcon className="w-4 h-4 text-rose-400" />}     label="YouTube"            value={form.youtube}   onChange={set('youtube')}   placeholder="https://youtube.com/@yourchannel" /></motion.div>
              <motion.div variants={FIELD_ITEM}><SocialField icon={<SnapchatIcon className="w-4 h-4 text-yellow-400" />}  label="Snapchat"           value={form.snapchat}  onChange={set('snapchat')}  placeholder="https://snapchat.com/add/yourusername" /></motion.div>
              <motion.div variants={FIELD_ITEM}><SocialField icon={<MapPin className="w-4 h-4 text-emerald-400" />}       label={t.ri_location_link} value={form.maps_url}  onChange={set('maps_url')}  placeholder="https://maps.google.com/..." /></motion.div>
            </motion.div>
          )}
        </FadeSwitch>
      </Section>

      {!loading && (
        <motion.div
          className="flex justify-end pt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          <SaveButton state={saveState} onClick={handleSave} large />
        </motion.div>
      )}

    </motion.div>
  )
}

// ── Reusable sub-components ───────────────────────────────────


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/8 bg-white/3">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-white/60">{label}</label>
        {required && <span className="text-amber-500 text-xs">*</span>}
        {hint && <span className="text-xs text-white/25">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Input({ icon, value, onChange, placeholder, type = 'text' }: {
  icon?: React.ReactNode; value: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
  placeholder?: string; type?: string
}) {
  return (
    <div className="relative">
      {icon && <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30">{icon}</div>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className={cn(
          'w-full h-11 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/20',
          'focus:outline-none focus:border-amber-500/50 focus:bg-white/8 transition-all',
          icon ? 'pl-10 pr-4' : 'px-4'
        )} />
    </div>
  )
}

function SocialField({ icon, label, value, onChange, placeholder }: {
  icon: React.ReactNode; label: string
  value: string; onChange: React.ChangeEventHandler<HTMLInputElement>; placeholder: string
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/8 hover:border-white/12 transition-all">
      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center shrink-0">{icon}</div>
      <div className="w-20 shrink-0"><p className="text-xs font-medium text-white/50">{label}</p></div>
      <div className="flex items-center flex-1 min-w-0 gap-1">
        <input type="text" value={value} onChange={onChange} placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-white/20 focus:outline-none" />
      </div>
      {value && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
    </div>
  )
}
