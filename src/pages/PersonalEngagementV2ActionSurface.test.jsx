import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonalEngagementV2ActionSurface from './PersonalEngagementV2ActionSurface'

vi.mock('../config', () => ({
  HAS_MARKETING_ADMIN_KEY: true,
  MARKETING_API: 'https://api.test',
  adminHeaders: {
    'X-API-Key': 'legacy-key',
    'X-Admin-Key': 'admin-key',
    'Content-Type': 'application/json',
  },
}))

const approvedText = 'Useful update for cattle operators. Appreciate you putting it out there.'

const baseRun = {
  run_id: 'workflowrun_v2_test',
  workflow_type: 'personal_engagement_v2_action',
  workflow_title: 'Personal engagement V2 comment',
  status: 'waiting_for_carlos',
  current_step_id: 'carlos_approves_v2_action',
  linked_entities: {
    action_id: 'personalengagementv2_test_comment',
    action_verb: 'comment',
    identity_name: 'Carlos Herrera',
    target_post_url: 'https://www.facebook.com/1034424456426616_122110674992738291',
    target_post_url_hash: 'target-hash',
    target_post_excerpt: 'Fresh cattle workflow update from Anymal OS.',
    target_post_author: 'Anymal OS',
    profile_user_data_dir: 'Dedicated PersonalEngagement profile',
    voice_profile_version: 'carlos:v1',
    evidence_required: [
      'action_attempted',
      'target_url',
      'observed_resulting_url',
      'observed_status',
      'screenshot_path',
      'timestamp',
      'error_if_any',
      'executed_text',
    ],
  },
  steps: [
    { step_id: 'prepare_v2_action_candidate', title: 'Prepare V2 action candidate', kind: 'backend_safe', status: 'completed', result: {} },
    {
      step_id: 'generate_v2_candidate_text',
      title: 'Generate V2 candidate text',
      kind: 'backend_safe',
      status: 'completed',
      result: {
        personal_engagement_v2_action_id: 'personalengagementv2_test_comment',
        action_verb: 'comment',
        target_post_url: 'https://www.facebook.com/1034424456426616_122110674992738291',
        target_post_url_hash: 'target-hash',
        target_post_excerpt: 'Fresh cattle workflow update from Anymal OS.',
        target_post_author: 'Anymal OS',
        approved_text: approvedText,
        approved_text_hash: 'text-hash',
        voice_profile_version: 'carlos:v1',
        safety_scoring: {
          score: 82,
          recommendation_safe: true,
          risk_flags: [],
          positive_signals: ['original_native_content', 'operator_useful'],
        },
        risk_flags: [],
      },
    },
    { step_id: 'carlos_approves_v2_action', title: 'Carlos approves exact V2 action', kind: 'carlos_final_action', status: 'pending', result: null },
    { step_id: 'execute_v2_action_in_chrome', title: 'Execute approved V2 comment in Chrome', kind: 'chrome_stage_only', status: 'pending', result: null },
    { step_id: 'record_v2_action_outcome', title: 'Record V2 action outcome', kind: 'backend_safe', status: 'pending', result: null },
    { step_id: 'feed_v2_learning_loop', title: 'Feed V2 learning loop', kind: 'backend_safe', status: 'pending', result: null },
  ],
}

