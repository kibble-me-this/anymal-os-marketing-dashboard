import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PagePublishSurface from './PagePublishSurface'

vi.mock('../config', () => ({
  HAS_MARKETING_ADMIN_KEY: true,
  MARKETING_API: 'https://api.test',
  adminHeaders: {
    'X-API-Key': 'legacy-key',
    'X-Admin-Key': 'admin-key',
    'Content-Type': 'application/json',
  },
}))

const run = {
  run_id: 'workflowrun_test',
  workflow_type: 'zip_price_activation',
  workflow_title: 'Announce 31901 price intelligence is live',
  status: 'waiting_for_carlos',
  current_step_id: 'approve_page_anchor_in_draft_review',
  linked_entities: { zip: '31901' },
  steps: [
    { step_id: 'review_launch_package', title: 'Carlos reviews launch package', kind: 'carlos_final_action', status: 'completed' },
    { step_id: 'approve_page_anchor_in_draft_review', title: 'Carlos approves Page anchor in Draft Review', kind: 'carlos_final_action', status: 'pending' },
  ],
}

const campaign = {
  campaign_id: 'step37_31901_facebook_page_v2',
  zip: '31901',
  channel: 'facebook_page',
  status: 'draft',
  message: 'Columbus and Muscogee County cattle folks: local price view is live.',
  creative_metadata: {
    image_url: 'https://example.com/creative.png',
  },
  freshness_gate: {
    label: 'fresh',
    fresh_count: 2,
    total_count: 2,
  },
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
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function renderSurface() {
  return render(
    <MemoryRouter initialEntries={['/workflows/workflowrun_test/page-publish/step37_31901_facebook_page_v2']}>
      <Routes>
        <Route path="/workflows/:runId/page-publish/:campaignId" element={<PagePublishSurface />} />
        <Route path="/workflows/:runId" element={<LocationEcho />} />
      </Routes>
    </MemoryRouter>,
  )
}

function mockFetch({ approveBody = null, approveStatus = 200 } = {}) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const target = String(url)
    if (target.includes('/marketing-agenda/runs/workflowrun_test')) {
      return jsonResponse(run)
    }
    if (target.includes('/campaigns/step37_31901_facebook_page_v2/approve')) {
      return jsonResponse(approveBody || {
        campaign_id: campaign.campaign_id,
        posted_url: 'https://facebook.com/post/1',
        post_id: 'post_1',
      }, approveStatus)
    }
    if (target.includes('/marketing-agenda/runs/workflowrun_test/operator-decision')) {
      return jsonResponse({ ...run, status: 'blocked' })
    }
    if (target.includes('/campaigns/pending/by-channel')) {
      return jsonResponse({ campaigns: [campaign] })
    }
    if (target.includes('/campaigns?status=')) {
      return jsonResponse({ campaigns: [] })
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

describe('PagePublishSurface', () => {
  it('renders the focused publish decision artifact without opening Draft Review', async () => {
    const fetchMock = mockFetch()

    renderSurface()

    expect(await screen.findByRole('heading', { name: 'Publish ZIP 31901 Facebook Page post' })).toBeInTheDocument()
    expect(screen.getByText('Anymal OS Facebook Page')).toBeInTheDocument()
    expect(screen.getByText('Columbus and Muscogee County cattle folks: local price view is live.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview Facebook Page Post' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Publish Facebook Page Post' })).toBeDisabled()
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/approve'))).toBe(false)
  })

  it('requires Preview before Publish and returns to cockpit when publish evidence is complete', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()

    renderSurface()

    await screen.findByRole('heading', { name: 'Publish ZIP 31901 Facebook Page post' })
    await user.click(screen.getByRole('button', { name: 'Preview Facebook Page Post' }))
    expect(screen.getByRole('region', { name: 'Facebook Page post preview' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Publish Facebook Page Post' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/workflows/workflowrun_test?page_publish=success&campaign=step37_31901_facebook_page_v2'))
    const approveCall = fetchMock.mock.calls.find(call => String(call[0]).includes('/approve'))
    expect(approveCall[1].method).toBe('POST')
    expect(approveCall[1].headers['X-Admin-Key']).toBe('admin-key')
  })

  it('stays on the focused route with a recovery message when publish evidence is incomplete', async () => {
    const user = userEvent.setup()
    mockFetch({ approveBody: { campaign_id: campaign.campaign_id, status: 'published' } })

    renderSurface()

    await screen.findByRole('heading', { name: 'Publish ZIP 31901 Facebook Page post' })
    await user.click(screen.getByRole('button', { name: 'Preview Facebook Page Post' }))
    await user.click(screen.getByRole('button', { name: 'Publish Facebook Page Post' }))

    expect(await screen.findByText('Publish returned without complete posted URL and post ID evidence. Refresh evidence before approving the workflow gate.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Publish ZIP 31901 Facebook Page post' })).toBeInTheDocument()
  })
})
