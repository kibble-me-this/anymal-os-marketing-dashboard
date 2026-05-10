const SCAN_STEP_ID = 'scan_post_commenters'
const APPROVAL_STEP_ID = 'carlos_approves_v2_reply_batch'
const EXECUTE_STEP_ID = 'execute_v2_reply_batch_in_chrome'
const OUTCOME_STEP_ID = 'record_v2_reply_batch_outcome'
const EXPECTED_IDENTITY = 'Carlos Herrera'

export const APPROVABLE_REPLY_STATUSES = new Set(['draft_pending_approval'])
export const APPROVED_REPLY_STATUSES = new Set(['approved_for_execution'])
export const VETOED_REPLY_STATUSES = new Set(['vetoed_by_operator'])
export const TERMINAL_REFUSAL_STATUSES = new Set([
  'phase_v22_already_replied_recently',
  'phase_v22_text_generation_failed',
  'phase_v22_commenter_scan_failed',
])

export const PERSONAL_V22_RECOVERY_STATUSES = new Set([
  'failed',
  'blocked_identity_mismatch',
  'blocked_target_mismatch',
  'blocked_ui_not_found',
  'blocked_login_state_missing',
  'blocked_profile_unavailable',
  'blocked_text_hash_mismatch',
  'posted_to_wrong_destination',
  'needs_manual_review',
  'phase_v22_reply_box_not_found',
  'phase_v22_commenter_scan_failed',
])

const ACTIVE_TASK_STATUSES = new Set(['requested', 'picked_up', 'browser_opened', 'in_progress'])
const RED_TASK_STATUSES = new Set(['failed', 'cancelled', 'blocked_by_stop_condition'])

function stepById(run, stepId) {
  return (run?.steps || []).find(step => step.step_id === stepId) || null
}

function stepResult(run, stepId) {
  const result = stepById(run, stepId)?.result
  return result && typeof result === 'object' ? result : {}
}

function latestByTimestamp(items) {
  return [...(items || [])].sort((left, right) => {
    const leftTime = new Date(left.updated_at || left.created_at || 0).getTime()
    const rightTime = new Date(right.updated_at || right.created_at || 0).getTime()
    return rightTime - leftTime
  })[0] || null
}

function pickBatch(run) {
  const prepared = stepResult(run, 'prepare_v2_reply_batch_session')
  const generated = stepResult(run, 'generate_v2_reply_drafts')
  const approved = stepResult(run, APPROVAL_STEP_ID)
  const execute = stepResult(run, EXECUTE_STEP_ID)
  const outcome = stepResult(run, OUTCOME_STEP_ID)
  const candidates = [
    outcome.personal_engagement_v2_reply_batch,
    generated.personal_engagement_v2_reply_batch,
    prepared.personal_engagement_v2_reply_batch,
    approved.personal_engagement_v2_reply_batch,
    execute.personal_engagement_v2_reply_batch,
    generated,
    prepared,
    approved,
    execute,
  ]
  return candidates.find(candidate => candidate && typeof candidate === 'object' && Object.keys(candidate).length) || {}
}

