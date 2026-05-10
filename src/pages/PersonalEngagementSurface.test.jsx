import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonalEngagementSurface from './PersonalEngagementSurface'

vi.mock('../config', () => ({
  HAS_MARKETING_ADMIN_KEY: true,
  MARKETING_API: 'https://api.test',
  adminHeaders: {
    'X-API-Key': 'legacy-key',
    'X-Admin-Key': 'admin-key',
    'Content-Type': 'application/json',
  },
}))

const baseRun = {
  run_id: 'workflowrun_personal_test',
  workflow_type: 'personal_account_engagement',
  workflow_title: 'Personal engagement like for Oklahoma Beef Cattle Group',
  status: 'waiting_for_carlos',
  current_step_id: 'carlos_approves_personal_action',
  linked_entities: {
    action_id: 'personalengagement_test_like',
    action_verb: 'like',
    identity_name: 'Carlos Herrera',
    target_name: 'Oklahoma Beef Cattle Group',
    target_type: 'facebook_group_post',
    target_url: 'https://www.facebook.com/groups/okcattle/posts/123',
    start_url: 'https://www.facebook.com/',
    profile_user_data_dir: 'Dedicated PersonalEngagement profile',
    evidence_required: [
      'action_attempted',
      'target_url',
      'observed_resulting_url',
      'observed_status',
      'screenshot_path',
      'timestamp',
      'error_if_any',
    ],
  },
  steps: [
    { step_id: 'prepare_personal_engagement_action', title: 'Prepare personal engagement action', kind: 'backend_safe', status: 'completed', result: {} },
    { step_id: 'carlos_approves_personal_action', title: 'Carlos approves personal account like', kind: 'carlos_final_action', status: 'pending', result: null },
    { step_id: 'execute_personal_action_in_chrome', title: 'Execute personal account like in Chrome', kind: 'chrome_stage_only', status: 'pending', result: null },
    { step_id: 'record_personal_engagement_outcome', title: 'Record personal engagement outcome', kind: 'backend_safe', status: 'pending', result: null },
    { step_id: 'feed_learning_loop', title: 'Feed learning loop', kind: 'backend_safe', status: 'pending', result: null },
  ],
}

function runWithOutcome(status = 'completed') {
  return {
    ...baseRun,
    status: status === 'completed' ? 'completed' : 'blocked',
    current_step_id: status === 'completed' ? null : 'record_personal_engagement_outcome',
    steps: baseRun.steps.map(step => (
      step.step_id === 'record_personal_engagement_outcome'
        ? {
          ...step,
          status: status === 'completed' ? 'completed' : 'blocked',
          result: {
            personal_engagement_outcome: {
              status,
              evidence: {
                action_attempted: 'like',
                target_url: 'https://www.facebook.com/groups/okcattle/posts/123',
                observed_resulting_url: 'https://www.facebook.com/groups/okcattle/posts/123',
                observed_status: status === 'completed' ? 'liked' : 'button missing',
                screenshot_path: '/tmp/personal-engagement-like.png',
                timestamp: '2026-05-09T20:00:00Z',
                error_if_any: status === 'completed' ? null : 'Like button was not visible',
              },
              error_if_any: status === 'completed' ? null : 'Like button was not visible',
            },
          },
        }
        : step
    )),
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

function renderSurface() {
  return render(
    <MemoryRouter initialEntries={['/workflows/workflowrun_personal_test/personal-engagement/personalengagement_test_like']}>
      <Routes>
        <Route path="/workflows/:runId/personal-engagement/:actionId" element={<PersonalEngagementSurface />} />
      </Routes>
    </MemoryRouter>,
  )
}

function mockFetch({ initialRun = baseRun, browserTasks = [] } = {}) {
  let currentRun = initialRun
  const requestedRun = {
    ...baseRun,
    current_step_id: 'execute_personal_action_in_chrome',
    steps: baseRun.steps.map(step => (
      step.step_id === 'carlos_approves_personal_action'
        ? { ...step, status: 'completed', result: { decision: 'approved' } }
        : step
    )),
  }
  const fetchMock = vi.fn(async (url, options = {}) => {
    const target = String(url)
    if (target.includes('/marketing-agenda/runs/workflowrun_personal_test/operator-decision')) {
      currentRun = requestedRun
      return jsonResponse(requestedRun)
    }
    if (target.includes('/marketing-agenda/runs/workflowrun_personal_test/personal-engagement/request')) {
      currentRun = requestedRun
      return jsonResponse({
        browser_task_id: 'browsertask_personal_1',
        status: 'requested',
        workflow_run: requestedRun,
      })
    }
    if (target.includes('/marketing-agenda/runs/workflowrun_personal_test')) {
      return jsonResponse(currentRun)
    }
    if (target.includes('/browser-tasks')) {
      return jsonResponse({ browser_tasks: browserTasks })
    }
    throw new Error(`Unexpected fetch: ${target} ${options.method || 'GET'}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('PersonalEngagementSurface', () => {
  it('renders all eight required surface sections', async () => {
    mockFetch()

    renderSurface()

    expect(await screen.findByRole('heading', { name: 'Personal account Like' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '5 second orientation' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Active identity' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Target' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Exact action' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Next click will and will not' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Chrome runner' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Evidence' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Recovery actions' })).toBeInTheDocument()
    expect(screen.getByText('Acts as Carlos Herrera; not as Anymal OS')).toBeInTheDocument()
  })

  it('keeps Execute approved like disabled until both confirmations are checked', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()

    renderSurface()

    const primary = await screen.findByRole('button', { name: 'Execute approved like' })
    expect(primary).toBeDisabled()

    await user.click(screen.getByLabelText('I confirm this action will be performed as Carlos Herrera.'))
    expect(primary).toBeDisabled()

    await user.click(screen.getByLabelText('I confirm the target is correct.'))
    expect(primary).toBeEnabled()

    await user.click(primary)

    await waitFor(() => expect(screen.getByText('Personal engagement like requested. Refresh evidence after the runner finishes.')).toBeInTheDocument())
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/operator-decision'))).toBe(true)
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/personal-engagement/request'))).toBe(true)
  })

  it('renders completed evidence fields from the personal engagement outcome', async () => {
    mockFetch({ initialRun: runWithOutcome('completed') })

    renderSurface()

    expect(await screen.findByText('/tmp/personal-engagement-like.png')).toBeInTheDocument()
    expect(screen.getByText('liked')).toBeInTheDocument()
    expect(screen.getByText('No error captured')).toBeInTheDocument()
  })

  it('enables recovery actions only after a failed or blocked outcome', async () => {
    mockFetch()

    const { unmount } = renderSurface()

    expect(await screen.findByRole('button', { name: 'Request changes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Block workflow' })).toBeDisabled()

    unmount()
    mockFetch({ initialRun: runWithOutcome('blocked_ui_not_found') })
    renderSurface()

    expect(await screen.findByRole('button', { name: 'Request changes' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Block workflow' })).toBeEnabled()
  })
})
