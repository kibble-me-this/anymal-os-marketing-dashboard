import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonalEngagementV2ReplyBatchSurface from './PersonalEngagementV2ReplyBatchSurface'

vi.mock('../config', () => ({
  HAS_MARKETING_ADMIN_KEY: true,
  MARKETING_API: 'https://api.test',
  adminHeaders: {
    'X-API-Key': 'legacy-key',
    'X-Admin-Key': 'admin-key',
    'Content-Type': 'application/json',
  },
}))

const targetUrl = 'https://www.facebook.com/1034424456426616_122110674992738291'

const replyCandidates = [
  {
    reply_id: 'reply_1',
    reply_index: 0,
    commenter_handle: 'Ranch Operator 1',
    commenter_comment_excerpt: 'Useful update.',
    approved_text: 'Thanks. Useful point for cattle operators.',
    approved_text_hash: 'hash-1',
    status: 'draft_pending_approval',
    voice_profile_version: 'carlos:v1',
    safety_scoring: {
      score: 84,
      recommendation_safe: true,
      risk_flags: [],
      positive_signals: ['operator_useful'],
    },
    risk_flags: [],
  },
  {
    reply_id: 'reply_2',
    reply_index: 1,
    commenter_handle: 'Ranch Operator 2',
    commenter_comment_excerpt: 'How should folks compare this?',
    approved_text: 'Good question. The main thing is having current local context.',
    approved_text_hash: 'hash-2',
    status: 'draft_pending_approval',
    voice_profile_version: 'carlos:v1',
    safety_scoring: {
      score: 80,
      recommendation_safe: true,
      risk_flags: [],
      positive_signals: ['operator_useful'],
    },
    risk_flags: [],
  },
]

const baseBatch = {
  personal_engagement_v2_reply_batch_id: 'personalengagementv22_test_replybatch',
  session_status: 'pending_operator_approval',
  target_post_url: targetUrl,
  target_post_url_hash: 'target-hash',
  target_post_excerpt: 'Fresh cattle workflow update from Anymal OS.',
  target_post_author: 'Anymal OS',
  voice_profile_version: 'carlos:v1',
  identity_name: 'Carlos Herrera',
  profile_user_data_dir: 'Dedicated PersonalEngagement profile',
  rate_limit: {
    max_replies_per_session: 5,
    per_commenter_cooldown_hours: 24,
  },
  commenter_scan: {
    detected_commenter_count: 2,
    selected_commenter_count: 2,
    truncated_commenter_count: 0,
  },
  reply_candidates: replyCandidates,
  safety_scoring: {
    aggregate_risk_flags: [],
    reply_scores: [],
  },
}

const baseRun = {
  run_id: 'workflowrun_v22_test',
  workflow_type: 'personal_engagement_v2_reply_batch',
  workflow_title: 'Personal engagement V2.2 reply batch',
  status: 'waiting_for_carlos',
  current_step_id: 'carlos_approves_v2_reply_batch',
  linked_entities: {
    batch_id: 'personalengagementv22_test_replybatch',
    identity_name: 'Carlos Herrera',
    target_post_url: targetUrl,
    target_post_url_hash: 'target-hash',
    target_post_excerpt: 'Fresh cattle workflow update from Anymal OS.',
    target_post_author: 'Anymal OS',
    profile_user_data_dir: 'Dedicated PersonalEngagement profile',
    voice_profile_version: 'carlos:v1',
  },
  steps: [
    { step_id: 'prepare_v2_reply_batch_session', title: 'Prepare V2.2 reply batch', kind: 'backend_safe', status: 'completed', result: baseBatch },
    { step_id: 'scan_post_commenters', title: 'Scan commenters', kind: 'chrome_stage_only', status: 'completed', result: { commenters: [] } },
    { step_id: 'generate_v2_reply_drafts', title: 'Generate V2.2 reply drafts', kind: 'backend_safe', status: 'completed', result: baseBatch },
    { step_id: 'carlos_approves_v2_reply_batch', title: 'Carlos approves V2.2 reply batch', kind: 'carlos_final_action', status: 'pending', result: null },
    { step_id: 'execute_v2_reply_batch_in_chrome', title: 'Execute V2.2 replies', kind: 'chrome_stage_only', status: 'pending', result: null },
    { step_id: 'record_v2_reply_batch_outcome', title: 'Record V2.2 reply batch outcome', kind: 'backend_safe', status: 'pending', result: null },
    { step_id: 'feed_v2_learning_loop', title: 'Feed V2 learning loop', kind: 'backend_safe', status: 'pending', result: null },
  ],
}

