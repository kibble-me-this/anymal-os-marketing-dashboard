import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HAS_MARKETING_ADMIN_KEY, MARKETING_API, headers } from '../../config'
import ReplyTargetContext from '../ReplyTargetContext'
import { campaignFreshnessGate, freshnessLabel, freshnessTone, freshnessTooltip, requiresFreshnessAcknowledgment } from './freshness'

const CHANNEL_COLORS = {
  facebook_page: '#1877F2',
  anymal_linkedin: '#0A66C2',
  personal_linkedin: '#0A66C2',
  anymal_x: '#000000',
  personal_x: '#657786',
  facebook_reply: '#1877F2',
}

const LINKEDIN_CHANNELS = new Set(['anymal_linkedin', 'personal_linkedin'])
const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const URL_PATTERN = /https?:\/\/world\.anymalos\.com\/[^\s)]*/
const CREATIVE_TEMPLATE_ID = 'city_price_launch_v1'

function findAnymalUrl(message) {
  if (!message) return null
  const match = message.match(URL_PATTERN)
  return match ? match[0] : null
}

function extractDestinationFromMessage(message) {
  const raw = findAnymalUrl(message)
  if (!raw) return { kind: '/price', customPath: '' }
  try {
    const url = new URL(raw)
    if (url.pathname === '/price') return { kind: '/price', customPath: '' }
    if (url.pathname === '/live') return { kind: '/live', customPath: '' }
    return { kind: 'custom', customPath: url.pathname + url.search }
  } catch {
    return { kind: '/price', customPath: '' }
  }
}

function extractUtmCampaignFromMessage(message) {
  const raw = findAnymalUrl(message)
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.searchParams.get('utm_campaign') || ''
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
      incoming.forEach((value, key) => url.searchParams.set(key, value))
    }
  }

  if (utmCampaign !== undefined) {
    if (utmCampaign === '') url.searchParams.delete('utm_campaign')
    else url.searchParams.set('utm_campaign', utmCampaign)
  }

  return message.replace(raw, url.toString())
}

