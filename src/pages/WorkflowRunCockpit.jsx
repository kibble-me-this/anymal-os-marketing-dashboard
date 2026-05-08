import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { HAS_MARKETING_ADMIN_KEY, MARKETING_API, adminHeaders, headers } from '../config'
import {
  CarlosTaskCard,
  EvidencePanel,
  NextClickPanel,
  OrientationLine,
  SourceFreshnessPanel,
  TechnicalDetails,
  WorkflowBreadcrumbs,
} from '../components/dashboard/workflowCockpit'
import {
  buildCarlosTask,
  buildEvidenceRows,
  LAST_WORKFLOW_STORAGE_KEY,
  normalizeZip,
  sourceFreshnessState,
} from '../components/dashboard/workflowCockpitModel'

const REVIEW_STATUSES = [
  'published',
  'needs_creative_review',
  'needs_review_stale_anchor',
  'generated',
  'draft',
  'ready',
  'approved',
  'pending',
]

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

function mergeCampaignRows(rows) {
  const map = new Map()
  rows.flat().forEach(campaign => {
    const id = campaign?.campaign_id || campaign?.doc_id
    if (id) map.set(id, campaign)
  })
  return Array.from(map.values())
}

async function fetchCampaignRowsForZip(zip) {
  if (!zip) return []
  const requests = [
    fetch(`${MARKETING_API}/campaigns/pending/by-channel?limit=100`, { headers, cache: 'no-store' }),
    ...REVIEW_STATUSES.map(status => fetch(`${MARKETING_API}/campaigns?status=${encodeURIComponent(status)}&limit=100`, { headers, cache: 'no-store' })),
  ]
  const responses = await Promise.all(requests)
  const bodies = await Promise.all(responses.map(async res => {
    if (!res.ok) throw new Error(await readErrorDetail(res))
    return res.json()
  }))
  return mergeCampaignRows(bodies.map(body => body.campaigns || []))
    .filter(campaign => normalizeZip(campaign.zip) === zip)
}

