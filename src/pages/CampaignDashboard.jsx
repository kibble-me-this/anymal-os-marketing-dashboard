import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MARKETING_API, headers } from '../config'

const REFRESH_INTERVAL = 60
const CHANNELS = [
  { id: 'all', label: 'All Channels' },
  { id: 'facebook_page', label: 'Facebook' },
  { id: 'anymal_linkedin', label: 'Anymal LinkedIn' },
  { id: 'personal_linkedin', label: 'Personal LinkedIn' },
  { id: 'anymal_x', label: 'Anymal X' },
  { id: 'personal_x', label: 'Personal X' },
]

const CHANNEL_COLORS = {
  facebook_page: '#1877F2',
  anymal_linkedin: '#0A66C2',
  personal_linkedin: '#0A66C2',
  anymal_x: '#000000',
  personal_x: '#657786',
}

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const URL_PATTERN = /https?:\/\/world\.anymalos\.com\/[^\s)]*/

function findAnymalUrl(message) {
  if (!message) return null
  const m = message.match(URL_PATTERN)
  return m ? m[0] : null
}

function extractDestinationFromMessage(message) {
  const raw = findAnymalUrl(message)
  if (!raw) return { kind: '/price', customPath: '' }
  try {
    const u = new URL(raw)
    if (u.pathname === '/price') return { kind: '/price', customPath: '' }
    if (u.pathname === '/live') return { kind: '/live', customPath: '' }
    return { kind: 'custom', customPath: u.pathname + u.search }
  } catch {
    return { kind: '/price', customPath: '' }
  }
}

function extractUtmCampaignFromMessage(message) {
  const raw = findAnymalUrl(message)
  if (!raw) return ''
  try {
    const u = new URL(raw)
    return u.searchParams.get('utm_campaign') || ''
  } catch {
    return ''
  }
}

function rebuildMessageURL(message, { destination, utmCampaign }) {
  const raw = findAnymalUrl(message)
  if (!raw) return message
  let url
  try {
    url = new URL(raw)
  } catch {
    return message
  }

  if (destination !== undefined && destination !== null && destination !== '') {
    const path = destination.startsWith('/') ? destination : `/${destination}`
    const [pathname, search] = path.split('?')
    url.pathname = pathname
    if (search !== undefined) {
      const incoming = new URLSearchParams(search)
      incoming.forEach((v, k) => url.searchParams.set(k, v))
    }
  }

  if (utmCampaign !== undefined) {
    if (utmCampaign === '') url.searchParams.delete('utm_campaign')
    else url.searchParams.set('utm_campaign', utmCampaign)
  }

  return message.replace(raw, url.toString())
}

