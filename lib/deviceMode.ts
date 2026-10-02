export type DeviceMode = 'kiosk' | 'learning'

const MODE_COOKIE = 'juanita-device-mode'
const MODE_STORAGE_KEY = 'juanita-device-mode'
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60

export function setDeviceModeLock(mode: DeviceMode) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = MODE_COOKIE + '=' + mode + '; Path=/; Max-Age=' + MAX_AGE_SECONDS + '; SameSite=Lax' + secure
}

export function clearDeviceModeLock() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  window.localStorage.removeItem(MODE_STORAGE_KEY)
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = MODE_COOKIE + '=; Path=/; Max-Age=0; SameSite=Lax' + secure
}

export function getStoredDeviceMode(): DeviceMode | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(MODE_STORAGE_KEY)
  return value === 'kiosk' || value === 'learning' ? value : null
}
