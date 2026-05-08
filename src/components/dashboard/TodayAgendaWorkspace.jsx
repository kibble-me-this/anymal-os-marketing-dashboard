import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LAST_WORKFLOW_STORAGE_KEY } from './workflowCockpitModel'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
const SHARE_STAGE_READY_STATUSES = new Set([
  'staged_for_operator_review',
  'submitted_visible_or_feed',
  'pending_admin_approval',
])
const SHARE_STAGING_ACTIVE_STATUSES = new Set([
  'staging_requested',
  'staging_in_progress',
])
const RELATIONSHIP_STAGE_READY_STATUS = 'staged_for_operator_review'
const RELATIONSHIP_STAGING_ACTIVE_STATUSES = new Set([
  'staging_requested',
  'staging_in_progress',
])
const WORKFLOW_LABELS = {
  relationship_growth: 'Relationship growth',
  zip_price_activation: 'ZIP launch',
  city_launch_amplification: 'City amplification',
  native_video_review: 'Native video',
  pending_share_follow_up: 'Share follow-up',
}

function readLastWorkflowShortcut() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_WORKFLOW_STORAGE_KEY) || 'null')
    return parsed?.runId ? parsed : null
  } catch {
    return null
  }
}

function normalizeZip(zip) {
  const value = String(zip || '').trim()
  return /^\d{1,5}$/.test(value) ? value.padStart(5, '0') : ''
}

function agendaItemZip(item) {
  return normalizeZip(item?.linked_entities?.zip)
}

function uniqueZips(zips) {
  return Array.from(new Set((zips || []).map(normalizeZip).filter(Boolean)))
}

function findComposedWorkflowItem(agenda, workflowType, candidateZips = [], excludedZips = []) {
  const items = agenda?.items || []
  const normalizedCandidates = new Set(candidateZips.map(normalizeZip).filter(Boolean))
  const normalizedExcluded = new Set(excludedZips.map(normalizeZip).filter(Boolean))
  const eligibleItems = items.filter(item => (
    item.workflow_type === workflowType
    && !normalizedExcluded.has(agendaItemZip(item))
  ))
  if (normalizedCandidates.size) {
    const exact = eligibleItems.find(item => normalizedCandidates.has(agendaItemZip(item)))
    if (exact) return exact
  }
  const primary = eligibleItems.find(item => item.agenda_item_id === agenda?.primary_item_id)
  if (primary) return primary
  return (
    eligibleItems.find(item => item.status !== 'completed')
    || eligibleItems[0]
    || null
  )
}

function buttonStyle({ tone = '#00e676', filled = false, disabled = false } = {}) {
  return {
    padding: '9px 12px',
    borderRadius: '5px',
    border: filled && !disabled ? 'none' : `1px solid ${tone}`,
    background: filled && !disabled ? tone : 'transparent',
    color: filled && !disabled ? '#021a0e' : tone,
    fontSize: '10px',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    fontFamily: SANS_FONT,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  }
}

function StatusPill({ children, tone = '#00e676' }) {
  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontFamily: SANS_FONT, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function displayGateTitle(gate) {
  if (gate?.step_id === 'stage_personal_share') return 'Prepare personal share handoff records'
  if (gate?.step_id === 'click_post') return 'Request browser staging, then Carlos reviews Post'
  return gate?.title
}

function Modal({ title, children, onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0, 0, 0, 0.72)',
        display: 'grid',
        placeItems: 'center',
        padding: '20px',
      }}
    >
      <section style={{ width: 'min(1080px, 100%)', maxHeight: 'calc(100vh - 40px)', overflow: 'auto', border: '1px solid #1a3a2a', borderRadius: '8px', background: '#021a0e', boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', padding: '14px', borderBottom: '1px solid #1a3a2a', background: '#031808' }}>
          <div style={{ color: '#e0ffe0', fontSize: '15px', fontWeight: 700 }}>{title}</div>
          <button type="button" onClick={onClose} style={buttonStyle()}>
            Close
          </button>
        </div>
        <div style={{ padding: '14px', display: 'grid', gap: '14px' }}>
          {children}
        </div>
      </section>
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div style={{ border: '1px dashed #1a3a2a', borderRadius: '6px', padding: '28px', textAlign: 'center', color: '#4a7a5a', background: '#031808', fontSize: '12px' }}>
      {message}
    </div>
  )
}

function ModalCategory({ title, summary, tone = '#1a3a2a', children }) {
  return (
    <section style={{ border: `1px solid ${tone}`, borderRadius: '6px', background: '#031808', padding: '12px', display: 'grid', gap: '10px' }}>
      <div style={{ display: 'grid', gap: '4px' }}>
        <div style={{ color: tone === '#1a3a2a' ? '#4a7a5a' : tone, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>{title}</div>
        {summary && <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.4 }}>{summary}</div>}
      </div>
      {children}
    </section>
  )
}

function statusTone(status) {
  if (status === 'completed') return '#00e676'
  if (status === 'blocked' || status === 'changes_requested') return '#ff4444'
  if (status === 'waiting_for_carlos' || status === 'needs_carlos') return '#ffd54f'
  if (status === 'approved_for_attended_share') return '#ffd54f'
  if (SHARE_STAGING_ACTIVE_STATUSES.has(status)) return '#4da3ff'
  if (status === 'staged_for_operator_review') return '#00e676'
  if (status === 'staging_failed') return '#ff4444'
  if (status === 'running') return '#4da3ff'
  return '#8abf8a'
}

function formatEntityList(entities) {
  return Object.entries(entities || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 8)
}

function ReadinessList({ title, checks }) {
  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '12px', display: 'grid', gap: '8px' }}>
      <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>{title}</div>
      {(checks || []).map(check => (
        <div key={`${check.check}:${check.status}`} style={{ display: 'grid', gap: '4px', borderTop: '1px solid #0d281a', paddingTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>{check.check}</span>
            <StatusPill tone={statusTone(check.status)}>{check.status}</StatusPill>
          </div>
          <div style={{ color: '#4a7a5a', fontSize: '11px', lineHeight: 1.35 }}>{check.detail}</div>
        </div>
      ))}
      {!checks?.length && <div style={{ color: '#4a7a5a', fontSize: '12px' }}>No checks reported.</div>}
    </section>
  )
}

function WorkflowStepList({ steps = [], currentStepId }) {
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {steps.map((step, index) => {
        const active = currentStepId && step.step_id === currentStepId
        const tone = active ? '#ffd54f' : statusTone(step.status)
        return (
          <div key={step.step_id} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: '10px', alignItems: 'start', border: `1px solid ${active ? '#ffd54f' : '#1a3a2a'}`, borderRadius: '6px', background: '#031808', padding: '10px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '999px', border: `1px solid ${tone}`, color: tone, display: 'grid', placeItems: 'center', fontSize: '11px', fontFamily: MONO_FONT }}>
              {index + 1}
            </div>
            <div style={{ display: 'grid', gap: '4px' }}>
              <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>{step.title}</div>
              <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>
                {step.step_id} | {step.kind}
              </div>
              {step.detail && <div style={{ color: '#4a7a5a', fontSize: '11px' }}>{step.detail}</div>}
              {step.operator_notes && <div style={{ color: '#ffd54f', fontSize: '11px' }}>{step.operator_notes}</div>}
            </div>
            <StatusPill tone={tone}>{active ? 'current' : step.status || 'pending'}</StatusPill>
          </div>
        )
      })}
    </div>
  )
}

