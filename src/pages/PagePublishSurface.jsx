import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HAS_MARKETING_ADMIN_KEY, MARKETING_API, adminHeaders } from '../config'
import {
  buildPagePublishArtifact,
  buildPublishPayload,
  CAMPAIGN_LOOKUP_STATUSES,
  findCampaignById,
  mergeCampaignRows,
} from '../components/dashboard/pagePublishModel'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
const PANEL = {
  border: '1px solid #1a3a2a',
  borderRadius: '6px',
  background: '#031808',
}

async function readErrorDetail(res) {
  let detail = `${res.status}`
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') detail = body.detail
    else if (body?.detail) detail = JSON.stringify(body.detail)
  } catch {
    detail = `${res.status}`
  }
  return detail
}

function buttonStyle({ tone = '#00e676', filled = false, disabled = false } = {}) {
  return {
    padding: '10px 14px',
    borderRadius: '5px',
    border: filled && !disabled ? 'none' : `1px solid ${tone}`,
    background: filled && !disabled ? tone : 'transparent',
    color: filled && !disabled ? '#021a0e' : tone,
    fontSize: '10px',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    fontFamily: SANS_FONT,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '36px',
  }
}

function stateTone(state) {
  if (state === 'yes') return '#00e676'
  if (state === 'no') return '#ff7a45'
  return '#8abf8a'
}

function StatusPill({ children, tone = '#00e676' }) {
  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontFamily: SANS_FONT, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function EmptyValue({ children }) {
  return <span style={{ color: '#8abf8a' }}>{children}</span>
}

function CreativePreview({ artifact }) {
  if (!artifact.creative.src) {
    return (
      <div style={{ border: '1px solid #ff7a45', borderRadius: '6px', padding: '18px', color: '#ffb390', background: '#210f05' }}>
        Creative is not exposed for this campaign yet.
      </div>
    )
  }
  return (
    <figure style={{ margin: 0, display: 'grid', gap: '8px' }}>
      <img
        src={artifact.creative.src}
        alt={artifact.creative.label}
        style={{ width: '100%', maxWidth: '620px', borderRadius: '5px', border: '1px solid #1a3a2a', background: '#021a0e' }}
      />
      <figcaption style={{ color: '#4a7a5a', fontSize: '11px', fontFamily: MONO_FONT }}>
        Source: {artifact.creative.source}
      </figcaption>
    </figure>
  )
}

function EvidenceSummary({ artifact }) {
  return (
    <section style={{ ...PANEL, padding: '14px', display: 'grid', gap: '10px' }}>
      <div>
        <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Evidence required after publish</div>
        <h2 style={{ margin: '5px 0 0 0', color: '#e0ffe0', fontSize: '18px', letterSpacing: 0 }}>The cockpit needs URL plus post ID</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '8px' }}>
        {artifact.evidenceRows.map(row => (
          <article key={row.id} style={{ border: `1px solid ${stateTone(row.state)}`, borderRadius: '5px', padding: '10px', background: '#021a0e', display: 'grid', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'start' }}>
              <div style={{ color: '#e0ffe0', fontSize: '12px', fontWeight: 700 }}>{row.label}</div>
              <StatusPill tone={stateTone(row.state)}>{row.state}</StatusPill>
            </div>
            <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>{row.value}</div>
            <div style={{ color: '#4a7a5a', fontSize: '10px' }}>Source: {row.source}</div>
          </article>
        ))}
      </div>
    </section>
  )
}

