'use client'
import { motion } from 'framer-motion'
import {
  ActivitySquare,
  ArrowLeft,
  Ban,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Clock,
  Coffee,
  CreditCard,
  DollarSign,
  Globe,
  MessageCircle,
  Package,
  Receipt,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  UserCircle,
  Users,
  UtensilsCrossed
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

/* ─── data ─────────────────────────────────────────────────── */

const FEATURES = [
  // Operations
  { key: 'menu',        icon: UtensilsCrossed, name: 'بەڕێوەبردنی مینیو',   desc: 'مانگۆ، پۆل و دەستکاری بە ئاسانی',           cat: 'کارکردن',   color: 'indigo'  },
  { key: 'dine_in',     icon: Coffee,          name: 'خزمەتگوزاری میز',     desc: 'بەڕێوەبردنی میز و داواکارییەکان',            cat: 'کارکردن',   color: 'indigo'  },
  { key: 'delivery',    icon: Truck,           name: 'گەیاندن',             desc: 'بەڕێوەبردنی داواکارییەکانی گەیاندن',         cat: 'کارکردن',   color: 'indigo'  },
  { key: 'takeout',     icon: ShoppingBag,     name: 'وەرگرتن',             desc: 'داواکارییەکانی وەرگرتن و تەسلیمکردن',        cat: 'کارکردن',   color: 'indigo'  },
  { key: 'bar',         icon: Coffee,          name: 'کافێ بار',            desc: 'بەڕێوەبردنی خواردنەوە و بار',               cat: 'کارکردن',   color: 'indigo'  },
  { key: 'reservation', icon: CalendarDays,    name: 'ڕێزکردنی میز',        desc: 'ئامادەکردنی میز و بووک کردن',               cat: 'کارکردن',   color: 'indigo'  },
  { key: 'kds',         icon: ActivitySquare,  name: 'نیشاندەری خواردنگه', desc: 'سیستەمی KDS بۆ خواردنگه',                   cat: 'کارکردن',   color: 'indigo'  },
  { key: 'inventory',   icon: Package,         name: 'کۆگا',                desc: 'شوێنکردنەوەی کۆ و مەواد',                   cat: 'کارکردن',   color: 'indigo'  },
  // Finance
  { key: 'sales',       icon: BarChart3,       name: 'ڕاپۆرتی فرۆشتن',     desc: 'ڕاپۆرت و پوختەی ڕۆژانە',                   cat: 'داراییکاری', color: 'emerald' },
  { key: 'expense',     icon: DollarSign,      name: 'خەرجییەکان',          desc: 'شوێنکردنەوەی خەرجییەکانی بزنس',             cat: 'داراییکاری', color: 'emerald' },
  { key: 'pay_later',   icon: CreditCard,      name: 'پاشتر بدە',           desc: 'بەڕێوەبردنی کرێی و داشکاندن',              cat: 'داراییکاری', color: 'emerald' },
  { key: 'receipt',     icon: Receipt,         name: 'پسوولە',              desc: 'چاپکردن و دەستکاری پسوولە',                 cat: 'داراییکاری', color: 'emerald' },
  { key: 'void',        icon: Ban,             name: 'هەڵوەشاندنەوە',      desc: 'هەڵوەشاندنەوەی مانگۆ و ئایتەم',            cat: 'داراییکاری', color: 'emerald' },
  // People
  { key: 'users',       icon: Users,           name: 'بەڕێوەبردنی ستاف',   desc: 'ڕۆڵ، مۆڵەتەکان و کارمەندان',              cat: 'ئەندامان',   color: 'violet'  },
  { key: 'member',      icon: Star,            name: 'ئەندامایەتی',         desc: 'بەرنامەی وەفاداری و ئەندامان',              cat: 'ئەندامان',   color: 'violet'  },
  { key: 'customer',    icon: UserCircle,      name: 'کڕیارەکان',           desc: 'پرۆفایل و تۆمارەکانی کڕیار',               cat: 'ئەندامان',   color: 'violet'  },
  // Marketing
  { key: 'whatsapp',    icon: MessageCircle,   name: 'بازاڕکردنی واتساپ',   desc: 'مارکەتینگ و ئاگادارکردنەوەی کڕیار',        cat: 'بازاڕکردن',  color: 'amber'   },
]

const CATS: { id: string; label: string; colorClass: string }[] = [
  { id: 'کارکردن',   label: 'کارکردن',    colorClass: 'text-indigo-300  bg-indigo-500/10  border-indigo-500/25'  },
  { id: 'داراییکاری', label: 'داراییکاری', colorClass: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
  { id: 'ئەندامان',  label: 'ئەندامان',   colorClass: 'text-violet-300  bg-violet-500/10  border-violet-500/25'  },
  { id: 'بازاڕکردن', label: 'بازاڕکردن',  colorClass: 'text-amber-300   bg-amber-500/10   border-amber-500/25'   },
]

const ICON_BG: Record<string, string> = {
  indigo:  'bg-indigo-500/15  text-indigo-400',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  violet:  'bg-violet-500/15  text-violet-400',
  amber:   'bg-amber-500/15   text-amber-400',
}

const STEPS = [
  { n: '١', title: 'تۆمارکردن',  desc: 'ڕستووورانەکەت لە پانێڵی فرۆشیار دادەمەزرێنیت',    color: 'from-indigo-500 to-violet-600'  },
  { n: '٢', title: 'ڕێکخستن',    desc: 'مینیو، میز، ستاف و تایبەتمەندییەکانت ڕێکدەخەیت',  color: 'from-violet-500 to-indigo-600'  },
  { n: '٣', title: 'دەستپێکردن', desc: 'داواکارییەکانت بەڕێوەدەبات و کارتەکانت سەرکەوتوو', color: 'from-amber-500  to-orange-500'  },
]

/* ─── animation helpers ─────────────────────────────────────── */
const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 22 },
  animate:    { opacity: 1, y: 0  },
  transition: { duration: 0.55, delay },
})
const fadeUpView = (delay = 0) => ({
  initial:     { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0  },
  viewport:    { once: true },
  transition:  { duration: 0.5, delay },
})

