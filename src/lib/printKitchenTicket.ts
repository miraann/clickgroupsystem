import { sendPrinterBytes } from '@/lib/sendToPrinter'

export interface KitchenTicketParams {
  restaurantId: string
  tableNum:     string
  orderNum?:    string | null
  items:        { name: string; qty: number; note?: string | null }[]
  note?:        string | null
}

// Fetches the ESC/POS bytes for a kitchen ticket and prints them silently.
// Resolves on success; throws with a readable message when no printer path
// worked — the caller (print queue) records that as a failed job.
export async function printKitchenTicket(params: KitchenTicketParams): Promise<void> {
  const now     = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const res  = await fetch('/api/print/kitchen', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...params, timeStr, dateStr }),
  })
  const json = await res.json().catch(() => null)
  if (!json?.ok || !json.bytes) throw new Error(json?.error ?? 'Kitchen printer is not set up')

  await sendPrinterBytes({
    bytes:          json.bytes,
    connectionType: json.connectionType ?? '',
    printerName:    json.printerName ?? null,
    ipAddress:      json.ipAddress ?? null,
    btAddress:      json.btAddress ?? null,
    port:           json.port ?? 9100,
  })
}
