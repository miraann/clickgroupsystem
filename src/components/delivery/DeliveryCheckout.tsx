'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import {
  Loader2, MapPin, X, Check, CheckCircle2, AlertCircle,
  Truck, Clock, Package, Crosshair, Eye,
  ShieldCheck, ChevronRight, User, Phone, Tag,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Lazy-load the map to avoid SSR
const LocationPickerMap = dynamic(
  () => import('@/components/delivery/LocationPickerMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full flex items-center justify-center" style={{ height: 160, background: 'rgba(255,255,255,0.03)' }}>
        <Loader2 className="w-5 h-5 animate-spin text-amber-400/40" />
      </div>
    ),
  }
)

// Map height: 160px on small phones, 200px on larger screens
const MAP_H = typeof window !== 'undefined' && window.innerWidth < 390 ? 160 : 200

// ─── Constants ────────────────────────────────────────────────────────────────
// @vladmandic/face-api ships model weights INSIDE the npm package (model/ dir),
// so jsDelivr can serve them reliably — unlike face-api.js which omits weights.
const MODEL_CDN  = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model'

const EAR_CLOSE  = 0.21   // EAR drops below → eye closed
const EAR_OPEN   = 0.27   // EAR rises above → blink complete

// Face validation thresholds — tuned for whole-face / mid-distance capture
const SCORE_MIN  = 0.80   // slightly lower: smaller face = harder to detect
const AREA_MIN   = 0.10   // face can be as little as 10% of frame (user further back)
const AREA_MAX   = 0.38   // cap: if face exceeds 38% the user is too close
const CENTRE_MAX = 0.20   // face centre within ±20% of frame centre
const ROLL_MAX   = 15     // max head roll in degrees
const YAW_MAX    = 0.30   // slightly more lenient yaw for mid-distance
const HOLD_MS    = 3000   // ms face must stay valid before auto-capture

// ─── Types ────────────────────────────────────────────────────────────────────
interface Pt { x: number; y: number }

export interface DeliveryCheckoutProps {
  restaurantId: string
  primaryColor: string
  cartCount: number
  cartTotal: number
  formatPrice: (n: number) => string
  onClose: () => void
  onConfirm: (
    name: string, phone: string,
    lat: number | null, lng: number | null,
    address: string | null,
    discountAmount: number,
    couponId: string | null,
    selfieUrl: string | null
  ) => void
  placing: boolean
  placeError: string | null
  deliveryFee: number
  estimatedTime: number
  minOrder: number
  faceScanEnabled?: boolean
}

type Step      = 'details' | 'scan'
type ScanPhase = 'loading' | 'searching' | 'face_found' | 'captured' | 'error'

// ─── Math helpers ─────────────────────────────────────────────────────────────
function dist(a: Pt, b: Pt): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

// Eye Aspect Ratio — 6 ordered eye landmarks:
// [0]=left-corner, [1]=top-left, [2]=top-right,
// [3]=right-corner, [4]=bottom-right, [5]=bottom-left
function calcEAR(pts: Pt[]): number {
  const a = dist(pts[1], pts[5])
  const b = dist(pts[2], pts[4])
  const c = dist(pts[0], pts[3])
  if (c === 0) return 1
  return (a + b) / (2 * c)
}