async function fetchShareOutcomesForZip(zip) {
  if (!zip) return []
  const res = await fetch(`${MARKETING_API}/share-outcomes?zip=${encodeURIComponent(zip)}&limit=100`, {
    headers: adminHeaders,
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  const body = await res.json()
  return body.share_outcomes || []
}

export default function WorkflowRunCockpit() {
  const { runId } = useParams()
  const [run, setRun] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [shareOutcomes, setShareOutcomes] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [notes, setNotes] = useState('')
  const [lastLoadedAt, setLastLoadedAt] = useState(null)

  const loadWorkflow = useCallback(async () => {
    if (!runId) return
    if (!HAS_MARKETING_ADMIN_KEY) {
      setError('Workflow cockpit requires VITE_MARKETING_ADMIN_KEY.')
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
      const zip = normalizeZip(nextRun?.linked_entities?.zip)
      const [campaignRows, shareRows] = await Promise.all([
        fetchCampaignRowsForZip(zip),
        fetchShareOutcomesForZip(zip),
      ])
      setRun(nextRun)
      setCampaigns(campaignRows)
      setShareOutcomes(shareRows)
      setLastLoadedAt(new Date().toISOString())
    } catch (err) {
      setError(`Workflow load failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    loadWorkflow()
  }, [loadWorkflow])

  const evidenceRows = useMemo(() => buildEvidenceRows({ run, campaigns, shareOutcomes }), [campaigns, run, shareOutcomes])
  const task = useMemo(() => buildCarlosTask(run, evidenceRows, shareOutcomes), [evidenceRows, run, shareOutcomes])
  const sourceState = useMemo(() => sourceFreshnessState({ lastLoadedAt, campaigns, shareOutcomes, run }), [campaigns, lastLoadedAt, run, shareOutcomes])

  useEffect(() => {
    if (!run?.run_id || run.workflow_type !== 'zip_price_activation') return
    try {
      localStorage.setItem(LAST_WORKFLOW_STORAGE_KEY, JSON.stringify({
        runId: run.run_id,
        zip: normalizeZip(run.linked_entities?.zip),
        stepNumber: task?.stepNumber || null,
        stepCount: task?.stepCount || (run.steps || []).length || null,
        stepTitle: task?.title || run.current_step_id || '',
        status: run.status || '',
        updatedAt: new Date().toISOString(),
      }))
    } catch {
      // Local storage is only a resume convenience. The cockpit still works without it.
    }
  }, [run, task])

  const recordDecision = async (decision) => {
    if (!run?.run_id || !task?.step?.step_id) return
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(run.run_id)}/operator-decision`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          step_id: task.step.step_id,
          decision,
          operator_notes: notes || undefined,
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const nextRun = await res.json()
      setRun(nextRun)
      setSuccess(`Workflow decision recorded: ${decision}`)
      setNotes('')
      await loadWorkflow()
    } catch (err) {
      setError(`Workflow action failed: ${err.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  const runSafeStep = async () => {
    if (!run?.run_id) return
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(run.run_id)}/run-next-step`, {
        method: 'POST',
        headers: adminHeaders,
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const nextRun = await res.json()
      setRun(nextRun)
      setSuccess(`Workflow advanced: ${nextRun.current_step_id || nextRun.status}`)
      await loadWorkflow()
    } catch (err) {
      setError(`Safe step failed: ${err.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  const requestShareStaging = async () => {
    const shareOutcomeId = task?.shareOutcomeId
    if (!shareOutcomeId) return
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`${MARKETING_API}/share-outcomes/${encodeURIComponent(shareOutcomeId)}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({
          status: 'staging_requested',
          status_reason: 'dashboard_cockpit_requested_browser_staging',
          operator_notes: notes || 'Carlos requested browser staging from the workflow cockpit.',
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      setSuccess(`Browser staging requested for ${task?.handoffTargetName || shareOutcomeId}. Refresh will show the desktop runner handoff status.`)
      setNotes('')
      await loadWorkflow()
    } catch (err) {
      setError(`Browser staging request failed: ${err.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  const handlePrimary = () => {
    if (task?.actionType === 'safe') return runSafeStep()
    if (task?.actionType === 'decision') return recordDecision('approved')
    if (task?.actionType === 'request_staging') return requestShareStaging()
    return loadWorkflow()
  }

  const zip = sourceState?.zip || normalizeZip(run?.linked_entities?.zip)
  const unsupported = run && run.workflow_type !== 'zip_price_activation'

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'grid', gap: '14px' }}>
      <WorkflowBreadcrumbs zip={zip} stepNumber={task?.stepNumber} />

      {error && <div role="alert" style={{ border: '1px solid #ff4444', background: '#260707', color: '#ffb3b3', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>{error}</div>}
      {success && <div role="status" style={{ border: '1px solid #00e676', background: '#062010', color: '#00e676', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>{success}</div>}

      {loading && !run && (
        <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '28px', color: '#8abf8a', textAlign: 'center', fontSize: '13px' }}>
          Loading workflow run...
        </section>
      )}

      {unsupported && (
        <section style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', padding: '16px', color: '#ffe58a', display: 'grid', gap: '8px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', letterSpacing: 0 }}>Cockpit V1 supports ZIP launches only</h1>
          <div style={{ fontSize: '13px', lineHeight: 1.45 }}>
            This run is {run.workflow_type || 'unknown'}. Relationship growth and other workflow routes are deferred to V2.
          </div>
          <Link to="/agenda#agenda" style={{ color: '#00e676', fontSize: '12px' }}>Return to Agenda</Link>
        </section>
      )}

      {run && !unsupported && (
        <>
          <OrientationLine run={run} task={task} sourceState={sourceState} />
          <CarlosTaskCard
            task={task}
            notes={notes}
            onNotesChange={setNotes}
            onPrimary={handlePrimary}
            onDecision={recordDecision}
            loading={actionLoading}
          />
          <NextClickPanel task={task} />
          <EvidencePanel rows={evidenceRows} />
          <SourceFreshnessPanel sourceState={sourceState} onRefresh={loadWorkflow} loading={loading} />
          <TechnicalDetails run={run} />
        </>
      )}
    </div>
  )
}