export function personalV22BatchPacket(run) {
  const linked = run?.linked_entities || {}
  const batch = pickBatch(run)
  const scan = stepResult(run, SCAN_STEP_ID)
  const execute = stepResult(run, EXECUTE_STEP_ID)
  const candidates = Array.isArray(batch.reply_candidates) ? batch.reply_candidates : []
  return {
    batchId: linked.batch_id || batch.personal_engagement_v2_reply_batch_id || batch.batch_id || 'unknown_batch',
    identityName: linked.identity_name || batch.identity_name || EXPECTED_IDENTITY,
    targetPostUrl: linked.target_post_url || batch.target_post_url || scan.target_post_url || execute.target_post_url || '',
    targetPostUrlHash: linked.target_post_url_hash || batch.target_post_url_hash || scan.target_post_url_hash || execute.target_post_url_hash || '',
    targetPostAuthor: linked.target_post_author || batch.target_post_author || 'Anymal OS',
    targetPostExcerpt: linked.target_post_excerpt || batch.target_post_excerpt || '',
    voiceProfileVersion: linked.voice_profile_version || batch.voice_profile_version || 'carlos:v1',
    profileUserDataDir: linked.profile_user_data_dir || batch.profile_user_data_dir || 'Dedicated PersonalEngagement profile path not exposed',
    sessionStatus: batch.session_status || 'not prepared',
    rateLimit: batch.rate_limit || {},
    safetyScoring: batch.safety_scoring || {},
    costLedger: batch.cost_ledger || {},
    commenterScan: batch.commenter_scan || scan || {},
    replyCandidates: candidates,
    replyCount: candidates.length,
    approvedReplyCount: candidates.filter(reply => APPROVED_REPLY_STATUSES.has(reply.status)).length,
    vetoedReplyCount: candidates.filter(reply => VETOED_REPLY_STATUSES.has(reply.status)).length,
    pendingReplyCount: candidates.filter(reply => APPROVABLE_REPLY_STATUSES.has(reply.status)).length,
    executedReplyCount: candidates.filter(reply => reply.status === 'executed_completed').length,
    failedReplyCount: candidates.filter(reply => PERSONAL_V22_RECOVERY_STATUSES.has(reply.status)).length,
  }
}

export function personalV22Outcome(run) {
  const outcomeStep = stepResult(run, OUTCOME_STEP_ID)
  if (outcomeStep.personal_engagement_v2_reply_batch) return outcomeStep.personal_engagement_v2_reply_batch
  const execute = stepResult(run, EXECUTE_STEP_ID)
  if (execute.outcome_status || execute.reply_outcomes) {
    return {
      session_status: execute.batch_status || execute.outcome_status,
      reply_outcomes: execute.reply_outcomes || [],
      error_if_any: execute.error_if_any,
    }
  }
  return null
}

export function latestPersonalV22BrowserTask(browserTasks) {
  return latestByTimestamp(browserTasks)
}

export function runnerAvailabilityForPersonalV22(browserTasks, run) {
  const latestTask = latestPersonalV22BrowserTask(browserTasks)
  const batch = personalV22BatchPacket(run)
  const status = latestTask?.status

  if (batch.sessionStatus === 'completed') {
    return { state: 'green', label: 'Completed', detail: 'The V2.2 reply batch outcome is recorded.' }
  }

  if (batch.sessionStatus === 'failed') {
    return { state: 'red', label: 'Blocked or failed', detail: 'At least one V2.2 reply outcome needs review.' }
  }

  if (RED_TASK_STATUSES.has(status)) {
    return { state: 'red', label: 'Runner blocked', detail: latestTask.error_if_any || `Latest task is ${status}.` }
  }

  if (ACTIVE_TASK_STATUSES.has(status)) {
    return { state: 'yellow', label: 'Runner working', detail: `Latest task is ${status}. Refresh before asking again.` }
  }

  if (run?.current_step_id === SCAN_STEP_ID) {
    return { state: 'green', label: 'Ready to scan', detail: 'Dedicated Chrome profile can scan visible commenters.' }
  }

  if (run?.current_step_id === EXECUTE_STEP_ID) {
    return { state: 'green', label: 'Ready to execute', detail: 'Dedicated Chrome profile can execute approved replies sequentially.' }
  }

  if (run?.current_step_id === APPROVAL_STEP_ID) {
    return { state: 'green', label: 'Review ready', detail: 'Approve or veto each generated reply before execution.' }
  }

  return { state: 'yellow', label: 'Not ready', detail: 'The workflow is not at a V2.2 scan, review, or execution step.' }
}

