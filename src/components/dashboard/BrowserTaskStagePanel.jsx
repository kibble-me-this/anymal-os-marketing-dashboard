const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

const ACTIVE_STATUSES = new Set(['requested', 'picked_up', 'browser_opened', 'in_progress'])
const READY_STATUS = 'staged_for_operator_review'

function statusTone(status) {
  if (status === READY_STATUS || status === 'completed_by_operator') return '#00e676'
  if (status === 'blocked_by_stop_condition') return '#ffd54f'
  if (status === 'failed' || status === 'cancelled') return '#ff4444'
  if (ACTIVE_STATUSES.has(status)) return '#4da3ff'
  return '#8abf8a'
}

function buttonStyle({ tone = '#00e676', filled = false, disabled = false } = {}) {
  return {
    padding: '9px 12px',
    borderRadius: '5px',
    border: filled && !disabled ? 'none' : `1px solid ${tone}`,
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

function StatusPill({ children, tone = '#00e676' }) {
  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontFamily: SANS_FONT, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function TaskProgress({ task }) {
  const events = Array.isArray(task?.progress_events) ? task.progress_events : []
  if (!events.length) {
    return (
      <div style={{ color: '#4a7a5a', fontSize: '11px', lineHeight: 1.4 }}>
        The runner has not reported progress yet.
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: '5px' }}>
      {events.slice(-5).map((event, index) => (
        <div key={`${event.created_at || 'event'}:${event.event || index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>
          <span>{event.event || 'progress'}</span>
          <span>{event.created_at || ''}</span>
        </div>
      ))}
    </div>
  )
}

function errorMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return error.message || error.error || JSON.stringify(error)
}

export default function BrowserTaskStagePanel({
  title,
  description,
  tasks = [],
  requestLabel = 'Request browser task',
  requestDisabled = false,
  requestLoading = false,
  onRequest,
  renderResult,
}) {
  const sortedTasks = [...tasks].sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
  const latest = sortedTasks[0] || null
  const status = latest?.status || 'not_requested'
  const active = ACTIVE_STATUSES.has(status)
  const ready = status === READY_STATUS
  const blocked = status === 'blocked_by_stop_condition'
  const failed = status === 'failed' || status === 'cancelled'
  const tone = statusTone(status)
  const canRequest = Boolean(onRequest) && !requestDisabled && !requestLoading && !active

  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '12px', display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Shared browser task</div>
          <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>{title}</div>
        </div>
        <StatusPill tone={tone}>{status}</StatusPill>
      </div>
      {description && <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>{description}</div>}

      {!latest && (
        <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#2a2100', color: '#ffe58a', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
          No shared browser task exists yet. Request one here, then wait for the local desktop runner to pick it up.
        </div>
      )}

      {latest && (
        <article style={{ border: `1px solid ${tone}`, borderRadius: '6px', padding: '10px', display: 'grid', gap: '8px', background: '#021a0e' }}>
          <div style={{ display: 'grid', gap: '5px' }}>
            <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>browser_task_id: {latest.browser_task_id}</div>
            <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>runner_id: {latest.runner_id || 'not picked up yet'}</div>
            <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>task_type: {latest.task_type}</div>
          </div>
          {active && (
            <div style={{ border: '1px solid #4da3ff', borderRadius: '6px', background: '#071a2a', color: '#b7dcff', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
              {latest.runner_id ? 'The desktop runner has this task. Wait for staged_for_operator_review before approving the gate.' : 'Task requested. The local desktop runner has not picked it up yet.'}
            </div>
          )}
          {blocked && (
            <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#2a2100', color: '#ffe58a', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
              The runner stopped on a safety condition. Review the observation before deciding changes or block.
            </div>
          )}
          {failed && (
            <div style={{ border: '1px solid #ff4444', borderRadius: '6px', background: '#260707', color: '#ffb3b3', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
              {errorMessage(latest.error) || 'Browser task failed.'}
            </div>
          )}
          <TaskProgress task={latest} />
          {latest.result && renderResult?.(latest.result, latest)}
        </article>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={onRequest} disabled={!canRequest} style={buttonStyle({ filled: true, disabled: !canRequest })}>
          {requestLoading ? 'Requesting...' : active ? 'Runner working' : requestLabel}
        </button>
        <span style={{ color: '#8abf8a', fontSize: '11px', lineHeight: 1.35 }}>
          {ready ? 'Ready for Carlos review.' : 'The next gate stays blocked until the shared browser task reports a valid result.'}
        </span>
      </div>
    </section>
  )
}

