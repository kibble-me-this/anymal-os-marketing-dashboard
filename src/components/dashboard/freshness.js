export function campaignFreshnessGate(campaign = {}) {
  const gate = campaign.freshness_gate || campaign.price_freshness || campaign.campaign_freshness || null
  return gate && typeof gate === 'object' ? gate : null
}

export function freshnessTone(gate) {
  const label = String(gate?.label || gate?.decision || '').toLowerCase()
  if (label === 'fresh' || label === 'pass') return '#00e676'
  if (label === 'mixed' || label === 'warn') return '#ffd54f'
  if (label === 'stale' || label === 'reject') return '#ff4444'
  return '#4a7a5a'
}

export function freshnessLabel(gate) {
  const label = String(gate?.label || gate?.decision || '').toLowerCase()
  if (label === 'fresh' || label === 'pass') return 'Fresh'
  if (label === 'mixed' || label === 'warn') return 'Mixed'
  if (label === 'stale' || label === 'reject') return 'Stale'
  return 'Freshness Unknown'
}

export function freshnessTooltip(gate) {
  if (!gate) return 'No nearby-barn freshness score is attached to this campaign.'
  const fresh = Number(gate.fresh_count || 0)
  const total = Number(gate.total_count || 0)
  const parts = [`${fresh} of ${total} nearby barns have current data.`]
  if (gate.freshest_age_hours !== null && gate.freshest_age_hours !== undefined) {
    parts.push(`Freshest: ${gate.freshest_age_hours} hours ago.`)
  }
  if (gate.stalest_age_days !== null && gate.stalest_age_days !== undefined) {
    parts.push(`Stalest: ${gate.stalest_age_days} days ago.`)
  }
  return parts.join(' ')
}

export function requiresFreshnessAcknowledgment(campaign = {}) {
  const override = campaign.freshness_override || {}
  if (override.stale_acknowledged === true || campaign.stale_acknowledged === true) return false
  return Boolean(campaign.freshness_warning || campaign.stale_acknowledgment_required)
}
