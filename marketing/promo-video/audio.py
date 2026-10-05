# Synthesizes an original 60s soundtrack (120 BPM, bars land on scene cuts) + SFX from sfx.json.
import json, wave, os
import numpy as np

SR = 48000
DUR = 78.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
HERE = os.path.dirname(os.path.abspath(__file__))

def t_arr(d): return np.arange(int(SR * d)) / SR
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def lp(x, k):  # cheap low-pass: moving average of k samples
    if k <= 1: return x
    return np.convolve(x, np.ones(k) / k, mode='same')
def hp(x, k): return x - lp(x, k)

def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N or i + len(sig) <= 0: return
    j0 = max(0, -i); sig = sig[j0:]; i = max(0, i)
    sig = sig[:N - i]
    l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    buf[0, i:i + len(sig)] += sig * gain * l * 1.41
    buf[1, i:i + len(sig)] += sig * gain * r * 1.41

def adsr(n, a, r, sus=1.0):
    e = np.ones(n) * sus
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na: e[:na] = np.linspace(0, sus, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e

def saw_additive(f, d, harm=8, detune=0.0):
    t = t_arr(d); out = np.zeros_like(t)
    for h in range(1, harm + 1):
        if f * h > 12000: break
        out += np.sin(2 * np.pi * f * h * (1 + detune) * t + h) / h
    return out

# ─── instruments ───
def pad(freqs, d):
    s = sum(saw_additive(f, d, 6, dt) for f in freqs for dt in (-0.004, 0.0, 0.0045))
    return s / (len(freqs) * 3) * adsr(len(s), 0.35, 0.4)

def pluck(f, d=0.35):
    t = t_arr(d)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)) * np.exp(-t / 0.11)

def bass(f, d):
    t = t_arr(d)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.1 * np.sin(6 * np.pi * f * t)
    return np.tanh(1.6 * s) * np.exp(-t / 0.22) * adsr(len(t), 0.004, 0.03)

def kick():
    t = t_arr(0.45)
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.16) + 0.25 * rng.standard_normal(len(t)) * np.exp(-t / 0.004)

def clap():
    t = t_arr(0.3); n = rng.standard_normal(len(t))
    env = np.exp(-t / 0.07) * (1 + 0.6 * (np.sin(2 * np.pi * 90 * t) > 0) * (t < 0.03))
    return hp(lp(n, 3), 20) * env

def hat(d=0.05):
    t = t_arr(0.12); n = rng.standard_normal(len(t))
    return hp(n, 4) * np.exp(-t / d)

def noise_riser(d):
    t = t_arr(d); n = rng.standard_normal(len(t))
    p = t / d
    return (lp(n, 30) * (1 - p) + hp(n, 6) * p) * p ** 2.2

def impact():
    t = t_arr(2.2)
    boom = np.sin(2 * np.pi * (38 + 60 * np.exp(-t / 0.08)) * t) * np.exp(-t / 0.7)
    crash = hp(rng.standard_normal(len(t)), 5) * np.exp(-t / 0.9) * 0.35
    return boom + crash

# ─── music ───
BPM, BEAT = 120, 0.5
BAR = BEAT * 4
music = np.zeros((2, N))
drums = np.zeros((2, N))
# Am  F  C  G  (voicings, midi)
CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [55, 60, 64, 67], [55, 59, 62, 67]]
ROOTS = [45, 41, 48, 43]
nbars = int(DUR / BAR)

def section(t):
    if t < 4: return 'intro'
    if t < 8: return 'build'
    if t < 10: return 'riser'
    if 68 <= t < 70: return 'break'
    if t >= 76: return 'end'
    return 'full'

for b in range(nbars):
    t0 = b * BAR; ci = b % 4; sec = section(t0)
    if sec == 'end':
        break
    # pad (always)
    add(music, t0, pad([mtof(m) for m in CHORDS[ci]], BAR + 0.3), 0.22 if sec != 'intro' else 0.34)
    # arp plucks 16ths (up-down pattern)
    notes = CHORDS[ci] + [CHORDS[ci][1] + 12, CHORDS[ci][2] + 12]
    pat = [0, 2, 4, 5, 3, 4, 2, 1]
    for k in range(16):
        tt = t0 + k * BEAT / 4
        sec_k = section(tt)
        g = {'intro': 0.13, 'build': 0.12, 'riser': 0.11, 'full': 0.11, 'break': 0.10}.get(sec_k, 0)
        if sec_k == 'intro' and k % 2: continue
        add(music, tt, pluck(mtof(notes[pat[k % 8]] + 12)), g, pan=0.35 if k % 2 else -0.35)
    # bass 8ths
    for k in range(8):
        tt = t0 + k * BEAT / 2; s = section(tt)
        if s in ('build', 'riser', 'full'):
            f = mtof(ROOTS[ci] - 12 + (12 if k in (3, 7) else 0))
            add(music, tt, bass(f, BEAT / 2 + 0.05), 0.30 if s == 'full' else 0.2)
    # drums
    for k in range(4):
        tt = t0 + k * BEAT; s = section(tt)
        if s == 'full':
            add(drums, tt, kick(), 0.85)
            if k in (1, 3): add(drums, tt, clap(), 0.28)
        if s in ('full', 'build'):
            add(drums, tt + BEAT / 2, hat(), 0.16 if s == 'full' else 0.10, pan=0.2)
            if s == 'full': add(drums, tt + BEAT / 4 * 3, hat(0.02), 0.07, pan=-0.2)

