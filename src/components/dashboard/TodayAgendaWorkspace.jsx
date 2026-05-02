import { useMemo, useState } from 'react'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

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

function EmptyState({ message }) {
  return (
    <div style={{ border: '1px dashed #1a3a2a', borderRadius: '6px', padding: '28px', textAlign: 'center', color: '#4a7a5a', background: '#031808', fontSize: '12px' }}>
      {message}
    </div>
  )
}

function statusTone(status) {
  if (status === 'completed') return '#00e676'
  if (status === 'blocked' || status === 'changes_requested') return '#ff4444'
  if (status === 'waiting_for_carlos' || status === 'needs_carlos') return '#ffd54f'
  if (status === 'running') return '#4da3ff'
  return '#8abf8a'
}

function formatEntityList(entities) {
  return Object.entries(entities || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 8)
}

function ReadinessList({ title, checks }) {
  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '12px', display: 'grid', gap: '8px' }}>
      <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>{title}</div>
      {(checks || []).map(check => (
        <div key={`${check.check}:${check.status}`} style={{ display: 'grid', gap: '4px', borderTop: '1px solid #0d281a', paddingTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>{check.check}</span>
            <StatusPill tone={statusTone(check.status)}>{check.status}</StatusPill>
          </div>
          <div style={{ color: '#4a7a5a', fontSize: '11px', lineHeight: 1.35 }}>{check.detail}</div>
        </div>
      ))}
      {!checks?.length && <div style={{ color: '#4a7a5a', fontSize: '12px' }}>No checks reported.</div>}
    </section>
  )
}

function WorkflowStepList({ steps = [], currentStepId }) {
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {steps.map((step, index) => {
        const active = currentStepId && step.step_id === currentStepId
        const tone = active ? '#ffd54f' : statusTone(step.status)
        return (
          <div key={step.step_id} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: '10px', alignItems: 'start', border: `1px solid ${active ? '#ffd54f' : '#1a3a2a'}`, borderRadius: '6px', background: '#031808', padding: '10px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '999px', border: `1px solid ${tone}`, color: tone, display: 'grid', placeItems: 'center', fontSize: '11px', fontFamily: MONO_FONT }}>
              {index + 1}
            </div>
            <div style={{ display: 'grid', gap: '4px' }}>
              <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>{step.title}</div>
              <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>
                {step.step_id} | {step.kind}
              </div>
              {step.detail && <div style={{ color: '#4a7a5a', fontSize: '11px' }}>{step.detail}</div>}
              {step.operator_notes && <div style={{ color: '#ffd54f', fontSize: '11px' }}>{step.operator_notes}</div>}
            </div>
            <StatusPill tone={tone}>{active ? 'current' : step.status || 'pending'}</StatusPill>
          </div>
        )
      })}
    </div>
  )
}

function AgendaItemCard({ item, active, onSelect }) {
  const tone = active ? '#00e676' : statusTone(item.status)
  return (
    <button
      type="button"
      onClick={() => onSelect(item.agenda_item_id)}
      style={{
        textAlign: 'left',
        border: `1px solid ${active ? '#00e676' : '#1a3a2a'}`,
        borderRadius: '6px',
        background: active ? '#062010' : '#031808',
        padding: '12px',
        display: 'grid',
        gap: '8px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start' }}>
        <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700, lineHeight: 1.25 }}>{item.workflow_title}</div>
        <StatusPill tone={tone}>{item.priority_score}</StatusPill>
      </div>
      <div style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT }}>{item.workflow_type}</div>
      <div style={{ color: '#4a7a5a', fontSize: '12px', lineHeight: 1.35 }}>{item.why_today}</div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <StatusPill tone={statusTone(item.status)}>{item.status}</StatusPill>
        {item.active_run_id && <StatusPill tone="#4da3ff">run active</StatusPill>}
      </div>
    </button>
  )
}

