// A printer can serve several roles. `printers.purposes` (text[]) is the source
// of truth; `printers.purpose` (text) is kept in sync with purposes[0] so any
// pre-existing reader still works — and so this code keeps working even if the
// `purposes` column migration hasn't been applied yet.

export type PrinterPurpose =
  | 'receipt'   // customer receipt at payment
  | 'kitchen'   // kitchen ticket
  | 'label'     // label printer
  | 'bar'       // bar / drinks ticket
  | 'report'    // Daily Sales report  (falls back to 'receipt')
  | 'reprint'   // one-tap reprint of an old invoice  (falls back to 'receipt')

/** All roles a loaded printer row serves, tolerating the legacy scalar-only shape. */
export function printerPurposes(p: { purpose?: string | null; purposes?: string[] | null }): PrinterPurpose[] {
  const list = p.purposes && p.purposes.length ? p.purposes : p.purpose ? [p.purpose] : ['receipt']
  return list.filter(Boolean) as PrinterPurpose[]
}

/** Does this printer row serve `purpose`? */
export function printerHasPurpose(
  p: { purpose?: string | null; purposes?: string[] | null },
  purpose: PrinterPurpose,
): boolean {
  return printerPurposes(p).includes(purpose)
}

/**
 * Pick the active printer that serves `purpose` from a set of restaurant rows,
 * lowest `sort_order` first — replaces the old `.eq('purpose', …)` filter.
 * Pass rows already scoped to one restaurant. `purpose` may be a list, tried in
 * order (e.g. `['report', 'receipt']` = "the reports printer, else the receipt
 * printer").
 */
export function pickPrinter<T extends { purpose?: string | null; purposes?: string[] | null; active?: boolean | null; sort_order?: number | null }>(
  rows: T[] | null | undefined,
  purpose: PrinterPurpose | PrinterPurpose[],
): T | null {
  const wanted = Array.isArray(purpose) ? purpose : [purpose]
  const active = (rows ?? [])
    .filter(r => r.active ?? true)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  for (const w of wanted) {
    const hit = active.find(r => printerHasPurpose(r, w))
    if (hit) return hit
  }
  return null
}
