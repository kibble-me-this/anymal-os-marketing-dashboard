import { useMemo, useState } from 'react'

const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

const DEFAULT_PROMPT = 'Animate this Anymal OS dashboard screenshot into an 8 second native video. Use subtle cursor motion, crisp operator-tool pacing, dark green interface tones, neon green highlights, and realistic product demo movement. Preserve the source screenshot layout. Avoid fake metrics, fake testimonials, people, claims, or unreadable tiny text.'

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

function fieldStyle({ minHeight } = {}) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    background: '#021a0e',
    color: '#e0ffe0',
    border: '1px solid #1a3a2a',
    borderRadius: '5px',
    padding: '9px',
    fontSize: '12px',
    lineHeight: 1.45,
    fontFamily: minHeight ? MONO_FONT : SANS_FONT,
    minHeight,
  }
}

function labelStyle() {
  return {
    display: 'grid',
    gap: '6px',
    color: '#8abf8a',
    fontSize: '11px',
    fontFamily: SANS_FONT,
  }
}

function StatusPill({ children, tone = '#00e676' }) {
  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: '999px', padding: '3px 8px', fontSize: '10px', fontFamily: SANS_FONT }}>
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

function VideoJobCard({ job, onSyncJob, onReviewJob, actionLoading }) {
  const isSyncing = actionLoading === `sync:${job.video_job_id}`
  const isReviewing = actionLoading === `review:${job.video_job_id}`
  const canReview = job.status === 'completed' && job.video_url
  const statusTone = job.status === 'failed' ? '#ff4444' : job.status === 'completed' ? '#00e676' : '#4da3ff'
  const reviewTone = job.review_status === 'approved' ? '#00e676' : job.review_status === 'rejected' ? '#ff4444' : '#ffd54f'

  return (
    <article style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '14px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <div style={{ color: '#e0ffe0', fontSize: '15px', fontWeight: 700 }}>{job.title || job.video_job_id}</div>
          <div style={{ color: '#8abf8a', fontSize: '11px', marginTop: '5px', fontFamily: MONO_FONT }}>
            {job.video_job_id} | {job.zip || 'ZIP'} | {job.generation_mode || 'text_to_video'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <StatusPill tone={statusTone}>{job.status || 'unknown'}</StatusPill>
          <StatusPill tone={reviewTone}>{job.review_status || 'not reviewed'}</StatusPill>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '14px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '8px' }}>
          {job.video_url ? (
            <video
              src={job.video_url}
              controls
              style={{ width: '100%', aspectRatio: job.aspect_ratio === '9:16' ? '9 / 16' : '16 / 9', maxHeight: '420px', background: '#021a0e', border: '1px solid #1a3a2a', borderRadius: '5px' }}
            />
          ) : (
            <div style={{ aspectRatio: job.aspect_ratio === '9:16' ? '9 / 16' : '16 / 9', border: '1px dashed #1a3a2a', borderRadius: '5px', display: 'grid', placeItems: 'center', color: '#4a7a5a', fontSize: '12px' }}>
              No playable video yet
            </div>
          )}
          {job.video_url && (
            <a href={job.video_url} target="_blank" rel="noopener noreferrer" style={{ color: '#8abf8a', fontSize: '11px', wordBreak: 'break-all', fontFamily: MONO_FONT }}>
              {job.video_url}
            </a>
          )}
        </div>

        <div style={{ display: 'grid', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', color: '#8abf8a', fontSize: '11px' }}>
            <div>Model: {job.provider_model || 'n/a'}</div>
            <div>Duration: {job.duration_seconds || 0}s</div>
            <div>Aspect: {job.aspect_ratio || 'n/a'}</div>
            <div>Audio: {job.generate_audio ? 'on' : 'off'}</div>
          </div>
          {job.input_image_url && (
            <a href={job.input_image_url} target="_blank" rel="noopener noreferrer" style={{ color: '#00e676', fontSize: '11px', wordBreak: 'break-all', fontFamily: MONO_FONT }}>
              Reference image
            </a>
          )}
          <p style={{ margin: 0, color: '#e0ffe0', fontSize: '12px', lineHeight: 1.5 }}>
            {job.prompt || 'No prompt stored.'}
          </p>
          {job.error && (
            <div style={{ border: '1px solid #ff4444', borderRadius: '5px', background: '#2a0a0a', color: '#ff9999', padding: '10px', fontSize: '12px' }}>
              {typeof job.error === 'string' ? job.error : JSON.stringify(job.error)}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onSyncJob(job.video_job_id)} disabled={isSyncing} style={buttonStyle({ disabled: isSyncing })}>
              {isSyncing ? 'Syncing...' : 'Sync'}
            </button>
            <button type="button" onClick={() => onReviewJob(job.video_job_id, { review_status: 'approved', reviewed_by: 'carlos' })} disabled={!canReview || isReviewing} style={buttonStyle({ filled: true, disabled: !canReview || isReviewing })}>
              Approve
            </button>
            <button type="button" onClick={() => onReviewJob(job.video_job_id, { review_status: 'changes_requested', reviewed_by: 'carlos' })} disabled={!canReview || isReviewing} style={buttonStyle({ tone: '#ffd54f', disabled: !canReview || isReviewing })}>
              Changes
            </button>
            <button type="button" onClick={() => onReviewJob(job.video_job_id, { review_status: 'rejected', reviewed_by: 'carlos' })} disabled={!canReview || isReviewing} style={buttonStyle({ tone: '#ff4444', disabled: !canReview || isReviewing })}>
              Reject
            </button>
          </div>
          <div style={{ color: '#4a7a5a', fontSize: '11px', fontFamily: MONO_FONT }}>
            Created {job.created_at || 'n/a'} | Updated {job.updated_at || 'n/a'}
          </div>
        </div>
      </div>
    </article>
  )
}

export default function NativeVideoWorkspace({
  nativeVideoJobs,
  nativeVideoLoading,
  hasAdminKey,
  onCreateJob,
  onSyncJob,
  onReviewJob,
  actionLoading,
}) {
  const [form, setForm] = useState({
    campaign_id: '',
    zip: '74501',
    city: 'McAlester',
    county: 'Pittsburg County',
    state: 'OK',
    input_image_url: '',
    end_image_url: '',
    prompt: DEFAULT_PROMPT,
    duration_seconds: 8,
    aspect_ratio: 'auto',
    resolution: '720p',
    generate_audio: false,
    provider_mode: 'mock',
    confirm_live_provider_call: false,
  })

  const sortedJobs = useMemo(() => (
    [...nativeVideoJobs].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  ), [nativeVideoJobs])

  const canSubmit = Boolean(hasAdminKey
    && form.input_image_url.trim()
    && form.prompt.trim()
    && (form.provider_mode !== 'live' || form.confirm_live_provider_call))

  const updateForm = (field, value) => {
    setForm(current => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const zip = form.zip.trim()
    await onCreateJob({
      brief_type: 'dashboard_workflow_demo',
      campaign_id: form.campaign_id.trim() || undefined,
      zip,
      city: form.city.trim() || undefined,
      county: form.county.trim() || undefined,
      state: form.state.trim() || undefined,
      source_type: form.campaign_id.trim() ? 'campaign' : 'dashboard',
      source_id: form.campaign_id.trim() || `dashboard_native_video_${zip || 'local'}`,
      provider: 'fal_ai',
      provider_mode: form.provider_mode,
      prompt: form.prompt.trim(),
      input_image_url: form.input_image_url.trim(),
      end_image_url: form.end_image_url.trim() || undefined,
      resolution: form.resolution,
      duration_seconds: Number(form.duration_seconds),
      aspect_ratio: form.aspect_ratio,
      generate_audio: form.generate_audio,
      confirm_live_provider_call: form.provider_mode === 'live' && form.confirm_live_provider_call,
    })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '14px', alignItems: 'start' }}>
      <aside style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '14px' }}>
        <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', fontFamily: SANS_FONT }}>
          Native video
        </div>
        <h2 style={{ margin: '0 0 12px 0', color: '#e0ffe0', fontSize: '17px', letterSpacing: 0 }}>Image-to-video job</h2>
        {!hasAdminKey && (
          <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', color: '#ffd54f', padding: '10px', fontSize: '12px', marginBottom: '12px' }}>
            Native video actions require the admin key in the Vercel preview environment.
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '10px' }}>
          <label style={labelStyle()}>
            Reference image URL
            <input value={form.input_image_url} onChange={event => updateForm('input_image_url', event.target.value)} style={fieldStyle()} placeholder="https://..." />
          </label>
          <label style={labelStyle()}>
            Prompt
            <textarea value={form.prompt} onChange={event => updateForm('prompt', event.target.value)} style={fieldStyle({ minHeight: '150px' })} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            <label style={labelStyle()}>
              ZIP
              <input value={form.zip} onChange={event => updateForm('zip', event.target.value)} style={fieldStyle()} />
            </label>
            <label style={labelStyle()}>
              Campaign ID
              <input value={form.campaign_id} onChange={event => updateForm('campaign_id', event.target.value)} style={fieldStyle()} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
            <label style={labelStyle()}>
              City
              <input value={form.city} onChange={event => updateForm('city', event.target.value)} style={fieldStyle()} />
            </label>
            <label style={labelStyle()}>
              County
              <input value={form.county} onChange={event => updateForm('county', event.target.value)} style={fieldStyle()} />
            </label>
            <label style={labelStyle()}>
              State
              <input value={form.state} onChange={event => updateForm('state', event.target.value)} style={fieldStyle()} />
            </label>
          </div>
          <label style={labelStyle()}>
            End image URL
            <input value={form.end_image_url} onChange={event => updateForm('end_image_url', event.target.value)} style={fieldStyle()} placeholder="Optional" />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
            <label style={labelStyle()}>
              Duration
              <select value={form.duration_seconds} onChange={event => updateForm('duration_seconds', event.target.value)} style={fieldStyle()}>
                <option value="5">5s</option>
                <option value="8">8s</option>
                <option value="10">10s</option>
                <option value="12">12s</option>
                <option value="15">15s</option>
              </select>
            </label>
            <label style={labelStyle()}>
              Aspect
              <select value={form.aspect_ratio} onChange={event => updateForm('aspect_ratio', event.target.value)} style={fieldStyle()}>
                <option value="auto">Auto</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </label>
            <label style={labelStyle()}>
              Mode
              <select value={form.provider_mode} onChange={event => updateForm('provider_mode', event.target.value)} style={fieldStyle()}>
                <option value="mock">Mock</option>
                <option value="live">Live</option>
              </select>
            </label>
          </div>
          <label style={{ ...labelStyle(), gridTemplateColumns: '18px 1fr', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={form.generate_audio} onChange={event => updateForm('generate_audio', event.target.checked)} />
            Generate audio
          </label>
          {form.provider_mode === 'live' && (
            <label style={{ ...labelStyle(), gridTemplateColumns: '18px 1fr', alignItems: 'center', gap: '8px', color: '#ffd54f' }}>
              <input type="checkbox" checked={form.confirm_live_provider_call} onChange={event => updateForm('confirm_live_provider_call', event.target.checked)} />
              Confirm live provider call
            </label>
          )}
          <button type="submit" disabled={!canSubmit || actionLoading === 'create'} style={buttonStyle({ filled: true, disabled: !canSubmit || actionLoading === 'create' })}>
            {actionLoading === 'create' ? 'Creating...' : 'Create video job'}
          </button>
        </form>
      </aside>

      <main style={{ display: 'grid', gap: '10px' }}>
        <div style={{ color: '#8abf8a', fontSize: '12px' }}>
          {nativeVideoLoading ? 'Refreshing native video jobs...' : `${sortedJobs.length} native video jobs`}
        </div>
        {sortedJobs.map(job => (
          <VideoJobCard
            key={job.video_job_id}
            job={job}
            onSyncJob={onSyncJob}
            onReviewJob={onReviewJob}
            actionLoading={actionLoading}
          />
        ))}
        {!sortedJobs.length && <EmptyState message="No native video jobs yet." />}
      </main>
    </div>
  )
}