function RunControls({
  run,
  activeGate,
  onRunNextStep,
  onRecordDecision,
  actionLoading,
}) {
  const [notes, setNotes] = useState('')
  const stepId = activeGate?.step_id || run?.current_step_id || ''
  const isLoading = actionLoading === `run:${run?.run_id}` || actionLoading === `decision:${run?.run_id}`

  if (!run) return null

  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#021a0e', padding: '14px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Active workflow run</div>
          <h3 style={{ color: '#e0ffe0', fontSize: '16px', margin: '5px 0 0 0', letterSpacing: 0 }}>{run.workflow_title}</h3>
          <div style={{ color: '#8abf8a', fontSize: '11px', marginTop: '5px', fontFamily: MONO_FONT }}>{run.run_id}</div>
        </div>
        <StatusPill tone={statusTone(run.status)}>{run.status}</StatusPill>
      </div>

      {activeGate && (
        <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', padding: '12px', color: '#ffd54f', display: 'grid', gap: '6px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>{activeGate.title}</div>
          <div style={{ color: '#ffe9a6', fontSize: '12px', lineHeight: 1.4 }}>{activeGate.message}</div>
        </div>
      )}

      <textarea
        value={notes}
        onChange={event => setNotes(event.target.value)}
        placeholder="Operator notes or blocking reason"
        style={{ width: '100%', minHeight: '64px', boxSizing: 'border-box', background: '#031808', color: '#e0ffe0', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '9px', fontSize: '12px', fontFamily: MONO_FONT }}
      />
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onRunNextStep(run.run_id)} disabled={isLoading || run.status !== 'running'} style={buttonStyle({ disabled: isLoading || run.status !== 'running' })}>
          Run safe next step
        </button>
        <button type="button" onClick={() => onRecordDecision(run.run_id, stepId, 'approved', notes)} disabled={isLoading || !stepId} style={buttonStyle({ filled: true, disabled: isLoading || !stepId })}>
          Approve gate
        </button>
        <button type="button" onClick={() => onRecordDecision(run.run_id, stepId, 'completed', notes)} disabled={isLoading || !stepId} style={buttonStyle({ disabled: isLoading || !stepId })}>
          Mark done
        </button>
        <button type="button" onClick={() => onRecordDecision(run.run_id, stepId, 'changes_requested', notes)} disabled={isLoading || !stepId} style={buttonStyle({ tone: '#ffd54f', disabled: isLoading || !stepId })}>
          Changes
        </button>
        <button type="button" onClick={() => onRecordDecision(run.run_id, stepId, 'blocked', notes)} disabled={isLoading || !stepId} style={buttonStyle({ tone: '#ff4444', disabled: isLoading || !stepId })}>
          Block
        </button>
      </div>
    </section>
  )
}

