export const STAGED_SHARE_STATUSES = new Set([
  'staged_for_operator_review',
  'submitted_visible_or_feed',
  'pending_admin_approval',
])

export const POSTED_SHARE_STATUSES = new Set([
  'submitted_visible_or_feed',
  'pending_admin_approval',
])

export const ACTIVE_STAGING_STATUSES = new Set([
  'staging_requested',
  'staging_in_progress',
])

export const LAST_WORKFLOW_STORAGE_KEY = 'anymal:last_workflow_cockpit_v1'

export function normalizeZip(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.padStart(5, '0')
}

export function stepResult(run, stepId) {
  return (run?.steps || []).find(step => step.step_id === stepId)?.result || null
}

export function currentStep(run) {
  const currentId = run?.current_step_id
  if (!currentId) return null
  return (run?.steps || []).find(step => step.step_id === currentId) || null
}

export function stepNumber(run, stepId) {
  const index = (run?.steps || []).findIndex(step => step.step_id === stepId)
  return index >= 0 ? index + 1 : null
}

export function campaignsForZip(campaigns = [], zip) {
  const normalized = normalizeZip(zip)
  if (!normalized) return []
  return (campaigns || [])
    .filter(campaign => normalizeZip(campaign?.zip) === normalized)
    .sort((a, b) => {
      const aPage = a.channel === 'facebook_page' ? 0 : 1
      const bPage = b.channel === 'facebook_page' ? 0 : 1
      if (aPage !== bPage) return aPage - bPage
      return String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''))
    })
}

export function facebookPageCampaign(campaigns = [], zip) {
  const pageRows = campaignsForZip(campaigns, zip).filter(campaign => campaign.channel === 'facebook_page')
  return pageRows.sort((a, b) => {
    const aReady = pageAnchorFromCampaign(a).ready ? 0 : 1
    const bReady = pageAnchorFromCampaign(b).ready ? 0 : 1
    if (aReady !== bReady) return aReady - bReady
    return String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''))
  })[0] || null
}

export function pageAnchorFromCampaign(campaign) {
  const postedUrl = campaign?.posted_url || campaign?.page_anchor_post_url || ''
  const postId = campaign?.post_id || campaign?.facebook_post_id || campaign?.page_anchor_post_id || ''
  return {
    postedUrl,
    postId,
    ready: campaign?.status === 'published' && Boolean(postedUrl && postId),
  }
}

function pageAnchorEvidence(run, campaigns) {
  const zip = normalizeZip(run?.linked_entities?.zip)
  const campaign = facebookPageCampaign(campaigns, zip)
  const campaignAnchor = pageAnchorFromCampaign(campaign)
  const verifyResult = stepResult(run, 'verify_page_anchor') || {}
  const verifiedUrl = verifyResult.page_anchor_post_url || verifyResult.posted_url || ''
  const verifiedId = verifyResult.page_anchor_post_id || verifyResult.post_id || ''
  const postedUrl = campaignAnchor.postedUrl || verifiedUrl
  const postId = campaignAnchor.postId || verifiedId
  const published = campaignAnchor.ready || Boolean(verifiedUrl && verifiedId)
  const source = campaign
    ? 'campaign row'
    : verifiedUrl || verifiedId
      ? 'verify_page_anchor result'
      : 'not exposed'

  return {
    campaign,
    postedUrl,
    postId,
    published,
    source,
  }
}

function mergeShareOutcomes(run, shareOutcomes = []) {
  const stageResult = stepResult(run, 'stage_personal_share') || {}
  const stageRows = Array.isArray(stageResult.share_outcomes) ? stageResult.share_outcomes : []
  const latestById = new Map((shareOutcomes || [])
    .filter(outcome => outcome?.share_outcome_id)
    .map(outcome => [outcome.share_outcome_id, outcome]))
  const merged = stageRows.map(row => {
    const latest = latestById.get(row.share_outcome_id)
    return latest ? { ...row, ...latest } : row
  })
  const ids = new Set(merged.map(row => row.share_outcome_id).filter(Boolean))
  const conflicts = stageRows
    .map(row => {
      const latest = latestById.get(row.share_outcome_id)
      if (!latest || latest.status === row.status) return null
      return {
        share_outcome_id: row.share_outcome_id,
        workflow_status: row.status || 'unknown',
        ledger_status: latest.status || 'unknown',
      }
    })
    .filter(Boolean)

  return {
    rows: merged,
    ids,
    conflicts,
    unlinkedCount: ids.size ? 0 : (shareOutcomes || []).length,
  }
}

