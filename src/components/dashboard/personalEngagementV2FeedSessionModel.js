const TRAVERSAL_STEP_ID = 'traverse_v2_feed_in_chrome'
const REVIEW_STEP_ID = 'review_v2_feed_candidates'
const EXPECTED_IDENTITY = 'Carlos Herrera'

const ACTIVE_TASK_STATUSES = new Set(['requested', 'picked_up', 'browser_opened', 'in_progress'])
const RED_TASK_STATUSES = new Set(['failed', 'cancelled', 'blocked_by_stop_condition'])
const BLOCKED_SESSION_STATUSES = new Set(['blocked', 'traversal_blocked'])
const FAILED_SESSION_STATUSES = new Set(['traversal_failed'])
const STAGED_STATUSES = new Set(['staged'])
const APPROVED_STATUSES = new Set(['approved', 'executed'])

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

function pickSession(run, candidateResponse) {
  const linked = run?.linked_entities || {}
  const fromResponse = candidateResponse?.session || {}
  const prepared = stepResult(run, 'prepare_v2_feed_session')
  const traversal = stepResult(run, TRAVERSAL_STEP_ID)
  return {
    sessionId: linked.session_id || fromResponse.session_id || prepared.session_id || run?.run_id || 'unknown_session',
    sessionStatus: fromResponse.session_status || traversal.session_status || prepared.session_status || 'not prepared',
    identityName: linked.identity_name || fromResponse.identity_name || prepared.identity_name || EXPECTED_IDENTITY,
    targetFeedUrl: linked.target_feed_url || fromResponse.target_feed_url || prepared.target_feed_url || '',
    targetFeedUrlHash: linked.target_feed_url_hash || fromResponse.target_feed_url_hash || prepared.target_feed_url_hash || '',
    profileUserDataDir: linked.profile_user_data_dir || fromResponse.profile_user_data_dir || prepared.profile_user_data_dir || 'Dedicated PersonalEngagement profile path not exposed',
    candidateCount: Number(fromResponse.candidate_count ?? fromResponse.candidates_staged ?? traversal.candidates_staged ?? 0),
    candidatesFilteredOut: fromResponse.candidates_filtered_out || traversal.candidates_filtered_out || {},
    postsScrolledPast: Number(fromResponse.posts_scrolled_past ?? traversal.posts_scrolled_past ?? 0),
    refusalCode: fromResponse.refusal_code || traversal.refusal_code || '',
    browserObservation: fromResponse.browser_observation || traversal.browser_observation || '',
    limits: fromResponse.limits || prepared.limits || {},
    policyEnvelope: fromResponse.policy_envelope || prepared.policy_envelope || {},
  }
}

function candidateCooldown(candidate) {
  const reason = String(candidate.rejection_reason || candidate.filter_reason || '').toLowerCase()
  const status = String(candidate.candidate_status || '').toLowerCase()
  if (candidate.cooldown_active || candidate.engagement_cooldown_active || candidate.already_engaged) {
    return { active: true, label: 'already engaged today' }
  }
  if (reason.includes('already_engaged') || reason.includes('cooldown') || status.includes('cooldown')) {
    return { active: true, label: 'already engaged today' }
  }
  return { active: false, label: '' }
}

export function normalizeV23Candidate(candidate, index = 0) {
  const candidateId = candidate?.candidate_id || candidate?.personal_engagement_v2_candidate_id || `candidate_${index + 1}`
  const status = candidate?.candidate_status || 'staged'
  const hints = Array.isArray(candidate?.proposed_action_hints) ? candidate.proposed_action_hints : []
  const cooldown = candidateCooldown(candidate || {})
  const spawnedRunId = candidate?.spawned_workflow_run_id || ''
  const actionId = candidate?.executed_via_action_id || ''
  const batchId = candidate?.executed_via_batch_id || ''
  return {
    ...candidate,
    candidate_id: candidateId,
    candidate_status: status,
    target_post_url: candidate?.target_post_url || '',
    target_post_excerpt: candidate?.target_post_excerpt || '',
    target_post_author: candidate?.target_post_author || 'Unknown author',
    target_post_author_url: candidate?.target_post_author_url || '',
    post_age_hours: Number(candidate?.post_age_hours ?? 0),
    comment_count_visible: Number(candidate?.comment_count_visible ?? 0),
    proposed_action_hints: hints.length ? hints : ['comment'],
    cooldown,
    spawnedRunId,
    actionId,
    batchId,
    isSpawned: Boolean(spawnedRunId || actionId || batchId || APPROVED_STATUSES.has(status)),
    canComment: STAGED_STATUSES.has(status) && !cooldown.active,
    canReply: STAGED_STATUSES.has(status) && !cooldown.active && hints.includes('reply_batch') && Number(candidate?.comment_count_visible ?? 0) > 0,
    canDismiss: STAGED_STATUSES.has(status) || status === 'approved',
  }
}

export function latestPersonalV23BrowserTask(browserTasks) {
  return latestByTimestamp(browserTasks)
}

