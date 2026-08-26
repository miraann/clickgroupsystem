import { createClient } from '@/lib/supabase/client'
import type { CachedDeliveryZone } from '@/hooks/useDeliverySettings'

export interface ZoneMatchResult {
  zoneId:         string | null
  zoneName:       string | null
  deliveryFee:    number
  minOrder:       number
  estimatedTime:  number
  matched:        boolean
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function pointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { lat: yi, lng: xi } = polygon[i]
    const { lat: yj, lng: xj } = polygon[j]
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

export interface ZoneCandidate extends CachedDeliveryZone {
  center_lat?:    number | null
  center_lng?:    number | null
  radius_meters?: number | null
  polygon?:       { lat: number; lng: number }[] | null
}

/**
 * Pure client-side zone match — no network round trip. Mirrors the logic in
 * fn_match_delivery_zone() (supabase-delivery-notifications.sql) so the UI
 * can show a fee estimate instantly while placing the order; the DB trigger
 * / RPC remains the source of truth for anything persisted.
 */
export function matchZoneLocally(
  lat: number,
  lng: number,
  zones: ZoneCandidate[],
): ZoneCandidate | null {
  const active = zones.filter(z => z.active)

  const polygonMatch = active
    .filter(z => z.polygon && z.polygon.length >= 3)
    .find(z => pointInPolygon(lat, lng, z.polygon!))
  if (polygonMatch) return polygonMatch

  const radiusMatches = active
    .filter(z => z.center_lat != null && z.center_lng != null && z.radius_meters != null)
    .filter(z => haversineMeters(lat, lng, z.center_lat!, z.center_lng!) <= z.radius_meters!)
    .sort((a, b) => a.sort_order - b.sort_order)

  return radiusMatches[0] ?? null
}

/**
 * Server-authoritative zone match via the Postgres RPC. Falls back to the
 * restaurant's general delivery settings when no zone matches (or the RPC
 * table hasn't been migrated yet).
 */
export async function matchDeliveryZone(
  restaurantId: string,
  lat: number,
  lng: number,
  fallback: { deliveryFee: number; minOrder: number; estimatedTime: number },
): Promise<ZoneMatchResult> {
  const supabase = createClient()
  const { data, error } = await supabase
    .rpc('fn_match_delivery_zone', { p_restaurant_id: restaurantId, p_lat: lat, p_lng: lng })
    .maybeSingle()

  if (error || !data) {
    return {
      zoneId: null, zoneName: null, matched: false,
      deliveryFee:   fallback.deliveryFee,
      minOrder:      fallback.minOrder,
      estimatedTime: fallback.estimatedTime,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zone = data as any
  return {
    zoneId:        zone.id,
    zoneName:       zone.name,
    matched:        true,
    deliveryFee:    Number(zone.delivery_fee    ?? fallback.deliveryFee),
    minOrder:       Number(zone.min_order       ?? fallback.minOrder),
    estimatedTime:  Number(zone.estimated_time  ?? fallback.estimatedTime),
  }
}
