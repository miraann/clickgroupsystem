// A stand-in network thermal printer for testing without hardware: listens on
// TCP 9100 (like a real one) and saves every job it receives as a .bin file in
// offline/.data/fake-printer/.
//
//   cd offline && npm run fake-printer        (optional: --port 9100)
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const out  = path.resolve(here, '..', '.data', 'fake-printer')
const i    = process.argv.indexOf('--port')
const port = i > 0 ? Number(process.argv[i + 1]) : 9100
fs.mkdirSync(out, { recursive: true })

let n = 0
net.createServer(sock => {
  const chunks = []
  sock.on('data', c => chunks.push(c))
  sock.on('error', () => {})
  sock.on('close', () => {
    const data = Buffer.concat(chunks)
    if (!data.length) return // a reachability probe, not a print job
    const file = path.join(out, `${new Date().toISOString().replace(/[:.]/g, '-')}-${++n}.bin`)
    fs.writeFileSync(file, data)
    // ESC/POS cut command (GS V) marks the end of a ticket.
    const cuts = data.toString('latin1').split('\x1dV').length - 1
    console.log(`[fake-printer] job ${n}: ${data.length} bytes, ${cuts} cut(s) → ${path.basename(file)}`)
  })
}).listen(port, '127.0.0.1', () => console.log(`[fake-printer] listening on 127.0.0.1:${port}, saving to ${out}`))