function InlinePreviewPanel({ artifact }) {
  return (
    <section role="region" aria-label="Facebook Page post preview" style={{ ...PANEL, borderColor: '#4da3ff', padding: '14px', display: 'grid', gap: '12px' }}>
      <div>
        <div style={{ color: '#4da3ff', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Inline preview</div>
        <h2 style={{ margin: '5px 0 0 0', color: '#e0ffe0', fontSize: '18px', letterSpacing: 0 }}>Review the exact Page post before publishing</h2>
      </div>
      <CreativePreview artifact={artifact} />
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#c8f7c8', background: '#021a0e', border: '1px solid #0d281a', borderRadius: '5px', padding: '12px', fontSize: '12px', lineHeight: 1.55, fontFamily: MONO_FONT }}>
        {artifact.copy || 'No copy exposed.'}
      </pre>
    </section>
  )
}

export default function PagePublishSurface() {
  const { runId, campaignId } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [lastLoadedAt, setLastLoadedAt] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [freshnessAcknowledged, setFreshnessAcknowledged] = useState(false)
  const [publishLoading, setPublishLoading] = useState(false)
  const [decisionLoading, setDecisionLoading] = useState(false)
  const [publishResult, setPublishResult] = useState(null)
  const [notes, setNotes] = useState('')

  const loadPage = useCallback(async () => {
    if (!runId || !campaignId) return
    if (!HAS_MARKETING_ADMIN_KEY) {
      setError('Page publish surface requires VITE_MARKETING_ADMIN_KEY.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const runRes = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(runId)}`, {
        headers: adminHeaders,
        cache: 'no-store',
      })
      if (!runRes.ok) throw new Error(await readErrorDetail(runRes))
      const nextRun = await runRes.json()
      const campaignRequests = [
        fetch(`${MARKETING_API}/campaigns/pending/by-channel?limit=300`, { headers: adminHeaders, cache: 'no-store' }),
        ...CAMPAIGN_LOOKUP_STATUSES.map(status => (
          fetch(`${MARKETING_API}/campaigns?status=${encodeURIComponent(status)}&limit=300`, { headers: adminHeaders, cache: 'no-store' })
        )),
      ]
      const campaignResponses = await Promise.all(campaignRequests)
      const campaignBodies = await Promise.all(campaignResponses.map(async res => {
        if (!res.ok) throw new Error(await readErrorDetail(res))
        return res.json()
      }))
      const campaigns = mergeCampaignRows(campaignBodies.map(body => body.campaigns || []))
      const exactCampaign = findCampaignById(campaigns, campaignId)
      setRun(nextRun)
      setCampaign(exactCampaign)
      setLastLoadedAt(new Date().toISOString())
      if (!exactCampaign) {
        setError(`Campaign ${campaignId} was not found in loaded campaign lists.`)
      }
    } catch (err) {
      setError(`Page publish load failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [campaignId, runId])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  const artifact = useMemo(() => buildPagePublishArtifact({ run, campaign, campaignId }), [campaign, campaignId, run])
  const publishDisabled = Boolean(
    publishLoading
    || !previewOpen
    || !artifact.canPublish
    || (artifact.freshness.requiresAck && !freshnessAcknowledged)
  )
  const returnHref = `/workflows/${encodeURIComponent(runId || '')}`

  const handlePublish = async () => {
    setPublishLoading(true)
    setError('')
    setNotice('')
    setPublishResult(null)
    try {
      const res = await fetch(`${MARKETING_API}/campaigns/${encodeURIComponent(artifact.campaignId)}/approve`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(buildPublishPayload({
          freshnessAcknowledged: artifact.freshness.requiresAck && freshnessAcknowledged,
        })),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const body = await res.json()
      setPublishResult(body)
      const postedUrl = body?.posted_url || body?.campaign?.posted_url || ''
      const postId = body?.post_id || body?.campaign?.post_id || ''
      if (postedUrl && postId) {
        navigate(`/workflows/${encodeURIComponent(runId)}?page_publish=success&campaign=${encodeURIComponent(artifact.campaignId)}`)
        return
      }
      setNotice('Publish returned without complete posted URL and post ID evidence. Refresh evidence before approving the workflow gate.')
      await loadPage()
    } catch (err) {
      setError(`Facebook Page publish failed: ${err.message}`)
    } finally {
      setPublishLoading(false)
    }
  }

  const handleDecision = async (decision) => {
    if (!run?.run_id || !run?.current_step_id) return
    setDecisionLoading(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(run.run_id)}/operator-decision`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          step_id: run.current_step_id,
          decision,
          operator_notes: notes || undefined,
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      navigate(`/workflows/${encodeURIComponent(run.run_id)}?page_publish=${encodeURIComponent(decision)}&campaign=${encodeURIComponent(artifact.campaignId)}`)
    } catch (err) {
      setError(`Workflow decision failed: ${err.message}`)
    } finally {
      setDecisionLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'grid', gap: '14px' }}>
      <nav aria-label="Workflow breadcrumbs" style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap', color: '#8abf8a', fontSize: '12px' }}>
        <Link to="/agenda#agenda" style={{ color: '#00e676', textDecoration: 'none' }}>Agenda</Link>
        <span>&gt;</span>
        <Link to={returnHref} style={{ color: '#00e676', textDecoration: 'none' }}>ZIP Launch {artifact.zip || 'unknown'}</Link>
        <span>&gt;</span>
        <span>Page publish</span>
      </nav>

      {error && <div role="alert" style={{ border: '1px solid #ff4444', background: '#260707', color: '#ffb3b3', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>{error}</div>}
      {notice && <div role="status" style={{ border: '1px solid #ffd54f', background: '#1f1a05', color: '#ffe58a', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>{notice}</div>}

      {loading && !run && (
        <section style={{ ...PANEL, padding: '28px', color: '#8abf8a', textAlign: 'center', fontSize: '13px' }}>
          Loading Page publish decision...
        </section>
      )}

      {!loading && (
        <>
          <section style={{ ...PANEL, padding: '16px', display: 'grid', gap: '10px', borderColor: '#ff7a45' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: '6px' }}>
                <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>5 second orientation</div>
                <h1 style={{ margin: 0, color: '#e0ffe0', fontSize: '24px', letterSpacing: 0 }}>
                  Publish ZIP {artifact.zip || 'unknown'} Facebook Page post
                </h1>
                <div style={{ color: '#8abf8a', fontSize: '13px', lineHeight: 1.45 }}>
                  {artifact.workflowTitle} | Step {artifact.stepNumber || '?'} of {artifact.stepCount || '?'} | {artifact.stepTitle}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <StatusPill tone="#ff7a45">Live external</StatusPill>
                <StatusPill tone="#4da3ff">{artifact.campaignId || campaignId}</StatusPill>
              </div>
            </div>
            <div role="alert" style={{ border: '1px solid #ff7a45', borderRadius: '5px', color: '#ffd1bf', background: '#210f05', padding: '10px', fontSize: '12px', lineHeight: 1.5 }}>
              This screen can publish to the live Facebook Page. Preview first. Carlos owns the final Publish click.
            </div>
          </section>

          <section style={{ ...PANEL, padding: '16px', display: 'grid', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, 0.9fr)', gap: '14px', alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Creative preview</div>
                  <h2 style={{ margin: '5px 0 0 0', color: '#e0ffe0', fontSize: '20px', letterSpacing: 0 }}>One Page post, one destination</h2>
                </div>
                <CreativePreview artifact={artifact} />
              </div>
              <div style={{ display: 'grid', gap: '10px' }}>
                <article style={{ border: '1px solid #1a3a2a', borderRadius: '5px', padding: '12px', background: '#021a0e' }}>
                  <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Destination</div>
                  <div style={{ color: '#e0ffe0', fontSize: '16px', fontWeight: 700, marginTop: '6px' }}>{artifact.destination.label}</div>
                  <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, marginTop: '5px' }}>{artifact.channel}</div>
                </article>
                <article style={{ border: `1px solid ${artifact.freshness.tone}`, borderRadius: '5px', padding: '12px', background: '#021a0e' }}>
                  <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Freshness</div>
                  <div style={{ color: artifact.freshness.tone, fontSize: '16px', fontWeight: 700, marginTop: '6px' }}>{artifact.freshness.label}</div>
                  <div style={{ color: '#8abf8a', fontSize: '11px', lineHeight: 1.45, marginTop: '5px' }}>{artifact.freshness.tooltip}</div>
                  {artifact.freshness.requiresAck && (
                    <label style={{ display: 'flex', gap: '8px', alignItems: 'start', marginTop: '10px', color: '#ffe58a', fontSize: '11px', lineHeight: 1.35 }}>
                      <input type="checkbox" checked={freshnessAcknowledged} onChange={event => setFreshnessAcknowledged(event.target.checked)} />
                      <span>I reviewed the freshness warning and want to publish this Page post.</span>
                    </label>
                  )}
                </article>
                <article style={{ border: '1px solid #1a3a2a', borderRadius: '5px', padding: '12px', background: '#021a0e' }}>
                  <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Last refresh</div>
                  <div style={{ color: '#e0ffe0', fontSize: '12px', fontFamily: MONO_FONT, marginTop: '6px' }}>
                    {lastLoadedAt ? new Date(lastLoadedAt).toLocaleString() : 'Not loaded'}
                  </div>
                </article>
              </div>
            </div>

            <section style={{ display: 'grid', gap: '8px' }}>
              <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Final copy</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#c8f7c8', background: '#021a0e', border: '1px solid #0d281a', borderRadius: '5px', padding: '12px', fontSize: '12px', lineHeight: 1.55, fontFamily: MONO_FONT }}>
                {artifact.copy || 'No copy exposed.'}
              </pre>
            </section>

            {artifact.blockers.length > 0 && (
              <section role="status" style={{ border: '1px solid #ffd54f', borderRadius: '5px', color: '#ffe58a', background: '#1f1a05', padding: '12px', display: 'grid', gap: '6px' }}>
                <div style={{ fontWeight: 700, fontSize: '12px' }}>Publish is blocked until these are resolved:</div>
                {artifact.blockers.map(blocker => <div key={blocker} style={{ fontSize: '12px', lineHeight: 1.4 }}>{blocker}</div>)}
              </section>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setPreviewOpen(true)} disabled={!artifact.canPreview} style={buttonStyle({ filled: true, disabled: !artifact.canPreview })}>
                Preview Facebook Page Post
              </button>
              <button type="button" onClick={handlePublish} disabled={publishDisabled} style={buttonStyle({ filled: true, tone: '#ff7a45', disabled: publishDisabled })}>
                {publishLoading ? 'Publishing...' : 'Publish Facebook Page Post'}
              </button>
              <button type="button" onClick={loadPage} disabled={loading || publishLoading} style={buttonStyle({ tone: '#4da3ff', disabled: loading || publishLoading })}>
                Refresh evidence
              </button>
              <Link to={returnHref} style={buttonStyle({ tone: '#8abf8a' })}>
                Return to cockpit
              </Link>
              <Link to="/agenda#drafts" style={buttonStyle({ tone: '#4da3ff' })}>
                Open full Draft Review
              </Link>
            </div>

            {previewOpen && <InlinePreviewPanel artifact={artifact} />}
          </section>

          <EvidenceSummary artifact={artifact} />

          {publishResult && (
            <section style={{ ...PANEL, borderColor: '#ffd54f', padding: '14px', display: 'grid', gap: '8px' }}>
              <div style={{ color: '#ffd54f', fontSize: '13px', fontWeight: 700 }}>Publish response needs evidence review</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#ffe58a', background: '#1f1a05', border: '1px solid #332800', borderRadius: '5px', padding: '10px', fontSize: '11px', lineHeight: 1.45, fontFamily: MONO_FONT }}>
                {JSON.stringify(publishResult, null, 2)}
              </pre>
            </section>
          )}

          <section style={{ ...PANEL, padding: '14px', display: 'grid', gap: '10px' }}>
            <div>
              <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Recovery actions</div>
              <h2 style={{ margin: '5px 0 0 0', color: '#e0ffe0', fontSize: '18px', letterSpacing: 0 }}>Keep workflow state separate from publish state</h2>
            </div>
            <label style={{ display: 'grid', gap: '6px' }}>
              <span style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Operator notes</span>
              <textarea
                value={notes}
                onChange={event => setNotes(event.target.value)}
                placeholder="Optional note for request changes or block"
                style={{ minHeight: '64px', resize: 'vertical', background: '#021a0e', color: '#e0ffe0', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px', fontSize: '12px', fontFamily: MONO_FONT }}
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => handleDecision('changes_requested')} disabled={decisionLoading || !run?.current_step_id} style={buttonStyle({ tone: '#ffd54f', disabled: decisionLoading || !run?.current_step_id })}>
                Request changes
              </button>
              <button type="button" onClick={() => handleDecision('blocked')} disabled={decisionLoading || !run?.current_step_id} style={buttonStyle({ tone: '#ff4444', disabled: decisionLoading || !run?.current_step_id })}>
                Block
              </button>
              {artifact.hasPublishedEvidence && (
                <EmptyValue>
                  Published evidence is present. Return to cockpit and approve the Page anchor gate when ready.
                </EmptyValue>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