function AgendaItemCard({ item, active, onSelect }) {
  const tone = active ? '#00e676' : statusTone(item.status)
  return (
    <button
      type="button"
      onClick={() => onSelect(item.agenda_item_id)}
      style={{
        textAlign: 'left',
        border: `1px solid ${active ? '#00e676' : '#1a3a2a'}`,
        borderRadius: '6px',
        background: active ? '#062010' : '#031808',
        padding: '12px',
        display: 'grid',
        gap: '8px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start' }}>
        <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700, lineHeight: 1.25 }}>{item.workflow_title}</div>
        <StatusPill tone={tone}>{item.priority_score}</StatusPill>
      </div>
      <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>
        {WORKFLOW_LABELS[item.workflow_type] || item.workflow_type}
      </div>
      <div style={{ color: '#4a7a5a', fontSize: '12px', lineHeight: 1.35 }}>{item.why_today}</div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <StatusPill tone={statusTone(item.status)}>{item.status}</StatusPill>
        {item.active_run_id && <StatusPill tone="#4da3ff">run active</StatusPill>}
      </div>
    </button>
  )
}

function rowsForZip(campaigns = [], zip) {
  const normalizedZip = String(zip || '').padStart(5, '0')
  if (!/^\d{5}$/.test(normalizedZip)) return []
  return (campaigns || [])
    .filter(campaign => String(campaign?.zip || '').padStart(5, '0') === normalizedZip)
    .sort((a, b) => {
      const aPage = a.channel === 'facebook_page' ? 0 : 1
      const bPage = b.channel === 'facebook_page' ? 0 : 1
      if (aPage !== bPage) return aPage - bPage
      return String(a.channel || '').localeCompare(String(b.channel || ''))
    })
}

function facebookPageCampaign(campaigns = [], zip) {
  return rowsForZip(campaigns, zip).find(campaign => campaign.channel === 'facebook_page') || null
}

function pageAnchorEvidence(campaign) {
  const postUrl = campaign?.posted_url || campaign?.page_anchor_post_url || ''
  const postId = campaign?.post_id || campaign?.facebook_post_id || campaign?.page_anchor_post_id || ''
  return {
    postUrl,
    postId,
    ready: campaign?.status === 'published' && Boolean(postUrl && postId),
  }
}

function campaignCreativeReady(campaign) {
  return (
    campaign?.creative_status === 'creative_current'
    || Boolean(campaign?.creative_metadata?.image_url || campaign?.creative_metadata?.thumbnail_url || campaign?.creative_asset_id)
  )
}

function stepResult(run, stepId) {
  return (run?.steps || []).find(step => step.step_id === stepId)?.result || null
}

function gateEvidenceState(run, activeGate, campaigns) {
  const zip = run?.linked_entities?.zip
  const gateId = activeGate?.step_id
  if (gateId === 'review_launch_package') {
    const rows = rowsForZip(campaigns, zip)
    const pageCampaign = rows.find(campaign => campaign.channel === 'facebook_page')
    const creativeReady = campaignCreativeReady(pageCampaign)
    if (!rows.length) {
      return {
        blocked: true,
        message: 'Generated draft assets are not loaded yet. Refresh before approving the package.',
      }
    }
    if (!pageCampaign) {
      return {
        blocked: true,
        message: 'A Facebook Page draft is required before approving the launch package.',
      }
    }
    return {
      blocked: !creativeReady,
      message: creativeReady ? '' : 'Generate and attach the Facebook Page creative before approving the launch package.',
    }
  }
  if (gateId === 'approve_page_anchor_in_draft_review') {
    const campaign = facebookPageCampaign(campaigns, zip)
    const evidence = pageAnchorEvidence(campaign)
    return {
      blocked: !evidence.ready,
      message: evidence.ready
        ? ''
        : 'A published Facebook Page anchor with posted_url and post_id is required before this gate can pass.',
    }
  }
  if (gateId === 'approve_distribution_targets') {
    const composeResult = stepResult(run, 'compose_distribution_plan')
    const targetCount = Number(composeResult?.target_count || 0)
    return {
      blocked: !composeResult?.plan_id || targetCount < 1,
      message: composeResult?.plan_id && targetCount > 0
        ? ''
        : 'A composed distribution plan with target groups is required before approving targets.',
    }
  }
  if (gateId === 'stage_personal_share') {
    return {
      blocked: true,
      message: 'Browser staging must be produced by the safe staging step. Do not approve this as a manual gate.',
    }
  }
  if (gateId === 'click_post') {
    const stageResult = stepResult(run, 'stage_personal_share')
    const outcomes = Array.isArray(stageResult?.share_outcomes) ? stageResult.share_outcomes : []
    const stagedCount = outcomes.filter(outcome => SHARE_STAGE_READY_STATUSES.has(outcome.status)).length
    return {
      blocked: stagedCount < 1,
      message: stagedCount > 0
        ? ''
        : 'The Facebook composer has not been staged yet. Request browser staging, then wait for the local desktop runner to mark the share staged_for_operator_review before approving Post.',
    }
  }
  if (gateId === 'stage_growth_browser_session') {
    return {
      blocked: true,
      message: 'Relationship growth staging must be produced by the desktop browser runner. Request staging and wait for candidates before approving.',
    }
  }
  if (gateId === 'approve_join_follow_comment_actions') {
    const stageResult = stepResult(run, 'stage_growth_browser_session')
    const candidateCount = Number(stageResult?.candidate_count || (Array.isArray(stageResult?.candidates) ? stageResult.candidates.length : 0))
    return {
      blocked: stageResult?.staging_status !== RELATIONSHIP_STAGE_READY_STATUS || candidateCount < 1,
      message: stageResult?.staging_status === RELATIONSHIP_STAGE_READY_STATUS && candidateCount > 0
        ? ''
        : 'Relationship candidates must be staged by the desktop browser runner before Carlos can approve any action recommendations.',
    }
  }
  return { blocked: false, message: '' }
}

