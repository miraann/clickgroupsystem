'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import {
  Loader2, MapPin, X, Check, CheckCircle2, AlertCircle,
  Truck, Clock, Package, Crosshair, Camera, Eye,
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
// jsDelivr CDN hosts the face-api.js weights (~260 KB combined for tiny models)
// For production: copy weights into /public/face-models/ and use '/face-models'
const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights'

// Eye Aspect Ratio thresholds for blink detection
const EAR_CLOSE    = 0.21  // EAR drops below this → eye considered closed
const EAR_OPEN     = 0.27  // EAR rises above this → eye considered open again
const BLINKS_NEED  = 2     // how many blinks required to pass liveness

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
    couponId: string | null
  ) => void
  placing: boolean
  placeError: string | null
  deliveryFee: number
  estimatedTime: number
  minOrder: number
}

type Step     = 'details' | 'scan'
type CamState = 'idle' | 'starting' | 'active' | 'error' | 'done'

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
function FaceScanPanel({
  onVerified,
}: {
  onVerified: () => void
}) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const rafRef     = useRef<number>(0)
  const eyeDown    = useRef(false)
  const blinkCount = useRef(0)
  const didVerify  = useRef(false)

  const [camState,  setCamState]  = useState<CamState>('idle')
  const [modelsOk,  setModelsOk]  = useState(false)
  const [errMsg,    setErrMsg]    = useState('')
  const [faceIn,    setFaceIn]    = useState(false)
  const [blinks,    setBlinks]    = useState(0)
  const [hint,      setHint]      = useState('Position your face inside the oval')
  const [verified,  setVerified]  = useState(false)

  // ── Camera start ────────────────────────────────────────────
  const startCam = useCallback(async () => {
    setCamState('starting')
    setErrMsg('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      const vid = videoRef.current!
      vid.srcObject = stream
      await new Promise<void>(res => { vid.onloadedmetadata = () => res() })
      await vid.play()
      setCamState('active')
    } catch (e) {
      const err = e as DOMException
      setCamState('error')
      setErrMsg(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Tap the lock icon in your browser address bar → allow camera, then try again.'
          : err.name === 'NotFoundError'
          ? 'No camera detected on this device.'
          : 'Unable to start camera. Make sure no other app is using it.'
      )
    }
  }, [])

  // ── Face detection + liveness loop ──────────────────────────
  useEffect(() => {
    if (camState !== 'active') return
    let cancelled = false

    async function init() {
      // Dynamic import keeps TensorFlow.js and face-api out of the SSR bundle
      const faceapi = await import('face-api.js')

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
      ])
      if (cancelled) return
      setModelsOk(true)

      const video  = videoRef.current!
      const canvas = canvasRef.current!
      const ctx    = canvas.getContext('2d')!

      async function tick() {
        if (cancelled || didVerify.current) return

        // Match canvas resolution to video
        if (video.videoWidth && canvas.width !== video.videoWidth) {
          canvas.width  = video.videoWidth
          canvas.height = video.videoHeight
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const W = canvas.width
        const H = canvas.height
        const cx = W / 2
        const cy = H / 2 + H * 0.02 // very slightly below centre for face framing
        const rx = W * 0.24
        const ry = H * 0.34

        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5, inputSize: 224 }))
          .withFaceLandmarks(true) // true → tiny landmark model

        if (cancelled || didVerify.current) return

        const inFrame = Boolean(detection)
        setFaceIn(inFrame)

        // ── Draw face guide oval ─────────────────────────────
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.strokeStyle = verified
          ? '#34d399'
          : inFrame
          ? 'rgba(245,158,11,0.9)'
          : 'rgba(255,255,255,0.30)'
        ctx.lineWidth = 3
        ctx.shadowColor = inFrame ? 'rgba(245,158,11,0.4)' : 'transparent'
        ctx.shadowBlur  = inFrame ? 12 : 0
        ctx.stroke()
        ctx.shadowBlur = 0

        if (detection) {
          const { landmarks, detection: det } = detection

          // ── Eye landmark dots (amber) ─────────────────────
          const drawEye = (eye: Pt[]) => {
            eye.forEach(p => {
              ctx.beginPath()
              ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
              ctx.fillStyle = '#F59E0B'
              ctx.fill()
            })
          }
          drawEye(landmarks.getLeftEye()  as unknown as Pt[])
          drawEye(landmarks.getRightEye() as unknown as Pt[])

          // ── EAR blink detection ───────────────────────────
          const leftEAR  = calcEAR(landmarks.getLeftEye()  as unknown as Pt[])
          const rightEAR = calcEAR(landmarks.getRightEye() as unknown as Pt[])
          const ear      = (leftEAR + rightEAR) / 2

          if (ear < EAR_CLOSE && !eyeDown.current) {
            eyeDown.current = true  // eye just closed
          } else if (ear > EAR_OPEN && eyeDown.current) {
            eyeDown.current  = false  // eye just opened → blink complete
            blinkCount.current += 1
            setBlinks(blinkCount.current)

            if (blinkCount.current === 1) setHint('Great! Blink one more time…')
            if (blinkCount.current >= BLINKS_NEED && !didVerify.current) {
              didVerify.current = true
              setVerified(true)
              setCamState('done')
              // Brief celebration delay, then notify parent
              setTimeout(() => {
                streamRef.current?.getTracks().forEach(t => t.stop())
                cancelAnimationFrame(rafRef.current)
                onVerified()
              }, 1800)
              return
            }
          }

          // Nudge hint based on face centering
          if (blinkCount.current === 0) {
            const faceCx = det.box.x + det.box.width / 2
            const faceCy = det.box.y + det.box.height / 2
            if (Math.abs(faceCx - cx) / rx > 0.45 || Math.abs(faceCy - cy) / ry > 0.45) {
              setHint('Center your face in the oval')
            } else {
              setHint('Blink slowly once…')
            }
          }
        } else {
          setHint('Position your face inside the oval')
        }

        rafRef.current = requestAnimationFrame(() => { tick() })
      }

      tick()
    }

    init().catch(err => {
      if (!cancelled) {
        console.error('[FaceScan] init error:', err)
        setErrMsg('Face detection could not load. Please refresh and try again.')
        setCamState('error')
      }
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [camState, onVerified, verified])

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  return (
    <div className="space-y-4">
      {/* ── Camera viewport ────────────────────────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden bg-black"
        style={{
          height: 'clamp(200px, 52vw, 280px)',
          border: verified
            ? '2px solid rgba(52,211,153,0.65)'
            : faceIn
            ? '2px solid rgba(245,158,11,0.55)'
            : '1px solid rgba(255,255,255,0.10)',
          boxShadow: verified
            ? '0 0 36px rgba(52,211,153,0.25), inset 0 0 36px rgba(52,211,153,0.06)'
            : faceIn
            ? '0 0 24px rgba(245,158,11,0.18)'
            : 'none',
          transition: 'border 0.4s ease, box-shadow 0.4s ease',
        }}
      >
        {/* ── Idle state ─────────────────────────────────── */}
        {camState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.28)' }}
            >
              <Camera className="w-7 h-7 text-amber-400" />
            </div>
            <p className="text-sm text-white/55 text-center leading-relaxed">
              We need a quick selfie to confirm you are placing this order in real-time.
            </p>
            <button
              onClick={startCam}
              className="px-8 py-3 rounded-xl font-bold text-sm text-black transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                boxShadow: '0 6px 20px rgba(245,158,11,0.35)',
              }}
            >
              Enable Camera
            </button>
          </div>
        )}

        {/* ── Loading overlay ─────────────────────────────── */}
        {(camState === 'starting' || (camState === 'active' && !modelsOk)) && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
          >
            <Loader2 className="w-9 h-9 text-amber-400 animate-spin" />
            <p className="text-sm text-white/60 font-medium">
              {camState === 'starting' ? 'Starting camera…' : 'Loading face detection…'}
            </p>
          </div>
        )}

        {/* ── Error state ─────────────────────────────────── */}
        {camState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.28)' }}
            >
              <AlertCircle className="w-6 h-6 text-rose-400" />
            </div>
            <p className="text-xs text-white/55 text-center leading-relaxed">{errMsg}</p>
            <button
              onClick={startCam}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white/75 transition-all active:scale-95"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* ── Live video + canvas overlay ─────────────────── */}
        {/* Both elements share the same CSS mirror so face-api coordinates align */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)', display: camState !== 'idle' && camState !== 'error' ? 'block' : 'none' }}
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: 'scaleX(-1)', display: camState !== 'idle' && camState !== 'error' ? 'block' : 'none' }}
        />

        {/* ── Verified overlay ────────────────────────────── */}
        <AnimatePresence>
          {verified && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-10"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                className="w-20 h-20 rounded-full flex items-center justify-center mb-3"
                style={{ background: 'rgba(52,211,153,0.18)', border: '2px solid #34d399', boxShadow: '0 0 40px rgba(52,211,153,0.35)' }}
              >
                <Check className="w-10 h-10 text-emerald-400" strokeWidth={2.5} />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-white font-bold text-lg"
              >
                Identity Verified!
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-white/45 text-xs mt-1"
              >
                Placing your order…
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Live hint chip ──────────────────────────────── */}
        {camState === 'active' && modelsOk && !verified && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-10">
            <div
              className="px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: 'rgba(0,0,0,0.75)',
                backdropFilter: 'blur(10px)',
                border: faceIn ? '1px solid rgba(245,158,11,0.35)' : '1px solid rgba(255,255,255,0.12)',
                color: faceIn ? '#fbbf24' : 'rgba(255,255,255,0.55)',
                transition: 'all 0.3s ease',
              }}
            >
              {hint}
            </div>
          </div>
        )}
      </div>

      {/* ── Blink progress tracker ──────────────────────────── */}
      {(camState === 'active' || camState === 'done') && modelsOk && (
        <div
          className="rounded-2xl px-5 py-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="text-[11px] font-semibold text-white/35 uppercase tracking-wider mb-3">
            Liveness Check — Blink Detection
          </p>
          <div className="flex items-center gap-2.5">
            {Array.from({ length: BLINKS_NEED }).map((_, i) => {
              const done = i < blinks
              const active = i === blinks
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 flex-1 px-3.5 py-2.5 rounded-xl transition-all duration-300"
                  style={{
                    background: done
                      ? 'rgba(52,211,153,0.10)'
                      : active
                      ? 'rgba(245,158,11,0.07)'
                      : 'rgba(255,255,255,0.03)',
                    border: done
                      ? '1px solid rgba(52,211,153,0.30)'
                      : active
                      ? '1px solid rgba(245,158,11,0.25)'
                      : '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  <Eye
                    className="w-4 h-4 shrink-0 transition-colors duration-300"
                    style={{
                      color: done ? '#34d399' : active ? '#F59E0B' : 'rgba(255,255,255,0.18)',
                    }}
                  />
                  <span
                    className="text-xs font-semibold transition-colors duration-300"
                    style={{
                      color: done ? '#34d399' : active ? '#fbbf24' : 'rgba(255,255,255,0.22)',
                    }}
                  >
                    {done ? 'Blinked ✓' : active ? 'Blink now' : 'Waiting…'}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-white/25 mt-3 text-center">
            Blink naturally — anti-spoofing protection against photos or video replays
          </p>
        </div>
      )}

      {/* ── Why verification card (shown before camera starts) ── */}
      {camState === 'idle' && (
        <div
          className="rounded-2xl px-5 py-4 space-y-2"
          style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.14)' }}
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs font-bold text-amber-400">Why face verification?</p>
          </div>
          <p className="text-[11px] text-white/40 leading-relaxed">
            A blink-based liveness check confirms this is a live person placing the order — preventing fraudulent or automated orders. Your image never leaves this device.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step, primaryColor }: { step: Step; primaryColor: string }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'scan',    label: 'Verify'  },
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
                  background: active ? primaryColor : past ? 'rgba(52,211,153,0.22)' : 'rgba(255,255,255,0.07)',
                  color: active ? '#000' : past ? '#34d399' : 'rgba(255,255,255,0.28)',
                  border: active ? 'none' : past ? '1px solid rgba(52,211,153,0.38)' : '1px solid rgba(255,255,255,0.10)',
                }}
              >
                {past ? <Check className="w-2.5 h-2.5" strokeWidth={3} /> : i + 1}
              </div>
              <span
                className="text-[10px] font-semibold transition-colors duration-300"
                style={{ color: active ? 'rgba(255,255,255,0.9)' : past ? '#34d399' : 'rgba(255,255,255,0.28)' }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="w-8 h-px transition-all duration-500"
                style={{ background: past ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.10)' }}
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
    background: error ? 'rgba(239,68,68,0.07)' : warn ? 'rgba(245,158,11,0.05)' : 'rgba(255,255,255,0.055)',
    border: `1px solid ${error ? 'rgba(239,68,68,0.42)' : warn ? 'rgba(245,158,11,0.38)' : 'rgba(255,255,255,0.10)'}`,
    transition: 'border-color 0.2s ease, background 0.2s ease',
  }
}

function FieldWrap({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-white/38 uppercase tracking-wider mb-2 block">{label}</label>
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
    <div className="flex justify-between items-center px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span className={`text-xs ${accent ? 'text-emerald-400' : 'text-white/35'}`}>{label}</span>
      <span className={`text-xs font-semibold ${accent ? 'text-emerald-400' : 'text-white/58'}`}>{value}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DeliveryCheckout({
  restaurantId, primaryColor, cartCount, cartTotal, formatPrice,
  onClose, onConfirm, placing, placeError,
  deliveryFee, estimatedTime, minOrder,
}: DeliveryCheckoutProps) {

  // ── Navigation step ────────────────────────────────────────
  const [step, setStep] = useState<Step>('details')

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

  // ── Liveness verified → auto-submit ────────────────────────
  const handleVerified = useCallback(() => {
    onConfirm(name.trim(), phone.trim(), lat, lng, address, discountAmount, appliedCoupon?.id ?? null)
  }, [name, phone, lat, lng, address, discountAmount, appliedCoupon, onConfirm])

  const goToScan = () => {
    if (!validateForm()) return
    setStep('scan')
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
          background: 'linear-gradient(160deg, rgba(14,16,28,0.99) 0%, rgba(8,10,20,0.99) 100%)',
          backdropFilter: 'blur(48px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 48px 120px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.07)',
        }}
      >
        {/* Ambient glow orbs */}
        <div className="absolute -top-28 -right-28 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.10) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)' }} />

        {/* ── Sticky header ──────────────────────────────── */}
        <div
          className="sticky top-0 z-20 px-5 pt-5 pb-4"
          style={{ background: 'linear-gradient(to bottom, rgba(8,10,20,0.98) 80%, transparent)' }}
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
                <h2 className="text-sm font-bold text-white leading-tight">Delivery Order</h2>
                <p className="text-[10px] text-white/38">
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
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                <X className="w-3.5 h-3.5 text-white/50" />
              </button>
            </div>
          </div>

          {/* Mini summary strip */}
          <div
            className="mt-3 grid grid-cols-3 divide-x divide-white/8 rounded-xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center gap-1.5 px-3 py-2">
              <Clock className="w-3 h-3 text-white/28 shrink-0" />
              <span className="text-[10px] text-white/38">~{estimatedTime} min</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2">
              <Package className="w-3 h-3 text-white/28 shrink-0" />
              <span className="text-[10px] text-white/38">
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
          {step === 'details' ? (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="px-4 pt-1 pb-4 space-y-3"
            >
              {/* Full name */}
              <FieldWrap label="Full Name" error={errors.name}>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/22" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => { setName(e.target.value); setErrors(er => ({ ...er, name: undefined })) }}
                    placeholder="Your full name"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-sm text-white placeholder:text-white/18 outline-none"
                    style={inputStyle(errors.name)}
                    onFocus={e => { if (!errors.name) e.currentTarget.style.borderColor = `rgba(245,158,11,0.50)` }}
                    onBlur={e => { if (!errors.name) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
                  />
                </div>
              </FieldWrap>

              {/* Phone */}
              <FieldWrap label="Phone Number" error={errors.phone}>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/22" />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setErrors(er => ({ ...er, phone: undefined })) }}
                    placeholder="+964 7XX XXX XXXX"
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl text-sm text-white placeholder:text-white/18 outline-none"
                    style={inputStyle(errors.phone, !!(phone && !phoneOk))}
                    onFocus={e => { if (!errors.phone) e.currentTarget.style.borderColor = 'rgba(245,158,11,0.50)' }}
                    onBlur={e => { if (!errors.phone) e.currentTarget.style.borderColor = phone && !phoneOk ? 'rgba(245,158,11,0.38)' : 'rgba(255,255,255,0.10)' }}
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
                  <label className="text-[11px] font-semibold text-white/38 uppercase tracking-wider">
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
                    border: `1px solid ${errors.loc ? 'rgba(239,68,68,0.42)' : lat && lng ? 'rgba(52,211,153,0.30)' : 'rgba(255,255,255,0.10)'}`,
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
                      background: 'rgba(8,10,20,0.90)',
                      border: '1px solid rgba(245,158,11,0.42)',
                      color: '#F59E0B',
                      backdropFilter: 'blur(10px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
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
                      style={{ background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(1.5px)' }}
                    >
                      <MapPin className="w-5 h-5 text-white/48" />
                      <p className="text-[11px] text-white/60 font-medium">Tap map or use Live Location</p>
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
                    <p className="text-[11px] text-white/38 leading-relaxed line-clamp-2">{address}</p>
                  </div>
                )}
                {gpsErr   && <p className="text-[11px] text-rose-400 mt-1.5 flex items-start gap-1"><AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />{gpsErr}</p>}
                {errors.loc && <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.loc}</p>}
              </div>

              {/* Coupon */}
              <FieldWrap label="Coupon Code">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/22" />
                    <input
                      type="text"
                      value={couponCode}
                      onChange={e => { setCouponCode(e.target.value.toUpperCase()); setAppliedCoupon(null); setCouponErr(null) }}
                      placeholder="OPTIONAL"
                      disabled={!!appliedCoupon}
                      className="w-full pl-9 pr-3 py-2.5 rounded-2xl text-sm text-white placeholder:text-white/18 font-mono uppercase outline-none disabled:opacity-45"
                      style={{ background: 'rgba(255,255,255,0.055)', border: `1px solid ${appliedCoupon ? 'rgba(52,211,153,0.30)' : 'rgba(255,255,255,0.10)'}` }}
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
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)' }}
              >
                <TotalRow label="Subtotal"     value={formatPrice(cartTotal)} />
                <TotalRow label="Delivery Fee" value={deliveryFee === 0 ? 'Free' : formatPrice(deliveryFee)} accent={deliveryFee === 0} />
                {discountAmount > 0 && <TotalRow label="Discount" value={`−${formatPrice(discountAmount)}`} accent />}
                <div
                  className="flex justify-between items-center px-4 py-3.5"
                  style={{ background: 'rgba(245,158,11,0.045)', borderTop: '1px solid rgba(245,158,11,0.14)' }}
                >
                  <span className="text-sm font-bold text-white">Total to Pay</span>
                  <span className="text-base font-extrabold tracking-tight" style={{ color: primaryColor }}>
                    {formatPrice(grandTotal)}
                  </span>
                </div>
              </div>

            </motion.div>
          ) : (
            <motion.div
              key="scan"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="px-4 pt-1 pb-4 space-y-3"
            >
              {/* Back link */}
              <button
                onClick={() => setStep('details')}
                className="flex items-center gap-1 text-[11px] text-white/35 hover:text-white/60 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                Back to Details
              </button>

              {/* Section header */}
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.24)' }}
                >
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Identity Verification</p>
                  <p className="text-[10px] text-white/35">On-device only · Not stored · Not uploaded</p>
                </div>
              </div>

              {/* Face scan panel */}
              <FaceScanPanel onVerified={handleVerified} />

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

            </motion.div>
          )}
        </AnimatePresence>
        </div>{/* end scrollable area */}

        {/* ── Sticky CTA footer ──────────────────────────── */}
        <div
          className="shrink-0 px-4 pb-5 pt-3"
          style={{
            background: 'linear-gradient(to top, rgba(8,10,20,1) 75%, transparent)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {step === 'details' ? (
            <button
              onClick={goToScan}
              disabled={belowMin}
              className="w-full py-4 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                boxShadow: '0 8px 28px rgba(245,158,11,0.30)',
                color: '#000',
              }}
            >
              Continue to Face Verification
              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
            </button>
          ) : (
            <div
              className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5"
              style={{
                background: placing ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` : 'rgba(255,255,255,0.05)',
                border: placing ? 'none' : '1px solid rgba(255,255,255,0.08)',
                color: placing ? '#000' : 'rgba(255,255,255,0.22)',
                boxShadow: placing ? `0 8px 28px ${primaryColor}40` : 'none',
                cursor: 'default',
                transition: 'all 0.45s ease',
              }}
            >
              {placing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing Order…</>
                : <><Eye className="w-4 h-4" /> Complete Face Scan to Place Order</>}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