export function runnerAvailabilityForPersonalV23(browserTasks, run, session) {
  const latestTask = latestPersonalV23BrowserTask(browserTasks)
  const status = latestTask?.status

  if (session?.sessionStatus === 'staged_for_operator_review') {
    return { state: 'green', label: 'Completed', detail: 'The V2.3 feed traversal candidates are staged.' }
  }
  if (BLOCKED_SESSION_STATUSES.has(session?.sessionStatus)) {
    return { state: 'red', label: 'Traversal blocked', detail: session.refusalCode || 'The traversal returned a structured refusal.' }
  }
  if (FAILED_SESSION_STATUSES.has(session?.sessionStatus)) {
    return { state: 'red', label: 'Traversal failed', detail: session.browserObservation || 'The traversal failed without a structured refusal.' }
  }
  if (RED_TASK_STATUSES.has(status)) {
    return { state: 'red', label: 'Runner blocked', detail: latestTask.error_if_any || `Latest task is ${status}.` }
  }
  if (ACTIVE_TASK_STATUSES.has(status)) {
    return { state: 'yellow', label: 'Runner working', detail: `Latest task is ${status}. Refresh before acting.` }
  }
  if (run?.current_step_id === TRAVERSAL_STEP_ID) {
    return { state: 'green', label: 'Ready to traverse', detail: 'Dedicated Chrome can run the read-only feed traversal.' }
  }
  if (run?.current_step_id === REVIEW_STEP_ID) {
    return { state: 'green', label: 'Review ready', detail: 'Review staged candidates and spawn V2.1 or V2.2 workflows.' }
  }
  return { state: 'yellow', label: 'Not ready', detail: 'The workflow is not at the V2.3 traversal or review step.' }
}

export function personalV23EvidenceRows(session, candidates) {
  const terminalFailure = BLOCKED_SESSION_STATUSES.has(session.sessionStatus) || FAILED_SESSION_STATUSES.has(session.sessionStatus)
  const rows = [
    {
      id: 'session-status',
      label: 'Session status',
      state: session.sessionStatus === 'staged_for_operator_review' ? 'yes' : terminalFailure ? 'no' : 'unknown',
      value: session.sessionStatus || 'unknown',
      source: 'personal_engagement_v2_feed_sessions',
    },
    {
      id: 'candidate-count',
      label: 'Candidates staged',
      state: candidates.length ? 'yes' : 'unknown',
      value: String(candidates.length),
      source: 'personal_engagement_v2_candidates',
    },
    {
      id: 'posts-scrolled',
      label: 'Posts scrolled past',
      state: session.postsScrolledPast ? 'yes' : 'unknown',
      value: String(session.postsScrolledPast || 0),
      source: 'personal_engagement_v2_feed_sessions',
    },
    {
      id: 'filtered-out',
      label: 'Filtered out',
      state: Object.keys(session.candidatesFilteredOut || {}).length ? 'yes' : 'unknown',
      value: JSON.stringify(session.candidatesFilteredOut || {}),
      source: 'personal_engagement_v2_feed_sessions',
    },
  ]
  for (const candidate of candidates) {
    rows.push({
      id: `${candidate.candidate_id}-target`,
      label: `${candidate.target_post_author}: Target URL`,
      state: candidate.target_post_url ? 'yes' : 'unknown',
      value: candidate.target_post_url || 'Unknown',
      source: 'personal_engagement_v2_candidates',
    })
    rows.push({
      id: `${candidate.candidate_id}-comments`,
      label: `${candidate.target_post_author}: Comment count`,
      state: candidate.comment_count_visible > 0 ? 'yes' : 'unknown',
      value: String(candidate.comment_count_visible),
      source: 'personal_engagement_v2_candidates',
    })
  }
  return rows
}

export function buildPersonalEngagementV23View({ run, candidateResponse = {}, browserTasks = [], lastLoadedAt = null, routeSessionId = '' }) {
  const session = pickSession(run, candidateResponse)
  const candidates = (candidateResponse?.candidates || []).map(normalizeV23Candidate)
  const step = stepById(run, run?.current_step_id) || null
  const stepIndex = (run?.steps || []).findIndex(item => item.step_id === step?.step_id)
  const routeMatches = !routeSessionId || routeSessionId === session.sessionId
  const stagedCandidates = candidates.filter(candidate => candidate.candidate_status === 'staged')
  const actionableCandidates = stagedCandidates.filter(candidate => !candidate.cooldown.active)
  const latestBrowserTask = latestPersonalV23BrowserTask(browserTasks)

  return {
    runId: run?.run_id || 'unknown',
    workflowTitle: run?.workflow_title || 'Personal engagement V2.3 feed session',
    workflowStatus: run?.status || 'unknown',
    stepId: step?.step_id || run?.current_step_id || 'no current step',
    stepTitle: step?.title || 'Personal engagement V2.3',
    stepNumber: stepIndex >= 0 ? stepIndex + 1 : '?',
    stepCount: run?.steps?.length || '?',
    session,
    candidates,
    stagedCandidates,
    actionableCandidates,
    cooldownCount: candidates.filter(candidate => candidate.cooldown.active).length,
    spawnedCount: candidates.filter(candidate => candidate.isSpawned).length,
    expectedIdentity: EXPECTED_IDENTITY,
    latestBrowserTask,
    runnerAvailability: runnerAvailabilityForPersonalV23(browserTasks, run, session),
    evidenceRows: personalV23EvidenceRows(session, candidates),
    lastLoadedAt,
    routeMatches,
    isReviewable: routeMatches && run?.current_step_id === REVIEW_STEP_ID,
    hasCandidates: candidates.length > 0,
    canRequestTraversal: routeMatches && session.sessionStatus === 'pending_traversal' && !latestBrowserTask,
  }
}
