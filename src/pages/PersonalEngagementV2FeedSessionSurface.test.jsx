import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonalEngagementV2FeedSessionSurface from './PersonalEngagementV2FeedSessionSurface'

vi.mock('../config', () => ({
  HAS_MARKETING_ADMIN_KEY: true,
  MARKETING_API: 'https://api.test',
  adminHeaders: {
    'X-API-Key': 'legacy-key',
    'X-Admin-Key': 'admin-key',
    'Content-Type': 'application/json',
  },
}))

const targetFeedUrl = 'https://www.facebook.com/AnymalOS'
const targetPostUrl = 'https://www.facebook.com/1034424456426616_122110674992738291'

const baseRun = {
  run_id: 'workflowrun_v23_test',
  workflow_type: 'personal_engagement_v2_feed_session',
  workflow_title: 'Personal engagement V2.3 feed session',
  status: 'waiting_for_carlos',
  current_step_id: 'review_v2_feed_candidates',
  linked_entities: {
    session_id: 'workflowrun_v23_test',
    identity_name: 'Carlos Herrera',
    target_feed_url: targetFeedUrl,
    target_feed_url_hash: 'feed-hash',
    profile_user_data_dir: 'Dedicated PersonalEngagement profile',
    voice_profile_version: 'carlos:v1',
  },
  steps: [
    { step_id: 'prepare_v2_feed_session', title: 'Prepare V2.3 feed session', kind: 'backend_safe', status: 'completed', result: { session_id: 'workflowrun_v23_test', target_feed_url: targetFeedUrl } },
    { step_id: 'traverse_v2_feed_in_chrome', title: 'Traverse feed', kind: 'chrome_stage_only', status: 'completed', result: { session_id: 'workflowrun_v23_test', candidates_staged: 2, posts_scrolled_past: 4 } },
    { step_id: 'review_v2_feed_candidates', title: 'Review V2.3 staged feed candidates', kind: 'carlos_final_action', status: 'pending', result: null },
    { step_id: 'feed_v2_learning_loop', title: 'Feed V2 learning loop', kind: 'backend_safe', status: 'pending', result: null },
  ],
}

const pendingTraversalRun = {
  ...baseRun,
  status: 'running',
  current_step_id: 'traverse_v2_feed_in_chrome',
  steps: [
    { step_id: 'prepare_v2_feed_session', title: 'Prepare V2.3 feed session', kind: 'backend_safe', status: 'completed', result: { session_id: 'workflowrun_v23_test', target_feed_url: targetFeedUrl, session_status: 'pending_traversal' } },
    { step_id: 'traverse_v2_feed_in_chrome', title: 'Traverse feed', kind: 'chrome_stage_only', status: 'pending', result: null },
    { step_id: 'review_v2_feed_candidates', title: 'Review V2.3 staged feed candidates', kind: 'carlos_final_action', status: 'pending', result: null },
    { step_id: 'feed_v2_learning_loop', title: 'Feed V2 learning loop', kind: 'backend_safe', status: 'pending', result: null },
  ],
}

function candidate(id, overrides = {}) {
  return {
    candidate_id: id,
    session_id: 'workflowrun_v23_test',
    candidate_status: 'staged',
    target_post_url: `${targetPostUrl}?candidate=${id}`,
    target_post_url_hash: `hash-${id}`,
    target_post_excerpt: `Fresh cattle workflow update ${id}.`,
    target_post_author: 'Anymal OS',
    target_post_author_url: targetFeedUrl,
    post_age_hours: 8,
    comment_count_visible: 2,
    proposed_action_hints: ['comment', 'reply_batch'],
    scraped_at: '2026-05-11T17:10:00Z',
    source_surface_url: targetFeedUrl,
    ...overrides,
  }
}