# snare roll into drop (8 → 10) and into CTA (50 → 52)
for (a, b_) in ((8.0, 10.0), (68.0, 70.0)):
    k, tt = 0, a
    while tt < b_ - 0.01:
        step = BEAT / 2 if tt < a + 1 else BEAT / 4 if tt < a + 1.5 else BEAT / 8
        add(drums, tt, clap(), 0.10 + 0.25 * (tt - a) / (b_ - a)); tt += step
    add(music, a, noise_riser(b_ - a), 0.22)

# final chord + hit at 76
add(music, 76.0, pad([mtof(m) for m in [45, 57, 60, 64, 69]], 2.0), 0.3)
add(drums, 76.0, impact(), 0.6)

# sidechain pump on music in full sections
tt = np.arange(N) / SR
since = np.mod(tt, BEAT)
pump = 1 - 0.38 * np.exp(-since / 0.11)
full_mask = np.array([section(x) == 'full' for x in np.arange(0, DUR, 0.01)])
full_env = np.repeat(full_mask.astype(float), int(SR * 0.01))[:N]
full_env = lp(np.pad(full_env, (0, N - len(full_env))), 2400)
music *= 1 - (1 - pump) * full_env

# ─── SFX ───
def s_whoosh():
    d = 0.7; t = t_arr(d); n = rng.standard_normal(len(t)); p = t / d
    env = np.sin(np.pi * p) ** 2
    return (lp(n, 18) * (1 - p) + hp(lp(n, 3), 12) * p) * env * 0.8
def s_pop():
    t = t_arr(0.09); f = 520 + 700 * t / 0.09
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.03)
def s_tap():
    t = t_arr(0.06)
    return (np.sin(2 * np.pi * 1500 * t) * 0.6 + rng.standard_normal(len(t)) * 0.4) * np.exp(-t / 0.008)
def bell(f, d=1.2, tau=0.35):
    t = t_arr(d)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.15) + 0.2 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.1)) * np.exp(-t / tau)
def s_success():
    out = np.zeros(int(SR * 1.3)); a = bell(mtof(84), 1.2, 0.3); b = bell(mtof(91), 1.2, 0.4)
    out[:len(a)] += a; o = int(0.11 * SR); out[o:o + len(b)] += b[:len(out) - o]
    return out * 0.6
def s_chime():
    out = np.zeros(int(SR * 1.4))
    for i, m in enumerate((84, 88, 91)):
        s = bell(mtof(m), 1.0, 0.25); o = int(i * 0.08 * SR); out[o:o + len(s)] += s
    return out * 0.45
def s_ding(): return bell(mtof(93), 1.5, 0.45) * 0.55
def s_print():
    d = 2.3; t = t_arr(d); n = hp(rng.standard_normal(len(t)), 8)
    am = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 42 * t))
    return n * am * adsr(len(t), 0.05, 0.1) * 0.22 + np.sin(2 * np.pi * 180 * t) * 0.05 * adsr(len(t), 0.05, 0.1)
def s_beep():
    t = t_arr(0.14); return np.sin(2 * np.pi * 1850 * t) * adsr(len(t), 0.005, 0.02) * 0.45
def s_notify():
    out = np.zeros(int(SR * 0.6))
    for i, f in enumerate((880, 1318)):
        t = t_arr(0.25); s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.07); o = int(i * 0.11 * SR); out[o:o + len(s)] += s
    return out * 0.6
def s_shimmer():
    out = np.zeros(int(SR * 1.6))
    for i in range(14):
        f = 2000 + rng.random() * 4500; s = bell(f, 0.5, 0.12) * 0.12; o = int(rng.random() * 1.0 * SR); out[o:o + len(s)] += s
    return out
def s_hit(): return impact() * 0.7

SFXGEN = dict(whoosh=s_whoosh, pop=s_pop, tap=s_tap, success=s_success, chime=s_chime, ding=s_ding,
              print=s_print, beep=s_beep, notify=s_notify, shimmer=s_shimmer, hit=s_hit, impact=impact)
sfx = np.zeros((2, N))
for c in json.load(open(os.path.join(HERE, 'sfx.json'))):
    g = {'whoosh': 0.35, 'impact': 0.75, 'hit': 0.7}.get(c['type'], 0.5) * c.get('gain', 1)
    add(sfx, c['t'], SFXGEN[c['type']](), g, pan=0.0)
    if c['type'] == 'impact': add(sfx, c['t'], kick(), 0.9)

mix = music * 0.9 + drums * 0.75 + sfx * 0.9
# fades
fade = np.ones(N); fi, fo = int(0.4 * SR), int(1.6 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
mix *= fade
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.4) / np.tanh(1.4) * 0.92

pcm = (mix.T * 32767).astype(np.int16)
with wave.open(os.path.join(HERE, 'audio.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('audio.wav written', pcm.shape)
