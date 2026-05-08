import { Link } from 'react-router-dom'
import { nextClickCopy, riskCopy } from './workflowCockpitModel'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

const PANEL = {
  border: '1px solid #1a3a2a',
  borderRadius: '6px',
  background: '#031808',
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
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '34px',
  }
}

function stateTone(state) {
  if (state === 'yes') return '#00e676'
  if (state === 'no') return '#ff7a45'
  return '#8abf8a'
}

function StatusPill({ children, tone = '#00e676' }) {
  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontFamily: SANS_FONT, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

export function WorkflowBreadcrumbs({ zip, stepNumber }) {
  return (
    <nav aria-label="Workflow breadcrumbs" style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap', color: '#8abf8a', fontSize: '12px' }}>
      <Link to="/agenda#agenda" style={{ color: '#00e676', textDecoration: 'none' }}>Agenda</Link>
      <span>&gt;</span>
      <span>ZIP Launch {zip || 'unknown'}</span>
      <span>&gt;</span>
      <span>Step {stepNumber || '?'}</span>
    </nav>
  )
}

export function OrientationLine({ run, task, sourceState }) {
  const risk = riskCopy(task?.risk)
  const zip = sourceState?.zip || run?.linked_entities?.zip || 'unknown'
  return (
    <section style={{ ...PANEL, padding: '16px', display: 'grid', gap: '10px', borderColor: risk.tone }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '6px' }}>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>5 second orientation</div>
          <h1 style={{ margin: 0, color: '#e0ffe0', fontSize: '24px', letterSpacing: 0 }}>
            ZIP {zip}: {task?.title || run?.workflow_title || 'Workflow run'}
          </h1>
          <div style={{ color: '#8abf8a', fontSize: '13px', lineHeight: 1.45 }}>
            ZIP Launch {zip} | Step {task?.stepNumber || '?'} of {task?.stepCount || run?.steps?.length || '?'} | {task?.title || task?.step?.step_id || 'No current step'} | {risk.label}
          </div>
          <div style={{ color: '#4a7a5a', fontSize: '12px', lineHeight: 1.45 }}>
            {run?.status || 'unknown'} | {task?.step?.step_id || 'no current step'} | {task?.step?.kind || 'unknown kind'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <StatusPill tone={risk.tone}>{risk.label}</StatusPill>
          <StatusPill tone="#4da3ff">{run?.run_id || 'no run id'}</StatusPill>
        </div>
      </div>
      <div style={{ color: risk.tone, fontSize: '12px', lineHeight: 1.45 }}>
        {risk.detail}
      </div>
    </section>
  )
}

export function CarlosTaskCard({
  task,
  notes,
  onNotesChange,
  onPrimary,
  onDecision,
  loading,
}) {
  const risk = riskCopy(task?.risk)
  const disabled = Boolean(loading || task?.disabledReason || task?.actionType === 'none')
  return (
    <section style={{ ...PANEL, padding: '16px', display: 'grid', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Carlos task</div>
          <h2 style={{ color: '#e0ffe0', margin: '6px 0 0 0', fontSize: '20px', letterSpacing: 0 }}>{task?.title || 'No current task'}</h2>
          <p style={{ color: '#8abf8a', margin: '7px 0 0 0', fontSize: '13px', lineHeight: 1.45 }}>{task?.subtitle || 'Refresh the run to load the current task.'}</p>
        </div>
        <StatusPill tone={risk.tone}>{risk.label}</StatusPill>
      </div>

      {task?.handoffSummary && (
        <div role="status" style={{ border: '1px solid #4da3ff', borderRadius: '5px', color: '#b9dcff', background: '#061525', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
          {task.handoffSummary}
        </div>
      )}

      {task?.disabledReason && (
        <div role="status" style={{ border: '1px solid #ffd54f', borderRadius: '5px', color: '#ffe58a', background: '#1f1a05', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
          {task.disabledReason}
        </div>
      )}

      <label style={{ display: 'grid', gap: '6px' }}>
        <span style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Operator notes</span>
        <textarea
          value={notes}
          onChange={event => onNotesChange(event.target.value)}
          placeholder="Optional note for this step"
          style={{ minHeight: '64px', resize: 'vertical', background: '#021a0e', color: '#e0ffe0', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px', fontSize: '12px', fontFamily: MONO_FONT }}
        />
      </label>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onPrimary} disabled={disabled} style={buttonStyle({ filled: true, tone: risk.tone, disabled })}>
          {loading ? 'Working...' : task?.primaryLabel || 'Refresh'}
        </button>
        {task?.actionType === 'decision' && (
          <>
            <button type="button" onClick={() => onDecision('changes_requested')} disabled={Boolean(loading)} style={buttonStyle({ tone: '#ffd54f', disabled: Boolean(loading) })}>
              Request changes
            </button>
            <button type="button" onClick={() => onDecision('blocked')} disabled={Boolean(loading)} style={buttonStyle({ tone: '#ff4444', disabled: Boolean(loading) })}>
              Block
            </button>
          </>
        )}
        {task?.step?.step_id === 'approve_page_anchor_in_draft_review' && (
          <Link to="/agenda#drafts" style={buttonStyle({ tone: '#4da3ff' })}>
            Open Draft Review
          </Link>
        )}
      </div>
    </section>
  )
}

export function NextClickPanel({ task }) {
  const copy = nextClickCopy(task)
  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '12px' }}>
      <article style={{ ...PANEL, padding: '14px', display: 'grid', gap: '8px' }}>
        <h3 style={{ margin: 0, color: '#00e676', fontSize: '15px', letterSpacing: 0 }}>Next Click Will</h3>
        {copy.will.map(item => <div key={item} style={{ color: '#c8f7c8', fontSize: '12px', lineHeight: 1.45 }}>{item}</div>)}
      </article>
      <article style={{ ...PANEL, padding: '14px', display: 'grid', gap: '8px' }}>
        <h3 style={{ margin: 0, color: '#ffb3b3', fontSize: '15px', letterSpacing: 0 }}>Next Click Will Not</h3>
        {copy.willNot.map(item => <div key={item} style={{ color: '#ffc8c8', fontSize: '12px', lineHeight: 1.45 }}>{item}</div>)}
      </article>
    </section>
  )
}

export function EvidencePanel({ rows }) {
  return (
    <section style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
      <div>
        <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Evidence</div>
        <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>External evidence and workflow state are separate</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '10px' }}>
        {rows.map(row => (
          <article key={row.id} style={{ border: `1px solid ${stateTone(row.state)}`, borderRadius: '5px', background: '#021a0e', padding: '12px', display: 'grid', gap: '7px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'start' }}>
              <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>{row.label}</div>
              <StatusPill tone={stateTone(row.state)}>{row.state}</StatusPill>
            </div>
            <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>{row.value}</div>
            <div style={{ color: '#4a7a5a', fontSize: '10px', lineHeight: 1.35 }}>Source: {row.source}</div>
            {row.detail && <div style={{ color: '#ffd54f', fontSize: '10px', lineHeight: 1.35, wordBreak: 'break-all' }}>{row.detail}</div>}
          </article>
        ))}
      </div>
    </section>
  )
}

export function SourceFreshnessPanel({ sourceState, onRefresh, loading }) {
  const loaded = sourceState?.lastLoadedAt ? new Date(sourceState.lastLoadedAt).toLocaleString() : 'Not loaded'
  const metrics = [
    ['Last refresh', loaded],
    ['Campaign rows for ZIP', sourceState?.campaignCount ?? 0],
    ['Share outcome rows', sourceState?.shareOutcomeCount ?? 0],
    ['Page freshness', sourceState?.pageFreshnessLabel || 'unknown'],
    ['Freshness source', sourceState?.pageFreshnessSource || 'not exposed'],
    ['Browser tasks', sourceState?.browserTasksSource || 'not integrated in V1'],
    ['Run discovery', sourceState?.runDiscoverySource || 'exact run id required'],
    ['History access', sourceState?.historicalAccessSource || 'exact run id required'],
  ]
  return (
    <section style={{ ...PANEL, padding: '16px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dashboard cache state</div>
          <h2 style={{ color: '#e0ffe0', margin: '5px 0 0 0', fontSize: '18px', letterSpacing: 0 }}>Client-derived evidence needs refresh discipline</h2>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} style={buttonStyle({ filled: true, disabled: loading })}>
          {loading ? 'Refreshing...' : 'Refresh evidence'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '8px' }}>
        {metrics.map(([label, value]) => (
          <div key={label} style={{ border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px', background: '#021a0e' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            <div style={{ color: '#e0ffe0', marginTop: '5px', fontSize: '12px', fontFamily: MONO_FONT, wordBreak: 'break-word' }}>{String(value)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function TechnicalDetails({ run }) {
  return (
    <details style={{ ...PANEL, padding: '14px' }}>
      <summary style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Technical Details</summary>
      <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
        {(run?.steps || []).map((step, index) => (
          <article key={step.step_id} style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', gap: '10px', alignItems: 'start', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '10px', background: '#021a0e' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '999px', border: '1px solid #8abf8a', color: '#8abf8a', display: 'grid', placeItems: 'center', fontSize: '11px', fontFamily: MONO_FONT }}>{index + 1}</div>
            <div style={{ display: 'grid', gap: '4px' }}>
              <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>{step.title}</div>
              <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>{step.step_id} | {step.kind}</div>
              {step.detail && <div style={{ color: '#4a7a5a', fontSize: '11px', lineHeight: 1.35 }}>{step.detail}</div>}
            </div>
            <StatusPill tone={step.status === 'completed' ? '#00e676' : step.status === 'pending' ? '#8abf8a' : '#ffd54f'}>{step.status || 'unknown'}</StatusPill>
          </article>
        ))}
      </div>
    </details>
  )
}
