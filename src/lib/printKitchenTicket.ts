export async function printKitchenTicket(params: {
  restaurantId: string
  tableNum:     string
  orderNum?:    string | null
  items:        { name: string; qty: number; note?: string | null }[]
}) {
  const now     = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

  let paperWidth = 80
  try {
    const res  = await fetch('/api/print/kitchen', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...params, timeStr, dateStr }),
    })
    const json = await res.json()
    if (json.ok && json.paperWidth) paperWidth = json.paperWidth
  } catch { /* silent — popup still opens with default width */ }

  const cols = paperWidth >= 80 ? 42 : paperWidth >= 58 ? 32 : 24
  const line = '-'.repeat(cols)

  const screenItems = params.items.map(it => `
    <div class="item">
      <div class="item-row">
        <span class="qty">${it.qty}&times;</span>
        <span class="name">${it.name}</span>
      </div>
      ${it.note ? `<div class="note">&rarr;&nbsp;${it.note}</div>` : ''}
    </div>`).join('')

  const receiptItems = params.items.map(it =>
    `<p><b>${String(it.qty).padStart(2)}x  ${it.name}</b></p>` +
    (it.note ? `<p>      &gt;&gt; ${it.note}</p>` : '')
  ).join('')

  const orderRef = params.orderNum ? ` &nbsp;·&nbsp; ${params.orderNum}` : ''

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Kitchen — Table ${params.tableNum}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
@media screen{
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080b14;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
  .card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:22px;width:100%;max-width:300px}
  .brand{font-size:9px;color:rgba(255,255,255,0.25);letter-spacing:.12em;text-transform:uppercase;text-align:center;margin-bottom:14px}
  .table-num{font-size:32px;font-weight:800;color:#f59e0b;text-align:center;line-height:1}
  .order-ref{font-size:11px;color:rgba(255,255,255,0.35);text-align:center;margin-bottom:4px}
  .time{font-size:10px;color:rgba(255,255,255,0.3);text-align:center;margin-bottom:14px}
  .divider{border-top:1px solid rgba(255,255,255,0.08);margin:12px 0}
  .item{margin-bottom:8px}
  .item-row{display:flex;align-items:baseline;gap:6px}
  .qty{font-size:14px;font-weight:800;color:#f59e0b;min-width:22px;text-align:right}
  .name{font-size:13px;font-weight:600;color:#fff}
  .note{font-size:10px;color:rgba(255,255,255,0.4);padding-left:28px;margin-top:2px}
  .printbtn{margin-top:16px;width:100%;padding:12px;background:#f59e0b;border:none;border-radius:12px;font-size:14px;font-weight:700;color:#fff;cursor:pointer;letter-spacing:.01em}
  .printbtn:hover{background:#d97706}.printbtn:active{transform:scale(.97)}
  .foot{margin-top:8px;font-size:9px;color:rgba(255,255,255,0.15);text-align:center;line-height:1.4}
  #receipt{display:none}
}
@media print{
  body{background:#fff;color:#000}
  .card{display:none!important}
  #receipt{display:block!important;font-family:'Courier New',monospace;font-size:12px;width:${paperWidth}mm;padding:4px}
  @page{size:${paperWidth}mm auto;margin:2mm}
}
</style></head><body>
<div class="card">
  <div class="brand">ClickGroup POS · Kitchen</div>
  <div class="table-num">Table ${params.tableNum}</div>
  <div class="order-ref">${orderRef}</div>
  <div class="time">${dateStr} &nbsp; ${timeStr}</div>
  <div class="divider"></div>
  ${screenItems}
  <button class="printbtn" onclick="window.print();setTimeout(function(){window.close()},3000)">🖨&nbsp; Print Kitchen Ticket</button>
  <div class="foot">Select your kitchen printer in the dialog,<br>then click Print.</div>
</div>
<div id="receipt">
  <p style="text-align:center;font-size:16px;font-weight:bold">KITCHEN ORDER</p>
  <p style="text-align:center">Table ${params.tableNum}${params.orderNum ? '  ' + params.orderNum : ''}</p>
  <p>${line}</p>
  <p>${dateStr} &nbsp; ${timeStr}</p>
  <p>${line}</p>
  ${receiptItems}
  <p>${line}</p>
</div>
</body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const left = Math.max(0, (screen.width ?? 1280) - 360)
  const win  = window.open(url, '_blank', `width=330,height=460,left=${left},top=60`)
  if (win) { win.focus(); setTimeout(() => URL.revokeObjectURL(url), 12000) }
  else URL.revokeObjectURL(url)
}
