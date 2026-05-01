'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type ReceiptSettings, DEFAULT_RS } from './types'

interface Params {
  restaurantId:   string
  orderId:        string
  invoiceNumProp?: string
  orderNumProp?:  string
}

interface Result {
  loading:        boolean
  rs:             ReceiptSettings
  restaurantName: string
  invoiceNum:     string
  orderNum:       string
  paperWidth:     number
}

export function useInvoiceData({
  restaurantId,
  orderId,
  invoiceNumProp,
  orderNumProp,
}: Params): Result {
  const supabase  = createClient()
  // ranOnce prevents double-fire in React 18 StrictMode dev double-effect
  const ranOnce   = useRef(false)

  const [loading,        setLoading]        = useState(true)
  const [rs,             setRs]             = useState<ReceiptSettings>(DEFAULT_RS)
  const [restaurantName, setRestaurantName] = useState('')
  const [invoiceNum,     setInvoiceNum]     = useState('')
  const [orderNum,       setOrderNum]       = useState('')
  const [paperWidth,     setPaperWidth]     = useState(58)

  useEffect(() => {
    if (ranOnce.current) return
    ranOnce.current = true

    const load = async () => {
      const [
        { data: rest },
        { data: rsData },
        { data: orderRecord },
        { data: printer },
      ] = await Promise.all([
        supabase.from('restaurants')
          .select('name')
          .eq('id', restaurantId)
          .maybeSingle(),
        supabase.from('receipt_settings')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .maybeSingle(),
        supabase.from('orders')
          .select('order_num')
          .eq('id', orderId)
          .maybeSingle(),
        supabase.from('printers')
          .select('paper_width')
          .eq('restaurant_id', restaurantId)
          .eq('purpose', 'receipt')
          .eq('active', true)
          .limit(1)
          .maybeSingle(),
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((printer as any)?.paper_width) setPaperWidth((printer as any).paper_width)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRestaurantName((rest as any)?.name ?? '')

      if (rsData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = rsData as any
        setRs({
          shop_name:       r.shop_name       ?? null,
          logo_url:        r.logo_url        ?? null,
          phone:           r.phone           ?? null,
          address:         r.address         ?? null,
          thank_you_msg:   r.thank_you_msg   ?? 'Thank you for your visit!',
          currency_symbol: r.currency_symbol ?? '$',
          show_qr:         r.show_qr         ?? true,
          qr_url:          r.qr_url          ?? null,
          show_logo:       r.show_logo       ?? true,
          show_address:    r.show_address    ?? true,
          show_phone:      r.show_phone      ?? true,
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetchedOrderNum = (orderRecord as any)?.order_num ?? ''
      setOrderNum(orderNumProp || fetchedOrderNum)
      setInvoiceNum(invoiceNumProp || `INV-${orderId.slice(-5).toUpperCase()}`)

      setLoading(false)
    }

    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { loading, rs, restaurantName, invoiceNum, orderNum, paperWidth }
}
