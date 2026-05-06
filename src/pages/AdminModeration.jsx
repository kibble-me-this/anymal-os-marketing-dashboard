import { useCallback, useEffect, useMemo, useState } from 'react'
import { HAS_MARKETING_ADMIN_KEY, HAS_PUBLIC_FEEDS_ADMIN_KEY, MARKETING_API, PUBLIC_FEEDS_API, adminHeaders, publicFeedsAdminHeaders } from '../config'

const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const STATUS_OPTIONS = ['pending', 'pending_review', 'approved', 'rejected', 'needs_review']
const DECISIONS = [
  { id: 'approved', label: 'Approve', tone: '#00e676', filled: true },
  { id: 'rejected', label: 'Reject', tone: '#ff4444' },
  { id: 'needs_review', label: 'Needs Review', tone: '#ffd54f' },
]

const QUEUE_GROUPS = [
  {
    id: 'claims',
    label: 'Pending Claims',
    apiBase: MARKETING_API,
    headers: adminHeaders,
    path: '/admin/barn-claims',
    itemKeys: ['claims', 'barn_claims', 'items'],
    itemKind: 'claim',
    emptyTitle: 'No pending claims',
    emptyDetail: 'Claim submissions matching this status will appear here.',
  },
  {
    id: 'updates',
    label: 'Pending Updates',
    apiBase: MARKETING_API,
    headers: adminHeaders,
    path: '/admin/barn-updates',
    itemKeys: ['updates', 'barn_updates', 'items'],
    itemKind: 'update',
    emptyTitle: 'No pending updates',
    emptyDetail: 'Listing update suggestions matching this status will appear here.',
  },
  {
    id: 'enrichments',
    label: 'Pending Enrichments',
    apiBase: PUBLIC_FEEDS_API,
    headers: publicFeedsAdminHeaders,
    path: '/admin/barn-enrichments',
    itemKeys: ['enrichments', 'barn_enrichments', 'items'],
    itemKind: 'enrichment',
    emptyTitle: 'No pending enrichments',
    emptyDetail: 'AI-assisted citation-backed enrichment suggestions matching this status will appear here.',
  },
]

function buttonStyle({ tone = '#00e676', filled = false, disabled = false } = {}) {
  return {
    padding: '9px 12px',
    borderRadius: '5px',
    border: filled && !disabled ? 'none' : `1px solid ${disabled ? '#1a3a2a' : tone}`,
    background: filled && !disabled ? tone : 'transparent',
    color: filled && !disabled ? '#021a0e' : tone,
    fontSize: '10px',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    fontFamily: SANS_FONT,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  }
}

function fieldStyle() {
  return {
    background: '#021a0e',
    color: '#e0ffe0',
    border: '1px solid #1a3a2a',
    borderRadius: '5px',
    padding: '9px',
    fontSize: '12px',
    lineHeight: 1.45,
    fontFamily: SANS_FONT,
  }
}

function present(value) {
  if (value === null || value === undefined) return '(not provided)'
  const text = String(value).trim()
  return text ? text : '(not provided)'
}

