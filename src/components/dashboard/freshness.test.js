import { expect, test } from 'vitest'

import {
  campaignFreshnessGate,
  freshnessLabel,
  freshnessTone,
  freshnessTooltip,
  requiresFreshnessAcknowledgment,
} from './freshness.js'

test('freshness badge helpers classify campaign freshness gates', () => {
  const campaign = {
    freshness_gate: {
      decision: 'warn',
      label: 'mixed',
      fresh_count: 5,
      total_count: 10,
      freshest_age_hours: 3,
      stalest_age_days: 61,
    },
    freshness_warning: true,
  }

  const gate = campaignFreshnessGate(campaign)

  expect(freshnessLabel(gate)).toBe('Mixed')
  expect(freshnessTone(gate)).toBe('#ffd54f')
  expect(freshnessTooltip(gate)).toBe(
    '5 of 10 nearby barns have current data. Freshest: 3 hours ago. Stalest: 61 days ago.',
  )
  expect(requiresFreshnessAcknowledgment(campaign)).toBe(true)
})

test('acknowledged freshness overrides re-enable approval', () => {
  expect(
    requiresFreshnessAcknowledgment({
      freshness_warning: true,
      freshness_override: { stale_acknowledged: true },
    }),
  ).toBe(false)
})
