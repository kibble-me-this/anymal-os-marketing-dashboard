import { useEffect, useMemo, useRef, useState } from 'react'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

const CHANNEL_COLORS = {
  facebook_page: '#1877F2',
  anymal_linkedin: '#0A66C2',
  personal_linkedin: '#0A66C2',
  anymal_x: '#ffffff',
  personal_x: '#ffffff',
}

const CHANNEL_LABELS = {
  facebook_page: 'Facebook (Anymal OS Page)',
  anymal_linkedin: 'Anymal LinkedIn',
  personal_linkedin: 'Personal LinkedIn',
  anymal_x: 'Anymal X',
  personal_x: 'Personal X',
}

const CHANNEL_DESTINATION_NAME = {
  facebook_page: 'Facebook',
  anymal_linkedin: 'LinkedIn',
  personal_linkedin: 'LinkedIn',
  anymal_x: 'X',
  personal_x: 'X',
}

const URL_PATTERN = /https?:\/\/world\.anymalos\.com\/[^\s)]*/

function extractUrl(message) {
  if (!message) return null
  const m = message.match(URL_PATTERN)
  return m ? m[0] : null
}

function parseUrl(raw) {
  if (!raw) return null
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

function countCharacters(text) {
  return text ? text.length : 0
}

function containsEmDash(text) {
  return typeof text === 'string' && text.includes('\u2014')
}

function formatImageSize(base64) {
  if (!base64) return ''
  const approxBytes = Math.round((base64.length * 3) / 4)
  if (approxBytes < 1024) return `${approxBytes} B`
  if (approxBytes < 1024 * 1024) return `${(approxBytes / 1024).toFixed(1)} KB`
  return `${(approxBytes / (1024 * 1024)).toFixed(2)} MB`
}

function UnfurlCard({ url }) {
  const parsed = parseUrl(url)
  if (!parsed) return null
  const host = parsed.host.toUpperCase()
  return (
    <div
      style={{
        marginTop: '12px',
        border: '1px solid #1a3a2a',
        borderRadius: '4px',
        overflow: 'hidden',
        background: '#04200e',
      }}
    >
      <div style={{ height: '140px', background: 'linear-gradient(135deg, #0a2a14, #021a0e)', borderBottom: '1px solid #1a3a2a' }} />
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', fontFamily: SANS_FONT }}>{host}</div>
        <div style={{ fontSize: '13px', color: '#ffffff', marginTop: '2px', fontFamily: SANS_FONT, fontWeight: 600 }}>
          Anymal OS : World
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '2px', fontFamily: SANS_FONT }}>
          Live cattle market intelligence.
        </div>
      </div>
    </div>
  )
}

