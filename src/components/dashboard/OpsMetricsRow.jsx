const SANS_FONT = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"

function plural(value, word) {
  return `${value} ${word}${value === 1 ? '' : 's'}`
}

function firstOrCount(items, suffix) {
  if (!items?.length) return suffix
  if (items.length === 1) return `${items[0]} ${suffix}`
  return `${items[0]} + ${items.length - 1} more ${suffix}`
}

function MetricCard({ label, value, detail, tone = '#00e676' }) {
  return (
    <div style={{
      border: '1px solid #1a3a2a',
      borderRadius: '6px',
      padding: '14px',
      background: '#031808',
      minHeight: '96px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
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
    </div>
  )
}

export default function OpsMetricsRow({ stats }) {
  const cards = [
    {
      label: 'Pending drafts',
      value: stats.pendingDrafts,
      detail: plural(stats.zipGroups, 'ZIP queue'),
    },
    {
      label: 'Needs creative',
      value: stats.missingCreativeZipGroups,
      detail: firstOrCount(stats.missingCreativeZips, 'needs action'),
      tone: stats.missingCreativeZipGroups ? '#ffd54f' : '#00e676',
    },
    {
      label: 'Stale anchors',
      value: stats.staleZipGroups,
      detail: firstOrCount(stats.staleZips, 'blocked'),
      tone: stats.staleZipGroups ? '#ff4444' : '#00e676',
    },
    {
      label: 'Page anchors',
      value: stats.pageAnchorsCount,
      detail: `${stats.approvedPageAnchorsCount} approved`,
    },
    {
      label: 'Canary jobs',
      value: stats.canaryJobsCount,
      detail: stats.canaryNeedsReviewCount
        ? `${stats.canaryNeedsReviewCount} needs review`
        : `${stats.activeCanaryJobsCount} active`,
      tone: stats.canaryNeedsReviewCount ? '#ffd54f' : '#00e676',
    },
    {
      label: 'Distribution plans',
      value: stats.distributionPlansCount,
      detail: stats.distributionPlansAwaitingApproval
        ? `${stats.distributionPlansAwaitingApproval} pending approval`
        : `${stats.distributionPlansReadyForExecution} ready`,
      tone: stats.distributionPlansAwaitingApproval ? '#ffd54f' : '#00e676',
    },
    {
      label: 'Group shares',
      value: stats.shareOutcomesCount,
      detail: stats.shareOutcomesInFlight
        ? `${stats.shareOutcomesInFlight} awaiting status`
        : `${stats.shareOutcomesSubmitted} submitted`,
      tone: stats.shareOutcomesBlocked ? '#ff4444' : stats.shareOutcomesInFlight ? '#4da3ff' : '#00e676',
    },
    {
      label: 'Published',
      value: stats.publishedPosts,
      detail: `${stats.publishedTodayCount} today`,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' }}>
      {cards.map(card => (
        <MetricCard key={card.label} {...card} />
      ))}
    </div>
  )
}