function displayJson(value) {
  if (value === null || value === undefined || value === '') return '(not provided)'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function editableJson(value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function parseEditedValue(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return { hasEdit: false, value: undefined }
  try {
    return { hasEdit: true, value: JSON.parse(trimmed) }
  } catch {
    return { hasEdit: true, value: trimmed }
  }
}

function itemId(item) {
  return item.id || item.claim_id || item.update_id || item.enrichment_id || item.doc_id || ''
}

function barnName(item) {
  return item.barn_name || item.barn_display_name || item.barn_id || item.barn_slug || 'Unknown barn'
}

function profileUrl(item) {
  const slug = String(item.barn_slug || '').trim()
  if (!slug) return 'https://world.anymalos.com/cattle-sale-barn-directory'
  const encoded = slug.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  return `https://world.anymalos.com/cattle-sale-barn-directory/${encoded}`
}

function formatDate(value) {
  if (!value) return '(not provided)'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return present(value)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function statusLabel(value) {
  return String(value || 'unknown').replaceAll('_', ' ')
}

function statusTone(value) {
  if (value === 'approved') return '#00e676'
  if (value === 'rejected') return '#ff4444'
  if (value === 'needs_review') return '#ffd54f'
  if (value === 'pending') return '#4da3ff'
  return '#8abf8a'
}

function confidenceTone(value) {
  if (value === 'high') return '#00e676'
  if (value === 'medium') return '#ffd54f'
  if (value === 'low') return '#ff9f43'
  return '#8abf8a'
}

async function readResponseDetail(res) {
  try {
    const body = await res.json()
    const detail = body?.detail || body?.message || body?.error || body
    if (typeof detail === 'string') return detail
    return JSON.stringify(detail)
  } catch {
    return ''
  }
}

async function buildErrorMessage(res, actionLabel) {
  const detail = await readResponseDetail(res)
  const suffix = detail ? ` Detail: ${detail}` : ''
  if (res.status === 401) return `${actionLabel} failed: unauthorized. Check X-API-Key and X-Admin-Key.${suffix}`
  if (res.status === 422) return `${actionLabel} failed: backend validation rejected the request.${suffix}`
  if (res.status === 429) return `${actionLabel} failed: rate limited. Wait and retry.${suffix}`
  if (res.status >= 500) return `${actionLabel} failed: backend error.${suffix}`
  return `${actionLabel} failed: HTTP ${res.status}.${suffix}`
}

function networkErrorMessage(actionLabel, error) {
  const detail = error?.message ? ` Detail: ${error.message}` : ''
  return `${actionLabel} failed: network error. Check connection and backend availability.${detail}`
}

function extractItems(body, group) {
  for (const key of group.itemKeys) {
    if (Array.isArray(body?.[key])) return body[key]
  }
  if (Array.isArray(body?.data)) return body.data
  if (Array.isArray(body?.results)) return body.results
  return []
}

function extractNextCursor(body) {
  return body?.next_cursor || body?.nextCursor || body?.pagination?.next_cursor || null
}

function DetailPair({ label, value, mono = false, link }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px', fontFamily: SANS_FONT }}>
        {label}
      </div>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: '#00e676', fontSize: '12px', wordBreak: 'break-word', fontFamily: mono ? MONO_FONT : SANS_FONT }}>
          {present(value)}
        </a>
      ) : (
        <div style={{ color: '#e0ffe0', fontSize: '12px', lineHeight: 1.45, wordBreak: 'break-word', fontFamily: mono ? MONO_FONT : SANS_FONT }}>
          {present(value)}
        </div>
      )}
    </div>
  )
}

