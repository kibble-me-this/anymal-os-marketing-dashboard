import { dashboardFonts, runnerTone } from './workflowControlStyles'

const SANS_FONT = dashboardFonts.sans

export function StatusPill({ children, tone = '#00e676' }) {
  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontFamily: SANS_FONT, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

export function DestinationConfirmCheckbox({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', gap: '8px', alignItems: 'start', color: '#ffe58a', background: '#1f1a05', border: '1px solid #ffd54f', borderRadius: '5px', padding: '10px', fontSize: '12px', lineHeight: 1.45 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange?.(event.target.checked)}
        style={{ marginTop: '2px' }}
      />
      <span>{label}</span>
    </label>
  )
}

export function RunnerAvailabilityIndicator({ runner }) {
  if (!runner) return null
  const tone = runnerTone(runner.state)
  return (
    <div role="status" style={{ border: `1px solid ${tone}`, borderRadius: '5px', color: tone, background: runner.state === 'red' ? '#260707' : '#021a0e', padding: '10px', display: 'flex', gap: '8px', alignItems: 'start', fontSize: '12px', lineHeight: 1.45 }}>
      <span aria-hidden="true" style={{ width: '9px', height: '9px', borderRadius: '999px', background: tone, display: 'inline-block', marginTop: '4px', flex: '0 0 auto' }} />
      <span>
        <strong>{runner.label}</strong>
        {runner.detail ? `: ${runner.detail}` : ''}
      </span>
    </div>
  )
}
