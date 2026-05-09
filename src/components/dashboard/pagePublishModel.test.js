import { describe, expect, it } from 'vitest'
import {
  buildPagePublishArtifact,
  buildPublishPayload,
  creativePreview,
  findCampaignById,
  mergeCampaignRows,
  pagePublishEvidence,
} from './pagePublishModel'

const run = {
  run_id: 'workflowrun_test',
  workflow_type: 'zip_price_activation',
  workflow_title: 'Announce 31901 price intelligence is live',
  status: 'waiting_for_carlos',
  current_step_id: 'approve_page_anchor_in_draft_review',
  linked_entities: { zip: '31901' },
  steps: [
    { step_id: 'review_launch_package', title: 'Carlos reviews launch package', kind: 'carlos_final_action', status: 'completed' },
    { step_id: 'approve_page_anchor_in_draft_review', title: 'Carlos approves Page anchor in Draft Review', kind: 'carlos_final_action', status: 'pending' },
    { step_id: 'stage_personal_share', title: 'Stage personal share', kind: 'browser_stage_only', status: 'pending', result: {
      share_outcomes: [{
        share_outcome_id: 'share_1',
        group_name: 'USA Cattle',
        group_url: 'https://www.facebook.com/groups/usa-cattle',
        posting_identity: 'carlos_personal',
        status: 'approved_for_attended_share',
      }],
    } },
  ],
}

const campaign = {
  campaign_id: 'step37_31901_facebook_page_v2',
  zip: '31901',
  channel: 'facebook_page',
  status: 'draft',
  message: 'Columbus and Muscogee County cattle folks: local price view is live.',
  creative_metadata: {
    image_url: 'https://example.com/creative.png',
  },
  freshness_gate: {
    label: 'fresh',
    fresh_count: 2,
    total_count: 2,
  },
}

describe('page publish model', () => {
  it('merges campaign rows and finds an exact campaign id', () => {
    const merged = mergeCampaignRows([
      [campaign],
      [{ ...campaign, status: 'published' }],
      [{ campaign_id: 'other', zip: '31901' }],
    ])

    expect(merged).toHaveLength(2)
    expect(findCampaignById(merged, 'step37_31901_facebook_page_v2').status).toBe('published')
    expect(findCampaignById(merged, 'missing')).toBe(null)
  })

  it('builds a publish artifact with copy, creative, destination, evidence, and risk', () => {
    const artifact = buildPagePublishArtifact({ run, campaign, campaignId: campaign.campaign_id })

    expect(artifact.artifactType).toBe('facebook_page_publish_decision')
    expect(artifact.zip).toBe('31901')
    expect(artifact.stepNumber).toBe(2)
    expect(artifact.stepCount).toBe(3)
    expect(artifact.risk).toBe('live_external')
    expect(artifact.destination.label).toBe('Anymal OS Facebook Page')
    expect(artifact.downstreamTarget.label).toBe('USA Cattle')
    expect(artifact.creative.src).toBe('https://example.com/creative.png')
    expect(artifact.copy).toContain('Columbus')
    expect(artifact.canPreview).toBe(true)
    expect(artifact.canPublish).toBe(true)
    expect(artifact.evidenceRows.find(row => row.id === 'posted_url').state).toBe('no')
  })

  it('blocks publishing when required campaign data is missing', () => {
    const artifact = buildPagePublishArtifact({
      run,
      campaign: { ...campaign, message: '', creative_metadata: {} },
      campaignId: campaign.campaign_id,
    })

    expect(artifact.canPublish).toBe(false)
    expect(artifact.blockers).toContain('Final Facebook Page copy is missing.')
    expect(artifact.blockers).toContain('Facebook Page creative is missing.')
  })

  it('detects published evidence and chart creative fallbacks', () => {
    const withChart = {
      ...campaign,
      creative_metadata: {},
      chart_base64: 'abc123',
      status: 'published',
      posted_url: 'https://facebook.com/post/1',
      post_id: 'post_1',
    }

    expect(creativePreview(withChart).src).toBe('data:image/png;base64,abc123')
    expect(pagePublishEvidence(withChart).hasPublishedEvidence).toBe(true)
    expect(buildPagePublishArtifact({ run, campaign: withChart, campaignId: withChart.campaign_id }).alreadyPublished).toBe(true)
  })

  it('builds freshness override payload only when Carlos acknowledges it', () => {
    expect(buildPublishPayload()).toEqual({})
    const payload = buildPublishPayload({ freshnessAcknowledged: true, acknowledgedBy: 'Carlos' })
    expect(payload.stale_acknowledged).toBe(true)
    expect(payload.acknowledged_by).toBe('Carlos')
    expect(payload.acknowledged_at).toMatch(/T/)
  })
})