function RunControls({
  run,
  activeGate,
  launchPackageCampaigns,
  zipLoading,
  onGenerateCreative,
  onOpenDraftReview,
  onRunNextStep,
  onRecordDecision,
  onRequestShareStaging,
  onRequestRelationshipGrowthStaging,
  actionLoading,
  shareOutcomeActionLoading,
}) {
  const [notes, setNotes] = useState('')
  const stepId = activeGate?.step_id || run?.current_step_id || ''
  const isLoading = actionLoading === `run:${run?.run_id}` || actionLoading === `decision:${run?.run_id}`
  const gateEvidence = gateEvidenceState(run, activeGate, launchPackageCampaigns)
  const positiveDecisionDisabled = isLoading || !stepId || gateEvidence.blocked

  if (!run) return null

  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#021a0e', padding: '14px', display: 'grid', gap: '12px' }}>
      <ModalCategory title="1. Current decision" summary="The one thing this modal is asking Carlos to decide right now." tone="#ffd54f">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'start' }}>
          <div>
            <h3 style={{ color: '#e0ffe0', fontSize: '16px', margin: 0, letterSpacing: 0 }}>{run.workflow_title}</h3>
            <div style={{ color: '#8abf8a', fontSize: '11px', marginTop: '5px', fontFamily: MONO_FONT }}>{run.run_id}</div>
          </div>
          <StatusPill tone={statusTone(run.status)}>{run.status}</StatusPill>
        </div>
        {activeGate && (
          <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', padding: '12px', color: '#ffd54f', display: 'grid', gap: '6px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>{displayGateTitle(activeGate)}</div>
            <div style={{ color: '#ffe9a6', fontSize: '12px', lineHeight: 1.4 }}>{activeGate.message}</div>
          </div>
        )}
      </ModalCategory>

      <ModalCategory title="2. Evidence and handoff status" summary="Proof, browser staging, or draft evidence needed before the gate can move.">
        {activeGate?.step_id === 'review_launch_package' && (
          <LaunchPackageReview
            campaigns={launchPackageCampaigns}
            zip={run?.linked_entities?.zip}
            zipLoading={zipLoading}
            onGenerateCreative={onGenerateCreative}
            onOpenDraftReview={onOpenDraftReview}
          />
        )}

        {activeGate?.step_id === 'approve_page_anchor_in_draft_review' && (
          <PageAnchorGateReview
            campaigns={launchPackageCampaigns}
            zip={run?.linked_entities?.zip}
            zipLoading={zipLoading}
            onGenerateCreative={onGenerateCreative}
            onOpenDraftReview={onOpenDraftReview}
          />
        )}

        {activeGate?.step_id === 'approve_distribution_targets' && (
          <DistributionGateReview run={run} />
        )}

        {(activeGate?.step_id === 'stage_personal_share' || activeGate?.step_id === 'click_post') && (
          <PersonalShareStageReview
            run={run}
            onRequestShareStaging={onRequestShareStaging}
            shareOutcomeActionLoading={shareOutcomeActionLoading}
          />
        )}

        {(activeGate?.step_id === 'stage_growth_browser_session' || activeGate?.step_id === 'approve_join_follow_comment_actions') && (
          <RelationshipGrowthStageReview
            run={run}
            onRequestRelationshipGrowthStaging={onRequestRelationshipGrowthStaging}
            actionLoading={actionLoading}
          />
        )}

        {gateEvidence.blocked && (
          <div style={{ border: '1px solid #ff4444', borderRadius: '6px', background: '#260707', color: '#ffb3b3', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
            {gateEvidence.message}
          </div>
        )}
      </ModalCategory>

      <ModalCategory title="3. Operator action" summary="Write an optional note, then choose the gate outcome. Disabled buttons mean evidence is still missing.">
        <textarea
          value={notes}
          onChange={event => setNotes(event.target.value)}
          placeholder="Operator notes or blocking reason"
          style={{ width: '100%', minHeight: '64px', boxSizing: 'border-box', background: '#021a0e', color: '#e0ffe0', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px', fontSize: '12px', fontFamily: MONO_FONT }}
        />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onRunNextStep(run.run_id)} disabled={isLoading || run.status !== 'running'} style={buttonStyle({ disabled: isLoading || run.status !== 'running' })}>
            Run safe next step
          </button>
          <button type="button" onClick={() => onRecordDecision(run.run_id, stepId, 'approved', notes)} disabled={positiveDecisionDisabled} style={buttonStyle({ filled: true, disabled: positiveDecisionDisabled })}>
            {activeGate?.step_id === 'review_launch_package' ? 'Approve package' : 'Approve gate'}
          </button>
          <button type="button" onClick={() => onRecordDecision(run.run_id, stepId, 'completed', notes)} disabled={positiveDecisionDisabled} style={buttonStyle({ disabled: positiveDecisionDisabled })}>
            Mark done
          </button>
          <button type="button" onClick={() => onRecordDecision(run.run_id, stepId, 'changes_requested', notes)} disabled={isLoading || !stepId} style={buttonStyle({ tone: '#ffd54f', disabled: isLoading || !stepId })}>
            Changes
          </button>
          <button type="button" onClick={() => onRecordDecision(run.run_id, stepId, 'blocked', notes)} disabled={isLoading || !stepId} style={buttonStyle({ tone: '#ff4444', disabled: isLoading || !stepId })}>
            Block
          </button>
        </div>
      </ModalCategory>
    </section>
  )
}

function LaunchPackageReview({ campaigns = [], zip, zipLoading = {}, onGenerateCreative, onOpenDraftReview }) {
  const rows = rowsForZip(campaigns, zip)
  const pageDraft = rows.find(campaign => campaign.channel === 'facebook_page')
  const creativeReady = campaignCreativeReady(pageDraft)
  const creativeUrl = pageDraft?.creative_metadata?.thumbnail_url || pageDraft?.creative_metadata?.image_url || pageDraft?.published_image_url || ''
  const loadingPhase = zipLoading?.[String(zip || '').padStart(5, '0')] || ''
  const creativeLoading = Boolean(loadingPhase)
  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '12px', display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Launch package under review</div>
          <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>
            {rows.length ? `${rows.length} generated draft assets for ZIP ${zip}` : `No loaded draft assets yet for ZIP ${zip}`}
          </div>
        </div>
        {pageDraft && <StatusPill tone={statusTone(pageDraft.status)}>{pageDraft.status}</StatusPill>}
      </div>
      <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
        This gate reviews the complete ZIP launch package: copy plus the Facebook Page creative. It does not publish the Page post, approve distribution targets, or perform any personal-account action.
      </div>
      {!rows.length && (
        <div style={{ color: '#ffd54f', fontSize: '12px', lineHeight: 1.45 }}>
          The backend generated the package, but the dashboard has not loaded the draft records yet. Refresh the dashboard before approving.
        </div>
      )}
      {pageDraft && !creativeReady && (
        <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', padding: '10px', display: 'grid', gap: '8px' }}>
          <div style={{ color: '#ffd54f', fontSize: '12px', fontWeight: 700 }}>Facebook Page creative is missing.</div>
          <div style={{ color: '#ffe9a6', fontSize: '12px', lineHeight: 1.45 }}>
            Generate and attach the creative here before approving the launch package. Approval stays blocked until the final creative is part of this review.
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onGenerateCreative?.(zip)} disabled={creativeLoading || !onGenerateCreative} style={buttonStyle({ filled: true, disabled: creativeLoading || !onGenerateCreative })}>
              {creativeLoading ? loadingPhase : 'Generate and attach creative'}
            </button>
            <button type="button" onClick={() => onOpenDraftReview?.(zip)} style={buttonStyle()}>
              Open Draft Review
            </button>
          </div>
        </div>
      )}
      {pageDraft && creativeReady && (
        <div style={{ border: '1px solid #00e676', borderRadius: '6px', background: '#052312', padding: '10px', display: 'grid', gap: '8px' }}>
          <div style={{ color: '#00e676', fontSize: '12px', fontWeight: 700 }}>Facebook Page creative is attached.</div>
          {creativeUrl && (
            <a href={creativeUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: 'min(420px, 100%)' }}>
              <img src={creativeUrl} alt={`Creative preview for ZIP ${zip}`} style={{ width: '100%', aspectRatio: '600 / 315', objectFit: 'cover', border: '1px solid #1a3a2a', borderRadius: '5px', background: '#021a0e' }} />
            </a>
          )}
        </div>
      )}
      {rows.map(campaign => {
        const copy = campaign.message || campaign.generated_copy || ''
        const rowCreativeUrl = campaign.creative_metadata?.thumbnail_url || campaign.creative_metadata?.image_url || ''
        return (
          <article key={campaign.campaign_id} style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '10px', display: 'grid', gap: '7px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ color: '#e0ffe0', fontSize: '12px', fontWeight: 700 }}>{campaign.channel || 'channel'}</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <StatusPill tone={statusTone(campaign.status)}>{campaign.status || 'draft'}</StatusPill>
                {campaign.creative_status && <StatusPill tone={campaign.creative_status === 'creative_current' ? '#00e676' : '#ffd54f'}>{campaign.creative_status}</StatusPill>}
              </div>
            </div>
            <div style={{ color: '#4a7a5a', fontSize: '10px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>{campaign.campaign_id}</div>
            {campaign.channel === 'facebook_page' && rowCreativeUrl && (
              <a href={rowCreativeUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: 'min(360px, 100%)' }}>
                <img src={rowCreativeUrl} alt={`Facebook Page creative for ZIP ${zip}`} style={{ width: '100%', aspectRatio: '600 / 315', objectFit: 'cover', border: '1px solid #1a3a2a', borderRadius: '5px', background: '#021a0e' }} />
              </a>
            )}
            {copy && (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#c8f7c8', background: '#021a0e', border: '1px solid #0d281a', borderRadius: '5px', padding: '9px', fontSize: '11px', lineHeight: 1.45, fontFamily: MONO_FONT }}>
                {copy}
              </pre>
            )}
          </article>
        )
      })}
    </section>
  )
}

