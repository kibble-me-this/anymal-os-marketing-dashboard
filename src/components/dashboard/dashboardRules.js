export const NEXT_ACTION_RULES = [
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

export function buildOpsStats({ pending, published, canaryJobs, pendingZipGroups, distributionPlans = [] }) {
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

  return {
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
    canaryJobsCount: canaryJobs.length,
    canaryNeedsReviewCount: canaryJobs.filter(canaryJobNeedsReview).length,
    activeCanaryJobsCount: canaryJobs.filter(canaryJobIsActive).length,
    publishedPosts: published.length,
    publishedTodayCount: published.filter(isPublishedToday).length,
  }
}
