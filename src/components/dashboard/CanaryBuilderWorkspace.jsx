import { HAS_MARKETING_ADMIN_KEY } from '../../config'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

function postedUrlForCampaign(campaign) {
  return campaign?.posted_url || campaign?.facebook_post_url || campaign?.post_url || ''
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
}

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
  }
}

function smallButtonStyle({ filled = false, danger = false, disabled = false } = {}) {
  const color = danger ? '#ff4444' : '#00e676'
  return {
    padding: '7px 12px',
    background: filled && !disabled ? color : 'transparent',
    color: filled && !disabled ? '#021a0e' : color,
    border: filled && !disabled ? 'none' : `1px solid ${disabled ? '#1a3a2a' : color}`,
    borderRadius: '4px',
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: SANS_FONT,
    fontWeight: filled ? 600 : 400,
    opacity: disabled ? 0.55 : 1,
  }
}

function fieldStyle() {
  return {
    width: '100%',
    background: '#031808',
    border: '1px solid #1a3a2a',
    borderRadius: '4px',
    padding: '8px 10px',
    color: '#e0ffe0',
    fontFamily: MONO_FONT,
    fontSize: '12px',
    outline: 'none',
  }
}

function fieldLabel(label) {
  return (
    <div style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4a7a5a', marginBottom: '6px', fontFamily: SANS_FONT }}>
      {label}
    </div>
  )
}

function statusColor(status) {
  if (['completed', 'submitted_visible_or_feed'].includes(status)) return '#00e676'
  if (['completed_with_failures', 'submitted_unverified', 'pending_admin_approval', 'running', 'approved_for_execution'].includes(status)) return '#ffd54f'
  if (['failed', 'filtered_or_rejected', 'blocked_join_required', 'blocked_permission', 'cancelled_by_operator', 'timed_out'].includes(status)) return '#ff4444'
  return '#4a7a5a'
}

