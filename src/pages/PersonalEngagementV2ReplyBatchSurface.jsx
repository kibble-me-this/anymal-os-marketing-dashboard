import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HAS_MARKETING_ADMIN_KEY, MARKETING_API, adminHeaders } from '../config'
import {
  APPROVABLE_REPLY_STATUSES,
  APPROVED_REPLY_STATUSES,
  TERMINAL_REFUSAL_STATUSES,
  VETOED_REPLY_STATUSES,
  buildPersonalEngagementV22View,
} from '../components/dashboard/personalEngagementV2ReplyBatchModel'
import { DestinationConfirmCheckbox, RunnerAvailabilityIndicator, StatusPill } from '../components/dashboard/workflowControls'
import { buttonStyle, dashboardFonts, runnerTone } from '../components/dashboard/workflowControlStyles'
import { riskCopy } from '../components/dashboard/workflowCockpitModel'

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

async function fetchPersonalV22BrowserTasks(runId) {
  const params = new URLSearchParams({
    workflow_run_id: runId,
    task_type: 'personal_engagement_v2_reply_batch',
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

async function requestCommenterScan(runId, notes) {
  const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(runId)}/personal-engagement-v2-reply-batch/commenter-scan-request`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ operator_notes: notes || '' }),
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json()
}

async function reviewReplyBatch(runId, decisions, notes) {
  const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(runId)}/personal-engagement-v2-reply-batch/review`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      decisions,
      approved_by: 'carlos',
      operator_notes: notes || 'Carlos reviewed each V2.2 reply draft.',
    }),
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json()
}

async function requestReplyBatchExecution(runId, notes) {
  const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(runId)}/personal-engagement-v2-reply-batch/request`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ operator_notes: notes || '' }),
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json()
}

async function sendRecoveryDecision(runId, stepId, decision, notes) {
  const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(runId)}/operator-decision`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      step_id: stepId,
      decision,
      operator_notes: notes || '',
    }),
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json()
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
      {row.detail ? <div style={{ color: '#ffd54f', fontSize: '10px', lineHeight: 1.35 }}>{row.detail}</div> : null}
    </article>
  )
}

function SafetyScoring({ scoring, riskFlags }) {
  const flags = Array.isArray(riskFlags) ? riskFlags : []
  const positives = Array.isArray(scoring?.positive_signals) ? scoring.positive_signals : []
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '8px' }}>
      <DataCard label="Score" value={String(scoring?.score ?? 'unknown')} tone="#4da3ff" />
      <DataCard label="Risk flags" value={flags.length ? flags.join(', ') : 'none'} tone={flags.length ? '#ffd54f' : '#00e676'} />
      <DataCard label="Positive signals" value={positives.length ? positives.join(', ') : 'none'} tone="#8abf8a" />
    </div>
  )
}

function decisionFor(reply, decisions) {
  if (APPROVED_REPLY_STATUSES.has(reply.status)) return 'approved'
  if (VETOED_REPLY_STATUSES.has(reply.status)) return 'vetoed'
  return decisions[reply.reply_id] || ''
}

