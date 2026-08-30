import { sendPrinterBytes } from '@/lib/sendToPrinter'

// Thin wrapper around POST /api/print/receipt + the physical dispatch.
// The body is passed straight through to the route (each caller already
// builds this exact shape), so date/time formatting stays with the caller
// — a re-print of an old invoice keeps the original timestamp.

export interface ReceiptPrintBody {
  restaurantId:  string
  tableNum:      string
  guests:        number
  invoiceNum?:   string | number | null
  orderNum?:     string | number | null
  cashier:       string
  dateStr:       string
  timeStr:       string
  items:         { name: string; qty: number; price: number }[]
  subtotal:      number
  discount:      number
  surcharge:     number
  total:         number
  paymentMethod: string
  amountPaid:    number
  change:        number
  note?:         string | null
  mode:          string
  qrUrl?:        string | null
}

export async function printReceiptBytes(body: ReceiptPrintBody): Promise<void> {
  const res  = await fetch('/api/print/receipt', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!json?.ok || !json.bytes) throw new Error(json?.error ?? 'Receipt printer is not set up')

  await sendPrinterBytes({
    bytes:          json.bytes,
    connectionType: json.connectionType ?? '',
    printerName:    json.printerName ?? null,
    ipAddress:      json.ipAddress ?? null,
    btAddress:      json.btAddress ?? null,
    port:           json.port ?? 9100,
  })
}