function SubmissionDetails({ item, group }) {
  if (group.itemKind === 'claim') {
    return (
      <div style={{ display: 'grid', gap: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
          <DetailPair label="Submitter" value={item.submitter_name} />
          <DetailPair label="Email" value={item.submitter_email} mono />
          <DetailPair label="Role" value={item.submitter_role} />
        </div>
        <DetailPair label="Evidence notes" value={item.evidence_notes} />
      </div>
    )
  }

  if (group.itemKind === 'update') {
    return (
      <div style={{ display: 'grid', gap: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
          <DetailPair label="Submitter email" value={item.submitter_email} mono />
          <DetailPair label="Field path" value={item.field_path} mono />
          <DetailPair label="Proposed value" value={displayJson(item.proposed_value)} />
          <DetailPair label="Current value seen" value={displayJson(item.current_value_seen)} />
        </div>
        <DetailPair label="Source URL" value={item.source_url} link={item.source_url || null} mono />
        <DetailPair label="Notes" value={item.notes} />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <DetailPair label="Field path" value={item.field_path} mono />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        <DetailPair label="Proposed value" value={displayJson(item.proposed_value ?? item.value)} />
        <DetailPair label="Confidence" value={item.confidence} />
        <DetailPair label="Model" value={item.model_version} mono />
      </div>
      {(item.sources || []).map((source, index) => (
        <div key={`${source.url || index}`} style={{ border: '1px solid #1a3a2a', borderRadius: '5px', padding: '10px', display: 'grid', gap: '8px' }}>
          <DetailPair label={`Source ${index + 1}`} value={source.title || source.url} link={source.url || null} mono />
          <DetailPair label="Excerpt" value={source.excerpt} />
        </div>
      ))}
      {!item.sources?.length && (
        <>
          <DetailPair label="Source URL" value={item.source_url} link={item.source_url || null} mono />
          <DetailPair label="Source excerpt" value={item.source_excerpt} />
        </>
      )}
    </div>
  )
}

function ModerationRow({
  item,
  group,
  notes,
  onNotesChange,
  editValue,
  onEditValueChange,
  onDecide,
  actionLoading,
}) {
  const id = itemId(item)
  const rowKey = `${group.id}:${id}`
  const isBusy = actionLoading === rowKey
  const currentStatus = item.status || 'pending'

  return (
    <article style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '14px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <a href={profileUrl(item)} target="_blank" rel="noopener noreferrer" style={{ color: '#e0ffe0', fontSize: '16px', fontWeight: 700, textDecoration: 'none', wordBreak: 'break-word' }}>
            {barnName(item)}
          </a>
          <div style={{ color: '#8abf8a', fontSize: '11px', marginTop: '5px', fontFamily: MONO_FONT, wordBreak: 'break-word' }}>
            {present(item.barn_slug)}
          </div>
        </div>
        <span style={{ border: `1px solid ${statusTone(currentStatus)}`, color: statusTone(currentStatus), borderRadius: '999px', padding: '3px 9px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: SANS_FONT }}>
          {statusLabel(currentStatus)}
        </span>
        {group.itemKind === 'enrichment' && (
          <span style={{ border: `1px solid ${confidenceTone(item.confidence)}`, color: confidenceTone(item.confidence), borderRadius: '999px', padding: '3px 9px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: SANS_FONT }}>
            {present(item.confidence)} confidence
          </span>
        )}
      </div>

      <SubmissionDetails item={item} group={group} />

      {group.itemKind === 'enrichment' && (
        <label style={{ display: 'grid', gap: '6px', color: '#8abf8a', fontSize: '11px', fontFamily: SANS_FONT }}>
          Edit proposed value before approval
          <textarea
            value={editValue}
            onChange={event => onEditValueChange(rowKey, event.target.value)}
            placeholder="Leave unchanged to approve the proposed value. Enter text or JSON to edit-and-approve."
            style={{ ...fieldStyle(), minHeight: '88px', resize: 'vertical', fontFamily: MONO_FONT }}
          />
        </label>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', borderTop: '1px solid #1a3a2a', paddingTop: '12px' }}>
        <DetailPair label="Submission id" value={id} mono />
        <DetailPair label="Idempotency key" value={item.idempotency_key} mono />
        <DetailPair label="Submitted at" value={formatDate(item.submitted_at)} />
        <DetailPair label="Source IP" value={item.source_ip} mono />
      </div>

      <label style={{ display: 'grid', gap: '6px', color: '#8abf8a', fontSize: '11px', fontFamily: SANS_FONT }}>
        Decision notes for {id || group.itemKind}
        <textarea
          value={notes}
          onChange={event => onNotesChange(rowKey, event.target.value)}
          placeholder="Optional moderation note"
          style={{ ...fieldStyle(), minHeight: '78px', resize: 'vertical' }}
        />
      </label>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {DECISIONS.map(decision => (
          <button
            key={decision.id}
            type="button"
            disabled={isBusy || !id}
            onClick={() => onDecide(item, decision.id, rowKey)}
            style={buttonStyle({ tone: decision.tone, filled: decision.filled, disabled: isBusy || !id })}
          >
            {isBusy ? 'Saving...' : decision.label}
          </button>
        ))}
      </div>
    </article>
  )
}

function EmptyState({ title, detail }) {
  return (
    <div style={{ border: '1px dashed #1a3a2a', borderRadius: '6px', padding: '28px', textAlign: 'center', color: '#4a7a5a', background: '#031808', fontSize: '12px' }}>
      <div style={{ color: '#c0e0c0', fontSize: '14px', marginBottom: '6px' }}>{title}</div>
      <div>{detail}</div>
    </div>
  )
}

export default function AdminModeration() {
  const [activeGroupId, setActiveGroupId] = useState('claims')
  const [status, setStatus] = useState('pending')
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [currentCursor, setCurrentCursor] = useState(null)
  const [cursorHistory, setCursorHistory] = useState([])
  const [lastRefresh, setLastRefresh] = useState(null)
  const [notesByRow, setNotesByRow] = useState({})
  const [editValuesByRow, setEditValuesByRow] = useState({})
  const [actionLoading, setActionLoading] = useState(null)
  const [actionMessage, setActionMessage] = useState(null)
  const [actionError, setActionError] = useState(null)

  const activeGroup = useMemo(() => (
    QUEUE_GROUPS.find(group => group.id === activeGroupId) || QUEUE_GROUPS[0]
  ), [activeGroupId])

  const fetchQueue = useCallback(async ({ cursor = null, history = [] } = {}) => {
    if (!activeGroup.path) {
      setItems([])
      setLoaded(true)
      setLoading(false)
      setError(null)
      setNextCursor(null)
      setCurrentCursor(null)
      setCursorHistory([])
      return
    }

    setLoading(true)
    setError(null)
    const effectiveStatus = activeGroup.itemKind === 'enrichment' && status === 'pending' ? 'pending_review' : status
    const params = new URLSearchParams({ status: effectiveStatus, limit: '50' })
    if (cursor) params.set('cursor', cursor)

    try {
      const res = await fetch(`${activeGroup.apiBase}${activeGroup.path}?${params.toString()}`, { headers: activeGroup.headers })
      if (!res.ok) {
        throw new Error(await buildErrorMessage(res, 'Load moderation queue'))
      }
      const body = await res.json()
      setItems(extractItems(body, activeGroup))
      setNextCursor(extractNextCursor(body))
      setCurrentCursor(cursor)
      setCursorHistory(history)
      setLastRefresh(new Date())
      setLoaded(true)
    } catch (err) {
      const message = err?.message?.includes('Load moderation queue failed')
        ? err.message
        : networkErrorMessage('Load moderation queue', err)
      setError(message)
      setItems([])
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [activeGroup, status])

  useEffect(() => {
    setItems([])
    setLoaded(false)
    setNextCursor(null)
    setCurrentCursor(null)
    setCursorHistory([])
    setActionMessage(null)
    setActionError(null)
    fetchQueue({ cursor: null, history: [] })
  }, [fetchQueue])

  const updateNotes = (rowKey, value) => {
    setNotesByRow(current => ({ ...current, [rowKey]: value }))
  }

  const updateEditValue = (rowKey, value) => {
    setEditValuesByRow(current => ({ ...current, [rowKey]: value }))
  }

  const decideItem = async (item, decision, rowKey) => {
    const id = itemId(item)
    if (!id || !activeGroup.path) return
    setActionLoading(rowKey)
    setActionError(null)
    setActionMessage(null)
    const body = {
      decision,
      decision_notes: notesByRow[rowKey] || '',
    }
    if (activeGroup.itemKind === 'enrichment' && decision === 'approved') {
      const parsed = parseEditedValue(editValuesByRow[rowKey] || '')
      if (parsed.hasEdit) body.edited_value = parsed.value
    }
    try {
      const res = await fetch(`${activeGroup.apiBase}${activeGroup.path}/${encodeURIComponent(id)}/decide`, {
        method: 'POST',
        headers: activeGroup.headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error(await buildErrorMessage(res, 'Save moderation decision'))
      }
      setActionMessage(`${statusLabel(decision)} decision saved for ${id}.`)
      setNotesByRow(current => ({ ...current, [rowKey]: '' }))
      setEditValuesByRow(current => ({ ...current, [rowKey]: '' }))
      await fetchQueue({ cursor: currentCursor, history: cursorHistory })
    } catch (err) {
      const message = err?.message?.includes('Save moderation decision failed')
        ? err.message
        : networkErrorMessage('Save moderation decision', err)
      setActionError(message)
    } finally {
      setActionLoading(null)
    }
  }

  const refresh = () => {
    setActionMessage(null)
    setActionError(null)
    fetchQueue({ cursor: currentCursor, history: cursorHistory })
  }

  const goNext = () => {
    if (!nextCursor) return
    fetchQueue({ cursor: nextCursor, history: [...cursorHistory, currentCursor] })
  }

  const goPrevious = () => {
    if (!cursorHistory.length) return
    const previousHistory = cursorHistory.slice(0, -1)
    const previousCursor = cursorHistory[cursorHistory.length - 1] || null
    fetchQueue({ cursor: previousCursor, history: previousHistory })
  }

  return (
    <section style={{ display: 'grid', gap: '16px' }}>
      <header style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '16px', alignItems: 'start' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '7px', fontFamily: SANS_FONT }}>
            Sale barn moderation
          </div>
          <h1 style={{ color: '#e0ffe0', fontSize: '28px', lineHeight: 1.05, letterSpacing: 0, margin: '0 0 8px 0', fontWeight: 700 }}>
            Admin moderation queue
          </h1>
          <p style={{ color: '#8abf8a', fontSize: '13px', lineHeight: 1.45, maxWidth: '760px', margin: 0 }}>
            Review barn owner claims and listing update suggestions before anything is applied to the public directory.
          </p>
          <p style={{ color: '#4a7a5a', fontSize: '11px', margin: '8px 0 0 0', fontFamily: MONO_FONT }}>
            {lastRefresh ? `Last refresh: ${lastRefresh.toLocaleTimeString()}` : 'No refresh yet'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
          <label style={{ color: '#8abf8a', fontSize: '11px', display: 'grid', gap: '5px' }}>
            Status
            <select value={status} onChange={event => setStatus(event.target.value)} style={{ ...fieldStyle(), minWidth: '170px' }}>
              {STATUS_OPTIONS.map(option => (
                <option key={option} value={option}>{statusLabel(option)}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={refresh} disabled={loading || !activeGroup.path} style={buttonStyle({ filled: true, disabled: loading || !activeGroup.path })}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      {!HAS_MARKETING_ADMIN_KEY && (
        <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', color: '#ffd54f', padding: '10px', fontSize: '12px' }}>
          Admin moderation requires VITE_MARKETING_API_KEY and VITE_MARKETING_ADMIN_KEY in the dashboard environment.
        </div>
      )}
      {activeGroup.id === 'enrichments' && !HAS_PUBLIC_FEEDS_ADMIN_KEY && (
        <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', color: '#ffd54f', padding: '10px', fontSize: '12px' }}>
          Pending Enrichments requires VITE_PUBLIC_FEEDS_API_KEY and VITE_PUBLIC_FEEDS_ADMIN_KEY, or matching fallback admin keys, in the dashboard environment.
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} role="tablist" aria-label="Moderation queues">
        {QUEUE_GROUPS.map(group => (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={activeGroup.id === group.id}
            disabled={group.disabled}
            onClick={() => setActiveGroupId(group.id)}
            style={{
              border: `1px solid ${activeGroup.id === group.id ? '#00e676' : '#1a3a2a'}`,
              background: activeGroup.id === group.id ? '#00e676' : '#031808',
              color: activeGroup.id === group.id ? '#021a0e' : '#00e676',
              borderRadius: '6px',
              padding: '10px 14px',
              fontSize: '11px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontFamily: SANS_FONT,
              fontWeight: activeGroup.id === group.id ? 700 : 500,
              cursor: group.disabled ? 'not-allowed' : 'pointer',
              opacity: group.disabled ? 0.45 : 1,
            }}
          >
            {group.label}
          </button>
        ))}
      </div>

      {actionMessage && (
        <div style={{ border: '1px solid #00e676', borderRadius: '6px', background: '#052010', color: '#aaffaa', padding: '10px', fontSize: '12px' }}>
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div role="alert" style={{ border: '1px solid #ff4444', borderRadius: '6px', background: '#2a0a0a', color: '#ff9999', padding: '10px', fontSize: '12px' }}>
          {actionError}
        </div>
      )}
      {error && (
        <div role="alert" style={{ border: '1px solid #ff4444', borderRadius: '6px', background: '#2a0a0a', color: '#ff9999', padding: '12px', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {loading && !loaded && (
        <div style={{ border: '1px dashed #1a3a2a', borderRadius: '6px', padding: '28px', textAlign: 'center', color: '#8abf8a', background: '#031808', fontSize: '12px' }}>
          Loading moderation queue...
        </div>
      )}

      {!loading && loaded && !error && !items.length && (
        <EmptyState title={activeGroup.emptyTitle} detail={activeGroup.emptyDetail} />
      )}

      {!!items.length && (
        <div style={{ display: 'grid', gap: '12px' }}>
          {items.map((item, index) => {
            const id = itemId(item) || `${activeGroup.id}-${index}`
            const rowKey = `${activeGroup.id}:${id}`
            return (
              <ModerationRow
                key={rowKey}
                item={item}
                group={activeGroup}
                notes={notesByRow[rowKey] || ''}
                editValue={editValuesByRow[rowKey] ?? (activeGroup.itemKind === 'enrichment' ? editableJson(item.proposed_value ?? item.value) : '')}
                onNotesChange={updateNotes}
                onEditValueChange={updateEditValue}
                onDecide={decideItem}
                actionLoading={actionLoading}
              />
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ color: '#4a7a5a', fontSize: '11px', fontFamily: MONO_FONT }}>
          Cursor: {present(currentCursor)}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={goPrevious} disabled={loading || cursorHistory.length === 0 || !activeGroup.path} style={buttonStyle({ disabled: loading || cursorHistory.length === 0 || !activeGroup.path })}>
            Previous
          </button>
          <button type="button" onClick={goNext} disabled={loading || !nextCursor || !activeGroup.path} style={buttonStyle({ disabled: loading || !nextCursor || !activeGroup.path })}>
            Next
          </button>
        </div>
      </div>
    </section>
  )
}
