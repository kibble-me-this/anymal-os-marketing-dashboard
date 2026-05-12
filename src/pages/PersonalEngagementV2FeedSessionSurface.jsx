import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HAS_MARKETING_ADMIN_KEY, MARKETING_API, adminHeaders } from '../config'
import { buildPersonalEngagementV23View } from '../components/dashboard/personalEngagementV2FeedSessionModel'
import { RunnerAvailabilityIndicator, StatusPill } from '../components/dashboard/workflowControls'
import { buttonStyle, dashboardFonts, runnerTone } from '../components/dashboard/workflowControlStyles'

const PANEL = {
  border: '1px solid #1a3a2a',
  borderRadius: '6px',
  background: '#031808',
}

const MONO_FONT = dashboardFonts.mono

async function readErrorDetail(res) {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
    if (body?.detail) return JSON.stringify(body.detail)
    return JSON.stringify(body)
  } catch {
    return `${res.status} ${res.statusText || 'Request failed'}`
  }
}

async function fetchWorkflowRun(runId) {
  const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(runId)}`, {
    headers: adminHeaders,
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json()
}

async function fetchPersonalV23BrowserTasks(runId) {
  const params = new URLSearchParams({
    workflow_run_id: runId,
    task_type: 'personal_engagement_v2_traversal',
    limit: '20',
  })
  const res = await fetch(`${MARKETING_API}/browser-tasks?${params.toString()}`, {
    headers: adminHeaders,
    cache: 'no-store',
  })
  if (!res.ok) return []
  const body = await res.json()
  return body.browser_tasks || []
}

async function fetchFeedCandidates(sessionId) {
  const res = await fetch(`${MARKETING_API}/marketing-agenda/personal-engagement-v2/feed-sessions/${encodeURIComponent(sessionId)}/candidates?include_rejected=true`, {
    headers: adminHeaders,
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json()
}

async function requestTraversal(runId, notes) {
  const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(runId)}/personal-engagement-v2-feed-session/request`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      operator_notes: notes || '',
    }),
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json()
}

async function spawnCandidateAction(sessionId, candidateId, spawnKind, notes) {
  const res = await fetch(`${MARKETING_API}/marketing-agenda/personal-engagement-v2/feed-sessions/${encodeURIComponent(sessionId)}/candidates/${encodeURIComponent(candidateId)}/spawn-action`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      spawn_kind: spawnKind,
      approved_by: 'carlos',
      operator_notes: notes || '',
    }),
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json()
}

async function dismissCandidate(sessionId, candidateId, reason) {
  const res = await fetch(`${MARKETING_API}/marketing-agenda/personal-engagement-v2/feed-sessions/${encodeURIComponent(sessionId)}/candidates/${encodeURIComponent(candidateId)}/dismiss`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      rejected_by: 'carlos',
      rejection_reason: reason || 'operator_dismissed',
    }),
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json()
}

function spawnedRoute(response, spawnKind) {
  const run = response?.spawned_run || {}
  const linked = run.linked_entities || {}
  if (!run.run_id) return ''
  if (spawnKind === 'reply_batch') {
    const batchId = linked.batch_id || response?.candidate?.executed_via_batch_id
    return batchId ? `/workflows/${encodeURIComponent(run.run_id)}/personal-engagement-v2-reply-batch/${encodeURIComponent(batchId)}` : ''
  }
  const actionId = linked.action_id || response?.candidate?.executed_via_action_id
  return actionId ? `/workflows/${encodeURIComponent(run.run_id)}/personal-engagement-v2/${encodeURIComponent(actionId)}` : ''
}

function DataCard({ label, value, tone = '#1a3a2a', children }) {
  return (
    <article style={{ border: `1px solid ${tone}`, borderRadius: '5px', background: '#021a0e', padding: '12px', display: 'grid', gap: '7px' }}>
      <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      {value ? <div style={{ color: '#e0ffe0', fontSize: '13px', lineHeight: 1.45, wordBreak: 'break-word' }}>{value}</div> : null}
      {children}
    </article>
  )
}

