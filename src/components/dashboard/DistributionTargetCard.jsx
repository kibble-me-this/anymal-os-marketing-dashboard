import { useState } from 'react'
import { TARGET_STATUS_LABELS, canApproveTarget, targetStatus } from './distributionPlanRules'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

const STATUS_TONES = {
  queued: '#00e676',
  approved_for_attended_share: '#00e676',
  rejected_by_operator: '#ff4444',
  needs_operator_review: '#ffd54f',
}

function buttonStyle({ tone = '#00e676', filled = false, disabled = false } = {}) {
  return {
    padding: '7px 11px',
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

function pillStyle(tone) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    border: `1px solid ${tone}`,
    color: tone,
    background: '#0a2a1a',
    borderRadius: '999px',
    padding: '3px 8px',
    fontSize: '10px',
    fontFamily: SANS_FONT,
  }
}

function ChipList({ label, items, tone = '#8abf8a' }) {
  if (!items?.length) return null
  return (
    <div>
      <div style={{ color: '#4a7a5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px', fontFamily: SANS_FONT }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {items.map(item => (
          <span key={item} style={pillStyle(tone)}>{item}</span>
        ))}
      </div>
    </div>
  )
}

export default function DistributionTargetCard({
  plan,
  target,
  index,
  onUpdateTarget,
  onMarkDoNotPost,
  actionLoading,
}) {
  const [editing, setEditing] = useState(false)
  const [draftNote, setDraftNote] = useState(target.share_note || '')
  const status = targetStatus(target)
  const statusTone = STATUS_TONES[status] || '#8abf8a'
  const approval = canApproveTarget(plan, target)
  const loadingKey = `${plan.plan_id}:${index}`
  const busy = actionLoading === loadingKey

  const saveNote = async () => {
    await onUpdateTarget(plan.plan_id, index, { share_note: draftNote })
    setEditing(false)
  }

  return (
    <div style={{ border: `1px solid ${statusTone}`, borderRadius: '6px', background: '#021a0e', padding: '14px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#e0ffe0', fontSize: '15px', fontWeight: 700, marginBottom: '5px' }}>{target.group_name}</div>
          <a href={target.group_url} target="_blank" rel="noopener noreferrer" style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
            {target.group_url}
          </a>
        </div>
        <span style={pillStyle(statusTone)}>{TARGET_STATUS_LABELS[status] || status}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', fontSize: '11px', color: '#8abf8a' }}>
        <div><strong style={{ color: '#c0e0c0' }}>Identity:</strong> {target.recommended_posting_identity || target.posting_identity || 'carlos_personal'}</div>
        <div><strong style={{ color: '#c0e0c0' }}>Cooldown:</strong> {target.cooldown_status || 'none'}</div>
        <div><strong style={{ color: '#c0e0c0' }}>Content:</strong> {target.content_fit || 'unknown'}</div>
        <div><strong style={{ color: '#c0e0c0' }}>Image:</strong> {target.image_tolerance || 'unknown'}</div>
      </div>

      {editing ? (
        <div style={{ display: 'grid', gap: '8px' }}>
          <textarea
            value={draftNote}
            onChange={event => setDraftNote(event.target.value)}
            rows={4}
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #1a3a2a', background: '#031808', color: '#e0ffe0', padding: '10px', fontFamily: MONO_FONT, fontSize: '12px', lineHeight: 1.45 }}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" disabled={busy || !draftNote.trim()} onClick={saveNote} style={buttonStyle({ filled: true, disabled: busy || !draftNote.trim() })}>Save note</button>
            <button type="button" disabled={busy} onClick={() => { setDraftNote(target.share_note || ''); setEditing(false) }} style={buttonStyle({ disabled: busy })}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid #1a3a2a', borderRadius: '5px', padding: '10px', background: '#031808', color: '#c0e0c0', fontSize: '12px', lineHeight: 1.5, fontFamily: MONO_FONT, whiteSpace: 'pre-wrap' }}>
          {target.share_note || 'No share note'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <ChipList label="Reason codes" items={target.reason_codes || []} />
        <ChipList label="Risk flags" items={target.risk_flags || []} tone="#ffd54f" />
        {!approval.canApprove && <ChipList label="Approval blocks" items={approval.reasons} tone="#ff4444" />}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy || !approval.canApprove} onClick={() => onUpdateTarget(plan.plan_id, index, { status: 'approved_for_attended_share' })} style={buttonStyle({ filled: approval.canApprove, disabled: busy || !approval.canApprove })}>Approve</button>
        <button type="button" disabled={busy} onClick={() => onUpdateTarget(plan.plan_id, index, { status: 'rejected_by_operator' })} style={buttonStyle({ tone: '#ff4444', disabled: busy })}>Reject</button>
        <button type="button" disabled={busy} onClick={() => setEditing(true)} style={buttonStyle({ tone: '#4da3ff', disabled: busy })}>Edit note</button>
        <button type="button" disabled={busy} onClick={() => onMarkDoNotPost(plan, target, index)} style={buttonStyle({ tone: '#ffd54f', disabled: busy })}>Do not post</button>
      </div>
    </div>
  )
}
