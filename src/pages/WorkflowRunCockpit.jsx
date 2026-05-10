import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
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
  facebookPageCampaign,
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

async function fetchBrowserTasksForRun(runId) {
  if (!runId) return []
  const params = new URLSearchParams({
    workflow_run_id: runId,
    task_type: 'zip_share_staging',
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

export default function WorkflowRunCockpit() {
  const { runId } = useParams()
  const [searchParams] = useSearchParams()
  const [run, setRun] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [shareOutcomes, setShareOutcomes] = useState([])
  const [browserTasks, setBrowserTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [notes, setNotes] = useState('')
  const [destinationConfirmation, setDestinationConfirmation] = useState({ key: '', checked: false })
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
      const [campaignRows, shareRows, taskRows] = await Promise.all([
        fetchCampaignRowsForZip(zip),
        fetchShareOutcomesForZip(zip),
        fetchBrowserTasksForRun(nextRun?.run_id || runId),
      ])
      setRun(nextRun)
      setCampaigns(campaignRows)
      setShareOutcomes(shareRows)
      setBrowserTasks(taskRows)
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
  const task = useMemo(() => buildCarlosTask(run, evidenceRows, shareOutcomes, browserTasks), [browserTasks, evidenceRows, run, shareOutcomes])
  const sourceState = useMemo(() => sourceFreshnessState({ lastLoadedAt, campaigns, shareOutcomes, run, browserTasks }), [browserTasks, campaigns, lastLoadedAt, run, shareOutcomes])
  const pagePublishCampaign = useMemo(() => facebookPageCampaign(campaigns, sourceState?.zip || run?.linked_entities?.zip), [campaigns, run, sourceState?.zip])
  const pagePublishHref = pagePublishCampaign?.campaign_id && run?.run_id
    ? `/workflows/${encodeURIComponent(run.run_id)}/page-publish/${encodeURIComponent(pagePublishCampaign.campaign_id)}`
    : ''

  useEffect(() => {
    const publishStatus = searchParams.get('page_publish')
    if (publishStatus === 'success') {
      setSuccess('Page publish evidence returned. Review evidence below, then approve the gate when ready.')
    } else if (publishStatus === 'changes_requested') {
      setSuccess('Page publish changes were requested. Workflow state was updated.')
    } else if (publishStatus === 'blocked') {
      setSuccess('Page publish was blocked. Workflow state was updated.')
    }
  }, [searchParams])

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

  const destinationConfirmationKey = `${run?.run_id || ''}:${task?.step?.step_id || ''}:${task?.targetGroupName || ''}:${task?.targetGroupUrl || ''}`
  const destinationConfirmed = destinationConfirmation.key === destinationConfirmationKey && destinationConfirmation.checked

  const recordDecision = async (decision) => {
    if (!run?.run_id || !task?.step?.step_id) return
    const isPositiveClickPostDecision = task.step.step_id === 'click_post' && ['approved', 'completed'].includes(decision)
    if (isPositiveClickPostDecision && task.requiresDestinationConfirmation && !destinationConfirmed) {
      setError('Confirm the staged Facebook composer destination before approving this Post review gate.')
      return
    }
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const destinationNote = isPositiveClickPostDecision && task.targetGroupName
        ? `Destination confirmed: ${task.targetGroupName}${task.targetGroupUrl ? ` (${task.targetGroupUrl})` : ''}`
        : ''
      const operatorNotes = [notes, destinationNote].filter(Boolean).join('\n')
      const res = await fetch(`${MARKETING_API}/marketing-agenda/runs/${encodeURIComponent(run.run_id)}/operator-decision`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          step_id: task.step.step_id,
          decision,
          operator_notes: operatorNotes || undefined,
          observed_status: isPositiveClickPostDecision ? 'submitted_visible_or_feed' : undefined,
        }),
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const nextRun = await res.json()
      setRun(nextRun)
      setSuccess(`Workflow decision recorded: ${decision}`)
      setNotes('')
      setDestinationConfirmation({ key: '', checked: false })
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
  const personalActionId = run?.linked_entities?.action_id || ''
  const personalEngagementHref = personalActionId && run?.workflow_type === 'personal_account_engagement'
    ? `/workflows/${encodeURIComponent(run.run_id)}/personal-engagement/${encodeURIComponent(personalActionId)}`
    : personalActionId && run?.workflow_type === 'personal_engagement_v2_action'
      ? `/workflows/${encodeURIComponent(run.run_id)}/personal-engagement-v2/${encodeURIComponent(personalActionId)}`
      : ''

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
          {personalEngagementHref && (
            <Link to={personalEngagementHref} style={{ color: '#00e676', fontSize: '12px' }}>Open personal engagement surface</Link>
          )}
          <Link to="/agenda#agenda" style={{ color: '#00e676', fontSize: '12px' }}>Return to Agenda</Link>
        </section>
      )}

      {run && !unsupported && (
        <>
          <OrientationLine run={run} task={task} sourceState={sourceState} />
          <CarlosTaskCard
            task={task}
            pagePublishHref={pagePublishHref}
            notes={notes}
            onNotesChange={setNotes}
            onPrimary={handlePrimary}
            onDecision={recordDecision}
            loading={actionLoading}
            destinationConfirmed={destinationConfirmed}
            onDestinationConfirmedChange={checked => setDestinationConfirmation({ key: destinationConfirmationKey, checked })}
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
