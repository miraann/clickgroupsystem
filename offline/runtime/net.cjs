// This PC's addresses on the restaurant network — what a waiter tablet types
// (or scans) to reach the gateway.
const os = require('node:os')

// Private IPv4 ranges a home/office router hands out.
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/

/** Private IPv4 addresses of the network adapters that are up, best first. */
function lanAddresses() {
  const found = []
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || !PRIVATE.test(a.address)) continue
      // Virtual adapters (Hyper-V, WSL, VirtualBox, VPNs) aren't reachable from a tablet.
      const virtual = /vEthernet|WSL|VirtualBox|VMware|Hyper-V|Loopback|Tailscale|ZeroTier|VPN/i.test(name)
      found.push({ address: a.address, name, virtual })
    }
  }
  return found.sort((a, b) => Number(a.virtual) - Number(b.virtual)).map(a => a.address)
}

module.exports = { lanAddresses }