function candidateResponse(candidates = [candidate('candidate_1'), candidate('candidate_2')], sessionOverrides = {}) {
  return {
    session: {
      session_id: 'workflowrun_v23_test',
      session_status: 'staged_for_operator_review',
      target_feed_url: targetFeedUrl,
      target_feed_url_hash: 'feed-hash',
      candidate_count: candidates.length,
      candidates_staged: candidates.length,
      candidates_filtered_out: {},
      posts_scrolled_past: 4,
      identity_name: 'Carlos Herrera',
      profile_user_data_dir: 'Dedicated PersonalEngagement profile',
      ...sessionOverrides,
    },
    candidates,
    count: candidates.length,
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

function LocationEcho() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderSurface() {
  return render(
    <MemoryRouter initialEntries={['/workflows/workflowrun_v23_test/personal-engagement-v2-feed-session/workflowrun_v23_test']}>
      <Routes>
        <Route path="/workflows/:runId/personal-engagement-v2-feed-session/:sessionId" element={<PersonalEngagementV2FeedSessionSurface />} />
        <Route path="/workflows/:runId/personal-engagement-v2/:actionId" element={<LocationEcho />} />
        <Route path="/workflows/:runId/personal-engagement-v2-reply-batch/:batchId" element={<LocationEcho />} />
      </Routes>
    </MemoryRouter>,
  )
}

function mockFetch({ run = baseRun, candidates = candidateResponse(), browserTasks = [] } = {}) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const target = String(url)
    const method = options.method || 'GET'
    if (target.includes('/personal-engagement-v2-feed-session/request')) {
      return jsonResponse({ status: 'ok', requested: true })
    }
    if (target.includes('/spawn-action')) {
      const body = JSON.parse(options.body)
      const actionId = `personalengagementv2_${target.split('/candidates/')[1].split('/')[0]}_comment`
      const batchId = `personalengagementv22_${target.split('/candidates/')[1].split('/')[0]}_replybatch`
      return jsonResponse({
        spawn_kind: body.spawn_kind,
        candidate: {
          candidate_id: target.split('/candidates/')[1].split('/')[0],
          executed_via_action_id: body.spawn_kind === 'comment' ? actionId : null,
          executed_via_batch_id: body.spawn_kind === 'reply_batch' ? batchId : null,
        },
        spawned_run: {
          run_id: body.spawn_kind === 'comment' ? 'workflowrun_v21_spawned' : 'workflowrun_v22_spawned',
          workflow_type: body.spawn_kind === 'comment' ? 'personal_engagement_v2_action' : 'personal_engagement_v2_reply_batch',
          linked_entities: body.spawn_kind === 'comment' ? { action_id: actionId } : { batch_id: batchId },
        },
      })
    }
    if (target.includes('/dismiss')) return jsonResponse({ candidate_status: 'rejected' })
    if (target.includes('/marketing-agenda/runs/workflowrun_v23_test') && method === 'GET') return jsonResponse(run)
    if (target.includes('/feed-sessions/workflowrun_v23_test/candidates') && method === 'GET') return jsonResponse(candidates)
    if (target.includes('/browser-tasks')) return jsonResponse({ browser_tasks: browserTasks })
    throw new Error(`Unexpected fetch: ${target} ${method}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('PersonalEngagementV2FeedSessionSurface', () => {
  it('renders candidate review and routes comment spawn to the V2.1 surface', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()

    renderSurface()

    expect(await screen.findByRole('heading', { name: 'Personal Facebook Engagement V2.3: Feed Candidate Review' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Operator browser discipline' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Feed session summary' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Candidate cards' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Bulk actions footer' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Reply to commenters' }).length).toBeGreaterThan(0)

    await user.click(screen.getAllByRole('button', { name: 'Comment' })[0])

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/workflows/workflowrun_v21_spawned/personal-engagement-v2/personalengagementv2_candidate_1_comment'))
    const spawnCall = fetchMock.mock.calls.find(call => String(call[0]).includes('/spawn-action'))
    expect(JSON.parse(spawnCall[1].body).spawn_kind).toBe('comment')
  })

  it('renders an empty candidate state', async () => {
    mockFetch({ candidates: candidateResponse([]) })

    renderSurface()

    expect(await screen.findByRole('heading', { name: 'No candidates staged' })).toBeInTheDocument()
    expect(screen.getByText('Refresh evidence after the read-only traversal completes.')).toBeInTheDocument()
  })

  it('bulk approves top candidates', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()

    renderSurface()

    await screen.findByRole('button', { name: 'Approve top N as comments' })
    await user.click(screen.getByRole('button', { name: 'Approve top N as comments' }))

    await waitFor(() => expect(fetchMock.mock.calls.filter(call => String(call[0]).includes('/spawn-action'))).toHaveLength(2))
    expect(screen.getByTestId('location')).toHaveTextContent('/workflows/workflowrun_v21_spawned/personal-engagement-v2/personalengagementv2_candidate_1_comment')
  })

  it('bulk rejects all staged candidates', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()

    renderSurface()

    await screen.findByRole('button', { name: 'Reject all' })
    await user.click(screen.getByRole('button', { name: 'Reject all' }))

    await waitFor(() => expect(fetchMock.mock.calls.filter(call => String(call[0]).includes('/dismiss'))).toHaveLength(2))
  })

  it('shows cooldown candidates and disables spawn buttons', async () => {
    mockFetch({
      candidates: candidateResponse([
        candidate('candidate_cooldown', {
          cooldown_active: true,
          rejection_reason: 'already_engaged',
        }),
      ]),
    })

    renderSurface()

    expect(await screen.findByText('already engaged today')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reply to commenters' })).toBeDisabled()
  })

  it('shows the request traversal button when the session is pending and no task exists', async () => {
    mockFetch({
      run: pendingTraversalRun,
      candidates: candidateResponse([], { session_status: 'pending_traversal', candidate_count: 0, candidates_staged: 0 }),
      browserTasks: [],
    })

    renderSurface()

    expect(await screen.findByRole('button', { name: 'Request V2.3 traversal' })).toBeInTheDocument()
  })

  it('hides the request traversal button once the session is no longer pending', async () => {
    mockFetch({
      run: pendingTraversalRun,
      candidates: candidateResponse([], { session_status: 'traversal_blocked', refusal_code: 'phase_v23_feed_unavailable' }),
      browserTasks: [],
    })

    renderSurface()

    await screen.findByText('Traversal blocked')
    expect(screen.queryByRole('button', { name: 'Request V2.3 traversal' })).not.toBeInTheDocument()
  })

  it('hides the request traversal button when a traversal task already exists', async () => {
    mockFetch({
      run: pendingTraversalRun,
      candidates: candidateResponse([], { session_status: 'pending_traversal', candidate_count: 0, candidates_staged: 0 }),
      browserTasks: [{ browser_task_id: 'browsertask_existing', status: 'requested', updated_at: '2026-05-12T20:00:00Z' }],
    })

    renderSurface()

    await screen.findByText(/latest_task: browsertask_existing/)
    expect(screen.queryByRole('button', { name: 'Request V2.3 traversal' })).not.toBeInTheDocument()
  })

  it('requests traversal, posts operator notes, and hides the button after refresh', async () => {
    const user = userEvent.setup()
    let requested = false
    const fetchMock = vi.fn(async (url, options = {}) => {
      const target = String(url)
      const method = options.method || 'GET'
      if (target.includes('/personal-engagement-v2-feed-session/request')) {
        requested = true
        return jsonResponse({ status: 'ok', requested: true })
      }
      if (target.includes('/marketing-agenda/runs/workflowrun_v23_test') && method === 'GET') {
        return jsonResponse(pendingTraversalRun)
      }
      if (target.includes('/feed-sessions/workflowrun_v23_test/candidates') && method === 'GET') {
        return jsonResponse(candidateResponse([], {
          session_status: requested ? 'traversal_requested' : 'pending_traversal',
          candidate_count: 0,
          candidates_staged: 0,
        }))
      }
      if (target.includes('/browser-tasks')) {
        return jsonResponse({
          browser_tasks: requested ? [{ browser_task_id: 'browsertask_requested', status: 'requested', updated_at: '2026-05-12T20:00:00Z' }] : [],
        })
      }
      throw new Error(`Unexpected fetch: ${target} ${method}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderSurface()

    await screen.findByRole('button', { name: 'Request V2.3 traversal' })
    await user.type(screen.getByPlaceholderText('Optional note for this V2.3 feed session'), 'Queue this traversal.')
    await user.click(screen.getByRole('button', { name: 'Request V2.3 traversal' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/personal-engagement-v2-feed-session/request'))).toBe(true))
    const requestCall = fetchMock.mock.calls.find(call => String(call[0]).includes('/personal-engagement-v2-feed-session/request'))
    expect(JSON.parse(requestCall[1].body).operator_notes).toBe('Queue this traversal.')
    expect(await screen.findByText('V2.3 traversal requested.')).toBeInTheDocument()
    await screen.findByText(/latest_task: browsertask_requested/)
    expect(screen.queryByRole('button', { name: 'Request V2.3 traversal' })).not.toBeInTheDocument()
  })

  it('surfaces request traversal API errors and re-enables the button', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({
      run: pendingTraversalRun,
      candidates: candidateResponse([], { session_status: 'pending_traversal', candidate_count: 0, candidates_staged: 0 }),
      browserTasks: [],
    })
    fetchMock.mockImplementation(async (url, options = {}) => {
      const target = String(url)
      const method = options.method || 'GET'
      if (target.includes('/personal-engagement-v2-feed-session/request')) {
        return jsonResponse({ detail: 'runner unavailable' }, 409)
      }
      if (target.includes('/marketing-agenda/runs/workflowrun_v23_test') && method === 'GET') return jsonResponse(pendingTraversalRun)
      if (target.includes('/feed-sessions/workflowrun_v23_test/candidates') && method === 'GET') return jsonResponse(candidateResponse([], { session_status: 'pending_traversal', candidate_count: 0, candidates_staged: 0 }))
      if (target.includes('/browser-tasks')) return jsonResponse({ browser_tasks: [] })
      throw new Error(`Unexpected fetch: ${target} ${method}`)
    })

    renderSurface()

    await user.click(await screen.findByRole('button', { name: 'Request V2.3 traversal' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('runner unavailable')
    expect(screen.getByRole('button', { name: 'Request V2.3 traversal' })).toBeEnabled()
  })
})
