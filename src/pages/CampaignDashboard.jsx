import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MARKETING_API, headers, adminHeaders, HAS_MARKETING_ADMIN_KEY } from '../config'
import ApproveConfirmModal from '../components/ApproveConfirmModal'
import ReplyTargetContext from '../components/ReplyTargetContext'

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
  facebook_reply: '#1877F2',
}

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const URL_PATTERN = /https?:\/\/world\.anymalos\.com\/[^\s)]*/
const DEFAULT_CANARY_ZIP = '74501'
const CREATIVE_TEMPLATE_ID = 'city_price_launch_v1'

const EMPTY_TARGET_GROUP = {
  group_name: '',
  group_url: '',
  public_private: 'unknown',
  member_count: '',
  member_count_band: 'unknown',
  group_focus: '',
  post_text: '',
  utm_content: '',
  utm_url: '',
  remove_link_preview: true,
}

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

function extractZipFromCampaign(campaign) {
  if (campaign?.zip) return String(campaign.zip).padStart(5, '0')
  const raw = findAnymalUrl(campaign?.message || campaign?.generated_copy || '')
  if (!raw) return ''
  try {
    const u = new URL(raw)
    const zip = u.searchParams.get('zip')
    return zip ? String(zip).padStart(5, '0') : ''
  } catch {
    return ''
  }
}

function postedUrlForCampaign(campaign) {
  return campaign?.posted_url || campaign?.facebook_post_url || campaign?.post_url || ''
}

function slugForUtm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

function makeUtmContent(zip, groupName) {
  const slug = slugForUtm(groupName)
  return `${zip || DEFAULT_CANARY_ZIP}_${slug || 'group'}`
}

function buildGroupUtmUrl(zip, utmContent) {
  const params = new URLSearchParams({
    utm_source: 'facebook',
    utm_medium: 'group_post',
    utm_campaign: `zip_${zip}_local_price`,
    utm_content: utmContent,
  })
  return `https://world.anymalos.com/price?zip=${zip}&${params.toString()}`
}

function canApproveCampaign(campaign) {
  return !(campaign.manual_only || campaign.should_approve_in_dashboard === false)
}

async function readErrorDetail(res) {
  let detail = `${res.status}`
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') detail = body.detail
    else if (body?.detail) detail = JSON.stringify(body.detail)
  } catch { /* no-op */ }
  return detail
}

