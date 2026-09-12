// Starter `restaurant_roles` rows seeded for every restaurant so an owner
// doesn't have to build common roles from an empty permission map by hand.
// Permission keys are the leaves of PERMISSION_TREE
// (src/app/(restaurant)/dashboard/settings/users/page.tsx) and must match it.
export const DEFAULT_ROLES: { name: string; permissions: Record<string, boolean> }[] = [
  {
    // Dine-in counter operator: open the dashboard, start orders, send to
    // kitchen, take payment. `dashboard.access` is required alongside
    // `dine_in` — getStaffHome() routes here for either flag, but the
    // dashboard page itself hard-gates on `dashboard.access` and would
    // otherwise bounce a dine_in-only staffer back out.
    name: 'Cashier',
    permissions: {
      'dashboard.access': true,
      dine_in: true,
      'dashboard.btn_new_order': true,
      'dashboard.order.send_kitchen': true,
      'dashboard.pay': true,
      'dashboard.receipt': true,
      'dashboard.discount': true,
      'dashboard.drawer': true,
      'dashboard.customer': true,
    },
  },
  {
    // Delivery driver: lands straight on /dashboard/driver. No dashboard.access
    // on purpose — keeps a driver PIN account out of the main dashboard.
    name: 'Driver',
    permissions: {
      driver_screen: true,
      'manage_delivery.be_driver': true,
      'manage_delivery.departure': true,
    },
  },
  {
    // Customer-facing display terminal: PIN login opens /cfd/[slug] directly.
    name: 'CFD',
    permissions: { cfd: true },
  },
  {
    // Kitchen display terminal: PIN login opens /dashboard/kds directly.
    name: 'KDS',
    permissions: { kds: true },
  },
]