function runWithOutcome() {
  const completedBatch = {
    ...baseBatch,
    session_status: 'completed',
    reply_candidates: replyCandidates.map(reply => ({
      ...reply,
      status: 'executed_completed',
      evidence: {
        action_attempted: 'reply',
        target_url: targetUrl,
        observed_resulting_url: targetUrl,
        observed_status: 'reply_posted',
        screenshot_path: `/tmp/${reply.reply_id}.png`,
        timestamp: '2026-05-10T21:00:00Z',
        error_if_any: '',
        executed_text: reply.approved_text,
        reply_id: reply.reply_id,
        commenter_handle: reply.commenter_handle,
      },
    })),
  }
  return {
    ...baseRun,
    status: 'completed',
    current_step_id: null,
    steps: baseRun.steps.map(step => (
      step.step_id === 'record_v2_reply_batch_outcome'
        ? { ...step, status: 'completed', result: { personal_engagement_v2_reply_batch: completedBatch } }
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
    <MemoryRouter initialEntries={['/workflows/workflowrun_v22_test/personal-engagement-v2-reply-batch/personalengagementv22_test_replybatch']}>
      <Routes>
        <Route path="/workflows/:runId/personal-engagement-v2-reply-batch/:batchId" element={<PersonalEngagementV2ReplyBatchSurface />} />
      </Routes>
    </MemoryRouter>,
  )
}

function mockFetch({ initialRun = baseRun, browserTasks = [] } = {}) {
  let currentRun = initialRun
  const executeRun = {
    ...baseRun,
    current_step_id: 'execute_v2_reply_batch_in_chrome',
    steps: baseRun.steps.map(step => (
      step.step_id === 'carlos_approves_v2_reply_batch'
        ? { ...step, status: 'completed', result: { approved_reply_count: 1 } }
        : step
    )),
  }
  const fetchMock = vi.fn(async (url, options = {}) => {
    const target = String(url)
    if (target.includes('/personal-engagement-v2-reply-batch/review')) {
      currentRun = executeRun
      return jsonResponse(executeRun)
    }
    if (target.includes('/personal-engagement-v2-reply-batch/request')) {
      currentRun = executeRun
      return jsonResponse({ browser_task_id: 'browsertask_v22_execute', status: 'requested' })
    }
    if (target.includes('/marketing-agenda/runs/workflowrun_v22_test')) {
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

describe('PersonalEngagementV2ReplyBatchSurface', () => {
  it('renders all V2.2 batch sections and per-commenter cards', async () => {
    mockFetch()

    renderSurface()

    expect(await screen.findByRole('heading', { name: 'Personal Facebook Engagement V2.2: Multi-Commenter Reply Batch' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Orientation banner' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Active identity card' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Target post card' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Commenter list panel' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Per-reply cards' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Bulk action panel' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Final confirmation' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Chrome runner availability indicator' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Evidence panel' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Recovery actions' })).toBeInTheDocument()
    expect(screen.getAllByText('Ranch Operator 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ranch Operator 2').length).toBeGreaterThan(0)
    expect(screen.getByText('Thanks. Useful point for cattle operators.')).toBeInTheDocument()
  })

  it('requires every reply to be approved or vetoed before execution', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()

    renderSurface()

    const primary = await screen.findByRole('button', { name: 'Execute approved replies' })
    expect(primary).toBeDisabled()

    const cards = screen.getByRole('region', { name: 'Per-reply cards' })
    const approveButtons = within(cards).getAllByRole('button', { name: 'Approve' })
    const vetoButtons = within(cards).getAllByRole('button', { name: 'Veto' })

    await user.click(approveButtons[0])
    await user.click(vetoButtons[1])
    await user.click(screen.getByLabelText('I confirm this batch will be performed as Carlos Herrera.'))
    await user.click(screen.getByLabelText('I confirm the target post is correct.'))
    await user.click(screen.getByLabelText('I approve the exact text of each approved reply.'))

    expect(primary).toBeEnabled()
    await user.click(primary)

    await waitFor(() => expect(screen.getByText('V2.2 approved replies requested. Refresh evidence after the runner finishes.')).toBeInTheDocument())
    const reviewCall = fetchMock.mock.calls.find(call => String(call[0]).includes('/personal-engagement-v2-reply-batch/review'))
    expect(reviewCall).toBeTruthy()
    const body = JSON.parse(reviewCall[1].body)
    expect(body.decisions).toEqual([
      { reply_id: 'reply_1', decision: 'approved' },
      { reply_id: 'reply_2', decision: 'vetoed' },
    ])
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/personal-engagement-v2-reply-batch/request'))).toBe(true)
  })

  it('bulk approves remaining replies', async () => {
    const user = userEvent.setup()
    mockFetch()

    renderSurface()

    await screen.findByRole('button', { name: 'Approve all remaining' })
    await user.click(screen.getByRole('button', { name: 'Approve all remaining' }))

    expect(screen.getAllByText('approved').length).toBeGreaterThanOrEqual(2)
  })

  it('renders post-execution evidence per reply', async () => {
    mockFetch({ initialRun: runWithOutcome() })

    renderSurface()

    expect(await screen.findByText('/tmp/reply_1.png')).toBeInTheDocument()
    expect(screen.getByText('/tmp/reply_2.png')).toBeInTheDocument()
    expect(screen.getAllByText('reply_posted').length).toBeGreaterThanOrEqual(2)
  })
})
