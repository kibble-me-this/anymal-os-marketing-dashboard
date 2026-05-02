import { useMemo, useState } from 'react'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

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

function EmptyState({ message }) {
  return (
    <div style={{ border: '1px dashed #1a3a2a', borderRadius: '6px', padding: '28px', textAlign: 'center', color: '#4a7a5a', background: '#031808', fontSize: '12px' }}>
      {message}
    </div>
  )
}

function statusTone(status) {
  if (status === 'completed') return '#00e676'
  if (status === 'blocked' || status === 'changes_requested') return '#ff4444'
  if (status === 'waiting_for_carlos' || status === 'needs_carlos') return '#ffd54f'
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
      <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>{item.workflow_type}</div>
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

function stepResult(run, stepId) {
  return (run?.steps || []).find(step => step.step_id === stepId)?.result || null
}

function gateEvidenceState(run, activeGate, campaigns) {
  const zip = run?.linked_entities?.zip
  const gateId = activeGate?.step_id
  if (gateId === 'review_launch_package') {
    const rows = rowsForZip(campaigns, zip)
    return {
      blocked: rows.length === 0,
      message: rows.length === 0 ? 'Generated draft assets are not loaded yet. Refresh before approving the package.' : '',
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
  actionLoading,
}) {
  const [notes, setNotes] = useState('')
  const stepId = activeGate?.step_id || run?.current_step_id || ''
  const isLoading = actionLoading === `run:${run?.run_id}` || actionLoading === `decision:${run?.run_id}`
  const gateEvidence = gateEvidenceState(run, activeGate, launchPackageCampaigns)
  const positiveDecisionDisabled = isLoading || !stepId || gateEvidence.blocked

  if (!run) return null

  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#021a0e', padding: '14px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Active workflow run</div>
          <h3 style={{ color: '#e0ffe0', fontSize: '16px', margin: '5px 0 0 0', letterSpacing: 0 }}>{run.workflow_title}</h3>
          <div style={{ color: '#8abf8a', fontSize: '11px', marginTop: '5px', fontFamily: MONO_FONT }}>{run.run_id}</div>
        </div>
        <StatusPill tone={statusTone(run.status)}>{run.status}</StatusPill>
      </div>

      {activeGate && (
        <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', padding: '12px', color: '#ffd54f', display: 'grid', gap: '6px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>{activeGate.title}</div>
          <div style={{ color: '#ffe9a6', fontSize: '12px', lineHeight: 1.4 }}>{activeGate.message}</div>
        </div>
      )}

      {activeGate?.step_id === 'review_launch_package' && (
        <LaunchPackageReview campaigns={launchPackageCampaigns} zip={run?.linked_entities?.zip} />
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

      {gateEvidence.blocked && (
        <div style={{ border: '1px solid #ff4444', borderRadius: '6px', background: '#260707', color: '#ffb3b3', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
          {gateEvidence.message}
        </div>
      )}

      <textarea
        value={notes}
        onChange={event => setNotes(event.target.value)}
        placeholder="Operator notes or blocking reason"
        style={{ width: '100%', minHeight: '64px', boxSizing: 'border-box', background: '#031808', color: '#e0ffe0', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px', fontSize: '12px', fontFamily: MONO_FONT }}
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
    </section>
  )
}

function LaunchPackageReview({ campaigns = [], zip }) {
  const rows = rowsForZip(campaigns, zip)
  const pageDraft = rows.find(campaign => campaign.channel === 'facebook_page')
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
        Approving this package only confirms the generated draft set is ready for lower-layer review. It does not publish the Page post, approve distribution targets, or perform any personal-account action.
      </div>
      {!rows.length && (
        <div style={{ color: '#ffd54f', fontSize: '12px', lineHeight: 1.45 }}>
          The backend generated the package, but the dashboard has not loaded the draft records yet. Refresh the dashboard before approving.
        </div>
      )}
      {rows.map(campaign => {
        const copy = campaign.message || campaign.generated_copy || ''
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
  const creativeReady = pageCampaign?.creative_status === 'creative_current' || Boolean(pageCampaign?.creative_metadata?.image_url || pageCampaign?.creative_asset_id)
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
  zipLoading,
  actionLoading,
}) {
  const items = useMemo(() => agenda?.items || [], [agenda])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [activationZip, setActivationZip] = useState('')
  const [passedActivationZips, setPassedActivationZips] = useState([])
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
  const normalizedActivationZip = activationZip.trim()
  const activationZipValid = /^\d{5}$/.test(normalizedActivationZip)
  const activationLoading = actionLoading === 'compose:zip'
  const composeNextZip = (excludedZips = passedActivationZips, operatorNotes = 'Carlos requested the next eligible ZIP activation.') => onComposeAgenda(true, {
    include_workflow_types: ['zip_price_activation'],
    zip_activation_limit: 1,
    excluded_zips: excludedZips,
    operator_notes: operatorNotes,
    loadingKey: 'compose:zip',
  })
  const handlePassZip = (zip) => {
    const normalizedZip = String(zip || '').trim().padStart(5, '0')
    if (!/^\d{5}$/.test(normalizedZip)) return
    const nextPassed = Array.from(new Set([...passedActivationZips, normalizedZip]))
    setPassedActivationZips(nextPassed)
    composeNextZip(nextPassed, `Carlos passed ZIP ${normalizedZip}; show the next best eligible ZIP activation.`)
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
              onClick={() => onComposeAgenda(true, {
                include_workflow_types: ['zip_price_activation'],
                candidate_zips: [normalizedActivationZip],
                zip_activation_limit: 1,
                operator_notes: `Carlos requested ZIP activation for ${normalizedActivationZip}.`,
                loadingKey: 'compose:zip',
              })}
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
            <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700, marginTop: '10px' }}>{selectedItem?.workflow_type || 'none'}</div>
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
                    {selectedItem.active_run_id && !activeRun && (
                      <button type="button" onClick={() => onLoadRun(selectedItem.active_run_id)} disabled={actionLoading === `load:${selectedItem.active_run_id}`} style={buttonStyle({ disabled: actionLoading === `load:${selectedItem.active_run_id}` })}>
                        Load run
                      </button>
                    )}
                    <button type="button" onClick={() => onApproveItem(selectedItem)} disabled={!canGo || isApproving} style={buttonStyle({ filled: true, disabled: !canGo || isApproving })}>
                      {isApproving ? 'Starting...' : 'Go'}
                    </button>
                  </div>
                </div>

                <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
                  {selectedItem.research_summary}
                </div>

                <ZipActivationRecommendation item={selectedItem} onPassZip={handlePassZip} disabled={!hasAdminKey || activationLoading} />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '10px' }}>
                  <ReadinessList title="Readiness checks" checks={selectedItem.readiness_checks} />
                  <ReadinessList title="Facebook safety checks" checks={selectedItem.facebook_safety_checks} />
                </div>

                <section style={{ display: 'grid', gap: '10px' }}>
                  <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700 }}>Execution chain</div>
                  <WorkflowStepList steps={activeRun?.steps || selectedItem.expected_steps} currentStepId={activeRun?.current_step_id} />
                </section>

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
              </section>
            )}

            {activeRun && (
              <RunControls
                run={activeRun}
                activeGate={activeGate}
                launchPackageCampaigns={launchPackageCampaigns}
                zipLoading={zipLoading}
                onGenerateCreative={onGenerateCreative}
                onOpenDraftReview={onOpenDraftReview}
                onRunNextStep={onRunNextStep}
                onRecordDecision={onRecordDecision}
                actionLoading={actionLoading}
              />
            )}
          </main>
        </div>
      ) : (
        <EmptyState message={agendaLoading ? 'Loading agenda...' : 'No agenda items yet. Compose today to pull research and readiness signals.'} />
      )}
    </div>
  )
}
