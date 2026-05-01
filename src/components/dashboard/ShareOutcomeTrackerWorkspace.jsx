import { useMemo, useState } from 'react'
import ShareOutcomeCard from './ShareOutcomeCard'

const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

function SummaryTile({ label, value, tone = '#00e676' }) {
  return (
    <div style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '12px' }}>
      <div style={{ color: '#4a7a5a', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: SANS_FONT }}>
        {label}
      </div>
      <div style={{ color: tone, fontSize: '26px', fontWeight: 700, marginTop: '8px', lineHeight: 1 }}>
        {value || 0}
      </div>
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div style={{ border: '1px dashed #1a3a2a', borderRadius: '6px', padding: '28px', textAlign: 'center', color: '#4a7a5a', background: '#031808', fontSize: '12px' }}>
      {message}
    </div>
  )
}

function GroupRollupList({ title, groups, emptyMessage, tone }) {
  return (
    <section style={{ border: '1px solid #1a3a2a', borderRadius: '6px', background: '#031808', padding: '14px', display: 'grid', gap: '10px' }}>
      <h3 style={{ margin: 0, color: '#e0ffe0', fontSize: '15px', letterSpacing: 0 }}>{title}</h3>
      {groups?.length ? groups.map(group => (
        <div key={group.group_target_id || group.group_id || group.group_name} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', borderTop: '1px solid #0d281a', paddingTop: '10px' }}>
          <div>
            <div style={{ color: '#e0ffe0', fontSize: '13px', fontWeight: 700 }}>{group.group_name || 'Unknown group'}</div>
            <div style={{ color: '#8abf8a', fontSize: '11px', marginTop: '4px' }}>
              {group.last_status || 'no status'} | {group.total || 0} attempts
            </div>
          </div>
          <div style={{ color: tone, fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {group.submitted || group.blocked || group.failed_or_needs_review || 0}
          </div>
        </div>
      )) : (
        <div style={{ color: '#4a7a5a', fontSize: '12px' }}>{emptyMessage}</div>
      )}
    </section>
  )
}

export default function ShareOutcomeTrackerWorkspace({
  shareOutcomes,
  summary,
  outcomeLoading,
  hasAdminKey,
  onUpdateOutcome,
  actionLoading,
}) {
  const [statusFilter, setStatusFilter] = useState('all')
  const filteredOutcomes = useMemo(() => (
    statusFilter === 'all'
      ? shareOutcomes
      : shareOutcomes.filter(outcome => outcome.status === statusFilter)
  ), [shareOutcomes, statusFilter])

  const statuses = useMemo(() => (
    [...new Set(shareOutcomes.map(outcome => outcome.status).filter(Boolean))]
      .sort()
  ), [shareOutcomes])

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
        <SummaryTile label="Outcomes" value={summary?.total} />
        <SummaryTile label="Submitted" value={summary?.submitted} />
        <SummaryTile label="Blocked" value={summary?.blocked} tone={summary?.blocked ? '#ff4444' : '#00e676'} />
        <SummaryTile label="In flight" value={summary?.in_flight} tone={summary?.in_flight ? '#4da3ff' : '#00e676'} />
        <SummaryTile label="Groups" value={summary?.groups_attempted} />
      </div>

      {!hasAdminKey && (
        <div style={{ border: '1px solid #ffd54f', borderRadius: '6px', background: '#1f1a05', color: '#ffd54f', padding: '12px', fontSize: '12px' }}>
          Outcome actions require the admin key in the Vercel preview environment.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 360px)', gap: '14px', alignItems: 'start' }}>
        <main style={{ display: 'grid', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ color: '#8abf8a', fontSize: '12px' }}>
              {outcomeLoading ? 'Refreshing outcomes...' : `${filteredOutcomes.length} visible outcomes`}
            </div>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} style={{ background: '#031808', color: '#e0ffe0', border: '1px solid #1a3a2a', borderRadius: '5px', padding: '8px', fontSize: '12px', fontFamily: SANS_FONT }}>
              <option value="all">All statuses</option>
              {statuses.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          {filteredOutcomes.map(outcome => (
            <ShareOutcomeCard
              key={outcome.share_outcome_id}
              outcome={outcome}
              onUpdateOutcome={onUpdateOutcome}
              actionLoading={actionLoading}
            />
          ))}
          {!filteredOutcomes.length && <EmptyState message="No share outcomes match this view." />}
        </main>

        <aside style={{ display: 'grid', gap: '14px' }}>
          <GroupRollupList
            title="Best-performing groups"
            groups={summary?.best_performing_groups || []}
            emptyMessage="No submitted shares yet."
            tone="#00e676"
          />
          <GroupRollupList
            title="Groups to avoid"
            groups={summary?.groups_to_avoid || []}
            emptyMessage="No blocked groups yet."
            tone="#ff4444"
          />
        </aside>
      </div>
    </div>
  )
}
