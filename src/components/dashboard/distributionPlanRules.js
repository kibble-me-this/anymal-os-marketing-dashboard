const SAFE_IDENTITIES = new Set([
  'carlos_personal_preferred',
  'page_allowed',
  'either_ok',
  'personal_only',
])

const RELEVANT_CONTENT_FITS = new Set([
  'cattle_prices_relevant',
  'livestock_market_relevant',
  'general_local_relevant',
  'cattle_sales_only',
])

export const TARGET_STATUS_LABELS = {
  queued: 'Queued',
  approved_for_attended_share: 'Approved',
  rejected_by_operator: 'Rejected',
  needs_operator_review: 'Needs review',
}

export function targetStatus(target) {
  return target.status || target.operator_review_status || 'queued'
}

export function preconditionFailures(plan, target) {
  const failures = []
  const identity = target.identity_appropriateness
  const contentFit = target.content_fit

  if (!SAFE_IDENTITIES.has(identity)) failures.push('Identity needs approval')
  if (!RELEVANT_CONTENT_FITS.has(contentFit)) failures.push('Content fit is not ready')
  if (target.cooldown_status === 'active' || target.cooldown_clear === false) failures.push('Cooldown is active')
  if (identity === 'do_not_post' || target.blocked === true) failures.push('Target is blocked')
  if (target.risk_flags?.length) failures.push('Risk flags present')
  if (!String(target.share_note || '').trim()) failures.push('Share note missing')
  if (!String(plan.page_anchor_post_url || '').trim()) failures.push('Page anchor URL missing')
  if (!String(plan.page_anchor_post_id || '').trim()) failures.push('Page anchor ID missing')

  return failures
}

export function canApproveTarget(plan, target) {
  const reasons = preconditionFailures(plan, target)
  return {
    canApprove: reasons.length === 0,
    reasons,
  }
}

export function canBatchApprove(plan) {
  const targets = plan.target_groups || []
  const eligibleTargets = []
  const blockedTargets = []

  targets.forEach((target, index) => {
    if (targetStatus(target) === 'approved_for_attended_share') return
    const result = canApproveTarget(plan, target)
    if (result.canApprove) {
      eligibleTargets.push({ target, index })
    } else {
      blockedTargets.push({ target, index, reasons: result.reasons })
    }
  })

  return {
    canApprove: eligibleTargets.length > 0,
    eligibleTargets,
    blockedTargets,
    targetIndices: eligibleTargets.map(item => item.index),
  }
}

export function planAttention(plan) {
  const targets = plan.target_groups || []
  const approved = targets.filter(target => targetStatus(target) === 'approved_for_attended_share').length
  const rejected = targets.filter(target => targetStatus(target) === 'rejected_by_operator').length
  const review = targets.filter(target => (
    targetStatus(target) === 'needs_operator_review'
    || target.operator_review_status === 'needs_operator_review'
    || target.risk_flags?.length
  )).length
  const queued = Math.max(0, targets.length - approved - rejected)
  return { approved, rejected, review, queued }
}
