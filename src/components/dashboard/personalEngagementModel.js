const ACTION_STEP_ID = 'carlos_approves_personal_action'
const EXECUTE_STEP_ID = 'execute_personal_action_in_chrome'
const OUTCOME_STEP_ID = 'record_personal_engagement_outcome'
const EXPECTED_ACTION = 'like'
const EXPECTED_IDENTITY = 'Carlos Herrera'

export const PERSONAL_RECOVERY_STATUSES = new Set([
  'failed',
  'blocked_identity_mismatch',
  'blocked_target_mismatch',
  'blocked_ui_not_found',
  'blocked_login_state_missing',
  'blocked_profile_unavailable',
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

export function currentPersonalStep(run) {
  return stepById(run, run?.current_step_id) || null
}

export function personalActionPacket(run) {
  const linked = run?.linked_entities || {}
  const prepared = stepResult(run, 'prepare_personal_engagement_action')
  const approved = stepResult(run, ACTION_STEP_ID)
  const execute = stepResult(run, EXECUTE_STEP_ID)
  return {
    actionId: linked.action_id || prepared.action_id || approved.action_id || execute.action_id || 'unknown_action',
    actionVerb: linked.action_verb || prepared.action_verb || approved.action_verb || execute.action_verb || EXPECTED_ACTION,
    identityName: linked.identity_name || prepared.identity_name || approved.identity_name || execute.identity_name || EXPECTED_IDENTITY,
    targetName: linked.target_name || prepared.target_name || approved.target_name || execute.target_name || 'Facebook feed target',
    targetType: linked.target_type || prepared.target_type || approved.target_type || execute.target_type || 'feed',
    targetUrl: linked.target_url || prepared.target_url || approved.target_url || execute.target_url || '',
    startUrl: linked.start_url || prepared.start_url || approved.start_url || execute.start_url || 'https://www.facebook.com/',
    profileUserDataDir: linked.profile_user_data_dir || prepared.profile_user_data_dir || approved.profile_user_data_dir || execute.profile_user_data_dir || 'Dedicated PersonalEngagement profile path not exposed',
    evidenceRequired: linked.evidence_required || prepared.evidence_required || approved.evidence_required || execute.evidence_required || [],
  }
}

export function personalOutcome(run) {
  const outcomeStep = stepResult(run, OUTCOME_STEP_ID)
  if (outcomeStep.personal_engagement_outcome) return outcomeStep.personal_engagement_outcome
  if (outcomeStep.status && outcomeStep.evidence) {
    return {
      status: outcomeStep.status,
      evidence: outcomeStep.evidence,
      error_if_any: outcomeStep.error_if_any,
      outcome_id: outcomeStep.outcome_id,
    }
  }
  const execute = stepResult(run, EXECUTE_STEP_ID)
  if (execute.status && execute.evidence) {
    return {
      status: execute.status,
      evidence: execute.evidence,
      error_if_any: execute.error_if_any,
      browser_task_id: execute.browser_task_id,
    }
  }
  return null
}

export function latestPersonalBrowserTask(browserTasks) {
  return latestByTimestamp(browserTasks)
}

export function runnerAvailabilityForPersonalEngagement(browserTasks, run) {
  const latestTask = latestPersonalBrowserTask(browserTasks)
  const outcome = personalOutcome(run)
  const status = latestTask?.status

  if (outcome?.status === 'completed') {
    return {
      state: 'green',
      label: 'Completed',
      detail: 'The personal engagement outcome is recorded.',
    }
  }

  if (outcome?.status && outcome.status !== 'completed') {
    return {
      state: 'red',
      label: 'Blocked or failed',
      detail: outcome.error_if_any || outcome.status,
    }
  }

  if (RED_TASK_STATUSES.has(status)) {
    return {
      state: 'red',
      label: 'Runner blocked',
      detail: latestTask.error_if_any || `Latest task is ${status}.`,
    }
  }

  if (ACTIVE_TASK_STATUSES.has(status)) {
    return {
      state: 'yellow',
      label: 'Runner working',
      detail: `Latest task is ${status}. Refresh for evidence before asking again.`,
    }
  }

  if (status === 'staged_for_operator_review' || status === 'completed_by_operator') {
    return {
      state: 'yellow',
      label: 'Review needed',
      detail: `Latest task is ${status}. Refresh evidence to reconcile the workflow.`,
    }
  }

  if (run?.current_step_id === ACTION_STEP_ID || run?.current_step_id === EXECUTE_STEP_ID) {
    return {
      state: 'green',
      label: 'Ready',
      detail: 'Dedicated Chrome profile can be requested for this approved like.',
    }
  }

  return {
    state: 'yellow',
    label: 'Not ready',
    detail: 'The workflow is not at the approval or execution step.',
  }
}

function valueState(value) {
  if (value === null || value === undefined || value === '') return 'unknown'
  return 'yes'
}

function evidenceField(evidence, field) {
  if (!evidence || typeof evidence !== 'object' || !(field in evidence)) return { state: 'unknown', value: 'Unknown' }
  const value = evidence[field]
  if (field === 'error_if_any') {
    return {
      state: value ? 'no' : 'yes',
      value: value || 'No error captured',
    }
  }
  return {
    state: valueState(value),
    value: value === null || value === undefined || value === '' ? 'Unknown' : String(value),
  }
}

export function personalEvidenceRows(run) {
  const outcome = personalOutcome(run)
  const evidence = outcome?.evidence || {}
  const status = outcome?.status || 'not recorded'
  const rows = [
    ['action_attempted', 'Action attempted'],
    ['target_url', 'Target URL'],
    ['observed_resulting_url', 'Observed resulting URL'],
    ['observed_status', 'Observed status'],
    ['screenshot_path', 'Screenshot'],
    ['timestamp', 'Timestamp'],
    ['error_if_any', 'Error'],
  ]

  return rows.map(([field, label]) => {
    const item = evidenceField(evidence, field)
    return {
      id: field,
      label,
      state: item.state,
      value: item.value,
      source: outcome ? 'personal_engagement_outcomes' : 'not recorded yet',
      detail: field === 'observed_status' ? status : '',
    }
  })
}

export function buildPersonalEngagementView({ run, browserTasks = [], lastLoadedAt = null, routeActionId = '' }) {
  const action = personalActionPacket(run)
  const step = currentPersonalStep(run)
  const outcome = personalOutcome(run)
  const stepIndex = (run?.steps || []).findIndex(item => item.step_id === step?.step_id)
  const routeMatches = !routeActionId || routeActionId === action.actionId
  const recoveryEnabled = PERSONAL_RECOVERY_STATUSES.has(outcome?.status)
  const runnerAvailability = runnerAvailabilityForPersonalEngagement(browserTasks, run)
  const isActionable = routeMatches
    && !outcome
    && (run?.current_step_id === ACTION_STEP_ID || run?.current_step_id === EXECUTE_STEP_ID)

  return {
    runId: run?.run_id || 'unknown',
    workflowTitle: run?.workflow_title || 'Personal account engagement',
    workflowStatus: run?.status || 'unknown',
    stepId: step?.step_id || run?.current_step_id || 'no current step',
    stepTitle: step?.title || 'Personal account engagement',
    stepNumber: stepIndex >= 0 ? stepIndex + 1 : '?',
    stepCount: run?.steps?.length || '?',
    action,
    expectedIdentity: EXPECTED_IDENTITY,
    expectedAction: EXPECTED_ACTION,
    latestBrowserTask: latestPersonalBrowserTask(browserTasks),
    runnerAvailability,
    evidenceRows: personalEvidenceRows(run),
    outcomeStatus: outcome?.status || 'not recorded',
    outcome,
    lastLoadedAt,
    routeMatches,
    recoveryEnabled,
    isActionable,
  }
}
