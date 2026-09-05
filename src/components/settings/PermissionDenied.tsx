import { ShieldOff } from 'lucide-react'

/** Shown in place of a settings page/tile when the signed-in staff member's
 *  role lacks the permission for it. Distinct from ModuleGate's UpgradeWall,
 *  which blocks on the restaurant's plan rather than the staff's role. */
export function PermissionDenied({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-sm mx-auto px-6">
        <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-6">
          <ShieldOff className="w-9 h-9 text-rose-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Access Restricted</h2>
        <p className="text-white/45 text-sm leading-relaxed">
          Your role doesn&apos;t have permission to access
          {label ? <> <span className="text-white/70 font-medium">{label}</span></> : ' this section'}.
          Ask your manager or the owner to update your role&apos;s permissions.
        </p>
      </div>
    </div>
  )
}
