'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Printer, X, RotateCcw, Trash2, CheckCircle2, AlertCircle, Loader2,
  ChefHat, Receipt, FileText, Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import {
  usePrintJobs, usePrintQueueSummary,
  retryJob, retryAllFailed, removeJob, clearSettled,
  type PrintJob, type PrintJobKind, type PrintJobStatus,
} from '@/lib/printQueue'

const KIND_ICON: Record<PrintJobKind, typeof Printer> = {
  kitchen: ChefHat,
  receipt: Receipt,
  report:  FileText,
  test:    Printer,
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 5)   return 'now'
  if (s < 60)  return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

function StatusPill({ status, t }: { status: PrintJobStatus; t: ReturnType<typeof useLanguage>['t'] }) {
  const map = {
    queued:   { cn: 'bg-white/8 text-white/50 border-white/15',            label: t.pq_queued,   icon: <Inbox className="w-3 h-3" /> },
    printing: { cn: 'bg-amber-500/15 text-amber-400 border-amber-500/30',  label: t.pq_printing, icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    success:  { cn: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: t.pq_success, icon: <CheckCircle2 className="w-3 h-3" /> },
    failed:   { cn: 'bg-rose-500/15 text-rose-400 border-rose-500/30',     label: t.pq_failed,   icon: <AlertCircle className="w-3 h-3" /> },
  }[status]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-semibold shrink-0', map.cn)}>
      {map.icon}{map.label}
    </span>
  )
}

function JobRow({ job, t }: { job: PrintJob; t: ReturnType<typeof useLanguage>['t'] }) {
  const Icon = KIND_ICON[job.kind] ?? Printer
  const kindLabel = {
    kitchen: t.pq_kind_kitchen, receipt: t.pq_kind_receipt, report: t.pq_kind_report, test: t.pq_kind_test,
  }[job.kind] ?? job.kind

  return (
    <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/4 border border-white/8">
      <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-white/50" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white truncate">{job.title}</p>
          <span className="text-[10px] text-white/25 shrink-0">{relTime(job.updatedAt)}</span>
        </div>
        <p className="text-[11px] text-white/35 truncate">
          {kindLabel}{job.detail ? ` · ${job.detail}` : ''}
          {job.status === 'failed' && job.attempts > 1 ? ` · ×${job.attempts}` : ''}
        </p>
        {job.status === 'failed' && job.error && (
          <p className="text-[11px] text-rose-300/80 mt-1 break-words">{job.error}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          {job.prints >= 1 && (
            <span
              title={`${t.pq_success} ×${job.prints}`}
              className="inline-flex items-center px-1.5 py-0.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold tabular-nums shrink-0"
            >
              ×{job.prints}
            </span>
          )}
          <StatusPill status={job.status} t={t} />
        </div>
        <div className="flex items-center gap-1">
          {(job.status === 'failed' || job.status === 'success') && (
            <button
              onClick={() => retryJob(job.id)}
              title={t.pq_retry}
              className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-amber-400 hover:bg-amber-500/10 transition-all active:scale-90"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          {(job.status === 'failed' || job.status === 'success' || job.status === 'queued') && (
            <button
              onClick={() => removeJob(job.id)}
              className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all active:scale-90"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PrintQueueButton({
  wrapperClassName,
  buttonClassName,
}: {
  wrapperClassName?: string
  buttonClassName?: string
}) {
  const { t, isRTL } = useLanguage()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const jobs    = usePrintJobs()
  const summary = usePrintQueueSummary()

  useEffect(() => { setMounted(true) }, []) // eslint-disable-line react-hooks/set-state-in-effect

  const ordered = [...jobs].sort((a, b) => b.updatedAt - a.updatedAt)
  const badge   = summary.failed > 0 ? summary.failed : summary.active > 0 ? summary.active : 0

  const tone =
    summary.failed > 0 ? 'bg-rose-500/15 border-rose-500/40 text-rose-400 hover:bg-rose-500/25'
    : summary.active > 0 ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25'
    : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70 hover:bg-white/10'

  return (
    <div className={wrapperClassName}>
      <button
        onClick={() => setOpen(v => !v)}
        title={t.pq_title}
        className={cn(
          'relative flex items-center justify-center rounded-xl border transition-all active:scale-95 shrink-0',
          tone,
          buttonClassName ?? 'w-9 h-9 lg:w-14 lg:h-14',
        )}
      >
        {summary.active > 0 && summary.failed === 0
          ? <Loader2 className="w-[18px] h-[18px] lg:w-[26px] lg:h-[26px] animate-spin" />
          : <Printer className="w-[18px] h-[18px] lg:w-[26px] lg:h-[26px]" />}
        {badge > 0 && (
          <span className={cn(
            'absolute -top-1 -right-1 min-w-[16px] h-4 lg:min-w-[20px] lg:h-5 rounded-full text-white text-[9px] lg:text-[11px] font-bold flex items-center justify-center px-1 shadow-lg',
            summary.failed > 0 ? 'bg-rose-500 shadow-rose-500/40' : 'bg-amber-500 shadow-amber-500/40',
          )}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {mounted && createPortal(
        <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
            onClick={() => setOpen(false)}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/15 bg-[#0d1220]/97 backdrop-blur-2xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Pull handle */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>

              {/* Header */}
              <div className="px-5 py-4 bg-white/4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <Printer className="w-5 h-5 text-white/60" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-0.5">{t.pq_title}</p>
                    <p className="text-sm font-bold text-white flex items-center gap-2">
                      {summary.failed > 0 && <span className="text-rose-400">{summary.failed} {t.pq_failed}</span>}
                      {summary.active > 0 && <span className="text-amber-400">{summary.active} {t.pq_queued}</span>}
                      {summary.failed === 0 && summary.active === 0 && (
                        <span className="text-emerald-400">{summary.success ? `${summary.success} ${t.pq_success}` : t.pq_empty}</span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* List */}
              <div className="px-4 py-3 space-y-2 max-h-[60vh] overflow-y-auto">
                {ordered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-white/25">
                    <Printer className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">{t.pq_empty}</p>
                  </div>
                ) : (
                  ordered.map(job => <JobRow key={job.id} job={job} t={t} />)
                )}
              </div>

              {/* Footer actions */}
              {(summary.failed > 0 || summary.success > 0) && (
                <div className="px-4 pb-4 pt-1 flex gap-2">
                  {summary.failed > 0 && (
                    <button
                      onClick={retryAllFailed}
                      className="flex-1 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-amber-500/25 active:scale-95 transition-all"
                    >
                      <RotateCcw className="w-4 h-4" />{t.pq_retry_all}
                    </button>
                  )}
                  {(summary.success > 0 || summary.failed > 0) && (
                    <button
                      onClick={clearSettled}
                      className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />{t.pq_clear}
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
