'use client'
import { useRouter } from 'next/navigation'
import { ShieldOff, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function UnauthorizedPage() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut().catch(() => {})
    const slug = localStorage.getItem('restaurant_slug')
    const keys = [
      'restaurant_id', 'restaurant_slug', 'restaurant_name', 'owner_session',
      'pos_staff_id', 'pos_staff_name', 'pos_staff_role',
      'pos_staff_color', 'pos_role_permissions', 'pos_role_name',
    ]
    keys.forEach(k => localStorage.removeItem(k))
    router.replace(slug ? `/pos/${slug}/login` : '/restaurant-login')
  }

  return (
    <div className="min-h-screen bg-[#022658] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-6">
          <ShieldOff className="w-10 h-10 text-rose-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-white/40 text-sm mb-8">
          Your account does not have permission to access this area.
          Contact your manager to update your role.
        </p>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/8 border border-white/10 text-white/70 hover:text-white hover:bg-white/12 text-sm font-medium transition-all"
        >
          <LogOut className="w-4 h-4" />
          Back to Login
        </button>
      </div>
    </div>
  )
}