async function readApiError(res) {
  try {
    const body = await res.json()
    const detail = body?.detail || body
    if (typeof detail === 'string') return { message: detail, detail: { error: detail } }
    return {
      message: detail?.error || detail?.message || `${res.status}`,
      detail,
    }
  } catch {
    return { message: `${res.status}`, detail: { error: `${res.status}` } }
  }
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

function CampaignCard({
  campaign,
  onRequestApprove,
  onReject,
  onPatched,
  onCopyManual,
  onIncludeInCanary,
  actionLoading,
  embedded = false,
}) {
  const [editing, setEditing] = useState(false)

  const firstLine = campaign.generated_copy
    ? campaign.generated_copy.split('\n').find(l => l.trim()) || ''
    : campaign.barn_name || campaign.topic_title || campaign.campaign_id

  const displayTitle = firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine
  const channelColor = CHANNEL_COLORS[campaign.channel] || '#00e676'
  const isLoading = actionLoading === campaign.campaign_id
  const isManualOnly = !canApproveCampaign(campaign)

  const handleSaved = (patch) => {
    onPatched(campaign.campaign_id, patch)
    setEditing(false)
  }

  return (
    <div style={{
      border: embedded ? 'none' : '1px solid #1a3a2a',
      borderTop: embedded ? '1px solid #0a2a1a' : '1px solid #1a3a2a',
      borderRadius: embedded ? 0 : '6px',
      padding: embedded ? '14px 0 0 0' : '16px',
      marginBottom: embedded ? '14px' : '12px',
      background: embedded ? 'transparent' : '#021a0e',
    }}>
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

      {campaign.channel === 'facebook_reply' && (
        <ReplyTargetContext campaign={campaign} expanded={false} />
      )}

      {!editing && (
        <div style={{ background: '#031808', border: '1px solid #0a2a1a', borderRadius: '4px', padding: '12px', marginBottom: '12px', fontSize: '13px', color: '#c0e0c0', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: MONO_FONT }}>
          {campaign.message || campaign.generated_copy}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setEditing(v => !v)}
          disabled={isLoading}
          style={{ padding: '8px 20px', background: editing ? '#0a2a1a' : 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: isLoading ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT }}>
          {editing ? 'Close' : 'Edit'}
        </button>
        {isManualOnly ? (
          <>
            <button
              onClick={() => onCopyManual(campaign)}
              disabled={isLoading || editing}
              style={{ padding: '8px 20px', background: 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (isLoading || editing) ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT }}>
              Copy
            </button>
            <button
              onClick={() => onIncludeInCanary(campaign)}
              disabled={isLoading || editing}
              style={{ padding: '8px 20px', background: (isLoading || editing) ? '#1a3a2a' : '#00e676', color: '#021a0e', border: 'none', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (isLoading || editing) ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT, fontWeight: '600' }}>
              Include in Canary Job
            </button>
          </>
        ) : (
          <button
            onClick={() => onRequestApprove(campaign)}
            disabled={isLoading || editing}
            style={{ padding: '8px 20px', background: (isLoading || editing) ? '#1a3a2a' : '#00e676', color: '#021a0e', border: 'none', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (isLoading || editing) ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT, fontWeight: '600' }}>
            {isLoading ? 'Publishing...' : 'Approve'}
          </button>
        )}
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

const VIEW_LABELS = {
  facebook_page: 'View on Facebook',
  anymal_linkedin: 'View on LinkedIn',
  personal_linkedin: 'View on LinkedIn',
  anymal_x: 'View on X',
  personal_x: 'View on X',
  facebook_reply: 'View reply',
}

function formatPostedTimestamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function PublishedCard({ campaign, expanded, onToggleExpanded }) {
  const channel = campaign.channel || 'facebook_page'
  const channelColor = CHANNEL_COLORS[channel] || '#00e676'
  const message = campaign.message || campaign.generated_copy || ''
  const hasImage = Boolean(campaign.chart_base64)
  const thumbSize = expanded ? 400 : 80
  const viewLabel = VIEW_LABELS[channel] || 'View post'

  const utmCampaign = useMemo(() => {
    if (campaign.utm_params && campaign.utm_params.utm_campaign) {
      return campaign.utm_params.utm_campaign
    }
    const match = message.match(URL_PATTERN)
    if (!match) return ''
    try {
      return new URL(match[0]).searchParams.get('utm_campaign') || ''
    } catch {
      return ''
    }
  }, [campaign.utm_params, message])

  const destination = useMemo(() => {
    if (campaign.link) return campaign.link
    const match = message.match(URL_PATTERN)
    return match ? match[0] : ''
  }, [campaign.link, message])

  return (
    <div
      style={{
        border: '1px solid #1a3a2a',
        borderRadius: '6px',
        padding: '14px',
        marginBottom: '10px',
        background: '#021a0e',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <span
          style={{
            fontSize: '10px',
            padding: '2px 8px',
            borderRadius: '10px',
            background: '#0a2a1a',
            color: channelColor,
            border: `1px solid ${channelColor}`,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {campaign.channel_label || channel}
        </span>
        <span style={{ fontSize: '11px', color: '#4a7a5a' }}>
          Posted {formatPostedTimestamp(campaign.posted_at) || 'recently'}
        </span>
        {campaign.topic_angle && (
          <span style={{ fontSize: '10px', color: '#4a7a5a' }}>{campaign.topic_angle}</span>
        )}
      </div>

      {campaign.channel === 'facebook_reply' && (
        <ReplyTargetContext campaign={campaign} expanded={false} />
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {hasImage && (
          <img
            src={`data:image/png;base64,${campaign.chart_base64}`}
            alt="published chart"
            onClick={onToggleExpanded}
            style={{
              width: `${thumbSize}px`,
              height: 'auto',
              maxWidth: '100%',
              border: '1px solid #1a3a2a',
              borderRadius: '4px',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'width 0.15s ease',
            }}
          />
        )}
        <div
          style={{
            flex: 1,
            fontSize: '13px',
            color: '#c0e0c0',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            fontFamily: MONO_FONT,
          }}
        >
          {message}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
        {campaign.posted_url ? (
          <a
            href={campaign.posted_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px 14px',
              background: 'transparent',
              color: channelColor,
              border: `1px solid ${channelColor}`,
              borderRadius: '4px',
              fontSize: '11px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: SANS_FONT,
              textDecoration: 'none',
            }}
          >
            {viewLabel}
          </a>
        ) : campaign.post_id ? (
          <span style={{ fontSize: '11px', color: '#4a7a5a', fontFamily: MONO_FONT }}>
            Post ID: {campaign.post_id}
          </span>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '14px',
          rowGap: '4px',
          marginTop: '10px',
          flexWrap: 'wrap',
          fontSize: '10px',
          color: '#4a7a5a',
          fontFamily: MONO_FONT,
        }}
      >
        {destination && (
          <span style={{ wordBreak: 'break-all' }}>dest: {destination}</span>
        )}
        {utmCampaign && <span>utm: {utmCampaign}</span>}
        {campaign.topic_stakeholder && <span>for: {campaign.topic_stakeholder}</span>}
      </div>
    </div>
  )
}

function pillStyle(color = '#00e676') {
  return {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '10px',
    background: '#0a2a1a',
    color,
    border: `1px solid ${color}`,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }
}

function statusPillFor(value, { compact = false } = {}) {
  const normalized = String(value || 'unknown')
  const labels = {
    needs_review_stale_anchor: 'Stale Anchor',
    needs_creative_review: 'Creative Review Needed',
    shipped: 'Generated',
    generated: 'Generated',
    creative_current: 'Creative Current',
    creative_missing: 'Creative Missing',
    creative_stale_brand_version: 'Creative Stale',
    generating: 'Generating',
    regenerating: 'Regenerating',
    refreshing_drafts: 'Refreshing Drafts',
    failed: 'Failed',
    unknown: 'Unknown',
  }
  const colors = {
    needs_review_stale_anchor: '#ff4444',
    failed: '#ff4444',
    needs_creative_review: '#ffd54f',
    creative_missing: '#ffd54f',
    creative_stale_brand_version: '#ffd54f',
    generating: '#4da3ff',
    regenerating: '#4da3ff',
    refreshing_drafts: '#4da3ff',
    shipped: '#00e676',
    generated: '#00e676',
    creative_current: '#00e676',
    unknown: '#4a7a5a',
  }
  const label = labels[normalized] || normalized.replaceAll('_', ' ')
  return <span style={{ ...pillStyle(colors[normalized] || '#4a7a5a'), fontSize: compact ? '9px' : '10px' }}>{label}</span>
}

function creativeMetadataFromAsset(asset) {
  if (!asset) return null
  return {
    template_id: asset.template_id || CREATIVE_TEMPLATE_ID,
    creative_status: asset.status === 'generated' ? 'creative_current' : 'failed',
    current_brand_version: asset.brand_version || '',
    creative_asset_id: asset.creative_asset_id || asset.doc_id || null,
    image_url: asset.image_url || null,
    thumbnail_url: asset.thumbnail_url || null,
    brand_version: asset.brand_version || null,
    status: asset.status || null,
    render_engine: asset.render_engine || null,
    background_model: asset.background_model || null,
    brand_version_stale: null,
  }
}

function resolveCreativeStatus(creativeMetadata, fallback) {
  return fallback || creativeMetadata?.creative_status || 'creative_missing'
}

function resolveZipStatus(campaigns, creativeStatus) {
  if (campaigns.some(c => c.status === 'needs_review_stale_anchor')) return 'needs_review_stale_anchor'
  if (campaigns.some(c => c.status === 'needs_creative_review')) return 'needs_creative_review'
  if (creativeStatus === 'creative_missing' || creativeStatus === 'creative_stale_brand_version') return 'needs_creative_review'
  return 'shipped'
}

function campaignCityCounty(campaigns) {
  const firstWithPlace = campaigns.find(c => c.city || c.county || c.state) || campaigns[0] || {}
  return {
    city: firstWithPlace.city || '',
    county: firstWithPlace.county || '',
    state: firstWithPlace.state || '',
  }
}

function buildZipGroups(campaigns, zipCreativeOverrides = {}) {
  const map = new Map()
  campaigns.forEach(campaign => {
    const zip = extractZipFromCampaign(campaign) || 'other'
    if (!map.has(zip)) map.set(zip, [])
    map.get(zip).push(campaign)
  })
  return [...map.entries()]
    .map(([zip, list]) => {
      const override = zipCreativeOverrides[zip] || {}
      const place = campaignCityCounty(list)
      const metadata = override.creativeMetadata || list.find(c => c.creative_metadata)?.creative_metadata || null
      const creativeStatus = resolveCreativeStatus(metadata, override.creativeStatus || list.find(c => c.creative_status)?.creative_status)
      const zipStatus = zip === 'other' ? 'unknown' : resolveZipStatus(list, creativeStatus)
      const hasFacebookDraftWithoutCreative = list.some(c => c.channel === 'facebook_page' && !c.creative_metadata)
      return {
        zip,
        campaigns: list,
        creativeMetadata: metadata,
        creativeStatus,
        zipStatus,
        hasFacebookDraftWithoutCreative,
        needsRefresh: Boolean(override.needsRefresh),
        ...place,
      }
    })
    .sort((a, b) => {
      if (a.zip === 'other') return 1
      if (b.zip === 'other') return -1
      return a.zip.localeCompare(b.zip)
    })
}

function mergeCampaigns(...lists) {
  const map = new Map()
  lists.flat().filter(Boolean).forEach(campaign => {
    const id = campaign.campaign_id || campaign.doc_id
    if (id) map.set(id, campaign)
  })
  return [...map.values()].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

function smallButtonStyle({ filled = false, danger = false, disabled = false } = {}) {
  const color = danger ? '#ff4444' : '#00e676'
  return {
    padding: '7px 12px',
    background: filled && !disabled ? color : 'transparent',
    color: filled && !disabled ? '#021a0e' : color,
    border: filled && !disabled ? 'none' : `1px solid ${disabled ? '#1a3a2a' : color}`,
    borderRadius: '4px',
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: SANS_FONT,
    fontWeight: filled ? 600 : 400,
    opacity: disabled ? 0.55 : 1,
  }
}

function fieldStyle() {
  return {
    width: '100%',
    background: '#031808',
    border: '1px solid #1a3a2a',
    borderRadius: '4px',
    padding: '8px 10px',
    color: '#e0ffe0',
    fontFamily: MONO_FONT,
    fontSize: '12px',
    outline: 'none',
  }
}

function fieldLabel(label) {
  return (
    <div style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4a7a5a', marginBottom: '6px', fontFamily: SANS_FONT }}>
      {label}
    </div>
  )
}

function statusColor(status) {
  if (['completed', 'submitted_visible_or_feed'].includes(status)) return '#00e676'
  if (['completed_with_failures', 'submitted_unverified', 'pending_admin_approval', 'running', 'approved_for_execution'].includes(status)) return '#ffd54f'
  if (['failed', 'filtered_or_rejected', 'blocked_join_required', 'blocked_permission', 'cancelled_by_operator', 'timed_out'].includes(status)) return '#ff4444'
  return '#4a7a5a'
}

function LaunchZipCanaryPanel({
  zipOptions,
  canaryZip,
  setCanaryZip,
  pageAnchors,
  selectedAnchorId,
  setSelectedAnchorId,
  selectedAnchor,
  targetGroups,
  onTargetGroupChange,
  onAddTargetGroup,
  onRemoveTargetGroup,
  onGenerateGroupCopy,
  onCreateJob,
  copyLoading,
  canaryCreating,
  canaryJobs,
  canaryLoading,
  onCancelJob,
  onResetJob,
  onMarkReviewed,
  canarySourceCampaign,
}) {
  const selectedAnchorUrl = postedUrlForCampaign(selectedAnchor)
  const anchorState = !selectedAnchor
    ? 'not published'
    : selectedAnchorUrl
      ? 'published'
      : 'missing URL'
  const anchorReady = anchorState === 'published'
  const readyGroups = targetGroups.filter(g => g.group_name && g.group_url && g.post_text && (g.utm_url ? g.post_text.includes(g.utm_url) : true))
  const createDisabled = !HAS_MARKETING_ADMIN_KEY || !anchorReady || readyGroups.length === 0 || canaryCreating

  return (
    <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '16px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e676', margin: '0 0 6px 0' }}>
            Launch ZIP Canary
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={pillStyle(statusColor(anchorState))}>Page anchor: {anchorState}</span>
            {canarySourceCampaign && (
              <span style={pillStyle('#4a7a5a')}>Source: {canarySourceCampaign.campaign_id}</span>
            )}
            {!HAS_MARKETING_ADMIN_KEY && (
              <span style={pillStyle('#ff4444')}>Admin key missing</span>
            )}
          </div>
        </div>
        <button type="button" onClick={onCreateJob} disabled={createDisabled} style={smallButtonStyle({ filled: true, disabled: createDisabled })}>
          {canaryCreating ? 'Creating...' : 'Approve for Codex execution'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div>
          {fieldLabel('ZIP campaign package')}
          <div style={{ display: 'flex', gap: '8px' }}>
            <select value={canaryZip} onChange={(e) => setCanaryZip(e.target.value)} style={fieldStyle()}>
              {zipOptions.map(zip => <option key={zip} value={zip}>{zip}</option>)}
            </select>
            <input value={canaryZip} onChange={(e) => setCanaryZip(e.target.value.replace(/\D/g, '').slice(0, 5))} style={{ ...fieldStyle(), width: '90px' }} />
          </div>
        </div>
        <div>
          {fieldLabel('Page anchor')}
          <select value={selectedAnchorId} onChange={(e) => setSelectedAnchorId(e.target.value)} style={fieldStyle()}>
            <option value="">No published Page anchor found</option>
            {pageAnchors.map(c => (
              <option key={c.campaign_id} value={c.campaign_id}>
                {c.campaign_id} {postedUrlForCampaign(c) ? '' : '(missing URL)'}
              </option>
            ))}
          </select>
          {selectedAnchorUrl && (
            <a href={selectedAnchorUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '6px', color: '#1877F2', fontSize: '11px', fontFamily: MONO_FONT, textDecoration: 'none' }}>
              {selectedAnchorUrl}
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e676', margin: 0 }}>
          Target groups ({targetGroups.length})
        </h3>
        <button type="button" onClick={onAddTargetGroup} style={smallButtonStyle()}>
          Add group
        </button>
      </div>

      {targetGroups.map((group, index) => {
        const loading = copyLoading === index
        return (
          <div key={index} style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px', marginBottom: '10px', background: '#021a0e' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div>
                {fieldLabel('Group name')}
                <input value={group.group_name} onChange={(e) => onTargetGroupChange(index, 'group_name', e.target.value)} style={fieldStyle()} />
              </div>
              <div>
                {fieldLabel('Group URL')}
                <input value={group.group_url} onChange={(e) => onTargetGroupChange(index, 'group_url', e.target.value)} style={fieldStyle()} />
              </div>
              <div>
                {fieldLabel('Privacy')}
                <select value={group.public_private} onChange={(e) => onTargetGroupChange(index, 'public_private', e.target.value)} style={fieldStyle()}>
                  <option value="unknown">unknown</option>
                  <option value="public">public</option>
                  <option value="private">private</option>
                </select>
              </div>
              <div>
                {fieldLabel('Members')}
                <input value={group.member_count} onChange={(e) => onTargetGroupChange(index, 'member_count', e.target.value)} style={fieldStyle()} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div>
                {fieldLabel('Group focus')}
                <input value={group.group_focus} onChange={(e) => onTargetGroupChange(index, 'group_focus', e.target.value)} style={fieldStyle()} />
              </div>
              <div>
                {fieldLabel('Member band')}
                <select value={group.member_count_band} onChange={(e) => onTargetGroupChange(index, 'member_count_band', e.target.value)} style={fieldStyle()}>
                  <option value="unknown">unknown</option>
                  <option value="under_1k">under 1k</option>
                  <option value="1k_to_10k">1k to 10k</option>
                  <option value="10k_plus">10k plus</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div>
                {fieldLabel('UTM content')}
                <input value={group.utm_content} onChange={(e) => onTargetGroupChange(index, 'utm_content', e.target.value)} style={fieldStyle()} />
              </div>
              <div>
                {fieldLabel('UTM URL')}
                <input value={group.utm_url} onChange={(e) => onTargetGroupChange(index, 'utm_url', e.target.value)} style={fieldStyle()} />
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              {fieldLabel('Approved group post text')}
              <textarea value={group.post_text} onChange={(e) => onTargetGroupChange(index, 'post_text', e.target.value)} rows={5} style={{ ...fieldStyle(), resize: 'vertical', lineHeight: 1.5 }} />
            </div>

            {group.risk_notes?.length > 0 && (
              <div style={{ color: '#ffd54f', fontSize: '11px', marginBottom: '10px' }}>
                {group.risk_notes.join(' | ')}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => onGenerateGroupCopy(index)} disabled={loading || !HAS_MARKETING_ADMIN_KEY} style={smallButtonStyle({ disabled: loading || !HAS_MARKETING_ADMIN_KEY })}>
                {loading ? 'Generating...' : 'Generate copy'}
              </button>
              <button type="button" onClick={() => onRemoveTargetGroup(index)} disabled={targetGroups.length === 1} style={smallButtonStyle({ danger: true, disabled: targetGroups.length === 1 })}>
                Remove
              </button>
              {group.remove_link_preview && <span style={pillStyle('#4a7a5a')}>remove link preview</span>}
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: '16px' }}>
        <h3 style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e676', margin: '0 0 10px 0' }}>
          Canary jobs {canaryLoading ? '(loading)' : `(${canaryJobs.length})`}
        </h3>
        {canaryJobs.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#4a7a5a', margin: 0 }}>No canary jobs loaded.</p>
        ) : (
          canaryJobs.map(job => (
            <div key={job.job_id} style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px', marginBottom: '10px', background: '#031808' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <div>
                  <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 600 }}>{job.job_id}</div>
                  <div style={{ color: '#4a7a5a', fontSize: '11px', marginTop: '2px' }}>
                    ZIP {job.zip} | {formatDate(job.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={pillStyle(statusColor(job.status))}>{job.status}{job.is_stale ? ' stale' : ''}</span>
                  {['approved_for_execution', 'running'].includes(job.status) && (
                    <button type="button" onClick={() => onCancelJob(job.job_id)} style={smallButtonStyle({ danger: true })}>Cancel</button>
                  )}
                  {(job.status === 'timed_out' || job.is_stale) && (
                    <button type="button" onClick={() => onResetJob(job.job_id)} style={smallButtonStyle()}>Reset</button>
                  )}
                </div>
              </div>

              {(job.target_groups || []).map(group => (
                <div key={group.group_id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', padding: '8px 0', borderTop: '1px solid #0a2a1a' }}>
                  <div>
                    <div style={{ color: '#c0e0c0', fontSize: '12px' }}>{group.group_name}</div>
                    <div style={{ color: '#4a7a5a', fontSize: '10px', wordBreak: 'break-all' }}>
                      {group.group_url}
                    </div>
                    {group.notes && <div style={{ color: '#4a7a5a', fontSize: '10px', marginTop: '4px' }}>{group.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={pillStyle(statusColor(group.status))}>{group.status}</span>
                    {group.status === 'submitted_unverified' && (
                      <button type="button" onClick={() => onMarkReviewed(job, group)} style={smallButtonStyle()}>Reviewed</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function CreativePreviewBlock({
  zip,
  creativeMetadata,
  creativeStatus,
  zipStatus,
  isLoading,
  loadingPhase,
  onGenerateCreative,
  onRegenerateCreative,
  onRefreshDrafts,
  canRefreshDrafts,
  disabled,
  errorDetail,
}) {
  const hasCreative = Boolean(creativeMetadata?.thumbnail_url || creativeMetadata?.image_url)
  const imageUrl = creativeMetadata?.thumbnail_url || creativeMetadata?.image_url || ''
  const fullUrl = creativeMetadata?.image_url || creativeMetadata?.thumbnail_url || ''
  const effectiveStatus = isLoading ? loadingPhase : creativeStatus
  const isStaleAnchor = zipStatus === 'needs_review_stale_anchor' || errorDetail?.error === 'insufficient_fresh_evidence'
  const isMissing = creativeStatus === 'creative_missing'
  const isBrandStale = Boolean(creativeMetadata?.brand_version_stale)

  return (
    <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px', background: '#031808', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', alignItems: 'start' }}>
      <div>
        {hasCreative ? (
          <a href={fullUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
            <img
              src={imageUrl}
              alt={`Creative preview for ZIP ${zip}`}
              style={{ width: '100%', aspectRatio: '600 / 315', objectFit: 'cover', border: '1px solid #1a3a2a', borderRadius: '4px', display: 'block' }}
            />
          </a>
        ) : (
          <div style={{ width: '100%', aspectRatio: '600 / 315', border: '1px dashed #1a3a2a', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a7a5a', fontSize: '11px', fontFamily: MONO_FONT, textAlign: 'center', padding: '12px' }}>
            No creative generated yet
          </div>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
          {statusPillFor(effectiveStatus)}
          {isBrandStale && statusPillFor('creative_stale_brand_version')}
          {creativeMetadata?.status && <span style={pillStyle('#4a7a5a')}>{creativeMetadata.status}</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '10px', fontSize: '10px', color: '#4a7a5a', fontFamily: MONO_FONT }}>
          <span>template: {creativeMetadata?.template_id || CREATIVE_TEMPLATE_ID}</span>
          <span>brand: {creativeMetadata?.brand_version || creativeMetadata?.current_brand_version || 'server sourced'}</span>
          <span>render: {creativeMetadata?.render_engine || 'N/A'}</span>
          <span>model: {creativeMetadata?.background_model || 'N/A'}</span>
        </div>

        {isStaleAnchor && (
          <div style={{ background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '4px', padding: '8px 10px', color: '#ffb3b3', fontSize: '11px', lineHeight: 1.45, marginBottom: '10px' }}>
            Stale market anchor. {errorDetail?.anchor_name ? `${errorDetail.anchor_name} is not fresh enough for generation.` : 'Fresh evidence is required before publishing.'}
          </div>
        )}

        {isMissing && !isStaleAnchor && (
          <div style={{ background: '#2a230a', border: '1px solid #ffd54f', borderRadius: '4px', padding: '8px 10px', color: '#ffe58a', fontSize: '11px', lineHeight: 1.45, marginBottom: '10px' }}>
            Creative missing. Generate one branded image for this ZIP, then refresh drafts to attach it.
          </div>
        )}

        {isBrandStale && (
          <div style={{ background: '#2a230a', border: '1px solid #ffd54f', borderRadius: '4px', padding: '8px 10px', color: '#ffe58a', fontSize: '11px', lineHeight: 1.45, marginBottom: '10px' }}>
            Brand version stale: {creativeMetadata.brand_version_stale}. Regenerate before publishing.
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {creativeStatus === 'creative_missing' ? (
            <button type="button" onClick={onGenerateCreative} disabled={disabled || isLoading || isStaleAnchor} style={smallButtonStyle({ filled: true, disabled: disabled || isLoading || isStaleAnchor })}>
              {isLoading && loadingPhase === 'generating' ? 'Generating...' : 'Generate Creative'}
            </button>
          ) : (
            <button type="button" onClick={onRegenerateCreative} disabled={disabled || isLoading || isStaleAnchor} style={smallButtonStyle({ disabled: disabled || isLoading || isStaleAnchor })}>
              {isLoading && loadingPhase === 'regenerating' ? 'Regenerating...' : 'Regenerate Creative'}
            </button>
          )}
          {canRefreshDrafts && (
            <button type="button" onClick={onRefreshDrafts} disabled={disabled || isLoading || isStaleAnchor} style={smallButtonStyle({ filled: true, disabled: disabled || isLoading || isStaleAnchor })}>
              {isLoading && loadingPhase === 'refreshing_drafts' ? 'Refreshing...' : 'Refresh Drafts'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ZipCampaignCard({
  group,
  actionLoading,
  onRequestApprove,
  onReject,
  onPatched,
  onCopyManual,
  onIncludeInCanary,
  onGenerateCreative,
  onRegenerateCreative,
  onRefreshDrafts,
  zipLoadingState,
  zipError,
}) {
  const isOther = group.zip === 'other'
  const loadingPhase = zipLoadingState || 'idle'
  const isLoading = ['generating', 'regenerating', 'refreshing_drafts'].includes(loadingPhase)
  const canRefreshDrafts = !isOther && (group.needsRefresh || (group.creativeStatus === 'creative_current' && group.hasFacebookDraftWithoutCreative))
  const place = [group.city, group.county, group.state].filter(Boolean).join(', ')

  return (
    <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '16px', marginBottom: '14px', background: '#021a0e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '5px' }}>
            <h3 style={{ fontSize: '13px', color: '#e0ffe0', margin: 0, fontWeight: 600 }}>
              {isOther ? 'Other drafts' : `ZIP ${group.zip}`}
            </h3>
            {!isOther && statusPillFor(group.zipStatus)}
            {!isOther && statusPillFor(group.creativeStatus, { compact: true })}
          </div>
          <div style={{ color: '#4a7a5a', fontSize: '11px', fontFamily: MONO_FONT }}>
            {place || (isOther ? 'No ZIP detected' : 'Place metadata not available')} | {group.campaigns.length} draft{group.campaigns.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {!isOther && (
        <div style={{ marginBottom: '14px' }}>
          <CreativePreviewBlock
            zip={group.zip}
            creativeMetadata={group.creativeMetadata}
            creativeStatus={group.creativeStatus}
            zipStatus={group.zipStatus}
            isLoading={isLoading}
            loadingPhase={loadingPhase}
            onGenerateCreative={() => onGenerateCreative(group.zip)}
            onRegenerateCreative={() => onRegenerateCreative(group.zip)}
            onRefreshDrafts={() => onRefreshDrafts(group.zip)}
            canRefreshDrafts={canRefreshDrafts}
            disabled={!HAS_MARKETING_ADMIN_KEY}
            errorDetail={zipError}
          />
          {group.zipStatus === 'needs_creative_review' && group.campaigns.length > 1 && (
            <div style={{ color: '#ffd54f', fontSize: '11px', marginTop: '8px' }}>
              {group.campaigns.length} drafts at this ZIP await creative generation or refresh.
            </div>
          )}
        </div>
      )}

      <div>
        {group.campaigns.map(campaign => (
          <CampaignCard
            key={campaign.campaign_id}
            campaign={campaign}
            onRequestApprove={onRequestApprove}
            onReject={onReject}
            onPatched={onPatched}
            onCopyManual={onCopyManual}
            onIncludeInCanary={onIncludeInCanary}
            actionLoading={actionLoading}
            embedded
          />
        ))}
      </div>
    </div>
  )
}

export default function CampaignDashboard() {
  const [pending, setPending] = useState([])
  const [published, setPublished] = useState([])
  const [canaryJobs, setCanaryJobs] = useState([])
  const [activeChannel, setActiveChannel] = useState('all')
  const [canaryZip, setCanaryZip] = useState(DEFAULT_CANARY_ZIP)
  const [selectedAnchorId, setSelectedAnchorId] = useState('')
  const [targetGroups, setTargetGroups] = useState([{ ...EMPTY_TARGET_GROUP }])
  const [canarySourceCampaign, setCanarySourceCampaign] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [actionLoading, setActionLoading] = useState(null)
  const [actionSuccess, setActionSuccess] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [canaryLoading, setCanaryLoading] = useState(false)
  const [canaryCreating, setCanaryCreating] = useState(false)
  const [copyLoading, setCopyLoading] = useState(null)
  const [pendingConfirm, setPendingConfirm] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [expandedThumbId, setExpandedThumbId] = useState(null)
  const [zipCreativeOverrides, setZipCreativeOverrides] = useState({})
  const [zipLoading, setZipLoading] = useState({})
  const [zipErrors, setZipErrors] = useState({})
  const intervalRef = useRef(null)

  const allCampaigns = useMemo(() => [...pending, ...published], [pending, published])
  const zipOptions = useMemo(() => {
    const zips = new Set([DEFAULT_CANARY_ZIP])
    allCampaigns.forEach(c => {
      const zip = extractZipFromCampaign(c)
      if (zip) zips.add(zip)
    })
    if (canaryZip) zips.add(canaryZip)
    return [...zips].sort()
  }, [allCampaigns, canaryZip])

  const pageAnchors = useMemo(() => (
    published.filter(c => (
      extractZipFromCampaign(c) === canaryZip
      && c.channel === 'facebook_page'
      && c.status === 'published'
      && String(c.channel_label || '').toLowerCase().includes('anymal os facebook')
    ))
  ), [published, canaryZip])

  const selectedAnchor = useMemo(() => (
    pageAnchors.find(c => c.campaign_id === selectedAnchorId) || pageAnchors[0] || null
  ), [pageAnchors, selectedAnchorId])

  const pendingZipGroups = useMemo(() => (
    buildZipGroups(pending, zipCreativeOverrides)
  ), [pending, zipCreativeOverrides])

  useEffect(() => {
    if (!selectedAnchorId && pageAnchors[0]) {
      setSelectedAnchorId(pageAnchors[0].campaign_id)
      return
    }
    if (selectedAnchorId && !pageAnchors.some(c => c.campaign_id === selectedAnchorId)) {
      setSelectedAnchorId(pageAnchors[0]?.campaign_id || '')
    }
  }, [pageAnchors, selectedAnchorId])

  const fetchData = useCallback(async () => {
    setLastRefresh(new Date())
    setCountdown(REFRESH_INTERVAL)
    let pendingDrafts = []
    let reviewDrafts = []
    try {
      const channelParam = activeChannel !== 'all' ? `?channel=${activeChannel}` : ''
      const res = await fetch(`${MARKETING_API}/campaigns/pending/by-channel${channelParam}`, { headers })
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      pendingDrafts = json.campaigns || []
    } catch (err) {
      console.error('Failed to fetch pending:', err)
    }
    try {
      const reviewStatuses = ['needs_creative_review', 'needs_review_stale_anchor']
      const responses = await Promise.all(reviewStatuses.map(status =>
        fetch(`${MARKETING_API}/campaigns?status=${status}&limit=50`, { headers })
      ))
      const bodies = await Promise.all(responses.map(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json()
      }))
      reviewDrafts = bodies.flatMap(body => body.campaigns || [])
      if (activeChannel !== 'all') {
        reviewDrafts = reviewDrafts.filter(c => c.channel === activeChannel)
      }
    } catch (err) {
      console.error('Failed to fetch review drafts:', err)
    }
    setPending(mergeCampaigns(pendingDrafts, reviewDrafts))
    try {
      const res2 = await fetch(`${MARKETING_API}/campaigns?status=published&limit=50`, { headers })
      if (!res2.ok) throw new Error(`${res2.status}`)
      const json2 = await res2.json()
      setPublished(json2.campaigns || [])
    } catch (err) {
      console.error('Failed to fetch published:', err)
    }
    if (HAS_MARKETING_ADMIN_KEY) {
      setCanaryLoading(true)
      try {
        const res3 = await fetch(`${MARKETING_API}/campaigns/zip-canary/jobs?limit=20`, { headers: adminHeaders })
        if (!res3.ok) throw new Error(`${res3.status}`)
        const json3 = await res3.json()
        setCanaryJobs(json3.jobs || [])
      } catch (err) {
        console.error('Failed to fetch canary jobs:', err)
      } finally {
        setCanaryLoading(false)
      }
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

  const handleRequestApprove = (campaign) => {
    setActionError(null)
    setPendingConfirm(campaign)
  }

  const handleConfirmPublish = async () => {
    if (!pendingConfirm) return
    const campaignId = pendingConfirm.campaign_id
    setConfirmLoading(true)
    setActionLoading(campaignId)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/${campaignId}/approve`, { method: 'POST', headers })
      if (!res.ok) {
        let detail = `${res.status}`
        try {
          const body = await res.json()
          if (body?.detail) detail = body.detail
        } catch { /* no-op */ }
        throw new Error(detail)
      }
      setActionSuccess(`Published: ${campaignId}`)
      setTimeout(() => setActionSuccess(null), 4000)
      setPendingConfirm(null)
      await fetchData()
    } catch (err) {
      setActionError(`Approve failed: ${err.message}`)
      throw err
    } finally {
      setConfirmLoading(false)
      setActionLoading(null)
    }
  }

  const handleCancelConfirm = () => {
    if (confirmLoading) return
    setPendingConfirm(null)
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

  const callAdminPost = async (path) => {
    const res = await fetch(`${MARKETING_API}${path}`, { method: 'POST', headers: adminHeaders })
    if (!res.ok) {
      const parsed = await readApiError(res)
      const err = new Error(parsed.message)
      err.detail = parsed.detail
      throw err
    }
    return res.json()
  }

  const setZipLoadingPhase = (zip, phase) => {
    setZipLoading(map => ({ ...map, [zip]: phase }))
  }

  const clearZipLoadingPhase = (zip) => {
    setZipLoading(map => {
      const next = { ...map }
      delete next[zip]
      return next
    })
  }

  const handleGenerateCreative = async (zip, { force = false } = {}) => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Creative generation requires VITE_MARKETING_ADMIN_KEY.')
      return
    }
    const phase = force ? 'regenerating' : 'generating'
    setZipLoadingPhase(zip, phase)
    setActionError(null)
    setZipErrors(errors => {
      const next = { ...errors }
      delete next[zip]
      return next
    })
    try {
      const suffix = force ? '&force_regenerate=true' : ''
      const asset = await callAdminPost(`/campaigns/creative/generate?zip=${zip}&template_id=${CREATIVE_TEMPLATE_ID}${suffix}`)
      const creativeMetadata = creativeMetadataFromAsset(asset)
      setZipCreativeOverrides(map => ({
        ...map,
        [zip]: {
          creativeMetadata,
          creativeStatus: creativeMetadata?.creative_status || 'creative_current',
          needsRefresh: true,
        },
      }))
      setActionSuccess(`Creative ready for ZIP ${zip}. Refresh drafts to attach it.`)
      setTimeout(() => setActionSuccess(null), 5000)
    } catch (err) {
      setZipErrors(errors => ({ ...errors, [zip]: err.detail || { error: err.message } }))
      setActionError(`Creative generation failed for ZIP ${zip}: ${err.message}`)
    } finally {
      clearZipLoadingPhase(zip)
    }
  }

  const handleRefreshZipDrafts = async (zip) => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Draft refresh requires VITE_MARKETING_ADMIN_KEY.')
      return
    }
    setZipLoadingPhase(zip, 'refreshing_drafts')
    setActionError(null)
    try {
      const body = await callAdminPost(`/campaigns/zip-local/generate?zip=${zip}`)
      const updatedCount = Array.isArray(body.creative_updated_draft_ids)
        ? body.creative_updated_draft_ids.length
        : 0
      if (body.creative_metadata) {
        setZipCreativeOverrides(map => ({
          ...map,
          [zip]: {
            creativeMetadata: body.creative_metadata,
            creativeStatus: body.creative_status || body.creative_metadata.creative_status,
            needsRefresh: false,
          },
        }))
      }
      setActionSuccess(updatedCount > 0
        ? `${updatedCount} drafts updated with creative metadata for ZIP ${zip}.`
        : `Drafts refreshed for ZIP ${zip}.`
      )
      setTimeout(() => setActionSuccess(null), 5000)
      await fetchData()
    } catch (err) {
      setZipErrors(errors => ({ ...errors, [zip]: err.detail || { error: err.message } }))
      setActionError(`Draft refresh failed for ZIP ${zip}: ${err.message}`)
    } finally {
      clearZipLoadingPhase(zip)
    }
  }

  const handleTargetGroupChange = (index, field, value) => {
    setTargetGroups(groups => groups.map((group, i) => {
      if (i !== index) return group
      const next = { ...group, [field]: value }
      if (field === 'group_name' && !group.utm_content) {
        const content = makeUtmContent(canaryZip, value)
        next.utm_content = content
        next.utm_url = buildGroupUtmUrl(canaryZip, content)
      }
      if (field === 'utm_content') {
        next.utm_url = value ? buildGroupUtmUrl(canaryZip, value) : ''
      }
      return next
    }))
  }

  const handleAddTargetGroup = () => {
    setTargetGroups(groups => [...groups, { ...EMPTY_TARGET_GROUP }])
  }

  const handleRemoveTargetGroup = (index) => {
    setTargetGroups(groups => groups.length <= 1 ? groups : groups.filter((_, i) => i !== index))
  }

  const handleGenerateGroupCopy = async (index) => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Canary copy generation requires VITE_MARKETING_ADMIN_KEY.')
      return
    }
    const group = targetGroups[index]
    const groupName = group.group_name.trim()
    if (!groupName) {
      setActionError('Group name is required before generating copy.')
      return
    }
    const utmContent = group.utm_content || makeUtmContent(canaryZip, groupName)
    setCopyLoading(index)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/zip-local/group-copy`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          zip: canaryZip,
          group_name: groupName,
          group_focus: group.group_focus || undefined,
          member_count_band: group.member_count_band || undefined,
          utm_content: utmContent,
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const body = await res.json()
      setTargetGroups(groups => groups.map((item, i) => (
        i === index
          ? {
              ...item,
              post_text: body.post_text || '',
              utm_url: body.utm_url || buildGroupUtmUrl(canaryZip, utmContent),
              utm_content: body.utm_content || utmContent,
              risk_notes: body.risk_notes || [],
              remove_link_preview: true,
            }
          : item
      )))
      setActionSuccess(`Generated group copy: ${groupName}`)
      setTimeout(() => setActionSuccess(null), 4000)
    } catch (err) {
      setActionError(`Group copy failed: ${err.message}`)
    } finally {
      setCopyLoading(null)
    }
  }

  const buildTargetGroupPayloads = () => targetGroups
    .map(group => {
      const groupName = group.group_name.trim()
      if (!groupName || !group.group_url.trim() || !group.post_text.trim()) return null
      const utmContent = group.utm_content || makeUtmContent(canaryZip, groupName)
      const utmUrl = group.utm_url || buildGroupUtmUrl(canaryZip, utmContent)
      return {
        group_name: groupName,
        group_url: group.group_url.trim(),
        public_private: group.public_private || 'unknown',
        member_count: group.member_count || null,
        member_count_band: group.member_count_band || 'unknown',
        group_focus: group.group_focus || null,
        post_text: group.post_text.trim(),
        utm_content: utmContent,
        utm_url: utmUrl,
        remove_link_preview: true,
      }
    })
    .filter(Boolean)

  const handleCreateCanaryJob = async () => {
    if (!HAS_MARKETING_ADMIN_KEY) {
      setActionError('Canary job creation requires VITE_MARKETING_ADMIN_KEY.')
      return
    }
    if (!selectedAnchor) {
      setActionError('Publish the Anymal OS Facebook Page anchor before creating the canary job.')
      return
    }
    const anchorUrl = postedUrlForCampaign(selectedAnchor)
    if (!anchorUrl) {
      setActionError('Selected Page anchor is missing a Facebook post URL.')
      return
    }
    const targetPayloads = buildTargetGroupPayloads()
    if (targetPayloads.length === 0) {
      setActionError('At least one target group needs a URL and approved post text.')
      return
    }
    setCanaryCreating(true)
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/zip-canary/jobs`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          zip: canaryZip,
          city: selectedAnchor.city || '',
          state: selectedAnchor.state || '',
          county: selectedAnchor.county || '',
          campaign_goal: 'zip_subscription',
          status: 'approved_for_execution',
          page_anchor: {
            campaign_id: selectedAnchor.campaign_id,
            facebook_post_url: anchorUrl,
            status: 'published',
          },
          target_groups: targetPayloads,
          cooldown_seconds_between_posts: 120,
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const job = await res.json()
      setActionSuccess(`Canary job approved: ${job.job_id}`)
      setTimeout(() => setActionSuccess(null), 5000)
      setTargetGroups([{ ...EMPTY_TARGET_GROUP }])
      setCanarySourceCampaign(null)
      await fetchData()
    } catch (err) {
      setActionError(`Canary job failed: ${err.message}`)
    } finally {
      setCanaryCreating(false)
    }
  }

  const handleCancelCanaryJob = async (jobId) => {
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/zip-canary/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ cancelled_by: 'carlos' }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      setActionSuccess(`Cancelled: ${jobId}`)
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchData()
    } catch (err) {
      setActionError(`Cancel failed: ${err.message}`)
    }
  }

  const handleResetCanaryJob = async (jobId) => {
    setActionError(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/zip-canary/jobs/${jobId}/reset`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ reset_by: 'carlos' }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      setActionSuccess(`Reset: ${jobId}`)
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchData()
    } catch (err) {
      setActionError(`Reset failed: ${err.message}`)
    }
  }

  const handleMarkReviewed = async (job, group) => {
    setActionError(null)
    try {
      const reviewedAt = new Date().toISOString()
      const res = await fetch(`${MARKETING_API}/campaigns/zip-canary/jobs/${job.job_id}/group-result`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          group_id: group.group_id,
          status: 'submitted_unverified',
          posted_as: group.posted_as || 'Carlos Herrera',
          posted_at: group.posted_at || reviewedAt,
          observed_text_excerpt: group.observed_text_excerpt || '',
          facebook_post_url: group.facebook_post_url || null,
          notes: `${group.notes || ''}${group.notes ? ' | ' : ''}Reviewed in dashboard at ${reviewedAt}`,
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      setActionSuccess(`Reviewed: ${group.group_name}`)
      setTimeout(() => setActionSuccess(null), 4000)
      await fetchData()
    } catch (err) {
      setActionError(`Review marker failed: ${err.message}`)
    }
  }

  const handleCopyManual = async (campaign) => {
    const text = campaign.message || campaign.generated_copy || ''
    try {
      await navigator.clipboard.writeText(text)
      setActionSuccess(`Copied: ${campaign.campaign_id}`)
      setTimeout(() => setActionSuccess(null), 4000)
    } catch (err) {
      setActionError(`Copy failed: ${err.message}`)
    }
  }

  const handleIncludeInCanary = (campaign) => {
    const text = campaign.message || campaign.generated_copy || ''
    const zip = extractZipFromCampaign(campaign) || canaryZip
    const rawUrl = findAnymalUrl(text)
    let utmContent = ''
    if (rawUrl) {
      try {
        utmContent = new URL(rawUrl).searchParams.get('utm_content') || ''
      } catch { /* no-op */ }
    }
    setCanaryZip(zip)
    setCanarySourceCampaign(campaign)
    setTargetGroups(groups => {
      const next = groups.length ? [...groups] : [{ ...EMPTY_TARGET_GROUP }]
      next[0] = {
        ...next[0],
        post_text: text,
        utm_content: next[0].utm_content || utmContent,
        utm_url: next[0].utm_url || rawUrl || '',
        remove_link_preview: true,
      }
      return next
    })
    setActionSuccess(`Included in canary builder: ${campaign.campaign_id}`)
    setTimeout(() => setActionSuccess(null), 4000)
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

      <LaunchZipCanaryPanel
        zipOptions={zipOptions}
        canaryZip={canaryZip}
        setCanaryZip={setCanaryZip}
        pageAnchors={pageAnchors}
        selectedAnchorId={selectedAnchorId}
        setSelectedAnchorId={setSelectedAnchorId}
        selectedAnchor={selectedAnchor}
        targetGroups={targetGroups}
        onTargetGroupChange={handleTargetGroupChange}
        onAddTargetGroup={handleAddTargetGroup}
        onRemoveTargetGroup={handleRemoveTargetGroup}
        onGenerateGroupCopy={handleGenerateGroupCopy}
        onCreateJob={handleCreateCanaryJob}
        copyLoading={copyLoading}
        canaryCreating={canaryCreating}
        canaryJobs={canaryJobs}
        canaryLoading={canaryLoading}
        onCancelJob={handleCancelCanaryJob}
        onResetJob={handleResetCanaryJob}
        onMarkReviewed={handleMarkReviewed}
        canarySourceCampaign={canarySourceCampaign}
      />

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
          pendingZipGroups.map(group => (
            <ZipCampaignCard
              key={group.zip}
              group={group}
              onRequestApprove={handleRequestApprove}
              onReject={handleReject}
              onPatched={handlePatched}
              onCopyManual={handleCopyManual}
              onIncludeInCanary={handleIncludeInCanary}
              onGenerateCreative={(zip) => handleGenerateCreative(zip)}
              onRegenerateCreative={(zip) => handleGenerateCreative(zip, { force: true })}
              onRefreshDrafts={handleRefreshZipDrafts}
              actionLoading={actionLoading}
              zipLoadingState={zipLoading[group.zip]}
              zipError={zipErrors[group.zip]}
            />
          ))
        )}
      </div>

      <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '16px' }}>
        <h2 style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e676', margin: '0 0 12px 0' }}>
          Recently Published ({published.length})
        </h2>
        {published.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#4a7a5a' }}>
            No posts published yet. Approve a draft to ship your first post.
          </p>
        ) : (
          published.map(c => (
            <PublishedCard
              key={c.campaign_id}
              campaign={c}
              expanded={expandedThumbId === c.campaign_id}
              onToggleExpanded={() =>
                setExpandedThumbId(id => (id === c.campaign_id ? null : c.campaign_id))
              }
            />
          ))
        )}
      </div>
      {pendingConfirm && (
        <ApproveConfirmModal
          campaign={pendingConfirm}
          onConfirm={handleConfirmPublish}
          onCancel={handleCancelConfirm}
          loading={confirmLoading}
        />
      )}
    </div>
  )
}
