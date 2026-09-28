'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// The display reads the table's live order + items, which only a signed-in
// session of that restaurant may see. A CFD paired before /api/cfd/pair
// existed (slug in localStorage, no session) — or whose session was revoked —
// is sent back to the pairing screen instead of showing an empty display.
// Opened from the POS in the same browser it shares the POS session.
export default function CFDSessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
      else router.replace('/cfd?switch=1')
    })
  }, [router])

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#022658] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  return <>{children}</>
}
