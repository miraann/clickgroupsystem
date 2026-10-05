/* Flat-vector characters for the promo.
   makeChar(id, type, {itemL, itemR, sweat}) → <svg> markup; pose(id, {...}) moves its parts each frame.
   Coordinates: viewBox 240×532 (y from -12), shoulders at (74,186)/(166,186), hips at y≈340.
   Items are drawn around the hand centre (0,0) and can be kept upright with pose({uL/uR: tilt°}). */

const CHAR_TYPES = {
  manager: { skin: '#e3b48f', hair: '#2b1d14', style: 'short', top: '#22326a', outfit: 'suit', tie: '#ffbf0f', pants: '#1a2340', shoe: '#0f0f14', glasses: true },
  guest:   { skin: '#eebd96', hair: '#2b1d14', style: 'short', top: '#0d9488', outfit: 'hoodie', pants: '#334155', shoe: '#f1f5f9', beard: true },
  waiter:  { skin: '#c99672', hair: '#1b1b1b', style: 'short', top: '#ffffff', outfit: 'waiter', vest: '#1f2430', bow: '#e11d48', pants: '#1f2430', shoe: '#0f0f14', mustache: true },
  chef:    { skin: '#d9a57c', hair: '#3a2a20', style: 'none',  top: '#ffffff', outfit: 'chef', scarf: '#ef4444', pants: '#374151', shoe: '#0f0f14', mustache: true, hat: 'toque' },
  cashier: { skin: '#eab58f', hair: '#5a3825', style: 'pony',  top: '#ffbf0f', outfit: 'polo', short: true, pants: '#1f2937', shoe: '#f8fafc' },
  driver:  { skin: '#c68b62', hair: '#111111', style: 'none',  top: '#1c2a6b', outfit: 'jacket', pants: '#1f2937', shoe: '#0f0f14', hat: 'helmet' },
};

const ITEMS = {
  phone:   '<rect x="-12" y="-34" width="24" height="42" rx="5" fill="#0f172a"/><rect x="-9.5" y="-30" width="19" height="32" rx="3" fill="#60a5fa"/>',
  notepad: '<rect x="-17" y="-48" width="34" height="44" rx="3" fill="#fff" stroke="#cbd5e1" stroke-width="2"/><path d="M-11 -36h22M-11 -28h22M-11 -20h14" stroke="#94a3b8" stroke-width="2.5"/>',
  paper:   '<g transform="rotate(-12)"><rect x="-24" y="-60" width="48" height="58" rx="2" fill="#f4efe3"/><path d="M-16 -48h32M-16 -40h32M-16 -32h22M-16 -24h28" stroke="#9aa0b4" stroke-width="2.5"/></g>',
  ticket:  '<rect x="-16" y="-58" width="32" height="50" rx="2" fill="#fbfaf6"/><path d="M-10 -50h20M-10 -42h20M-10 -34h14M-10 -26h18" stroke="#9aa0b4" stroke-width="2.5"/>',
  thumb:   '<rect x="-5.5" y="-26" width="11" height="22" rx="5.5" fill="SKIN"/>',
  bag:     '<rect x="-26" y="6" width="52" height="46" rx="7" fill="#ffbf0f"/><rect x="-26" y="6" width="52" height="12" rx="5" fill="#e0a800"/><path d="M-8 6 V-4 M8 6 V-4" stroke="#1c2a6b" stroke-width="4"/>',
  ipad:    `<g transform="rotate(-6)"><rect x="-62" y="-86" width="124" height="88" rx="11" fill="#111827"/><rect x="-55" y="-79" width="110" height="74" rx="6" fill="#0c1638"/>
            <rect x="-47" y="-72" width="44" height="7" rx="3" fill="#ffd35c"/><rect x="-47" y="-61" width="30" height="5" rx="2.5" fill="#6ee79a"/>
            ${[[-44, 16], [-30, 22], [-16, 18], [-2, 28], [12, 26], [26, 34], [40, 42]].map(([x, h], i) => `<rect x="${x}" y="${-12 - h}" width="10" height="${h}" rx="2" fill="${i === 6 ? '#ffbf0f' : '#6d78ff'}"/>`).join('')}</g>`,
};

