export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#060810] flex flex-col animate-pulse">
      {/* Header skeleton */}
      <div className="sticky top-0 z-30 border-b border-white/8 bg-[#060810]/80 backdrop-blur-2xl">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/8" />
            <div className="space-y-1.5">
              <div className="w-28 h-3.5 rounded-md bg-white/8" />
              <div className="w-16 h-2.5 rounded-md bg-white/5" />
            </div>
          </div>
          <div className="w-20 h-8 rounded-xl bg-white/5" />
          <div className="flex items-center gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-10 h-10 rounded-xl bg-white/5" />
            ))}
          </div>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-4 divide-x divide-white/5 border-t border-white/5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-center gap-2 py-2.5">
              <div className="w-6 h-5 rounded bg-white/10" />
              <div className="w-16 h-3 rounded bg-white/6" />
            </div>
          ))}
        </div>
      </div>

      {/* Table cards skeleton */}
      <div className="flex-1 p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white/5 border border-white/8 shrink-0"
              style={{ width: i % 3 === 0 ? 90 : 175, height: 90 }}
            />
          ))}
        </div>
      </div>

      {/* Bottom bar skeleton */}
      <div className="sticky bottom-0 border-t border-white/8 bg-[#060810]/90 px-4 py-3">
        <div className="grid grid-cols-3 gap-2 max-w-2xl mx-auto">
          <div className="h-12 rounded-xl bg-amber-500/20" />
          <div className="h-12 rounded-xl bg-white/5" />
          <div className="h-12 rounded-xl bg-white/5" />
        </div>
      </div>
    </div>
  )
}
