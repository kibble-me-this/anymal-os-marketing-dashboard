import { useMemo, useState } from 'react'
import DistributionPlanCard from './DistributionPlanCard'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

function postedUrlForCampaign(campaign) {
  return campaign?.posted_url || campaign?.facebook_post_url || campaign?.post_url || ''
}

function buttonStyle({ tone = '#00e676', filled = false, disabled = false } = {}) {
  return {
    padding: '8px 12px',
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

function EmptyState({ message }) {
  return (
    <div style={{ border: '1px dashed #1a3a2a', borderRadius: '6px', padding: '28px', textAlign: 'center', color: '#4a7a5a', background: '#031808', fontSize: '12px' }}>
      {message}
    </div>
  )
}

function AnchorQueueCard({ campaign, plan, onComposePlan, disabled, loading }) {
  const anchorUrl = postedUrlForCampaign(campaign)
  return (
    <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '14px', display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700 }}>{campaign.campaign_id}</div>
          <div style={{ color: '#8abf8a', fontSize: '11px', marginTop: '5px' }}>
            {campaign.zip || 'ZIP'} | {campaign.city || 'Local'} | {campaign.county || 'County'}
          </div>
        </div>
        <span style={{ border: `1px solid ${plan ? '#00e676' : '#4da3ff'}`, color: plan ? '#00e676' : '#4da3ff', borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontFamily: SANS_FONT }}>
          {plan ? plan.plan_status || 'plan ready' : 'no plan'}
        </span>
      </div>
      {anchorUrl && (
        <a href={anchorUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
          {anchorUrl}
        </a>
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={disabled || loading} onClick={() => onComposePlan(campaign)} style={buttonStyle({ filled: !plan, disabled: disabled || loading })}>
          {plan ? 'Compose new plan' : 'Compose plan'}
        </button>
        {plan && (
          <span style={{ color: '#4a7a5a', fontSize: '11px' }}>
            {plan.target_count || 0} targets | {plan.pending_approval_count || 0} pending
          </span>
        )}
      </div>
    </div>
  )
}

export default function DistributionWorkspace({
  pageAnchors,
  distributionPlans,
  distributionLoading,
  hasAdminKey,
  onComposePlan,
  onUpdateTarget,
  onBatchApprove,
  onMarkDoNotPost,
  actionLoading,
}) {
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const plansByCampaign = useMemo(() => {
    const map = new Map()
    distributionPlans.forEach(plan => {
      if (!map.has(plan.campaign_id)) map.set(plan.campaign_id, plan)
    })
    return map
  }, [distributionPlans])

  const selectedPlan = useMemo(() => {
    if (selectedCampaignId) return plansByCampaign.get(selectedCampaignId) || null
    return distributionPlans[0] || null
  }, [distributionPlans, plansByCampaign, selectedCampaignId])

  const sortedAnchors = useMemo(() => (
    [...pageAnchors].sort((a, b) => String(b.posted_at || b.created_at || '').localeCompare(String(a.posted_at || a.created_at || '')))
  ), [pageAnchors])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) minmax(0, 1fr)', gap: '14px', alignItems: 'start' }}>
      <aside style={{ display: 'grid', gap: '10px' }}>
        <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '14px' }}>
          <div style={{ color: '#e0ffe0', fontSize: '15px', fontWeight: 700, marginBottom: '5px' }}>Page anchor queue</div>
          <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.4 }}>
            {distributionLoading ? 'Refreshing distribution plans...' : `${distributionPlans.length} plans across ${pageAnchors.length} anchors`}
          </div>
        </div>
        {sortedAnchors.map(campaign => {
          const plan = plansByCampaign.get(campaign.campaign_id)
          return (
            <div
              key={campaign.campaign_id}
              onClick={() => setSelectedCampaignId(campaign.campaign_id)}
              style={{ cursor: 'pointer' }}
            >
              <AnchorQueueCard
                campaign={campaign}
                plan={plan}
                onComposePlan={onComposePlan}
                disabled={!hasAdminKey}
                loading={actionLoading === `compose:${campaign.campaign_id}`}
              />
            </div>
          )
        })}
        {sortedAnchors.length === 0 && <EmptyState message="No published Page anchors available." />}
      </aside>

      <main style={{ display: 'grid', gap: '14px' }}>
        {!hasAdminKey && (
          <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', color: '#ffd54f', padding: '12px', fontSize: '12px' }}>
            Distribution actions require the admin key in the Vercel preview environment.
          </div>
        )}
        {selectedPlan ? (
          <DistributionPlanCard
            plan={selectedPlan}
            onUpdateTarget={onUpdateTarget}
            onBatchApprove={onBatchApprove}
            onMarkDoNotPost={onMarkDoNotPost}
            actionLoading={actionLoading}
          />
        ) : distributionPlans.length > 0 ? (
          <DistributionPlanCard
            plan={distributionPlans[0]}
            onUpdateTarget={onUpdateTarget}
            onBatchApprove={onBatchApprove}
            onMarkDoNotPost={onMarkDoNotPost}
            actionLoading={actionLoading}
          />
        ) : (
          <EmptyState message="No distribution plans yet." />
        )}
      </main>
    </div>
  )
}
