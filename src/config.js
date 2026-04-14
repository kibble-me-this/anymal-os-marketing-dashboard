export const MARKETING_API = import.meta.env.VITE_MARKETING_API_URL || 'https://web-production-3f930.up.railway.app'
export const API_KEY = import.meta.env.VITE_MARKETING_API_KEY || ''
export const DASHBOARD_PASSWORD = import.meta.env.VITE_DASHBOARD_PASSWORD || 'anymal2026'
export const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
}