export default function TodayAgendaWorkspace({
  agenda,
  agendaLoading,
  agendaRuns,
  hasAdminKey,
  onComposeAgenda,
  onApproveItem,
  onLoadRun,
  onRunNextStep,
  onRecordDecision,
  actionLoading,
}) {
  const items = useMemo(() => agenda?.items || [], [agenda])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [activationZip, setActivationZip] = useState('')
  const selectedItem = useMemo(() => (
    items.find(item => item.agenda_item_id === selectedItemId)
    || items.find(item => item.agenda_item_id === agenda?.primary_item_id)
    || items[0]
    || null
  ), [agenda?.primary_item_id, items, selectedItemId])
  const activeRunId = selectedItem?.active_run_id
  const activeRun = activeRunId ? agendaRuns[activeRunId] : null
  const activeGate = activeRun?.attended_gate || null
  const canGo = Boolean(hasAdminKey && selectedItem && selectedItem.status !== 'completed')
  const isApproving = selectedItem && actionLoading === `approve:${selectedItem.agenda_item_id}`
  const normalizedActivationZip = activationZip.trim()
  const activationZipValid = /^\d{5}$/.test(normalizedActivationZip)
  const activationLoading = actionLoading === 'compose:zip'

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '16px', display: 'grid', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px', alignItems: 'start' }}>
          <div>
            <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Today marketing agenda</div>
            <h2 style={{ color: '#e0ffe0', margin: '6px 0 8px 0', fontSize: '22px', letterSpacing: 0 }}>
              {agenda?.summary?.executive_message || 'Choose one workflow and let the system prepare the chain.'}
            </h2>
            <p style={{ color: '#8abf8a', margin: 0, fontSize: '13px', lineHeight: 1.45, maxWidth: '920px' }}>
              Research-informed workflow recommendations stay at the executive layer: approve go/no-go here, then drill into assets only when you want lower-layer control.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onComposeAgenda(false)} disabled={!hasAdminKey || agendaLoading || actionLoading === 'compose'} style={buttonStyle({ disabled: !hasAdminKey || agendaLoading || actionLoading === 'compose' })}>
              {agendaLoading ? 'Loading...' : 'Load agenda'}
            </button>
            <button type="button" onClick={() => onComposeAgenda(true)} disabled={!hasAdminKey || actionLoading === 'compose'} style={buttonStyle({ filled: true, disabled: !hasAdminKey || actionLoading === 'compose' })}>
              Compose fresh
            </button>
          </div>
        </div>

        <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#021a0e', padding: '12px', display: 'grid', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: '10px', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: '6px' }}>
              <span style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Activate ZIP</span>
              <input
                value={activationZip}
                onChange={event => setActivationZip(event.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="74105"
                inputMode="numeric"
                style={{ width: '100%', boxSizing: 'border-box', background: '#031808', color: '#e0ffe0', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '10px', fontSize: '13px', fontFamily: MONO_FONT }}
              />
            </label>
            <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.4 }}>
              Compose a ZIP price-intelligence launch workflow. Go verifies the live price page and generates the launch package, then stops for Carlos before Page approval or personal-account sharing.
            </div>
            <button
              type="button"
              onClick={() => onComposeAgenda(true, {
                include_workflow_types: ['zip_price_activation'],
                candidate_zips: [normalizedActivationZip],
                zip_activation_limit: 1,
                operator_notes: `Carlos requested ZIP activation for ${normalizedActivationZip}.`,
                loadingKey: 'compose:zip',
              })}
              disabled={!hasAdminKey || !activationZipValid || activationLoading}
              style={buttonStyle({ filled: true, disabled: !hasAdminKey || !activationZipValid || activationLoading })}
            >
              {activationLoading ? 'Composing...' : 'Compose ZIP workflow'}
            </button>
            <button
              type="button"
              onClick={() => onComposeAgenda(true, {
                include_workflow_types: ['zip_price_activation'],
                zip_activation_limit: 1,
                operator_notes: 'Carlos requested the next eligible ZIP activation.',
                loadingKey: 'compose:zip',
              })}
              disabled={!hasAdminKey || activationLoading}
              style={buttonStyle({ disabled: !hasAdminKey || activationLoading })}
            >
              Find next ZIP
            </button>
          </div>
          {activationZip && !activationZipValid && (
            <div style={{ color: '#ffd54f', fontSize: '11px' }}>Enter a 5 digit ZIP before composing this workflow.</div>
          )}
        </section>

        {!hasAdminKey && (
          <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', color: '#ffd54f', padding: '10px', fontSize: '12px' }}>
            Agenda actions require the admin key in the Vercel preview environment.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
          <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Items</div>
            <div style={{ color: '#00e676', fontSize: '26px', fontWeight: 700 }}>{items.length}</div>
          </div>
          <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Learning</div>
            <div style={{ color: '#8abf8a', fontSize: '13px', fontWeight: 700, marginTop: '10px' }}>{agenda?.research_summary?.learning_status || 'not loaded'}</div>
          </div>
          <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px' }}>
            <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Primary</div>
            <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700, marginTop: '10px' }}>{selectedItem?.workflow_type || 'none'}</div>
          </div>
        </div>
      </section>

      {items.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) minmax(0, 1fr)', gap: '14px', alignItems: 'start' }}>
          <aside style={{ display: 'grid', gap: '10px' }}>
            {items.map(item => (
              <AgendaItemCard
                key={item.agenda_item_id}
                item={item}
                active={selectedItem?.agenda_item_id === item.agenda_item_id}
                onSelect={setSelectedItemId}
              />
            ))}
          </aside>

          <main style={{ display: 'grid', gap: '14px' }}>
            {selectedItem && (
              <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '16px', display: 'grid', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>Executive go/no-go</div>
                    <h3 style={{ color: '#e0ffe0', margin: '6px 0 8px 0', fontSize: '20px', letterSpacing: 0 }}>{selectedItem.workflow_title}</h3>
                    <p style={{ color: '#8abf8a', margin: 0, fontSize: '13px', lineHeight: 1.45 }}>{selectedItem.why_today}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {selectedItem.active_run_id && !activeRun && (
                      <button type="button" onClick={() => onLoadRun(selectedItem.active_run_id)} disabled={actionLoading === `load:${selectedItem.active_run_id}`} style={buttonStyle({ disabled: actionLoading === `load:${selectedItem.active_run_id}` })}>
                        Load run
                      </button>
                    )}
                    <button type="button" onClick={() => onApproveItem(selectedItem)} disabled={!canGo || isApproving} style={buttonStyle({ filled: true, disabled: !canGo || isApproving })}>
                      {isApproving ? 'Starting...' : 'Go'}
                    </button>
                  </div>
                </div>

                <div style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.45 }}>
                  {selectedItem.research_summary}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '10px' }}>
                  <ReadinessList title="Readiness checks" checks={selectedItem.readiness_checks} />
                  <ReadinessList title="Facebook safety checks" checks={selectedItem.facebook_safety_checks} />
                </div>

                <section style={{ display: 'grid', gap: '10px' }}>
                  <div style={{ color: '#e0ffe0', fontSize: '14px', fontWeight: 700 }}>Execution chain</div>
                  <WorkflowStepList steps={activeRun?.steps || selectedItem.expected_steps} currentStepId={activeRun?.current_step_id} />
                </section>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '10px' }}>
                  <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px', display: 'grid', gap: '6px' }}>
                    <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>Lower-layer links</div>
                    {formatEntityList(selectedItem.linked_entities).map(([key, value]) => (
                      <div key={key} style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>{key}: {String(value)}</div>
                    ))}
                  </section>
                  <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px', display: 'grid', gap: '6px' }}>
                    <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>Required approvals</div>
                    {(selectedItem.required_approvals || []).map(text => (
                      <div key={text} style={{ color: '#8abf8a', fontSize: '12px', lineHeight: 1.35 }}>{text}</div>
                    ))}
                  </section>
                </div>
              </section>
            )}

            {activeRun && (
              <RunControls
                run={activeRun}
                activeGate={activeGate}
                onRunNextStep={onRunNextStep}
                onRecordDecision={onRecordDecision}
                actionLoading={actionLoading}
              />
            )}
          </main>
        </div>
      ) : (
        <EmptyState message={agendaLoading ? 'Loading agenda...' : 'No agenda items yet. Compose today to pull research and readiness signals.'} />
      )}
    </div>
  )
}
