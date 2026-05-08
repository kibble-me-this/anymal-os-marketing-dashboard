import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import TodayAgendaWorkspace from './TodayAgendaWorkspace'

const run = {
  run_id: 'workflowrun_73801',
  workflow_title: 'Announce 73801 price intelligence is live',
  workflow_type: 'zip_price_activation',
  status: 'waiting_for_carlos',
  current_step_id: 'review_launch_package',
  linked_entities: { zip: '73801' },
  attended_gate: {
    step_id: 'review_launch_package',
    title: 'Carlos reviews launch package',
    message: 'Carlos review is required before this workflow can continue.',
  },
  steps: [
    {
      step_id: 'verify_price_intelligence_live',
      title: 'Verify ZIP price intelligence is live',
      kind: 'backend_safe',
      status: 'completed',
    },
    {
      step_id: 'generate_launch_campaign_package',
      title: 'Generate ZIP launch campaign package',
      kind: 'backend_safe',
      status: 'completed',
    },
    {
      step_id: 'review_launch_package',
      title: 'Carlos reviews launch package',
      kind: 'carlos_final_action',
      status: 'pending',
    },
  ],
}

const agendaItem = {
  agenda_item_id: 'agenda_73801',
  workflow_title: 'Announce 73801 price intelligence is live',
  workflow_type: 'zip_price_activation',
  status: 'waiting_for_carlos',
  active_run_id: run.run_id,
  linked_entities: { zip: '73801' },
  why_today: '73801 has fresh price intelligence.',
  research_summary: 'Ready for launch package review.',
  readiness_checks: [],
  facebook_safety_checks: [],
  expected_steps: run.steps,
  required_approvals: [],
}

const pageCampaign = {
  campaign_id: 'step37_73801_facebook_page_v1',
  zip: '73801',
  channel: 'facebook_page',
  status: 'needs_creative_review',
  creative_status: 'creative_missing',
  message: 'Woodward County cattle folks, here is the 73801 price view.',
}

function renderWorkspace(overrides = {}) {
  const props = {
    agenda: {
      items: [agendaItem],
      primary_item_id: agendaItem.agenda_item_id,
      summary: { executive_message: 'Approve one workflow' },
      research_summary: { learning_status: 'fresh' },
    },
    agendaLoading: false,
    agendaRuns: { [run.run_id]: run },
    campaigns: [pageCampaign],
    hasAdminKey: true,
    onComposeAgenda: vi.fn(),
    onApproveItem: vi.fn(),
    onLoadRun: vi.fn(),
    onOpenDraftReview: vi.fn(),
    onGenerateCreative: vi.fn(),
    onRunNextStep: vi.fn(),
    onRecordDecision: vi.fn(),
    onRequestShareStaging: vi.fn(),
    onRequestRelationshipGrowthStaging: vi.fn(),
    zipLoading: {},
    actionLoading: '',
    shareOutcomeActionLoading: '',
    ...overrides,
  }

  render(
    <MemoryRouter>
      <TodayAgendaWorkspace {...props} />
    </MemoryRouter>,
  )

  return props
}

describe('TodayAgendaWorkspace launch package review', () => {
  it('blocks package approval and offers inline creative generation when Page creative is missing', async () => {
    const user = userEvent.setup()
    const props = renderWorkspace()

    await user.click(screen.getAllByRole('button', { name: 'Review gate' })[0])

    expect(screen.getByText('Facebook Page creative is missing.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve package' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Generate and attach creative' }))

    expect(props.onGenerateCreative).toHaveBeenCalledWith('73801')
  })
})
