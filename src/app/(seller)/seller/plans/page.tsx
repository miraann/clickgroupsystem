'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MODULES, MODULE_CATEGORIES } from '@/lib/modules'
import { Plus, Edit2, Trash2, CheckCircle2, Loader2, Package2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { PlanModal, PLAN_COLORS } from './PlanModal'
import type { Plan } from './PlanModal'

const DOT: Record<string, string> = Object.fromEntries(PLAN_COLORS.map(c => [c.value, c.dot]))
const BORDER: Record<string, string> = {
  slate:   'border-slate-500/30',
  indigo:  'border-indigo-500/30',
  violet:  'border-violet-500/30',
  emerald: 'border-emerald-500/30',
  amber:   'border-amber-500/30',
  rose:    'border-rose-500/30',
  cyan:    'border-cyan-500/30',
}
const TITLE: Record<string, string> = {
  slate:   'text-slate-200',
  indigo:  'text-indigo-200',
  violet:  'text-violet-200',
  emerald: 'text-emerald-200',
  amber:   'text-amber-200',
  rose:    'text-rose-200',
  cyan:    'text-cyan-200',
}

function modOn(modules: Record<string, boolean>, key: string) {
  return !(key in modules) || modules[key] === true
}

export default function PlansPage() {
  const supabase = createClient()

  const [plans,     setPlans]     = useState<Plan[]>([])
  const [loading,   setLoading]   = useState(true)
  const [editPlan,  setEditPlan]  = useState<Plan | null>(null)
  const [showModal, setShowModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('plans')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at',  { ascending: true })
    setPlans((data ?? []) as Plan[])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const openAdd  = ()           => { setEditPlan(null); setShowModal(true) }
  const openEdit = (p: Plan)    => { setEditPlan(p);    setShowModal(true) }
  const onSaved  = ()           => { setShowModal(false); load() }

  const handleDelete = async (plan: Plan) => {
    if (!confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return
    await supabase.from('plans').delete().eq('id', plan.id)
    setPlans(prev => prev.filter(p => p.id !== plan.id))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Plans</h1>
          <p className="text-white/40 mt-1">Define subscription plans and their module access permissions</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-all shadow-lg shadow-indigo-500/25"
        >
          <Plus className="w-4 h-4" />Add Plan
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Package2 className="w-8 h-8 text-white/20" />
          </div>
          <p className="text-white/50 font-medium">No plans yet</p>
          <p className="text-white/25 text-sm mt-1 max-w-xs">
            Create your first subscription plan to assign to restaurants
          </p>
          <button
            onClick={openAdd}
            className="mt-5 flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-sm font-medium hover:bg-indigo-500/30 transition-all"
          >
            <Plus className="w-4 h-4" />Create Plan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map((plan, i) => {
            const color       = plan.color ?? 'indigo'
            const enabledMods = MODULES.filter(m => modOn(plan.modules, m.key))
            const pct         = Math.round((enabledMods.length / MODULES.length) * 100)

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.06 }}
                className={cn(
                  'bg-white/3 border rounded-2xl overflow-hidden flex flex-col',
                  BORDER[color] ?? 'border-white/10',
                )}
              >
                {/* Top */}
                <div className="p-5 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', DOT[color] ?? 'bg-indigo-400')} />
                      <h3 className={cn('text-base font-bold truncate', TITLE[color] ?? 'text-indigo-200')}>
                        {plan.name}
                      </h3>
                    </div>
                    <span className={cn(
                      'shrink-0 text-xs px-2 py-0.5 rounded-full font-medium',
                      plan.is_active
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-white/8 text-white/35',
                    )}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-2 pl-5">
                    <p className="text-2xl font-bold text-white leading-none">
                      ${plan.price}
                      <span className="text-sm font-normal text-white/35 ml-0.5">
                        /{plan.billing_period === 'monthly' ? 'mo' : 'yr'}
                      </span>
                    </p>
                    {plan.description && (
                      <p className="text-xs text-white/45 mt-1.5 leading-relaxed">{plan.description}</p>
                    )}
                  </div>
                </div>

                {/* Module access */}
                <div className="px-5 pb-4 flex-1 border-t border-white/6 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-white/35">Module Access</p>
                    <p className="text-xs tabular-nums text-white/45">
                      {enabledMods.length}/{MODULES.length}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1 bg-white/8 rounded-full mb-3 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', DOT[color] ?? 'bg-indigo-400')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Module list by category */}
                  <div className="space-y-2">
                    {MODULE_CATEGORIES.map(cat => {
                      const catMods = MODULES.filter(m => m.category === cat)
                      const on      = catMods.filter(m =>  modOn(plan.modules, m.key))
                      const off     = catMods.filter(m => !modOn(plan.modules, m.key))
                      return (
                        <div key={cat} className="flex gap-2">
                          <span className="text-[9px] font-bold text-white/20 uppercase tracking-wide w-[68px] shrink-0 pt-0.5">
                            {cat}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {on.map(m => (
                              <span key={m.key}
                                className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-white/55">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                {m.label}
                              </span>
                            ))}
                            {off.map(m => (
                              <span key={m.key}
                                className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-white/3 text-white/20 line-through">
                                {m.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="px-5 py-3 border-t border-white/6 flex gap-2">
                  <button
                    onClick={() => openEdit(plan)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white/55 hover:text-white hover:bg-white/8 transition-all border border-transparent hover:border-white/10"
                  >
                    <Edit2 className="w-3.5 h-3.5" />Edit
                  </button>
                  <button
                    onClick={() => handleDelete(plan)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white/35 hover:text-rose-400 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />Delete
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {showModal && (
        <PlanModal
          plan={editPlan}
          onClose={() => setShowModal(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
