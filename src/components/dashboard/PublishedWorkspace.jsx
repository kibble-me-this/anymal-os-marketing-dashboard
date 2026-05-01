import { useMemo, useState } from 'react'
import ReplyTargetContext from '../ReplyTargetContext'

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
const URL_PATTERN = /https?:\/\/world\.anymalos\.com\/[^\s)]*/

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

function EmptyState() {
  return (
    <div style={{ border: '1px dashed #1a3a2a', borderRadius: '6px', padding: '28px', textAlign: 'center', color: '#4a7a5a', background: '#031808' }}>
      <div style={{ color: '#c0e0c0', fontSize: '14px', marginBottom: '6px' }}>No published posts yet</div>
      <div style={{ fontSize: '12px', lineHeight: 1.45 }}>Approve a draft to ship the first Page anchor.</div>
    </div>
  )
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
    <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '14px', marginBottom: '10px', background: '#021a0e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: '#0a2a1a', color: channelColor, border: `1px solid ${channelColor}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {hasImage && (
          <img
            src={`data:image/png;base64,${campaign.chart_base64}`}
            alt="published chart"
            onClick={onToggleExpanded}
            style={{ width: `${thumbSize}px`, height: 'auto', maxWidth: '100%', border: '1px solid #1a3a2a', borderRadius: '4px', cursor: 'pointer', flexShrink: 0, transition: 'width 0.15s ease' }}
          />
        )}
        <div style={{ flex: 1, minWidth: '240px', fontSize: '13px', color: '#c0e0c0', lineHeight: 1.55, whiteSpace: 'pre-wrap', fontFamily: MONO_FONT }}>
          {message}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
        {campaign.posted_url ? (
          <a href={campaign.posted_url} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 14px', background: 'transparent', color: channelColor, border: `1px solid ${channelColor}`, borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT, textDecoration: 'none' }}>
            {viewLabel}
          </a>
        ) : campaign.post_id ? (
          <span style={{ fontSize: '11px', color: '#4a7a5a', fontFamily: MONO_FONT }}>
            Post ID: {campaign.post_id}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: '14px', rowGap: '4px', marginTop: '10px', flexWrap: 'wrap', fontSize: '10px', color: '#4a7a5a', fontFamily: MONO_FONT }}>
        {destination && (
          <span style={{ wordBreak: 'break-all' }}>dest: {destination}</span>
        )}
        {utmCampaign && <span>utm: {utmCampaign}</span>}
        {campaign.topic_stakeholder && <span>for: {campaign.topic_stakeholder}</span>}
      </div>
    </div>
  )
}

export default function PublishedWorkspace({ published }) {
  const [expandedThumbId, setExpandedThumbId] = useState(null)

  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '8px', background: '#021a0e', overflow: 'hidden' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #1a3a2a' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4a7a5a', marginBottom: '6px', fontFamily: SANS_FONT }}>
          Recently shipped
        </div>
        <h2 style={{ fontSize: '15px', color: '#e0ffe0', margin: 0, fontWeight: 700 }}>
          Published workspace ({published.length})
        </h2>
      </div>
      <div style={{ padding: '16px' }}>
        {published.length === 0 ? (
          <EmptyState />
        ) : (
          published.map(campaign => (
            <PublishedCard
              key={campaign.campaign_id}
              campaign={campaign}
              expanded={expandedThumbId === campaign.campaign_id}
              onToggleExpanded={() =>
                setExpandedThumbId(id => (id === campaign.campaign_id ? null : campaign.campaign_id))
              }
            />
          ))
        )}
      </div>
    </section>
  )
}
