'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

interface Props {
  flyToLat: number | null
  flyToLng: number | null
  onMove: (lat: number, lng: number) => void
}

export default function LocationPickerMap({ flyToLat, flyToLng, onMove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<import('leaflet').Map | null>(null)
  const markerRef    = useRef<import('leaflet').Marker | null>(null)
  const onMoveRef    = useRef(onMove)

  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  // Init map — use a `cancelled` closure flag so the async import
  // doesn't try to create a map after cleanup (React StrictMode double-invoke)
  useEffect(() => {
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !containerRef.current) return

      // Defensive: remove any stale Leaflet state on the DOM node
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((containerRef.current as any)._leaflet_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (containerRef.current as any)._leaflet_id
      }

      // Fix webpack broken default icons
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(containerRef.current, {
        center: [35.5, 44.0],
        zoom: 5,
        zoomControl: true,
        attributionControl: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const addOrMoveMarker = (lat: number, lng: number) => {
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          const m = L.marker([lat, lng], { draggable: true }).addTo(map)
          m.on('dragend', () => {
            const p = m.getLatLng()
            onMoveRef.current(p.lat, p.lng)
          })
          markerRef.current = m
        }
        onMoveRef.current(lat, lng)
      }

      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        addOrMoveMarker(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current  = null
        markerRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fly to GPS coords whenever parent updates flyToLat/flyToLng
  useEffect(() => {
    if (flyToLat === null || flyToLng === null || !mapRef.current) return
    import('leaflet').then(L => {
      if (!mapRef.current) return
      mapRef.current.flyTo([flyToLat, flyToLng], 17, { animate: true, duration: 1.2 })
      if (markerRef.current) {
        markerRef.current.setLatLng([flyToLat, flyToLng])
      } else {
        const m = L.marker([flyToLat, flyToLng], { draggable: true }).addTo(mapRef.current)
        m.on('dragend', () => {
          const p = m.getLatLng()
          onMoveRef.current(p.lat, p.lng)
        })
        markerRef.current = m
      }
    })
  }, [flyToLat, flyToLng])

  return <div ref={containerRef} style={{ height: '200px', width: '100%' }} />
}