function canApproveCampaign(campaign) {
  return !(campaign.manual_only || campaign.should_approve_in_dashboard === false)
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

function freshnessPillFor(campaign, { compact = false } = {}) {
  const gate = campaignFreshnessGate(campaign)
  if (!gate) return null
  return (
    <span
      title={freshnessTooltip(gate)}
      style={{ ...pillStyle(freshnessTone(gate)), fontSize: compact ? '9px' : '10px' }}
    >
      {freshnessLabel(gate)}
    </span>
  )
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

function EmptyState({ title, detail }) {
  return (
    <div style={{ border: '1px dashed #1a3a2a', borderRadius: '6px', padding: '28px', textAlign: 'center', color: '#4a7a5a', background: '#031808' }}>
      <div style={{ color: '#c0e0c0', fontSize: '14px', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '12px', lineHeight: 1.45 }}>{detail}</div>
    </div>
  )
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
  const isLinkedInChannel = LINKEDIN_CHANNELS.has(campaign.channel)
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

  const pickFile = async (event) => {
    setImageError(null)
    const file = event.target.files && event.target.files[0]
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
        <textarea ref={textareaRef} value={message} onChange={(event) => setMessage(event.target.value)} onInput={autoSize} style={{ width: '100%', minHeight: `${8 * 22}px`, background: '#04200e', border: '1px solid #1a3a2a', borderRadius: '4px', padding: '10px 12px', color: '#e0ffe0', fontFamily: MONO_FONT, fontSize: '13px', lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div>
        <div style={labelStyle}>Destination</div>
        <div style={radioRowStyle}>
          <button type="button" onClick={() => setDestinationKind('/price')} style={radioPill(destinationKind === '/price')}>/price</button>
          <button type="button" onClick={() => setDestinationKind('/live')} style={radioPill(destinationKind === '/live')}>/live</button>
          <button type="button" onClick={() => setDestinationKind('custom')} style={radioPill(destinationKind === 'custom')}>Custom</button>
        </div>
        {destinationKind === 'custom' && (
          <input type="text" value={customPath} onChange={(event) => setCustomPath(event.target.value)} placeholder="/custom-path?foo=bar" style={{ ...textInputStyle, marginTop: '8px' }} />
        )}
      </div>

      <div>
        <div style={labelStyle}>UTM Campaign</div>
        <input type="text" value={utmCampaign} onChange={(event) => setUtmCampaign(event.target.value)} placeholder="e.g. ai_holland_feb" style={textInputStyle} />
      </div>

      <div>
        <div style={labelStyle}>Image</div>
        {isLinkedInChannel && (
          <div style={{ background: '#0a2238', border: '1px solid #0A66C2', borderRadius: '4px', padding: '8px 10px', color: '#b7d8ff', fontSize: '11px', lineHeight: 1.45, marginBottom: '8px', fontFamily: SANS_FONT }}>
            LinkedIn publish ignores attached images. Post will be text-only until image support ships.
          </div>
        )}
        {previewImageSrc ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
            <img src={previewImageSrc} alt="campaign chart" style={{ width: '200px', height: 'auto', border: '1px solid #1a3a2a', borderRadius: '4px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button type="button" onClick={removeImage} style={{ background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '4px', padding: '4px 10px', fontSize: '10px', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Remove image</button>
              {newImage !== null && campaign.chart_base64 && (
                <button type="button" onClick={keepExistingImage} style={{ background: 'transparent', color: '#00e676', border: '1px solid #1a3a2a', borderRadius: '4px', padding: '4px 10px', fontSize: '10px', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Revert</button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: '#4a7a5a', marginBottom: '8px', fontFamily: SANS_FONT }}>No image attached.</div>
        )}
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" onChange={pickFile} style={{ fontSize: '11px', color: '#c0e0c0', fontFamily: SANS_FONT }} />
        {imageError && <div style={{ color: '#ff4444', fontSize: '11px', marginTop: '6px', fontFamily: SANS_FONT }}>{imageError}</div>}
      </div>

      {saveError && (
        <div style={{ background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '4px', padding: '8px 12px', fontSize: '12px', color: '#ff4444', fontFamily: SANS_FONT }}>{saveError}</div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: saving ? '#1a3a2a' : '#00e676', color: '#021a0e', border: 'none', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT, fontWeight: 600 }}>{saving ? 'Saving...' : 'Save'}</button>
        <button type="button" onClick={onCancel} disabled={saving} style={{ padding: '8px 20px', background: 'transparent', color: '#ffffff', border: '1px solid #ffffff', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT }}>Cancel</button>
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
  const firstLine = campaign.generated_copy ? campaign.generated_copy.split('\n').find(line => line.trim()) || '' : campaign.barn_name || campaign.topic_title || campaign.campaign_id
  const displayTitle = firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine
  const channelColor = CHANNEL_COLORS[campaign.channel] || '#00e676'
  const isLoading = actionLoading === campaign.campaign_id
  const isManualOnly = !canApproveCampaign(campaign)
  const needsFreshnessAck = requiresFreshnessAcknowledgment(campaign)

  const handleSaved = (patch) => {
    onPatched(campaign.campaign_id, patch)
    setEditing(false)
  }

  return (
    <div style={{ border: embedded ? 'none' : '1px solid #1a3a2a', borderTop: embedded ? '1px solid #0a2a1a' : '1px solid #1a3a2a', borderRadius: embedded ? 0 : '6px', padding: embedded ? '14px 0 0 0' : '16px', marginBottom: embedded ? '14px' : '12px', background: embedded ? 'transparent' : '#021a0e' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: '500', fontSize: '14px', color: '#e0ffe0', margin: '0 0 4px 0', lineHeight: 1.4 }}>{displayTitle}</p>
          {(campaign.topic_title || campaign.topic_source) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: '#4a7a5a' }}>via {campaign.topic_source || 'research agent'}</span>
              {campaign.url && (
                <a href={campaign.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#00e676', textDecoration: 'none' }}>
                  {campaign.topic_title ? campaign.topic_title.slice(0, 70) + (campaign.topic_title.length > 70 ? '...' : '') : 'view source'}
                </a>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: '#0a2a1a', color: channelColor, border: `1px solid ${channelColor}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{campaign.channel_label || campaign.channel}</span>
            {campaign.topic_angle && <span style={{ fontSize: '10px', color: '#4a7a5a' }}>{campaign.topic_angle}</span>}
            <span style={{ fontSize: '10px', color: '#4a7a5a' }}>{formatDate(campaign.created_at)}</span>
            {campaign.updated_at && <span style={{ fontSize: '10px', color: '#00e676' }}>edited {formatDate(campaign.updated_at)}</span>}
            {freshnessPillFor(campaign)}
            {needsFreshnessAck && <span style={pillStyle('#ffd54f')}>Ack Required</span>}
          </div>
        </div>
      </div>

      {campaign.channel === 'facebook_reply' && <ReplyTargetContext campaign={campaign} expanded={false} />}

      {!editing && (
        <div style={{ background: '#031808', border: '1px solid #0a2a1a', borderRadius: '4px', padding: '12px', marginBottom: '12px', fontSize: '13px', color: '#c0e0c0', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: MONO_FONT }}>{campaign.message || campaign.generated_copy}</div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setEditing(value => !value)} disabled={isLoading} style={{ padding: '8px 20px', background: editing ? '#0a2a1a' : 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: isLoading ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT }}>{editing ? 'Close' : 'Edit'}</button>
        {isManualOnly ? (
          <>
            <button type="button" onClick={() => onCopyManual(campaign)} disabled={isLoading || editing} style={{ padding: '8px 20px', background: 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (isLoading || editing) ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT }}>Copy</button>
            <button type="button" onClick={() => onIncludeInCanary(campaign)} disabled={isLoading || editing} style={{ padding: '8px 20px', background: (isLoading || editing) ? '#1a3a2a' : '#00e676', color: '#021a0e', border: 'none', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (isLoading || editing) ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT, fontWeight: '600' }}>Include in Canary Job</button>
          </>
        ) : (
          <button type="button" onClick={() => onRequestApprove(campaign)} disabled={isLoading || editing} style={{ padding: '8px 20px', background: (isLoading || editing) ? '#1a3a2a' : needsFreshnessAck ? '#ffd54f' : '#00e676', color: '#021a0e', border: 'none', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (isLoading || editing) ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT, fontWeight: '600' }}>{isLoading ? 'Publishing...' : needsFreshnessAck ? 'Review Freshness' : 'Approve'}</button>
        )}
        <button type="button" onClick={() => onReject(campaign.campaign_id)} disabled={isLoading || editing} style={{ padding: '8px 20px', background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (isLoading || editing) ? 'not-allowed' : 'pointer', fontFamily: SANS_FONT }}>Reject</button>
      </div>

      {editing && <InlineEditor campaign={campaign} onSaved={handleSaved} onCancel={() => setEditing(false)} />}
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
            <img src={imageUrl} alt={`Creative preview for ZIP ${zip}`} style={{ width: '100%', aspectRatio: '600 / 315', objectFit: 'cover', border: '1px solid #1a3a2a', borderRadius: '4px', display: 'block' }} />
          </a>
        ) : (
          <div style={{ width: '100%', aspectRatio: '600 / 315', border: '1px dashed #1a3a2a', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a7a5a', fontSize: '11px', fontFamily: MONO_FONT, textAlign: 'center', padding: '12px', boxSizing: 'border-box' }}>No creative generated yet</div>
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
        {isStaleAnchor && <div style={{ background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '4px', padding: '8px 10px', color: '#ffb3b3', fontSize: '11px', lineHeight: 1.45, marginBottom: '10px' }}>Stale market anchor. {errorDetail?.anchor_name ? `${errorDetail.anchor_name} is not fresh enough for generation.` : 'Fresh evidence is required before publishing.'}</div>}
        {isMissing && !isStaleAnchor && <div style={{ background: '#2a230a', border: '1px solid #ffd54f', borderRadius: '4px', padding: '8px 10px', color: '#ffe58a', fontSize: '11px', lineHeight: 1.45, marginBottom: '10px' }}>Creative missing. Generate one branded image for this ZIP, then refresh drafts to attach it.</div>}
        {isBrandStale && <div style={{ background: '#2a230a', border: '1px solid #ffd54f', borderRadius: '4px', padding: '8px 10px', color: '#ffe58a', fontSize: '11px', lineHeight: 1.45, marginBottom: '10px' }}>Brand version stale: {creativeMetadata.brand_version_stale}. Regenerate before publishing.</div>}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {creativeStatus === 'creative_missing' ? (
            <button type="button" onClick={onGenerateCreative} disabled={disabled || isLoading || isStaleAnchor} style={smallButtonStyle({ filled: true, disabled: disabled || isLoading || isStaleAnchor })}>{isLoading && loadingPhase === 'generating' ? 'Generating...' : 'Generate Creative'}</button>
          ) : (
            <button type="button" onClick={onRegenerateCreative} disabled={disabled || isLoading || isStaleAnchor} style={smallButtonStyle({ disabled: disabled || isLoading || isStaleAnchor })}>{isLoading && loadingPhase === 'regenerating' ? 'Regenerating...' : 'Regenerate Creative'}</button>
          )}
          {canRefreshDrafts && (
            <button type="button" onClick={onRefreshDrafts} disabled={disabled || isLoading || isStaleAnchor} style={smallButtonStyle({ filled: true, disabled: disabled || isLoading || isStaleAnchor })}>{isLoading && loadingPhase === 'refreshing_drafts' ? 'Refreshing...' : 'Refresh Drafts'}</button>
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
  const needsCreativeReview = group.zipStatus === 'needs_creative_review'
  const creativeReady = group.creativeStatus === 'creative_current'
  const freshnessGate = group.campaigns.map(campaign => campaignFreshnessGate(campaign)).find(Boolean)
  const helperMessage = needsCreativeReview && group.campaigns.length > 1
    ? creativeReady
      ? `${group.campaigns.length} drafts at this ZIP are ready for copy and Page-anchor review.`
      : `${group.campaigns.length} drafts at this ZIP await creative generation or refresh.`
    : ''

  return (
    <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '16px', marginBottom: '14px', background: '#021a0e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '5px' }}>
            <h3 style={{ fontSize: '13px', color: '#e0ffe0', margin: 0, fontWeight: 600 }}>{isOther ? 'Other drafts' : `ZIP ${group.zip}`}</h3>
            {!isOther && statusPillFor(group.zipStatus)}
            {!isOther && statusPillFor(group.creativeStatus, { compact: true })}
            {!isOther && freshnessGate && (
              <span title={freshnessTooltip(freshnessGate)} style={{ ...pillStyle(freshnessTone(freshnessGate)), fontSize: '9px' }}>
                {freshnessLabel(freshnessGate)}
              </span>
            )}
          </div>
          <div style={{ color: '#4a7a5a', fontSize: '11px', fontFamily: MONO_FONT }}>{place || (isOther ? 'No ZIP detected' : 'Place metadata not available')} | {group.campaigns.length} draft{group.campaigns.length === 1 ? '' : 's'}</div>
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
          {helperMessage && (
            <div style={{ color: creativeReady ? '#8abf8a' : '#ffd54f', fontSize: '11px', marginTop: '8px' }}>
              {helperMessage}
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

function ZipQueueRail({ groups, selectedZip, onSelectZip }) {
  const queueCount = groups.filter(group => group.zip !== 'other').length
  return (
    <aside style={{ border: '1px solid #1a3a2a', borderRadius: '8px', background: '#031808', padding: '12px', alignSelf: 'start' }}>
      <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4a7a5a', marginBottom: '10px', fontFamily: SANS_FONT }}>ZIP queues</div>
      <button type="button" onClick={() => onSelectZip('all')} style={{ width: '100%', textAlign: 'left', border: `1px solid ${selectedZip === 'all' ? '#00e676' : '#1a3a2a'}`, borderRadius: '6px', background: selectedZip === 'all' ? '#0a2a1a' : '#021a0e', color: '#e0ffe0', padding: '10px', cursor: 'pointer', marginBottom: '8px', fontFamily: SANS_FONT }}>
        <div style={{ fontSize: '12px', fontWeight: 700 }}>All queues</div>
        <div style={{ fontSize: '10px', color: '#4a7a5a', marginTop: '3px' }}>{queueCount} ZIP queues</div>
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '58vh', overflow: 'auto', paddingRight: '2px' }}>
        {groups.map(group => {
          const active = selectedZip === group.zip
          const place = [group.city, group.county, group.state].filter(Boolean).join(', ')
          const blocked = group.zipStatus === 'needs_review_stale_anchor'
          const needsCreative = group.zipStatus === 'needs_creative_review' || group.creativeStatus === 'creative_missing'
          const attention = blocked ? 'Blocked' : needsCreative ? 'Needs creative' : ''
          const freshnessGate = group.campaigns.map(campaign => campaignFreshnessGate(campaign)).find(Boolean)
          return (
            <button key={group.zip} type="button" onClick={() => onSelectZip(group.zip)} style={{ width: '100%', textAlign: 'left', border: `1px solid ${active ? '#00e676' : blocked ? '#ff4444' : '#1a3a2a'}`, borderRadius: '6px', background: active ? '#0a2a1a' : '#021a0e', color: '#e0ffe0', padding: '10px', cursor: 'pointer', fontFamily: SANS_FONT }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>{group.zip === 'other' ? 'Other' : group.zip}</span>
                <span style={{ fontSize: '10px', color: '#8abf8a' }}>{group.campaigns.length}</span>
              </div>
              <div style={{ fontSize: '10px', color: '#4a7a5a', margin: '4px 0 7px 0', lineHeight: 1.3 }}>{place || 'Place pending'}</div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {statusPillFor(group.zipStatus, { compact: true })}
                {statusPillFor(group.creativeStatus, { compact: true })}
                {freshnessGate && (
                  <span title={freshnessTooltip(freshnessGate)} style={{ ...pillStyle(freshnessTone(freshnessGate)), fontSize: '9px' }}>
                    {freshnessLabel(freshnessGate)}
                  </span>
                )}
                {attention && <span style={pillStyle(blocked ? '#ff4444' : '#ffd54f')}>{attention}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function ChannelFilters({ channels, activeChannel, onChannelChange }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {channels.map(channel => (
        <button key={channel.id} type="button" onClick={() => onChannelChange(channel.id)} style={{ padding: '6px 12px', borderRadius: '999px', border: '1px solid', borderColor: activeChannel === channel.id ? '#00e676' : '#1a3a2a', background: activeChannel === channel.id ? '#00e676' : 'transparent', color: activeChannel === channel.id ? '#021a0e' : '#00e676', fontSize: '11px', fontFamily: SANS_FONT, cursor: 'pointer', fontWeight: activeChannel === channel.id ? '700' : '500' }}>
          {channel.label}
        </button>
      ))}
    </div>
  )
}

export default function DraftReviewWorkspace({
  channels,
  activeChannel,
  onChannelChange,
  pending,
  pendingZipGroups,
  onRequestApprove,
  onReject,
  onPatched,
  onCopyManual,
  onIncludeInCanary,
  onGenerateCreative,
  onRegenerateCreative,
  onRefreshDrafts,
  actionLoading,
  zipLoading,
  zipErrors,
}) {
  const [selectedZip, setSelectedZip] = useState('all')
  const selectedStillExists = selectedZip === 'all' || pendingZipGroups.some(group => group.zip === selectedZip)
  const effectiveSelectedZip = selectedStillExists ? selectedZip : 'all'
  const visibleGroups = effectiveSelectedZip === 'all' ? pendingZipGroups : pendingZipGroups.filter(group => group.zip === effectiveSelectedZip)

  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '8px', background: '#021a0e', overflow: 'hidden' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #1a3a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4a7a5a', marginBottom: '6px', fontFamily: SANS_FONT }}>Approve, fix, or prepare a ZIP package</div>
          <h2 style={{ fontSize: '15px', color: '#e0ffe0', margin: 0, fontWeight: 700 }}>Draft review workspace ({pending.length})</h2>
        </div>
        <ChannelFilters channels={channels} activeChannel={activeChannel} onChannelChange={onChannelChange} />
      </div>
      <div style={{ padding: '16px' }}>
        {pending.length === 0 ? (
          <EmptyState title="No pending drafts" detail="Run Generate Drafts or wait for the 9AM CT auto-run." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px', alignItems: 'start' }}>
            <ZipQueueRail groups={pendingZipGroups} selectedZip={effectiveSelectedZip} onSelectZip={setSelectedZip} />
            <div>
              {visibleGroups.length === 0 ? (
                <EmptyState title="No drafts in this queue" detail="Choose another ZIP queue from the left rail." />
              ) : (
                visibleGroups.map(group => (
                  <ZipCampaignCard
                    key={group.zip}
                    group={group}
                    onRequestApprove={onRequestApprove}
                    onReject={onReject}
                    onPatched={onPatched}
                    onCopyManual={onCopyManual}
                    onIncludeInCanary={onIncludeInCanary}
                    onGenerateCreative={onGenerateCreative}
                    onRegenerateCreative={onRegenerateCreative}
                    onRefreshDrafts={onRefreshDrafts}
                    actionLoading={actionLoading}
                    zipLoadingState={zipLoading[group.zip]}
                    zipError={zipErrors[group.zip]}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