const MOUTHS = {
  smile: ['M106 127 Q120 140 134 127', 'none', '#6b2d24'],
  open:  ['M104 124 Q120 152 136 124 Z', '#6b2230', 'none'],
  worry: ['M107 136 Q120 126 133 136', 'none', '#6b2d24'],
  o:     ['M113 132 a7 8 0 1 0 14 0 a7 8 0 1 0 -14 0', '#6b2230', 'none'],
};

function makeChar(P, type, { itemL = '', itemR = '', sweat = false } = {}) {
  const T = CHAR_TYPES[type], sk = T.skin;
  const sleeve = T.outfit === 'waiter' || T.outfit === 'chef' ? '#ffffff' : T.top;
  const fore = T.short ? sk : sleeve;
  const it = k => (ITEMS[k] || '').replace('SKIN', sk);
  const dark = T.hair === '#111111' ? '#222' : T.hair;

  const hairBack = { pony: `<path d="M148 56 Q200 66 186 158 Q176 124 156 96Z" fill="${T.hair}"/>` }[T.style] || '';
  const hairFront = {
    short: `<path d="M74 98 Q68 40 120 38 Q172 40 166 98 Q162 66 140 60 Q122 72 100 62 Q80 68 74 98Z" fill="${T.hair}"/>`,
    pony:  `<path d="M74 98 Q70 38 120 38 Q170 38 166 98 Q160 64 124 60 Q96 62 74 98Z" fill="${T.hair}"/>`,
  }[T.style] || '';
  const hat = {
    toque:  `<path d="M78 60 Q64 22 92 16 Q100 -6 120 4 Q140 -6 148 16 Q176 22 162 60Z" fill="#fff" stroke="#e2e8f0" stroke-width="2"/><rect x="78" y="50" width="84" height="20" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>`,
    helmet: `<path d="M68 84 Q66 26 120 24 Q174 26 172 84Z" fill="#ffbf0f"/><path d="M69 76 Q120 64 171 76 L171 86 L69 86Z" fill="#1c2a6b"/><rect x="112" y="27" width="16" height="44" rx="8" fill="rgba(255,255,255,.35)"/>`,
  }[T.hat] || '';
  const outfit = {
    suit:   `<path d="M103 170 L120 214 L137 170Z" fill="#fff"/><path d="M116 178h8l3 52-7 9-7-9z" fill="${T.tie}"/><path d="M98 171 L120 238 L106 250 L84 178Z" fill="#18244d"/><path d="M142 171 L120 238 L134 250 L156 178Z" fill="#18244d"/><circle cx="120" cy="286" r="4" fill="#0f1733"/><circle cx="120" cy="312" r="4" fill="#0f1733"/><rect x="140" y="200" width="18" height="5" rx="2" fill="#ffbf0f"/>`,
    hoodie: `<path d="M88 172 Q120 206 152 172" stroke="#0b7a70" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M110 188 v34 M130 188 v34" stroke="#e2e8f0" stroke-width="3.5" stroke-linecap="round"/><path d="M90 288 H150 L142 334 H98Z" fill="#0b7a70"/>`,
    waiter: `<path d="M72 206 L100 172 L120 248 L140 172 L168 206 L166 348 L74 348Z" fill="${T.vest}"/><path d="M106 175 L120 182 L106 190Z M134 175 L120 182 L134 190Z" fill="${T.bow}"/><circle cx="120" cy="182" r="4" fill="${T.bow}"/><circle cx="120" cy="266" r="3.5" fill="#94a3b8"/><circle cx="120" cy="288" r="3.5" fill="#94a3b8"/><circle cx="120" cy="310" r="3.5" fill="#94a3b8"/>`,
    chef:   `<path d="M100 168 Q120 188 140 168 L136 190 Q120 198 104 190Z" fill="${T.scarf}"/><path d="M130 196 L110 348" stroke="#e5e7eb" stroke-width="3"/>${[216, 246, 276].map(y => `<circle cx="106" cy="${y}" r="4.5" fill="#cbd5e1"/><circle cx="136" cy="${y}" r="4.5" fill="#cbd5e1"/>`).join('')}`,
    polo:   `<path d="M100 170 L112 194 L120 178 L128 194 L140 170Z" fill="#e0a800"/><path d="M120 180 V214" stroke="#e0a800" stroke-width="3"/><circle cx="146" cy="214" r="7" fill="#1c2a6b"/>`,
    jacket: `<path d="M100 166 L104 188 L120 180 L136 188 L140 166Z" fill="#15204f"/><path d="M120 180 V348" stroke="#94a3b8" stroke-width="2.5"/><path d="M72 262 H168 V274 H72Z" fill="#ffbf0f"/>`,
  }[T.outfit];
  const arm = (side, x, item) => `
    <g id="${P}-a${side}" transform="translate(${x} 186)">
      <rect x="-13" y="-8" width="26" height="90" rx="13" fill="${sleeve}"/>
      <g id="${P}-f${side}" transform="translate(0 76)">
        <rect x="-11" y="-4" width="22" height="74" rx="11" fill="${fore}"/>
        <g transform="translate(0 74)"><g id="${P}-i${side}">${it(item)}</g><circle cx="0" cy="0" r="13" fill="${sk}"/>${item === 'thumb' ? `<g id="${P}-t${side}">${it('thumb')}</g>` : ''}</g>
      </g>
    </g>`;
  return `<svg viewBox="0 -12 240 532" overflow="visible">
    <ellipse cx="120" cy="506" rx="74" ry="11" fill="rgba(0,0,0,.35)"/>
    <g id="${P}-lL"><rect x="88" y="334" width="30" height="154" rx="13" fill="${T.pants}"/><ellipse cx="100" cy="492" rx="23" ry="11" fill="${T.shoe}"/></g>
    <g id="${P}-lR"><rect x="122" y="334" width="30" height="154" rx="13" fill="${T.pants}"/><ellipse cx="140" cy="492" rx="23" ry="11" fill="${T.shoe}"/></g>
    <g id="${P}-up">
      <g id="${P}-hb">${hairBack}</g>
      <rect x="108" y="136" width="24" height="40" rx="9" fill="${sk}"/>
      <path d="M68 196 Q68 172 96 170 L144 170 Q172 172 172 196 L168 350 L72 350 Z" fill="${T.top}"/>
      ${outfit}
      <g id="${P}-hd">
        <circle cx="74" cy="106" r="9" fill="${sk}"/><circle cx="166" cy="106" r="9" fill="${sk}"/>
        <ellipse cx="120" cy="100" rx="46" ry="52" fill="${sk}"/>
        ${T.beard ? `<path d="M76 108 Q80 154 120 156 Q160 154 164 108 Q158 134 140 140 Q120 146 100 140 Q82 134 76 108Z" fill="${T.hair}"/>` : ''}
        ${hairFront}
        <circle cx="92" cy="120" r="8" fill="#ff7a7a" opacity=".28"/><circle cx="148" cy="120" r="8" fill="#ff7a7a" opacity=".28"/>
        <path id="${P}-bL" d="M93 88 Q103 82 113 88" stroke="${dark}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path id="${P}-bR" d="M127 88 Q137 82 147 88" stroke="${dark}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <g id="${P}-ey"><ellipse cx="103" cy="103" rx="5" ry="6.5" fill="#1f1a17"/><ellipse cx="137" cy="103" rx="5" ry="6.5" fill="#1f1a17"/><circle cx="105" cy="100" r="1.8" fill="#fff"/><circle cx="139" cy="100" r="1.8" fill="#fff"/></g>
        <path d="M120 106 Q115 117 122 118" stroke="rgba(0,0,0,.25)" stroke-width="3" fill="none" stroke-linecap="round"/>
        ${T.mustache || T.beard ? `<path d="M103 121 Q112 113 120 119 Q128 113 137 121 Q128 127 120 123 Q112 127 103 121Z" fill="${T.hair === '#3a2a20' || T.beard ? T.hair : '#222'}"/>` : ''}
        <path id="${P}-m" d="${MOUTHS.smile[0]}" fill="none" stroke="#6b2d24" stroke-width="4" stroke-linecap="round"/>
        ${T.glasses ? '<g stroke="#111" stroke-width="3" fill="rgba(255,255,255,.18)"><rect x="89" y="92" width="28" height="22" rx="7"/><rect x="123" y="92" width="28" height="22" rx="7"/><path d="M117 101h6" fill="none"/></g>' : ''}
        ${hat}
        ${sweat ? `<path id="${P}-sw" d="M160 62 q7 11 0 16 q-7 -5 0 -16z" fill="#7dd3fc"/>` : ''}
      </g>
      ${arm('L', 74, itemL)}
      ${arm('R', 166, itemR)}
    </g>
  </svg>`;
}