function yesNoUnknown({ known, yes }) {
  if (!known) return 'unknown'
  return yes ? 'yes' : 'no'
}

function evidenceDetailUrl(value) {
  return value ? String(value) : ''
}

export function buildEvidenceRows({ run, campaigns = [], shareOutcomes = [] }) {
  const anchor = pageAnchorEvidence(run, campaigns)
  const share = mergeShareOutcomes(run, shareOutcomes)
  const hasShareRows = share.rows.length > 0
  const handoffCount = share.rows.length
  const stagedCount = share.rows.filter(outcome => STAGED_SHARE_STATUSES.has(outcome.status)).length
  const requestedCount = share.rows.filter(outcome => outcome.status === 'staging_requested').length
  const inProgressCount = share.rows.filter(outcome => outcome.status === 'staging_in_progress').length
  const staged = stagedCount > 0
  const posted = hasShareRows && share.rows.some(outcome => (
    POSTED_SHARE_STATUSES.has(outcome.status) || Boolean(outcome.facebook_share_url)
  ))
  const ledgerResult = stepResult(run, 'update_outcome_ledger')
  const ledgerStep = (run?.steps || []).find(step => step.step_id === 'update_outcome_ledger')
  const ledgerKnown = Boolean(ledgerResult) || ledgerStep?.status === 'completed'
  const ledgerUpdated = Number(ledgerResult?.reconciled_count || 0) > 0

  return [
    {
      id: 'page_post.published',
      label: 'Page post published',
      state: yesNoUnknown({ known: anchor.source !== 'not exposed', yes: anchor.published }),
      value: anchor.published ? 'Published' : anchor.source === 'not exposed' ? 'Unknown' : 'Not published',
      source: anchor.source,
      detail: anchor.campaign?.campaign_id || '',
    },
    {
      id: 'posted_url',
      label: 'Posted URL',
      state: yesNoUnknown({ known: anchor.source !== 'not exposed', yes: Boolean(anchor.postedUrl) }),
      value: anchor.postedUrl || 'Unknown',
      source: anchor.source,
      detail: evidenceDetailUrl(anchor.postedUrl),
    },
    {
      id: 'post_id',
      label: 'Post ID',
      state: yesNoUnknown({ known: anchor.source !== 'not exposed', yes: Boolean(anchor.postId) }),
      value: anchor.postId || 'Unknown',
      source: anchor.source,
      detail: evidenceDetailUrl(anchor.postId),
    },
    {
      id: 'personal_share.staged',
      label: 'Personal share staged',
      state: yesNoUnknown({ known: hasShareRows, yes: staged }),
      value: hasShareRows
        ? `${stagedCount} browser staged, ${handoffCount} prepared handoff${handoffCount === 1 ? '' : 's'}`
        : 'Unknown',
      source: hasShareRows ? 'prepared handoffs plus share_outcomes ledger' : 'not exposed yet',
      detail: [
        requestedCount ? `${requestedCount} staging requested` : '',
        inProgressCount ? `${inProgressCount} staging in progress` : '',
        share.conflicts.length ? `${share.conflicts.length} status conflict(s)` : '',
      ].filter(Boolean).join('; '),
    },
    {
      id: 'personal_share.posted',
      label: 'Personal share posted',
      state: yesNoUnknown({ known: hasShareRows, yes: posted }),
      value: hasShareRows ? (posted ? 'Posted or pending approval' : 'Not observed') : 'Unknown',
      source: hasShareRows ? 'share_outcomes ledger' : 'not exposed yet',
      detail: share.rows.find(outcome => outcome.facebook_share_url)?.facebook_share_url || '',
    },
    {
      id: 'outcome_ledger.updated',
      label: 'Outcome ledger updated',
      state: yesNoUnknown({ known: ledgerKnown, yes: ledgerUpdated }),
      value: ledgerKnown
        ? `${Number(ledgerResult?.reconciled_count || 0)} reconciled, ${Number(ledgerResult?.skipped_count || 0)} skipped`
        : 'Unknown',
      source: ledgerKnown ? 'update_outcome_ledger step result' : 'step 10 not reached',
      detail: ledgerResult?.observed_status || ledgerResult?.learning_loop_input?.source_step_id || '',
    },
  ]
}

export function riskLabelForStep(step) {
  const stepId = step?.step_id || ''
  if (stepId === 'click_post') return 'live_external'
  if (stepId === 'stage_personal_share') return 'staging'
  if (step?.kind === 'browser_stage_only') return 'staging'
  if (step?.kind === 'backend_safe') return 'safe_backend'
  return 'draft_review'
}

