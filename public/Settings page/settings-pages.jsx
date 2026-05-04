/* Settings detail screens. Uses globals defined in Settings.html: I, copy, PALETTE, Badge */

const { useState: useStateP, useEffect: useEffectP } = React;

/* ---------- Generic page chrome ---------- */
function Page({ icon, color, title, sub, lang, children, onBack, footer }){
  return (
    <div className="px-5 md:px-10 py-8 max-w-[1100px] mx-auto relative panel-enter">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/60 hover:text-white mb-6 group">
        <span className="rtl-flip" style={{width:16,height:16}}>{I.back}</span>
        <span>Back to settings</span>
      </button>

      <header className="flex items-start gap-5 mb-8">
        <Badge icon={icon} color={color} size={64} />
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-white/50 mt-1.5 max-w-xl">{sub}</p>
        </div>
      </header>

      <div className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl overflow-hidden">
        {children}
      </div>

      {footer && (
        <div className="mt-6 flex items-center gap-3 justify-end">
          {footer}
        </div>
      )}
    </div>
  );
}

function FormRow({ label, hint, children }) {
  return (
    <div className="grid md:grid-cols-[260px_1fr] gap-3 md:gap-8 px-6 py-5 border-b border-white/5 last:border-b-0">
      <div>
        <div className="text-sm font-semibold text-white">{label}</div>
        {hint && <div className="text-xs text-white/40 mt-1 leading-relaxed">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label, hint }) {
  return (
    <button onClick={()=>onChange(!on)} className={`flex items-start gap-3 w-full text-left ${on?'toggle-on':''}`}>
      <span className="toggle-track mt-0.5"><span className="toggle-knob"></span></span>
      <span className="flex-1">
        <span className="block text-sm text-white">{label}</span>
        {hint && <span className="block text-xs text-white/40 mt-0.5">{hint}</span>}
      </span>
    </button>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-white/5 border border-white/10">
      {options.map(o => (
        <button key={o.value} onClick={()=>onChange(o.value)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${value===o.value?'bg-white/10 text-white shadow-inner':'text-white/50 hover:text-white/80'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- RESTAURANT INFO ---------- */
function RestaurantInfoPage(props){
  const [name, setName] = useStateP("Mira's Cafe");
  const [tagline, setTagline] = useStateP("Specialty coffee + brunch · Erbil");
  const [phone, setPhone] = useStateP("+964 750 123 4567");
  const [addr, setAddr] = useStateP("Empire World, Block B, Erbil");
  const [hours, setHours] = useStateP("Mon–Sun · 7:30 — 23:00");
  return (
    <Page icon="home" color="amber" title="Restaurant Info" sub="The basics customers see on receipts, the customer-facing display, and order confirmations."
          lang={props.lang} onBack={props.onBack}
          footer={<><button className="btn-ghost">Cancel</button><button className="btn-primary">Save changes</button></>}>
      <div className="px-6 py-6 flex items-center gap-5 border-b border-white/5">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-xl shadow-amber-500/30">
            <span className="text-[#1a0c00]" style={{width:36,height:36}}>{I.utensils}</span>
          </div>
          <button className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white/10 border border-white/20 backdrop-blur flex items-center justify-center text-white">
            <span style={{width:14,height:14}}>{I.pencil}</span>
          </button>
        </div>
        <div>
          <div className="text-sm font-semibold">Logo & visual mark</div>
          <div className="text-xs text-white/45 mt-1">PNG or SVG · square · max 2 MB</div>
          <button className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-400 font-semibold hover:text-amber-300">
            <span style={{width:12,height:12}}>{I.upload}</span> Upload new
          </button>
        </div>
      </div>

      <FormRow label="Restaurant name" hint="Shown on receipts, the CFD, and email confirmations.">
        <input className="input" value={name} onChange={e=>setName(e.target.value)} />
      </FormRow>
      <FormRow label="Tagline" hint="One short line. Optional.">
        <input className="input" value={tagline} onChange={e=>setTagline(e.target.value)} />
      </FormRow>
      <FormRow label="Phone">
        <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" style={{width:14,height:14}}>{I.phone}</span>
        <input className="input pl-9" value={phone} onChange={e=>setPhone(e.target.value)} /></div>
      </FormRow>
      <FormRow label="Address">
        <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" style={{width:14,height:14}}>{I.mapPin}</span>
        <input className="input pl-9" value={addr} onChange={e=>setAddr(e.target.value)} /></div>
      </FormRow>
      <FormRow label="Operating hours">
        <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" style={{width:14,height:14}}>{I.clock}</span>
        <input className="input pl-9" value={hours} onChange={e=>setHours(e.target.value)} /></div>
      </FormRow>
    </Page>
  );
}

/* ---------- PREFERENCE ---------- */
function PreferencePage(props){
  const [theme, setTheme] = useStateP("dark");
  const [language, setLanguage] = useStateP(props.lang);
  const [region, setRegion] = useStateP("KRG");
  const [sounds, setSounds] = useStateP(true);
  const [haptic, setHaptic] = useStateP(true);
  const [autolock, setAutolock] = useStateP(true);
  return (
    <Page icon="sliders" color="violet" title="Preference" sub="Personal preferences for this terminal: how it looks, what it says, and how it feels."
          lang={props.lang} onBack={props.onBack}
          footer={<><button className="btn-ghost">Cancel</button><button className="btn-primary">Save changes</button></>}>
      <FormRow label="Theme" hint="Dark is recommended in service environments.">
        <div className="flex gap-3">
          {[
            {v:"dark",label:"Dark",icon:"moon"},
            {v:"void",label:"Void",icon:"moon"},
            {v:"light",label:"Light",icon:"sun"},
          ].map(o=>(
            <button key={o.v} onClick={()=>setTheme(o.v)}
              className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border ${theme===o.v?'border-violet-400/60 bg-violet-500/10':'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
              <span className="text-violet-300" style={{width:18,height:18}}>{I[o.icon]}</span>
              <span className="text-xs font-semibold">{o.label}</span>
            </button>
          ))}
        </div>
      </FormRow>
      <FormRow label="Language">
        <Segmented options={[{value:"en",label:"English"},{value:"ckb",label:"کوردی"}]} value={language} onChange={setLanguage} />
      </FormRow>
      <FormRow label="Region & currency" hint="Determines tax rules and number formatting.">
        <select className="input" value={region} onChange={e=>setRegion(e.target.value)}>
          <option value="KRG">Kurdistan Region (IQD)</option>
          <option value="IQ">Iraq (IQD)</option>
          <option value="TR">Türkiye (TRY)</option>
          <option value="US">United States (USD)</option>
        </select>
      </FormRow>
      <FormRow label="Sounds & haptics">
        <div className="space-y-4">
          <Toggle on={sounds} onChange={setSounds} label="Order sounds" hint="Plays a soft chime on new orders." />
          <Toggle on={haptic} onChange={setHaptic} label="Haptic feedback" hint="Tap response on supported devices." />
          <Toggle on={autolock} onChange={setAutolock} label="Auto-lock terminal" hint="Locks after 5 minutes idle." />
        </div>
      </FormRow>
    </Page>
  );
}

/* ---------- USERS ---------- */
function UsersPage(props){
  const [users, setUsers] = useStateP([
    { name:"Mira Hassan",  role:"Owner",   color:"amber",  active:true, pin:"1234" },
    { name:"Aram Karim",   role:"Manager", color:"violet", active:true, pin:"5621" },
    { name:"Lana Saeed",   role:"Cashier", color:"cyan",   active:true, pin:"9080" },
    { name:"Hawkar M.",    role:"Waiter",  color:"emerald",active:true, pin:"3344" },
    { name:"Diyar Y.",     role:"Chef",    color:"rose",   active:false,pin:"8800" },
  ]);
  return (
    <Page icon="users" color="cyan" title="Users" sub="Staff accounts, roles, and PIN codes for this restaurant."
          lang={props.lang} onBack={props.onBack}
          footer={<button className="btn-primary inline-flex items-center gap-1.5"><span style={{width:14,height:14}}>{I.plus}</span>Invite staff</button>}>
      <div className="px-6 py-4 flex items-center gap-3 border-b border-white/5">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex-1 max-w-sm">
          <span className="text-white/40" style={{width:14,height:14}}>{I.search}</span>
          <input className="bg-transparent flex-1 outline-none text-sm placeholder-white/30" placeholder="Search staff…" />
        </div>
        <div className="text-xs text-white/40 ml-auto">{users.filter(u=>u.active).length} active · {users.length} total</div>
      </div>
      <div className="divide-y divide-white/5">
        {users.map((u,i)=>(
          <div key={i} className="row group">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-[#1a0c00]`}
                 style={{ background: `linear-gradient(135deg, ${PALETTE[u.color].glyph}, ${PALETTE[u.color].glyph}dd)` }}>
              {u.name.split(' ').map(p=>p[0]).slice(0,2).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold flex items-center gap-2">
                {u.name}
                {!u.active && <span className="text-[10px] uppercase tracking-wider text-white/40 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">paused</span>}
              </div>
              <div className="text-xs text-white/45 mt-0.5">{u.role} · PIN ••••</div>
            </div>
            <button className="text-xs text-white/50 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5">Edit</button>
            <button className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-rose-300 px-2 py-1.5 transition">
              <span style={{width:14,height:14}}>{I.trash}</span>
            </button>
          </div>
        ))}
      </div>
    </Page>
  );
}

/* ---------- RECEIPT ---------- */
function ReceiptPage(props){
  const [width, setWidth] = useStateP("80mm");
  const [logo, setLogo] = useStateP(true);
  const [tax, setTax] = useStateP(true);
  const [footer, setFooter] = useStateP("Thank you. See you again — Mira's Cafe");
  const [copies, setCopies] = useStateP(1);
  return (
    <Page icon="receipt" color="orange" title="Receipt" sub="What prints when an order closes — layout, branding, and printer destination."
          lang={props.lang} onBack={props.onBack}
          footer={<><button className="btn-ghost">Print test</button><button className="btn-primary">Save changes</button></>}>
      <div className="grid md:grid-cols-[1fr_320px]">
        <div className="divide-y divide-white/5">
          <FormRow label="Paper width">
            <Segmented options={[{value:"58mm",label:"58 mm"},{value:"80mm",label:"80 mm"},{value:"a4",label:"A4"}]} value={width} onChange={setWidth} />
          </FormRow>
          <FormRow label="Print logo at top">
            <Toggle on={logo} onChange={setLogo} label="Print logo" hint="Adds the restaurant logo above the header." />
          </FormRow>
          <FormRow label="Show tax breakdown">
            <Toggle on={tax} onChange={setTax} label="Itemized tax" hint="List VAT and service charge as separate lines." />
          </FormRow>
          <FormRow label="Footer message" hint="Up to 80 characters.">
            <input className="input" value={footer} onChange={e=>setFooter(e.target.value)} maxLength={80}/>
          </FormRow>
          <FormRow label="Copies">
            <div className="flex items-center gap-3">
              <button onClick={()=>setCopies(Math.max(1,copies-1))} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10">−</button>
              <span className="text-lg font-bold tabular-nums w-6 text-center">{copies}</span>
              <button onClick={()=>setCopies(Math.min(4,copies+1))} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10">+</button>
            </div>
          </FormRow>
          <FormRow label="Default printer">
            <select className="input"><option>Front Bar — EPSON TM-T20III</option><option>Kitchen — XPrinter XP-N160</option></select>
          </FormRow>
        </div>

        {/* Receipt preview */}
        <div className="bg-black/30 border-l border-white/5 p-6 flex flex-col items-center">
          <div className="text-[11px] uppercase tracking-widest text-white/40 mb-3">Live preview</div>
          <div className="bg-[#fdfcf7] text-black rounded-md w-full max-w-[260px] p-5 font-mono text-[11px] leading-relaxed shadow-2xl shadow-black/50">
            {logo && <div className="w-10 h-10 mx-auto mb-2 rounded-md bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white">
              <span style={{width:18,height:18}}>{I.utensils}</span>
            </div>}
            <div className="text-center font-bold text-[12px]">MIRA'S CAFE</div>
            <div className="text-center text-[10px] text-black/60">Empire World, Erbil</div>
            <div className="text-center text-[10px] text-black/60 mb-2">+964 750 123 4567</div>
            <div className="border-t border-dashed border-black/30 my-2"></div>
            <div className="flex justify-between"><span>Order #2418</span><span>15:42</span></div>
            <div className="text-[10px] text-black/60 mb-2">Cashier: Lana</div>
            <div className="border-t border-dashed border-black/30 my-2"></div>
            <div className="flex justify-between"><span>1× Flat White</span><span>3,500</span></div>
            <div className="flex justify-between"><span>1× Avocado Toast</span><span>9,000</span></div>
            <div className="flex justify-between"><span>1× Sparkling H₂O</span><span>2,000</span></div>
            <div className="border-t border-dashed border-black/30 my-2"></div>
            <div className="flex justify-between"><span>Subtotal</span><span>14,500</span></div>
            {tax && <div className="flex justify-between text-black/70"><span>VAT 5%</span><span>725</span></div>}
            {tax && <div className="flex justify-between text-black/70"><span>Service 10%</span><span>1,450</span></div>}
            <div className="flex justify-between font-bold text-[12px] mt-1"><span>TOTAL IQD</span><span>16,675</span></div>
            <div className="border-t border-dashed border-black/30 my-2"></div>
            <div className="text-center text-[10px]">{footer}</div>
            {copies>1 && <div className="text-center text-[9px] text-black/50 mt-2">Copy 1 of {copies}</div>}
          </div>
          <div className="text-[10px] text-white/30 mt-3">{width} · updates live</div>
        </div>
      </div>
    </Page>
  );
}

/* ---------- DEVICE ---------- */
function DevicePage(props){
  const [printer, setPrinter] = useStateP(true);
  const [cfd, setCfd] = useStateP(true);
  const [drawer, setDrawer] = useStateP(false);
  return (
    <Page icon="monitor" color="sky" title="Device" sub="Hardware connected to this terminal."
          lang={props.lang} onBack={props.onBack}
          footer={<button className="btn-primary">Save changes</button>}>
      <div className="divide-y divide-white/5">
        {[
          {name:"Receipt printer", sub:"EPSON TM-T20III · USB", on:printer, set:setPrinter, ic:"printer"},
          {name:"Customer-facing display", sub:"24\" — HDMI 2", on:cfd, set:setCfd, ic:"monitor"},
          {name:"Cash drawer", sub:"Connected via printer pulse", on:drawer, set:setDrawer, ic:"box"},
        ].map((d,i)=>(
          <div key={i} className="row">
            <Badge icon={d.ic} color="sky" size={42}/>
            <div className="flex-1">
              <div className="text-sm font-semibold">{d.name}</div>
              <div className="text-xs text-white/45 mt-0.5">{d.sub}</div>
            </div>
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${d.on?'bg-emerald-500/15 text-emerald-300 border-emerald-500/30':'bg-white/5 text-white/40 border-white/10'}`}>
              {d.on?'Connected':'Offline'}
            </span>
            <Toggle on={d.on} onChange={d.set} label="" />
          </div>
        ))}
      </div>
    </Page>
  );
}

/* ---------- WHATSAPP ---------- */
function WhatsappPage(props){
  const [enabled, setEnabled] = useStateP(true);
  const [number, setNumber] = useStateP("+964 750 123 4567");
  const [events, setEvents] = useStateP({ placed:true, ready:true, delivered:false, cancelled:true });
  return (
    <Page icon="whatsapp" color="emerald" title="WhatsApp" sub="Send transactional updates to customers via WhatsApp Business."
          lang={props.lang} onBack={props.onBack}
          footer={<><button className="btn-ghost">Send test</button><button className="btn-primary">Save changes</button></>}>
      <FormRow label="Integration" hint="Connect once per restaurant.">
        <Toggle on={enabled} onChange={setEnabled} label="Send messages from this restaurant" hint="Uses Mira's Cafe Business number." />
      </FormRow>
      <FormRow label="Sender number">
        <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" style={{width:14,height:14}}>{I.phone}</span>
        <input className="input pl-9" value={number} onChange={e=>setNumber(e.target.value)} /></div>
      </FormRow>
      <FormRow label="Notify on">
        <div className="space-y-3">
          {[
            ["placed","Order placed","Customer receives a confirmation with items and total."],
            ["ready","Ready for pickup","Sent when the kitchen marks the order as ready."],
            ["delivered","Delivered","Sent when the driver completes the route."],
            ["cancelled","Cancelled","Sent when an order is voided or cancelled."],
          ].map(([k,l,h])=>(
            <Toggle key={k} on={events[k]} onChange={v=>setEvents({...events,[k]:v})} label={l} hint={h} />
          ))}
        </div>
      </FormRow>
    </Page>
  );
}

/* ---------- GENERIC PLACEHOLDER (any unbuilt page) ---------- */
function GenericPage({ id, lang, onBack }){
  const [n,s] = copy[lang].items[id] || [id, ""];
  const item = SECTIONS.flatMap(x=>x.items).find(x=>x.id===id) || { icon:"cog", color:"violet" };
  return (
    <Page icon={item.icon} color={item.color} title={n} sub={s} lang={lang} onBack={onBack}
          footer={<button className="btn-primary">Save changes</button>}>
      <div className="px-6 py-12 text-center">
        <div className="mx-auto mb-5"><Badge icon={item.icon} color={item.color} size={72}/></div>
        <h3 className="text-lg font-bold mb-2">{n}</h3>
        <p className="text-sm text-white/45 max-w-md mx-auto">This area lets you configure {n.toLowerCase()}. Detailed controls show up here once we build out this section.</p>
        <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider bg-white/5 border border-white/10 text-white/50">
          <span style={{width:10,height:10}}>{I.shield}</span> Coming next sprint
        </div>
      </div>
    </Page>
  );
}

/* expose */
Object.assign(window, { RestaurantInfoPage, PreferencePage, UsersPage, ReceiptPage, DevicePage, WhatsappPage, GenericPage });
