import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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

function defaultProps(overrides = {}) {
  return {
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
}

function renderWorkspace(overrides = {}) {
  const props = defaultProps(overrides)

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

  it('selects the ZIP launch returned by Find next ZIP instead of leaving the prior workflow selected', async () => {
    const user = userEvent.setup()
    const nativeVideoItem = {
      ...agendaItem,
      agenda_item_id: 'agenda_native_video',
      workflow_title: 'Review native video for 74501',
      workflow_type: 'native_video_review',
      active_run_id: '',
      linked_entities: { zip: '74501' },
      expected_steps: [],
    }
    const zipItem = {
      ...agendaItem,
      agenda_item_id: 'agenda_zip_73801',
      active_run_id: '',
      linked_entities: { zip: '73801' },
    }
    const initialAgenda = {
      items: [nativeVideoItem],
      primary_item_id: nativeVideoItem.agenda_item_id,
      summary: { executive_message: 'Approve one workflow' },
      research_summary: { learning_status: 'fresh' },
    }
    const nextAgenda = {
      ...initialAgenda,
      items: [nativeVideoItem, zipItem],
      primary_item_id: nativeVideoItem.agenda_item_id,
    }
    const composeMock = vi.fn()

    function Harness() {
      const [agendaState, setAgendaState] = useState(initialAgenda)
      return (
        <MemoryRouter>
          <TodayAgendaWorkspace
            {...defaultProps({
              agenda: agendaState,
              agendaRuns: {},
              campaigns: [],
              onComposeAgenda: async (...args) => {
                composeMock(...args)
                setAgendaState(nextAgenda)
                return nextAgenda
              },
            })}
          />
        </MemoryRouter>
      )
    }

    render(<Harness />)

    expect(screen.getByRole('heading', { name: 'Review native video for 74501' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Find next ZIP launch/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Announce 73801 price intelligence is live' })).toBeInTheDocument()
    })
    expect(composeMock).toHaveBeenCalledWith(true, expect.objectContaining({
      include_workflow_types: ['zip_price_activation'],
      zip_activation_limit: 1,
      loadingKey: 'compose:zip',
    }))
  })

  it('skips passed ZIP launches when focusing the next composed ZIP', async () => {
    const user = userEvent.setup()
    const passedZipItem = {
      ...agendaItem,
      agenda_item_id: 'agenda_zip_67501',
      workflow_title: 'Announce 67501 price intelligence is live',
      active_run_id: '',
      linked_entities: { zip: '67501' },
    }
    const nextZipItem = {
      ...agendaItem,
      agenda_item_id: 'agenda_zip_73801',
      active_run_id: '',
      linked_entities: { zip: '73801' },
    }
    const agenda = {
      items: [passedZipItem, nextZipItem],
      primary_item_id: passedZipItem.agenda_item_id,
      summary: { executive_message: 'Approve one workflow' },
      research_summary: { learning_status: 'fresh' },
    }
    const composeMock = vi.fn()

    function Harness() {
      const [agendaState, setAgendaState] = useState(agenda)
      return (
        <MemoryRouter>
          <TodayAgendaWorkspace
            {...defaultProps({
              agenda: agendaState,
              agendaRuns: {},
              campaigns: [],
              onComposeAgenda: async (...args) => {
                composeMock(...args)
                setAgendaState(agenda)
                return agenda
              },
            })}
          />
        </MemoryRouter>
      )
    }

    render(<Harness />)

    expect(screen.getByRole('heading', { name: 'Announce 67501 price intelligence is live' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pass ZIP, show next best' }))
    await user.click(screen.getByRole('button', { name: /Find next ZIP launch/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Announce 73801 price intelligence is live' })).toBeInTheDocument()
    })
    expect(composeMock).toHaveBeenLastCalledWith(true, expect.objectContaining({
      excluded_zips: ['67501'],
      include_workflow_types: ['zip_price_activation'],
    }))
  })
})
