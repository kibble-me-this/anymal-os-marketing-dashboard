export const NEXT_ACTION_RULES = [
  {
    id: 'today_marketing_agenda_ready',
    priority: 5,
    when: stats => stats.marketingAgendaReadyItems > 0 || stats.marketingAgendaWaiting > 0,
    getMessage: stats => ({
      title: stats.marketingAgendaWaiting ? 'Unblock today\'s marketing workflow' : 'Start with today\'s marketing agenda',
      detail: stats.marketingAgendaWaiting
        ? `${stats.marketingAgendaWaiting} workflow${stats.marketingAgendaWaiting > 1 ? 's are' : ' is'} waiting for Carlos review.`
        : `${stats.marketingAgendaReadyItems} workflow${stats.marketingAgendaReadyItems > 1 ? 's are' : ' is'} ready for go/no-go.`,
      tone: stats.marketingAgendaWaiting ? '#ffd54f' : '#00e676',
    }),
  },
  {
    id: 'stale_anchor_block',
    priority: 10,
    when: stats => stats.staleZipGroups > 0,
    getMessage: stats => ({
      title: 'Fix stale anchor queues first',
      detail: `${stats.staleZipGroups} ZIP queue${stats.staleZipGroups > 1 ? 's' : ''} need${stats.staleZipGroups === 1 ? 's' : ''} fresh evidence before publishing.`,
      tone: '#ff4444',
    }),
  },
  {
    id: 'missing_creative',
    priority: 20,
    when: stats => stats.missingCreativeZipGroups > 0,
    getMessage: stats => ({
      title: 'Generate creative for blocked ZIPs',
      detail: `${stats.missingCreativeZipGroups} ZIP queue${stats.missingCreativeZipGroups > 1 ? 's are' : ' is'} missing creative needed before approval.`,
      tone: '#ffd54f',
    }),
  },
  {
    id: 'missing_page_anchor',
    priority: 30,
    when: stats => stats.fbPageDraftsReady > 0 && stats.pageAnchorsCount === 0,
    getMessage: stats => ({
      title: 'Approve a Page anchor to publish',
      detail: `${stats.fbPageDraftsReady} Facebook Page draft${stats.fbPageDraftsReady > 1 ? 's are' : ' is'} ready; approve one to create the canonical anchor.`,
      tone: '#4da3ff',
    }),
  },
  {
    id: 'page_anchor_ready_for_group_distribution',
    priority: 35,
    when: stats => stats.publishedAnchorsCount > 0 && stats.distributionPlansAwaitingApproval > 0,
    getMessage: stats => ({
      title: 'Approve distribution plan for live Page anchors',
      detail: `${stats.distributionPlansAwaitingApproval} distribution plan${stats.distributionPlansAwaitingApproval > 1 ? 's' : ''} await${stats.distributionPlansAwaitingApproval === 1 ? 's' : ''} operator approval.`,
      tone: '#00aaff',
    }),
  },
  {
    id: 'attended_share_outcome_pending',
    priority: 37,
    when: stats => stats.shareOutcomesInFlight > 0,
    getMessage: stats => ({
      title: 'Record attended share outcomes',
      detail: `${stats.shareOutcomesInFlight} group share outcome${stats.shareOutcomesInFlight > 1 ? 's are' : ' is'} awaiting final operator status.`,
      tone: '#4da3ff',
    }),
  },
  {
    id: 'native_video_pending_review',
    priority: 38,
    when: stats => stats.nativeVideoPendingReview > 0,
    getMessage: stats => ({
      title: 'Review native video drafts',
      detail: `${stats.nativeVideoPendingReview} video job${stats.nativeVideoPendingReview > 1 ? 's are' : ' is'} ready for operator review.`,
      tone: '#ffd54f',
    }),
  },
  {
    id: 'canary_job_ready',
    priority: 40,
    when: stats => stats.pageAnchorsCount > 0 && stats.canaryJobsCount === 0,
    getMessage: () => ({
      title: 'Build the canary job',
      detail: 'Page anchor exists; canary job not yet created.',
      tone: '#00e676',
    }),
  },
  {
    id: 'default_review_zip_queues',
    priority: 50,
    when: () => true,
    getMessage: () => ({
      title: 'Review ZIP queues',
      detail: 'No urgent blocks; review draft queues for ongoing approvals.',
      tone: '#8abf8a',
    }),
  },
]

export function getNextBestAction(stats) {
  return [...NEXT_ACTION_RULES]
    .sort((a, b) => a.priority - b.priority)
    .find(rule => rule.when(stats))
}

export const HIDDEN_AGENDA_STATUSES = new Set(['blocked', 'completed', 'skipped'])

export function agendaItemVisible(item) {
  return !HIDDEN_AGENDA_STATUSES.has(String(item?.status || ''))
}

export function visibleMarketingAgenda(agenda) {
  if (!agenda) return agenda
  const hiddenById = new Map()
  for (const item of agenda.hidden_items || []) {
    if (item?.agenda_item_id) hiddenById.set(item.agenda_item_id, item)
  }
  for (const item of agenda.items || []) {
    if (!agendaItemVisible(item) && item?.agenda_item_id) hiddenById.set(item.agenda_item_id, item)
  }
  const items = (agenda.items || []).filter(agendaItemVisible)
  return {
    ...agenda,
    items,
    item_count: items.length,
    hidden_items: Array.from(hiddenById.values()),
  }
}

