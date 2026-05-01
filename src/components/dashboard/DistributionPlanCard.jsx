import { useMemo, useState } from 'react'
import DistributionTargetCard from './DistributionTargetCard'
import { canBatchApprove, planAttention, targetStatus } from './distributionPlanRules'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'review', label: 'Needs review' },
  { id: 'risk', label: 'Risk flags' },
]

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

function statPill(label, value, tone = '#00e676') {
  return (
    <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', border: `1px solid ${tone}`, color: tone, background: '#0a2a1a', borderRadius: '999px', padding: '4px 9px', fontSize: '10px', fontFamily: SANS_FONT }}>
      <strong>{value}</strong>
      {label}
    </span>
  )
}

function targetMatchesFilter(target, filter) {
  const status = targetStatus(target)
  if (filter === 'approved') return status === 'approved_for_attended_share'
  if (filter === 'rejected') return status === 'rejected_by_operator'
  if (filter === 'review') return status === 'needs_operator_review' || target.operator_review_status === 'needs_operator_review'
  if (filter === 'risk') return Boolean(target.risk_flags?.length)
  return true
}

export default function DistributionPlanCard({
  plan,
  onUpdateTarget,
  onBatchApprove,
  onMarkDoNotPost,
  actionLoading,
}) {
  const [filter, setFilter] = useState('all')
  const [showBatchConfirm, setShowBatchConfirm] = useState(false)
  const attention = planAttention(plan)
  const batch = useMemo(() => canBatchApprove(plan), [plan])
  const visibleTargets = (plan.target_groups || [])
    .map((target, index) => ({ target, index }))
    .filter(item => targetMatchesFilter(item.target, filter))

  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '16px', display: 'grid', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4a7a5a', marginBottom: '5px', fontFamily: SANS_FONT }}>
            {plan.zip} | {plan.city || 'Local'} | {plan.county || 'County'}
          </div>
          <h3 style={{ margin: 0, color: '#e0ffe0', fontSize: '17px', letterSpacing: 0 }}>Distribution plan</h3>
          <a href={plan.page_anchor_post_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '7px', color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
            {plan.page_anchor_post_url}
          </a>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {statPill('approved', attention.approved)}
          {statPill('queued', attention.queued, '#4da3ff')}
          {statPill('review', attention.review, attention.review ? '#ffd54f' : '#00e676')}
          {statPill('rejected', attention.rejected, attention.rejected ? '#ff4444' : '#8abf8a')}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {FILTERS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              style={buttonStyle({ filled: filter === item.id, tone: filter === item.id ? '#00e676' : '#4a7a5a' })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" disabled={!batch.canApprove} onClick={() => setShowBatchConfirm(true)} style={buttonStyle({ filled: batch.canApprove, disabled: !batch.canApprove })}>
          Batch approve safe targets
        </button>
      </div>

      {showBatchConfirm && (
        <div style={{ border: '1px solid #00e676', borderRadius: '6px', background: '#021a0e', padding: '14px', display: 'grid', gap: '10px' }}>
          <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700 }}>
            {batch.eligibleTargets.length} eligible, {batch.blockedTargets.length} need review
          </div>
          {batch.blockedTargets.length > 0 && (
            <div style={{ display: 'grid', gap: '6px', color: '#8abf8a', fontSize: '11px' }}>
              {batch.blockedTargets.slice(0, 5).map(item => (
                <div key={`${item.index}:${item.target.group_target_id}`} style={{ fontFamily: MONO_FONT }}>
                  {item.target.group_name}: {item.reasons.join(', ')}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" disabled={!batch.canApprove} onClick={async () => { await onBatchApprove(plan.plan_id, batch.targetIndices); setShowBatchConfirm(false) }} style={buttonStyle({ filled: true, disabled: !batch.canApprove })}>Confirm batch</button>
            <button type="button" onClick={() => setShowBatchConfirm(false)} style={buttonStyle()}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: '10px' }}>
        {visibleTargets.map(({ target, index }) => (
          <DistributionTargetCard
            key={`${plan.plan_id}:${target.group_target_id || index}`}
            plan={plan}
            target={target}
            index={index}
            onUpdateTarget={onUpdateTarget}
            onMarkDoNotPost={onMarkDoNotPost}
            actionLoading={actionLoading}
          />
        ))}
        {visibleTargets.length === 0 && (
          <div style={{ border: '1px dashed #1a3a2a', borderRadius: '6px', padding: '20px', color: '#4a7a5a', fontSize: '12px', textAlign: 'center' }}>
            No targets match this filter.
          </div>
        )}
      </div>
    </section>
  )
}