async function handleImageFile(file) {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg']
  if (!validTypes.includes(file.type)) {
    throw new Error('Image must be PNG or JPEG')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image must be under 4MB')
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
}

function InlineEditor({ campaign, onSaved, onCancel }) {
  const initialDestination = useMemo(() => extractDestinationFromMessage(campaign.message), [campaign.message])
  const initialUtm = useMemo(() => extractUtmCampaignFromMessage(campaign.message), [campaign.message])

  const [message, setMessage] = useState(campaign.message || '')
  const [destinationKind, setDestinationKind] = useState(initialDestination.kind)
  const [customPath, setCustomPath] = useState(initialDestination.customPath)
  const [utmCampaign, setUtmCampaign] = useState(initialUtm)
  const [existingImage, setExistingImage] = useState(campaign.chart_base64 || '')
  const [newImage, setNewImage] = useState(null)
  const [imageError, setImageError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  const autoSize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const minPx = 8 * 22
    el.style.height = Math.max(minPx, el.scrollHeight) + 'px'
  }, [])

  useEffect(() => { autoSize() }, [message, autoSize])

  const resolvedDestination = destinationKind === 'custom'
    ? (customPath || '/')
    : destinationKind

  const pickFile = async (e) => {
    setImageError(null)
    const file = e.target.files && e.target.files[0]
    if (!file) return
    try {
      const base64 = await handleImageFile(file)
      setNewImage(base64)
    } catch (err) {
      setImageError(err.message)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeImage = () => {
    setNewImage('')
    setExistingImage('')
  }

  const keepExistingImage = () => {
    setNewImage(null)
    setExistingImage(campaign.chart_base64 || '')
  }

  const buildPatch = () => {
    const patch = {}
    const originalDestination = initialDestination.kind === 'custom'
      ? initialDestination.customPath
      : initialDestination.kind
    const destinationChanged = resolvedDestination !== originalDestination
    const utmChanged = utmCampaign !== initialUtm

    let finalMessage = message
    if (destinationChanged || utmChanged) {
      finalMessage = rebuildMessageURL(finalMessage, {
        destination: destinationChanged ? resolvedDestination : undefined,
        utmCampaign: utmChanged ? utmCampaign : undefined,
      })
    }

    if (finalMessage !== (campaign.message || '')) {
      patch.message = finalMessage
    }

    if (newImage !== null) {
      patch.chart_base64 = newImage
    }

    return patch
  }

  const handleSave = async () => {
    setSaveError(null)
    const patch = buildPatch()
    if (Object.keys(patch).length === 0) {
      setSaveError('No changes to save.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/${campaign.campaign_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        let detail = `${res.status}`
        try {
          const err = await res.json()
          if (err?.detail) detail = err.detail
        } catch { /* no-op */ }
        throw new Error(detail)
      }
      onSaved(patch)
    } catch (err) {
      setSaveError(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const previewImageSrc = newImage
    ? (newImage === '' ? null : `data:image/png;base64,${newImage}`)
    : (existingImage ? `data:image/png;base64,${existingImage}` : null)

  const labelStyle = { fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4a7a5a', marginBottom: '6px', fontFamily: SANS_FONT }
  const radioRowStyle = { display: 'flex', gap: '8px', flexWrap: 'wrap' }
  const radioPill = (active) => ({
    padding: '6px 12px',
    borderRadius: '20px',
    border: `1px solid ${active ? '#00e676' : '#1a3a2a'}`,
    background: active ? '#00e676' : 'transparent',
    color: active ? '#021a0e' : '#00e676',
    fontSize: '11px',
    fontFamily: SANS_FONT,
    cursor: 'pointer',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    fontWeight: active ? 600 : 400,
  })
  const textInputStyle = {
    width: '100%',
    background: '#031808',
    border: '1px solid #1a3a2a',
    borderRadius: '4px',
    padding: '8px 10px',
    color: '#e0ffe0',
    fontFamily: MONO_FONT,
    fontSize: '12px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ borderTop: '1px solid #1a3a2a', marginTop: '12px', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <div style={labelStyle}>Message</div>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onInput={autoSize}
          style={{
            width: '100%',
            minHeight: `${8 * 22}px`,
            background: '#04200e',
            border: '1px solid #1a3a2a',
            borderRadius: '4px',
            padding: '10px 12px',
            color: '#e0ffe0',
            fontFamily: MONO_FONT,
            fontSize: '13px',
            lineHeight: 1.6,
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div>
        <div style={labelStyle}>Destination</div>
        <div style={radioRowStyle}>
          <button type="button" onClick={() => setDestinationKind('/price')} style={radioPill(destinationKind === '/price')}>/price</button>
          <button type="button" onClick={() => setDestinationKind('/live')} style={radioPill(destinationKind === '/live')}>/live</button>
          <button type="button" onClick={() => setDestinationKind('custom')} style={radioPill(destinationKind === 'custom')}>Custom</button>
        </div>
        {destinationKind === 'custom' && (
          <input
            type="text"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder="/custom-path?foo=bar"
            style={{ ...textInputStyle, marginTop: '8px' }}
          />
        )}
      </div>

      <div>
        <div style={labelStyle}>UTM Campaign</div>
        <input
          type="text"
          value={utmCampaign}
          onChange={(e) => setUtmCampaign(e.target.value)}
          placeholder="e.g. ai_holland_feb"
          style={textInputStyle}
        />
      </div>

      <div>
        <div style={labelStyle}>Image</div>
        {previewImageSrc ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
            <img src={previewImageSrc} alt="campaign chart" style={{ width: '200px', height: 'auto', border: '1px solid #1a3a2a', borderRadius: '4px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button type="button" onClick={removeImage} style={{ background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '4px', padding: '4px 10px', fontSize: '10px', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>
                Remove image
              </button>
              {newImage !== null && campaign.chart_base64 && (
                <button type="button" onClick={keepExistingImage} style={{ background: 'transparent', color: '#00e676', border: '1px solid #1a3a2a', borderRadius: '4px', padding: '4px 10px', fontSize: '10px', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>
                  Revert
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: '#4a7a5a', marginBottom: '8px', fontFamily: SANS_FONT }}>
            No image attached.
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          onChange={pickFile}
          style={{ fontSize: '11px', color: '#c0e0c0', fontFamily: SANS_FONT }}
        />
        {imageError && (
          <div style={{ color: '#ff4444', fontSize: '11px', marginTop: '6px', fontFamily: SANS_FONT }}>{imageError}</div>
        )}
      </div>

      {saveError && (
        <div style={{ background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '4px', padding: '8px 12px', fontSize: '12px', color: '#ff4444', fontFamily: SANS_FONT }}>
          {saveError}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '8px 20px', background: saving ? '#1a3a2a' : '#00e676', color: '#021a0e', border: 'none', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT, fontWeight: 600 }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{ padding: '8px 20px', background: 'transparent', color: '#ffffff', border: '1px solid #ffffff', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function CampaignCard({ campaign, onApprove, onReject, onPatched, actionLoading }) {
  const [editing, setEditing] = useState(false)

  const firstLine = campaign.generated_copy
    ? campaign.generated_copy.split('\n').find(l => l.trim()) || ''
    : campaign.barn_name || campaign.topic_title || campaign.campaign_id

  const displayTitle = firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine
  const channelColor = CHANNEL_COLORS[campaign.channel] || '#00e676'
  const isLoading = actionLoading === campaign.campaign_id

  const handleSaved = (patch) => {
    onPatched(campaign.campaign_id, patch)
    setEditing(false)
  }

  return (
    <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '16px', marginBottom: '12px', background: '#021a0e' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: '500', fontSize: '14px', color: '#e0ffe0', margin: '0 0 4px 0', lineHeight: 1.4 }}>{displayTitle}</p>
          {(campaign.topic_title || campaign.topic_source) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: '#4a7a5a' }}>
                via {campaign.topic_source || 'research agent'}
              </span>
              {campaign.url && (
                <a href={campaign.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '11px', color: '#00e676', textDecoration: 'none' }}>
                  {campaign.topic_title ? campaign.topic_title.slice(0, 70) + (campaign.topic_title.length > 70 ? '...' : '') : 'view source'} ↗
                </a>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: '#0a2a1a', color: channelColor, border: `1px solid ${channelColor}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {campaign.channel_label || campaign.channel}
            </span>
            {campaign.topic_angle && (
              <span style={{ fontSize: '10px', color: '#4a7a5a' }}>{campaign.topic_angle}</span>
            )}
            <span style={{ fontSize: '10px', color: '#4a7a5a' }}>{formatDate(campaign.created_at)}</span>
            {campaign.updated_at && (
              <span style={{ fontSize: '10px', color: '#00e676' }}>edited {formatDate(campaign.updated_at)}</span>
            )}
          </div>
        </div>
      </div>

      {!editing && (
        <div style={{ background: '#031808', border: '1px solid #0a2a1a', borderRadius: '4px', padding: '12px', marginBottom: '12px', fontSize: '13px', color: '#c0e0c0', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: MONO_FONT }}>
          {campaign.message || campaign.generated_copy}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setEditing(v => !v)}
          disabled={isLoading}
          style={{ padding: '8px 20px', background: editing ? '#0a2a1a' : 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: isLoading ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT }}>
          {editing ? 'Close' : 'Edit'}
        </button>
        <button
          onClick={() => onApprove(campaign.campaign_id)}
          disabled={isLoading || editing}
          style={{ padding: '8px 20px', background: (isLoading || editing) ? '#1a3a2a' : '#00e676', color: '#021a0e', border: 'none', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (isLoading || editing) ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT, fontWeight: '600' }}>
          {isLoading ? 'Publishing...' : 'Approve'}
        </button>
        <button
          onClick={() => onReject(campaign.campaign_id)}
          disabled={isLoading || editing}
          style={{ padding: '8px 20px', background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (isLoading || editing) ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT }}>
          Reject
        </button>
      </div>

      {editing && (
        <InlineEditor
          campaign={campaign}
          onSaved={handleSaved}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  )
}

export default function CampaignDashboard() {
  const [pending, setPending] = useState([])
  const [published, setPublished] = useState([])
  const [activeChannel, setActiveChannel] = useState('all')
  const [lastRefresh, setLastRefresh] = useState(null)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [actionLoading, setActionLoading] = useState(null)
  const [actionSuccess, setActionSuccess] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [generating, setGenerating] = useState(false)
  const intervalRef = useRef(null)

  const fetchData = useCallback(async () => {
    setLastRefresh(new Date())
    setCountdown(REFRESH_INTERVAL)
    try {
      const channelParam = activeChannel !== 'all' ? `?channel=${activeChannel}` : ''
      const res = await fetch(`${MARKETING_API}/campaigns/pending/by-channel${channelParam}`, { headers })
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      setPending(json.campaigns || [])
    } catch (err) {
      console.error('Failed to fetch pending:', err)
    }
    try {
      const res2 = await fetch(`${MARKETING_API}/campaigns?status=published&limit=10`, { headers })
      if (!res2.ok) throw new Error(`${res2.status}`)
      const json2 = await res2.json()
      setPublished(json2.campaigns || [])
    } catch (err) {
      console.error('Failed to fetch published:', err)
    }
  }, [activeChannel])

  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { fetchData(); return REFRESH_INTERVAL }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [fetchData])

  const handleApprove = async (campaignId) => {
    setActionLoading(campaignId)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/${campaignId}/approve`, { method: 'POST', headers })
      if (!res.ok) throw new Error(`${res.status}`)
      setActionSuccess(`Published: ${campaignId}`)
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchData()
    } catch (err) {
      setActionError(`Approve failed: ${err.message}`)
    }
    setActionLoading(null)
  }

  const handleReject = async (campaignId) => {
    setActionLoading(campaignId)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/${campaignId}/reject`, { method: 'POST', headers })
      if (!res.ok) throw new Error(`${res.status}`)
      await fetchData()
    } catch (err) {
      setActionError(`Reject failed: ${err.message}`)
    }
    setActionLoading(null)
  }

  const handlePatched = (campaignId, patch) => {
    setPending(list => list.map(c => (
      c.campaign_id === campaignId
        ? { ...c, ...patch, updated_at: new Date().toISOString() }
        : c
    )))
    setActionSuccess(`Saved: ${campaignId}`)
    setTimeout(() => setActionSuccess(null), 4000)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/content/run`, { method: 'POST', headers })
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      setActionSuccess(`Generated ${json.drafts_created} drafts`)
      setTimeout(() => setActionSuccess(null), 5000)
      await fetchData()
    } catch (err) {
      setActionError(`Generate failed: ${err.message}`)
    }
    setGenerating(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '14px', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px 0', color: '#00e676' }}>Campaign Dashboard</h1>
          <p style={{ fontSize: '11px', color: '#4a7a5a', margin: 0 }}>
            {lastRefresh ? `Last refresh: ${lastRefresh.toLocaleTimeString()}` : 'Loading...'} | Auto-refresh: {countdown}s
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleGenerate} disabled={generating}
            style={{ padding: '8px 16px', background: 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: generating ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT }}>
            {generating ? 'Generating...' : 'Generate Drafts'}
          </button>
          <button onClick={fetchData}
            style={{ padding: '8px 16px', background: 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: SANS_FONT }}>
            Refresh
          </button>
        </div>
      </div>

      {actionSuccess && <div style={{ background: '#0a2a1a', border: '1px solid #00e676', borderRadius: '4px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#00e676' }}>{actionSuccess}</div>}
      {actionError && <div style={{ background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '4px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#ff4444' }}>{actionError}</div>}

      <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {CHANNELS.map(ch => (
            <button key={ch.id} onClick={() => setActiveChannel(ch.id)}
              style={{ padding: '6px 14px', borderRadius: '20px', border: '1px solid', borderColor: activeChannel === ch.id ? '#00e676' : '#1a3a2a', background: activeChannel === ch.id ? '#00e676' : 'transparent', color: activeChannel === ch.id ? '#021a0e' : '#00e676', fontSize: '12px', fontFamily: SANS_FONT, cursor: 'pointer', fontWeight: activeChannel === ch.id ? '600' : '400' }}>
              {ch.label}
            </button>
          ))}
        </div>

        <h2 style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e676', margin: '0 0 12px 0' }}>
          Pending Approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#4a7a5a' }}>No pending drafts. Run Generate Drafts or wait for the 9AM CT auto-run.</p>
        ) : (
          pending.map(c => (
            <CampaignCard
              key={c.campaign_id}
              campaign={c}
              onApprove={handleApprove}
              onReject={handleReject}
              onPatched={handlePatched}
              actionLoading={actionLoading}
            />
          ))
        )}
      </div>

      <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '16px' }}>
        <h2 style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e676', margin: '0 0 12px 0' }}>
          Recently Published ({published.length})
        </h2>
        {published.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#4a7a5a' }}>No recently published posts.</p>
        ) : (
          published.map(c => (
            <div key={c.campaign_id} style={{ border: '1px solid #1a3a2a', borderRadius: '4px', padding: '12px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '13px', color: '#c0e0c0', margin: '0 0 4px 0' }}>
                    {c.generated_copy?.split('\n').find(l => l.trim())?.slice(0, 80) || c.barn_name || c.campaign_id}
                  </p>
                  <span style={{ fontSize: '10px', color: '#4a7a5a' }}>{c.channel_label || c.channel} | {formatDate(c.posted_at)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
