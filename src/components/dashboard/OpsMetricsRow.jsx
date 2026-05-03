const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

function plural(value, word) {
  return `${value} ${word}${value === 1 ? '' : 's'}`
}

function firstOrCount(items, suffix) {
  if (!items?.length) return suffix
  if (items.length === 1) return `${items[0]} ${suffix}`
  return `${items[0]} + ${items.length - 1} more ${suffix}`
}

function MetricCard({ label, value, detail, tone = '#00e676', onClick, active }) {
  const interactive = Boolean(onClick)
  const Component = interactive ? 'button' : 'div'
  return (
    <Component
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      aria-label={interactive ? `Open ${label}` : undefined}
      style={{
        appearance: 'none',
        width: '100%',
        textAlign: 'left',
        border: `1px solid ${active ? '#00e676' : '#1a3a2a'}`,
        borderRadius: '6px',
        padding: '14px',
        background: active ? '#052410' : '#031808',
        minHeight: '96px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: interactive ? 'pointer' : 'default',
        boxShadow: active ? 'inset 0 0 0 1px #00e676' : 'none',
        fontFamily: SANS_FONT,
      }}>
      <div style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4a7a5a', fontFamily: SANS_FONT }}>
        {label}
      </div>
      <div style={{ fontSize: '28px', lineHeight: 1, color: tone, fontWeight: 700, marginTop: '10px' }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: '#8abf8a', marginTop: '8px', lineHeight: 1.35 }}>
        {detail}
      </div>
    </Component>
  )
}

export default function OpsMetricsRow({ stats, activeWorkspace, onSelectWorkspace }) {
  const cards = [
    {
      label: 'Today agenda',
      workspace: 'agenda',
      value: stats.marketingAgendaItems,
      detail: stats.marketingAgendaWaiting
        ? `${stats.marketingAgendaWaiting} waiting for Carlos`
        : `${stats.marketingAgendaReadyItems} ready`,
      tone: stats.marketingAgendaWaiting ? '#ffd54f' : '#00e676',
    },
    {
      label: 'Pending drafts',
      workspace: 'drafts',
      value: stats.pendingDrafts,
      detail: plural(stats.zipGroups, 'ZIP queue'),
    },
    {
      label: 'Needs creative',
      workspace: 'drafts',
      value: stats.missingCreativeZipGroups,
      detail: firstOrCount(stats.missingCreativeZips, 'needs action'),
      tone: stats.missingCreativeZipGroups ? '#ffd54f' : '#00e676',
    },
    {
      label: 'Stale anchors',
      workspace: 'drafts',
      value: stats.staleZipGroups,
      detail: firstOrCount(stats.staleZips, 'blocked'),
      tone: stats.staleZipGroups ? '#ff4444' : '#00e676',
    },
    {
      label: 'Page anchors',
      workspace: 'published',
      value: stats.pageAnchorsCount,
      detail: `${stats.approvedPageAnchorsCount} approved`,
    },
    {
      label: 'Canary jobs',
      workspace: 'canary',
      value: stats.canaryJobsCount,
      detail: stats.canaryNeedsReviewCount
        ? `${stats.canaryNeedsReviewCount} needs review`
        : `${stats.activeCanaryJobsCount} active`,
      tone: stats.canaryNeedsReviewCount ? '#ffd54f' : '#00e676',
    },
    {
      label: 'Distribution plans',
      workspace: 'distribution',
      value: stats.distributionPlansCount,
      detail: stats.distributionPlansAwaitingApproval
        ? `${stats.distributionPlansAwaitingApproval} pending approval`
        : `${stats.distributionPlansReadyForExecution} ready`,
      tone: stats.distributionPlansAwaitingApproval ? '#ffd54f' : '#00e676',
    },
    {
      label: 'Group shares',
      workspace: 'outcomes',
      value: stats.shareOutcomesCount,
      detail: stats.shareOutcomesInFlight
        ? `${stats.shareOutcomesInFlight} awaiting status`
        : `${stats.shareOutcomesSubmitted} submitted`,
      tone: stats.shareOutcomesBlocked ? '#ff4444' : stats.shareOutcomesInFlight ? '#4da3ff' : '#00e676',
    },
    {
      label: 'Native videos',
      workspace: 'nativeVideo',
      value: stats.nativeVideoJobsCount,
      detail: stats.nativeVideoPendingReview
        ? `${stats.nativeVideoPendingReview} ready for review`
        : `${stats.nativeVideoGenerating} generating`,
      tone: stats.nativeVideoPendingReview ? '#ffd54f' : stats.nativeVideoGenerating ? '#4da3ff' : '#00e676',
    },
    {
      label: 'Published',
      workspace: 'published',
      value: stats.publishedPosts,
      detail: `${stats.publishedTodayCount} today`,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' }}>
      {cards.map(card => (
        <MetricCard
          key={card.label}
          {...card}
          active={activeWorkspace === card.workspace}
          onClick={onSelectWorkspace && card.workspace ? () => onSelectWorkspace(card.workspace) : undefined}
        />
      ))}
    </div>
  )
}
