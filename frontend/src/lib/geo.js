// Location helpers. Location is only ever read when the person starts an action that needs it.

export const geoSupported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;

/** Resolves to { lat, lng, accuracy } or rejects with { code: 'denied' | 'unavailable' | 'timeout' | 'unsupported' }. */
export function getPosition({ timeout = 12000, maximumAge = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!geoSupported()) {
      reject({ code: 'unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      (err) => reject({ code: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout, maximumAge },
    );
  });
}

export function mapsLink(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lng.toFixed(5)}`;
}
