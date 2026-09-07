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
  paymentMethodType?: string | null
  amountPaid:    number
  change:        number
  note?:         string | null
  mode:          string
  qrUrl?:        string | null
}

// A stored `invoices` row, as loaded on the sales / invoices screens.
export interface StoredInvoiceLike {
  invoice_num:     string | number
  order_num?:      string | number | null
  table_num?:      string | null
  guests?:         number | null
  cashier?:        string | null
  payment_method?: string | null
  items?:          Array<{ name: string; price: number; qty: number; isDeliveryFee?: boolean }> | null
  subtotal:        number | string
  discount:        number | string
  total:           number | string
  amount_paid?:    number | string | null
  change_amount?:  number | string | null
  created_at:      string
}

// Map a stored invoice row to the /api/print/receipt body for a re-print,
// keeping the original invoice's timestamp. Shared by every "reprint an old
// receipt" entry point so they all produce an identical ticket.
export function reprintBodyFromInvoice(inv: StoredInvoiceLike, restaurantId: string): ReceiptPrintBody {
  const ts          = new Date(inv.created_at)
  const allItems    = inv.items ?? []
  const regular     = allItems.filter(it => !it.isDeliveryFee)
  const deliveryFee = allItems.find(it => it.isDeliveryFee)
  return {
    restaurantId,
    tableNum:      inv.table_num ?? '',
    guests:        inv.guests ?? 0,
    invoiceNum:    inv.invoice_num,
    orderNum:      inv.order_num ?? '',
    cashier:       inv.cashier ?? '',
    dateStr:       ts.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    timeStr:       ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    items:         regular.map(it => ({ name: it.name, qty: it.qty, price: it.price })),
    subtotal:      Number(inv.subtotal),
    discount:      Number(inv.discount),
    surcharge:     deliveryFee ? Number(deliveryFee.price) : 0,
    total:         Number(inv.total),
    paymentMethod: inv.payment_method ?? '—',
    amountPaid:    Number(inv.amount_paid ?? 0),
    change:        Number(inv.change_amount ?? 0),
    note:          null,
    mode:          'receipt',
  }
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
