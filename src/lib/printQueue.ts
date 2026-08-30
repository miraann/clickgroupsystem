import { useSyncExternalStore } from 'react'

// ─────────────────────────────────────────────────────────────────────
// Client-side print queue.
//
// Every print the app fires (kitchen tickets, receipts, reports) is run
// through `enqueuePrint`, which records it as a job, runs jobs one at a
// time (so a printer never gets two streams of bytes interleaved) and
// keeps the outcome so the dashboard can show what printed and what
// failed — with a retry button.
//
// State lives in module scope: it survives client-side navigation
// (dashboard ⇄ order screen) but resets on a hard reload.
// ─────────────────────────────────────────────────────────────────────

export type PrintJobKind   = 'kitchen' | 'receipt' | 'report' | 'test'
export type PrintJobStatus = 'queued' | 'printing' | 'success' | 'failed'

export interface PrintJob {
  id:        string
  kind:      PrintJobKind
  title:     string
  detail?:   string
  status:    PrintJobStatus
  error?:    string
  attempts:  number
  createdAt: number
  updatedAt: number
}

interface InternalJob extends PrintJob {
  run:    () => Promise<unknown>
  /** resolved (never rejected) with the final outcome when the job settles */
  settle?: (ok: boolean) => void
}

const MAX_HISTORY = 60

let jobs: InternalJob[] = []
let processing = false
const listeners = new Set<() => void>()

// Public snapshot — a `run`-free copy, rebuilt only when something changes
// so `useSyncExternalStore` sees a stable reference between updates.
let snapshot: PrintJob[] = []
const EMPTY: PrintJob[] = []

function rebuildSnapshot() {
  snapshot = jobs.map(j => ({
    id: j.id, kind: j.kind, title: j.title, detail: j.detail,
    status: j.status, error: j.error, attempts: j.attempts,
    createdAt: j.createdAt, updatedAt: j.updatedAt,
  }))
}

function emit() {
  rebuildSnapshot()
  listeners.forEach(l => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
function getSnapshot()       { return snapshot }
function getServerSnapshot() { return EMPTY }

function uid() {
  return `pj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function trimHistory() {
  if (jobs.length <= MAX_HISTORY) return
  const overflow = jobs.length - MAX_HISTORY
  const settled  = jobs.filter(j => j.status === 'success' || j.status === 'failed')
  const drop     = new Set(settled.slice(0, overflow).map(j => j.id))
  jobs = jobs.filter(j => !drop.has(j.id))
}

async function processNext(): Promise<void> {
  if (processing) return
  const next = jobs.find(j => j.status === 'queued')
  if (!next) return

  processing = true
  next.status    = 'printing'
  next.attempts += 1
  next.updatedAt = Date.now()
  emit()

  let ok = false
  try {
    await next.run()
    next.status = 'success'
    next.error  = undefined
    ok = true
  } catch (e) {
    next.status = 'failed'
    next.error  = e instanceof Error ? e.message : 'Print failed'
  }
  next.updatedAt = Date.now()
  processing = false
  const settle = next.settle
  next.settle = undefined
  emit()
  settle?.(ok)

  queueMicrotask(processNext)
}

export interface EnqueuedPrint {
  id: string
  /** resolves true/false when this job finishes (never rejects) */
  done: Promise<boolean>
}

/** Add a print to the queue. Runs asynchronously, one job at a time. */
export function enqueuePrint(spec: {
  kind:    PrintJobKind
  title:   string
  detail?: string
  run:     () => Promise<unknown>
}): EnqueuedPrint {
  const now = Date.now()
  let settle: ((ok: boolean) => void) | undefined
  const done = new Promise<boolean>(resolve => { settle = resolve })

  const job: InternalJob = {
    id: uid(),
    kind: spec.kind,
    title: spec.title,
    detail: spec.detail,
    status: 'queued',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    run: spec.run,
    settle,
  }
  jobs = [...jobs, job]
  trimHistory()
  emit()
  queueMicrotask(processNext)
  return { id: job.id, done }
}
// note: trimHistory only drops already-settled jobs, never the one just queued

export function retryJob(id: string) {
  const job = jobs.find(j => j.id === id)
  if (!job || job.status === 'queued' || job.status === 'printing') return
  job.status    = 'queued'
  job.error     = undefined
  job.updatedAt = Date.now()
  emit()
  queueMicrotask(processNext)
}

export function retryAllFailed() {
  let any = false
  for (const job of jobs) {
    if (job.status === 'failed') {
      job.status    = 'queued'
      job.error     = undefined
      job.updatedAt = Date.now()
      any = true
    }
  }
  if (any) { emit(); queueMicrotask(processNext) }
}

/** Drop one job from the list (a job that is mid-print is kept). */
export function removeJob(id: string) {
  jobs = jobs.filter(j => j.id !== id || j.status === 'printing')
  emit()
}

/** Clear everything that has finished, keeping queued / in-progress jobs. */
export function clearSettled() {
  jobs = jobs.filter(j => j.status === 'queued' || j.status === 'printing')
  emit()
}

export function usePrintJobs(): PrintJob[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export interface PrintQueueSummary {
  total:   number
  active:  number   // queued + printing
  failed:  number
  success: number
}

export function usePrintQueueSummary(): PrintQueueSummary {
  const list = usePrintJobs()
  let active = 0, failed = 0, success = 0
  for (const j of list) {
    if (j.status === 'queued' || j.status === 'printing') active++
    else if (j.status === 'failed') failed++
    else success++
  }
  return { total: list.length, active, failed, success }
}