// ─── Face Scan Panel ──────────────────────────────────────────────────────────
function FaceScanPanel({ onVerified }: { onVerified: (selfieUrl: string) => void }) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const rafRef     = useRef<number>(0)
  const frameCount = useRef(0)
  const eyeDown    = useRef(false)
  const validSince = useRef<number | null>(null)
  const didCapture = useRef(false)

  const [phase,      setPhase]      = useState<ScanPhase>('loading')
  const [errMsg,     setErrMsg]     = useState('')
  const [captured,   setCaptured]   = useState<string | null>(null)
  const [progress,   setProgress]   = useState(0)
  const [retryKey,   setRetryKey]   = useState(0)
  const [uploading,  setUploading]  = useState(false)
  const [uploadErr,  setUploadErr]  = useState<string | null>(null)

  function retake() {
    didCapture.current = false
    frameCount.current = 0
    eyeDown.current    = false
    validSince.current = null
    setCaptured(null)
    setProgress(0)
    setErrMsg('')
    setUploadErr(null)
    setPhase('loading')
    setRetryKey(k => k + 1)
  }

  async function uploadSelfie(dataUrl: string): Promise<string> {
    const res = await fetch('/api/upload/selfie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    })
    const json = await res.json() as { ok: boolean; url?: string; error?: string }
    if (!res.ok || !json.ok) throw new Error(json.error ?? 'Upload failed')
    return json.url!
  }

  useEffect(() => {
    let cancelled = false
    didCapture.current = false
    frameCount.current = 0
    eyeDown.current    = false
    validSince.current = null

    // ── Capture: draw FIRST, then stop stream (stopping first blacks out iOS) ──
    function doCapture() {
      const vid = videoRef.current
      if (!vid || didCapture.current) return
      didCapture.current = true
      cancelAnimationFrame(rafRef.current)

      const W     = vid.videoWidth  || 320
      const H     = vid.videoHeight || 240
      const scale = 320 / Math.max(W, H)
      const outW  = Math.round(W * scale)
      const outH  = Math.round(H * scale)
      const off   = document.createElement('canvas')
      off.width   = outW
      off.height  = outH
      const ctx   = off.getContext('2d')!
      ctx.translate(outW, 0)    // un-mirror the CSS scaleX(-1)
      ctx.scale(-1, 1)
      ctx.drawImage(vid, 0, 0, outW, outH)   // capture before stopping
      streamRef.current?.getTracks().forEach(t => t.stop())
      setCaptured(off.toDataURL('image/webp', 0.75))
      setPhase('captured')
    }

    async function boot() {
      // 1. Start camera first — request portrait (taller) dimensions for 9:16
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } },
        audio: false,
      })
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      const vid = videoRef.current!
      vid.srcObject = stream
      await new Promise<void>(r => { vid.onloadedmetadata = () => r() })
      await vid.play()

      // 2. Load models in parallel (camera already streaming)
      const faceapi = await import('@vladmandic/face-api')
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_CDN),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_CDN),
        ])
      } catch (modelErr) {
        throw new Error(`Model weights failed: ${(modelErr as Error).message}`)
      }
      if (cancelled) return
      setPhase('searching')

      const canvas = canvasRef.current!
      const ctx2d  = canvas.getContext('2d')!

      async function tick() {
        if (cancelled || didCapture.current) return
        frameCount.current++

        const W = vid.videoWidth  || 640
        const H = vid.videoHeight || 480
        if (canvas.width !== W) { canvas.width = W; canvas.height = H }
        ctx2d.clearRect(0, 0, W, H)

        // Throttle to every 6th frame (~5 fps on a 30 fps camera)
        if (frameCount.current % 6 !== 0) {
          rafRef.current = requestAnimationFrame(tick)
          return
        }

        try {
          const det = await faceapi
            .detectSingleFace(vid, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
            .withFaceLandmarks(true)

          if (cancelled || didCapture.current) return

          const cx = W / 2, cy = H / 2
          const rx = W * 0.20, ry = H * 0.28
          let isValid = false
          let hasFace = false

          if (det) {
            hasFace = true
            const box   = det.detection.box
            const score = det.detection.score
            const le    = det.landmarks.getLeftEye()  as unknown as Pt[]
            const re    = det.landmarks.getRightEye() as unknown as Pt[]

            // ── 6 validation checks ──────────────────────────
            const areaRatio = (box.width * box.height) / (W * H)
            const faceCx    = box.x + box.width  / 2
            const faceCy    = box.y + box.height / 2
            const offX      = Math.abs((faceCx - cx) / W)
            const offY      = Math.abs((faceCy - cy) / H)

            const leMid: Pt = { x: (le[0].x + le[3].x) / 2, y: (le[0].y + le[3].y) / 2 }
            const reMid: Pt = { x: (re[0].x + re[3].x) / 2, y: (re[0].y + re[3].y) / 2 }
            const roll = Math.abs(Math.atan2(reMid.y - leMid.y, reMid.x - leMid.x) * 180 / Math.PI)

            const nose    = det.landmarks.getNose() as unknown as Pt[]
            const noseTip = nose[3]
            const eyeMidX = (leMid.x + reMid.x) / 2
            const interEye = dist(leMid, reMid)
            const yaw = interEye > 0 ? Math.abs(noseTip.x - eyeMidX) / interEye : 1

            // ── Whole-face check: forehead + eyes + chin must all be visible ──
            const jaw   = det.landmarks.getJawOutline()   as unknown as Pt[]
            const lBrow = det.landmarks.getLeftEyeBrow()  as unknown as Pt[]
            const rBrow = det.landmarks.getRightEyeBrow() as unknown as Pt[]
            const chinY    = jaw[8].y
            const browTopY = Math.min(...[...lBrow, ...rBrow].map((p: Pt) => p.y))
            const eyeMidY  = (leMid.y + reMid.y) / 2
            const faceSpan = chinY - browTopY   // px from brow to chin
            const wholeface = chinY > eyeMidY       // chin is below eyes
              && browTopY < eyeMidY               // brows are above eyes
              && faceSpan >= H * 0.18             // whole face has vertical extent
              && browTopY > H * 0.01              // forehead isn't cut off at top
              && chinY    < H * 0.99              // chin isn't cut off at bottom

            const noClip = box.x >= 0 && box.y >= 0
              && (box.x + box.width)  <= W
              && (box.y + box.height) <= H

            isValid = score >= SCORE_MIN
              && noClip
              && areaRatio >= AREA_MIN && areaRatio <= AREA_MAX
              && offX <= CENTRE_MAX   && offY <= CENTRE_MAX
              && roll <= ROLL_MAX
              && yaw  <= YAW_MAX
              && wholeface

            // ── Blink detection (EAR) ─────────────────────────
            const ear = (calcEAR(le) + calcEAR(re)) / 2
            if (ear < EAR_CLOSE && !eyeDown.current) {
              eyeDown.current = true
            } else if (ear > EAR_OPEN && eyeDown.current) {
              eyeDown.current = false
              // Only capture on blink when whole face is confirmed valid
              if (!didCapture.current && isValid) { doCapture(); return }
            }

            // Eye landmark dots
            ;[...le, ...re].forEach(p => {
              ctx2d.beginPath()
              ctx2d.arc(p.x, p.y, 2, 0, Math.PI * 2)
              ctx2d.fillStyle = isValid ? '#34d399' : '#F59E0B'
              ctx2d.fill()
            })
          }

          // ── Face guide oval ───────────────────────────────────
          const ovalColor = isValid
            ? '#34d399'
            : hasFace ? 'rgba(245,158,11,0.95)' : 'rgba(255,255,255,0.30)'
          ctx2d.beginPath()
          ctx2d.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
          ctx2d.strokeStyle = ovalColor
          ctx2d.lineWidth   = isValid ? 4.5 : 3
          ctx2d.shadowColor = isValid ? 'rgba(52,211,153,0.8)' : hasFace ? 'rgba(245,158,11,0.6)' : 'transparent'
          ctx2d.shadowBlur  = (isValid || hasFace) ? 20 : 0
          ctx2d.stroke()
          ctx2d.shadowBlur  = 0

          // ── Corner brackets at oval bounding box ──────────────
          const bL = cx - rx, bR = cx + rx, bT = cy - ry, bB = cy + ry
          const bl = Math.min(rx, ry) * 0.28
          ctx2d.lineWidth   = isValid ? 5.5 : hasFace ? 4 : 3
          ctx2d.strokeStyle = ovalColor
          ctx2d.lineCap     = 'round'
          ctx2d.shadowColor = isValid ? 'rgba(52,211,153,1)' : hasFace ? 'rgba(245,158,11,0.8)' : 'rgba(255,255,255,0.5)'
          ctx2d.shadowBlur  = isValid ? 24 : hasFace ? 16 : 10
          const brackets: [number,number,number,number][] = [
            [bL, bT,  1,  1],
            [bR, bT, -1,  1],
            [bL, bB,  1, -1],
            [bR, bB, -1, -1],
          ]
          brackets.forEach(([x, y, dx, dy]) => {
            ctx2d.beginPath()
            ctx2d.moveTo(x + dx * bl, y)
            ctx2d.lineTo(x, y)
            ctx2d.lineTo(x, y + dy * bl)
            ctx2d.stroke()
          })
          ctx2d.shadowBlur = 0
          ctx2d.lineCap    = 'butt'

          // ── Phase + auto-capture countdown ────────────────────
          if (isValid) {
            if (!validSince.current) validSince.current = Date.now()
            const elapsed = Date.now() - validSince.current
            setProgress(Math.min(100, (elapsed / HOLD_MS) * 100))
            setPhase('face_found')
            if (elapsed >= HOLD_MS && !didCapture.current) { doCapture(); return }
          } else {
            if (validSince.current) { validSince.current = null; setProgress(0) }
            setPhase('searching')
          }
        } catch { /* ignore per-frame detection errors */ }

        if (!cancelled && !didCapture.current) {
          rafRef.current = requestAnimationFrame(tick)
        }
      }

      tick()
    }

    boot().catch(err => {
      if (cancelled) return
      const e = err as DOMException
      setErrMsg(
        e.name === 'NotAllowedError'
          ? 'Camera permission denied. Tap the address bar lock icon → allow camera → try again.'
          : e.name === 'NotFoundError'
          ? 'No camera found on this device.'
          : (err as Error)?.message ?? 'Face detection could not load. Please try again.'
      )
      setPhase('error')
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [retryKey])

  return (
    <div className="space-y-4">
      {/* Scan animations */}
      <style>{`
        @keyframes scanBeam {
          0%   { top: 22%; opacity: 0; }
          6%   { opacity: 1; }
          94%  { opacity: 1; }
          100% { top: 78%; opacity: 0; }
        }
        @keyframes scanGlow {
          0%, 100% { box-shadow: 0 0 0 3px rgba(52,211,153,0.20), 0 0 32px rgba(52,211,153,0.22), inset 0 0 32px rgba(52,211,153,0.05); }
          50%       { box-shadow: 0 0 0 3px rgba(52,211,153,0.45), 0 0 60px rgba(52,211,153,0.45), inset 0 0 60px rgba(52,211,153,0.12); }
        }
        @keyframes scanSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Camera viewport — strict 9:16 portrait ───────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden mx-auto"
        style={{
          aspectRatio: '9/16',
          width: '100%',
          maxWidth: 'calc(min(72dvh, 520px) * 9 / 16)',
          background: 'rgba(10,13,24,0.90)',
          border: phase === 'face_found' || phase === 'captured'
            ? '4px solid rgba(52,211,153,0.85)'
            : phase === 'error'
            ? '1px solid rgba(239,68,68,0.35)'
            : '1px solid rgba(245,158,11,0.30)',
          animation: phase === 'face_found' ? 'scanGlow 1.6s ease-in-out infinite' : 'none',
          boxShadow: phase === 'captured'
            ? '0 0 0 3px rgba(52,211,153,0.30), 0 0 40px rgba(52,211,153,0.35)'
            : 'none',
          transition: 'border 0.35s ease',
        }}
      >
        {/* Live video (hidden once captured) */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)', display: phase === 'captured' ? 'none' : 'block' }}
          playsInline
          muted
        />

        {/* Landmark + oval canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            transform: 'scaleX(-1)',
            display: phase === 'searching' || phase === 'face_found' ? 'block' : 'none',
          }}
        />

        {/* Loading overlay */}
        {phase === 'loading' && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
            style={{ backdropFilter: 'blur(8px)', background: 'rgba(8,11,22,0.72)' }}
          >
            <Loader2 className="w-9 h-9 text-amber-400 animate-spin" />
            <p className="text-sm text-white/50 font-medium">Starting camera…</p>
          </div>
        )}

        {/* Scanning animation — glowing beam sweeping top to bottom */}
        {phase === 'searching' && (
          <div className="absolute inset-0 pointer-events-none z-10">
            {/* Spinning arc around the oval */}
            <div
              className="absolute"
              style={{
                left: '28%', right: '28%', top: '20%', bottom: '20%',
                borderRadius: '50%',
                border: '2px solid transparent',
                borderTopColor: 'rgba(245,158,11,0.70)',
                borderRightColor: 'rgba(245,158,11,0.20)',
                animation: 'scanSpin 2s linear infinite',
              }}
            />
            {/* Main scan beam — bright glowing line */}
            <div
              className="absolute"
              style={{
                left: '29%', right: '29%',
                height: '3px',
                borderRadius: '2px',
                background: 'linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.5) 15%, #FFD700 50%, rgba(245,158,11,0.5) 85%, transparent 100%)',
                boxShadow: '0 0 8px 4px rgba(245,158,11,0.65), 0 0 22px 10px rgba(245,158,11,0.25)',
                animation: 'scanBeam 2.4s ease-in-out infinite',
              }}
            />
            {/* Beam tail glow — soft fade below the line */}
            <div
              className="absolute"
              style={{
                left: '29%', right: '29%',
                height: '50px',
                marginTop: '3px',
                background: 'linear-gradient(to bottom, rgba(245,158,11,0.18) 0%, transparent 100%)',
                animation: 'scanBeam 2.4s ease-in-out infinite',
              }}
            />
          </div>
        )}

        {/* Error state */}
        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 z-10">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)' }}
            >
              <AlertCircle className="w-6 h-6 text-rose-400" />
            </div>
            <p className="text-xs text-white/55 text-center leading-relaxed">{errMsg}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white/80 transition-all active:scale-95"
              style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.14)' }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Captured selfie preview */}
        {phase === 'captured' && captured && (
          <img src={captured} alt="Captured selfie" className="w-full h-full object-cover" />
        )}

        {/* Hint chip — face locked */}
        {phase === 'face_found' && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center z-10 pointer-events-none">
            <div
              className="px-3.5 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: 'rgba(52,211,153,0.16)',
                border: '1px solid rgba(52,211,153,0.35)',
                color: '#34d399',
                backdropFilter: 'blur(10px)',
              }}
            >
              Blink to capture instantly
            </div>
          </div>
        )}

        {/* Hint chip — searching */}
        {phase === 'searching' && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center z-10 pointer-events-none">
            <div
              className="px-3.5 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.50)',
                backdropFilter: 'blur(10px)',
              }}
            >
              Position your face in the oval · look straight ahead
            </div>
          </div>
        )}
      </div>

      {/* ── Auto-capture progress bar ─────────────────────────── */}
      {phase === 'face_found' && (
        <div
          className="rounded-2xl px-5 py-3 space-y-2"
          style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.18)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-400">Face locked — auto-capturing…</span>
            <span className="text-[10px] text-emerald-400/55">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(52,211,153,0.12)' }}>
            <div
              className="h-full rounded-full transition-[width] duration-150"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #34d399, #10b981)' }}
            />
          </div>
          <p className="text-[10px] text-white/25 text-center">or blink now to capture instantly</p>
        </div>
      )}

      {/* ── Post-capture: confirm / retake ───────────────────── */}
      {phase === 'captured' && (
        <div className="space-y-2.5">
          <div
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
            style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.22)' }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <p className="text-[11px] text-emerald-400 font-semibold">
              Liveness confirmed! Review your selfie above.
            </p>
          </div>

          {uploadErr && (
            <div
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.20)' }}
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <p className="text-[11px] text-rose-400">{uploadErr}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={retake}
              disabled={uploading}
              className="py-3.5 rounded-2xl text-sm font-semibold text-white/65 transition-all active:scale-95 disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              Retake
            </button>
            <button
              onClick={async () => {
                if (!captured || uploading) return
                setUploading(true)
                setUploadErr(null)
                try {
                  const url = await uploadSelfie(captured)
                  onVerified(url)
                } catch {
                  setUploadErr('Upload failed — tap Confirm to retry.')
                  setUploading(false)
                }
              }}
              disabled={uploading}
              className="py-3.5 rounded-2xl text-sm font-bold text-black transition-all active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-1.5"
              style={{
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                boxShadow: '0 6px 20px rgba(245,158,11,0.35)',
              }}
            >
              {uploading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                : 'Confirm →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Why verification card ─────────────────────────────── */}
      {(phase === 'loading' || phase === 'searching') && (
        <div
          className="rounded-2xl px-5 py-4 space-y-2"
          style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.14)' }}
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs font-bold text-amber-400">Why face verification?</p>
          </div>
          <p className="text-[11px] text-white/40 leading-relaxed">
            A blink-based liveness check confirms this is a real person placing the order — preventing fraudulent or automated orders. Your image never leaves this device.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step, primaryColor }: { step: Step; primaryColor: string }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'scan',    label: 'Verify'  },
    { id: 'details', label: 'Order'   },
  ]
  const activeIdx = steps.findIndex(s => s.id === step)

  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const past   = i < activeIdx
        const active = i === activeIdx
        return (
          <div key={s.id} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all duration-300"
                style={{
                  background: active ? primaryColor : past ? 'rgba(16,185,129,0.14)' : 'rgba(0,0,0,0.06)',
                  color: active ? '#000' : past ? '#059669' : 'rgba(0,0,0,0.28)',
                  border: active ? 'none' : past ? '1px solid rgba(16,185,129,0.30)' : '1px solid rgba(0,0,0,0.10)',
                }}
              >
                {past ? <Check className="w-2.5 h-2.5" strokeWidth={3} /> : i + 1}
              </div>
              <span
                className="text-[10px] font-semibold transition-colors duration-300"
                style={{ color: active ? 'rgba(0,0,0,0.85)' : past ? '#059669' : 'rgba(0,0,0,0.30)' }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="w-8 h-px transition-all duration-500"
                style={{ background: past ? 'rgba(16,185,129,0.35)' : 'rgba(0,0,0,0.10)' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Tiny shared primitives ───────────────────────────────────────────────────
function inputStyle(error?: string, warn?: boolean): React.CSSProperties {
  return {
    background: error ? 'rgba(239,68,68,0.06)' : warn ? 'rgba(245,158,11,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${error ? 'rgba(239,68,68,0.38)' : warn ? 'rgba(245,158,11,0.38)' : 'rgba(0,0,0,0.10)'}`,
    transition: 'border-color 0.2s ease, background 0.2s ease',
  }
}

function FieldWrap({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 block">{label}</label>
      {children}
      {error && (
        <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />{error}
        </p>
      )}
    </div>
  )
}

function TotalRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center px-4 py-2.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <span className={`text-xs ${accent ? 'text-emerald-600' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-xs font-semibold ${accent ? 'text-emerald-600' : 'text-gray-700'}`}>{value}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DeliveryCheckout({
  restaurantId, primaryColor, cartCount, cartTotal, formatPrice,
  onClose, onConfirm, placing, placeError,
  deliveryFee, estimatedTime, minOrder,
  faceScanEnabled = true,
}: DeliveryCheckoutProps) {

  // ── Navigation step — skip face scan when disabled ─────────
  const [step,      setStep]      = useState<Step>(faceScanEnabled ? 'scan' : 'details')
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)

  // ── Form state ─────────────────────────────────────────────
  const [name,     setName]     = useState('')
  const [phone,    setPhone]    = useState('')
  const [lat,      setLat]      = useState<number | null>(null)
  const [lng,      setLng]      = useState<number | null>(null)
  const [flyLat,   setFlyLat]   = useState<number | null>(null)
  const [flyLng,   setFlyLng]   = useState<number | null>(null)
  const [address,  setAddress]  = useState<string | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [gpsLoad,  setGpsLoad]  = useState(false)
  const [gpsErr,   setGpsErr]   = useState('')
  const [errors,   setErrors]   = useState<{ name?: string; phone?: string; loc?: string }>({})

  // ── Coupon state ───────────────────────────────────────────
  const [couponCode,    setCouponCode]    = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{ id: string; code: string; discount: number } | null>(null)
  const [couponErr,     setCouponErr]     = useState<string | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)

  // Refs for cleanup
  const watchRef  = useRef<number | null>(null)
  const geocodeTO = useRef<ReturnType<typeof setTimeout> | null>(null)

  const phoneOk = /^[\d\s\-\+\(\)]{7,15}$/.test(phone.trim())

  // Cleanup on unmount
  useEffect(() => () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    if (geocodeTO.current) clearTimeout(geocodeTO.current)
  }, [])

  // ── Reverse geocode (debounced) ────────────────────────────
  const reverseGeocode = useCallback(async (la: number, lo: number) => {
    if (geocodeTO.current) clearTimeout(geocodeTO.current)
    geocodeTO.current = setTimeout(async () => {
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${la}&lon=${lo}&format=json`, { headers: { 'Accept-Language': 'en' } })
        const data = await res.json() as { display_name?: string }
        setAddress(data.display_name ?? null)
      } catch { /* silent */ }
    }, 600)
  }, [])

  const handleMapMove = useCallback((la: number, lo: number) => {
    setLat(la); setLng(lo)
    setErrors(e => ({ ...e, loc: undefined }))
    reverseGeocode(la, lo)
  }, [reverseGeocode])

  const handleGPS = () => {
    if (!navigator.geolocation) { setGpsErr('Geolocation not supported'); return }
    setGpsLoad(true); setGpsErr('')
    if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }

    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude, longitude, accuracy: acc } = pos.coords
        setAccuracy(Math.round(acc))
        setFlyLat(latitude); setFlyLng(longitude)
        setLat(latitude);    setLng(longitude)
        setErrors(e => ({ ...e, loc: undefined }))
        reverseGeocode(latitude, longitude)
        setGpsLoad(false)
        if (acc < 50 && watchRef.current !== null) {
          navigator.geolocation.clearWatch(watchRef.current)
          watchRef.current = null
        }
      },
      err => {
        if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
        setGpsLoad(false)
        setGpsErr(
          err.code === 1 ? 'Location permission denied. Allow access and try again.'
          : err.code === 2 ? 'Location unavailable. Check your GPS.'
          : 'Could not get location. Please try again.'
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  // ── Coupon ─────────────────────────────────────────────────
  const applyCoupon = async () => {
    if (!couponCode.trim()) return
    setCouponLoading(true); setCouponErr(null)
    const sb = createClient()
    const { data } = await sb
      .from('discount_codes')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .ilike('code', couponCode.trim())
      .eq('active', true)
      .single()

    if (!data) { setCouponErr('Invalid or inactive coupon code'); setCouponLoading(false); return }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setCouponErr('This coupon has expired'); setCouponLoading(false); return }
    if (data.max_uses !== null && data.used_count >= data.max_uses) { setCouponErr('This coupon has reached its usage limit'); setCouponLoading(false); return }
    if (data.min_order_amount > 0 && cartTotal < data.min_order_amount) {
      setCouponErr(`Minimum order of ${formatPrice(data.min_order_amount)} required`)
      setCouponLoading(false); return
    }
    const disc = data.discount_type === 'percentage'
      ? Math.min((cartTotal * data.discount_value) / 100, cartTotal)
      : Math.min(data.discount_value, cartTotal)
    setAppliedCoupon({ id: data.id, code: data.code, discount: disc })
    setCouponLoading(false)
  }

  // ── Validation ─────────────────────────────────────────────
  const validateForm = (): boolean => {
    const e: typeof errors = {}
    if (!name.trim()) e.name = 'Full name is required'
    if (!phone.trim()) e.phone = 'Phone number is required'
    else if (!phoneOk) e.phone = 'Enter a valid phone number'
    if (!lat || !lng) e.loc = 'Set your delivery location on the map'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const discountAmount = appliedCoupon?.discount ?? 0
  const grandTotal     = cartTotal + deliveryFee - discountAmount
  const belowMin       = minOrder > 0 && cartTotal < minOrder

  // ── Liveness verified → store selfie URL → advance to step 2 ─
  const handleVerified = useCallback((url: string) => {
    setSelfieUrl(url)
    setStep('details')
  }, [])

  // ── Submit (step 2 CTA — face already verified) ─────────────
  const submit = () => {
    if (!validateForm()) return
    onConfirm(name.trim(), phone.trim(), lat, lng, address, discountAmount, appliedCoupon?.id ?? null, selfieUrl)
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.74)', backdropFilter: 'blur(14px)' }}
    >
      <motion.div
        key="checkout-modal"
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 48 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        /* Mobile: full-screen, no rounded top. sm+: floating card centered */
        className="relative flex flex-col w-full sm:max-w-md sm:mx-4 sm:mb-4
                   h-dvh sm:h-auto sm:max-h-[92dvh]
                   rounded-none sm:rounded-3xl"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.08)',
        }}
      >

        {/* ── Sticky header ──────────────────────────────── */}
        <div
          className="sticky top-0 z-20 px-5 pt-5 pb-4"
          style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.98) 80%, transparent)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.28)' }}
              >
                <Truck className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 leading-tight">Delivery Order</h2>
                <p className="text-[10px] text-gray-400">
                  {cartCount} item{cartCount !== 1 ? 's' : ''} · {formatPrice(cartTotal)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StepIndicator step={step} primaryColor={primaryColor} />
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)' }}
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Mini summary strip */}
          <div
            className="mt-3 grid grid-cols-3 divide-x divide-gray-100 rounded-xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}
          >
            <div className="flex items-center gap-1.5 px-3 py-2">
              <Clock className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-[10px] text-gray-400">~{estimatedTime} min</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2">
              <Package className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-[10px] text-gray-400">
                {deliveryFee === 0 ? <span className="text-emerald-400/80">Free</span> : formatPrice(deliveryFee)}
              </span>
            </div>
            <div className="flex items-center justify-end px-3 py-2">
              <span className="text-[11px] font-bold" style={{ color: primaryColor }}>
                {formatPrice(grandTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Scrollable step content ─────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="wait" initial={false}>
          {step === 'scan' ? (
            /* ── Step 1: Face scan liveness check ── */
            <motion.div
              key="scan"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="px-4 pt-2 pb-4"
            >
              <FaceScanPanel onVerified={handleVerified} />
            </motion.div>
          ) : (
            /* ── Step 2: Delivery details (unlocked after face scan) ── */
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="px-4 pt-1 pb-4 space-y-3"
            >
              {/* Verified badge */}
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.22)' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <p className="text-[11px] text-emerald-400 font-semibold">Identity verified — fill in your delivery details below</p>
              </div>

              {/* Order error */}
              {placeError && (
                <div
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
                  style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}
                >
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <p className="text-[11px] text-rose-400">{placeError}</p>
                </div>
              )}

              {/* Full name */}
              <FieldWrap label="Full Name" error={errors.name}>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => { setName(e.target.value); setErrors(er => ({ ...er, name: undefined })) }}
                    placeholder="Your full name"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-sm text-gray-900 placeholder:text-gray-300 outline-none"
                    style={inputStyle(errors.name)}
                    onFocus={e => { if (!errors.name) e.currentTarget.style.borderColor = `rgba(245,158,11,0.50)` }}
                    onBlur={e => { if (!errors.name) e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)' }}
                  />
                </div>
              </FieldWrap>

              {/* Phone */}
              <FieldWrap label="Phone Number" error={errors.phone}>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setErrors(er => ({ ...er, phone: undefined })) }}
                    placeholder="+964 7XX XXX XXXX"
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl text-sm text-gray-900 placeholder:text-gray-300 outline-none"
                    style={inputStyle(errors.phone, !!(phone && !phoneOk))}
                    onFocus={e => { if (!errors.phone) e.currentTarget.style.borderColor = 'rgba(245,158,11,0.50)' }}
                    onBlur={e => { if (!errors.phone) e.currentTarget.style.borderColor = phone && !phoneOk ? 'rgba(245,158,11,0.38)' : 'rgba(0,0,0,0.10)' }}
                  />
                  {phone && (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                      {phoneOk
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        : <AlertCircle  className="w-4 h-4 text-amber-400" />}
                    </div>
                  )}
                </div>
              </FieldWrap>

              {/* Delivery location */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Delivery Location
                  </label>
                  {lat && lng && (
                    <div className="flex items-center gap-1.5">
                      {accuracy !== null && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            background: accuracy < 30 ? 'rgba(16,185,129,0.14)' : accuracy < 100 ? 'rgba(245,158,11,0.14)' : 'rgba(239,68,68,0.11)',
                            color: accuracy < 30 ? '#34d399' : accuracy < 100 ? '#fbbf24' : '#f87171',
                          }}
                        >
                          ±{accuracy}m
                        </span>
                      )}
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  )}
                </div>

                <div
                  className="relative rounded-2xl overflow-hidden"
                  style={{
                    border: `1px solid ${errors.loc ? 'rgba(239,68,68,0.42)' : lat && lng ? 'rgba(52,211,153,0.30)' : 'rgba(0,0,0,0.10)'}`,
                    transition: 'border-color 0.25s ease',
                  }}
                >
                  <LocationPickerMap flyToLat={flyLat} flyToLng={flyLng} onMove={handleMapMove} height={MAP_H} />

                  {/* GPS button */}
                  <button
                    onClick={handleGPS}
                    disabled={gpsLoad}
                    className="absolute top-2 right-2 z-[1000] flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-60"
                    style={{
                      background: 'rgba(255,255,255,0.95)',
                      border: '1px solid rgba(245,158,11,0.42)',
                      color: '#D97706',
                      backdropFilter: 'blur(10px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                  >
                    {gpsLoad
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Crosshair className="w-3.5 h-3.5" />}
                    {gpsLoad ? 'Locating…' : 'Live Location'}
                  </button>

                  {/* Hint overlay */}
                  {!lat && !lng && (
                    <div
                      className="absolute inset-0 z-[999] flex flex-col items-center justify-center gap-1 pointer-events-none"
                      style={{ background: 'rgba(255,255,255,0.60)', backdropFilter: 'blur(1.5px)' }}
                    >
                      <MapPin className="w-5 h-5 text-gray-400" />
                      <p className="text-[11px] text-gray-500 font-medium">Tap map or use Live Location</p>
                    </div>
                  )}

                  {/* Accuracy improving banner */}
                  {accuracy !== null && accuracy >= 50 && lat && lng && (
                    <div
                      className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center gap-2 px-3 py-1.5"
                      style={{ background: 'rgba(245,158,11,0.88)' }}
                    >
                      <Loader2 className="w-3 h-3 text-amber-900 animate-spin shrink-0" />
                      <p className="text-[10px] text-amber-900 font-semibold">Improving accuracy — stay still…</p>
                    </div>
                  )}
                </div>

                {address && lat && lng && (
                  <div className="mt-1.5 flex items-start gap-1.5 px-1">
                    <MapPin className="w-3 h-3 text-emerald-400/55 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{address}</p>
                  </div>
                )}
                {gpsErr   && <p className="text-[11px] text-rose-400 mt-1.5 flex items-start gap-1"><AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />{gpsErr}</p>}
                {errors.loc && <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.loc}</p>}
              </div>

              {/* Coupon */}
              <FieldWrap label="Coupon Code">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={couponCode}
                      onChange={e => { setCouponCode(e.target.value.toUpperCase()); setAppliedCoupon(null); setCouponErr(null) }}
                      placeholder="OPTIONAL"
                      disabled={!!appliedCoupon}
                      className="w-full pl-9 pr-3 py-2.5 rounded-2xl text-sm text-gray-900 placeholder:text-gray-300 font-mono uppercase outline-none disabled:opacity-45"
                      style={{ background: 'rgba(0,0,0,0.04)', border: `1px solid ${appliedCoupon ? 'rgba(52,211,153,0.30)' : 'rgba(0,0,0,0.10)'}` }}
                    />
                  </div>
                  <button
                    onClick={appliedCoupon ? () => { setAppliedCoupon(null); setCouponCode('') } : applyCoupon}
                    disabled={!appliedCoupon && (!couponCode.trim() || couponLoading)}
                    className="px-4 py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center gap-1.5"
                    style={{
                      background: appliedCoupon ? 'rgba(52,211,153,0.14)' : 'rgba(245,158,11,0.88)',
                      color: appliedCoupon ? '#34d399' : '#000',
                      border: appliedCoupon ? '1px solid rgba(52,211,153,0.28)' : 'none',
                    }}
                  >
                    {couponLoading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : appliedCoupon
                      ? <><Check className="w-3.5 h-3.5" />Applied</>
                      : 'Apply'}
                  </button>
                </div>
                {appliedCoupon && (
                  <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    {appliedCoupon.code} — save {formatPrice(appliedCoupon.discount)}
                  </p>
                )}
                {couponErr && (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{couponErr}
                  </p>
                )}
              </FieldWrap>

              {/* Min order warning */}
              {belowMin && (
                <div
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
                  style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-400">
                    Minimum order is {formatPrice(minOrder)} — add {formatPrice(minOrder - cartTotal)} more
                  </p>
                </div>
              )}

              {/* Order total breakdown */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(0,0,0,0.02)' }}
              >
                <TotalRow label="Subtotal"     value={formatPrice(cartTotal)} />
                <TotalRow label="Delivery Fee" value={deliveryFee === 0 ? 'Free' : formatPrice(deliveryFee)} accent={deliveryFee === 0} />
                {discountAmount > 0 && <TotalRow label="Discount" value={`−${formatPrice(discountAmount)}`} accent />}
                <div
                  className="flex justify-between items-center px-4 py-3.5"
                  style={{ background: 'rgba(245,158,11,0.07)', borderTop: '1px solid rgba(245,158,11,0.16)' }}
                >
                  <span className="text-sm font-bold text-gray-900">Total to Pay</span>
                  <span className="text-base font-extrabold tracking-tight" style={{ color: primaryColor }}>
                    {formatPrice(grandTotal)}
                  </span>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
        </div>{/* end scrollable area */}

        {/* ── Sticky CTA footer ──────────────────────────── */}
        <div
          className="shrink-0 px-4 pb-5 pt-3"
          style={{
            background: 'linear-gradient(to top, rgba(255,255,255,1) 75%, transparent)',
            borderTop: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          {step === 'details' ? (
            <button
              onClick={submit}
              disabled={placing || belowMin}
              className="w-full py-4 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
              style={{
                background: `linear-gradient(135deg, #F59E0B 0%, #D97706 100%)`,
                boxShadow: '0 8px 28px rgba(245,158,11,0.30)',
                color: '#000',
              }}
            >
              {placing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing Order…</>
                : <>Place Order <ChevronRight className="w-4 h-4" strokeWidth={2.5} /></>}
            </button>
          ) : (
            <div
              className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5"
              style={{
                background: 'rgba(0,0,0,0.04)',
                border: '1px solid rgba(0,0,0,0.08)',
                color: 'rgba(0,0,0,0.25)',
                cursor: 'default',
              }}
            >
              <Eye className="w-4 h-4" /> Complete Face Scan to Continue
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
