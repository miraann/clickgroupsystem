import { sendPrinterBytes } from '@/lib/sendToPrinter'

// Print a table's digital-menu QR to the Receipt / Cashier printer.
// Mirrors printReceiptBytes: POST the job, then hand the ESC/POS bytes to
// whatever transport the current runtime has (Electron / Android / WebUSB).
export async function printTableQr(restaurantId: string, tableNumber: string, url: string): Promise<void> {
  const res  = await fetch('/api/print/table-qr', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ restaurantId, tableNumber, url }),
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
