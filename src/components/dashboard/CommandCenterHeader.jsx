const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

function actionButtonStyle({ filled = false, disabled = false } = {}) {
  return {
    padding: '9px 14px',
    background: filled && !disabled ? '#00e676' : 'transparent',
    color: filled && !disabled ? '#021a0e' : '#00e676',
    border: filled && !disabled ? 'none' : '1px solid #00e676',
    borderRadius: '6px',
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: SANS_FONT,
    fontWeight: filled ? 700 : 500,
    opacity: disabled ? 0.6 : 1,
  }
}

export default function CommandCenterHeader({
  lastRefresh,
  countdown,
  onRefresh,
  onGenerate,
  generating,
}) {
  return (
    <header style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '18px', alignItems: 'start', marginBottom: '18px' }}>
      <div>
        <div style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4a7a5a', marginBottom: '7px', fontFamily: SANS_FONT }}>
          Marketing command center
        </div>
        <h1 style={{ fontSize: '28px', lineHeight: 1.05, letterSpacing: 0, margin: '0 0 8px 0', color: '#e0ffe0', fontWeight: 700 }}>
          Dashboard ops console
        </h1>
        <p style={{ fontSize: '13px', color: '#8abf8a', margin: 0, lineHeight: 1.45, maxWidth: '780px' }}>
          Review drafts, attach creative, approve Page anchors, prepare canary jobs, and check what shipped from one operator view.
        </p>
        <p style={{ fontSize: '11px', color: '#4a7a5a', margin: '8px 0 0 0', fontFamily: SANS_FONT }}>
          {lastRefresh ? `Last refresh: ${lastRefresh.toLocaleTimeString()}` : 'Loading...'} | Auto-refresh: {countdown}s
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onGenerate} disabled={generating} style={actionButtonStyle({ filled: true, disabled: generating })}>
          {generating ? 'Generating...' : 'Generate Drafts'}
        </button>
        <button type="button" onClick={onRefresh} style={actionButtonStyle()}>
          Refresh
        </button>
      </div>
    </header>
  )
}

function WorkspaceTab({ active, label, count, detail, tone = '#00e676', onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? '#00e676' : '#1a3a2a'}`,
        background: active ? '#00e676' : '#031808',
        color: active ? '#021a0e' : '#00e676',
        borderRadius: '6px',
        padding: '10px 14px',
        fontSize: '11px',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontFamily: SANS_FONT,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}
    >
      <span>{label}</span>
      <span style={{ minWidth: '22px', padding: '2px 6px', borderRadius: '999px', background: active ? '#021a0e' : '#0a2a1a', color: active ? '#00e676' : '#8abf8a', fontSize: '10px' }}>
        {count}
      </span>
      {detail && (
        <span style={{ color: active ? '#021a0e' : tone, fontSize: '10px', textTransform: 'none', letterSpacing: 0 }}>
          {detail}
        </span>
      )}
    </button>
  )
}

export function WorkspaceTabs({ tabs, activeWorkspace, onSelectWorkspace }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
      {tabs.map(tab => (
        <WorkspaceTab
          key={tab.id}
          active={activeWorkspace === tab.id}
          label={tab.label}
          count={tab.count}
          detail={tab.detail}
          tone={tab.tone}
          onClick={() => onSelectWorkspace(tab.id)}
        />
      ))}
    </div>
  )
}