function ReplyCard({ reply, decision, onDecision }) {
  const pending = APPROVABLE_REPLY_STATUSES.has(reply.status)
  const approved = decision === 'approved'
  const vetoed = decision === 'vetoed'
  const terminal = TERMINAL_REFUSAL_STATUSES.has(reply.status)
  const statusTone = approved ? '#00e676' : vetoed ? '#ff7a45' : terminal ? '#ffd54f' : '#8abf8a'
  return (
    <article style={{ ...PANEL, padding: '14px', display: 'grid', gap: '12px', borderColor: statusTone }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '5px' }}>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Per-reply card</div>
          <h3 style={{ margin: 0, color: '#e0ffe0', fontSize: '17px', letterSpacing: 0 }}>{reply.commenter_handle || 'Unknown commenter'}</h3>
        </div>
        <StatusPill tone={statusTone}>{decision || reply.status || 'pending'}</StatusPill>
      </div>
      <DataCard label="Commenter comment" value={reply.commenter_comment_excerpt || 'No comment excerpt captured'} tone="#8abf8a" />
      {reply.approved_text ? (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#e0ffe0', fontSize: '13px', lineHeight: 1.5, fontFamily: MONO_FONT, background: '#021a0e', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '12px' }}>{reply.approved_text}</pre>
      ) : (
        <DataCard label="Drafted reply" value={reply.refusal_reason || 'No draft generated'} tone={terminal ? '#ffd54f' : '#8abf8a'} />
      )}
      {reply.approved_text_hash ? <div style={{ color: '#4a7a5a', fontSize: '10px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>text_hash: {reply.approved_text_hash}</div> : null}
      <DataCard label="Voice profile" value={reply.voice_profile_version || 'carlos:v1'} tone="#4da3ff" />
      <SafetyScoring scoring={reply.safety_scoring || {}} riskFlags={reply.risk_flags || []} />
      {pending ? (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onDecision(reply.reply_id, 'approved')} style={buttonStyle({ filled: approved, tone: '#00e676' })}>Approve</button>
          <button type="button" onClick={() => onDecision(reply.reply_id, 'vetoed')} style={buttonStyle({ filled: vetoed, tone: '#ff7a45' })}>Veto</button>
        </div>
      ) : null}
    </article>
  )
}

export default function PersonalEngagementV2ReplyBatchSurface() {
  const { runId, batchId } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [browserTasks, setBrowserTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [notes, setNotes] = useState('')
  const [decisions, setDecisions] = useState({})
  const [identityConfirmed, setIdentityConfirmed] = useState(false)
  const [targetConfirmed, setTargetConfirmed] = useState(false)
  const [textConfirmed, setTextConfirmed] = useState(false)
  const [lastLoadedAt, setLastLoadedAt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextRun, nextBrowserTasks] = await Promise.all([
        fetchWorkflowRun(runId),
        fetchPersonalV22BrowserTasks(runId),
      ])
      setRun(nextRun)
      setBrowserTasks(nextBrowserTasks)
      setLastLoadedAt(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load personal engagement V2.2 workflow.')
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    load()
  }, [load])

  const artifact = useMemo(() => (
    buildPersonalEngagementV22View({ run, browserTasks, lastLoadedAt, routeBatchId: batchId })
  ), [run, browserTasks, lastLoadedAt, batchId])

  useEffect(() => {
    setDecisions(current => {
      const next = { ...current }
      let changed = false
      for (const reply of artifact.batch.replyCandidates) {
        if (APPROVED_REPLY_STATUSES.has(reply.status) && next[reply.reply_id] !== 'approved') {
          next[reply.reply_id] = 'approved'
          changed = true
        }
        if (VETOED_REPLY_STATUSES.has(reply.status) && next[reply.reply_id] !== 'vetoed') {
          next[reply.reply_id] = 'vetoed'
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [artifact.batch.replyCandidates])

  const risk = riskCopy('live_external')
  const unsupported = run && run.workflow_type !== 'personal_engagement_v2_reply_batch'
  const pendingDrafts = artifact.batch.replyCandidates.filter(reply => APPROVABLE_REPLY_STATUSES.has(reply.status))
  const approvedCount = artifact.batch.replyCandidates.filter(reply => decisionFor(reply, decisions) === 'approved').length
  const allPendingDisposed = pendingDrafts.every(reply => ['approved', 'vetoed'].includes(decisionFor(reply, decisions)))
  const runnerReady = artifact.runnerAvailability.state === 'green'

  const canRequestScan = Boolean(
    artifact.isScanRequestable
    && HAS_MARKETING_ADMIN_KEY
    && runnerReady
    && !loading
    && !actionLoading
  )

  const executeDisabled = Boolean(
    loading
    || actionLoading
    || unsupported
    || !HAS_MARKETING_ADMIN_KEY
    || !artifact.routeMatches
    || !artifact.isExecutable
    || !runnerReady
    || !allPendingDisposed
    || approvedCount < 1
    || !identityConfirmed
    || !targetConfirmed
    || !textConfirmed
  )

  const handleDecision = (replyId, decision) => {
    setDecisions(current => ({ ...current, [replyId]: decision }))
  }

  const bulkDecision = decision => {
    setDecisions(current => {
      const next = { ...current }
      for (const reply of pendingDrafts) {
        if (!next[reply.reply_id]) next[reply.reply_id] = decision
      }
      return next
    })
  }

  const reviewDecisions = () => pendingDrafts.map(reply => ({
    reply_id: reply.reply_id,
    decision: decisions[reply.reply_id],
  }))

  const handleScan = async () => {
    setActionLoading(true)
    setError('')
    setNotice('')
    try {
      await requestCommenterScan(runId, notes)
      setNotice('V2.2 commenter scan requested. Refresh after the runner returns commenters.')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to request commenter scan.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleExecute = async () => {
    setActionLoading(true)
    setError('')
    setNotice('')
    try {
      if (run.current_step_id === 'carlos_approves_v2_reply_batch') {
        await reviewReplyBatch(runId, reviewDecisions(), notes)
      }
      await requestReplyBatchExecution(runId, notes)
      setNotice('V2.2 approved replies requested. Refresh evidence after the runner finishes.')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to request V2.2 reply execution.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRecovery = async decision => {
    setActionLoading(true)
    setError('')
    setNotice('')
    try {
      await sendRecoveryDecision(runId, artifact.stepId, decision, notes)
      setNotice(`Workflow decision recorded: ${decision}`)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to record recovery decision.')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading && !run) {
    return (
      <main style={{ display: 'grid', gap: '14px', maxWidth: '1180px', margin: '0 auto', color: '#e0ffe0' }}>
        <section style={{ ...PANEL, padding: '20px' }}>Loading personal engagement V2.2 workflow...</section>
      </main>
    )
  }

  return (
    <main style={{ display: 'grid', gap: '14px', maxWidth: '1180px', margin: '0 auto', color: '#e0ffe0' }}>
      <nav aria-label="Personal engagement V2.2 breadcrumbs" style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap', color: '#8abf8a', fontSize: '12px' }}>
        <Link to="/agenda#agenda" style={{ color: '#00e676', textDecoration: 'none' }}>Agenda</Link>
        <span>&gt;</span>
        <Link to={`/workflows/${runId}`} style={{ color: '#00e676', textDecoration: 'none' }}>{artifact.workflowTitle}</Link>
        <span>&gt;</span>
        <span>Personal engagement V2.2</span>
      </nav>

      {notice ? <div role="status" style={{ border: '1px solid #00e676', color: '#00e676', borderRadius: '5px', padding: '10px' }}>{notice}</div> : null}
      {error ? <div role="alert" style={{ border: '1px solid #ff4444', color: '#ffb3b3', background: '#260707', borderRadius: '5px', padding: '10px' }}>{error}</div> : null}
      {!HAS_MARKETING_ADMIN_KEY ? <div role="alert" style={{ border: '1px solid #ffd54f', color: '#ffe58a', background: '#1f1a05', borderRadius: '5px', padding: '10px' }}>Personal engagement V2.2 actions require the admin key in this dashboard environment.</div> : null}
      {unsupported ? <div role="alert" style={{ border: '1px solid #ff4444', color: '#ffb3b3', background: '#260707', borderRadius: '5px', padding: '10px' }}>This route only supports personal_engagement_v2_reply_batch workflow runs.</div> : null}
      {!artifact.routeMatches ? <div role="alert" style={{ border: '1px solid #ff4444', color: '#ffb3b3', background: '#260707', borderRadius: '5px', padding: '10px' }}>Route batch id does not match the workflow batch. Refusing to improvise.</div> : null}

      <section aria-label="Orientation banner" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '10px', borderColor: risk.tone }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '6px' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Orientation banner</div>
            <h1 style={{ margin: 0, color: '#e0ffe0', fontSize: '24px', letterSpacing: 0 }}>Personal Facebook Engagement V2.2: Multi-Commenter Reply Batch</h1>
            <div style={{ color: '#8abf8a', fontSize: '13px', lineHeight: 1.45 }}>
              {artifact.workflowTitle} | Step {artifact.stepNumber} of {artifact.stepCount} | {artifact.stepTitle} | {risk.label}
            </div>
            <div style={{ color: '#4a7a5a', fontSize: '12px', lineHeight: 1.45 }}>
              {artifact.workflowStatus} | {artifact.stepId} | max {artifact.batch.rateLimit?.max_replies_per_session || 5} approved replies
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <StatusPill tone={risk.tone}>{risk.label}</StatusPill>
            <StatusPill tone="#4da3ff">{artifact.batch.batchId}</StatusPill>
          </div>
        </div>
        <div style={{ color: risk.tone, fontSize: '12px', lineHeight: 1.45 }}>{risk.detail}</div>
      </section>

      <section aria-label="Active identity card" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px', borderColor: '#ffd54f' }}>
        <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active identity</div>
        <h2 style={{ color: '#e0ffe0', margin: 0, fontSize: '20px', letterSpacing: 0 }}>Acts as Carlos Herrera; not as Anymal OS</h2>
        <div style={{ color: '#ffe58a', fontSize: '12px', lineHeight: 1.45 }}>Dedicated Chrome profile: {artifact.batch.profileUserDataDir}</div>
        <DestinationConfirmCheckbox checked={identityConfirmed} onChange={setIdentityConfirmed} label="I confirm this batch will be performed as Carlos Herrera." />
      </section>

      <section aria-label="Target post card" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target post</div>
        <h2 style={{ color: '#e0ffe0', margin: 0, fontSize: '20px', letterSpacing: 0 }}>{artifact.batch.targetPostAuthor || 'Anymal OS'}</h2>
        <a href={artifact.batch.targetPostUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#00e676', fontSize: '12px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
          {artifact.batch.targetPostUrl || 'No target URL'}
        </a>
        <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>{artifact.batch.targetPostExcerpt || 'No excerpt captured'}</div>
        <div style={{ color: '#4a7a5a', fontSize: '10px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>target_hash: {artifact.batch.targetPostUrlHash || 'unknown'}</div>
        <DestinationConfirmCheckbox checked={targetConfirmed} onChange={setTargetConfirmed} label="I confirm the target post is correct." />
      </section>

      <section aria-label="Commenter list panel" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'start' }}>
          <div>
            <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Commenter list panel</div>
            <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>{artifact.batch.replyCount} commenter{artifact.batch.replyCount === 1 ? '' : 's'} detected</h2>
          </div>
          {canRequestScan ? <button type="button" onClick={handleScan} disabled={!canRequestScan} style={buttonStyle({ filled: true, tone: '#4da3ff', disabled: !canRequestScan })}>Request commenter scan</button> : null}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '10px' }}>
          <DataCard label="Selected" value={String(artifact.batch.commenterScan.selected_commenter_count ?? artifact.batch.replyCount)} tone="#00e676" />
          <DataCard label="Detected" value={String(artifact.batch.commenterScan.detected_commenter_count ?? 'unknown')} tone="#4da3ff" />
          <DataCard label="Truncated" value={String(artifact.batch.commenterScan.truncated_commenter_count ?? 0)} tone="#ffd54f" />
        </div>
        {artifact.batch.replyCandidates.length ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            {artifact.batch.replyCandidates.map(reply => (
              <div key={reply.reply_id || reply.commenter_handle} style={{ border: '1px solid #1a3a2a', borderRadius: '5px', padding: '10px', color: '#c8f7c8', fontSize: '12px', lineHeight: 1.45 }}>
                <strong>{reply.commenter_handle || 'Unknown commenter'}</strong>: {reply.commenter_comment_excerpt || reply.refusal_reason || 'No excerpt captured'}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#8abf8a', fontSize: '12px' }}>No commenters have been scanned yet.</div>
        )}
      </section>

      <section aria-label="Per-reply cards" style={{ display: 'grid', gap: '12px' }}>
        {artifact.batch.replyCandidates.map(reply => (
          <ReplyCard
            key={reply.reply_id || reply.commenter_handle}
            reply={reply}
            decision={decisionFor(reply, decisions)}
            onDecision={handleDecision}
          />
        ))}
      </section>

      <section aria-label="Bulk action panel" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bulk action panel</div>
          <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>Disposition remaining drafts</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => bulkDecision('approved')} disabled={!pendingDrafts.length} style={buttonStyle({ tone: '#00e676', disabled: !pendingDrafts.length })}>Approve all remaining</button>
          <button type="button" onClick={() => bulkDecision('vetoed')} disabled={!pendingDrafts.length} style={buttonStyle({ tone: '#ff7a45', disabled: !pendingDrafts.length })}>Veto all remaining</button>
        </div>
      </section>

      <section aria-label="Final confirmation" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Final confirmation</div>
          <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>{approvedCount} approved repl{approvedCount === 1 ? 'y' : 'ies'}</h2>
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          <DestinationConfirmCheckbox checked={identityConfirmed} onChange={setIdentityConfirmed} label="I confirm Carlos Herrera identity." />
          <DestinationConfirmCheckbox checked={targetConfirmed} onChange={setTargetConfirmed} label="I confirm target is correct." />
          <DestinationConfirmCheckbox checked={textConfirmed} onChange={setTextConfirmed} label="I approve the exact text of each approved reply." />
        </div>
        <label style={{ display: 'grid', gap: '6px' }}>
          <span style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Operator notes</span>
          <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional note for this V2.2 reply batch" style={{ minHeight: '64px', resize: 'vertical', background: '#021a0e', color: '#e0ffe0', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px', fontSize: '12px', fontFamily: MONO_FONT }} />
        </label>
        <button type="button" onClick={handleExecute} disabled={executeDisabled} style={buttonStyle({ filled: true, tone: '#ff7a45', disabled: executeDisabled })}>
          {actionLoading ? 'Working...' : artifact.outcomeStatus === 'completed' ? 'Reply batch complete' : 'Execute approved replies'}
        </button>
        {!allPendingDisposed ? <div style={{ color: '#ffd54f', fontSize: '12px' }}>All replies must be approved or vetoed before execution.</div> : null}
      </section>

      <section aria-label="Chrome runner availability indicator" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'start' }}>
          <div>
            <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Chrome runner availability</div>
            <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>Dedicated profile must be available</h2>
          </div>
          <button type="button" onClick={load} disabled={loading || actionLoading} style={buttonStyle({ tone: '#4da3ff', disabled: loading || actionLoading })}>Refresh runner status</button>
        </div>
        <RunnerAvailabilityIndicator runner={artifact.runnerAvailability} />
        {artifact.latestBrowserTask ? (
          <div style={{ color: runnerTone(artifact.runnerAvailability.state), fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
            latest_task: {artifact.latestBrowserTask.browser_task_id || artifact.latestBrowserTask.task_id || 'unknown'} | {artifact.latestBrowserTask.status || 'unknown'}
          </div>
        ) : (
          <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>No V2.2 browser task has been requested for this run yet.</div>
        )}
      </section>

      <section aria-label="Evidence panel" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Evidence panel</div>
          <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>Per-reply evidence</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '10px' }}>
          {artifact.evidenceRows.map(row => <EvidenceCard key={row.id} row={row} />)}
        </div>
      </section>

      <section aria-label="Recovery actions" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recovery actions</div>
          <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>Block on uncertainty</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => handleRecovery('changes_requested')} disabled={!artifact.recoveryEnabled || actionLoading} style={buttonStyle({ tone: '#ffd54f', disabled: !artifact.recoveryEnabled || actionLoading })}>Request changes</button>
          <button type="button" onClick={() => handleRecovery('blocked')} disabled={!artifact.recoveryEnabled || actionLoading} style={buttonStyle({ tone: '#ff4444', disabled: !artifact.recoveryEnabled || actionLoading })}>Block workflow</button>
          <button type="button" onClick={load} disabled={loading || actionLoading} style={buttonStyle({ tone: '#4da3ff', disabled: loading || actionLoading })}>Refresh evidence</button>
          <button type="button" onClick={() => navigate(`/workflows/${runId}`)} style={buttonStyle({ tone: '#8abf8a' })}>Return to cockpit</button>
        </div>
      </section>
    </main>
  )
}