function EvidenceCard({ row }) {
  const tone = row.state === 'yes' ? '#00e676' : row.state === 'no' ? '#ff7a45' : '#8abf8a'
  return (
    <article style={{ border: `1px solid ${tone}`, borderRadius: '5px', background: '#021a0e', padding: '12px', display: 'grid', gap: '7px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'start' }}>
        <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>{row.label}</div>
        <StatusPill tone={tone}>{row.state}</StatusPill>
      </div>
      <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>{row.value}</div>
      <div style={{ color: '#4a7a5a', fontSize: '10px', lineHeight: 1.35 }}>Source: {row.source}</div>
    </article>
  )
}

function CandidateCard({ candidate, onSpawn, onDismiss, loading }) {
  const tone = candidate.cooldown.active ? '#ffd54f' : candidate.isSpawned ? '#4da3ff' : candidate.candidate_status === 'staged' ? '#00e676' : '#8abf8a'
  return (
    <article style={{ ...PANEL, padding: '14px', display: 'grid', gap: '12px', borderColor: tone }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '5px' }}>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Candidate post</div>
          <h3 style={{ margin: 0, color: '#e0ffe0', fontSize: '17px', letterSpacing: 0 }}>{candidate.target_post_author || 'Unknown author'}</h3>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <StatusPill tone={tone}>{candidate.candidate_status}</StatusPill>
          {candidate.cooldown.active ? <StatusPill tone="#ffd54f">{candidate.cooldown.label}</StatusPill> : null}
          {candidate.isSpawned ? <StatusPill tone="#4da3ff">spawned</StatusPill> : null}
        </div>
      </div>
      <DataCard label="Post excerpt" value={candidate.target_post_excerpt || 'No excerpt captured'} tone="#8abf8a" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '8px' }}>
        <DataCard label="Age hours" value={String(candidate.post_age_hours)} tone="#4da3ff" />
        <DataCard label="Visible comments" value={String(candidate.comment_count_visible)} tone="#00e676" />
        <DataCard label="Action hints" value={candidate.proposed_action_hints.join(', ')} tone="#8abf8a" />
      </div>
      <a href={candidate.target_post_url} target="_blank" rel="noopener noreferrer" style={{ color: '#00e676', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
        {candidate.target_post_url || 'No target post URL'}
      </a>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onSpawn(candidate, 'comment')} disabled={loading || !candidate.canComment} style={buttonStyle({ filled: true, tone: '#00e676', disabled: loading || !candidate.canComment })}>Comment</button>
        <button type="button" onClick={() => onSpawn(candidate, 'reply_batch')} disabled={loading || !candidate.canReply} style={buttonStyle({ tone: '#4da3ff', disabled: loading || !candidate.canReply })}>Reply to commenters</button>
        <button type="button" onClick={() => onDismiss(candidate)} disabled={loading || !candidate.canDismiss} style={buttonStyle({ tone: '#ffd54f', disabled: loading || !candidate.canDismiss })}>Skip/dismiss</button>
      </div>
    </article>
  )
}