export function isAnymalPageAnchor(campaign) {
  return (
    campaign.channel === 'facebook_page'
    && campaign.status === 'published'
    && String(campaign.channel_label || '').toLowerCase().includes('anymal os facebook')
  )
}

function canaryJobNeedsReview(job) {
  return (job.target_groups || []).some(group => group.status === 'submitted_unverified')
}

function canaryJobIsActive(job) {
  return ['approved_for_execution', 'running', 'pending_admin_approval'].includes(job.status)
}

function isPublishedToday(campaign) {
  const iso = campaign.posted_at || campaign.created_at
  if (!iso) return false
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return false
  return date.toDateString() === new Date().toDateString()
}

function distributionPlanNeedsApproval(plan) {
  return (
    plan.plan_status === 'composing'
    || plan.plan_status === 'needs_review'
    || plan.plan_status === 'partial'
    || Number(plan.pending_approval_count || 0) > 0
  )
}

function distributionPlanReady(plan) {
  return plan.plan_status === 'approved' || Number(plan.approved_count || 0) > 0
}

function nativeVideoNeedsReview(job) {
  return job.review_status === 'pending_review'
}

function nativeVideoIsGenerating(job) {
  return job.status === 'provider_submitted' || job.review_status === 'pending_generation'
}

export function buildOpsStats({
  pending,
  published,
  canaryJobs,
  pendingZipGroups,
  distributionPlans = [],
  shareOutcomes = [],
  shareOutcomeSummary = {},
  nativeVideoJobs = [],
  marketingAgenda = null,
  agendaRuns = {},
}) {
  const zipGroups = pendingZipGroups.filter(group => group.zip !== 'other')
  const staleGroups = zipGroups.filter(group => group.zipStatus === 'needs_review_stale_anchor')
  const missingCreativeGroups = zipGroups.filter(group => (
    group.zipStatus !== 'needs_review_stale_anchor'
    && (group.zipStatus === 'needs_creative_review' || group.creativeStatus === 'creative_missing')
  ))
  const fbPageDraftsReady = pending.filter(campaign => (
    campaign.channel === 'facebook_page'
    && campaign.status !== 'needs_review_stale_anchor'
    && campaign.status !== 'needs_creative_review'
  )).length
  const allPageAnchors = published.filter(isAnymalPageAnchor)
  const shareOutcomesInFlight = Number(shareOutcomeSummary.in_flight || shareOutcomes.filter(outcome => (
    ['queued', 'approved_for_attended_share', 'staging_requested', 'staging_in_progress', 'staged_for_operator_review', 'running'].includes(outcome.status)
  )).length)
  const shareOutcomesSubmitted = Number(shareOutcomeSummary.submitted || shareOutcomes.filter(outcome => (
    ['submitted_visible_or_feed', 'pending_admin_approval'].includes(outcome.status)
  )).length)
  const shareOutcomesBlocked = Number(shareOutcomeSummary.blocked || shareOutcomes.filter(outcome => (
    String(outcome.status || '').startsWith('blocked_')
  )).length)
  const agendaItems = (marketingAgenda?.items || []).filter(agendaItemVisible)
  const agendaRunRows = Object.values(agendaRuns || {})

  return {
    marketingAgendaItems: agendaItems.length,
    marketingAgendaReadyItems: agendaItems.filter(item => item.status === 'ready_for_go').length,
    marketingAgendaWaiting: agendaItems.filter(item => item.status === 'waiting_for_carlos').length
      + agendaRunRows.filter(run => run.status === 'waiting_for_carlos').length,
    marketingAgendaRunning: agendaItems.filter(item => item.status === 'running').length
      + agendaRunRows.filter(run => run.status === 'running').length,
    pendingDrafts: pending.length,
    zipGroups: zipGroups.length,
    staleZipGroups: staleGroups.length,
    staleZips: staleGroups.map(group => group.zip),
    missingCreativeZipGroups: missingCreativeGroups.length,
    missingCreativeZips: missingCreativeGroups.map(group => group.zip),
    fbPageDraftsReady,
    pageAnchorsCount: allPageAnchors.length,
    publishedAnchorsCount: allPageAnchors.length,
    approvedPageAnchorsCount: allPageAnchors.length,
    distributionPlansCount: distributionPlans.length,
    distributionPlansAwaitingApproval: distributionPlans.filter(distributionPlanNeedsApproval).length,
    distributionPlansReadyForExecution: distributionPlans.filter(distributionPlanReady).length,
    distributionTargetsNeedsReviewCount: distributionPlans.reduce((total, plan) => total + Number(plan.needs_review_count || 0), 0),
    shareOutcomesCount: Number(shareOutcomeSummary.total || shareOutcomes.length),
    shareOutcomesSubmitted,
    shareOutcomesBlocked,
    shareOutcomesInFlight,
    shareOutcomeGroupsAttempted: Number(shareOutcomeSummary.groups_attempted || 0),
    nativeVideoJobsCount: nativeVideoJobs.length,
    nativeVideoPendingReview: nativeVideoJobs.filter(nativeVideoNeedsReview).length,
    nativeVideoGenerating: nativeVideoJobs.filter(nativeVideoIsGenerating).length,
    nativeVideoApproved: nativeVideoJobs.filter(job => job.review_status === 'approved').length,
    canaryJobsCount: canaryJobs.length,
    canaryNeedsReviewCount: canaryJobs.filter(canaryJobNeedsReview).length,
    activeCanaryJobsCount: canaryJobs.filter(canaryJobIsActive).length,
    publishedPosts: published.length,
    publishedTodayCount: published.filter(isPublishedToday).length,
  }
}
