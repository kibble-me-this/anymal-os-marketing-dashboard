export const MARKETING_API = import.meta.env.VITE_MARKETING_API_URL || 'https://web-production-3f930.up.railway.app'
export const PUBLIC_FEEDS_API = import.meta.env.VITE_PUBLIC_FEEDS_API_URL || 'https://anymal-os-public-feeds-production.up.railway.app'
export const API_KEY = import.meta.env.VITE_MARKETING_API_KEY || ''
export const ADMIN_KEY = import.meta.env.VITE_MARKETING_ADMIN_KEY || ''
export const PUBLIC_FEEDS_API_KEY = import.meta.env.VITE_PUBLIC_FEEDS_API_KEY || API_KEY
export const PUBLIC_FEEDS_ADMIN_KEY = import.meta.env.VITE_PUBLIC_FEEDS_ADMIN_KEY || ADMIN_KEY
export const DASHBOARD_PASSWORD = import.meta.env.VITE_DASHBOARD_PASSWORD || 'anymal2026'
export const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
}
export const adminHeaders = {
  'X-API-Key': API_KEY,
  'X-Admin-Key': ADMIN_KEY,
  'Content-Type': 'application/json',
}
export const publicFeedsAdminHeaders = {
  'X-API-Key': PUBLIC_FEEDS_API_KEY,
  'X-Admin-Key': PUBLIC_FEEDS_ADMIN_KEY,
  'Content-Type': 'application/json',
}
export const HAS_MARKETING_ADMIN_KEY = Boolean(ADMIN_KEY)
export const HAS_PUBLIC_FEEDS_ADMIN_KEY = Boolean(PUBLIC_FEEDS_API_KEY && PUBLIC_FEEDS_ADMIN_KEY)
