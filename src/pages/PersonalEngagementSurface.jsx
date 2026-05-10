import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HAS_MARKETING_ADMIN_KEY, MARKETING_API, adminHeaders } from '../config'
import {
  buildPersonalEngagementView,
} from '../components/dashboard/personalEngagementModel'
import { DestinationConfirmCheckbox, RunnerAvailabilityIndicator, StatusPill } from '../components/dashboard/workflowControls'
import { buttonStyle, dashboardFonts } from '../components/dashboard/workflowControlStyles'
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

async function fetchPersonalBrowserTasks(runId) {
  const params = new URLSearchParams({
    workflow_run_id: runId,
    task_type: 'personal_engagement_like',
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

async function approvePersonalAction(runId, notes) {
  const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(runId)}/operator-decision`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      step_id: 'carlos_approves_personal_action',
      decision: 'approved',
      operator_notes: notes || 'Carlos confirmed identity and target for personal engagement like.',
    }),
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return res.json()
}

async function requestPersonalEngagement(runId, notes) {
  const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(runId)}/personal-engagement/request`, {
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

function NextClickPanel() {
  return (
    <section aria-label="Next click will and will not" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '12px' }}>
      <article style={{ ...PANEL, padding: '14px', display: 'grid', gap: '8px' }}>
        <h2 style={{ margin: 0, color: '#00e676', fontSize: '16px', letterSpacing: 0 }}>Next Click Will</h2>
        <div style={{ color: '#c8f7c8', fontSize: '12px', lineHeight: 1.45 }}>Approve one like action as Carlos Herrera if needed.</div>
        <div style={{ color: '#c8f7c8', fontSize: '12px', lineHeight: 1.45 }}>Ask the dedicated Chrome runner to attempt only the approved like.</div>
      </article>
      <article style={{ ...PANEL, padding: '14px', display: 'grid', gap: '8px' }}>
        <h2 style={{ margin: 0, color: '#ffb3b3', fontSize: '16px', letterSpacing: 0 }}>Next Click Will Not</h2>
        <div style={{ color: '#ffc8c8', fontSize: '12px', lineHeight: 1.45 }}>Comment, join, follow, share, post, submit, send, or publish.</div>
        <div style={{ color: '#ffc8c8', fontSize: '12px', lineHeight: 1.45 }}>Use Carlos's regular Chrome session if the dedicated profile is unavailable.</div>
      </article>
    </section>
  )
}

export default function PersonalEngagementSurface() {
  const { runId, actionId } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [browserTasks, setBrowserTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [notes, setNotes] = useState('')
  const [identityConfirmed, setIdentityConfirmed] = useState(false)
  const [targetConfirmed, setTargetConfirmed] = useState(false)
  const [lastLoadedAt, setLastLoadedAt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextRun, nextBrowserTasks] = await Promise.all([
        fetchWorkflowRun(runId),
        fetchPersonalBrowserTasks(runId),
      ])
      setRun(nextRun)
      setBrowserTasks(nextBrowserTasks)
      setLastLoadedAt(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load personal engagement workflow.')
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    load()
  }, [load])

  const artifact = useMemo(() => (
    buildPersonalEngagementView({ run, browserTasks, lastLoadedAt, routeActionId: actionId })
  ), [run, browserTasks, lastLoadedAt, actionId])

  const risk = riskCopy('live_external')
  const unsupported = run && run.workflow_type !== 'personal_account_engagement'
  const primaryDisabled = Boolean(
    loading
    || actionLoading
    || unsupported
    || !HAS_MARKETING_ADMIN_KEY
    || !artifact.isActionable
    || artifact.runnerAvailability.state !== 'green'
    || !identityConfirmed
    || !targetConfirmed
  )

  const handleExecute = async () => {
    setActionLoading(true)
    setError('')
    setNotice('')
    try {
      if (run.current_step_id === 'carlos_approves_personal_action') {
        await approvePersonalAction(runId, notes)
      }
      await requestPersonalEngagement(runId, notes)
      setNotice('Personal engagement like requested. Refresh evidence after the runner finishes.')
      await load()
    } catch (err) {
      setError(err.message || 'Failed to request the personal engagement like.')
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
        <section style={{ ...PANEL, padding: '20px' }}>Loading personal engagement workflow...</section>
      </main>
    )
  }

  return (
    <main style={{ display: 'grid', gap: '14px', maxWidth: '1180px', margin: '0 auto', color: '#e0ffe0' }}>
      <nav aria-label="Personal engagement breadcrumbs" style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap', color: '#8abf8a', fontSize: '12px' }}>
        <Link to="/agenda#agenda" style={{ color: '#00e676', textDecoration: 'none' }}>Agenda</Link>
        <span>&gt;</span>
        <Link to={`/workflows/${runId}`} style={{ color: '#00e676', textDecoration: 'none' }}>{artifact.workflowTitle}</Link>
        <span>&gt;</span>
        <span>Personal engagement</span>
      </nav>

      {notice ? <div role="status" style={{ border: '1px solid #00e676', color: '#00e676', borderRadius: '5px', padding: '10px' }}>{notice}</div> : null}
      {error ? <div role="alert" style={{ border: '1px solid #ff4444', color: '#ffb3b3', background: '#260707', borderRadius: '5px', padding: '10px' }}>{error}</div> : null}
      {!HAS_MARKETING_ADMIN_KEY ? <div role="alert" style={{ border: '1px solid #ffd54f', color: '#ffe58a', background: '#1f1a05', borderRadius: '5px', padding: '10px' }}>Personal engagement actions require the admin key in this dashboard environment.</div> : null}
      {unsupported ? <div role="alert" style={{ border: '1px solid #ff4444', color: '#ffb3b3', background: '#260707', borderRadius: '5px', padding: '10px' }}>This route only supports personal_account_engagement workflow runs.</div> : null}
      {!artifact.routeMatches ? <div role="alert" style={{ border: '1px solid #ff4444', color: '#ffb3b3', background: '#260707', borderRadius: '5px', padding: '10px' }}>Route action id does not match the workflow action. Refusing to improvise.</div> : null}

      <section aria-label="5 second orientation" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '10px', borderColor: risk.tone }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '6px' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>5 second orientation</div>
            <h1 style={{ margin: 0, color: '#e0ffe0', fontSize: '24px', letterSpacing: 0 }}>Personal account Like</h1>
            <div style={{ color: '#8abf8a', fontSize: '13px', lineHeight: 1.45 }}>
              {artifact.workflowTitle} | Step {artifact.stepNumber} of {artifact.stepCount} | {artifact.stepTitle} | {risk.label}
            </div>
            <div style={{ color: '#4a7a5a', fontSize: '12px', lineHeight: 1.45 }}>
              {artifact.workflowStatus} | {artifact.stepId} | one approved like only
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <StatusPill tone={risk.tone}>{risk.label}</StatusPill>
            <StatusPill tone="#4da3ff">{artifact.action.actionId}</StatusPill>
          </div>
        </div>
        <div style={{ color: risk.tone, fontSize: '12px', lineHeight: 1.45 }}>{risk.detail}</div>
      </section>

      <section aria-label="Active identity" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px', borderColor: '#ffd54f' }}>
        <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active identity</div>
        <h2 style={{ color: '#e0ffe0', margin: 0, fontSize: '20px', letterSpacing: 0 }}>Acts as Carlos Herrera; not as Anymal OS</h2>
        <div style={{ color: '#ffe58a', fontSize: '12px', lineHeight: 1.45 }}>Dedicated Chrome profile: {artifact.action.profileUserDataDir}</div>
        <DestinationConfirmCheckbox
          checked={identityConfirmed}
          onChange={setIdentityConfirmed}
          label="I confirm this action will be performed as Carlos Herrera."
        />
      </section>

      <section aria-label="Target" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target</div>
        <h2 style={{ color: '#e0ffe0', margin: 0, fontSize: '20px', letterSpacing: 0 }}>{artifact.action.targetName}</h2>
        <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>Target type: {artifact.action.targetType}</div>
        <a href={artifact.action.targetUrl || artifact.action.startUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#00e676', fontSize: '12px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
          {artifact.action.targetUrl || artifact.action.startUrl}
        </a>
        <DestinationConfirmCheckbox
          checked={targetConfirmed}
          onChange={setTargetConfirmed}
          label="I confirm the target is correct."
        />
      </section>

      <section aria-label="Exact action" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Exact action</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '12px' }}>
          <DataCard label="Action verb" value={artifact.action.actionVerb} tone="#ff7a45" />
          <DataCard label="Risk label" value={risk.label} tone={risk.tone} />
          <DataCard label="Scope" value="One approved like only" tone="#ffd54f" />
        </div>
      </section>

      <NextClickPanel />

      <section aria-label="Chrome runner" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'start' }}>
          <div>
            <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Chrome runner availability</div>
            <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>Dedicated profile must be available</h2>
          </div>
          <button type="button" onClick={load} disabled={loading || actionLoading} style={buttonStyle({ tone: '#4da3ff', disabled: loading || actionLoading })}>
            Refresh runner status
          </button>
        </div>
        <RunnerAvailabilityIndicator runner={artifact.runnerAvailability} />
        {artifact.latestBrowserTask ? (
          <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
            latest_task: {artifact.latestBrowserTask.browser_task_id || artifact.latestBrowserTask.task_id || 'unknown'} | {artifact.latestBrowserTask.status || 'unknown'}
          </div>
        ) : (
          <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>No browser task has been requested for this run yet.</div>
        )}
      </section>

      <section style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <label style={{ display: 'grid', gap: '6px' }}>
          <span style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Operator notes</span>
          <textarea
            value={notes}
            onChange={event => setNotes(event.target.value)}
            placeholder="Optional note for this like request"
            style={{ minHeight: '64px', resize: 'vertical', background: '#021a0e', color: '#e0ffe0', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px', fontSize: '12px', fontFamily: MONO_FONT }}
          />
        </label>
        <button type="button" onClick={handleExecute} disabled={primaryDisabled} style={buttonStyle({ filled: true, tone: '#ff7a45', disabled: primaryDisabled })}>
          {actionLoading ? 'Working...' : artifact.outcomeStatus === 'completed' ? 'Like complete' : 'Execute approved like'}
        </button>
      </section>

      <section aria-label="Evidence" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Evidence</div>
          <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>All required evidence fields are explicit</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '10px' }}>
          {artifact.evidenceRows.map(row => <EvidenceCard key={row.id} row={row} />)}
        </div>
      </section>

      <section aria-label="Recovery actions" style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recovery actions</div>
          <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>Block on uncertainty</h2>
          <p style={{ color: '#8abf8a', margin: '7px 0 0 0', fontSize: '12px', lineHeight: 1.45 }}>
            Recovery controls unlock only after a failed or blocked outcome is recorded.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => handleRecovery('changes_requested')} disabled={!artifact.recoveryEnabled || actionLoading} style={buttonStyle({ tone: '#ffd54f', disabled: !artifact.recoveryEnabled || actionLoading })}>
            Request changes
          </button>
          <button type="button" onClick={() => handleRecovery('blocked')} disabled={!artifact.recoveryEnabled || actionLoading} style={buttonStyle({ tone: '#ff4444', disabled: !artifact.recoveryEnabled || actionLoading })}>
            Block workflow
          </button>
          <button type="button" onClick={load} disabled={loading || actionLoading} style={buttonStyle({ tone: '#4da3ff', disabled: loading || actionLoading })}>
            Refresh evidence
          </button>
          <button type="button" onClick={() => navigate(`/workflows/${runId}`)} style={buttonStyle({ tone: '#8abf8a' })}>
            Return to cockpit
          </button>
        </div>
      </section>
    </main>
  )
}
