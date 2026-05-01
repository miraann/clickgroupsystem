export interface Item         { name: string; price: number; qty: number }
export interface DbDiscount  { id: string; name: string; type: 'percentage' | 'fixed'; value: number; min_order: number; active: boolean }
export interface DbSurcharge { id: string; name: string; type: 'percentage' | 'fixed'; value: number; applied_to: string; active: boolean }
export interface DbPayMethod { id: string; name: string; icon_type: string; is_default: boolean }
export type ActionTab = 'surcharge' | 'gratuity' | 'discount' | 'note' | 'split' | 'paylater'