export default function ApproveConfirmModal({ campaign, onConfirm, onCancel, loading }) {
  const cancelRef = useRef(null)
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement
    cancelRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!loading) onCancel()
        return
      }
      if (e.key === 'Tab') {
        const root = dialogRef.current
        if (!root) return
        const focusables = root.querySelectorAll(
          'button:not([disabled]), [href], input, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [onCancel, loading])

  const channel = campaign.channel || 'facebook_page'
  const channelColor = CHANNEL_COLORS[channel] || '#00e676'
  const channelLabel = CHANNEL_LABELS[channel] || campaign.channel_label || channel
  const destName = CHANNEL_DESTINATION_NAME[channel] || 'the destination platform'

  const message = campaign.message || campaign.generated_copy || ''
  const imageBase64 = campaign.chart_base64 || ''
  const url = extractUrl(message)
  const parsedUrl = parseUrl(url)
  const utmCampaign = parsedUrl?.searchParams.get('utm_campaign') || ''
  const destination = parsedUrl ? `${parsedUrl.origin}${parsedUrl.pathname}` : ''

  const warnings = useMemo(() => {
    const list = []
    if (channel === 'facebook_page' && !imageBase64) {
      list.push({
        level: 'warn',
        text: 'No image attached. Facebook posts without images typically get 50% less reach. Are you sure?',
      })
    }
    if (utmCampaign === 'content_agent') {
      list.push({
        level: 'warn',
        text: "UTM campaign is still the default 'content_agent'. Consider setting a topical campaign name.",
      })
    }
    if (containsEmDash(message)) {
      list.push({
        level: 'danger',
        text: 'Message contains an em dash. Brand guideline says no em dashes.',
      })
    }
    return list
  }, [channel, imageBase64, utmCampaign, message])

  const handleConfirm = async () => {
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err.message || 'Publish failed.')
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onCancel()
    }
  }

  return (
    <div
      onMouseDown={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 26, 14, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-publish-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0a2a14',
          border: '1px solid rgba(0, 230, 118, 0.2)',
          borderRadius: '8px',
          padding: '24px',
          color: '#ffffff',
          fontFamily: SANS_FONT,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ marginBottom: '18px' }}>
          <div
            id="confirm-publish-title"
            style={{ fontFamily: MONO_FONT, fontSize: '13px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00e676' }}
          >
            Confirm Publish
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '6px', lineHeight: 1.5 }}>
            This post will go live immediately on {channelLabel} and cannot be undone.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '6px 14px',
              borderRadius: '999px',
              border: `1px solid ${channelColor}`,
              color: channelColor,
              background: '#021a0e',
              fontSize: '11px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {channelLabel}
          </span>
        </div>

        <div style={{ marginBottom: '18px' }}>
          <div
            style={{
              fontSize: '10px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.45)',
              marginBottom: '8px',
            }}
          >
            This is what will post
          </div>
          <div
            style={{
              border: '1px solid #1a3a2a',
              borderRadius: '6px',
              padding: '14px',
              background: '#04200e',
            }}
          >
            {imageBase64 && (
              <img
                src={`data:image/png;base64,${imageBase64}`}
                alt="post preview"
                style={{
                  display: 'block',
                  width: '100%',
                  maxWidth: '400px',
                  height: 'auto',
                  border: '1px solid #1a3a2a',
                  borderRadius: '4px',
                  marginBottom: '12px',
                }}
              />
            )}
            <div
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: SANS_FONT,
                fontSize: '13px',
                lineHeight: 1.55,
                color: '#e6ffe6',
              }}
            >
              {message}
            </div>
            {url && <UnfurlCard url={url} />}
          </div>
        </div>

        <div style={{ marginBottom: '18px' }}>
          <div
            style={{
              fontSize: '10px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.45)',
              marginBottom: '8px',
            }}
          >
            Post Details
          </div>
          <dl
            style={{
              margin: 0,
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              rowGap: '6px',
              columnGap: '12px',
              fontFamily: MONO_FONT,
              fontSize: '12px',
            }}
          >
            <dt style={{ color: 'rgba(255,255,255,0.55)' }}>Destination URL</dt>
            <dd style={{ margin: 0, color: '#c0e0c0', wordBreak: 'break-all' }}>{url || 'None'}</dd>

            <dt style={{ color: 'rgba(255,255,255,0.55)' }}>UTM campaign</dt>
            <dd style={{ margin: 0, color: '#c0e0c0' }}>{utmCampaign || 'None'}</dd>

            <dt style={{ color: 'rgba(255,255,255,0.55)' }}>Image attached</dt>
            <dd style={{ margin: 0, color: '#c0e0c0' }}>
              {imageBase64 ? `Yes (${formatImageSize(imageBase64)})` : 'No'}
            </dd>

            <dt style={{ color: 'rgba(255,255,255,0.55)' }}>Character count</dt>
            <dd style={{ margin: 0, color: '#c0e0c0' }}>{countCharacters(message)}</dd>
          </dl>
        </div>

        {warnings.length > 0 && (
          <div style={{ marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {warnings.map((w, i) => {
              const isDanger = w.level === 'danger'
              return (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '4px',
                    border: `1px solid ${isDanger ? '#ff5252' : '#f6b93b'}`,
                    background: isDanger ? 'rgba(255, 82, 82, 0.08)' : 'rgba(246, 185, 59, 0.08)',
                    color: isDanger ? '#ff5252' : '#f6b93b',
                    fontSize: '12px',
                    lineHeight: 1.5,
                  }}
                >
                  {w.text}
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: '18px',
              padding: '10px 12px',
              borderRadius: '4px',
              border: '1px solid #ff5252',
              background: 'rgba(255, 82, 82, 0.1)',
              color: '#ff5252',
              fontSize: '12px',
              fontFamily: MONO_FONT,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '10px 22px',
              background: 'transparent',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '4px',
              fontSize: '11px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: SANS_FONT,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            style={{
              padding: '10px 22px',
              background: loading ? '#1a3a2a' : '#ff5252',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '11px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: SANS_FONT,
            }}
          >
            {loading ? 'Publishing...' : 'Publish Now'}
          </button>
        </div>
      </div>
    </div>
  )
}
