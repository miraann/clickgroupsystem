// A printer can serve several roles. `printers.purposes` (text[]) is the source
// of truth; `printers.purpose` (text) is kept in sync with purposes[0] so any
// pre-existing reader still works — and so this code keeps working even if the
// `purposes` column migration hasn't been applied yet.

export type PrinterPurpose = 'receipt' | 'kitchen' | 'label' | 'bar'

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
 * Pass rows already scoped to one restaurant.
 */
export function pickPrinter<T extends { purpose?: string | null; purposes?: string[] | null; active?: boolean | null; sort_order?: number | null }>(
  rows: T[] | null | undefined,
  purpose: PrinterPurpose,
): T | null {
  return (rows ?? [])
    .filter(r => (r.active ?? true) && printerHasPurpose(r, purpose))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0] ?? null
}