function PageAnchorGateReview({ campaigns = [], zip, zipLoading = {}, onGenerateCreative, onOpenDraftReview }) {
  const pageCampaign = facebookPageCampaign(campaigns, zip)
  const evidence = pageAnchorEvidence(pageCampaign)
  const copy = pageCampaign?.message || pageCampaign?.generated_copy || ''
  const creativeReady = campaignCreativeReady(pageCampaign)
  const loadingPhase = zipLoading?.[String(zip || '').padStart(5, '0')] || ''
  const creativeLoading = Boolean(loadingPhase)
  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '12px', display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Page anchor evidence required</div>
          <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>
            {pageCampaign ? `Facebook Page campaign for ZIP ${zip}` : `No Facebook Page campaign loaded for ZIP ${zip}`}
          </div>
        </div>
        {pageCampaign && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <StatusPill tone={statusTone(pageCampaign.status)}>{pageCampaign.status || 'draft'}</StatusPill>
            {pageCampaign.creative_status && <StatusPill tone={pageCampaign.creative_status === 'creative_current' ? '#00e676' : '#ffd54f'}>{pageCampaign.creative_status}</StatusPill>}
            <StatusPill tone={evidence.ready ? '#00e676' : '#ff4444'}>{evidence.ready ? 'anchor verified' : 'anchor missing'}</StatusPill>
          </div>
        )}
      </div>
      <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
        This gate means the Page post has already been reviewed and published from Draft Review. It cannot be approved from the agenda until the campaign has both a posted URL and a post ID.
      </div>
      {pageCampaign && !creativeReady && (
        <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', padding: '10px', display: 'grid', gap: '8px' }}>
          <div style={{ color: '#ffd54f', fontSize: '12px', fontWeight: 700 }}>Creative is required before this Page draft can become the Page anchor.</div>
          <div style={{ color: '#ffe9a6', fontSize: '12px', lineHeight: 1.45 }}>
            Generate and attach the ZIP creative here, then open Draft Review to inspect the final Facebook Page draft before publishing.
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onGenerateCreative?.(zip)} disabled={creativeLoading} style={buttonStyle({ filled: true, disabled: creativeLoading })}>
              {creativeLoading ? loadingPhase : 'Generate and attach creative'}
            </button>
            <button type="button" onClick={() => onOpenDraftReview?.(zip)} style={buttonStyle()}>
              Open Draft Review
            </button>
          </div>
        </div>
      )}
      {pageCampaign && creativeReady && !evidence.ready && (
        <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', padding: '10px', display: 'grid', gap: '8px' }}>
          <div style={{ color: '#ffd54f', fontSize: '12px', fontWeight: 700 }}>Creative is ready. Carlos still needs to review and publish the Page draft.</div>
          <div style={{ color: '#ffe9a6', fontSize: '12px', lineHeight: 1.45 }}>
            Open Draft Review, inspect the Facebook Page draft, and approve it only if you want the Page anchor published externally.
          </div>
          <div>
            <button type="button" onClick={() => onOpenDraftReview?.(zip)} style={buttonStyle({ filled: true })}>
              Open Draft Review
            </button>
          </div>
        </div>
      )}
      {pageCampaign && (
        <article style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '10px', display: 'grid', gap: '7px' }}>
          <div style={{ color: '#4a7a5a', fontSize: '10px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>{pageCampaign.campaign_id}</div>
          {copy && (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#c8f7c8', background: '#021a0e', border: '1px solid #0d281a', borderRadius: '5px', padding: '9px', fontSize: '11px', lineHeight: 1.45, fontFamily: MONO_FONT }}>
              {copy}
            </pre>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '8px' }}>
            <div style={{ color: evidence.postUrl ? '#8abf8a' : '#ffb3b3', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
              posted_url: {evidence.postUrl || 'missing'}
            </div>
            <div style={{ color: evidence.postId ? '#8abf8a' : '#ffb3b3', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
              post_id: {evidence.postId || 'missing'}
            </div>
          </div>
        </article>
      )}
      {!evidence.ready && (
        <div style={{ color: '#ffd54f', fontSize: '12px', lineHeight: 1.45 }}>
          Next action: finish the Page draft in Draft Review. Return here after the Page post has a posted URL and post ID.
        </div>
      )}
    </section>
  )
}

function DistributionGateReview({ run }) {
  const composeResult = stepResult(run, 'compose_distribution_plan')
  const targetCount = Number(composeResult?.target_count || 0)
  const targets = Array.isArray(composeResult?.target_groups) ? composeResult.target_groups : []
  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '12px', display: 'grid', gap: '10px' }}>
      <div>
        <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Distribution plan evidence required</div>
        <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>
          {composeResult?.plan_id ? `Plan ${composeResult.plan_id}` : 'No composed distribution plan on this run'}
        </div>
      </div>
      <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
        Approving this gate only approves the target list for later attended sharing. It does not stage a browser, post, share, comment, like, or follow.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '8px' }}>
        <div style={{ border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px' }}>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase' }}>Targets</div>
          <div style={{ color: targetCount > 0 ? '#00e676' : '#ff4444', fontSize: '18px', fontWeight: 700 }}>{targetCount}</div>
        </div>
        <div style={{ border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px' }}>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase' }}>Campaign</div>
          <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>{composeResult?.campaign_id || 'missing'}</div>
        </div>
      </div>
      {!composeResult?.plan_id && (
        <div style={{ color: '#ffd54f', fontSize: '12px', lineHeight: 1.45 }}>
          Run the safe compose step after Page anchor verification. The backend will block if the anchor is missing.
        </div>
      )}
      {targets.length > 0 && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {targets.map(target => (
            <article key={`${target.group_target_id || target.group_name}-${target.target_index}`} style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '10px', display: 'grid', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>{target.group_name || 'Target group'}</div>
                <StatusPill tone={statusTone(target.status)}>{target.status || 'queued'}</StatusPill>
              </div>
              {target.group_url && <a href={target.group_url} target="_blank" rel="noopener noreferrer" style={{ color: '#00e676', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>{target.group_url}</a>}
              {target.share_note && (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#c8f7c8', background: '#021a0e', border: '1px solid #0d281a', borderRadius: '5px', padding: '9px', fontSize: '11px', lineHeight: 1.45, fontFamily: MONO_FONT }}>
                  {target.share_note}
                </pre>
              )}
              <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>
                posting_identity: {target.posting_identity || 'carlos_personal'}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function PersonalShareStageReview({ run, onRequestShareStaging, shareOutcomeActionLoading }) {
  const stage = stepResult(run, 'stage_personal_share')
  const outcomes = Array.isArray(stage?.share_outcomes) ? stage.share_outcomes : []
  const stagedCount = outcomes.filter(outcome => SHARE_STAGE_READY_STATUSES.has(outcome.status)).length
  const requestedCount = outcomes.filter(outcome => SHARE_STAGING_ACTIVE_STATUSES.has(outcome.status)).length
  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '12px', display: 'grid', gap: '10px' }}>
      <div>
        <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Browser handoff and staging status</div>
        <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>
          {outcomes.length
            ? `${outcomes.length} attended share target${outcomes.length === 1 ? '' : 's'} prepared, ${requestedCount} requested, ${stagedCount} staged in Facebook`
            : 'No browser staging artifact prepared yet'}
        </div>
      </div>
      <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
        Request staging here. The local desktop runner opens the browser-capable agent, fills the Facebook composer, and stops before Post. Carlos clicks Post only after reviewing destination, identity, and copy.
      </div>
      {outcomes.length > 0 && stagedCount === 0 && (
        <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#2a2100', color: '#ffe58a', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
          Step 9 stays blocked until the browser runner changes the share outcome to staged_for_operator_review.
        </div>
      )}
      {!outcomes.length && (
        <div style={{ border: '1px solid #ff4444', borderRadius: '6px', background: '#260707', color: '#ffb3b3', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
          This run is missing the staging result. Return to the safe staging step or ask Codex to repair this workflow run before approving Post.
        </div>
      )}
      {outcomes.map(outcome => {
        const isActiveOutcome = SHARE_STAGING_ACTIVE_STATUSES.has(outcome.status) || SHARE_STAGE_READY_STATUSES.has(outcome.status)
        return (
          <details key={outcome.share_outcome_id || outcome.target_index} open={isActiveOutcome} style={{ border: `1px solid ${isActiveOutcome ? statusTone(outcome.status) : '#1a3a2a'}`, borderRadius: '6px', padding: '10px', display: 'grid', gap: '8px' }}>
            <summary style={{ cursor: 'pointer', color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>
              <span>{outcome.group_name || 'Target group'}</span>
              <span style={{ marginLeft: '8px' }}>
                <StatusPill tone={statusTone(outcome.status)}>{outcome.status || 'prepared'}</StatusPill>
              </span>
            </summary>
            <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
          <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>share_outcome_id: {outcome.share_outcome_id}</div>
          {outcome.page_anchor_post_url && <a href={outcome.page_anchor_post_url} target="_blank" rel="noopener noreferrer" style={{ color: '#00e676', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>Page anchor: {outcome.page_anchor_post_url}</a>}
          {outcome.group_url && <a href={outcome.group_url} target="_blank" rel="noopener noreferrer" style={{ color: '#00e676', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>Group: {outcome.group_url}</a>}
          <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>posting_identity: {outcome.posting_identity || 'carlos_personal'}</div>
          {outcome.share_note && (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#c8f7c8', background: '#021a0e', border: '1px solid #0d281a', borderRadius: '5px', padding: '9px', fontSize: '11px', lineHeight: 1.45, fontFamily: MONO_FONT }}>
              {outcome.share_note}
            </pre>
          )}
          {outcome.share_outcome_id && !SHARE_STAGE_READY_STATUSES.has(outcome.status) && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => onRequestShareStaging?.(outcome.share_outcome_id)}
                disabled={!onRequestShareStaging || shareOutcomeActionLoading === outcome.share_outcome_id || SHARE_STAGING_ACTIVE_STATUSES.has(outcome.status)}
                style={buttonStyle({ filled: true, disabled: !onRequestShareStaging || shareOutcomeActionLoading === outcome.share_outcome_id || SHARE_STAGING_ACTIVE_STATUSES.has(outcome.status) })}
              >
                {SHARE_STAGING_ACTIVE_STATUSES.has(outcome.status) ? 'Staging requested' : 'Request browser staging'}
              </button>
              <span style={{ color: '#8abf8a', fontSize: '11px', lineHeight: 1.35 }}>
                The desktop runner will stage the Facebook composer and stop before Post.
              </span>
            </div>
          )}
          {Array.isArray(outcome.instructions) && outcome.instructions.length > 0 && (
            <details style={{ border: '1px solid #0d281a', borderRadius: '5px', padding: '8px' }}>
              <summary style={{ color: '#8abf8a', cursor: 'pointer', fontSize: '12px' }}>Desktop runner instructions</summary>
              <ol style={{ margin: '8px 0 0 0', paddingLeft: '18px', color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
                {outcome.instructions.map(instruction => <li key={instruction}>{instruction}</li>)}
              </ol>
            </details>
          )}
            </div>
          </details>
        )
      })}
    </section>
  )
}

function RelationshipGrowthStageReview({ run, onRequestRelationshipGrowthStaging, actionLoading }) {
  const stage = stepResult(run, 'stage_growth_browser_session') || {}
  const status = stage.staging_status || 'not_requested'
  const candidates = Array.isArray(stage.candidates) ? stage.candidates : []
  const active = RELATIONSHIP_STAGING_ACTIVE_STATUSES.has(status)
  const ready = status === RELATIONSHIP_STAGE_READY_STATUS
  const canRequest = Boolean(run?.run_id && onRequestRelationshipGrowthStaging && !active)
  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '12px', display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Relationship browser staging</div>
          <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>
            {ready
              ? `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} staged for Carlos review`
              : active
                ? 'Desktop runner requested'
                : 'No browser candidate pass staged yet'}
          </div>
        </div>
        <StatusPill tone={ready ? '#00e676' : active ? '#4da3ff' : status === 'staging_failed' ? '#ff4444' : '#ffd54f'}>
          {status}
        </StatusPill>
      </div>
      <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
        The desktop runner uses the same Codex Computer Use path as ZIP share staging, but this workflow only discovers and drafts recommendations. It must not join, follow, like, comment, share, or post.
      </div>
      {!ready && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => onRequestRelationshipGrowthStaging?.(run.run_id)}
            disabled={!canRequest || actionLoading === `relationship-stage:${run?.run_id}`}
            style={buttonStyle({ filled: true, disabled: !canRequest || actionLoading === `relationship-stage:${run?.run_id}` })}
          >
            {active ? 'Staging requested' : 'Request relationship browser pass'}
          </button>
          <span style={{ color: '#8abf8a', fontSize: '11px', lineHeight: 1.35 }}>
            The local desktop runner will inspect Facebook and return candidates for review.
          </span>
        </div>
      )}
      {stage.desktop_bridge_command && (
        <div style={{ display: 'grid', gap: '5px' }}>
          <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Desktop bridge command</div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#c8f7c8', background: '#021a0e', border: '1px solid #0d281a', borderRadius: '5px', padding: '9px', fontSize: '11px', lineHeight: 1.45, fontFamily: MONO_FONT }}>
            {stage.desktop_bridge_command}
          </pre>
        </div>
      )}
      {stage.agent_notes && (
        <div style={{ color: status === 'staging_failed' ? '#ffb3b3' : '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
          {stage.agent_notes}
        </div>
      )}
      {candidates.length > 0 && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {candidates.map((candidate, index) => (
            <article key={`${candidate.url || candidate.name || index}`} style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '10px', display: 'grid', gap: '7px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'start' }}>
                <div>
                  <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>{candidate.name || 'Candidate surface'}</div>
                  <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, marginTop: '3px' }}>{candidate.surface_type || 'surface'} | {candidate.recommended_action || 'review'}</div>
                </div>
                {candidate.risk_level && <StatusPill tone={candidate.risk_level === 'low' ? '#00e676' : '#ffd54f'}>{candidate.risk_level}</StatusPill>}
              </div>
              {candidate.url && <a href={candidate.url} target="_blank" rel="noopener noreferrer" style={{ color: '#00e676', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>{candidate.url}</a>}
              {candidate.why_relevant && <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>{candidate.why_relevant}</div>}
              {candidate.suggested_text && (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#c8f7c8', background: '#021a0e', border: '1px solid #0d281a', borderRadius: '5px', padding: '9px', fontSize: '11px', lineHeight: 1.45, fontFamily: MONO_FONT }}>
                  {candidate.suggested_text}
                </pre>
              )}
              {Array.isArray(candidate.risk_flags) && candidate.risk_flags.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {candidate.risk_flags.map(flag => <StatusPill key={flag} tone="#ffd54f">{flag}</StatusPill>)}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {ready && (
        <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', color: '#ffe58a', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
          Approving the next gate only accepts these recommendations for lower-layer review. Carlos still performs any final join, follow, like, comment, share, or post action manually.
        </div>
      )}
    </section>
  )
}

function ZipActivationRecommendation({ item, onPassZip, disabled }) {
  if (item?.workflow_type !== 'zip_price_activation') return null
  const entities = item.linked_entities || {}
  const publicPageNotes = Array.isArray(entities.public_page_notes) ? entities.public_page_notes : []
  const metricRows = [
    ['Freshness', entities.activation_priority],
    ['Anchor age', entities.anchor_age_days !== undefined && entities.anchor_age_days !== null ? `${entities.anchor_age_days} days` : null],
    ['Nearby barns', entities.nearby_count],
    ['Source types', entities.source_count],
    ['Top ZIP fidelity', entities.fidelity_score],
    ['Public page', entities.public_page_grade],
    ['Visible fresh', entities.visible_fresh_count],
    ['Visible stale', entities.visible_stale_count],
    ['Score', entities.activation_score],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '')
  return (
    <section style={{ border: '1px solid #00e676', borderRadius: '6px', background: '#04200f', padding: '12px', display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#00e676', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Recommended ZIP to activate</div>
          <div style={{ color: '#e0ffe0', fontSize: '15px', fontWeight: 700, marginTop: '5px' }}>
            {entities.zip} {entities.city ? `| ${entities.city}` : ''} {entities.county ? `| ${entities.county}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {entities.recommendation_rank && <StatusPill tone="#00e676">rank {entities.recommendation_rank}</StatusPill>}
          {entities.public_page_grade && <StatusPill tone={entities.public_page_grade === 'strong' ? '#00e676' : entities.public_page_grade === 'usable' ? '#ffd54f' : '#ff4444'}>{entities.public_page_grade} page</StatusPill>}
        </div>
      </div>
      <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
        {entities.recommendation_summary || item.research_summary}
      </div>
      {publicPageNotes.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {publicPageNotes.map(note => (
            <span key={note} style={{ border: '1px solid #1a3a2a', borderRadius: '999px', color: '#8abf8a', padding: '4px 8px', fontSize: '10px' }}>
              {note}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
        {metricRows.map(([label, value]) => (
          <div key={label} style={{ border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px', background: '#031808' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700, marginTop: '5px' }}>{String(value)}</div>
          </div>
        ))}
      </div>
      {entities.landing_url && (
        <a href={entities.landing_url} target="_blank" rel="noreferrer" style={{ color: '#00e676', fontSize: '12px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
          {entities.landing_url}
        </a>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => onPassZip?.(entities.zip)}
          disabled={disabled || !entities.zip}
          style={buttonStyle({ tone: '#ffd54f', disabled: disabled || !entities.zip })}
        >
          Pass ZIP, show next best
        </button>
      </div>
    </section>
  )
}

function RelationshipGrowthRecommendation({ item }) {
  if (item?.workflow_type !== 'relationship_growth') return null
  const entities = item.linked_entities || {}
  const knownTargets = Array.isArray(entities.known_group_targets) ? entities.known_group_targets : []
  const metricRows = [
    ['Eligible targets', entities.eligible_group_target_count],
    ['Target goal', entities.group_target_goal],
    ['Gap', entities.group_target_gap],
    ['Daily sessions', entities.daily_session_goal],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '')
  return (
    <section style={{ border: '1px solid #00e676', borderRadius: '6px', background: '#04200f', padding: '12px', display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#00e676', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Daily relationship workflow</div>
          <div style={{ color: '#e0ffe0', fontSize: '15px', fontWeight: 700, marginTop: '5px' }}>
            Expand the Facebook relationship graph before stacking more ZIP launches.
          </div>
        </div>
        <StatusPill tone="#ffd54f">Carlos final action</StatusPill>
      </div>
      <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
        The browser pass should discover cattle groups, sale barn pages, and ranch operator surfaces, then stage candidates for review. It must stop before any join, follow, like, comment, share, or post.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
        {metricRows.map(([label, value]) => (
          <div key={label} style={{ border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px', background: '#031808' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700, marginTop: '5px' }}>{String(value)}</div>
          </div>
        ))}
      </div>
      {knownTargets.length > 0 && (
        <section style={{ display: 'grid', gap: '8px' }}>
          <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>Current approved targets</div>
          {knownTargets.slice(0, 6).map(target => (
            <article key={target.group_target_id || target.group_url || target.group_name} style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '9px', display: 'grid', gap: '5px' }}>
              <div style={{ color: '#e0ffe0', fontSize: '12px', fontWeight: 700 }}>{target.group_name || 'Facebook group'}</div>
              {target.group_url && <a href={target.group_url} target="_blank" rel="noreferrer" style={{ color: '#00e676', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>{target.group_url}</a>}
              <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>{target.content_fit || 'fit_unknown'} | {target.identity_appropriateness || 'identity_unknown'}</div>
            </article>
          ))}
        </section>
      )}
    </section>
  )
}

function ActiveRunSummary({ run, activeGate, onOpen }) {
  if (!run) return null
  return (
    <section style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', padding: '12px', display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#ffd54f', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Current gate</div>
          <div style={{ color: '#fff4bd', fontSize: '15px', fontWeight: 700, marginTop: '4px' }}>{displayGateTitle(activeGate) || run.current_step_id || 'Workflow waiting'}</div>
          <div style={{ color: '#ffe9a6', fontSize: '12px', lineHeight: 1.4, marginTop: '5px' }}>{activeGate?.message || 'Open the run to inspect the next decision.'}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link to={`/workflows/${run.run_id}`} style={{ ...buttonStyle({ filled: true, tone: '#00e676' }), textDecoration: 'none' }}>
            Open cockpit
          </Link>
          <button type="button" onClick={onOpen} style={buttonStyle({ filled: true, tone: '#ffd54f' })}>
            Review gate
          </button>
        </div>
      </div>
    </section>
  )
}

function ResumeWorkflowShortcut({ run }) {
  if (!run?.runId) return null
  const stepText = run.stepNumber && run.stepCount
    ? `Step ${run.stepNumber} of ${run.stepCount}`
    : 'Step unknown'
  return (
    <section style={{ border: '1px solid #4da3ff', borderRadius: '6px', background: '#031421', padding: '12px', display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '4px' }}>
          <div style={{ color: '#4da3ff', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Resume current workflow</div>
          <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>
            ZIP Launch {run.zip || 'unknown'} | {stepText} | {run.stepTitle || run.status || 'Workflow run'}
          </div>
        </div>
        <Link to={`/workflows/${run.runId}`} style={{ ...buttonStyle({ filled: true, tone: '#4da3ff' }), textDecoration: 'none' }}>
          Resume current workflow
        </Link>
      </div>
    </section>
  )
}

export default function TodayAgendaWorkspace({
  agenda,
  agendaLoading,
  agendaRuns,
  campaigns,
  hasAdminKey,
  onComposeAgenda,
  onApproveItem,
  onLoadRun,
  onOpenDraftReview,
  onGenerateCreative,
  onRunNextStep,
  onRecordDecision,
  onRequestShareStaging,
  onRequestRelationshipGrowthStaging,
  zipLoading,
  actionLoading,
  shareOutcomeActionLoading,
}) {
  const items = useMemo(() => agenda?.items || [], [agenda])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [activationZip, setActivationZip] = useState('')
  const [passedActivationZips, setPassedActivationZips] = useState([])
  const [zipSearchNotice, setZipSearchNotice] = useState('')
  const [runModalOpen, setRunModalOpen] = useState(false)
  const [lastWorkflowShortcut] = useState(readLastWorkflowShortcut)
  const selectedItem = useMemo(() => (
    items.find(item => item.agenda_item_id === selectedItemId)
    || items.find(item => item.agenda_item_id === agenda?.primary_item_id)
    || items[0]
    || null
  ), [agenda?.primary_item_id, items, selectedItemId])
  const activeRunId = selectedItem?.active_run_id
  const activeRun = activeRunId ? agendaRuns[activeRunId] : null
  const activeGate = activeRun?.attended_gate || null
  const launchPackageCampaigns = useMemo(() => {
    const zip = String(activeRun?.linked_entities?.zip || selectedItem?.linked_entities?.zip || '').padStart(5, '0')
    if (!/^\d{5}$/.test(zip)) return []
    return (campaigns || []).filter(campaign => String(campaign?.zip || '').padStart(5, '0') === zip)
  }, [activeRun?.linked_entities?.zip, campaigns, selectedItem?.linked_entities?.zip])
  const canGo = Boolean(hasAdminKey && selectedItem && selectedItem.status !== 'completed')
  const isApproving = selectedItem && actionLoading === `approve:${selectedItem.agenda_item_id}`
  const isLoadingRun = selectedItem?.active_run_id && actionLoading === `load:${selectedItem.active_run_id}`
  const primaryActionLoading = Boolean(isApproving || isLoadingRun)
  const primaryActionLabel = primaryActionLoading
    ? activeRun ? 'Opening...' : selectedItem?.active_run_id ? 'Loading...' : 'Starting...'
    : activeRun ? 'Review gate' : selectedItem?.active_run_id ? 'Load run' : 'Go'
  const normalizedActivationZip = activationZip.trim()
  const activationZipValid = /^\d{5}$/.test(normalizedActivationZip)
  const activationLoading = actionLoading === 'compose:zip'
  const relationshipLoading = actionLoading === 'compose:relationship'
  const existingZipLaunchZips = useMemo(() => uniqueZips(
    items
      .filter(item => item.workflow_type === 'zip_price_activation' && item.status !== 'completed')
      .map(agendaItemZip),
  ), [items])
  const focusComposedWorkflow = (nextAgenda, workflowType, candidateZips = [], excludedZips = []) => {
    const item = findComposedWorkflowItem(nextAgenda, workflowType, candidateZips, excludedZips)
    if (item?.agenda_item_id) setSelectedItemId(item.agenda_item_id)
    return item
  }
  const composeNextZip = async (excludedZips = passedActivationZips, operatorNotes = 'Carlos requested the next eligible ZIP activation.') => {
    const requestedExclusions = uniqueZips([...existingZipLaunchZips, ...excludedZips])
    setZipSearchNotice('')
    const nextAgenda = await onComposeAgenda(true, {
      include_workflow_types: ['zip_price_activation'],
      zip_activation_limit: 1,
      excluded_zips: requestedExclusions,
      operator_notes: operatorNotes,
      loadingKey: 'compose:zip',
    })
    const focusedItem = focusComposedWorkflow(nextAgenda, 'zip_price_activation', [], requestedExclusions)
    if (!focusedItem) {
      setZipSearchNotice(
        requestedExclusions.length
          ? `No new eligible ZIP launch found after excluding ${requestedExclusions.join(', ')}. Type a ZIP to force a specific market or clear parked ZIP launch runs first.`
          : 'No eligible ZIP launch was returned. Type a ZIP to force a specific market.',
      )
    }
    return nextAgenda
  }
  const handlePassZip = (zip) => {
    const normalizedZip = String(zip || '').trim().padStart(5, '0')
    if (!/^\d{5}$/.test(normalizedZip)) return
    const nextPassed = Array.from(new Set([...passedActivationZips, normalizedZip]))
    setPassedActivationZips(nextPassed)
    composeNextZip(nextPassed, `Carlos passed ZIP ${normalizedZip}; show the next best eligible ZIP activation.`)
  }
  const composeRelationshipGrowth = async () => {
    const nextAgenda = await onComposeAgenda(true, {
      include_workflow_types: ['relationship_growth'],
      operator_notes: 'Carlos requested the daily relationship growth workflow.',
      loadingKey: 'compose:relationship',
    })
    focusComposedWorkflow(nextAgenda, 'relationship_growth')
    return nextAgenda
  }
  const handlePrimaryAction = async () => {
    if (!selectedItem) return
    if (activeRun) {
      setRunModalOpen(true)
      return
    }
    if (selectedItem.active_run_id) {
      const run = await onLoadRun(selectedItem.active_run_id)
      if (run) setRunModalOpen(true)
      return
    }
    const run = await onApproveItem(selectedItem)
    if (run) setRunModalOpen(true)
  }

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '16px', display: 'grid', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px', alignItems: 'start' }}>
          <div>
            <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Today marketing agenda</div>
            <h2 style={{ color: '#e0ffe0', margin: '6px 0 8px 0', fontSize: '22px', letterSpacing: 0 }}>
              {agenda?.summary?.executive_message || 'Choose one workflow and let the system prepare the chain.'}
            </h2>
            <p style={{ color: '#8abf8a', margin: 0, fontSize: '13px', lineHeight: 1.45, maxWidth: '920px' }}>
              Research-informed workflow recommendations stay at the executive layer: approve go/no-go here, then drill into assets only when you want lower-layer control.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onComposeAgenda(false)} disabled={!hasAdminKey || agendaLoading || actionLoading === 'compose'} style={buttonStyle({ disabled: !hasAdminKey || agendaLoading || actionLoading === 'compose' })}>
              {agendaLoading ? 'Loading...' : 'Load agenda'}
            </button>
            <button type="button" onClick={() => onComposeAgenda(true)} disabled={!hasAdminKey || actionLoading === 'compose'} style={buttonStyle({ filled: true, disabled: !hasAdminKey || actionLoading === 'compose' })}>
              Compose fresh
            </button>
          </div>
        </div>

        <ResumeWorkflowShortcut run={lastWorkflowShortcut} />

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '10px' }}>
          <button
            type="button"
            onClick={composeRelationshipGrowth}
            disabled={!hasAdminKey || relationshipLoading}
            style={{ ...buttonStyle({ filled: true, disabled: !hasAdminKey || relationshipLoading }), minHeight: '74px', textAlign: 'left', display: 'grid', alignContent: 'center', gap: '5px' }}
          >
            <span>{relationshipLoading ? 'Composing...' : 'Start relationship growth'}</span>
            <span style={{ color: !hasAdminKey || relationshipLoading ? '#021a0e' : '#063512', fontSize: '11px', lineHeight: 1.35, textTransform: 'none', letterSpacing: 0 }}>
              Find more cattle groups, pages, and safe interaction candidates.
            </span>
          </button>
          <button
            type="button"
            onClick={() => composeNextZip()}
            disabled={!hasAdminKey || activationLoading}
            style={{ ...buttonStyle({ disabled: !hasAdminKey || activationLoading }), minHeight: '74px', textAlign: 'left', display: 'grid', alignContent: 'center', gap: '5px' }}
          >
            <span>{activationLoading ? 'Finding...' : 'Find next ZIP launch'}</span>
            <span style={{ color: '#8abf8a', fontSize: '11px', lineHeight: 1.35, textTransform: 'none', letterSpacing: 0 }}>
              Pick the next market with strong public price evidence.
            </span>
          </button>
        </section>

        <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#021a0e', padding: '12px', display: 'grid', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: '10px', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: '6px' }}>
              <span style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Activate ZIP</span>
              <input
                value={activationZip}
                onChange={event => setActivationZip(event.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="74105"
                inputMode="numeric"
                style={{ width: '100%', boxSizing: 'border-box', background: '#031808', color: '#e0ffe0', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '10px', fontSize: '13px', fontFamily: MONO_FONT }}
              />
            </label>
            <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.4 }}>
              Compose a ZIP price-intelligence launch workflow. Go verifies the live price page and generates the launch package, then stops for Carlos before Page approval or personal-account sharing.
            </div>
            <button
              type="button"
              onClick={async () => {
                const nextAgenda = await onComposeAgenda(true, {
                  include_workflow_types: ['zip_price_activation'],
                  candidate_zips: [normalizedActivationZip],
                  zip_activation_limit: 1,
                  operator_notes: `Carlos requested ZIP activation for ${normalizedActivationZip}.`,
                  loadingKey: 'compose:zip',
                })
                setZipSearchNotice('')
                focusComposedWorkflow(nextAgenda, 'zip_price_activation', [normalizedActivationZip])
              }}
              disabled={!hasAdminKey || !activationZipValid || activationLoading}
              style={buttonStyle({ filled: true, disabled: !hasAdminKey || !activationZipValid || activationLoading })}
            >
              {activationLoading ? 'Composing...' : 'Compose ZIP workflow'}
            </button>
            <button
              type="button"
              onClick={() => composeNextZip()}
              disabled={!hasAdminKey || activationLoading}
              style={buttonStyle({ disabled: !hasAdminKey || activationLoading })}
            >
              Find next ZIP
            </button>
          </div>
          {passedActivationZips.length > 0 && (
            <div style={{ color: '#8abf8a', fontSize: '11px' }}>
              Passed this session: {passedActivationZips.join(', ')}
            </div>
          )}
          {zipSearchNotice && (
            <div style={{ border: '1px solid #ffd54f', borderRadius: '5px', color: '#ffd54f', background: '#1f1a05', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
              {zipSearchNotice}
            </div>
          )}
          {activationZip && !activationZipValid && (
            <div style={{ color: '#ffd54f', fontSize: '11px' }}>Enter a 5 digit ZIP before composing this workflow.</div>
          )}
        </section>

        {!hasAdminKey && (
          <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', color: '#ffd54f', padding: '10px', fontSize: '12px' }}>
            Agenda actions require the admin key in the Vercel preview environment.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
          <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Items</div>
            <div style={{ color: '#00e676', fontSize: '26px', fontWeight: 700 }}>{items.length}</div>
          </div>
          <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Learning</div>
            <div style={{ color: '#8abf8a', fontSize: '13px', fontWeight: 700, marginTop: '10px' }}>{agenda?.research_summary?.learning_status || 'not loaded'}</div>
          </div>
          <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Primary</div>
            <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700, marginTop: '10px' }}>{selectedItem ? (WORKFLOW_LABELS[selectedItem.workflow_type] || selectedItem.workflow_type) : 'none'}</div>
          </div>
        </div>
      </section>

      {items.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) minmax(0, 1fr)', gap: '14px', alignItems: 'start' }}>
          <aside style={{ display: 'grid', gap: '10px' }}>
            {items.map(item => (
              <AgendaItemCard
                key={item.agenda_item_id}
                item={item}
                active={selectedItem?.agenda_item_id === item.agenda_item_id}
                onSelect={setSelectedItemId}
              />
            ))}
          </aside>

          <main style={{ display: 'grid', gap: '14px' }}>
            {selectedItem && (
              <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '16px', display: 'grid', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Executive go/no-go</div>
                    <h3 style={{ color: '#e0ffe0', margin: '6px 0 8px 0', fontSize: '20px', letterSpacing: 0 }}>{selectedItem.workflow_title}</h3>
                    <p style={{ color: '#8abf8a', margin: 0, fontSize: '13px', lineHeight: 1.45 }}>{selectedItem.why_today}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {selectedItem.active_run_id && (
                      <Link to={`/workflows/${selectedItem.active_run_id}`} style={{ ...buttonStyle({ tone: '#00e676' }), textDecoration: 'none' }}>
                        Open cockpit
                      </Link>
                    )}
                    {selectedItem.active_run_id && !activeRun && (
                      <button type="button" onClick={() => onLoadRun(selectedItem.active_run_id)} disabled={actionLoading === `load:${selectedItem.active_run_id}`} style={buttonStyle({ disabled: actionLoading === `load:${selectedItem.active_run_id}` })}>
                        Load run
                      </button>
                    )}
                    <button type="button" onClick={handlePrimaryAction} disabled={!canGo || primaryActionLoading} style={buttonStyle({ filled: true, disabled: !canGo || primaryActionLoading })}>
                      {primaryActionLabel}
                    </button>
                  </div>
                </div>

                <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
                  {selectedItem.research_summary}
                </div>

                <ZipActivationRecommendation item={selectedItem} onPassZip={handlePassZip} disabled={!hasAdminKey || activationLoading} />
                <RelationshipGrowthRecommendation item={selectedItem} />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '10px' }}>
                  <ReadinessList title="Readiness checks" checks={selectedItem.readiness_checks} />
                  <ReadinessList title="Facebook safety checks" checks={selectedItem.facebook_safety_checks} />
                </div>

                <details open={!activeRun} style={{ display: 'grid', gap: '10px' }}>
                  <summary style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Execution chain</summary>
                  <WorkflowStepList steps={activeRun?.steps || selectedItem.expected_steps} currentStepId={activeRun?.current_step_id} />
                </details>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '10px' }}>
                  <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px', display: 'grid', gap: '6px' }}>
                    <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>Lower-layer links</div>
                    {formatEntityList(selectedItem.linked_entities).map(([key, value]) => (
                      <div key={key} style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>{key}: {String(value)}</div>
                    ))}
                  </section>
                  <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px', display: 'grid', gap: '6px' }}>
                    <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>Required approvals</div>
                    {(selectedItem.required_approvals || []).map(text => (
                      <div key={text} style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.35 }}>{text}</div>
                    ))}
                  </section>
                </div>

                {activeRun && (
                  <ActiveRunSummary run={activeRun} activeGate={activeGate} onOpen={() => setRunModalOpen(true)} />
                )}
              </section>
            )}
          </main>
        </div>
      ) : (
        <EmptyState message={agendaLoading ? 'Loading agenda...' : 'No agenda items yet. Compose today to pull research and readiness signals.'} />
      )}
      {activeRun && runModalOpen && (
        <Modal title={`Review workflow gate: ${activeRun.workflow_title}`} onClose={() => setRunModalOpen(false)}>
          <RunControls
            run={activeRun}
            activeGate={activeGate}
            launchPackageCampaigns={launchPackageCampaigns}
            zipLoading={zipLoading}
            onGenerateCreative={onGenerateCreative}
            onOpenDraftReview={onOpenDraftReview}
            onRunNextStep={onRunNextStep}
            onRecordDecision={onRecordDecision}
            onRequestShareStaging={onRequestShareStaging}
            onRequestRelationshipGrowthStaging={onRequestRelationshipGrowthStaging}
            actionLoading={actionLoading}
            shareOutcomeActionLoading={shareOutcomeActionLoading}
          />
          <details style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '12px' }}>
            <summary style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Technical execution context</summary>
            <div style={{ marginTop: '10px' }}>
              <WorkflowStepList steps={activeRun.steps} currentStepId={activeRun.current_step_id} />
            </div>
          </details>
        </Modal>
      )}
    </div>
  )
}