/* ─── page ──────────────────────────────────────────────────── */
export default function Home() {
  return (
    <div dir="rtl" className="min-h-screen bg-[#080b14] text-white overflow-x-hidden" style={{ fontFamily: "'KurdishFont', 'Segoe UI', Tahoma, sans-serif" }}>

      {/* ── fixed background ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-60 right-0 w-[700px] h-[700px] bg-indigo-600/12 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 left-0 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/3 w-[500px] h-[500px] bg-amber-500/6 rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>

      {/* ════════════════ NAVBAR ════════════════ */}
      <nav className="sticky top-0 z-50 border-b border-white/6 backdrop-blur-2xl bg-[#080b14]/75">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white p-0.5 shadow-lg shadow-black/20 overflow-hidden shrink-0">
              <Image src="/logo/logo.png" alt="ClickGroup" width={44} height={44} className="w-full h-full object-contain" />
            </div>
            <div className="leading-none">
              <p className="text-base font-black tracking-tight">
                <span className="text-white">Click</span><span className="text-amber-400">Group</span>
              </p>
              <p className="text-[10px] text-white/40 font-semibold tracking-[0.18em] uppercase mt-0.5">Technology</p>
            </div>
          </div>

          {/* Nav login */}
          <Link
            href="/restaurant-login"
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold transition-all shadow-lg shadow-amber-500/25 active:scale-95"
          >
            <ChefHat className="w-4 h-4" />
            چوونەژوورەوە
          </Link>
        </div>
      </nav>

      {/* ════════════════ HERO ════════════════ */}
      <section className="relative pt-24 pb-16 px-6 text-center">
        <div className="max-w-4xl mx-auto">

          {/* Badge */}
          <motion.div {...fadeUp(0)} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/12 border border-indigo-500/25 text-indigo-300 text-sm font-medium mb-7">
            <Sparkles className="w-3.5 h-3.5" />
            سیستەمی تەواوی بەڕێوەبردنی کافێ و ڕستووران
          </motion.div>

          {/* Headline */}
          <motion.h1 {...fadeUp(0.1)} className="text-6xl md:text-7xl font-black leading-[1.15] mb-5">
            بەڕێوەبردنی کافێت<br />
            <span className="bg-gradient-to-l from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
              نوێکرایەوە
            </span>
          </motion.h1>

          {/* Sub */}
          <motion.p {...fadeUp(0.2)} className="text-white/45 text-xl max-w-2xl mx-auto leading-relaxed mb-10">
            پلاتفۆرمی SaaS تەواو بۆ بەڕێوەبردنی هەموو جۆرە کافێ و ڕستووران. داواکاری، مینیو، ستاف، گەیاندن، ڕاپۆرت و زیاتر — لە یەک شوێن.
          </motion.p>

          {/* CTA buttons */}
          <motion.div {...fadeUp(0.3)} className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/restaurant-login"
              className="flex items-center gap-2.5 px-8 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-base transition-all shadow-2xl shadow-amber-500/25 active:scale-[0.97]"
            >
              <ChefHat className="w-5 h-5" />
              چوونەژوورەوەی ڕستووران
            </Link>
            <a
              href="#features"
              className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-white/6 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/70 hover:text-white font-semibold text-base transition-all"
            >
              تایبەتمەندییەکان
              <ArrowLeft className="w-4 h-4 rotate-[270deg]" />
            </a>
          </motion.div>
        </div>

        {/* Floating feature pills */}
        <motion.div
          {...fadeUp(0.5)}
          className="flex flex-wrap justify-center gap-2.5 mt-14 max-w-2xl mx-auto"
        >
          {['داواکاری ڕاستەوخۆ', 'نیشاندەری خواردنگه', 'مینیوی QR', 'گەیاندن', 'کۆگا', 'واتساپ', 'ئەندامایەتی', 'POS'].map(t => (
            <span key={t} className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/50">
              {t}
            </span>
          ))}
        </motion.div>
      </section>

      {/* ════════════════ STATS ════════════════ */}
      <section className="py-10 border-y border-white/5">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-3 gap-4">
          {[
            { num: '١٥+',  label: 'تایبەتمەندی',       icon: CheckCircle2, color: 'text-indigo-400'  },
            { num: '٢٤/٧', label: 'چالاکیی سیستەم',   icon: Clock,        color: 'text-emerald-400' },
            { num: '١٠٠٪', label: 'کلاودی و ئینتەرنێت', icon: Globe,        color: 'text-violet-400'  },
          ].map((s, i) => (
            <motion.div key={i} {...fadeUp(0.4 + i * 0.1)} className="text-center py-4">
              <s.icon className={`w-5 h-5 mx-auto mb-2 ${s.color}`} />
              <p className="text-4xl font-black text-white mb-1">{s.num}</p>
              <p className="text-white/35 text-sm">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ════════════════ FEATURES ════════════════ */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <motion.div {...fadeUpView()} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/12 border border-violet-500/25 text-violet-300 text-sm font-medium mb-5">
              <Package className="w-3.5 h-3.5" />
              تایبەتمەندییەکان
            </motion.div>
            <motion.h2 {...fadeUpView(0.1)} className="text-4xl md:text-5xl font-black text-white mb-4">
              هەموو ئەوەی پێویستە
            </motion.h2>
            <motion.p {...fadeUpView(0.2)} className="text-white/40 text-lg max-w-xl mx-auto">
              هەموو تایبەتمەندییەکی پێویست بۆ بەڕێوەبردنی ڕستووران لە یەک پلاتفۆرم
            </motion.p>
          </div>

          {CATS.map((cat) => {
            const items = FEATURES.filter(f => f.cat === cat.id)
            return (
              <div key={cat.id} className="mb-14">
                {/* Category header */}
                <motion.div {...fadeUpView()} className="flex items-center gap-3 mb-6">
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${cat.colorClass}`}>
                    {cat.label}
                  </span>
                  <div className="flex-1 h-px bg-white/6" />
                  <span className="text-xs text-white/20">{items.length} تایبەتمەندی</span>
                </motion.div>

                {/* Feature cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {items.map((f, fi) => (
                    <motion.div
                      key={f.key}
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: fi * 0.07 }}
                      className="group relative bg-white/[0.03] hover:bg-white/[0.06] border border-white/8 hover:border-white/15 rounded-2xl p-5 transition-all duration-300 cursor-default overflow-hidden"
                    >
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-white/3 to-transparent" />
                      <div className="relative flex flex-col items-center text-center">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3.5 ${ICON_BG[f.color]}`}>
                          <f.icon className="w-5 h-5" />
                        </div>
                        <h3 className="text-sm font-bold text-white mb-1.5 leading-snug">{f.name}</h3>
                        <p className="text-xs text-white/38 leading-relaxed">{f.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ════════════════ HOW IT WORKS ════════════════ */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <motion.h2 {...fadeUpView()} className="text-4xl font-black text-white mb-4">چۆن کار دەکات؟</motion.h2>
            <motion.p {...fadeUpView(0.1)} className="text-white/40 text-lg">دەستپێکردن ئاسانە</motion.p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <motion.div
                key={i}
                {...fadeUpView(i * 0.12)}
                className="relative bg-white/[0.03] border border-white/8 rounded-2xl p-7 text-center overflow-hidden group hover:border-white/15 transition-all"
              >
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundImage: `linear-gradient(to right, transparent, rgba(99,102,241,0.6), transparent)` }} />
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center mx-auto mb-5 text-2xl font-black text-white shadow-lg`}>
                  {s.n}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════ FINAL CTA ════════════════ */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            {...fadeUpView()}
            className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent p-14 text-center overflow-hidden"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.12),transparent_65%)]" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
            <div className="relative">
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-white p-1 shadow-2xl shadow-black/30 overflow-hidden shrink-0">
                  <Image src="/logo/logo.png" alt="ClickGroup" width={64} height={64} className="w-full h-full object-contain" />
                </div>
                <div className="leading-none text-right">
                  <p className="text-2xl font-black tracking-tight">
                    <span className="text-white">Click</span><span className="text-amber-400">Group</span>
                  </p>
                  <p className="text-xs text-white/40 font-semibold tracking-[0.2em] uppercase mt-1">Technology</p>
                </div>
              </div>
              <h2 className="text-4xl font-black text-white mb-4">ئامادەیت بۆ دەستپێکردن؟</h2>
              <p className="text-white/45 text-lg mb-8 leading-relaxed">
                ئێستا چوونەژوورەوە و ڕستووورانت سەرکەوتووانە بەڕێوەبگرە
              </p>
              <Link
                href="/restaurant-login"
                className="inline-flex items-center gap-2.5 px-10 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-base transition-all shadow-2xl shadow-amber-500/30 active:scale-[0.97]"
              >
                <ChefHat className="w-5 h-5" />
                چوونەژوورەوەی ڕستووران
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ════════════════ FOOTER ════════════════ */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white p-0.5 shadow-md overflow-hidden shrink-0">
              <Image src="/logo/logo.png" alt="ClickGroup" width={44} height={44} className="w-full h-full object-contain" />
            </div>
            <div className="leading-none">
              <p className="text-base font-black tracking-tight">
                <span className="text-white">Click</span><span className="text-amber-400">Group</span>
              </p>
              <p className="text-[10px] text-white/40 font-semibold tracking-[0.18em] uppercase mt-0.5">Technology</p>
            </div>
          </div>
          <p className="text-white/20 text-xs text-center">
            پلاتفۆرمی بەڕێوەبردنی کافێ و ڕێستورانت · کلیک گروپ
          </p>
        </div>
      </footer>

    </div>
  )
}
