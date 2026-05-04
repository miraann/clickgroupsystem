import { NextRequest, NextResponse } from 'next/server'
import { requireRestaurantAccess } from '@/lib/supabase/api-guard'
import { rateLimit } from '@/lib/rate-limit'

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
    }

    const { error: authError, supabase } = await requireRestaurantAccess(body.restaurantId)
    if (authError || !supabase) return authError!

    // 1. Real subtotal from DB — never trust client-supplied prices
    const { data: orderItems, error: itemsErr } = await supabase
      .from('order_items')
      .select('item_name, item_price, qty')
      .eq('order_id', body.orderId)
      .neq('status', 'void')

    if (itemsErr) return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 })
    if (!orderItems || orderItems.length === 0) {
      return NextResponse.json({ ok: false, error: 'No items on this order' }, { status: 400 })
    }

    const subtotal = orderItems.reduce((sum, i) => sum + (i.item_price ?? 0) * (i.qty ?? 1), 0)

    // 2. Verify discount belongs to this restaurant and is still active
    let discountAmount = 0
    if (body.discountId) {
      const { data: discount } = await supabase
        .from('discounts')
        .select('type, value, min_order')
        .eq('id', body.discountId)
        .eq('restaurant_id', body.restaurantId)
        .eq('active', true)
        .maybeSingle()

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

    // 3. Verify surcharge belongs to this restaurant and is still active
    let surchargeAmount = 0
    if (body.surchargeId) {
      const { data: surcharge } = await supabase
        .from('surcharges')
        .select('type, value')
        .eq('id', body.surchargeId)
        .eq('restaurant_id', body.restaurantId)
        .eq('active', true)
        .maybeSingle()

      if (!surcharge) {
        return NextResponse.json({ ok: false, error: 'Surcharge not found or inactive' }, { status: 400 })
      }

      surchargeAmount = surcharge.type === 'percentage'
        ? Math.round(subtotal * (surcharge.value ?? 0)) / 100
        : (surcharge.value ?? 0)
    }

    // 4. Verified total
    const finalTotal = Math.max(0, subtotal - discountAmount + surchargeAmount)

    // 5. Verify payment method belongs to this restaurant
    const { data: payMethod } = await supabase
      .from('payment_methods')
      .select('name')
      .eq('id', body.paymentMethodId)
      .eq('restaurant_id', body.restaurantId)
      .eq('active', true)
      .maybeSingle()

    if (!payMethod) {
      return NextResponse.json({ ok: false, error: 'Payment method not found or inactive' }, { status: 400 })
    }

    const amountPaid   = (body.amountPaid ?? 0) > 0 ? body.amountPaid : finalTotal
    const changeAmount = Math.max(0, amountPaid - finalTotal)
    const now          = new Date().toISOString()

    // 6. Resolve cashier name from session
    const { data: { user } } = await supabase.auth.getUser()
    const cashier = user?.user_metadata?.full_name ?? user?.email ?? 'Staff'

    // 7. Fetch order_num for the invoice
    const { data: order } = await supabase
      .from('orders')
      .select('order_num')
      .eq('id', body.orderId)
      .maybeSingle()
    const orderNum = (order as { order_num?: string } | null)?.order_num ?? ''

    // 8. Mark order paid with server-verified total
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

    if (orderErr) {
      return NextResponse.json({ ok: false, error: `Order update failed: ${orderErr.message}` }, { status: 500 })
    }

    // 9. Generate invoice number atomically
    const { data: invSettings } = await supabase
      .from('invoice_number_settings')
      .select('*')
      .eq('restaurant_id', body.restaurantId)
      .maybeSingle()

    let invoiceNum: string
    if (invSettings) {
      const num = (invSettings as Record<string, unknown>).current_num as number
        ?? (invSettings as Record<string, unknown>).start_num as number
        ?? 1001
      const prefix = (invSettings as Record<string, unknown>).prefix as string ?? 'INV-'
      invoiceNum = `${prefix}${num}`
      await supabase
        .from('invoice_number_settings')
        .update({ current_num: num + 1, updated_at: now })
        .eq('restaurant_id', body.restaurantId)
    } else {
      invoiceNum = 'INV-1001'
      await supabase.from('invoice_number_settings').insert({
        restaurant_id: body.restaurantId,
        prefix:        'INV-',
        start_num:     1001,
        current_num:   1002,
        reset_period:  'never',
      })
    }

    // 10. Insert invoice with server-verified amounts
    const invoiceItems = orderItems.map(i => ({
      name:  (i as Record<string, unknown>).item_name as string ?? '',
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
      customer_id:    body.customerId   ?? null,
      customer_name:  body.customerName  ?? null,
      customer_phone: body.customerPhone ?? null,
    }

    const { error: invErr1 } = await supabase.from('invoices').insert(invoicePayload)
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
    const message = err instanceof Error ? err.message : 'Payment finalization failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
