import { getNextBestAction } from './dashboardRules'

const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

function pillStyle(color = '#00e676') {
  return {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '10px',
    background: '#0a2a1a',
    color,
    border: `1px solid ${color}`,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontFamily: SANS_FONT,
  }
}

export default function NextBestActionPanel({ stats }) {
  const rule = getNextBestAction(stats)
  const message = rule.getMessage(stats)

  return (
    <div style={{ border: `1px solid ${message.tone}`, borderRadius: '8px', background: '#031808', padding: '16px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '14px', alignItems: 'center', marginBottom: '14px' }}>
      <div>
        <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: message.tone, marginBottom: '6px', fontFamily: SANS_FONT }}>
          Next best action
        </div>
        <div style={{ color: '#e0ffe0', fontSize: '16px', fontWeight: 700, marginBottom: '5px' }}>{message.title}</div>
        <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>{message.detail}</div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={pillStyle(message.tone)}>priority {rule.priority}</span>
        <span style={pillStyle('#4a7a5a')}>{rule.id}</span>
      </div>
    </div>
  )
}
