export interface ModuleDef {
  key: string
  label: string
  description: string
  category: string
}

export const MODULES: ModuleDef[] = [
  { key: 'menu',        label: 'Menu',         description: 'Menu items, categories & modifiers',      category: 'Operations' },
  { key: 'dine_in',     label: 'Dine In',      description: 'Table service & order management',        category: 'Operations' },
  { key: 'delivery',    label: 'Delivery',     description: 'Delivery orders & management',            category: 'Operations' },
  { key: 'takeout',     label: 'Takeout',      description: 'Takeout & pickup orders',                 category: 'Operations' },
  { key: 'bar',         label: 'Coffee Bar',   description: 'Bar and beverage management',             category: 'Operations' },
  { key: 'reservation', label: 'Reservation',  description: 'Table reservations & bookings',           category: 'Operations' },
  { key: 'kds',         label: 'KDS Monitor',  description: 'Kitchen display system & order routing',  category: 'Operations' },
  { key: 'inventory',   label: 'Inventory',    description: 'Stock & ingredient tracking',             category: 'Operations' },
  { key: 'sales',       label: 'Sales',        description: 'Sales reports & daily summaries',         category: 'Finance' },
  { key: 'expense',     label: 'Expense',      description: 'Business expense tracking',               category: 'Finance' },
  { key: 'pay_later',   label: 'Pay Later',    description: 'Credit & deferred payment management',    category: 'Finance' },
  { key: 'report',      label: 'Reports',      description: 'Advanced financial & operational reports', category: 'Finance' },
  { key: 'member',      label: 'Members',      description: 'Loyalty program & membership management', category: 'People' },
  { key: 'customer',    label: 'Customers',    description: 'Customer directory & profiles',           category: 'People' },
  { key: 'whatsapp',    label: 'WhatsApp',     description: 'WhatsApp marketing & notifications',      category: 'Marketing' },
]

export const MODULE_CATEGORIES = ['Operations', 'Finance', 'People', 'Marketing'] as const

// Map settings path prefixes to module keys
export const SETTINGS_PATH_MODULE_MAP: [string, string][] = [
  ['/dashboard/settings/menu',        'menu'],
  ['/dashboard/settings/dine-in',     'dine_in'],
  ['/dashboard/settings/delivery',    'delivery'],
  ['/dashboard/settings/takeout',     'takeout'],
  ['/dashboard/settings/bar',         'bar'],
  ['/dashboard/settings/reservation', 'reservation'],
  ['/dashboard/settings/kds-monitor', 'kds'],
  ['/dashboard/settings/inventory',   'inventory'],
  ['/dashboard/settings/sales',       'sales'],
  ['/dashboard/settings/expense',     'expense'],
  ['/dashboard/settings/pay-later',   'pay_later'],
  ['/dashboard/settings/report',      'report'],
  ['/dashboard/settings/member',      'member'],
  ['/dashboard/settings/customer',    'customer'],
  ['/dashboard/settings/whatsapp',    'whatsapp'],
]

export function getSettingsModuleKey(pathname: string): string | null {
  for (const [prefix, key] of SETTINGS_PATH_MODULE_MAP) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return key
  }
  return null
}

/** Returns true if the module is enabled. Missing key = enabled by default. */
export function isModuleEnabled(modules: Record<string, boolean> | undefined | null, key: string): boolean {
  if (!modules || !(key in modules)) return true
  return modules[key] === true
}
