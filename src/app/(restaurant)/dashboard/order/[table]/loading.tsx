export default function OrderLoading() {
  return (
    <div className="flex flex-col h-screen bg-[#060810] overflow-hidden animate-pulse">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8 bg-[#060810]/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/8" />
          <div className="space-y-1.5">
            <div className="w-24 h-3.5 rounded-md bg-white/8" />
            <div className="w-32 h-2.5 rounded-md bg-white/5" />
          </div>
        </div>
        <div className="w-20 h-9 rounded-xl bg-white/5" />
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="hidden sm:flex w-80 xl:w-96 shrink-0 flex-col border-r border-white/8 bg-white/[0.01]">
          <div className="flex border-b border-white/8">
            <div className="flex-1 py-3.5 flex items-center justify-center">
              <div className="w-20 h-3 rounded bg-white/8" />
            </div>
            <div className="flex-1 py-3.5 flex items-center justify-center">
              <div className="w-20 h-3 rounded bg-white/5" />
            </div>
          </div>
          <div className="flex-1 p-3 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-white/5 border border-white/8" />
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Category tabs */}
          <div className="flex gap-2 px-4 py-3 border-b border-white/8 overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`shrink-0 h-8 rounded-full bg-white/8 ${i === 0 ? 'w-16' : 'w-20'}`} />
            ))}
          </div>
          {/* Menu grid */}
          <div className="flex-1 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl bg-white/6 border border-white/8" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 border-t border-white/8 bg-[#060810]/90 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="w-24 h-2.5 rounded bg-white/5" />
            <div className="w-32 h-4 rounded bg-white/8" />
          </div>
          <div className="w-28 h-12 rounded-xl bg-amber-500/20" />
        </div>
      </div>
    </div>
  )
}