export default function PersonalEngagementV2FeedSessionSurface() {
  const { runId, sessionId } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [candidateResponse, setCandidateResponse] = useState(null)
  const [browserTasks, setBrowserTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [requestLoading, setRequestLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [notes, setNotes] = useState('')
  const [bulkTopN, setBulkTopN] = useState(3)
  const [lastLoadedAt, setLastLoadedAt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextRun, nextCandidates, nextBrowserTasks] = await Promise.all([
        fetchWorkflowRun(runId),
        fetchFeedCandidates(sessionId),
        fetchPersonalV23BrowserTasks(runId),
      ])
      setRun(nextRun)
      setCandidateResponse(nextCandidates)
      setBrowserTasks(nextBrowserTasks)
      setLastLoadedAt(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load personal engagement V2.3 feed session.')
    } finally {
      setLoading(false)
    }
  }, [runId, sessionId])

  useEffect(() => {
    load()
  }, [load])

  const artifact = useMemo(() => (
    buildPersonalEngagementV23View({ run, candidateResponse: candidateResponse || {}, browserTasks, lastLoadedAt, routeSessionId: sessionId })
  ), [browserTasks, candidateResponse, lastLoadedAt, run, sessionId])

  const unsupported = run && run.workflow_type !== 'personal_engagement_v2_feed_session'
  const eligibleBulk = artifact.actionableCandidates.filter(candidate => candidate.canComment)
  const topN = Math.max(1, Math.min(Number(bulkTopN) || 1, eligibleBulk.length || 1))
  const requestTraversalDisabled = requestLoading || loading || actionLoading || unsupported || !HAS_MARKETING_ADMIN_KEY || !artifact.routeMatches

  const handleSpawn = async (candidate, spawnKind) => {
    setActionLoading(true)
    setError('')
    setNotice('')
    try {
      const response = await spawnCandidateAction(sessionId, candidate.candidate_id, spawnKind, notes)
      const route = spawnedRoute(response, spawnKind)
      if (route) {
        navigate(route)
        return
      }
      setNotice('Candidate spawned, but no destination route was returned. Refresh evidence.')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to spawn candidate action.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDismiss = async candidate => {
    setActionLoading(true)
    setError('')
    setNotice('')
    try {
      await dismissCandidate(sessionId, candidate.candidate_id, notes || 'operator_dismissed')
      setNotice('Candidate dismissed.')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to dismiss candidate.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRequestTraversal = async () => {
    setRequestLoading(true)
    setError('')
    setNotice('')
    try {
      await requestTraversal(runId, notes)
      setNotice('V2.3 traversal requested.')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to request V2.3 traversal.')
    } finally {
      setRequestLoading(false)
    }
  }

  const approveTopN = async () => {
    const selected = eligibleBulk.slice(0, topN)
    if (!selected.length) return
    setActionLoading(true)
    setError('')
    setNotice('')
    try {
      const responses = []
      for (const candidate of selected) {
        responses.push(await spawnCandidateAction(sessionId, candidate.candidate_id, 'comment', notes || `Bulk approved top ${selected.length} V2.3 candidates as V2.1 comments.`))
      }
      const firstRoute = spawnedRoute(responses[0], 'comment')
      if (firstRoute) {
        navigate(firstRoute)
        return
      }
      setNotice(`Spawned ${responses.length} V2.1 comment workflow${responses.length === 1 ? '' : 's'}.`)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to bulk approve candidates.')
    } finally {
      setActionLoading(false)
    }
  }

  const rejectAll = async () => {
    const selected = artifact.candidates.filter(candidate => candidate.canDismiss)
    if (!selected.length) return
    setActionLoading(true)
    setError('')
    setNotice('')
    try {
      for (const candidate of selected) {
        await dismissCandidate(sessionId, candidate.candidate_id, notes || 'bulk_rejected_by_operator')
      }
      setNotice(`Rejected ${selected.length} candidate${selected.length === 1 ? '' : 's'}.`)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to reject candidates.')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading && !run) {
    return (
      <main style={{ display: 'grid', gap: '14px', maxWidth: '1180px', margin: '0 auto', color: '#e0ffe0' }}>
        <section style={{ ...PANEL, padding: '20px' }}>Loading personal engagement V2.3 feed session...</section>
      </main>
    )
  }

  return (
    <main style={{ display: 'grid', gap: '14px', maxWidth: '1180px', margin: '0 auto', color: '#e0ffe0' }}>
      <nav aria-label="Personal engagement V2.3 breadcrumbs" style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap', color: '#8abf8a', fontSize: '12px' }}>
        <Link to="/agenda#agenda" style={{ color: '#00e676', textDecoration: 'none' }}>Agenda</Link>
        <span>&gt;</span>
        <Link to={`/workflows/${runId}`} style={{ color: '#00e676', textDecoration: 'none' }}>{artifact.workflowTitle}</Link>
        <span>&gt;</span>
        <span>Personal engagement V2.3</span>
      </nav>

      {notice ? <div role="status" style={{ border: '1px solid #00e676', color: '#00e676', borderRadius: '5px', padding: '10px' }}>{notice}</div> : null}
      {error ? <div role="alert" style={{ border: '1px solid #ff4444', color: '#ffb3b3', background: '#260707', borderRadius: '5px', padding: '10px' }}>{error}</div> : null}
      {!HAS_MARKETING_ADMIN_KEY ? <div role="alert" style={{ border: '1px solid #ffd54f', color: '#ffe58a', background: '#1f1a05', borderRadius: '5px', padding: '10px' }}>Personal engagement V2.3 actions require the admin key in this dashboard environment.</div> : null}
      {unsupported ? <div role="alert" style={{ border: '1px solid #ff4444', color: '#ffb3b3', background: '#260707', borderRadius: '5px', padding: '10px' }}>This route only supports personal_engagement_v2_feed_session workflow runs.</div> : null}
      {!artifact.routeMatches ? <div role="alert" style={{ border: '1px solid #ff4444', color: '#ffb3b3', background: '#260707', borderRadius: '5px', padding: '10px' }}>Route session id does not match the workflow session. Refusing to improvise.</div> : null}

      <section aria-label="Orientation banner" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '10px', borderColor: '#4da3ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '6px' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Orientation banner</div>
            <h1 style={{ margin: 0, color: '#e0ffe0', fontSize: '24px', letterSpacing: 0 }}>Personal Facebook Engagement V2.3: Feed Candidate Review</h1>
            <div style={{ color: '#8abf8a', fontSize: '13px', lineHeight: 1.45 }}>
              {artifact.workflowTitle} | Step {artifact.stepNumber} of {artifact.stepCount} | {artifact.stepTitle}
            </div>
            <div style={{ color: '#4a7a5a', fontSize: '12px', lineHeight: 1.45 }}>
              {artifact.workflowStatus} | {artifact.stepId} | {artifact.candidates.length} candidate{artifact.candidates.length === 1 ? '' : 's'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <StatusPill tone="#4da3ff">{artifact.session.sessionId}</StatusPill>
            <StatusPill tone={artifact.runnerAvailability.state === 'green' ? '#00e676' : '#ffd54f'}>{artifact.session.sessionStatus}</StatusPill>
          </div>
        </div>
      </section>

      <section aria-label="Operator browser discipline" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '8px', borderColor: '#ffd54f', background: '#1f1a05' }}>
        <div style={{ color: '#ffd54f', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Operator browser discipline</div>
        <h2 style={{ margin: 0, color: '#ffe58a', fontSize: '18px', letterSpacing: 0 }}>Do not view this dashboard in Chrome while V2 runner sessions are active</h2>
        <div style={{ color: '#ffe58a', fontSize: '12px', lineHeight: 1.45 }}>Use Safari or Firefox for operator review so PR #23 can keep the dedicated PersonalEngagement Chrome profile isolated.</div>
      </section>

      <section aria-label="Feed session summary" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Feed session summary</div>
          <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>{artifact.session.targetFeedUrl || 'Anymal OS Page feed'}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '8px' }}>
          <DataCard label="Staged" value={String(artifact.candidates.length)} tone="#00e676" />
          <DataCard label="Spawned" value={String(artifact.spawnedCount)} tone="#4da3ff" />
          <DataCard label="Cooldown" value={String(artifact.cooldownCount)} tone={artifact.cooldownCount ? '#ffd54f' : '#8abf8a'} />
          <DataCard label="Scrolled" value={String(artifact.session.postsScrolledPast || 0)} tone="#8abf8a" />
        </div>
      </section>

      <section aria-label="Candidate cards" style={{ display: 'grid', gap: '12px' }}>
        {artifact.hasCandidates ? artifact.candidates.map(candidate => (
          <CandidateCard
            key={candidate.candidate_id}
            candidate={candidate}
            onSpawn={handleSpawn}
            onDismiss={handleDismiss}
            loading={actionLoading || loading || unsupported || !HAS_MARKETING_ADMIN_KEY || !artifact.routeMatches}
          />
        )) : (
          <section style={{ ...PANEL, padding: '18px', display: 'grid', gap: '8px', borderColor: '#ffd54f' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Candidate cards</div>
            <h2 style={{ margin: 0, color: '#ffe58a', fontSize: '18px', letterSpacing: 0 }}>No candidates staged</h2>
            <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>{artifact.session.refusalCode || 'Refresh evidence after the read-only traversal completes.'}</div>
          </section>
        )}
      </section>

      <section aria-label="Bulk actions footer" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bulk actions footer</div>
          <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>Candidate batch actions</h2>
        </div>
        <label style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', color: '#8abf8a', fontSize: '12px' }}>
          Top N
          <input
            type="number"
            min="1"
            max={Math.max(1, eligibleBulk.length)}
            value={bulkTopN}
            onChange={event => setBulkTopN(event.target.value)}
            style={{ width: '72px', background: '#021a0e', border: '1px solid #1a3a2a', color: '#e0ffe0', borderRadius: '5px', padding: '8px', fontFamily: MONO_FONT }}
          />
        </label>
        <label style={{ display: 'grid', gap: '6px' }}>
          <span style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Operator notes</span>
          <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional note for this V2.3 feed session" style={{ minHeight: '64px', resize: 'vertical', background: '#021a0e', color: '#e0ffe0', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px', fontSize: '12px', fontFamily: MONO_FONT }} />
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={approveTopN} disabled={actionLoading || !eligibleBulk.length || !HAS_MARKETING_ADMIN_KEY} style={buttonStyle({ filled: true, tone: '#00e676', disabled: actionLoading || !eligibleBulk.length || !HAS_MARKETING_ADMIN_KEY })}>Approve top N as comments</button>
          <button type="button" onClick={rejectAll} disabled={actionLoading || !artifact.candidates.some(candidate => candidate.canDismiss) || !HAS_MARKETING_ADMIN_KEY} style={buttonStyle({ tone: '#ff7a45', disabled: actionLoading || !artifact.candidates.some(candidate => candidate.canDismiss) || !HAS_MARKETING_ADMIN_KEY })}>Reject all</button>
          <button type="button" onClick={load} disabled={loading || actionLoading} style={buttonStyle({ tone: '#4da3ff', disabled: loading || actionLoading })}>Refresh evidence</button>
        </div>
      </section>

      <section aria-label="Chrome runner availability indicator" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'start' }}>
          <div>
            <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Chrome runner availability</div>
            <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>Dedicated profile must be available</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {artifact.canRequestTraversal ? (
              <button type="button" onClick={handleRequestTraversal} disabled={requestTraversalDisabled} style={buttonStyle({ filled: true, tone: '#00e676', disabled: requestTraversalDisabled })}>Request V2.3 traversal</button>
            ) : null}
            <button type="button" onClick={load} disabled={loading || actionLoading || requestLoading} style={buttonStyle({ tone: '#4da3ff', disabled: loading || actionLoading || requestLoading })}>Refresh runner status</button>
          </div>
        </div>
        <RunnerAvailabilityIndicator runner={artifact.runnerAvailability} />
        {artifact.latestBrowserTask ? (
          <div style={{ color: runnerTone(artifact.runnerAvailability.state), fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
            latest_task: {artifact.latestBrowserTask.browser_task_id || artifact.latestBrowserTask.task_id || 'unknown'} | {artifact.latestBrowserTask.status || 'unknown'}
          </div>
        ) : (
          <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>No V2.3 traversal browser task has been requested for this run yet.</div>
        )}
      </section>

      <section aria-label="Evidence panel" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Evidence panel</div>
          <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>Feed traversal evidence</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '10px' }}>
          {artifact.evidenceRows.map(row => <EvidenceCard key={row.id} row={row} />)}
        </div>
      </section>
    </main>
  )
}