export function riskCopy(risk) {
  const copy = {
    safe_backend: {
      label: 'Safe backend',
      tone: '#00e676',
      detail: 'Backend state only. No external social action.',
    },
    draft_review: {
      label: 'Draft review',
      tone: '#ffd54f',
      detail: 'Carlos review gate. Publishing happens only in the explicit publish flow.',
    },
    staging: {
      label: 'Staging',
      tone: '#4da3ff',
      detail: 'May prepare browser or desktop state. Must stop before Post.',
    },
    live_external: {
      label: 'Live external',
      tone: '#ff7a45',
      detail: 'This phase is adjacent to a live external Facebook action.',
    },
  }
  return copy[risk] || copy.draft_review
}

function clickPostTask(run, evidenceRows, shareOutcomes = []) {
  const share = mergeShareOutcomes(run, shareOutcomes)
  const hasStaged = evidenceRows.find(row => row.id === 'personal_share.staged')?.state === 'yes'
  const activeStaging = share.rows.find(outcome => (
    outcome.share_outcome_id && ACTIVE_STAGING_STATUSES.has(outcome.status)
  ))
  const requestable = share.rows.find(outcome => (
    outcome.share_outcome_id
    && !STAGED_SHARE_STATUSES.has(outcome.status)
    && !ACTIVE_STAGING_STATUSES.has(outcome.status)
  ))
  const stagedShare = share.rows.find(outcome => (
    outcome.share_outcome_id && STAGED_SHARE_STATUSES.has(outcome.status)
  ))
  if (!hasStaged && activeStaging) {
    return {
      actionType: 'refresh',
      title: 'Waiting for browser staging runner',
      subtitle: 'The workflow is waiting for a browser-capable runner to stage the Facebook composer before Carlos reviews Post.',
      risk: 'staging',
      shareOutcomeId: activeStaging.share_outcome_id,
      primaryLabel: 'Refresh staging status',
      disabledReason: '',
      handoffSummary: `${activeStaging.group_name || activeStaging.share_outcome_id} is ${activeStaging.status}. Wait for the desktop runner to mark it staged_for_operator_review.`,
    }
  }
  if (!hasStaged && requestable) {
    return {
      actionType: 'request_staging',
      title: 'Request browser staging before Post',
      subtitle: 'Prepared handoff records exist, but no Facebook composer is staged yet.',
      risk: 'staging',
      shareOutcomeId: requestable.share_outcome_id,
      handoffTargetName: requestable.group_name || requestable.share_outcome_id,
      primaryLabel: 'Request browser staging',
      disabledReason: '',
      handoffSummary: `Prepared handoff for ${requestable.group_name || requestable.share_outcome_id}. Request staging before any Post review.`,
    }
  }
  return {
    actionType: 'decision',
    title: hasStaged ? 'Carlos reviews staged composer and clicks Post' : 'Waiting for prepared share handoff',
    subtitle: hasStaged ? 'A browser composer is staged for operator review.' : 'A prepared share handoff is required before browser staging can start.',
    risk: hasStaged ? 'live_external' : 'staging',
    primaryLabel: hasStaged ? 'Approve after Post review' : 'Waiting for staged share',
    disabledReason: hasStaged ? '' : 'A share outcome must be staged before this gate can advance.',
    handoffSummary: hasStaged && stagedShare
      ? `${stagedShare.group_name || stagedShare.share_outcome_id} is staged_for_operator_review. Review the browser composer before approving.`
      : '',
  }
}

function disabledReasonForStep(step, evidenceRows) {
  const stepId = step?.step_id
  if (stepId === 'review_launch_package') {
    return ''
  }
  if (stepId === 'approve_page_anchor_in_draft_review') {
    const published = evidenceRows.find(row => row.id === 'page_post.published')
    return published?.state === 'yes' ? '' : 'Publish the Page anchor in Draft Review first.'
  }
  if (stepId === 'approve_distribution_targets') {
    return stepResult({ steps: [step] }, 'compose_distribution_plan') ? '' : ''
  }
  return ''
}

