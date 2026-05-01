import { useState } from 'react'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

const STATUS_LABELS = {
  queued: 'Queued',
  approved_for_attended_share: 'Approved',
  running: 'Running',
  submitted_visible_or_feed: 'Visible',
  pending_admin_approval: 'Pending approval',
  submitted_not_found: 'Not found',
  blocked_join_required: 'Join required',
  blocked_identity_mismatch: 'Identity mismatch',
  blocked_posting_restricted: 'Posting restricted',
  blocked_group_rules: 'Group rules',
  failed_ui: 'UI failed',
  cancelled_by_operator: 'Cancelled',
  needs_manual_classification: 'Needs classification',
}

function statusTone(status) {
  if (['submitted_visible_or_feed', 'pending_admin_approval'].includes(status)) return '#00e676'
  if (String(status || '').startsWith('blocked_') || status === 'failed_ui') return '#ff4444'
  if (status === 'approved_for_attended_share' || status === 'running') return '#4da3ff'
  if (status === 'cancelled_by_operator' || status === 'needs_manual_classification') return '#ffd54f'
  return '#8abf8a'
}

function buttonStyle({ tone = '#00e676', filled = false, disabled = false } = {}) {
  return {
    padding: '7px 10px',
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

function fieldStyle() {
  return {
    width: '100%',
    boxSizing: 'border-box',
    background: '#021a0e',
    border: '1px solid #1a3a2a',
    borderRadius: '5px',
    color: '#e0ffe0',
    padding: '8px',
    fontSize: '12px',
    fontFamily: SANS_FONT,
  }
}

function shortDate(value) {
  if (!value) return 'No timestamp'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function ShareOutcomeCard({ outcome, onUpdateOutcome, actionLoading }) {
  const [facebookShareUrl, setFacebookShareUrl] = useState(outcome.facebook_share_url || '')
  const [operatorNotes, setOperatorNotes] = useState(outcome.operator_notes || '')
  const loading = actionLoading === outcome.share_outcome_id
  const tone = statusTone(outcome.status)

  const updateStatus = (status, statusReason) => onUpdateOutcome(outcome.share_outcome_id, {
    status,
    status_reason: statusReason,
    facebook_share_url: facebookShareUrl || null,
    operator_notes: operatorNotes || null,
  })

  return (
    <article style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '14px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <h3 style={{ margin: 0, color: '#e0ffe0', fontSize: '16px', letterSpacing: 0 }}>{outcome.group_name || 'Unknown group'}</h3>
          <div style={{ color: '#8abf8a', fontSize: '11px', marginTop: '5px' }}>
            {outcome.zip || 'ZIP'} | {outcome.posting_identity || 'identity'} | {outcome.campaign_id || 'campaign'}
          </div>
        </div>
        <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: '999px', padding: '4px 8px', fontSize: '10px', fontFamily: SANS_FONT, whiteSpace: 'nowrap' }}>
          {STATUS_LABELS[outcome.status] || outcome.status || 'Unknown'}
        </span>
      </div>

      <div style={{ display: 'grid', gap: '6px' }}>
        {outcome.group_url && (
          <a href={outcome.group_url} target="_blank" rel="noopener noreferrer" style={{ color: '#8abf8a', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
            {outcome.group_url}
          </a>
        )}
        {outcome.page_anchor_post_url && (
          <a href={outcome.page_anchor_post_url} target="_blank" rel="noopener noreferrer" style={{ color: '#4da3ff', fontSize: '11px', fontFamily: MONO_FONT, wordBreak: 'break-all' }}>
            {outcome.page_anchor_post_url}
          </a>
        )}
      </div>

      <div style={{ color: '#e0ffe0', fontSize: '13px', lineHeight: 1.45, borderLeft: '3px solid #1a3a2a', paddingLeft: '10px' }}>
        {outcome.share_note_used || 'No share note recorded.'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
        <label style={{ display: 'grid', gap: '5px', color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>
          Evidence URL
          <input value={facebookShareUrl} onChange={event => setFacebookShareUrl(event.target.value)} style={fieldStyle()} />
        </label>
        <label style={{ display: 'grid', gap: '5px', color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>
          Operator notes
          <input value={operatorNotes} onChange={event => setOperatorNotes(event.target.value)} style={fieldStyle()} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" disabled={loading} onClick={() => updateStatus('submitted_visible_or_feed', 'operator_verified_visible')} style={buttonStyle({ filled: true, disabled: loading })}>
          Mark visible
        </button>
        <button type="button" disabled={loading} onClick={() => updateStatus('pending_admin_approval', 'operator_verified_pending')} style={buttonStyle({ disabled: loading })}>
          Mark pending
        </button>
        <button type="button" disabled={loading} onClick={() => updateStatus('blocked_group_rules', 'operator_reported_group_rules')} style={buttonStyle({ tone: '#ff4444', disabled: loading })}>
          Mark blocked
        </button>
        <button type="button" disabled={loading} onClick={() => updateStatus('cancelled_by_operator', 'operator_cancelled')} style={buttonStyle({ tone: '#ffd54f', disabled: loading })}>
          Cancel
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', color: '#4a7a5a', fontSize: '11px' }}>
        <span>Created {shortDate(outcome.created_at)}</span>
        <span>Observed {shortDate(outcome.observed_at)}</span>
      </div>
    </article>
  )
}