function runWithOutcome(status = 'completed') {
  return {
    ...baseRun,
    status: 'completed',
    current_step_id: null,
    steps: baseRun.steps.map(step => (
      step.step_id === 'record_v2_action_outcome'
        ? {
          ...step,
          status: 'completed',
          result: {
            personal_engagement_v2_action: {
              status,
              evidence: {
                action_attempted: 'comment',
                target_url: 'https://www.facebook.com/1034424456426616_122110674992738291',
                observed_resulting_url: 'https://www.facebook.com/1034424456426616_122110674992738291',
                observed_status: status === 'completed' ? 'comment_posted' : 'blocked_text_hash_mismatch',
                screenshot_path: '/tmp/personal-engagement-v2-comment.png',
                timestamp: '2026-05-10T20:00:00Z',
                error_if_any: status === 'completed' ? '' : 'Text mismatch',
                executed_text: approvedText,
              },
              error_if_any: status === 'completed' ? '' : 'Text mismatch',
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
    <MemoryRouter initialEntries={['/workflows/workflowrun_v2_test/personal-engagement-v2/personalengagementv2_test_comment']}>
      <Routes>
        <Route path="/workflows/:runId/personal-engagement-v2/:actionId" element={<PersonalEngagementV2ActionSurface />} />
      </Routes>
    </MemoryRouter>,
  )
}

function mockFetch({ initialRun = baseRun, browserTasks = [] } = {}) {
  let currentRun = initialRun
  const requestedRun = {
    ...baseRun,
    current_step_id: 'execute_v2_action_in_chrome',
    steps: baseRun.steps.map(step => (
      step.step_id === 'carlos_approves_v2_action'
        ? { ...step, status: 'completed', result: { decision: 'approved' } }
        : step
    )),
  }
  const fetchMock = vi.fn(async (url, options = {}) => {
    const target = String(url)
    if (target.includes('/marketing-agenda/runs/workflowrun_v2_test/operator-decision')) {
      currentRun = requestedRun
      return jsonResponse(requestedRun)
    }
    if (target.includes('/marketing-agenda/runs/workflowrun_v2_test/personal-engagement-v2/request')) {
      currentRun = requestedRun
      return jsonResponse({
        browser_task_id: 'browsertask_personal_v2_1',
        status: 'requested',
        workflow_run: requestedRun,
      })
    }
    if (target.includes('/marketing-agenda/runs/workflowrun_v2_test')) {
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

describe('PersonalEngagementV2ActionSurface', () => {
  it('renders the focused V2 action sections', async () => {
    mockFetch()

    renderSurface()

    expect(await screen.findByRole('heading', { name: 'Personal Facebook Engagement V2: Single Action' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '5 second orientation' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Active identity' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Target post' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Exact action' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Drafted text' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Safety scoring' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Next click will and will not' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Chrome runner' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Evidence' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Recovery actions' })).toBeInTheDocument()
    expect(screen.getByText(approvedText)).toBeInTheDocument()
    expect(screen.getByText('carlos:v1')).toBeInTheDocument()
    expect(screen.getByText('Recommendation safe')).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText('original_native_content, operator_useful')).toBeInTheDocument()
  })

  it('keeps Execute approved comment disabled until all three confirmations are checked', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()

    renderSurface()

    const primary = await screen.findByRole('button', { name: 'Execute approved comment' })
    expect(primary).toBeDisabled()

    await user.click(screen.getByLabelText('I confirm this action will be performed as Carlos Herrera.'))
    expect(primary).toBeDisabled()

    await user.click(screen.getByLabelText('I confirm the target is correct.'))
    expect(primary).toBeDisabled()

    await user.click(screen.getByLabelText('I approve this exact text.'))
    expect(primary).toBeEnabled()

    await user.click(primary)

    await waitFor(() => expect(screen.getByText('Personal engagement V2 comment requested. Refresh evidence after the runner finishes.')).toBeInTheDocument())
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/operator-decision'))).toBe(true)
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/personal-engagement-v2/request'))).toBe(true)
  })

  it('renders completed V2 evidence including executed text', async () => {
    mockFetch({ initialRun: runWithOutcome('completed') })

    renderSurface()

    expect(await screen.findByText('/tmp/personal-engagement-v2-comment.png')).toBeInTheDocument()
    expect(screen.getByText('comment_posted')).toBeInTheDocument()
    expect(screen.getAllByText(approvedText).length).toBeGreaterThan(0)
  })

  it('enables recovery actions after a blocked V2 outcome', async () => {
    mockFetch({ initialRun: runWithOutcome('blocked_text_hash_mismatch') })

    renderSurface()

    expect(await screen.findByRole('button', { name: 'Request changes' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Block workflow' })).toBeEnabled()
  })
})
