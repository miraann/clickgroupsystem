export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-[#060810] flex flex-col animate-pulse">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-white/8 bg-[#060810]/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/8" />
          <div className="w-8 h-8 rounded-xl bg-amber-500/20" />
          <div className="w-32 h-3 rounded bg-white/8" />
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar skeleton */}
        <div className="hidden sm:block w-60 shrink-0 border-r border-white/8 bg-black/20 p-3 space-y-4">
          {[...Array(4)].map((_, g) => (
            <div key={g} className="space-y-1">
              <div className="w-16 h-2 rounded bg-white/10 mb-2 ml-3" />
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-9 rounded-xl bg-white/5" />
              ))}
            </div>
          ))}
        </div>
        {/* Content skeleton */}
        <div className="flex-1 p-4 sm:p-6 space-y-4">
          <div className="w-40 h-5 rounded bg-white/10" />
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 rounded-2xl bg-white/5 border border-white/8" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
