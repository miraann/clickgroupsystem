'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  MessageCircle, Phone, Users, Search, Plus, X,
  Send, CheckCircle2,
  Loader2, ChevronRight, Clock, History, FileText,
  Pencil, Trash2, Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const WA_GREEN = '#25D366'

interface Recipient {
  id: string
  name: string
  phone: string
  type: 'manual' | 'customer' | 'member'
}

interface Contact {
  id: string
  name: string
  phone: string | null
  type: 'customer' | 'member'
}

interface WaLog {
  id: string
  recipient_name: string
  phone: string
  message: string
  sent_at: string
}

interface WaTemplate {
  id: string
  name: string
  message: string
  created_at: string
}

function formatWaPhone(phone: string): string {
  let p = phone.replace(/[\s\-()]/g, '')
  if (p.startsWith('0')) p = '964' + p.slice(1)
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('00')) p = p.slice(2)
  return p
}

export default function WhatsAppPage() {
  const supabase = createClient()
  const { t, isRTL } = useLanguage()

  const [activeTab, setActiveTab] = useState<'send' | 'templates'>('send')

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [restName, setRestName] = useState('')

  // Recipients
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [manualPhone, setManualPhone] = useState('')
  const [manualName, setManualName] = useState('')

  // Contacts picker
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactsLoaded, setContactsLoaded] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(false)

  // Message
  const [message, setMessage] = useState('')

  // Send queue
  const [sending, setSending] = useState(false)
  const [sendIndex, setSendIndex] = useState(0)
  const [sendDone, setSendDone] = useState(false)

  // Logs
  const [logs, setLogs] = useState<WaLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  // Templates
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateMessage, setTemplateMessage] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<WaTemplate | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const templateTextareaRef = useRef<HTMLTextAreaElement>(null)

  const insertVariable = (v: string) => {
    const el = templateTextareaRef.current
    if (!el) { setTemplateMessage(m => m + v); return }
    const start = el.selectionStart
    const end   = el.selectionEnd
    setTemplateMessage(m => m.slice(0, start) + v + m.slice(end))
    setTimeout(() => { el.focus(); el.setSelectionRange(start + v.length, start + v.length) }, 0)
  }

  useEffect(() => {
    const rid = localStorage.getItem('restaurant_id')
    setRestaurantId(rid)
    setMounted(true)
    if (rid) {
      loadRestaurantInfo(rid)
      loadLogs(rid)
      loadTemplates(rid)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadRestaurantInfo = async (rid: string) => {
    const { data } = await supabase
      .from('restaurants')
      .select('name')
      .eq('id', rid)
      .maybeSingle()
    if (data) setRestName((data.name as string) ?? '')
  }

  const loadLogs = async (rid: string) => {
    setLoadingLogs(true)
    const { data } = await supabase
      .from('whatsapp_logs')
      .select('*')
      .eq('restaurant_id', rid)
      .order('sent_at', { ascending: false })
      .limit(50)
    setLogs((data ?? []) as WaLog[])
    setLoadingLogs(false)
  }

  const loadTemplates = async (rid: string) => {
    setLoadingTemplates(true)
    const { data } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('restaurant_id', rid)
      .order('created_at', { ascending: false })
    setTemplates((data ?? []) as WaTemplate[])
    setLoadingTemplates(false)
  }

  const loadContacts = useCallback(async () => {
    if (!restaurantId || contactsLoaded) return
    setLoadingContacts(true)
    const [custRes, membRes] = await Promise.all([
      supabase
        .from('customers')
        .select('id, name, phone')
        .eq('restaurant_id', restaurantId)
        .eq('status', 'active')
        .order('name'),
      supabase
        .from('members')
        .select('id, name, phone')
        .eq('restaurant_id', restaurantId)
        .eq('status', 'active')
        .order('name'),
    ])
    const custs = ((custRes.data ?? []) as { id: string; name: string; phone: string | null }[])
      .map(c => ({ ...c, type: 'customer' as const }))
    const membs = ((membRes.data ?? []) as { id: string; name: string; phone: string | null }[])
      .map(m => ({ ...m, type: 'member' as const }))
    setContacts([...custs, ...membs])
    setContactsLoaded(true)
    setLoadingContacts(false)
  }, [restaurantId, contactsLoaded, supabase])

  const addManual = () => {
    const phone = manualPhone.trim()
    if (!phone) return
    const name = manualName.trim() || phone
    const id = `manual-${Date.now()}`
    if (recipients.some(r => r.phone === phone)) return
    setRecipients(rs => [...rs, { id, name, phone, type: 'manual' }])
    setManualPhone('')
    setManualName('')
  }

  const addContact = (c: Contact) => {
    if (!c.phone) return
    if (recipients.some(r => r.phone === c.phone)) return
    setRecipients(rs => [...rs, { id: c.id, name: c.name, phone: c.phone!, type: c.type }])
  }

  const removeRecipient = (id: string) => setRecipients(rs => rs.filter(r => r.id !== id))

  const logSend = (r: Recipient, msg: string) => {
    if (!restaurantId) return
    supabase
      .from('whatsapp_logs')
      .insert({
        restaurant_id: restaurantId,
        recipient_name: r.name,
        phone: r.phone,
        message: msg,
      })
      .then(() => loadLogs(restaurantId))
  }

  const openWa = (idx: number) => {
    const r = recipients[idx]
    if (!r) return
    const phone = formatWaPhone(r.phone)
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer'
    )
    logSend(r, message)
  }

  const startSend = () => {
    if (recipients.length === 0 || !message.trim()) return
    setSending(true)
    setSendIndex(0)
    setSendDone(false)
    openWa(0)
  }

  const sendNext = () => {
    const next = sendIndex + 1
    if (next >= recipients.length) {
      setSendDone(true)
      setSending(false)
      return
    }
    setSendIndex(next)
    openWa(next)
  }

  // ── Template CRUD ──────────────────────────────────────────
  const startEditTemplate = (tpl: WaTemplate) => {
    setEditingTemplate(tpl)
    setTemplateName(tpl.name)
    setTemplateMessage(tpl.message)
  }

  const cancelEditTemplate = () => {
    setEditingTemplate(null)
    setTemplateName('')
    setTemplateMessage('')
  }

  const saveTemplate = async () => {
    if (!restaurantId || !templateName.trim() || !templateMessage.trim()) return
    setSavingTemplate(true)
    setTemplateError(null)
    let error
    if (editingTemplate) {
      ;({ error } = await supabase
        .from('whatsapp_templates')
        .update({ name: templateName.trim(), message: templateMessage.trim() })
        .eq('id', editingTemplate.id))
    } else {
      ;({ error } = await supabase
        .from('whatsapp_templates')
        .insert({ restaurant_id: restaurantId, name: templateName.trim(), message: templateMessage.trim() }))
    }
    setSavingTemplate(false)
    if (error) {
      setTemplateError(error.message)
      return
    }
    setEditingTemplate(null)
    setTemplateName('')
    setTemplateMessage('')
    loadTemplates(restaurantId)
  }

  const deleteTemplate = async (id: string) => {
    if (!restaurantId) return
    setDeletingId(id)
    await supabase.from('whatsapp_templates').delete().eq('id', id)
    setDeletingId(null)
    loadTemplates(restaurantId)
  }

  const useTemplate = (tpl: WaTemplate) => {
    setMessage(tpl.message)
    setActiveTab('send')
  }

  const filteredContacts = contacts.filter(c => {
    const q = contactSearch.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)
  })

  if (!mounted) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: WA_GREEN }} />
    </div>
  )

  return (
    <div className="max-w-5xl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${WA_GREEN}25` }}>
          <MessageCircle className="w-5 h-5" style={{ color: WA_GREEN }} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">{t.wa_title}</h1>
          <p className="text-xs text-white/40">{t.wa_subtitle}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl bg-white/4 border border-white/8 mb-5 w-fit">
        {([ 'send', 'templates' ] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              activeTab === tab
                ? 'text-white shadow-md'
                : 'text-white/40 hover:text-white/70',
            )}
            style={activeTab === tab ? { background: WA_GREEN, boxShadow: `0 4px 14px ${WA_GREEN}40` } : undefined}
          >
            {tab === 'send' ? <Send className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            {tab === 'send' ? t.wa_tab_send : t.wa_tab_templates}
          </button>
        ))}
      </div>

      {/* ════════════════════ SEND TAB ════════════════════ */}
      {activeTab === 'send' && (
        <div className={cn('flex gap-5 items-start', isRTL && 'flex-row-reverse')}>

          {/* ── Left column: Composer ───────────────────────── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Recipients */}
            <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
                <Users className="w-4 h-4" style={{ color: WA_GREEN }} />
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.wa_recipients}</span>
                {recipients.length > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold text-white/50 bg-white/8">
                    {recipients.length}
                  </span>
                )}
              </div>
              <div className="p-4 space-y-4">

                {/* Manual input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                    <Phone className="w-3 h-3" />{t.wa_manual_phone}
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={manualName}
                      onChange={e => setManualName(e.target.value)}
                      placeholder="Name (optional)"
                      className="w-32 shrink-0 px-3 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:border-[#25D366]/50 outline-none transition-all placeholder:text-white/20"
                    />
                    <input
                      value={manualPhone}
                      onChange={e => setManualPhone(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addManual()}
                      placeholder={t.wa_manual_placeholder}
                      className="flex-1 px-3 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:border-[#25D366]/50 outline-none transition-all placeholder:text-white/20"
                    />
                    <button
                      onClick={addManual}
                      disabled={!manualPhone.trim()}
                      className="px-3.5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center transition-all active:scale-95"
                      style={{ background: `${WA_GREEN}25`, border: `1px solid ${WA_GREEN}40` }}
                    >
                      <Plus className="w-4 h-4" style={{ color: WA_GREEN }} />
                    </button>
                  </div>
                </div>

                {/* From contacts */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3 h-3" />{t.wa_from_contacts}
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                    <input
                      value={contactSearch}
                      onChange={e => { setContactSearch(e.target.value); loadContacts() }}
                      onFocus={loadContacts}
                      placeholder={t.wa_search_contacts}
                      className="w-full pl-8 pr-3 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:border-[#25D366]/50 outline-none transition-all placeholder:text-white/20"
                    />
                  </div>

                  {loadingContacts && (
                    <p className="flex items-center gap-2 text-xs text-white/30 py-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                    </p>
                  )}

                  {contactsLoaded && (
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-white/8 bg-white/2 p-1">
                      {filteredContacts.length === 0 ? (
                        <p className="text-center py-4 text-xs text-white/25">No contacts found</p>
                      ) : (
                        filteredContacts.slice(0, 40).map(c => {
                          const already = recipients.some(r => r.phone === c.phone)
                          const noPhone = !c.phone
                          return (
                            <button
                              key={`${c.type}-${c.id}`}
                              onClick={() => addContact(c)}
                              disabled={already || noPhone}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-all',
                                already || noPhone
                                  ? 'opacity-35 cursor-not-allowed'
                                  : 'hover:bg-white/5 active:scale-[0.98]',
                              )}
                            >
                              <span className={cn(
                                'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0',
                                c.type === 'member'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-sky-500/20 text-sky-400'
                              )}>
                                {c.type === 'member' ? 'M' : 'C'}
                              </span>
                              <span className="flex-1 text-white/80 truncate">{c.name}</span>
                              <span className="text-white/30 text-xs shrink-0">{c.phone ?? 'No phone'}</span>
                              {already && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: WA_GREEN }} />}
                            </button>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Sending list */}
                {recipients.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">{t.wa_sending_list}</label>
                      <button
                        onClick={() => setRecipients([])}
                        className="text-[11px] text-white/25 hover:text-rose-400 transition-colors"
                      >
                        {t.wa_clear_list}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {recipients.map((r, i) => (
                        <div
                          key={r.id}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all',
                            sending && sendIndex === i
                              ? 'border'
                              : 'bg-white/4',
                          )}
                          style={sending && sendIndex === i
                            ? { background: `${WA_GREEN}15`, borderColor: `${WA_GREEN}40` }
                            : undefined}
                        >
                          {sending && sendIndex === i && (
                            <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: WA_GREEN }} />
                          )}
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0',
                            r.type === 'member' ? 'bg-amber-500/20 text-amber-400'
                              : r.type === 'manual' ? 'bg-violet-500/20 text-violet-400'
                              : 'bg-sky-500/20 text-sky-400'
                          )}>
                            {r.type[0].toUpperCase()}
                          </span>
                          <span className="flex-1 text-white/80 truncate">{r.name}</span>
                          <span className="text-white/30 text-xs shrink-0">{r.phone}</span>
                          {!sending && (
                            <button
                              onClick={() => removeRecipient(r.id)}
                              className="w-5 h-5 rounded-md flex items-center justify-center text-white/20 hover:text-rose-400 hover:bg-rose-500/10 transition-all shrink-0"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-center py-2 text-xs text-white/20">{t.wa_no_recipients}</p>
                )}
              </div>
            </div>

            {/* Message Composer */}
            <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
                <MessageCircle className="w-4 h-4" style={{ color: WA_GREEN }} />
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.wa_message}</span>
              </div>
              <div className="p-4 space-y-3">

                {/* Template quick picks */}
                {templates.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3 h-3" /> Templates
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {templates.map(tpl => (
                        <button
                          key={tpl.id}
                          onClick={() => setMessage(tpl.message)}
                          className="px-3 py-1.5 rounded-xl text-xs font-medium text-white/70 bg-white/5 border border-white/10 hover:border-[#25D366]/40 hover:text-white hover:bg-[#25D366]/10 transition-all active:scale-95"
                        >
                          {tpl.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <textarea
                  rows={6}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={t.wa_message_placeholder}
                  className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/5 border border-white/10 focus:border-[#25D366]/50 outline-none transition-all resize-none placeholder:text-white/20"
                />
                <p className="text-[11px] text-white/25">{message.length} chars</p>
              </div>
            </div>

            {/* Send Controls */}
            <div className="flex items-center gap-3">
              {!sending && !sendDone && (
                <button
                  onClick={startSend}
                  disabled={recipients.length === 0 || !message.trim()}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all active:scale-95"
                  style={{ background: WA_GREEN, boxShadow: `0 8px 24px ${WA_GREEN}35` }}
                >
                  <Send className="w-4 h-4" />
                  {recipients.length > 1 ? t.wa_send_all : 'Send on WhatsApp'}
                </button>
              )}

              {sending && !sendDone && (
                <>
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-white/60 bg-white/5 border border-white/10">
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: WA_GREEN }} />
                    <span>{sendIndex + 1} / {recipients.length}</span>
                  </div>
                  {recipients.length > 1 && (
                    <button
                      onClick={sendNext}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                      style={{ background: WA_GREEN }}
                    >
                      {t.wa_send_next} <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { setSending(false); setSendIndex(0) }}
                    className="px-4 py-3 rounded-xl text-sm text-white/40 bg-white/5 hover:bg-white/10 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                </>
              )}

              {sendDone && (
                <>
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border" style={{ color: WA_GREEN, background: `${WA_GREEN}15`, borderColor: `${WA_GREEN}30` }}>
                    <CheckCircle2 className="w-4 h-4" />{t.wa_done}
                  </div>
                  <button
                    onClick={() => { setSendDone(false); setSending(false); setSendIndex(0) }}
                    className="px-4 py-3 rounded-xl text-sm text-white/50 bg-white/5 hover:bg-white/10 transition-all active:scale-95"
                  >
                    New Send
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Right column: Preview + Log ─────────────────── */}
          <div className="w-72 shrink-0 space-y-4">

            {/* WhatsApp Chat Preview */}
            <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
                <MessageCircle className="w-4 h-4" style={{ color: WA_GREEN }} />
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.wa_preview}</span>
              </div>
              <div className="p-4">
                {/* Phone chrome */}
                <div className="rounded-2xl bg-[#0b141a] p-3 border border-white/8">
                  {/* Chat header */}
                  <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-white/8">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: WA_GREEN }}
                    >
                      {(restName[0] ?? 'R').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{restName || 'Your Restaurant'}</p>
                      <p className="text-[10px] text-white/30">online</p>
                    </div>
                  </div>
                  {/* Message bubble */}
                  <div className="flex justify-end">
                    <div
                      className="max-w-[88%] rounded-xl rounded-tr-sm px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words"
                      style={{ background: '#d9fdd3', color: '#111b21' }}
                    >
                      {message
                        ? message
                        : <span className="italic opacity-40">Your message preview…</span>
                      }
                      <p className="text-right text-[9px] opacity-50 mt-1 select-none">
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recipients summary */}
                {recipients.length > 0 && (
                  <div className="mt-3 px-3 py-2 rounded-xl bg-white/4 border border-white/8">
                    <p className="text-[11px] text-white/40">
                      Will be sent to <span className="text-white font-semibold">{recipients.length}</span> recipient{recipients.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Send History */}
            <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
                <History className="w-4 h-4 text-white/30" />
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.wa_log}</span>
                {!loadingLogs && logs.length > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold text-white/40 bg-white/8">
                    {logs.length}
                  </span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {loadingLogs && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-4 h-4 animate-spin text-white/25" />
                  </div>
                )}
                {!loadingLogs && logs.length === 0 && (
                  <p className="text-center py-8 text-xs text-white/20">{t.wa_no_log}</p>
                )}
                {!loadingLogs && logs.length > 0 && (
                  <div className="p-3 space-y-2">
                    {logs.map(log => (
                      <div key={log.id} className="p-2.5 rounded-xl bg-white/3 border border-white/6">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-white/70 truncate">{log.recipient_name}</p>
                          <span className="flex items-center gap-0.5 text-[10px] text-white/25 shrink-0">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(log.sent_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-[10px] text-white/30 mt-0.5">{log.phone}</p>
                        <p className="text-[10px] text-white/40 mt-1.5 line-clamp-2 leading-relaxed">{log.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ════════════════════ TEMPLATES TAB ════════════════════ */}
      {activeTab === 'templates' && (
        <div className={cn('flex gap-5 items-start', isRTL && 'flex-row-reverse')}>

          {/* ── Left: Template list ────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Custom Templates */}
            <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
                <FileText className="w-4 h-4" style={{ color: WA_GREEN }} />
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{t.wa_tab_templates}</span>
                {templates.length > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold text-white/50 bg-white/8">
                    {templates.length}
                  </span>
                )}
              </div>
              <div className="p-4">
                {loadingTemplates && (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: WA_GREEN }} />
                  </div>
                )}
                {!loadingTemplates && templates.length === 0 && (
                  <p className="text-center py-8 text-sm text-white/25">{t.wa_no_templates}</p>
                )}
                {!loadingTemplates && templates.length > 0 && (
                  <div className="space-y-2">
                    {templates.map(tpl => (
                      <div
                        key={tpl.id}
                        className={cn(
                          'rounded-2xl border p-4 transition-all',
                          editingTemplate?.id === tpl.id
                            ? 'border-[#25D366]/40 bg-[#25D366]/5'
                            : 'border-white/8 bg-white/2 hover:bg-white/4',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white truncate">{tpl.name}</p>
                            <p className="text-xs text-white/40 mt-1 line-clamp-3 leading-relaxed whitespace-pre-wrap">{tpl.message}</p>
                            <p className="text-[10px] text-white/20 mt-2">
                              {new Date(tpl.created_at).toLocaleDateString()} · {tpl.message.length} chars
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => useTemplate(tpl)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all active:scale-95"
                              style={{ background: WA_GREEN, boxShadow: `0 4px 12px ${WA_GREEN}30` }}
                              title={t.wa_use_template}
                            >
                              <Send className="w-3 h-3" />
                              {t.wa_use_template}
                            </button>
                            <button
                              onClick={() => startEditTemplate(tpl)}
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-amber-400 hover:bg-amber-500/10 transition-all active:scale-95"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteTemplate(tpl.id)}
                              disabled={deletingId === tpl.id}
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 transition-all active:scale-95"
                              title="Delete"
                            >
                              {deletingId === tpl.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />
                              }
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Hint */}
            <p className="px-1 text-[11px] text-white/20 leading-relaxed">{t.wa_templates_hint}</p>
          </div>

          {/* ── Right: Create / Edit form ──────────────────── */}
          <div className="w-80 shrink-0">
            <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden sticky top-6">
              <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
                {editingTemplate ? (
                  <Pencil className="w-4 h-4 text-amber-400" />
                ) : (
                  <Plus className="w-4 h-4" style={{ color: WA_GREEN }} />
                )}
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider">
                  {editingTemplate ? 'Edit Template' : t.wa_new_template}
                </span>
                {editingTemplate && (
                  <button
                    onClick={cancelEditTemplate}
                    className="ml-auto text-[11px] text-white/25 hover:text-white/60 transition-colors"
                  >
                    {t.wa_cancel_edit}
                  </button>
                )}
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">{t.wa_template_name}</label>
                  <input
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder={t.wa_template_name_ph}
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:border-[#25D366]/50 outline-none transition-all placeholder:text-white/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">{t.wa_message}</label>
                  <textarea
                    ref={templateTextareaRef}
                    rows={8}
                    value={templateMessage}
                    onChange={e => setTemplateMessage(e.target.value)}
                    placeholder={t.wa_message_placeholder}
                    className="w-full px-4 py-3 rounded-2xl text-sm text-white bg-white/5 border border-white/10 focus:border-[#25D366]/50 outline-none transition-all resize-none placeholder:text-white/20"
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { label: '{{total}}',     title: 'Order total amount' },
                      { label: '{{table}}',     title: 'Table number' },
                      { label: '{{menu_link}}', title: 'Online menu URL' },
                    ].map(({ label, title }) => (
                      <button
                        key={label}
                        type="button"
                        title={title}
                        onClick={() => insertVariable(label)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all active:scale-95"
                        style={{ background: `${WA_GREEN}18`, border: `1px solid ${WA_GREEN}35`, color: WA_GREEN }}
                      >
                        {label}
                      </button>
                    ))}
                    <span className="text-[10px] text-white/20 self-center ml-1">click to insert at cursor</span>
                  </div>
                  <p className="text-[11px] text-white/25">{templateMessage.length} chars</p>
                </div>

                {/* Preview bubble */}
                {templateMessage && (
                  <div className="rounded-xl bg-[#0b141a] p-3 border border-white/8">
                    <div className="flex justify-end">
                      <div
                        className="max-w-full rounded-xl rounded-tr-sm px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words"
                        style={{ background: '#d9fdd3', color: '#111b21' }}
                      >
                        {templateMessage}
                        <p className="text-right text-[9px] opacity-50 mt-1 select-none">
                          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {templateError && (
                  <div className="px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-400 leading-relaxed">
                    <span className="font-semibold">Error: </span>{templateError}
                  </div>
                )}

                <button
                  onClick={saveTemplate}
                  disabled={savingTemplate || !templateName.trim() || !templateMessage.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all active:scale-[0.98]"
                  style={{ background: WA_GREEN, boxShadow: `0 8px 24px ${WA_GREEN}35` }}
                >
                  {savingTemplate
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Save className="w-4 h-4" />
                  }
                  {editingTemplate ? t.wa_update_template : t.wa_save_template}
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  )
}
