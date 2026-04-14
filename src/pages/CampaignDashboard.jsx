import { useState, useEffect, useCallback, useRef } from 'react'
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

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
}

function CampaignCard({ campaign, onApprove, onReject, actionLoading }) {
  const firstLine = campaign.generated_copy
    ? campaign.generated_copy.split('\n').find(l => l.trim()) || ''
    : campaign.barn_name || campaign.topic_title || campaign.campaign_id

  const displayTitle = firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine
  const channelColor = CHANNEL_COLORS[campaign.channel] || '#00e676'
  const isLoading = actionLoading === campaign.campaign_id

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
            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: '#0a2a1a', color: '#00e676', border: '1px solid #00e676', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {campaign.channel_label || campaign.channel}
            </span>
            {campaign.topic_angle && (
              <span style={{ fontSize: '10px', color: '#4a7a5a' }}>{campaign.topic_angle}</span>
            )}
            <span style={{ fontSize: '10px', color: '#4a7a5a' }}>{formatDate(campaign.created_at)}</span>
          </div>
        </div>
      </div>

      <div style={{ background: '#031808', border: '1px solid #0a2a1a', borderRadius: '4px', padding: '12px', marginBottom: '12px', fontSize: '13px', color: '#c0e0c0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {campaign.message || campaign.generated_copy}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onApprove(campaign.campaign_id)}
          disabled={isLoading}
          style={{ padding: '8px 20px', background: isLoading ? '#1a3a2a' : '#00e676', color: '#021a0e', border: 'none', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: isLoading ? 'not-allowed' : 'pointer', fontFamily: 'IBM Plex Sans, monospace', fontWeight: '600' }}>
          {isLoading ? 'Publishing...' : 'Approve'}
        </button>
        <button
          onClick={() => onReject(campaign.campaign_id)}
          disabled={isLoading}
          style={{ padding: '8px 20px', background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: isLoading ? 'not-allowed' : 'pointer', fontFamily: 'IBM Plex Sans, monospace' }}>
          Reject
        </button>
      </div>
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
            style={{ padding: '8px 16px', background: 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'IBM Plex Sans, monospace' }}>
            {generating ? 'Generating...' : 'Generate Drafts'}
          </button>
          <button onClick={fetchData}
            style={{ padding: '8px 16px', background: 'transparent', color: '#00e676', border: '1px solid #00e676', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'IBM Plex Sans, monospace' }}>
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
              style={{ padding: '6px 14px', borderRadius: '20px', border: '1px solid', borderColor: activeChannel === ch.id ? '#00e676' : '#1a3a2a', background: activeChannel === ch.id ? '#00e676' : 'transparent', color: activeChannel === ch.id ? '#021a0e' : '#00e676', fontSize: '12px', fontFamily: 'IBM Plex Sans, monospace', cursor: 'pointer', fontWeight: activeChannel === ch.id ? '600' : '400' }}>
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
            <CampaignCard key={c.campaign_id} campaign={c} onApprove={handleApprove} onReject={handleReject} actionLoading={actionLoading} />
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
