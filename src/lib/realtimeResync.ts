// Live updates (Supabase Realtime) only carry changes made while the socket is
// connected. When a device's connection drops — a tablet's Wi-Fi blinking, the
// offline PC's server restarting — the channel re-joins on its own, but
// anything that changed in between is never sent. Pass this as the
// channel.subscribe() callback to reload the screen's data after each re-join.

/** subscribe() status handler: runs `refetch` on every re-join, not the first join. */
export function refetchOnRejoin(refetch: () => void) {
  let joinedBefore = false
  return (status: string) => {
    if (status !== 'SUBSCRIBED') return
    if (joinedBefore) refetch()
    joinedBefore = true
  }
}
