// Barrel — re-exports the same public surface as before the split.
// Implementation lives in escpos/commands.ts, escpos/kitchen.ts, escpos/receipt.ts.
export { escpos }                          from './escpos/commands'
export type { KitchenPayload }             from './escpos/kitchen'
export { buildKitchenBytes }               from './escpos/kitchen'
export type { ReceiptPayload }             from './escpos/receipt'
export { buildReceiptBytes }               from './escpos/receipt'