function LaunchZipCanaryPanel({
  zipOptions,
  canaryZip,
  setCanaryZip,
  pageAnchors,
  selectedAnchorId,
  setSelectedAnchorId,
  selectedAnchor,
  targetGroups,
  onTargetGroupChange,
  onAddTargetGroup,
  onRemoveTargetGroup,
  onGenerateGroupCopy,
  onCreateJob,
  copyLoading,
  canaryCreating,
  canaryJobs,
  canaryLoading,
  onCancelJob,
  onResetJob,
  onMarkReviewed,
  canarySourceCampaign,
}) {
  const selectedAnchorUrl = postedUrlForCampaign(selectedAnchor)
  const anchorState = !selectedAnchor
    ? 'not published'
    : selectedAnchorUrl
      ? 'published'
      : 'missing URL'
  const anchorReady = anchorState === 'published'
  const readyGroups = targetGroups.filter(g => g.group_name && g.group_url && g.post_text && (g.utm_url ? g.post_text.includes(g.utm_url) : true))
  const createDisabled = !HAS_MARKETING_ADMIN_KEY || !anchorReady || readyGroups.length === 0 || canaryCreating

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e676', margin: '0 0 6px 0' }}>
            Launch ZIP Canary
          </h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={pillStyle(statusColor(anchorState))}>Page anchor: {anchorState}</span>
            {canarySourceCampaign && (
              <span style={pillStyle('#4a7a5a')}>Source: {canarySourceCampaign.campaign_id}</span>
            )}
            {!HAS_MARKETING_ADMIN_KEY && (
              <span style={pillStyle('#ff4444')}>Admin key missing</span>
            )}
          </div>
        </div>
        <button type="button" onClick={onCreateJob} disabled={createDisabled} style={smallButtonStyle({ filled: true, disabled: createDisabled })}>
          {canaryCreating ? 'Creating...' : 'Approve for Codex execution'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div>
          {fieldLabel('ZIP campaign package')}
          <div style={{ display: 'flex', gap: '8px' }}>
            <select value={canaryZip} onChange={(e) => setCanaryZip(e.target.value)} style={fieldStyle()}>
              {zipOptions.map(zip => <option key={zip} value={zip}>{zip}</option>)}
            </select>
            <input value={canaryZip} onChange={(e) => setCanaryZip(e.target.value.replace(/\D/g, '').slice(0, 5))} style={{ ...fieldStyle(), width: '90px' }} />
          </div>
        </div>
        <div>
          {fieldLabel('Page anchor')}
          <select value={selectedAnchorId} onChange={(e) => setSelectedAnchorId(e.target.value)} style={fieldStyle()}>
            <option value="">No published Page anchor found</option>
            {pageAnchors.map(c => (
              <option key={c.campaign_id} value={c.campaign_id}>
                {c.campaign_id} {postedUrlForCampaign(c) ? '' : '(missing URL)'}
              </option>
            ))}
          </select>
          {selectedAnchorUrl && (
            <a href={selectedAnchorUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '6px', color: '#1877F2', fontSize: '11px', fontFamily: MONO_FONT, textDecoration: 'none' }}>
              {selectedAnchorUrl}
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e676', margin: 0 }}>
          Target groups ({targetGroups.length})
        </h3>
        <button type="button" onClick={onAddTargetGroup} style={smallButtonStyle()}>
          Add group
        </button>
      </div>

      {targetGroups.map((group, index) => {
        const loading = copyLoading === index
        return (
          <div key={index} style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px', marginBottom: '10px', background: '#021a0e' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div>
                {fieldLabel('Group name')}
                <input value={group.group_name} onChange={(e) => onTargetGroupChange(index, 'group_name', e.target.value)} style={fieldStyle()} />
              </div>
              <div>
                {fieldLabel('Group URL')}
                <input value={group.group_url} onChange={(e) => onTargetGroupChange(index, 'group_url', e.target.value)} style={fieldStyle()} />
              </div>
              <div>
                {fieldLabel('Privacy')}
                <select value={group.public_private} onChange={(e) => onTargetGroupChange(index, 'public_private', e.target.value)} style={fieldStyle()}>
                  <option value="unknown">unknown</option>
                  <option value="public">public</option>
                  <option value="private">private</option>
                </select>
              </div>
              <div>
                {fieldLabel('Members')}
                <input value={group.member_count} onChange={(e) => onTargetGroupChange(index, 'member_count', e.target.value)} style={fieldStyle()} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div>
                {fieldLabel('Group focus')}
                <input value={group.group_focus} onChange={(e) => onTargetGroupChange(index, 'group_focus', e.target.value)} style={fieldStyle()} />
              </div>
              <div>
                {fieldLabel('Member band')}
                <select value={group.member_count_band} onChange={(e) => onTargetGroupChange(index, 'member_count_band', e.target.value)} style={fieldStyle()}>
                  <option value="unknown">unknown</option>
                  <option value="under_1k">under 1k</option>
                  <option value="1k_to_10k">1k to 10k</option>
                  <option value="10k_plus">10k plus</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div>
                {fieldLabel('UTM content')}
                <input value={group.utm_content} onChange={(e) => onTargetGroupChange(index, 'utm_content', e.target.value)} style={fieldStyle()} />
              </div>
              <div>
                {fieldLabel('UTM URL')}
                <input value={group.utm_url} onChange={(e) => onTargetGroupChange(index, 'utm_url', e.target.value)} style={fieldStyle()} />
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              {fieldLabel('Approved group post text')}
              <textarea value={group.post_text} onChange={(e) => onTargetGroupChange(index, 'post_text', e.target.value)} rows={5} style={{ ...fieldStyle(), resize: 'vertical', lineHeight: 1.5 }} />
            </div>

            {group.risk_notes?.length > 0 && (
              <div style={{ color: '#ffd54f', fontSize: '11px', marginBottom: '10px' }}>
                {group.risk_notes.join(' | ')}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => onGenerateGroupCopy(index)} disabled={loading || !HAS_MARKETING_ADMIN_KEY} style={smallButtonStyle({ disabled: loading || !HAS_MARKETING_ADMIN_KEY })}>
                {loading ? 'Generating...' : 'Generate copy'}
              </button>
              <button type="button" onClick={() => onRemoveTargetGroup(index)} disabled={targetGroups.length === 1} style={smallButtonStyle({ danger: true, disabled: targetGroups.length === 1 })}>
                Remove
              </button>
              {group.remove_link_preview && <span style={pillStyle('#4a7a5a')}>remove link preview</span>}
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: '16px' }}>
        <h3 style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00e676', margin: '0 0 10px 0' }}>
          Canary jobs {canaryLoading ? '(loading)' : `(${canaryJobs.length})`}
        </h3>
        {canaryJobs.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#4a7a5a', margin: 0 }}>No canary jobs loaded.</p>
        ) : (
          canaryJobs.map(job => (
            <div key={job.job_id} style={{ border: '1px solid #1a3a2a', borderRadius: '6px', padding: '12px', marginBottom: '10px', background: '#031808' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <div>
                  <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 600 }}>{job.job_id}</div>
                  <div style={{ color: '#4a7a5a', fontSize: '11px', marginTop: '2px' }}>
                    ZIP {job.zip} | {formatDate(job.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={pillStyle(statusColor(job.status))}>{job.status}{job.is_stale ? ' stale' : ''}</span>
                  {['approved_for_execution', 'running'].includes(job.status) && (
                    <button type="button" onClick={() => onCancelJob(job.job_id)} style={smallButtonStyle({ danger: true })}>Cancel</button>
                  )}
                  {(job.status === 'timed_out' || job.is_stale) && (
                    <button type="button" onClick={() => onResetJob(job.job_id)} style={smallButtonStyle()}>Reset</button>
                  )}
                </div>
              </div>

              {(job.target_groups || []).map(group => (
                <div key={group.group_id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', padding: '8px 0', borderTop: '1px solid #0a2a1a' }}>
                  <div>
                    <div style={{ color: '#c0e0c0', fontSize: '12px' }}>{group.group_name}</div>
                    <div style={{ color: '#4a7a5a', fontSize: '10px', wordBreak: 'break-all' }}>
                      {group.group_url}
                    </div>
                    {group.notes && <div style={{ color: '#4a7a5a', fontSize: '10px', marginTop: '4px' }}>{group.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={pillStyle(statusColor(group.status))}>{group.status}</span>
                    {group.status === 'submitted_unverified' && (
                      <button type="button" onClick={() => onMarkReviewed(job, group)} style={smallButtonStyle()}>Reviewed</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function CanaryBuilderWorkspace(props) {
  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '8px', background: '#021a0e', overflow: 'hidden' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #1a3a2a' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4a7a5a', marginBottom: '6px', fontFamily: SANS_FONT }}>
          Turn a Page anchor into attended group distribution
        </div>
        <h2 style={{ fontSize: '15px', color: '#e0ffe0', margin: 0, fontWeight: 700 }}>
          Canary builder workspace
        </h2>
      </div>
      <div style={{ padding: '16px' }}>
        <LaunchZipCanaryPanel {...props} />
      </div>
    </section>
  )
}
