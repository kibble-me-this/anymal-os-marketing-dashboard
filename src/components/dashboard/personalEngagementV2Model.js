const APPROVAL_STEP_ID = 'carlos_approves_v2_action'
const EXECUTE_STEP_ID = 'execute_v2_action_in_chrome'
const OUTCOME_STEP_ID = 'record_v2_action_outcome'
const EXPECTED_IDENTITY = 'Carlos Herrera'
const EXPECTED_ACTION = 'comment'

export const PERSONAL_V2_RECOVERY_STATUSES = new Set([
  'failed',
  'blocked_identity_mismatch',
  'blocked_target_mismatch',
  'blocked_ui_not_found',
  'blocked_login_state_missing',
  'blocked_profile_unavailable',
  'blocked_text_hash_mismatch',
  'posted_to_wrong_destination',
  'needs_manual_review',
])

const ACTIVE_TASK_STATUSES = new Set([
  'requested',
  'picked_up',
  'browser_opened',
  'in_progress',
])

const RED_TASK_STATUSES = new Set([
  'failed',
  'cancelled',
  'blocked_by_stop_condition',
])

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

export function personalV2ActionPacket(run) {
  const linked = run?.linked_entities || {}
  const prepared = stepResult(run, 'prepare_v2_action_candidate')
  const generated = stepResult(run, 'generate_v2_candidate_text')
  const approved = stepResult(run, APPROVAL_STEP_ID)
  const execute = stepResult(run, EXECUTE_STEP_ID)
  return {
    actionId: linked.action_id || prepared.personal_engagement_v2_action_id || generated.personal_engagement_v2_action_id || approved.action_id || execute.action_id || 'unknown_action',
    actionVerb: linked.action_verb || prepared.action_verb || generated.action_verb || approved.approved_action || execute.action_verb || EXPECTED_ACTION,
    identityName: linked.identity_name || prepared.identity_name || generated.identity_name || approved.identity_name || EXPECTED_IDENTITY,
    targetPostUrl: linked.target_post_url || prepared.target_post_url || generated.target_post_url || approved.target_post_url || execute.target_post_url || '',
    targetPostUrlHash: linked.target_post_url_hash || prepared.target_post_url_hash || generated.target_post_url_hash || approved.target_post_url_hash || execute.target_post_url_hash || '',
    targetPostAuthor: linked.target_post_author || prepared.target_post_author || generated.target_post_author || 'Anymal OS',
    targetPostExcerpt: linked.target_post_excerpt || prepared.target_post_excerpt || generated.target_post_excerpt || '',
    approvedText: generated.approved_text || prepared.approved_text || approved.approved_text || execute.approved_text || '',
    approvedTextHash: generated.approved_text_hash || prepared.approved_text_hash || approved.approved_text_hash || execute.approved_text_hash || '',
    voiceProfileVersion: linked.voice_profile_version || generated.voice_profile_version || prepared.voice_profile_version || approved.voice_profile_version || 'carlos:v1',
    profileUserDataDir: linked.profile_user_data_dir || generated.profile_user_data_dir || prepared.profile_user_data_dir || 'Dedicated PersonalEngagement profile path not exposed',
    safetyScoring: generated.safety_scoring || prepared.safety_scoring || {},
    riskFlags: generated.risk_flags || prepared.risk_flags || [],
    evidenceRequired: linked.evidence_required || generated.evidence_required || prepared.evidence_required || execute.evidence_required || [],
  }
}

export function personalV2Outcome(run) {
  const outcomeStep = stepResult(run, OUTCOME_STEP_ID)
  if (outcomeStep.personal_engagement_v2_action) return outcomeStep.personal_engagement_v2_action
  if (outcomeStep.status && outcomeStep.evidence) {
    return {
      status: outcomeStep.status,
      evidence: outcomeStep.evidence,
      error_if_any: outcomeStep.error_if_any,
    }
  }
  const execute = stepResult(run, EXECUTE_STEP_ID)
  if (execute.outcome_status && execute.evidence) {
    return {
      status: execute.outcome_status,
      evidence: execute.evidence,
      error_if_any: execute.error_if_any,
      browser_task_id: execute.browser_task_id,
    }
  }
  return null
}

export function latestPersonalV2BrowserTask(browserTasks) {
  return latestByTimestamp(browserTasks)
}

