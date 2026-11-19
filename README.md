# ClickGroup POS

An all-in-one restaurant and café management system: cashier POS, kitchen display,
QR table ordering, online menu and delivery, inventory, finance reports, staff
roles, WhatsApp messaging and a reseller (seller) panel. Fully translated to
**Kurdish (Sorani), Arabic and English**, with right-to-left layouts.

One Next.js web app is the product. It runs:

- **in the browser** (hosted on Vercel, data in Supabase),
- inside a **Windows desktop app** (Electron, `electron-app/`),
- inside **six Android apps** (Capacitor, `android/`),
- and as a fully **offline Windows edition** with its own local database (`offline/` + `electron-offline/`).

---

## Contents

1. [Apps and screens at a glance](#apps-and-screens-at-a-glance)
2. [Features](#features)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [Getting started](#getting-started)
6. [Database and migrations](#database-and-migrations)
7. [Building the native apps](#building-the-native-apps)
8. [Security model](#security-model)
9. [Known gaps](#known-gaps)

---

## Apps and screens at a glance

| Who uses it | Route | What it is |
|---|---|---|
| Restaurant owner / staff | `/restaurant-login` → `/restaurant-login/<slug>/pin` or `/pos/<slug>/login` | Email + password once per device, then owner PIN or staff PIN |
| Cashier / waiter | `/dashboard` | Floor plan, tables, orders, payments |
| Cashier / waiter | `/dashboard/order/<table>` | Order screen for one table |
| Kitchen | `/dashboard/kds` | Kitchen display system |
| Delivery desk | `/dashboard/delivery-orders` | Incoming delivery orders, driver dispatch |
| Driver | `/dashboard/driver` | The driver's own assigned orders |
| Counter | `/dashboard/takeout-orders`, `/dashboard/pending-orders` | Takeout orders and QR orders waiting to be handled |
| Owner / manager | `/dashboard/settings/*` | All configuration, reports and management |
| Customer at the counter | `/cfd/<slug>` | Customer-facing display (live bill, thank-you, feedback) |
| Guest at a table | `/guest/<tableId>` | QR table ordering and waiter call |
| Public | `/r/<slug>` | Online menu (view only) |
| Public | `/order/<slug>` | Online delivery ordering and order tracking |
| Reseller (seller) | `/seller-login` → `/seller/*` | Manage restaurants, plans, subscriptions, offline licences |

---

## Features

### 1. Cashier POS dashboard

`src/app/(restaurant)/dashboard/page.tsx`

- **Floor plan** of all tables, grouped by table group, with saved positions and
  decorative floor elements (walls, plants etc., with rotation).
- Live table status: free / occupied, elapsed time since the table opened, order total.
- **Move table** (move an order to another table) and **merge tables** (combine
  orders; the source is only cancelled once it is verifiably empty).
- Print the bill straight from the table sheet.
- Header shortcuts (each can be hidden per role): reports, audit log, waiter
  calls, KDS, CFD, guests, language switch, inventory notification bell,
  print queue, activity toasts.
- Bottom navigation: new order, QR orders, delivery, takeout, settings.
- Realtime updates across every device, with automatic re-sync after a
  connection drop (`src/lib/realtimeResync.ts`).
- Inactivity auto-logout and screen wake-lock options.

### 2. Order screen

`src/app/(restaurant)/dashboard/order/[table]/`

- Photo menu by category, item options (modifiers), kitchen notes.
- Draft items vs. items already sent to the kitchen.
- **Send to kitchen** is atomic: one database transaction under a per-table lock
  finds or creates the order, assigns its order number and inserts all items, so
  two devices can never open the same table twice (`src/lib/orderSend.ts`).
- Edit guest count, void item (with a reason), item discount, transfer item to
  another table, change price — each permission-controlled.
- Open the customer-facing display for this table.

### 3. Payment and invoices

`src/components/restaurant/payment-screen.tsx`, `src/components/restaurant/InvoiceModal/`

- Multiple payment methods (configurable), cash change calculation.
- Discounts, surcharges, gratuity / tip, free-text note.
- **Split bill**.
- **Pay later** (customer credit), linked to a customer record.
- Attach a **member** (loyalty points) or a **customer** to the sale.
- Open the cash drawer.
- Print receipt, or send the receipt by **WhatsApp**.
- Live bill updates are broadcast to the customer-facing display.
- Payment is finalised server-side (`/api/payment/finalize`).

### 4. Kitchen Display System (KDS)

`src/app/(restaurant)/dashboard/kds/page.tsx`, Settings → KDS Monitor

- Orders appear in real time (plus polling as a backup).
- **KDS stations** with category routing (e.g. grill, drinks); each station sees
  only its items.
- Start / ready per item, or bulk actions per station.
- Configurable new-order alert sounds (several synthesised tones).
- **KDS Monitor** in settings: history of kitchen orders, aggregate stats, filters, order detail.

### 5. Printing

`src/lib/escpos/`, `src/lib/print*.ts`, `src/app/api/print/*`

- ESC/POS generation for **kitchen tickets, receipts, daily sales reports and table QR codes**.
- **Kurdish and Arabic printing on any thermal printer**: right-to-left text is
  rendered to a bitmap and printed as raster, so printers without an Arabic font
  ROM still print correctly. English-mode receipts translate common Kurdish/Arabic
  terms to plain ASCII.
- Paper width setting (58 / 80 mm).
- **Printer purposes**: one printer can serve several roles (receipt, kitchen,
  report, reprint…).
- Works across every runtime; the right transport is picked automatically
  (`src/lib/sendToPrinter.ts`):
  - Windows desktop app: network (IP) printers and Windows-installed printers,
  - Android apps: raw TCP to network printers through a native plugin,
  - Browser: WebUSB and Bluetooth (BLE) thermal printers, or the system print dialog,
  - Offline edition: the PC prints on behalf of waiter tablets.
- **Print queue** with job history and a retry button; jobs run one at a time so
  printers never get interleaved data.
- Settings → Device: find printers on the local network, test connections,
  manage KDS screens.
- **Duplicate-receipt fraud check**: orders whose unpaid receipt was printed more
  than once are flagged, with a per-print log (Settings → Receipt).

### 6. Customer-Facing Display (CFD)

`src/app/cfd/`

- A second screen facing the customer. Paired once with the restaurant's email
  and password, then opens straight to the display.
- Switches automatically to the table the cashier is paying, and shows the bill
  live as discounts, surcharges and tips are applied.
- Thank-you screen with countdown and **customer feedback** collection.
- Keep-screen-awake option.

### 7. QR table ordering and waiter call

`src/app/guest/[tableId]/page.tsx`, Settings → Dine In

- Each table has a QR code (printable from Settings → Menu → Table).
- Guests browse the menu, order from their phone, and follow the status of their
  items live.
- **One-tap waiter call**, shown to staff as a call alert.
- Settings: enable QR ordering, auto-accept guest orders or review them first
  (Pending Orders screen), require guest count, table turnover time, guest message.

### 8. Online menu and delivery ordering

`src/app/r/[slug]`, `src/app/order/[slug]`, Settings → Menu → Online Menu, Settings → Delivery

- **Public online menu** with several visual templates and an online menu designer
  (presets, colours, category / item / event / social styles, live phone preview).
- Event and offer "stories" with images.
- **Delivery ordering** for customers:
  - ordering hours (including windows across midnight),
  - separate delivery prices per item, per-channel item availability,
  - pick the delivery location on a map (Leaflet),
  - **delivery zones** with their own fees,
  - **discount / coupon codes** (expiry, usage limits, minimum order), checked server-side,
  - optional **face-scan selfie** at checkout to reduce fake orders,
  - prices, fees and discounts are recalculated on the server.
- **Order tracking** by phone number, refreshing automatically.

### 9. Delivery management and driver app

`src/app/(restaurant)/dashboard/delivery-orders`, `src/app/(restaurant)/dashboard/driver`

- Incoming delivery orders with new-order alerts (sound + push notification).
- Move orders through their statuses, assign a driver, send to the kitchen.
- Send WhatsApp confirmations/receipts to the customer from templates.
- **Driver screen**: drivers see only their own orders, get push alerts when
  assigned, mark departure/delivered, open the address on a map; works with a
  cached copy when the connection drops.
- Delivery history and reports in Settings → Delivery.

### 10. Takeout, coffee bar, reservations

- **Takeout**: takeout orders screen, enable/disable, preparation time, takeout button on the dashboard.
- **Coffee bar**: bar tabs, **happy hour** (time window + discount %), age
  verification prompt, auto-close tabs after a set time, staff note.
- **Reservations**: party size, status (confirmed etc.), search and filter.

### 11. Menu management

Settings → Menu (`src/app/(restaurant)/dashboard/settings/menu/`)

| Section | What it does |
|---|---|
| Category | Menu categories, sortable |
| Item | Items with photo (auto-compressed to WebP), price, delivery price, modifiers, ingredients for inventory |
| Modifier | Option groups (sizes, extras) with option prices |
| Kitchen note | Quick notes for the kitchen |
| Void reason | Reasons required when voiding items |
| Event & offer | Promotional events with images, drag-to-sort |
| Discount | Named discounts for the payment screen |
| Combo discount | Discounts when items are bought together |
| Discount code | Coupon codes for online orders |
| Surcharge | Service charges and other surcharges |
| Payment method | Cash, card and custom methods |
| Table group / Table | Areas and tables, with QR codes |
| Online menu | The public menu designer |
| Order number / Invoice number | Numbering format and reset rules |

### 12. Inventory

Settings → Inventory, `src/hooks/useInventory*.ts`

- Stock items with categories and units.
- Ingredients linked to menu items, so sales use up stock.
- **Alerts** for low stock, out of stock, expiring soon and expired, shown in the
  dashboard notification bell and as push notifications.
- Expiry checking runs on a schedule (`/api/inventory/check-expiry`, called by
  Vercel Cron, and the `check-inventory-expiry` Supabase function).

### 13. Finance and reports

| Screen | What it shows |
|---|---|
| Finance | KPIs with trend vs. the previous period, revenue chart, payment method and expense breakdowns, transaction timeline, daily report for any past date, CSV export |
| Sales | Sales list with filters, 7-day growth, realtime updates, CSV export |
| Reports | Daily revenue, payment methods, top items, cashier performance, expenses by category, CSV export |
| Expense | Expenses with categories and receipt photo upload |
| Pay later | Outstanding customer credit and repayments |
| Receipt | All invoices, silent reprint, invoice/order numbering, **recover table** (re-open a closed table), flagged reprints |
| Void items | Every voided item with reason, by date range |
| Guests | Guest counts and average order by hour, day, week, month and year, peak times |
| Daily sales | Print the end-of-day sales report |

### 14. People: users, roles, members, customers

- **Users & roles** (Settings → Users): build roles from a detailed permission
  tree — dashboard buttons, page access, order and payment screen buttons, menu
  sections, settings sections, finance, delivery. Starter roles are created for
  every restaurant: Cashier, Driver, CFD and KDS.
- **Staff PINs** (stored hashed) — each PIN login opens the screen that suits
  the role (e.g. a KDS PIN goes straight to the kitchen display).
- Role permissions are enforced on the server for sensitive actions, not only hidden in the UI.
- **Members**: loyalty programme with tiers (Standard, Silver, Gold, Platinum) and points.
- **Customers**: customer directory with order history.

### 15. WhatsApp

Settings → WhatsApp

- Send messages to selected customers/members with a send queue and log.
- Message templates (built-in + your own) for receipts, delivery confirmation and delivery receipt.

### 16. Audit log and activity

- Every important action (orders, voids, payments, settings changes, waiter
  calls…) is written to the **audit log**, viewable with filters.
- Optional live **activity toasts** on the dashboard.

### 17. Notifications

- **Web Push** (VAPID) for browsers and installed web apps.
- **Firebase Cloud Messaging** for the Android apps (delivery and driver alerts).
- Android helper that detects battery-optimisation and background restrictions
  that would block alerts, and opens the right system screen to fix them.

### 18. Appearance, preferences, languages

- **Appearance**: dashboard themes (dark and light backgrounds, glass,
  cyberpunk, table shapes, navigation button styles) with a live mini preview.
- **Preference**: alert sounds, behaviour toggles, push notification opt-in.
- **Restaurant info**: name, logo, contact details, social links, currency.
- **Languages**: Kurdish (Sorani), Arabic and English (`src/lib/i18n/`), with
  full right-to-left support; the public menus have their own language switcher.

### 19. Advanced, database and apps

- **Advanced** (owner only): app version and **in-app updates** for the Windows
  and Android apps, offline-edition licence and online connection, tablet address and QR code (offline edition).
- **Database** (owner only): storage usage, export backup, restore from backup,
  retention cleanup, GDPR delete — restore and delete need the owner PIN, checked on the server.
- **Apps** (owner only): download links for every Android app.

### 20. Plan modules

Each restaurant's plan can switch modules on or off (`src/lib/modules/index.ts`):

| Category | Modules |
|---|---|
| Operations | Menu, Dine In, Delivery, Takeout, Coffee Bar, Reservation, KDS Monitor, Inventory |
| Finance | Sales, Expense, Pay Later, Reports |
| People | Members, Customers |
| Marketing | WhatsApp |

A disabled module hides its screens, settings and role permissions.

### 21. Seller (reseller) panel

`src/app/(seller)/seller/`

- Overview and **analytics** across all restaurants.
- **Restaurants**: create (automatically creates the login account, hashed
  password and owner PIN), edit, suspend, delete.
- **Plans** (which modules each plan includes) and **subscriptions**.
- Seller **users** and settings.
- **Offline licences**: create signed licence / renewal codes, and download a
  `.cgsetup` file to set up a PC with no internet.

### 22. Offline edition (Windows)

`offline/`, `electron-offline/` — full details in [offline/README.md](offline/README.md).

- The same app running on the restaurant's own PC with an embedded PostgreSQL
  and a local Supabase-compatible backend (REST, auth, storage, realtime).
- Waiter tablets on the same Wi-Fi open the PC's address in a browser.
- Three ways to set up: sign in online once, open a setup file from USB, or create a new restaurant on the PC.
- Signed, time-limited **licences** with a 3-day grace period after expiry.
- Optional **connection to the online system**: sales upload every minute when internet is available.
- Daily backups (14 kept), restore and backup folder choice from the tray icon.
- Delivery, QR/online ordering and WhatsApp are switched off in this edition
  since they need the internet (`src/lib/edition.ts`).

### 23. Native apps

**Windows desktop app** (`electron-app/`): thin shell around the live web app;
remembers the restaurant so it opens on the PIN screen, prints to network and
Windows printers, runs from the tray, updates itself from GitHub Releases.

**Android apps** (`android/`, one Capacitor project, six apps) — see [docs/ANDROID_APPS.md](docs/ANDROID_APPS.md):

| App | Opens to |
|---|---|
| ClickGroup Cashier | Dashboard (PIN screen once paired) |
| ClickGroup Driver | Driver screen |
| ClickGroup Delivery | Delivery orders only (single-screen kiosk) |
| ClickGroup Seller | Seller panel |
| ClickGroup CFD | Customer-facing display |
| ClickGroup KDS | Kitchen display only (single-screen kiosk) |

All include a native splash screen, offline page, hardware back button handling,
system bar colour matching, and in-app updates.

---

## Tech stack

| Area | Technology |
|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript |
| Styling / UI | Tailwind CSS 4, Framer Motion, Lucide icons, dnd-kit (drag and drop) |
| Data | Supabase (PostgreSQL, Auth, Storage, Realtime, row-level security), SWR |
| Charts / maps / QR | Recharts, Leaflet + React Leaflet, qrcode |
| Printing | Custom ESC/POS encoder, `@napi-rs/canvas` for Kurdish/Arabic raster |
| Push | `web-push` (VAPID), Firebase Cloud Messaging |
| Face scan | `@vladmandic/face-api` |
| Desktop | Electron + electron-builder + electron-updater |
| Mobile | Capacitor 8 (Android) |
| Offline backend | Embedded PostgreSQL 17, PostgREST, Node gateway |
| Hosting / CI | Vercel, GitHub Actions |

---

## Project structure

```
src/
  app/
    (restaurant)/dashboard/   cashier, order screen, KDS, delivery, driver, settings/*
    (seller)/seller/          seller panel
    api/                      server routes: login, payment, printing, push, uploads, seller, offline cloud
    cfd/  guest/  order/  r/  public and device screens
    pos/  restaurant-login/  seller-login/  offline/
  components/                 shared UI, payment, invoice, delivery, offline shell
  hooks/                      data hooks (menu, tables, orders, settings…)
  lib/                        printing, escpos, i18n, permissions, supabase clients, sessions, modules
  proxy.ts                    route gate for /dashboard and /seller (Next 16 middleware)
supabase/migrations/          ordered SQL migrations
supabase/functions/           Supabase edge functions
supabase-*.sql, kds-stations.sql   early schema files (pre-migrations)
android/                      Capacitor Android project (6 flavors)
electron-app/                 Windows desktop app (online)
electron-offline/             Windows desktop app (offline edition) + installer
offline/                      offline backend runtime, schema, scripts, tests
scripts/                      db runner, security probe, auth provisioning, theme generator
docs/                         Android, app updates, security runbooks
marketing/                    promo video and website images
public/                       static files, Android APKs (public/apps) and update manifest
```

---

## Getting started

### Requirements

- Node.js 20+
- A Supabase project

### Environment variables

Create `.env.local` in the project root:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key |
| `SUPABASE_DB_URL` | Direct database connection (used by `scripts/db.mjs`) |
| `SESSION_SECRET` | Signs the login session cookies (generate with `openssl rand -base64 48`) |
| `SELLER_PASSWORD` | Seller panel login |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase push to the Android apps |
| `OFFLINE_LICENSE_PRIVATE_KEY` | Signs offline-edition licence codes |
| `CRON_SECRET` | Protects the scheduled inventory expiry check |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional shared rate limiter |

Never commit `.env.local`.

### Run

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server (Turbopack) |
| `npm run dev:webpack` | Development server with webpack |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |

CI (`.github/workflows/ci.yml`) runs lint, type check and build on every push and pull request.

---

## Database and migrations

Apply migrations in `supabase/migrations/` in filename order. Use the bundled runner:

```bash
node --env-file=.env.local scripts/db.mjs -f supabase/migrations/<file>.sql --dry-run
node --env-file=.env.local scripts/db.mjs -f supabase/migrations/<file>.sql
```

Other scripts:

| Script | Purpose |
|---|---|
| `scripts/security-probe.mjs` | Checks with only the public key that no private data is readable |
| `scripts/provision-auth-users.mjs` | One-time backfill of login accounts for older restaurants |
| `scripts/gen-light-theme.mjs` | Generates the light theme styles |

---

## Building the native apps

- **Android APKs**: [docs/ANDROID_APPS.md](docs/ANDROID_APPS.md)
- **Releasing updates (EXE + APK)**: [docs/APP_UPDATES.md](docs/APP_UPDATES.md)
- **Offline edition installer**: [offline/README.md](offline/README.md)

Quick reference:

```bash
# Windows desktop app
cd electron-app && npm install && npm run build:win

# Android (all flavors)
npx cap sync android
cd android && ./gradlew assembleCashierRelease assembleDriverRelease assembleDeliveryRelease \
                        assembleSellerRelease assembleCfdRelease assembleKdsRelease
```

Release signing files (`android/keystore.properties`, `android/clickgroup-release.keystore`)
are not in git — keep them backed up; losing them breaks in-place updates.

---

## Security model

Full runbook: [docs/SECURITY_MIGRATION.md](docs/SECURITY_MIGRATION.md).

- Each restaurant has its own Supabase login account; **row-level security**
  keeps every restaurant's data separate.
- Passwords, owner PINs and staff PINs are stored hashed in separate secret tables.
- Signed session cookies; `src/proxy.ts` gates `/dashboard/*` and `/seller/*`.
- Sensitive actions check role permissions on the server (`requirePermission`).
- Public guest features use narrow server-side database functions instead of open table access.
- File uploads are size-limited and checked by file content.
- Rate limiting, security headers and a Content Security Policy (currently report-only).

---

## Known gaps

- `dashboard/staff` is a placeholder page with sample data; real staff and role
  management is in **Settings → Users**.
- Some settings pages still write directly to the database, protected by
  restaurant-level security but not by per-role checks on the server (see the security runbook).
- The Windows installers are not code-signed yet, so Windows SmartScreen shows a warning.
- Offline edition limits are listed in [offline/README.md](offline/README.md#status-2026-10-05).