function evidenceField(evidence, field) {
  if (!evidence || typeof evidence !== 'object' || !(field in evidence)) return { state: 'unknown', value: 'Unknown' }
  const value = evidence[field]
  if (field === 'error_if_any') return { state: value ? 'no' : 'yes', value: value || 'No error captured' }
  return {
    state: value === null || value === undefined || value === '' ? 'unknown' : 'yes',
    value: value === null || value === undefined || value === '' ? 'Unknown' : String(value),
  }
}

export function personalV22EvidenceRows(run) {
  const batch = personalV22BatchPacket(run)
  const rows = []
  for (const reply of batch.replyCandidates) {
    const evidence = reply.evidence || {}
    for (const [field, label] of [
      ['action_attempted', 'Action attempted'],
      ['target_url', 'Target URL'],
      ['observed_resulting_url', 'Observed resulting URL'],
      ['observed_status', 'Observed status'],
      ['screenshot_path', 'Screenshot'],
      ['timestamp', 'Timestamp'],
      ['executed_text', 'Executed text'],
      ['error_if_any', 'Error'],
    ]) {
      const item = evidenceField(evidence, field)
      rows.push({
        id: `${reply.reply_id || reply.commenter_handle}-${field}`,
        label: `${reply.commenter_handle || 'Commenter'}: ${label}`,
        state: item.state,
        value: item.value,
        source: reply.evidence ? 'personal_engagement_v2_reply_batches' : 'not recorded yet',
        detail: field === 'observed_status' ? reply.status : '',
      })
    }
  }
  if (!rows.length) {
    rows.push({
      id: 'no-reply-evidence',
      label: 'Reply evidence',
      state: 'unknown',
      value: 'No per-reply evidence recorded yet',
      source: 'not recorded yet',
      detail: '',
    })
  }
  return rows
}

export function currentPersonalV22Step(run) {
  return stepById(run, run?.current_step_id) || null
}

export function buildPersonalEngagementV22View({ run, browserTasks = [], lastLoadedAt = null, routeBatchId = '' }) {
  const batch = personalV22BatchPacket(run)
  const step = currentPersonalV22Step(run)
  const outcome = personalV22Outcome(run)
  const stepIndex = (run?.steps || []).findIndex(item => item.step_id === step?.step_id)
  const routeMatches = !routeBatchId || routeBatchId === batch.batchId
  const recoveryEnabled = batch.replyCandidates.some(reply => PERSONAL_V22_RECOVERY_STATUSES.has(reply.status)) || batch.sessionStatus === 'failed'
  const runnerAvailability = runnerAvailabilityForPersonalV22(browserTasks, run)
  const isScanRequestable = routeMatches && run?.current_step_id === SCAN_STEP_ID
  const isReviewable = routeMatches && run?.current_step_id === APPROVAL_STEP_ID && batch.pendingReplyCount > 0
  const isExecutable = routeMatches && (
    run?.current_step_id === APPROVAL_STEP_ID
    || run?.current_step_id === EXECUTE_STEP_ID
  )

  return {
    runId: run?.run_id || 'unknown',
    workflowTitle: run?.workflow_title || 'Personal engagement V2.2 reply batch',
    workflowStatus: run?.status || 'unknown',
    stepId: step?.step_id || run?.current_step_id || 'no current step',
    stepTitle: step?.title || 'Personal engagement V2.2',
    stepNumber: stepIndex >= 0 ? stepIndex + 1 : '?',
    stepCount: run?.steps?.length || '?',
    batch,
    expectedIdentity: EXPECTED_IDENTITY,
    latestBrowserTask: latestPersonalV22BrowserTask(browserTasks),
    runnerAvailability,
    evidenceRows: personalV22EvidenceRows(run),
    outcomeStatus: batch.sessionStatus || outcome?.session_status || 'not recorded',
    outcome,
    lastLoadedAt,
    routeMatches,
    recoveryEnabled,
    isScanRequestable,
    isReviewable,
    isExecutable,
  }
}
