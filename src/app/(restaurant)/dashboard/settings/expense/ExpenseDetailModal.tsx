'use client'
import { useState } from 'react'
import { X, Trash2, Eye, Paperclip, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import type { Category, Expense } from './types'
import { CAT_ICONS, STATUS_CFG } from './types'

function ReceiptPreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <a href={url} target="_blank" rel="noreferrer"
        className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white/50 hover:border-amber-500/30 hover:text-amber-400 transition-colors">
        <Paperclip className="w-4 h-4 shrink-0" />
        <span className="truncate flex-1">View attached file</span>
        <Eye className="w-3.5 h-3.5 shrink-0" />
      </a>
    )
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Receipt"
        onError={() => setFailed(true)}
        className="w-full max-h-72 object-contain rounded-xl border border-white/10 bg-white/5 hover:border-amber-500/30 transition-colors cursor-zoom-in"
      />
    </a>
  )
}

interface Props {
  expense: Expense
  category: Category | null
  onClose: () => void
  onDelete: (id: string) => void
}

export function ExpenseDetailModal({ expense, category, onClose, onDelete }: Props) {
  const { formatPrice } = useDefaultCurrency()
  const { t } = useLanguage()
  const CatIcon  = category ? (CAT_ICONS[category.icon] ?? LayoutGrid) : LayoutGrid
  const status   = STATUS_CFG[expense.status ?? 'paid'] ?? STATUS_CFG.paid
  const StatusIcon = status.icon

  const rows: [string, React.ReactNode][] = [
    [t.exp_title,      <span key="t" className="text-white font-semibold">{expense.title}</span>],
    [t.exp_category,   category
      ? <span key="c" className="flex items-center gap-1.5">
          <CatIcon className="w-3.5 h-3.5" style={{ color: category.color }} />
          <span style={{ color: category.color }} className="font-semibold">{category.name}</span>
        </span>
      : <span key="c" className="text-white/30">Uncategorized</span>],
    [t.exp_amount,     <span key="a" className="text-amber-400 font-bold tabular-nums text-base">{formatPrice(expense.amount ?? 0)}</span>],
    ['Status',         <span key="s" className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold', status.color)}>
                         <StatusIcon className="w-2.5 h-2.5" />{status.label}
                       </span>],
    ['Payment Method', <span key="pm" className="text-white/70">{expense.payment_method ?? '—'}</span>],
    ['Recorded By',    <span key="cb" className="text-white/70">{expense.created_by ?? '—'}</span>],
    ['Date',           <span key="d" className="text-white/70 tabular-nums">
                         {new Date(expense.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                         {' · '}
                         {new Date(expense.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                       </span>],
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0a0f1c] border border-white/12 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-white/3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: category ? `${category.color}25` : '#ffffff10', border: `1px solid ${category?.color ?? '#ffffff'}30` }}
            >
              <CatIcon className="w-4 h-4" style={{ color: category?.color ?? '#ffffff50' }} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">{expense.title}</h3>
              <p className="text-xs text-white/35">{category?.name ?? 'Uncategorized'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Detail rows */}
        <div className="px-6 py-4 space-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0">
              <span className="text-xs text-white/35 shrink-0 w-32">{label}</span>
              <span className="text-xs text-right">{value}</span>
            </div>
          ))}

          {expense.note && (
            <div className="pt-1">
              <p className="text-xs text-white/35 mb-1.5">{t.exp_note}</p>
              <p className="text-sm text-white/60 bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 leading-relaxed">{expense.note}</p>
            </div>
          )}

          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-white/35">Receipt</p>
              {expense.receipt_url && (
                <a href={expense.receipt_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors">
                  <Eye className="w-3 h-3" />Open full size
                </a>
              )}
            </div>
            {expense.receipt_url ? (
              <ReceiptPreview url={expense.receipt_url} />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border border-dashed border-white/10 bg-white/3">
                <Paperclip className="w-6 h-6 text-white/15" />
                <p className="text-xs text-white/25">No receipt attached</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 bg-white/2 flex gap-3">
          <button
            onClick={() => onDelete(expense.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-sm font-medium transition-all active:scale-95"
          >
            <Trash2 className="w-4 h-4" />{t.delete}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-white/60 text-sm font-medium transition-all active:scale-95"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
