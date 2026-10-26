export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Linear interpolation between two coordinates, t in [0, 1]. */
export function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  const clamped = Math.min(1, Math.max(0, t));
  return { lat: a.lat + (b.lat - a.lat) * clamped, lng: a.lng + (b.lng - a.lng) * clamped };
}
