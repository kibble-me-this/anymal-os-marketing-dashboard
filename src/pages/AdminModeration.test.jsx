import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminModeration from './AdminModeration'

const claim = {
  id: 'claim_1',
  barn_slug: 'alabama/arab/arab-livestock-market',
  barn_name: 'Arab Livestock Market',
  submitter_name: 'Casey Operator',
  submitter_email: 'casey@example.com',
  submitter_role: 'owner',
  evidence_notes: 'I own this sale barn and can verify the listing.',
  idempotency_key: '01JZ7Y9A5K8M2N4P6Q8R0S1T2V',
  submitted_at: '2026-05-05T15:00:00Z',
  status: 'pending',
}

const update = {
  id: 'update_1',
  barn_slug: 'alabama/arab/arab-livestock-market',
  barn_name: 'Arab Livestock Market',
  submitter_email: 'casey@example.com',
  field_path: 'contact.phone',
  proposed_value: '+15555550999',
  current_value_seen: '+15555550000',
  source_url: 'https://example.com/contact',
  notes: 'Phone number changed on the barn website.',
  idempotency_key: '0123456789ABCDEF0123456789ABCDEF',
  submitted_at: null,
  status: 'pending',
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('AdminModeration', () => {
  it('renders claim submissions with honest missing values and barn profile link', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ claims: [claim], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminModeration />)

    expect(await screen.findByText('Arab Livestock Market')).toBeInTheDocument()
    expect(screen.getByText('Casey Operator')).toBeInTheDocument()
    expect(screen.getByText('casey@example.com')).toBeInTheDocument()
    expect(screen.getByText('I own this sale barn and can verify the listing.')).toBeInTheDocument()
    expect(screen.getAllByText('(not provided)').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Arab Livestock Market' })).toHaveAttribute(
      'href',
      'https://world.anymalos.com/cattle-sale-barn-directory/alabama/arab/arab-livestock-market',
    )
    expect(fetchMock.mock.calls[0][0]).toContain('/admin/barn-claims?status=pending&limit=50')
  })

  it('renders the empty state after a successful empty response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ claims: [], next_cursor: null })))

    render(<AdminModeration />)

    expect(await screen.findByText('No pending claims')).toBeInTheDocument()
    expect(screen.getByText('Claim submissions matching this status will appear here.')).toBeInTheDocument()
  })

  it('renders a distinct 401 error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({}, 401)))

    render(<AdminModeration />)

    expect(await screen.findByRole('alert')).toHaveTextContent('unauthorized')
    expect(screen.getByRole('alert')).toHaveTextContent('X-API-Key and X-Admin-Key')
  })

  it('submits the correct decision body with two auth headers', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ claims: [claim], next_cursor: null }))
      .mockResolvedValueOnce(jsonResponse({ id: 'claim_1', status: 'approved' }))
      .mockResolvedValueOnce(jsonResponse({ claims: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminModeration />)

    const notes = await screen.findByLabelText('Decision notes for claim_1')
    await user.type(notes, 'Verified by phone.')
    await user.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const [url, options] = fetchMock.mock.calls[1]
    expect(url).toContain('/admin/barn-claims/claim_1/decide')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      decision: 'approved',
      decision_notes: 'Verified by phone.',
    })
    expect(options.headers).toHaveProperty('X-API-Key')
    expect(options.headers).toHaveProperty('X-Admin-Key')
    expect(options.headers).toHaveProperty('Content-Type', 'application/json')
  })

  it('switches to pending updates and renders update-specific fields', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ claims: [], next_cursor: null }))
      .mockResolvedValueOnce(jsonResponse({ updates: [update], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminModeration />)

    expect(await screen.findByText('No pending claims')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Pending Updates' }))

    expect(await screen.findByText('contact.phone')).toBeInTheDocument()
    expect(screen.getByText('+15555550999')).toBeInTheDocument()
    expect(screen.getByText('Phone number changed on the barn website.')).toBeInTheDocument()
    expect(fetchMock.mock.calls[1][0]).toContain('/admin/barn-updates?status=pending&limit=50')
  })
})