const _cache = {};
function _g(P, k) { const id = P + '-' + k; return _cache[id] !== undefined ? _cache[id] : (_cache[id] = document.getElementById(id)); }

/* o: { aL:[shoulder°, elbow°], aR, uL/uR: keep item upright (+tilt°), showL/showR, head°, lean°, look:[dx,dy],
        blink 0..1, mouth, brows:'worry'|'up', legs:[L°,R°], sweat:px } */
function pose(P, o) {
  const aL = o.aL || [8, -8], aR = o.aR || [-8, 8];
  _g(P, 'aL').setAttribute('transform', `translate(74 186) rotate(${aL[0]})`); _g(P, 'fL').setAttribute('transform', `translate(0 76) rotate(${aL[1]})`);
  _g(P, 'aR').setAttribute('transform', `translate(166 186) rotate(${aR[0]})`); _g(P, 'fR').setAttribute('transform', `translate(0 76) rotate(${aR[1]})`);
  const up = (side, a, u) => {
    const r = u == null ? 0 : -(a[0] + a[1]) + u;
    _g(P, 'i' + side).setAttribute('transform', `rotate(${r})`);
    const th = _g(P, 't' + side); if (th) th.setAttribute('transform', `rotate(${-(a[0] + a[1])})`);
    const show = o['show' + side]; _g(P, 'i' + side).setAttribute('opacity', show === false ? 0 : 1);
  };
  up('L', aL, o.uL); up('R', aR, o.uR);
  const hd = `rotate(${o.head || 0} 120 152)`;
  _g(P, 'hd').setAttribute('transform', hd); _g(P, 'hb').setAttribute('transform', hd);
  _g(P, 'up').setAttribute('transform', `rotate(${o.lean || 0} 120 350)`);
  const lk = o.look || [0, 0];
  _g(P, 'ey').setAttribute('transform', `translate(${lk[0]} ${103 + lk[1]}) scale(1 ${1 - 0.92 * (o.blink || 0)}) translate(0 -103)`);
  const m = MOUTHS[o.mouth || 'smile'], mp = _g(P, 'm');
  mp.setAttribute('d', m[0]); mp.setAttribute('fill', m[1]); mp.setAttribute('stroke', m[2]);
  const b = o.brows === 'worry' ? [-14, 14, 0] : o.brows === 'up' ? [0, 0, -6] : [0, 0, 0];
  _g(P, 'bL').setAttribute('transform', `translate(0 ${b[2]}) rotate(${b[0]} 103 86)`);
  _g(P, 'bR').setAttribute('transform', `translate(0 ${b[2]}) rotate(${b[1]} 137 86)`);
  const l = o.legs || [0, 0];
  _g(P, 'lL').setAttribute('transform', `rotate(${l[0]} 103 340)`);
  _g(P, 'lR').setAttribute('transform', `rotate(${l[1]} 137 340)`);
  const sw = _g(P, 'sw'); if (sw) { sw.setAttribute('transform', `translate(0 ${o.sweat || 0})`); sw.setAttribute('opacity', o.sweat == null ? 0 : 1 - o.sweat / 30); }
}

// deterministic blink: ~every 3.4s, 0.16s long
function blinkAt(t, seed) { const p = (t + seed * 1.7) % 3.4; return p < 0.16 ? Math.sin(Math.PI * p / 0.16) : 0; }
// linear blend between two arrays
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
// 0→1→0 bump centred on t0
const bump = (t, t0, w) => Math.sin(Math.PI * Math.min(1, Math.max(0, (t - t0 + w / 2) / w)));