export function runnerAvailabilityForPersonalV2(browserTasks, run) {
  const latestTask = latestPersonalV2BrowserTask(browserTasks)
  const outcome = personalV2Outcome(run)
  const status = latestTask?.status

  if (outcome?.status === 'completed') {
    return { state: 'green', label: 'Completed', detail: 'The V2 action outcome is recorded.' }
  }

  if (outcome?.status && outcome.status !== 'completed') {
    return { state: 'red', label: 'Blocked or failed', detail: outcome.error_if_any || outcome.status }
  }

  if (RED_TASK_STATUSES.has(status)) {
    return { state: 'red', label: 'Runner blocked', detail: latestTask.error_if_any || `Latest task is ${status}.` }
  }

  if (ACTIVE_TASK_STATUSES.has(status)) {
    return { state: 'yellow', label: 'Runner working', detail: `Latest task is ${status}. Refresh for evidence before asking again.` }
  }

  if (status === 'staged_for_operator_review' || status === 'completed_by_operator') {
    return { state: 'yellow', label: 'Review needed', detail: `Latest task is ${status}. Refresh evidence to reconcile the workflow.` }
  }

  if (run?.current_step_id === APPROVAL_STEP_ID || run?.current_step_id === EXECUTE_STEP_ID) {
    return { state: 'green', label: 'Ready', detail: 'Dedicated Chrome profile can be requested for this approved V2 comment.' }
  }

  return { state: 'yellow', label: 'Not ready', detail: 'The workflow is not at the approval or execution step.' }
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

export function personalV2EvidenceRows(run) {
  const outcome = personalV2Outcome(run)
  const evidence = outcome?.evidence || {}
  const status = outcome?.status || 'not recorded'
  const rows = [
    ['action_attempted', 'Action attempted'],
    ['target_url', 'Target URL'],
    ['observed_resulting_url', 'Observed resulting URL'],
    ['observed_status', 'Observed status'],
    ['screenshot_path', 'Screenshot'],
    ['timestamp', 'Timestamp'],
    ['executed_text', 'Executed text'],
    ['error_if_any', 'Error'],
  ]

  return rows.map(([field, label]) => {
    const item = evidenceField(evidence, field)
    return {
      id: field,
      label,
      state: item.state,
      value: item.value,
      source: outcome ? 'personal_engagement_v2_actions' : 'not recorded yet',
      detail: field === 'observed_status' ? status : '',
    }
  })
}

export function currentPersonalV2Step(run) {
  return stepById(run, run?.current_step_id) || null
}

export function buildPersonalEngagementV2View({ run, browserTasks = [], lastLoadedAt = null, routeActionId = '' }) {
  const action = personalV2ActionPacket(run)
  const step = currentPersonalV2Step(run)
  const outcome = personalV2Outcome(run)
  const stepIndex = (run?.steps || []).findIndex(item => item.step_id === step?.step_id)
  const routeMatches = !routeActionId || routeActionId === action.actionId
  const recoveryEnabled = PERSONAL_V2_RECOVERY_STATUSES.has(outcome?.status)
  const runnerAvailability = runnerAvailabilityForPersonalV2(browserTasks, run)
  const isActionable = routeMatches
    && !outcome
    && (run?.current_step_id === APPROVAL_STEP_ID || run?.current_step_id === EXECUTE_STEP_ID)

  return {
    runId: run?.run_id || 'unknown',
    workflowTitle: run?.workflow_title || 'Personal engagement V2 action',
    workflowStatus: run?.status || 'unknown',
    stepId: step?.step_id || run?.current_step_id || 'no current step',
    stepTitle: step?.title || 'Personal engagement V2',
    stepNumber: stepIndex >= 0 ? stepIndex + 1 : '?',
    stepCount: run?.steps?.length || '?',
    action,
    expectedIdentity: EXPECTED_IDENTITY,
    expectedAction: EXPECTED_ACTION,
    latestBrowserTask: latestPersonalV2BrowserTask(browserTasks),
    runnerAvailability,
    evidenceRows: personalV2EvidenceRows(run),
    outcomeStatus: outcome?.status || 'not recorded',
    outcome,
    lastLoadedAt,
    routeMatches,
    recoveryEnabled,
    isActionable,
  }
}