export function buildCarlosTask(run, evidenceRows, shareOutcomes = []) {
  const step = currentStep(run)
  if (!run) return null
  if (run.status === 'completed') {
    return {
      title: 'Workflow complete',
      subtitle: run.workflow_title || run.run_id,
      step,
      stepNumber: null,
      risk: 'safe_backend',
      actionType: 'none',
      primaryLabel: 'Complete',
      disabledReason: 'No current workflow action.',
    }
  }
  if (!step) {
    return {
      title: 'No current task',
      subtitle: run.status || 'Unknown run state',
      step,
      stepNumber: null,
      risk: 'safe_backend',
      actionType: 'none',
      primaryLabel: 'Refresh',
      disabledReason: 'No current step is exposed by the backend.',
    }
  }

  let action = {}
  if (run.status === 'running' || step.kind === 'backend_safe' || step.step_id === 'stage_personal_share') {
    action = {
      actionType: 'safe',
      primaryLabel: step.step_id === 'stage_personal_share' ? 'Prepare share handoffs' : 'Run safe next step',
      disabledReason: run.status !== 'running' ? 'Safe steps can run only while the workflow status is running.' : '',
    }
  } else if (step.step_id === 'click_post') {
    action = clickPostTask(run, evidenceRows, shareOutcomes)
  } else {
    action = {
      actionType: 'decision',
      primaryLabel: step.step_id === 'review_launch_package' ? 'Approve package' : 'Approve gate',
      disabledReason: disabledReasonForStep(step, evidenceRows),
    }
  }

  return {
    title: action.title || step.title || run.attended_gate?.title || step.step_id,
    subtitle: action.subtitle || step.detail || run.attended_gate?.message || run.workflow_title || '',
    step,
    stepNumber: stepNumber(run, step.step_id),
    stepCount: (run.steps || []).length || null,
    risk: action.risk || riskLabelForStep(step),
    ...action,
  }
}

export function nextClickCopy(task) {
  const stepId = task?.step?.step_id
  if (!task || task.actionType === 'none') {
    return {
      will: ['Refresh the run and evidence state.'],
      willNot: ['Publish externally.', 'Start a desktop browser task.'],
    }
  }
  if (task.actionType === 'request_staging') {
    return {
      will: [
        'Set one share outcome to staging_requested.',
        'Allow the local desktop runner to stage the Facebook composer when it polls.',
      ],
      willNot: [
        'Click Post.',
        'Mark the workflow gate complete.',
        'Write an outcome ledger reconciliation.',
      ],
    }
  }
  if (task.actionType === 'refresh') {
    return {
      will: [
        'Reload the workflow run and share outcome ledger.',
        'Show whether the desktop runner moved the share to staged_for_operator_review.',
      ],
      willNot: [
        'Request another share handoff.',
        'Click Post.',
        'Mark the workflow gate complete.',
      ],
    }
  }
  if (task.actionType === 'safe') {
    return {
      will: [
        stepId === 'stage_personal_share'
          ? 'Create attended share handoff records for the approved target groups.'
          : 'Ask the backend to run the current safe workflow step.',
        'Reload the workflow run after the backend acknowledges the update.',
      ],
      willNot: [
        'Publish to Facebook.',
        'Click Post from a personal account.',
        'Skip a Carlos final action gate.',
      ],
    }
  }
  if (stepId === 'click_post') {
    return {
      will: [
        'Record Carlos approval for the Post review gate.',
        'Let the backend continue to step 10 outcome ledger processing.',
      ],
      willNot: [
        'Click Post for Carlos.',
        'Open a browser session.',
        'Invent a Facebook share URL if one is not exposed.',
      ],
    }
  }
  if (stepId === 'approve_page_anchor_in_draft_review') {
    return {
      will: [
        'Record that the Page anchor gate can advance after published evidence exists.',
        'Let the backend verify the Page anchor on the next safe step.',
      ],
      willNot: [
        'Publish the Page post.',
        'Generate creative.',
        'Create personal-account shares.',
      ],
    }
  }
  return {
    will: [
      'Record Carlos approval for this workflow gate.',
      'Let the backend advance to the next safe step.',
    ],
    willNot: [
      'Publish externally.',
      'Start browser staging.',
      'Hide backend validation errors.',
    ],
  }
}

export function sourceFreshnessState({ lastLoadedAt, campaigns = [], shareOutcomes = [], run }) {
  const zip = normalizeZip(run?.linked_entities?.zip)
  const pageCampaign = facebookPageCampaign(campaigns, zip)
  const gate = pageCampaign?.freshness_gate || pageCampaign?.price_freshness || pageCampaign?.campaign_freshness || null
  return {
    zip,
    lastLoadedAt,
    campaignCount: campaignsForZip(campaigns, zip).length,
    shareOutcomeCount: shareOutcomes.length,
    runLoaded: Boolean(run),
    pageFreshnessLabel: gate?.label || gate?.decision || 'unknown',
    pageFreshnessSource: gate ? 'campaign freshness field' : 'not exposed',
    browserTasksSource: 'not integrated in V1',
    runDiscoverySource: 'exact run id required',
    historicalAccessSource: 'exact run id required',
  }
}
