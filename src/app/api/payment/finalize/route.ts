import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { requireRestaurant, serverError } from '@/lib/api-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!rateLimit(req, 'payment/finalize', 10)) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }
  try {
    const body = await req.json() as {
      orderId:         string
      restaurantId:    string
      discountId?:     string | null
      surchargeId?:    string | null
      paymentMethodId: string
      amountPaid:      number   // cash tendered; 0 = exact
      note?:           string | null
      customerId?:     string | null
      customerName?:   string | null
      customerPhone?:  string | null
      tableNum:        string   // display only (e.g. "5" or "Takeout")
      guests:          number
      staffId?:        string | null  // PIN staff auth
      isOwner?:        boolean        // owner session auth
    }

    // Auth: require a valid signed restaurant session bound to this restaurant.
    // `isOwner` from the request body is no longer trusted.
    const { session, error: authErr } = await requireRestaurant(body.restaurantId)
    if (authErr) return authErr

    const supabase = await createClient()

    // ── 1. Every read we need, in a single round-trip ─────────────────────────
    // None of these depend on each other, so fan them out instead of awaiting
    // one at a time (this is the bulk of the old checkout latency). Conditional
    // lookups resolve to { data: null } when their id wasn't supplied.
    const nullRow = Promise.resolve({ data: null, error: null })
    const [
      staffRes,
      itemsRes,
      discountRes,
      surchargeRes,
      payMethodRes,
      orderRes,
      invSettingsRes,
    ] = await Promise.all([
      body.staffId
        ? supabase.from('staff').select('id, name')
            .eq('id', body.staffId)
            .eq('restaurant_id', session.rid)
            .eq('status', 'active')
            .maybeSingle()
        : nullRow,

      supabase.from('order_items')
        .select('item_name, item_price, qty')
        .eq('order_id', body.orderId)
        .neq('status', 'void'),

      body.discountId
        ? supabase.from('discounts').select('type, value, min_order')
            .eq('id', body.discountId)
            .eq('restaurant_id', body.restaurantId)
            .eq('active', true)
            .maybeSingle()
        : nullRow,

      body.surchargeId
        ? supabase.from('surcharges').select('type, value')
            .eq('id', body.surchargeId)
            .eq('restaurant_id', body.restaurantId)
            .eq('active', true)
            .maybeSingle()
        : nullRow,

      supabase.from('payment_methods').select('name')
        .eq('id', body.paymentMethodId)
        .eq('restaurant_id', body.restaurantId)
        .eq('active', true)
        .maybeSingle(),

      supabase.from('orders').select('order_num')
        .eq('id', body.orderId)
        .maybeSingle(),

      supabase.from('invoice_number_settings').select('*')
        .eq('restaurant_id', body.restaurantId)
        .maybeSingle(),
    ])

    // ── 2. Validate + compute the server-verified total ───────────────────────
    // Failure precedence is unchanged: items → discount → surcharge → method.

    // Real subtotal from DB — never trust client-supplied prices
    const orderItems = itemsRes.data as { item_name: string; item_price: number; qty: number }[] | null
    if (itemsRes.error) return serverError(itemsRes.error)
    if (!orderItems || orderItems.length === 0) {
      return NextResponse.json({ ok: false, error: 'No items on this order' }, { status: 400 })
    }

    const subtotal = orderItems.reduce((sum, i) => sum + (i.item_price ?? 0) * (i.qty ?? 1), 0)

    // Discount must belong to this restaurant and still be active
    let discountAmount = 0
    if (body.discountId) {
      const discount = discountRes.data as { type: string; value: number; min_order: number | null } | null
      if (!discount) {
        return NextResponse.json({ ok: false, error: 'Discount not found or inactive' }, { status: 400 })
      }
      if (subtotal < (discount.min_order ?? 0)) {
        return NextResponse.json({ ok: false, error: 'Order total below discount minimum' }, { status: 400 })
      }
      discountAmount = discount.type === 'percentage'
        ? Math.round(subtotal * (discount.value ?? 0)) / 100
        : Math.min(discount.value ?? 0, subtotal)
    }

    // Surcharge must belong to this restaurant and still be active
    let surchargeAmount = 0
    if (body.surchargeId) {
      const surcharge = surchargeRes.data as { type: string; value: number } | null
      if (!surcharge) {
        return NextResponse.json({ ok: false, error: 'Surcharge not found or inactive' }, { status: 400 })
      }
      surchargeAmount = surcharge.type === 'percentage'
        ? Math.round(subtotal * (surcharge.value ?? 0)) / 100
        : (surcharge.value ?? 0)
    }

    // Verified total
    const finalTotal = Math.max(0, subtotal - discountAmount + surchargeAmount)

    // Payment method must belong to this restaurant
    const payMethod = payMethodRes.data as { name: string } | null
    if (!payMethod) {
      return NextResponse.json({ ok: false, error: 'Payment method not found or inactive' }, { status: 400 })
    }

    const pinStaffName = (staffRes.data as { name?: string } | null)?.name ?? null
    const amountPaid   = (body.amountPaid ?? 0) > 0 ? body.amountPaid : finalTotal
    const changeAmount = Math.max(0, amountPaid - finalTotal)
    const now          = new Date().toISOString()
    const cashier      = pinStaffName ?? (session.role === 'owner' ? 'Owner' : 'Staff')
    const orderNum     = (orderRes.data as { order_num?: string } | null)?.order_num ?? ''

    // Invoice number, derived from the settings row we already read above
    const invSettings = invSettingsRes.data as Record<string, unknown> | null
    const invNum = invSettings
      ? ((invSettings.current_num as number) ?? (invSettings.start_num as number) ?? 1001)
      : 1001
    const invPrefix  = (invSettings?.prefix as string) ?? 'INV-'
    const invoiceNum = `${invPrefix}${invNum}`

    // ── 3. Mark the order paid — the one write that must succeed ──────────────
    const { error: orderErr } = await supabase
      .from('orders')
      .update({
        status:         'paid',
        total:          finalTotal,
        payment_method: payMethod.name,
        amount_paid:    amountPaid,
        change_amount:  changeAmount,
        note:           body.note ?? null,
        updated_at:     now,
      })
      .eq('id', body.orderId)

    if (orderErr) return serverError(orderErr)

    // ── 4. Side effects — best-effort, fired together ────────────────────────
    // Inventory deduction still runs *after* the order is 'paid' (its RPC may
    // key on status); table status, the invoice-number bump and the invoice row
    // don't depend on one another, so they all go out in parallel.
    const invoiceItems = orderItems.map(i => ({
      name:  i.item_name ?? '',
      price: i.item_price,
      qty:   i.qty,
    }))

    const invoicePayload = {
      restaurant_id:  body.restaurantId,
      invoice_num:    invoiceNum,
      order_num:      orderNum,
      table_num:      body.tableNum,
      guests:         body.guests,
      cashier,
      payment_method: payMethod.name,
      items:          invoiceItems,
      subtotal,
      discount:       discountAmount,
      total:          finalTotal,
      amount_paid:    amountPaid,
      change_amount:  changeAmount,
      customer_id:    body.customerId    ?? null,
      customer_name:  body.customerName  ?? null,
      customer_phone: body.customerPhone ?? null,
    }

    const tableSeq = parseInt(body.tableNum)

    const [, , invDeductRes, invoiceRes] = await Promise.all([
      // Mark table dirty (needs cleaning) — skip for takeout/delivery
      isNaN(tableSeq)
        ? nullRow
        : supabase.from('tables')
            .update({ status: 'dirty', updated_at: now })
            .eq('restaurant_id', body.restaurantId)
            .eq('seq', tableSeq),

      // Generate the next invoice number atomically (or seed the row)
      invSettings
        ? supabase.from('invoice_number_settings')
            .update({ current_num: invNum + 1, updated_at: now })
            .eq('restaurant_id', body.restaurantId)
        : supabase.from('invoice_number_settings').insert({
            restaurant_id: body.restaurantId,
            prefix:        'INV-',
            start_num:     1001,
            current_num:   1002,
            reset_period:  'never',
          }),

      // Inventory deduction — atomic, row-locked, server-side only.
      // (Notifications for low/out-of-stock/rapid-depletion fire automatically
      // via the trg_inventory_stock_notify trigger on inventory_items.)
      supabase.rpc('fn_deduct_inventory_for_order', {
        p_order_id:      body.orderId,
        p_restaurant_id: body.restaurantId,
      }),

      // Invoice with server-verified amounts
      supabase.from('invoices').insert(invoicePayload),
    ])

    const invDeductErr = (invDeductRes as { error?: { message?: string } } | null)?.error
    if (invDeductErr) console.error('[Inventory deduction failed]', invDeductErr.message)

    const invErr1 = (invoiceRes as { error?: { message?: string } } | null)?.error
    if (invErr1) {
      // Retry without optional customer fields in case the column doesn't exist yet
      const { error: invErr2 } = await supabase.from('invoices').insert({
        restaurant_id:  body.restaurantId,
        invoice_num:    invoiceNum,
        order_num:      orderNum,
        table_num:      body.tableNum,
        guests:         body.guests,
        cashier,
        payment_method: payMethod.name,
        items:          invoiceItems,
        subtotal,
        discount:       discountAmount,
        total:          finalTotal,
        amount_paid:    amountPaid,
        change_amount:  changeAmount,
      })
      if (invErr2) console.error('[Invoice save failed]', invErr2.message)
    }

    return NextResponse.json({
      ok:                true,
      finalTotal,
      subtotal,
      discountAmount,
      surchargeAmount,
      invoiceNum,
      orderNum,
      amountPaid,
      changeAmount,
      paymentMethodName: payMethod.name,
      cashier,
    })

  } catch (err: unknown) {
    return serverError(err)
  }
}
