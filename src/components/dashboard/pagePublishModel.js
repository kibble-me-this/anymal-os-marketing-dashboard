import { campaignFreshnessGate, freshnessLabel, freshnessTone, freshnessTooltip, requiresFreshnessAcknowledgment } from './freshness'
import { currentStep, normalizeZip, stepNumber, targetShareSummary } from './workflowCockpitModel'

export const CAMPAIGN_LOOKUP_STATUSES = [
  'published',
  'needs_creative_review',
  'needs_review_stale_anchor',
  'generated',
  'draft',
  'ready',
  'approved',
  'pending',
]

export function normalizeCampaignId(value) {
  return String(value || '').trim()
}

export function mergeCampaignRows(rows = []) {
  const map = new Map()
  rows.flat().forEach(campaign => {
    const id = normalizeCampaignId(campaign?.campaign_id || campaign?.doc_id)
    if (id) map.set(id, campaign)
  })
  return Array.from(map.values())
}

export function findCampaignById(campaigns = [], campaignId) {
  const target = normalizeCampaignId(campaignId)
  if (!target) return null
  return (campaigns || []).find(campaign => (
    normalizeCampaignId(campaign?.campaign_id) === target
    || normalizeCampaignId(campaign?.doc_id) === target
  )) || null
}

export function campaignCopy(campaign) {
  return String(campaign?.message || campaign?.generated_copy || '').trim()
}

export function creativePreview(campaign) {
  const metadata = campaign?.creative_metadata || {}
  const sources = [
    ['creative_metadata.thumbnail_url', metadata.thumbnail_url],
    ['creative_metadata.image_url', metadata.image_url],
    ['published_image_url', campaign?.published_image_url],
    ['image_url', campaign?.image_url],
  ]
  const found = sources.find(([, value]) => Boolean(value))
  if (found) {
    return {
      src: String(found[1]),
      source: found[0],
      kind: 'image',
      label: 'Facebook Page creative',
    }
  }
  if (campaign?.chart_base64) {
    return {
      src: `data:image/png;base64,${campaign.chart_base64}`,
      source: 'chart_base64',
      kind: 'image',
      label: 'Generated chart creative',
    }
  }
  return {
    src: '',
    source: 'not exposed',
    kind: 'missing',
    label: 'Creative missing',
  }
}

export function pagePublishEvidence(campaign) {
  const postedUrl = campaign?.posted_url || campaign?.page_anchor_post_url || ''
  const postId = campaign?.post_id || campaign?.facebook_post_id || campaign?.page_anchor_post_id || ''
  return {
    postedUrl,
    postId,
    hasPublishedEvidence: Boolean(postedUrl && postId),
  }
}

export function isFacebookPageCampaign(campaign) {
  return campaign?.channel === 'facebook_page'
}

function evidenceRows(campaign) {
  const evidence = pagePublishEvidence(campaign)
  return [
    {
      id: 'posted_url',
      label: 'Posted URL',
      state: evidence.postedUrl ? 'yes' : 'no',
      value: evidence.postedUrl || 'Missing',
      source: 'campaign row',
    },
    {
      id: 'post_id',
      label: 'Post ID',
      state: evidence.postId ? 'yes' : 'no',
      value: evidence.postId || 'Missing',
      source: 'campaign row',
    },
    {
      id: 'campaign_status',
      label: 'Campaign status',
      state: campaign?.status ? 'yes' : 'unknown',
      value: campaign?.status || 'Unknown',
      source: 'campaign row',
    },
    {
      id: 'creative_attached',
      label: 'Creative attached',
      state: creativePreview(campaign).src ? 'yes' : 'no',
      value: creativePreview(campaign).src ? creativePreview(campaign).source : 'Missing',
      source: 'campaign row',
    },
  ]
}

function freshnessSummary(campaign = {}) {
  const source = campaign || {}
  const gate = campaignFreshnessGate(source)
  return {
    gate,
    label: freshnessLabel(gate),
    tone: freshnessTone(gate),
    tooltip: freshnessTooltip(gate),
    requiresAck: requiresFreshnessAcknowledgment(source),
    warning: source.freshness_warning || '',
  }
}

function campaignBlockers({ run, campaign, copy, creative }) {
  const blockers = []
  if (!run?.run_id) blockers.push('Workflow run was not loaded.')
  if (run?.workflow_type && run.workflow_type !== 'zip_price_activation') blockers.push('Only ZIP launch workflows are supported in this publish surface.')
  if (!campaign) {
    blockers.push('The Facebook Page campaign was not found in loaded campaign lists.')
    return blockers
  }
  if (!isFacebookPageCampaign(campaign)) blockers.push('This campaign is not a Facebook Page campaign.')
  if (!copy) blockers.push('Final Facebook Page copy is missing.')
  if (!creative.src) blockers.push('Facebook Page creative is missing.')
  if (campaign.status === 'needs_review_stale_anchor') blockers.push('This campaign is flagged for stale anchor review.')
  return blockers
}

export function buildPagePublishArtifact({ run, campaign, campaignId }) {
  const step = currentStep(run)
  const zip = normalizeZip(campaign?.zip || run?.linked_entities?.zip)
  const copy = campaignCopy(campaign)
  const creative = creativePreview(campaign)
  const evidence = pagePublishEvidence(campaign)
  const freshness = freshnessSummary(campaign)
  const blockers = campaignBlockers({ run, campaign, copy, creative })
  const alreadyPublished = Boolean(evidence.hasPublishedEvidence || campaign?.status === 'published')
  const stepId = step?.step_id || run?.current_step_id || ''
  const downstreamTarget = targetShareSummary(run, [])

  return {
    artifactType: 'facebook_page_publish_decision',
    artifactId: `${run?.run_id || 'missing-run'}:${normalizeCampaignId(campaignId)}`,
    runId: run?.run_id || '',
    campaignId: normalizeCampaignId(campaign?.campaign_id || campaign?.doc_id || campaignId),
    zip,
    workflowTitle: run?.workflow_title || (zip ? `ZIP Launch ${zip}` : 'ZIP launch'),
    currentStepId: stepId,
    stepTitle: step?.title || run?.attended_gate?.title || stepId || 'Current workflow step',
    stepNumber: step ? stepNumber(run, step.step_id) : null,
    stepCount: (run?.steps || []).length || null,
    risk: 'live_external',
    primaryAction: 'publish_facebook_page_post',
    channel: campaign?.channel || 'unknown',
    destination: {
      label: 'Anymal OS Facebook Page',
      channel: 'facebook_page',
    },
    downstreamTarget: {
      known: downstreamTarget.known,
      label: downstreamTarget.groupName,
      url: downstreamTarget.groupUrl,
      postingIdentity: downstreamTarget.postingIdentity,
    },
    copy,
    creative,
    evidenceRows: evidenceRows(campaign),
    postedUrl: evidence.postedUrl,
    postId: evidence.postId,
    hasPublishedEvidence: evidence.hasPublishedEvidence,
    alreadyPublished,
    freshness,
    blockers,
    canPreview: Boolean(campaign && copy),
    canPublish: Boolean(campaign && copy && creative.src && blockers.length === 0 && !alreadyPublished),
  }
}

export function buildPublishPayload({ freshnessAcknowledged = false, acknowledgedBy = 'carlos' } = {}) {
  if (!freshnessAcknowledged) return {}
  return {
    stale_acknowledged: true,
    acknowledged_by: acknowledgedBy,
    acknowledged_at: new Date().toISOString(),
  }
}
